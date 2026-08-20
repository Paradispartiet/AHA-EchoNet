const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("js/ahaSemanticInsightQualityGate.js", "utf8");
const context = { window: null, console };
context.window = context;
vm.runInNewContext(source, context, { filename: "js/ahaSemanticInsightQualityGate.js" });

const api = context.AHASemanticInsightQualityGate;
assert.ok(api, "semantic quality gate skal eksponeres");
assert.equal(api.EVALUATION_SCHEMA, "aha_semantic_evaluation_v1");
assert.equal(api.GATE_SCHEMA, "aha_synthesized_insight_quality_gate_v1");

function span(sourceText, anchor, quote) {
  const start = sourceText.indexOf(quote, anchor.start_offset);
  assert.ok(start >= anchor.start_offset && start + quote.length <= anchor.end_offset, `fixture quote mangler: ${quote}`);
  return {
    anchor_id: anchor.id,
    start_offset: start,
    end_offset: start + quote.length,
    text: quote
  };
}

function evidence(sourceText, anchor, quote) {
  return [{ quote, spans: [span(sourceText, anchor, quote)] }];
}

function buildFixture() {
  const sourceText = [
    "Karl von Appen arbeidet med politisk økologi ved NRK.",
    "",
    "Politisk økologi undersøker hvordan makt og miljø henger sammen i samfunn.",
    "Institusjonelle rammer påvirker hvilke miljøvalg som blir mulige."
  ].join("\n");
  const split = sourceText.indexOf("\n\n");
  const anchor1 = {
    id: "ev_gate_001",
    index: 0,
    start_offset: 0,
    end_offset: split,
    text: sourceText.slice(0, split)
  };
  const anchor2 = {
    id: "ev_gate_002",
    index: 1,
    start_offset: split + 2,
    end_offset: sourceText.length,
    text: sourceText.slice(split + 2)
  };
  const hash = "a".repeat(64);
  const deterministic = {
    id: "sem_gate_fixture",
    source_event_id: "src_gate_fixture",
    source_text_hash: hash,
    evidence_anchors: [anchor1, anchor2],
    entities: [
      { id: "ent_1", label: "Karl von Appen" },
      { id: "ent_2", label: "NRK" }
    ],
    concepts: [{ id: "con_1", label: "politisk økologi" }],
    claims: [
      { id: "clm_1", text: anchor1.text },
      { id: "clm_2", text: "Politisk økologi undersøker hvordan makt og miljø henger sammen i samfunn." }
    ],
    relations: []
  };

  const sourceClaim = "Politisk økologi undersøker hvordan makt og miljø henger sammen i samfunn.";
  const modelShadow = {
    schema: "aha_semantic_model_shadow_v1",
    version: 1,
    mode: "shadow",
    source_event_id: deterministic.source_event_id,
    source_text_hash: deterministic.source_text_hash,
    deterministic_document_id: deterministic.id,
    model: "gpt-semantic-fixture",
    response_id: "resp_gate_fixture",
    entities: [
      {
        source_surface: "Karl von Appen",
        canonical_label: "Karl von Appen",
        entity_type: "person",
        confidence: "high",
        source_surface_spans: [span(sourceText, anchor1, "Karl von Appen")],
        evidence: evidence(sourceText, anchor1, anchor1.text)
      },
      {
        source_surface: "NRK",
        canonical_label: "NRK",
        entity_type: "organization",
        confidence: "high",
        source_surface_spans: [span(sourceText, anchor1, "NRK")],
        evidence: evidence(sourceText, anchor1, "NRK")
      }
    ],
    concepts: [{
      source_surface: "politisk økologi",
      canonical_label: "Politisk økologi",
      confidence: "high",
      source_surface_spans: [
        span(sourceText, anchor1, "politisk økologi")
      ],
      evidence: evidence(sourceText, anchor2, sourceClaim)
    }],
    propositions: [
      {
        kind: "source_claim",
        text: sourceClaim,
        confidence: "high",
        source_claim_spans: [span(sourceText, anchor2, sourceClaim)],
        evidence: evidence(sourceText, anchor2, sourceClaim)
      },
      {
        kind: "interpretation",
        text: "Teksten framstiller miljøvalg som formet av institusjonelle betingelser.",
        confidence: "high",
        evidence: evidence(sourceText, anchor2, "Institusjonelle rammer påvirker hvilke miljøvalg som blir mulige.")
      },
      {
        kind: "interpretation",
        text: "Maktperspektivet kan knyttes til institusjonelle rammer.",
        confidence: "medium",
        evidence: evidence(sourceText, anchor2, "makt og miljø")
      },
      {
        kind: "inference",
        text: "NRK kan ha påvirket den faglige retningen.",
        confidence: "high",
        evidence: evidence(sourceText, anchor1, "NRK")
      },
      {
        kind: "interpretation",
        text: "Institusjonelle rammer påvirker hvilke miljøvalg som blir mulige.",
        confidence: "high",
        evidence: evidence(sourceText, anchor2, "Institusjonelle rammer påvirker hvilke miljøvalg som blir mulige.")
      }
    ],
    relations: [
      {
        relation_type: "associated_with",
        from_label: "Karl von Appen",
        to_label: "politisk økologi",
        epistemic_status: "source_explicit",
        confidence: "high",
        evidence: evidence(sourceText, anchor1, anchor1.text)
      },
      {
        relation_type: "influences",
        from_label: "institusjonelle rammer",
        to_label: "miljøvalg",
        epistemic_status: "interpretation",
        confidence: "high",
        evidence: evidence(sourceText, anchor2, "Institusjonelle rammer påvirker hvilke miljøvalg som blir mulige.")
      },
      {
        relation_type: "influences",
        from_label: "NRK",
        to_label: "faglig retning",
        epistemic_status: "inference",
        confidence: "low",
        evidence: evidence(sourceText, anchor1, "NRK")
      }
    ],
    unresolved_inferences: [{
      text: "Det er uavklart hvilken rolle NRK hadde i arbeidet.",
      confidence: "low",
      evidence: evidence(sourceText, anchor1, "NRK")
    }],
    comparison: {
      deterministic: {
        entity_count: 2,
        concept_count: 1,
        claim_count: 2,
        relation_count: 0
      },
      model: {
        entity_count: 2,
        concept_count: 1,
        proposition_count: 5,
        relation_count: 3,
        unresolved_inference_count: 1
      },
      entity_overlap_count: 2,
      concept_overlap_count: 1,
      source_claim_overlap_count: 1,
      interpretation_count: 3,
      inference_count: 1,
      semantic_relation_count: 3,
      unresolved_inference_count: 1
    },
    policy: {
      canonical_write: false,
      persistent_write: false,
      meta_write: false,
      visible_output_changed: false,
      synthesis_allowed: false,
      source_text_stored: false
    }
  };

  return { sourceText, deterministic, modelShadow };
}

