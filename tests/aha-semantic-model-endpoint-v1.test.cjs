const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return body;
    }
  };
}

async function invoke(handler, body) {
  const res = createRes();
  await handler({ body }, res);
  return res;
}

async function run() {
  const moduleUrl = `${pathToFileURL(path.resolve("server/ahaSemanticModelEndpoint.js")).href}?test=${Date.now()}`;
  const { createSemanticModelHandler } = await import(moduleUrl);

  const sourceText = [
    "Karl von Appen arbeidet med politisk økologi ved NRK.",
    "Politisk økologi undersøker makt og miljø i samfunn."
  ].join("\n");

  const validPayload = {
    schema: "aha_semantic_model_output_v1",
    entities: [{
      source_surface: "Karl von Appen",
      canonical_label: "Karl von Appen",
      entity_type: "person",
      evidence_quotes: ["Karl von Appen arbeidet med politisk økologi ved NRK."],
      confidence: "high"
    }],
    concepts: [{
      source_surface: "politisk økologi",
      canonical_label: "Politisk økologi",
      evidence_quotes: ["Politisk økologi undersøker makt og miljø i samfunn."],
      confidence: "high"
    }],
    propositions: [{
      kind: "source_claim",
      text: "Politisk økologi undersøker makt og miljø i samfunn.",
      evidence_quotes: ["Politisk økologi undersøker makt og miljø i samfunn."],
      confidence: "high"
    }],
    relations: [],
    unresolved_inferences: []
  };

  {
    const handler = createSemanticModelHandler({ openai: null, model: "gpt-test", hasOpenAIKey: false });
    const res = await invoke(handler, { text: sourceText });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, "missing_openai_api_key");
    assert.equal(res.body.policy.source_text_returned, false);
    assert.equal(res.body.policy.raw_model_output_returned, false);
    assert.equal(res.body.policy.synthesis_allowed, false);
  }

  {
    let chatFallbackCalls = 0;
    const handler = createSemanticModelHandler({
      hasOpenAIKey: true,
      model: "gpt-test",
      openai: {
        chat: { completions: { create: async () => { chatFallbackCalls += 1; return {}; } } }
      }
    });
    const res = await invoke(handler, { text: sourceText });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, "semantic_model_responses_unavailable");
    assert.equal(chatFallbackCalls, 0, "semantic endpoint skal aldri falle tilbake til chat completions");
  }

  {
    let calls = 0;
    const handler = createSemanticModelHandler({
      hasOpenAIKey: true,
      model: "gpt-test",
      openai: { responses: { create: async () => { calls += 1; return {}; } } }
    });
    const invalidText = await invoke(handler, { text: " " });
    assert.equal(invalidText.statusCode, 400);
    assert.equal(invalidText.body.error, "invalid_text");
    const invalidContext = await invoke(handler, { text: sourceText, context: [] });
    assert.equal(invalidContext.statusCode, 400);
    assert.equal(invalidContext.body.error, "invalid_context");
    const invalidFormat = await invoke(handler, { text: sourceText, format: "wrong_v1" });
    assert.equal(invalidFormat.statusCode, 400);
    assert.equal(invalidFormat.body.error, "invalid_semantic_model_format");
    assert.equal(calls, 0, "invalid request skal aldri nå modellen");
  }

  {
    let calls = 0;
    const handler = createSemanticModelHandler({
      hasOpenAIKey: true,
      model: "gpt-test",
      openai: { responses: { create: async () => { calls += 1; return {}; } } }
    });
    const res = await invoke(handler, {
      text: sourceText,
      context: { assistant_reply: "må ikke inn i semantic source" }
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "invalid_semantic_model_request");
    assert.match(res.body.reason, /semantic_model_context_contains_response_data/);
    assert.equal(calls, 0);
  }

  {
    let capturedRequest = null;
    const handler = createSemanticModelHandler({
      hasOpenAIKey: true,
      model: "gpt-test",
      openai: {
        responses: {
          create: async (request) => {
            capturedRequest = request;
            return {
              id: "resp_semantic_fixture",
              model: "gpt-test-returned",
              output_text: JSON.stringify(validPayload)
            };
          }
        }
      }
    });
    const res = await invoke(handler, {
      text: sourceText,
      format: "aha_semantic_model_output_v1",
      context: { subject_id: "sub_samfunn" }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.schema, "aha_semantic_model_contract_v1");
    assert.equal(res.body.model, "gpt-test-returned");
    assert.equal(res.body.response_id, "resp_semantic_fixture");
    assert.deepEqual(res.body.analysis, validPayload);
    assert.equal(res.body.policy.source_text_returned, false);
    assert.equal(res.body.policy.canonical_write, false);
    assert.equal(res.body.policy.persistent_write, false);
    assert.equal(res.body.policy.meta_write, false);
    assert.equal(res.body.policy.synthesis_allowed, false);
    assert.equal(capturedRequest.text.format.type, "json_schema");
    assert.equal(capturedRequest.text.format.strict, true);
    assert.equal(capturedRequest.text.format.name, "aha_semantic_model_output_v1");
  }

  {
    const invalidPayload = structuredClone(validPayload);
    invalidPayload.entities[0].evidence_quotes = ["Hallusinert sitat som ikke finnes."];
    const handler = createSemanticModelHandler({
      hasOpenAIKey: true,
      model: "gpt-test",
      openai: {
        responses: {
          create: async () => ({
            id: "resp_invalid_fixture",
            model: "gpt-test",
            output_text: JSON.stringify(invalidPayload)
          })
        }
      }
    });
    const res = await invoke(handler, { text: sourceText });
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, "semantic_model_validation_failed");
    assert.ok(res.body.validation_errors.some((item) => item.includes("evidence_not_in_source")));
    assert.equal(res.body.policy.raw_model_output_returned, false);
    const serialized = JSON.stringify(res.body);
    assert.equal(serialized.includes("Hallusinert sitat som ikke finnes."), false);
    assert.equal(serialized.includes(sourceText), false);
  }

  {
    const handler = createSemanticModelHandler({
      hasOpenAIKey: true,
      model: "gpt-test",
      openai: {
        responses: {
          create: async () => {
            const error = new Error("SECRET upstream body that must not leak");
            error.status = 429;
            error.type = "rate_limit_error";
            throw error;
          }
        }
      }
    });
    const res = await invoke(handler, { text: sourceText });
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.error, "openai_rate_limited");
    assert.equal(res.body.status, 429);
    assert.equal(res.body.retryable, true);
    assert.equal(JSON.stringify(res.body).includes("SECRET upstream body"), false);
  }

  {
    const handler = createSemanticModelHandler({
      hasOpenAIKey: true,
      model: "gpt-test",
      openai: {
        responses: {
          create: async () => {
            const error = new Error("SECRET billing details that must not leak");
            error.status = 429;
            error.type = "insufficient_quota";
            throw error;
          }
        }
      }
    });
    const res = await invoke(handler, { text: sourceText });
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.error, "openai_quota_exhausted");
    assert.equal(res.body.status, 429);
    assert.equal(res.body.type, "insufficient_quota");
    assert.equal(res.body.retryable, false);
    assert.equal(JSON.stringify(res.body).includes("SECRET billing details"), false);
  }

  {
    const handler = createSemanticModelHandler({
      hasOpenAIKey: true,
      model: "gpt-test",
      openai: {
        responses: {
          create: async () => ({
            id: "resp_parsed_fixture",
            model: "gpt-test",
            output_parsed: validPayload,
            output_text: "this fallback should not be used"
          })
        }
      }
    });
    const res = await invoke(handler, { text: sourceText });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.analysis, validPayload);
  }

  const serverSource = fs.readFileSync("server.js", "utf8");
  assert.match(serverSource, /import \{ createSemanticModelHandler \} from "\.\/server\/ahaSemanticModelEndpoint\.js";/);
  assert.match(serverSource, /app\.post\("\/api\/aha-agent\/semantic-document", createSemanticModelHandler\(\{/);
  assert.match(serverSource, /hasOpenAIKey: Boolean\(OPENAI_API_KEY\)/);
  assert.doesNotMatch(
    fs.readFileSync("server/ahaSemanticModelEndpoint.js", "utf8"),
    /chat\.completions\.create/,
    "semantic endpoint handler skal ikke inneholde svak chat completions-fallback"
  );

  console.log("aha-semantic-model-endpoint-v1 passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
