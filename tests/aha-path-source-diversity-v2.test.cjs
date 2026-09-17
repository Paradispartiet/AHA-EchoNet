const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);

for (const file of [
  "js/ahaInsightRelationClassifierV2.js",
  "js/ahaInsightSaturationV2.js",
  "js/ahaSemanticProjectionsV2.js"
]) vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });

const api = context.AHASemanticProjectionsV2;
assert.ok(api);

function makeInsight(id, insight, type, concepts) {
  return {
    id,
    source_event_id: `source_${id}`,
    source_text_hash: "a".repeat(64),
    semantic_concepts: concepts,
    candidate: {
      insight,
      type,
      causal_status: "not_causal",
      confidence: "high",
      evidence: [
        { quote: `Første dokumenterte belegg for ${id}.`, role: "supports" },
        { quote: `Andre dokumenterte belegg for ${id}.`, role: "context" }
      ]
    },
    gate_decision: {
      eligible_for_insight_review: true,
      blocking_reasons: [],
      metrics: { quality_score: 0.86 }
    }
  };
}

function sourceListForPath(result, path) {
  return result.projections.lists.find((list) => list.id === path.meta?.source_list_candidate_id);
}

const rich = api.project({ insights: [
  makeInsight(
    "a_principle",
    "Offentlige beslutninger må kunne etterprøves gjennom søkbare dokumenter og forklarende metadata.",
    "principle",
    ["offentlighet", "etterprøvbarhet"]
  ),
  makeInsight(
    "b_pattern",
    "Åpne datasett styrker kontrollen, men samtidig øker behovet for kontekst for å unngå feiltolkning.",
    "pattern",
    ["offentlighet", "kontekst"]
  ),
  makeInsight(
    "c_mechanism",
    "Integrerte datakilder reduserer manuelle overføringer og gjør kontrollsporet enklere å følge.",
    "mechanism",
    ["offentlighet", "integrasjon"]
  ),
  makeInsight(
    "d_consequence",
    "Bedre dokumentasjon gjør det lettere å oppdage forsinkelser og avvik i beslutningsprosessen.",
    "consequence",
    ["offentlighet", "dokumentasjon"]
  )
] });

assert.equal(rich.validation.valid, true, JSON.stringify(rich.validation));
assert.equal(rich.projections.paths.length, 1);
const richPath = rich.projections.paths[0];
assert.equal(richPath.meta?.semantic_shape, "ordered_inquiry_v2");
assert.equal(richPath.meta?.stage_selection, "semantic_role_ranked_not_round_robin");
assert.deepEqual(
  Array.from(richPath.steps, (step) => step.meta?.stage),
  ["orientation", "claim_evidence", "tension_counterexample", "uncertainty", "synthesis_next_inquiry"]
);

const richList = sourceListForPath(rich, richPath);
assert.ok(richList, "path must retain its source-list provenance");
const availableRefs = new Set(richList.items.map((item) => item.refId));
assert.ok(availableRefs.size >= 3, "fixture must expose at least three source-bound insights");
const selectedRefs = richPath.steps.map((step) => step.refId);
selectedRefs.forEach((refId) => assert.ok(availableRefs.has(refId), `path selected ${refId} outside its source list`));
assert.ok(
  new Set(selectedRefs).size >= Math.min(3, availableRefs.size),
  "when at least three source insights are available, the ordered inquiry should use at least three without abandoning semantic stage ranking"
);

const scarce = api.project({ insights: [
  makeInsight(
    "scarce_a",
    "Et hovedprinsipp setter rammen for vurderingen.",
    "principle",
    ["knapphet", "ramme"]
  ),
  makeInsight(
    "scarce_b",
    "Et motperspektiv viser samtidig hvor rammen kan være for snever.",
    "pattern",
    ["knapphet", "motperspektiv"]
  )
] });
assert.equal(scarce.validation.valid, true, JSON.stringify(scarce.validation));
assert.equal(scarce.projections.paths.length, 1);
const scarcePath = scarce.projections.paths[0];
const scarceList = sourceListForPath(scarce, scarcePath);
assert.ok(scarceList);
const scarceAvailableRefs = new Set(scarceList.items.map((item) => item.refId));
const scarceSelectedRefs = new Set(scarcePath.steps.map((step) => step.refId));
assert.equal(scarceAvailableRefs.size, 2, "scarce fixture must expose exactly two source insights");
assert.ok(scarceSelectedRefs.size <= 2, "source diversity must never invent filler beyond the available evidence");
for (const refId of scarceSelectedRefs) assert.ok(scarceAvailableRefs.has(refId));

console.log("aha-path-source-diversity-v2.test.cjs: OK");