{
  const fixture = buildFixture();
  const result = api.evaluateSemanticShadow({
    source_text: fixture.sourceText,
    deterministic_document: fixture.deterministic,
    model_shadow: fixture.modelShadow
  });

  assert.equal(result.schema, "aha_semantic_evaluation_v1");
  assert.equal(result.mode, "shadow");
  assert.equal(result.valid, true, result.input_errors.join(", "));
  assert.equal(result.metrics.evidence_binding_invalid, 0);
  assert.equal(result.metrics.evidence_fidelity_rate, 1);
  assert.equal(result.metrics.evidence_anchor_coverage_rate, 1);
  assert.equal(result.metrics.entity_agreement_rate, 1);
  assert.equal(result.metrics.concept_agreement_rate, 1);
  assert.equal(result.metrics.source_claim_agreement_rate, 1);
  assert.equal(result.metrics.interpretation_count, 3);
  assert.equal(result.metrics.inference_count, 1);
  assert.equal(result.metrics.unresolved_inference_count, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.metrics.relation_epistemic_counts)), {
    source_explicit: 1,
    interpretation: 1,
    inference: 1,
    unknown: 0
  });

  assert.equal(result.proposition_decisions.length, 5);
  assert.equal(result.proposition_decisions[0].eligible_for_synthesis_review, false);
  assert.ok(result.proposition_decisions[0].blocking_reasons.includes("source_claim_is_evidence_not_synthesis"));

  assert.equal(result.proposition_decisions[1].eligible_for_synthesis_review, true, "high-confidence interpretation med exact evidence kan gå til review");
  assert.deepEqual(Array.from(result.proposition_decisions[1].blocking_reasons), []);

  assert.equal(result.proposition_decisions[2].eligible_for_synthesis_review, false);
  assert.ok(result.proposition_decisions[2].blocking_reasons.includes("confidence_below_high"));

  assert.equal(result.proposition_decisions[3].eligible_for_synthesis_review, false);
  assert.ok(result.proposition_decisions[3].blocking_reasons.includes("inference_not_allowed_v1"));

  assert.equal(result.proposition_decisions[4].eligible_for_synthesis_review, false);
  assert.ok(result.proposition_decisions[4].blocking_reasons.includes("interpretation_is_literal_source"));

  assert.equal(result.metrics.synthesis_review_eligible_count, 1);
  assert.equal(result.metrics.synthesis_review_blocked_count, 4);
  assert.equal(result.gate.schema, "aha_synthesized_insight_quality_gate_v1");
  assert.equal(result.gate.authoritative, false);
  assert.equal(result.gate.gold_evaluation_required, true);
  assert.equal(result.gate.synthesis_review_available, true);
  assert.equal(result.gate.synthesis_allowed, false, "review eligibility er aldri synthesis permission i V1");
  assert.equal(result.gate.canonical_write, false);
  assert.equal(result.gate.meta_write, false);
  assert.equal(result.gate.persistent_write, false);
  assert.ok(result.gate.blocking_reasons.includes("shadow_gate_not_authoritative"));
  assert.ok(result.gate.blocking_reasons.includes("gold_evaluation_required"));

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(fixture.sourceText), false, "evalueringen skal ikke returnere full source text");
  assert.equal(serialized.includes("Teksten framstiller miljøvalg"), false, "evalueringen skal ikke returnere proposition text");
}

