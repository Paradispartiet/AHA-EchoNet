const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { window: null, console };
context.window = context;
vm.runInNewContext(fs.readFileSync("js/ahaInsightRelationClassifierV2.js", "utf8"), context, { filename: "js/ahaInsightRelationClassifierV2.js" });
const api = context.AHAInsightRelationClassifierV2;
assert.ok(api);
assert.equal(api.RELATION_SCHEMA, "aha_insight_relation_classification_v2");
assert.deepEqual(Array.from(api.RELATIONS), ["equivalent", "resonant", "distinct", "uncertain"]);

function makeInsight({ id, insight, concepts, causal_status = "not_causal", quality = 0.84, reviewed = true, source = id }) {
  return {
    id,
    source_event_id: `source_${source}`,
    source_text_hash: "a".repeat(64),
    semantic_concepts: concepts,
    candidate: {
      insight,
      type: "principle",
      causal_status,
      evidence: [
        { quote: `Første dokumenterte belegg for ${source}.`, role: "supports" },
        { quote: `Andre dokumenterte belegg for ${source}.`, role: "supports" }
      ]
    },
    gate_decision: reviewed ? {
      eligible_for_insight_review: true,
      blocking_reasons: [],
      metrics: { quality_score: quality }
    } : {
      eligible_for_insight_review: false,
      blocking_reasons: ["quality_score_below_threshold"],
      metrics: { quality_score: quality }
    }
  };
}

const equivalentA = makeInsight({
  id: "ins_a",
  insight: "Delvis standardisering bevarer sammenlignbarhet samtidig som valgfrie felt gir nødvendig fleksibilitet.",
  concepts: ["standardisering", "sammenlignbarhet", "fleksibilitet"],
  source: "a"
});
const equivalentB = makeInsight({
  id: "ins_b",
  insight: "En felles standardisering bevarer sammenlignbarhet når valgfrie felt gir nødvendig fleksibilitet.",
  concepts: ["fleksibilitet", "standardisering", "sammenlignbarhet"],
  source: "b"
});
const resonanceC = makeInsight({
  id: "ins_c",
  insight: "Fleksibilitet gjennom valgfrie felt kan gjøre lokal kvalitetssikring mer krevende.",
  concepts: ["standardisering", "fleksibilitet", "kvalitetssikring"],
  source: "c"
});

{
  const relation = api.classifyPair(equivalentA, equivalentB);
  assert.equal(relation.relation, "equivalent", JSON.stringify(relation));
  assert.equal(relation.dedupe_eligible, true, JSON.stringify(relation));
  assert.ok(relation.features.semantic_score >= api.EQUIVALENCE_THRESHOLD);
  assert.equal(relation.features.causal_resolved, true);
  assert.equal(relation.policy.production_gate_authority, false);
  assert.equal(relation.policy.dedupe_write, false);
  assert.equal(relation.policy.chamber_write, false);
  assert.equal(relation.policy.meta_write, false);
  assert.equal(relation.policy.persistent_write, false);
}

{
  const relation = api.classifyPair(equivalentA, resonanceC);
  assert.equal(relation.relation, "resonant", JSON.stringify(relation));
  assert.equal(relation.dedupe_eligible, false);
  assert.ok(relation.reasons.includes("resonance_preserves_distinct_insights"));
  assert.ok(relation.dedupe_blocking_reasons.includes("dedupe_requires_equivalence"));
}

{
  const causalA = structuredClone(equivalentA);
  causalA.candidate.causal_status = "causal";
  const relation = api.classifyPair(causalA, equivalentB);
  assert.equal(relation.relation, "resonant", JSON.stringify(relation));
  assert.equal(relation.features.causal_conflict, true);
  assert.equal(relation.dedupe_eligible, false);
  assert.ok(relation.reasons.includes("equivalence_blocked_causal_conflict"));
}

