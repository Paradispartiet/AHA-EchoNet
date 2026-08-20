const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { window: null, console };
context.window = context;
vm.runInNewContext(fs.readFileSync("js/ahaInsightQualityGateV2.js", "utf8"), context, { filename: "js/ahaInsightQualityGateV2.js" });
const api = context.AHAInsightQualityGateV2;
assert.ok(api);
assert.equal(api.GATE_SCHEMA, "aha_insight_quality_gate_v2");

const source = "Et prosjekt brukte én felles mal for alle rapporter. Det gjorde sammenligning enklere, men tvang også svært ulike saker inn i samme struktur. Da malen fikk noen faste felt og noen valgfrie felt, beholdt rapportene en felles kjerne samtidig som de kunne tilpasses saken.";
const goodCandidate = {
  insight: "Delvis standardisering kan bevare sammenlignbarhet samtidig som ulike saker får nødvendig fleksibilitet.",
  type: "tension",
  abstraction: "Kobler ulempen ved én fast struktur med løsningen der noen felt er faste og andre valgfrie.",
  evidence: [
    { quote: "Det gjorde sammenligning enklere, men tvang også svært ulike saker inn i samme struktur.", role: "supports" },
    { quote: "Da malen fikk noen faste felt og noen valgfrie felt, beholdt rapportene en felles kjerne samtidig som de kunne tilpasses saken.", role: "supports" }
  ],
  why_it_matters: "Prinsippet kan brukes når et system må kombinere en felles kjerne med lokal tilpasning.",
  confidence: "high",
  uncertainty: "",
  causal_status: "not_causal"
};

{
  const decision = api.evaluateCandidate(goodCandidate, source, 0);
  assert.equal(decision.eligible_for_insight_review, true, JSON.stringify(decision));
  assert.ok(decision.metrics.quality_score >= 0.55);
  assert.equal(decision.metrics.evidence_sentence_count, 2);
  assert.ok(decision.metrics.semantic_transform_score > 0.28);
}

{
  const candidate = structuredClone(goodCandidate);
  candidate.insight = "Det gjorde sammenligning enklere, men tvang også svært ulike saker inn i samme struktur.";
  const decision = api.evaluateCandidate(candidate, source, 0);
  assert.equal(decision.eligible_for_insight_review, false);
  assert.ok(decision.blocking_reasons.includes("insight_literal_source"));
  assert.ok(decision.blocking_reasons.includes("source_near_paraphrase"));
}

{
  const candidate = structuredClone(goodCandidate);
  candidate.evidence = [
    { quote: "faste felt", role: "supports" },
    { quote: "valgfrie felt", role: "supports" }
  ];
  const decision = api.evaluateCandidate(candidate, source, 0);
  assert.equal(decision.eligible_for_insight_review, false);
  assert.ok(decision.blocking_reasons.includes("evidence_not_cross_claim"));
}

{
  const candidate = structuredClone(goodCandidate);
  candidate.insight = "Dette viser noe viktig som kan ha betydning";
  const decision = api.evaluateCandidate(candidate, source, 0);
  assert.equal(decision.eligible_for_insight_review, false);
  assert.ok(decision.blocking_reasons.includes("insight_generic"));
}

{
  const delegationSource = "Et team tok alle beslutninger sammen. Lanseringer stoppet når nøkkelpersoner var borte. Etter delegering gikk lokale valg raskere, mens uenighet samlet seg ved grensene mellom ansvarsområdene.";
  const candidate = {
    insight: "Delegering kan flytte koordinasjonsproblemer fra selve beslutningen til grensene mellom ansvarsområder.",
    type: "mechanism",
    abstraction: "Kobler raskere lokale valg med at uenighet senere samler seg ved ansvarsgrenser.",
    evidence: [
      { quote: "Lanseringer stoppet når nøkkelpersoner var borte.", role: "supports" },
      { quote: "Etter delegering gikk lokale valg raskere, mens uenighet samlet seg ved grensene mellom ansvarsområdene.", role: "supports" }
    ],
    why_it_matters: "Det gjør det mulig å lete etter nye koordineringsbehov etter at beslutninger desentraliseres.",
    confidence: "medium",
    uncertainty: "Teksten viser et før/etter-mønster og beviser ikke at delegeringen alene skapte endringen.",
    causal_status: "interpretive"
  };
  const decision = api.evaluateCandidate(candidate, delegationSource, 0);
  assert.equal(decision.eligible_for_insight_review, true, JSON.stringify(decision));
}

{
  const candidate = structuredClone(goodCandidate);
  candidate.insight = "Den felles malen fører til bedre sammenlignbarhet og strukturell tvang i alle tilfeller.";
  candidate.causal_status = "source_explicit";
  const decision = api.evaluateCandidate(candidate, source, 0);
  assert.equal(decision.eligible_for_insight_review, false);
  assert.ok(decision.blocking_reasons.includes("causality_not_source_explicit"));
}

{
  const candidate = structuredClone(goodCandidate);
  candidate.insight = "Den felles malen fører til bedre sammenlignbarhet og mindre fleksibilitet.";
  candidate.causal_status = "interpretive";
  candidate.confidence = "high";
  candidate.uncertainty = "";
  const decision = api.evaluateCandidate(candidate, source, 0);
  assert.equal(decision.eligible_for_insight_review, false);
  assert.ok(decision.blocking_reasons.includes("interpretive_causality_requires_uncertainty"));
  assert.ok(decision.blocking_reasons.includes("interpretive_causality_overconfident"));
}

{
  const shadow = {
    schema: "aha_insight_synthesis_shadow_v2",
    source_event_id: "src_std",
    source_text_hash: "hash_std",
    candidates: [goodCandidate],
    policy: {
      production_gate_authority: false,
      synthesis_allowed: false,
      canonical_write: false,
      chamber_write: false,
      meta_write: false,
      persistent_write: false
    }
  };
  const result = api.evaluateSynthesisShadow({ source_text: source, synthesis_shadow: shadow });
  assert.equal(result.valid, true);
  assert.equal(result.eligible_count, 1);
  assert.equal(result.rejected_count, 0);
  assert.equal(result.gate.authoritative, false);
  assert.equal(result.gate.live_gold_required, true);
  assert.equal(result.gate.production_gate_authority, false);
  assert.equal(result.gate.synthesis_allowed, false);
  assert.equal(result.gate.canonical_write, false);
  assert.equal(result.gate.chamber_write, false);
  assert.equal(result.gate.meta_write, false);
  assert.equal(result.gate.persistent_write, false);
}

console.log("aha-insight-quality-gate-v2 passed");
