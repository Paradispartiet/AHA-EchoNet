const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

async function run() {
  const moduleUrl = `${pathToFileURL(path.resolve("server/ahaInsightSynthesisContractV2.js")).href}?test=${Date.now()}`;
  const api = await import(moduleUrl);

  assert.equal(api.SYNTHESIS_OUTPUT_SCHEMA, "aha_insight_synthesis_output_v2");
  assert.equal(api.SYNTHESIS_CONTRACT, "aha_insight_synthesis_contract_v2");
  assert.ok(api.INSIGHT_TYPES.includes("principle"));
  assert.ok(api.INSIGHT_TYPES.includes("mechanism"));
  assert.ok(api.INSIGHT_TYPES.includes("tension"));

  const source = "Et team tok alle beslutninger sammen. Lanseringer stoppet når nøkkelpersoner var borte. Etter delegering gikk lokale valg raskere, mens uenighet samlet seg ved grensene mellom ansvarsområdene.";
  const semanticContext = {
    entities: [{ label: "team", entity_type: "organization" }],
    concepts: [{ label: "delegering" }, { label: "ansvarsgrenser" }],
    source_claims: [
      { text: "Et team tok alle beslutninger sammen." },
      { text: "Lanseringer stoppet når nøkkelpersoner var borte." },
      { text: "Etter delegering gikk lokale valg raskere, mens uenighet samlet seg ved grensene mellom ansvarsområdene." }
    ],
    relations: [{ relation_type: "associated_with", from_label: "delegering", to_label: "ansvarsgrenser", epistemic_status: "source_explicit" }]
  };

  const request = api.buildSynthesisResponsesRequest({
    model: "gpt-test",
    sourceText: source,
    semanticContext,
    context: { source_event_id: "src_1", language: "no" }
  });
  assert.equal(request.model, "gpt-test");
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.equal(request.text.format.name, "aha_insight_synthesis_output_v2");
  const userPayload = JSON.parse(request.input[1].content);
  assert.equal(userPayload.source_text, source);
  assert.deepEqual(userPayload.semantic_context, semanticContext);
  assert.equal(Object.prototype.hasOwnProperty.call(userPayload.semantic_context, "interpretations"), false);
  assert.match(request.input[0].content, /prinsipp, mekanisme, mønster, spenning, konsekvens/i);
  assert.match(request.input[0].content, /lett parafrase/i);
  assert.match(request.input[0].content, /minst to distinkte/i);
  assert.match(request.input[0].content, /hele årsaksrelasjonen/i);
  assert.match(request.input[0].content, /confidence være medium eller low/i);
  assert.match(request.input[0].content, /ikke fastslår, peker ut eller identifiserer en årsak/i);
  assert.match(request.input[0].content, /pattern, tension eller generalization/i);
  assert.match(request.input[0].content, /causal_status=not_causal/i);
  assert.match(request.input[0].content, /fører \.\.\. til/);
  assert.match(request.input[0].content, /canonical concept-labels/i);
  assert.match(request.input[0].content, /navngi selve forskyvningen/i);
  assert.match(request.input[0].content, /ansvarsgrenser/i);
  assert.match(request.input[0].content, /grensene mellom ansvarsområdene/i);
  assert.match(request.input[0].content, /plasseringen av uenighet/i);
  assert.match(request.input[0].content, /pattern eller tension/i);
  assert.match(request.input[0].content, /avoid_repeating_insights/);

  const expansionContext = {
    authoritative_quality_retry: {
      mode: "projection_diversity_expansion",
      required_new_candidate_count: 2,
      covered_primary_types: ["tension"]
    }
  };
  const expansionRequirements = api.synthesisResponseRequirements({
    context: expansionContext,
    semanticContext
  });
  assert.deepEqual(expansionRequirements, {
    minimum_candidate_count: 2,
    require_semantic_novelty: true,
    avoid_repeating_insights: []
  });
  const expansionRequest = api.buildSynthesisResponsesRequest({
    model: "gpt-test",
    sourceText: source,
    semanticContext,
    context: expansionContext
  });
  assert.equal(expansionRequest.text.format.schema.properties.candidates.minItems, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(request.text.format.schema.properties.candidates, "minItems"), false);

  assert.throws(() => api.buildSynthesisResponsesRequest({
    model: "gpt-test",
    sourceText: source,
    semanticContext: { ...semanticContext, interpretations: [{ text: "old weak interpretation" }] }
  }), /insight_synthesis_semantic_context_invalid/);

  assert.throws(() => api.buildSynthesisResponsesRequest({
    model: "gpt-test",
    sourceText: source,
    semanticContext: {
      ...semanticContext,
      source_claims: [{ text: "Denne påstanden finnes ikke i source." }]
    }
  }), /not_exact_source/);

  assert.throws(() => api.buildSynthesisResponsesRequest({
    model: "gpt-test",
    sourceText: source,
    semanticContext,
    context: { meta_profile: { style: "forbidden" } }
  }), /insight_synthesis_context_forbidden_data/);

  const validPayload = {
    schema: "aha_insight_synthesis_output_v2",
    candidates: [{
      insight: "Delegering kan flytte koordinasjonsproblemer fra selve beslutningen til grensene mellom ansvarsområder.",
      type: "mechanism",
      abstraction: "Kobler raskere lokale valg med at uenighet samler seg ved ansvarsgrensene.",
      evidence: [
        { quote: "Lanseringer stoppet når nøkkelpersoner var borte.", role: "supports" },
        { quote: "Etter delegering gikk lokale valg raskere, mens uenighet samlet seg ved grensene mellom ansvarsområdene.", role: "supports" }
      ],
      why_it_matters: "Det viser at mindre sentral koordinering kan skape et nytt behov for tydelige grensesnitt mellom ansvar.",
      confidence: "medium",
      uncertainty: "Teksten viser et før/etter-mønster, ikke et kontrollert kausalt bevis.",
      causal_status: "interpretive"
    }]
  };

  const validation = api.validateSynthesisPayload(validPayload, source);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.deepEqual(api.requireValidSynthesisPayload(validPayload, source), validPayload);

  {
    const result = api.validateSynthesisPayload(validPayload, source, expansionRequirements);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("candidates_below_requested_minimum:2"));
  }

  {
    const repeated = structuredClone(validPayload);
    repeated.candidates.push({
      ...structuredClone(validPayload.candidates[0]),
      insight: "Delegering flytter koordinasjonsproblemer fra selve beslutningen til grensene mellom ansvarsområder.",
      type: "principle"
    });
    const requirements = api.synthesisResponseRequirements({
      context: {
        authoritative_quality_retry: {
          mode: "projection_diversity_expansion",
          required_new_candidate_count: 2,
          avoid_repeating_insights: [validPayload.candidates[0].insight]
        }
      },
      semanticContext
    });
    const result = api.validateSynthesisPayload(repeated, source, requirements);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("candidate:0:insight_repeats_avoided_insight"));
    assert.ok(result.errors.includes("candidate:1:insight_duplicates_candidate:0"));
  }

  {
    const invalid = structuredClone(validPayload);
    invalid.candidates[0].confidence = "high";
    const result = api.validateSynthesisPayload(invalid, source);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("candidate:0:interpretive_causality_confidence_must_not_be_high"));
  }

  {
    const invalid = structuredClone(validPayload);
    invalid.candidates[0].uncertainty = "";
    const result = api.validateSynthesisPayload(invalid, source);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("candidate:0:interpretive_causality_uncertainty_required"));
  }

  {
    const invalid = structuredClone(validPayload);
    invalid.candidates[0].causal_status = "not_causal";
    invalid.candidates[0].confidence = "high";
    invalid.candidates[0].uncertainty = "";
    invalid.candidates[0].insight = "Delegeringen førte teamet til raskere lokale valg samtidig som uenighet samlet seg ved grensene.";
    const result = api.validateSynthesisPayload(invalid, source);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("candidate:0:not_causal_contains_causal_language"));
  }

  {
    const invalid = structuredClone(validPayload);
    invalid.candidates[0].causal_status = "source_explicit";
    invalid.candidates[0].confidence = "high";
    invalid.candidates[0].uncertainty = "";
    const result = api.validateSynthesisPayload(invalid, source);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("candidate:0:source_explicit_causality_not_in_evidence"));
  }

  {
    const mixedUseSource = "En gate fikk over tid flere boliger, små butikker, serveringssteder og arbeidsplasser. Fotgjengertrafikken ble jevnere fordelt gjennom dagen, også etter ordinær arbeidstid. Materialet peker ikke ut ett enkelt tiltak som årsak, men viser at flere bruksformer opptrer samtidig med et bredere tidsmønster i aktiviteten.";
    const validNonCausal = {
      schema: "aha_insight_synthesis_output_v2",
      candidates: [{
        insight: "Flere bruksformer opptrer samtidig med et bredere tidsmønster i fotgjengertrafikken, uten at materialet fastslår én årsak.",
        type: "pattern",
        abstraction: "Kobler bruksblanding, tidsmønster og den eksplisitte årsaksbegrensningen.",
        evidence: [
          { quote: "Fotgjengertrafikken ble jevnere fordelt gjennom dagen, også etter ordinær arbeidstid.", role: "supports" },
          { quote: "Materialet peker ikke ut ett enkelt tiltak som årsak, men viser at flere bruksformer opptrer samtidig med et bredere tidsmønster i aktiviteten.", role: "limits" }
        ],
        why_it_matters: "Det bevarer et nyttig aktivitetsmønster uten å gjøre samvariasjon om til sikker årsak.",
        confidence: "high",
        uncertainty: "",
        causal_status: "not_causal"
      }]
    };
    const valid = api.validateSynthesisPayload(validNonCausal, mixedUseSource);
    assert.equal(valid.ok, true, JSON.stringify(valid.errors));

    const invalid = structuredClone(validNonCausal);
    invalid.candidates[0].insight = "Når flere bruksformer opptrer i samme gate, skapes et bredere tidsmønster uten at materialet fastslår én årsak.";
    const result = api.validateSynthesisPayload(invalid, mixedUseSource);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("candidate:0:not_causal_contains_causal_language"));
    assert.ok(result.errors.includes("candidate:0:causal_claim_contradicts_source_limitation"));
  }

  {
    const invalid = structuredClone(validPayload);
    invalid.candidates[0].evidence[1].quote = "Hallusinert evidens.";
    const result = api.validateSynthesisPayload(invalid, source);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((item) => item.includes("quote_not_in_source")));
  }

  {
    const invalid = structuredClone(validPayload);
    invalid.candidates[0].evidence[1].quote = invalid.candidates[0].evidence[0].quote;
    const result = api.validateSynthesisPayload(invalid, source);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((item) => item.includes("duplicate_quote")));
  }

  {
    const invalid = structuredClone(validPayload);
    invalid.candidates[0].insight = "Lanseringer stoppet når nøkkelpersoner var borte.";
    const result = api.validateSynthesisPayload(invalid, source);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((item) => item.includes("insight_is_literal_source")));
  }

  const envelope = api.buildSynthesisResponseEnvelope({ synthesis: validPayload, model: "gpt-test", responseId: "resp_1" });
  assert.equal(envelope.ok, true);
  assert.equal(envelope.schema, "aha_insight_synthesis_contract_v2");
  assert.equal(envelope.policy.shadow_synthesis_generated, true);
  assert.equal(envelope.policy.production_gate_authority, false);
  assert.equal(envelope.policy.synthesis_allowed, false);
  assert.equal(envelope.policy.canonical_write, false);
  assert.equal(envelope.policy.chamber_write, false);
  assert.equal(envelope.policy.meta_write, false);
  assert.equal(envelope.policy.persistent_write, false);

  console.log("aha-insight-synthesis-contract-v2 passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