{
  const negated = structuredClone(equivalentB);
  negated.id = "ins_negated";
  negated.candidate.insight = "Delvis standardisering bevarer ikke sammenlignbarhet samtidig som valgfrie felt gir nødvendig fleksibilitet.";
  const relation = api.classifyPair(equivalentA, negated);
  assert.equal(relation.relation, "resonant", JSON.stringify(relation));
  assert.equal(relation.features.polarity_conflict, true);
  assert.equal(relation.dedupe_eligible, false);
  assert.ok(relation.reasons.includes("equivalence_blocked_polarity_conflict"));
}

{
  const unreviewed = structuredClone(equivalentB);
  unreviewed.id = "ins_unreviewed";
  unreviewed.gate_decision.eligible_for_insight_review = false;
  unreviewed.gate_decision.metrics.quality_score = 0.91;
  const relation = api.classifyPair(equivalentA, unreviewed);
  assert.equal(relation.relation, "equivalent", JSON.stringify(relation));
  assert.equal(relation.dedupe_eligible, false);
  assert.ok(relation.reasons.includes("equivalence_not_dedupe_ready"));
  assert.ok(relation.dedupe_blocking_reasons.some((reason) => reason.endsWith("quality_not_ready")));
}

{
  const noProvenance = structuredClone(equivalentB);
  noProvenance.id = "ins_no_provenance";
  noProvenance.source_event_id = null;
  noProvenance.source_text_hash = null;
  noProvenance.candidate.evidence = [];
  const relation = api.classifyPair(equivalentA, noProvenance);
  assert.equal(relation.relation, "equivalent", JSON.stringify(relation));
  assert.equal(relation.dedupe_eligible, false);
  assert.ok(relation.dedupe_blocking_reasons.some((reason) => reason.endsWith("provenance_not_ready")));
}

{
  const unresolved = structuredClone(equivalentB);
  unresolved.id = "ins_causal_unknown";
  delete unresolved.candidate.causal_status;
  const relation = api.classifyPair(equivalentA, unresolved);
  assert.equal(relation.relation, "equivalent", JSON.stringify(relation));
  assert.equal(relation.dedupe_eligible, false);
  assert.ok(relation.dedupe_blocking_reasons.includes("causal_status_unresolved"));
}

{
  const reverse = api.classifyPair(equivalentB, equivalentA);
  const forward = api.classifyPair(equivalentA, equivalentB);
  assert.deepEqual(reverse, forward, "pair classification must be symmetric and deterministic");
}

{
  const beforeA = JSON.stringify(equivalentA);
  const beforeB = JSON.stringify(equivalentB);
  api.classifyPair(equivalentA, equivalentB);
  assert.equal(JSON.stringify(equivalentA), beforeA, "left input must not mutate");
  assert.equal(JSON.stringify(equivalentB), beforeB, "right input must not mutate");
}

{
  const result = api.classifySet([equivalentA, equivalentB, resonanceC]);
  assert.equal(result.item_count, 3);
  assert.equal(result.pair_count, 3);
  assert.equal(result.dedupe_eligible_pair_count, 1, JSON.stringify(result));
  assert.equal(result.equivalence_groups.length, 1, JSON.stringify(result));
  assert.deepEqual(Array.from(result.equivalence_groups[0].member_ids), ["ins_a", "ins_b"]);
  assert.ok(result.resonance_edges.some((edge) => edge.left_id === "ins_a" && edge.right_id === "ins_c"));
  assert.ok(result.resonance_edges.every((edge) => edge.dedupe_eligible === false));
  assert.ok(result.equivalence_groups.every((group) => !group.member_ids.includes("ins_c")), "resonance must never enter an equivalence group");
  assert.equal(result.policy.projection_write, false);
}

{
  const incomplete = makeInsight({
    id: "ins_incomplete",
    insight: "",
    concepts: ["standardisering"],
    source: "incomplete"
  });
  const relation = api.classifyPair(equivalentA, incomplete);
  assert.equal(relation.relation, "uncertain");
  assert.equal(relation.dedupe_eligible, false);
}

console.log("aha-insight-relation-classifier-v2.test.cjs: OK");