{
  const fixture = buildFixture();
  fixture.modelShadow.propositions[1].evidence[0].spans[0].text = "manipulert evidence";
  const result = api.evaluateSemanticShadow({
    source_text: fixture.sourceText,
    deterministic_document: fixture.deterministic,
    model_shadow: fixture.modelShadow
  });
  assert.equal(result.valid, false);
  assert.ok(result.metrics.evidence_fidelity_rate < 1);
  assert.ok(result.metrics.evidence_binding_invalid > 0);
  assert.equal(result.proposition_decisions[1].eligible_for_synthesis_review, false);
  assert.ok(result.proposition_decisions[1].blocking_reasons.includes("evidence_not_exact"));
  assert.equal(result.gate.synthesis_review_available, false);
  assert.equal(result.gate.synthesis_allowed, false);
  assert.ok(result.gate.blocking_reasons.includes("evidence_fidelity_below_one"));
}

{
  const fixture = buildFixture();
  fixture.modelShadow.entities[0].source_surface_spans[0].anchor_id = "ev_unknown";
  const result = api.evaluateSemanticShadow({
    source_text: fixture.sourceText,
    deterministic_document: fixture.deterministic,
    model_shadow: fixture.modelShadow
  });
  assert.equal(result.valid, false, "ukjent anchor skal gjøre evalueringen ugyldig");
  assert.ok(result.metrics.evidence_binding_invalid > 0);
  assert.equal(result.gate.synthesis_allowed, false);
}

{
  const fixture = buildFixture();
  fixture.modelShadow.policy.synthesis_allowed = true;
  const result = api.evaluateSemanticShadow({
    source_text: fixture.sourceText,
    deterministic_document: fixture.deterministic,
    model_shadow: fixture.modelShadow
  });
  assert.equal(result.valid, false);
  assert.ok(result.input_errors.includes("model_shadow_synthesis_not_false"));
  assert.ok(result.gate.blocking_reasons.includes("evaluation_input_invalid"));
  assert.equal(result.gate.synthesis_allowed, false);
}

{
  const fixture = buildFixture();
  fixture.modelShadow.source_event_id = "src_wrong";
  fixture.modelShadow.source_text_hash = "b".repeat(64);
  const result = api.evaluateSemanticShadow({
    source_text: fixture.sourceText,
    deterministic_document: fixture.deterministic,
    model_shadow: fixture.modelShadow
  });
  assert.equal(result.valid, false);
  assert.ok(result.input_errors.includes("source_event_id_mismatch"));
  assert.ok(result.input_errors.includes("source_text_hash_mismatch"));
  assert.equal(result.gate.synthesis_review_available, false);
}

{
  const fixture = buildFixture();
  fixture.modelShadow.entities = [];
  fixture.modelShadow.concepts = [];
  fixture.modelShadow.propositions = [];
  fixture.modelShadow.relations = [];
  fixture.modelShadow.unresolved_inferences = [];
  fixture.modelShadow.comparison = {
    deterministic: { entity_count: 2, concept_count: 1, claim_count: 2, relation_count: 0 },
    model: { entity_count: 0, concept_count: 0, proposition_count: 0, relation_count: 0, unresolved_inference_count: 0 },
    entity_overlap_count: 0,
    concept_overlap_count: 0,
    source_claim_overlap_count: 0
  };
  const result = api.evaluateSemanticShadow({
    source_text: fixture.sourceText,
    deterministic_document: fixture.deterministic,
    model_shadow: fixture.modelShadow
  });
  assert.equal(result.valid, true);
  assert.equal(result.metrics.evidence_fidelity_rate, null, "tom modelloutput skal ikke late som evidence precision = 0 eller 1");
  assert.equal(result.metrics.entity_agreement_rate, null);
  assert.equal(result.metrics.concept_agreement_rate, null);
  assert.equal(result.metrics.source_claim_agreement_rate, null);
  assert.equal(result.gate.synthesis_review_available, false);
  assert.equal(result.gate.synthesis_allowed, false);
}

console.log("aha-semantic-insight-quality-gate-v1 passed");
