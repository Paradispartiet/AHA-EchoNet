const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

async function run() {
  const moduleUrl = `${pathToFileURL(path.resolve("server/ahaSemanticModelContract.js")).href}?test=${Date.now()}`;
  const api = await import(moduleUrl);

  const sourceText = [
    "Karl von Appen arbeidet med politisk økologi ved NRK.",
    "Politisk økologi undersøker makt og miljø i samfunn.",
    "Teksten antyder at institusjonelle rammer kan påvirke hvilke miljøvalg som blir mulige."
  ].join("\n");

  assert.equal(api.SEMANTIC_MODEL_SCHEMA, "aha_semantic_model_output_v1");
  assert.equal(api.SEMANTIC_MODEL_CONTRACT, "aha_semantic_model_contract_v1");
  assert.equal(api.SEMANTIC_MODEL_MAX_SOURCE_CHARS, 8000);

  const request = api.buildSemanticModelResponsesRequest({
    model: "gpt-test-semantic",
    sourceText,
    context: {
      subject_id: "sub_samfunn",
      language: "no"
    }
  });
  assert.equal(request.model, "gpt-test-semantic");
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.name, "aha_semantic_model_output_v1");
  assert.equal(request.text.format.strict, true);
  assert.equal(request.text.format.schema.additionalProperties, false);
  assert.deepEqual(
    [...request.text.format.schema.required].sort(),
    ["schema", "entities", "concepts", "propositions", "relations", "unresolved_inferences"].sort()
  );
  assert.equal(Object.prototype.hasOwnProperty.call(request.text.format.schema.properties, "candidate_insights"), false);
  assert.match(request.input[0].content, /SOURCE_TEXT er eneste evidensautoritet/);
  assert.match(request.input[0].content, /Ikke produser candidate_insights/);
  const requestPayload = JSON.parse(request.input[1].content);
  assert.equal(requestPayload.source_text, sourceText);
  assert.equal(requestPayload.contract, "aha_semantic_model_contract_v1");
  assert.equal(Object.prototype.hasOwnProperty.call(requestPayload, "assistant_reply"), false);

  const validPayload = {
    schema: "aha_semantic_model_output_v1",
    entities: [
      {
        source_surface: "Karl von Appen",
        canonical_label: "Karl von Appen",
        entity_type: "person",
        evidence_quotes: ["Karl von Appen arbeidet med politisk økologi ved NRK."],
        confidence: "high"
      },
      {
        source_surface: "NRK",
        canonical_label: "NRK",
        entity_type: "organization",
        evidence_quotes: ["politisk økologi ved NRK"],
        confidence: "high"
      }
    ],
    concepts: [
      {
        source_surface: "politisk økologi",
        canonical_label: "Politisk økologi",
        evidence_quotes: ["Politisk økologi undersøker makt og miljø i samfunn."],
        confidence: "high"
      }
    ],
    propositions: [
      {
        kind: "source_claim",
        text: "Politisk økologi undersøker makt og miljø i samfunn.",
        evidence_quotes: ["Politisk økologi undersøker makt og miljø i samfunn."],
        confidence: "high"
      },
      {
        kind: "interpretation",
        text: "Teksten kan leses som at institusjonelle rammer begrenser og muliggjør miljøvalg.",
        evidence_quotes: ["institusjonelle rammer kan påvirke hvilke miljøvalg som blir mulige"],
        confidence: "medium"
      }
    ],
    relations: [
      {
        relation_type: "influences",
        from_label: "institusjonelle rammer",
        to_label: "miljøvalg",
        epistemic_status: "interpretation",
        evidence_quotes: ["institusjonelle rammer kan påvirke hvilke miljøvalg som blir mulige"],
        confidence: "medium"
      }
    ],
    unresolved_inferences: [
      {
        text: "Det er uavklart hvilke konkrete institusjoner som setter rammene.",
        evidence_quotes: ["institusjonelle rammer"],
        confidence: "low"
      }
    ]
  };

  const valid = api.validateSemanticModelPayload(validPayload, sourceText);
  assert.equal(valid.ok, true, valid.errors.join(", "));
  assert.deepEqual(
    api.parseSemanticModelPayload(JSON.stringify(validPayload)),
    validPayload,
    "JSON-string og objekt skal gi samme model payload"
  );
  assert.deepEqual(api.requireValidSemanticModelPayload(validPayload, sourceText), validPayload);

  {
    const invalid = structuredClone(validPayload);
    invalid.entities[0].evidence_quotes = ["Dette sitatet finnes ikke i kilden."];
    const result = api.validateSemanticModelPayload(invalid, sourceText);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("entity:0_evidence_not_in_source:0"));
  }

  {
    const invalid = structuredClone(validPayload);
    invalid.concepts[0].source_surface = "økologisk modernisering";
    const result = api.validateSemanticModelPayload(invalid, sourceText);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("concept:0:source_surface_not_in_source"));
  }

  {
    const invalid = structuredClone(validPayload);
    invalid.propositions[0].text = "Politisk økologi handler generelt om samfunn og natur.";
    const result = api.validateSemanticModelPayload(invalid, sourceText);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("proposition:0:source_claim_text_not_in_source"));
  }

  {
    const invalid = structuredClone(validPayload);
    invalid.propositions[1].evidence_quotes = [];
    const result = api.validateSemanticModelPayload(invalid, sourceText);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("proposition:1_invalid_evidence_quotes"));
  }

  {
    const invalid = structuredClone(validPayload);
    invalid.relations[0].relation_type = "proves";
    const result = api.validateSemanticModelPayload(invalid, sourceText);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("relation:0:relation_type_invalid_enum"));
  }

  {
    const invalid = structuredClone(validPayload);
    invalid.assistant_reply = "Dette må aldri bli semantic source.";
    const result = api.validateSemanticModelPayload(invalid, sourceText);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("forbidden_response_dependency"));
    assert.ok(result.errors.includes("payload_unexpected_key:assistant_reply"));
  }

  {
    const invalid = structuredClone(validPayload);
    invalid.entities[0].candidate_insights = [{ text: "for tidlig" }];
    const result = api.validateSemanticModelPayload(invalid, sourceText);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("forbidden_response_dependency"));
  }

  assert.throws(
    () => api.buildSemanticModelResponsesRequest({
      model: "gpt-test-semantic",
      sourceText,
      context: { assistant_reply: "ikke tillatt" }
    }),
    /semantic_model_context_contains_response_data/
  );
  assert.throws(
    () => api.buildSemanticModelResponsesRequest({ model: "gpt-test-semantic", sourceText: " " }),
    /semantic_model_source_text_required/
  );
  assert.throws(
    () => api.requireValidSemanticModelPayload({ schema: "wrong" }, sourceText),
    /semantic_model_validation_failed/
  );

  const envelope = api.buildSemanticModelResponseEnvelope({
    analysis: validPayload,
    model: "gpt-test-semantic",
    responseId: "resp_fixture_1"
  });
  assert.equal(envelope.ok, true);
  assert.equal(envelope.schema, "aha_semantic_model_contract_v1");
  assert.equal(envelope.policy.source_text_returned, false);
  assert.equal(envelope.policy.canonical_write, false);
  assert.equal(envelope.policy.persistent_write, false);
  assert.equal(envelope.policy.meta_write, false);
  assert.equal(envelope.policy.synthesis_allowed, false);
  assert.equal(Object.prototype.hasOwnProperty.call(envelope, "source_text"), false);
  assert.equal(JSON.stringify(envelope).includes(sourceText), false, "response envelope skal ikke returnere full source text");

  console.log("aha-semantic-model-contract-v1 passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
