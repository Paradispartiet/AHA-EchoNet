const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return body; }
  };
}

async function invoke(handler, body) {
  const res = createRes();
  await handler({ body }, res);
  return res;
}

async function run() {
  const moduleUrl = `${pathToFileURL(path.resolve("server/ahaSemanticModelEndpoint.js")).href}?synthesis=${Date.now()}`;
  const { createSemanticModelHandler } = await import(moduleUrl);

  const source = "Et prosjekt brukte én felles mal for alle rapporter. Det gjorde sammenligning enklere, men tvang også svært ulike saker inn i samme struktur. Da malen fikk noen faste felt og noen valgfrie felt, beholdt rapportene en felles kjerne samtidig som de kunne tilpasses saken.";
  const semanticContext = {
    entities: [{ label: "prosjekt", entity_type: "other" }],
    concepts: [{ label: "faste felt" }, { label: "valgfrie felt" }, { label: "felles kjerne" }],
    source_claims: [
      { text: "Et prosjekt brukte én felles mal for alle rapporter." },
      { text: "Det gjorde sammenligning enklere, men tvang også svært ulike saker inn i samme struktur." },
      { text: "Da malen fikk noen faste felt og noen valgfrie felt, beholdt rapportene en felles kjerne samtidig som de kunne tilpasses saken." }
    ],
    relations: []
  };
  const validSynthesis = {
    schema: "aha_insight_synthesis_output_v2",
    candidates: [{
      insight: "Delvis standardisering kan bevare sammenlignbarhet samtidig som ulike saker får nødvendig fleksibilitet.",
      type: "tension",
      abstraction: "Kobler ulempen ved én fast struktur med løsningen der noen felt er faste og andre valgfrie.",
      evidence: [
        { quote: "Det gjorde sammenligning enklere, men tvang også svært ulike saker inn i samme struktur.", role: "supports" },
        { quote: "Da malen fikk noen faste felt og noen valgfrie felt, beholdt rapportene en felles kjerne samtidig som de kunne tilpasses saken.", role: "supports" }
      ],
      why_it_matters: "Det beskriver et designprinsipp for systemer som både trenger en felles kjerne og lokal tilpasning.",
      confidence: "high",
      uncertainty: "",
      causal_status: "not_causal"
    }]
  };
  const secondValidCandidate = {
    insight: "En felles rapportkjerne kan sameksistere med sakstilpasning når strukturen skiller mellom faste og valgfrie felt.",
    type: "principle",
    abstraction: "Kobler behovet for en felles kjerne med skillet mellom obligatoriske og valgfrie deler.",
    evidence: [
      { quote: "Et prosjekt brukte én felles mal for alle rapporter.", role: "supports" },
      { quote: "Da malen fikk noen faste felt og noen valgfrie felt, beholdt rapportene en felles kjerne samtidig som de kunne tilpasses saken.", role: "supports" }
    ],
    why_it_matters: "Det gir et generelt strukturprinsipp for formater som må støtte både sammenligning og variasjon.",
    confidence: "high",
    uncertainty: "",
    causal_status: "not_causal"
  };

  {
    const handler = createSemanticModelHandler({ openai: null, model: "gpt-test", hasOpenAIKey: false });
    const res = await invoke(handler, { format: "aha_insight_synthesis_output_v2", text: source, semantic_context: semanticContext });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, "missing_openai_api_key");
    assert.equal(res.body.policy.canonical_write, false);
    assert.equal(res.body.policy.chamber_write, false);
  }

  {
    let calls = 0;
    const handler = createSemanticModelHandler({
      hasOpenAIKey: true,
      model: "gpt-test",
      openai: { responses: { create: async () => { calls += 1; return {}; } } }
    });
    const res = await invoke(handler, { format: "aha_insight_synthesis_output_v2", text: source, semantic_context: [] });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "invalid_semantic_context");
    assert.equal(calls, 0);
  }

  {
    let capturedRequest = null;
    const handler = createSemanticModelHandler({
      hasOpenAIKey: true,
      model: "gpt-test",
      openai: { responses: { create: async (request) => {
        capturedRequest = request;
        return { id: "resp_synth", model: "gpt-test-returned", output_parsed: validSynthesis };
      } } }
    });
    const res = await invoke(handler, {
      format: "aha_insight_synthesis_output_v2",
      text: source,
      semantic_context: semanticContext,
      context: { source_event_id: "std_1", language: "no" }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.schema, "aha_insight_synthesis_contract_v2");
    assert.deepEqual(res.body.synthesis, validSynthesis);
    assert.equal(res.body.policy.shadow_synthesis_generated, true);
    assert.equal(res.body.policy.production_gate_authority, false);
    assert.equal(res.body.policy.synthesis_allowed, false);
    assert.equal(res.body.policy.canonical_write, false);
    assert.equal(res.body.policy.chamber_write, false);
    assert.equal(res.body.policy.meta_write, false);
    assert.equal(capturedRequest.text.format.name, "aha_insight_synthesis_output_v2");
    const userPayload = JSON.parse(capturedRequest.input[1].content);
    assert.deepEqual(userPayload.semantic_context, semanticContext);
    assert.equal(Object.prototype.hasOwnProperty.call(userPayload.semantic_context, "interpretations"), false);
  }

  {
    const invalid = structuredClone(validSynthesis);
    invalid.candidates[0].evidence[1].quote = "Dette finnes ikke i source.";
    let calls = 0;
    const handler = createSemanticModelHandler({
      hasOpenAIKey: true,
      model: "gpt-test",
      openai: { responses: { create: async () => {
        calls += 1;
        return { id: "resp_bad", model: "gpt-test", output_parsed: invalid };
      } } }
    });
    const res = await invoke(handler, { format: "aha_insight_synthesis_output_v2", text: source, semantic_context: semanticContext });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.validation_status, "blocked");
    assert.equal(res.body.synthesis_attempts, 4);
    assert.deepEqual(res.body.synthesis.candidates, []);
    assert.equal(calls, 4);
    assert.ok(res.body.validation_errors.some((item) => item.includes("quote_not_in_source")));
    assert.equal(JSON.stringify(res.body).includes("Dette finnes ikke i source."), false);
    assert.equal(res.body.policy.synthesis_allowed, false);
  }

  {
    let calls = 0;
    const capturedRequests = [];
    const expandedSynthesis = structuredClone(validSynthesis);
    expandedSynthesis.candidates.push(secondValidCandidate);
    const handler = createSemanticModelHandler({
      hasOpenAIKey: true,
      model: "gpt-test",
      openai: { responses: { create: async (request) => {
        capturedRequests.push(request);
        calls += 1;
        return {
          id: `resp_breadth_${calls}`,
          model: "gpt-test",
          output_parsed: calls === 1 ? validSynthesis : expandedSynthesis
        };
      } } }
    });
    const res = await invoke(handler, {
      format: "aha_insight_synthesis_output_v2",
      text: source,
      semantic_context: semanticContext,
      context: {
        authoritative_quality_retry: {
          mode: "projection_diversity_expansion",
          required_new_candidate_count: 2,
          covered_primary_types: ["tension"]
        }
      }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(calls, 2);
    assert.equal(res.body.synthesis_attempts, 2);
    assert.equal(res.body.validation_status, "passed");
    assert.equal(res.body.synthesis.candidates.length, 2);
    assert.equal(capturedRequests[0].text.format.schema.properties.candidates.minItems, 2);
    assert.match(capturedRequests[1].input[0].content, /MANDATORY BREADTH CORRECTION/);
  }

  console.log("aha-insight-synthesis-endpoint-v2 passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
