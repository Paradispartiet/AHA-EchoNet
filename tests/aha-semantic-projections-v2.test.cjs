const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

let storageCalls = 0;
const context = {
  console,
  localStorage: {
    getItem() { storageCalls += 1; throw new Error("projection layer must not read localStorage"); },
    setItem() { storageCalls += 1; throw new Error("projection layer must not write localStorage"); },
    removeItem() { storageCalls += 1; throw new Error("projection layer must not touch localStorage"); }
  },
  AHARepository: new Proxy({}, { get() { throw new Error("projection layer must not use repository"); } }),
  InsightsEngine: new Proxy({}, { get() { throw new Error("projection layer must not call InsightsEngine"); } }),
  AHALists: new Proxy({}, { get() { throw new Error("projection layer must not call AHALists"); } }),
  AHAPaths: new Proxy({}, { get() { throw new Error("projection layer must not call AHAPaths"); } }),
  MindmapStore: new Proxy({}, { get() { throw new Error("projection layer must not call MindmapStore"); } })
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

function load(path) {
  vm.runInContext(fs.readFileSync(path, "utf8"), context, { filename: path });
}

load("js/ahaInsightRelationClassifierV2.js");
load("js/ahaInsightSaturationV2.js");
load("js/ahaSemanticProjectionsV2.js");

const api = context.AHASemanticProjectionsV2;
assert.ok(api);
assert.equal(api.PROJECTION_SCHEMA, "aha_semantic_projections_v2");
assert.deepEqual(Array.from(api.SURFACES), ["insights", "concepts", "lists", "paths", "mindmap"]);

function makeInsight({ id, insight, concepts, quality = 0.84, reviewed = true, causal_status = "not_causal", source = id }) {
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
    gate_decision: {
      eligible_for_insight_review: reviewed,
      blocking_reasons: reviewed ? [] : ["quality_score_below_threshold"],
      metrics: { quality_score: quality }
    }
  };
}

const equivalentA = makeInsight({
  id: "ins_a",
  insight: "Delvis standardisering bevarer sammenlignbarhet samtidig som valgfrie felt gir nødvendig fleksibilitet.",
  concepts: ["standardisering", "sammenlignbarhet", "fleksibilitet"],
  quality: 0.82,
  source: "a"
});
const equivalentB = makeInsight({
  id: "ins_b",
  insight: "Delvis standardisering bevarer sammenlignbarhet samtidig som valgfrie felt gir nødvendig fleksibilitet.",
  concepts: ["fleksibilitet", "standardisering", "sammenlignbarhet"],
  quality: 0.91,
  source: "b"
});
const resonantC = makeInsight({
  id: "ins_c",
  insight: "Fleksibilitet gjennom valgfrie felt kan gjøre lokal kvalitetssikring mer krevende.",
  concepts: ["standardisering", "fleksibilitet", "kvalitetssikring"],
  quality: 0.86,
  source: "c"
});
const distinctD = makeInsight({
  id: "ins_d",
  insight: "Historiske tidsserier kan avdekke endringer som ikke er synlige i et enkelt øyeblikksbilde.",
  concepts: ["tidsserier", "historie", "endring"],
  quality: 0.79,
  source: "d"
});
const blockedE = makeInsight({
  id: "ins_blocked",
  insight: "Et hemmelig blokkert konsept må aldri projiseres til produktflatene.",
  concepts: ["hemmelig-blokkert-konsept"],
  quality: 0.95,
  reviewed: false,
  source: "blocked"
});

const input = [equivalentA, equivalentB, resonantC, distinctD, blockedE];
const before = JSON.stringify(input);
const result = api.project({ insights: input });

assert.equal(result.status, "ready_with_exclusions", JSON.stringify(result));
assert.equal(result.input_count, 5);
assert.equal(result.trusted_input_count, 4);
assert.equal(result.excluded_input_count, 1);
assert.equal(result.validation.valid, true, JSON.stringify(result.validation));
assert.equal(result.core.insight_units.length, 3, "A/B must collapse to one canonical projection unit");
assert.equal(result.core.equivalence_groups.length, 1);
assert.deepEqual(Array.from(result.core.equivalence_groups[0].member_ids), ["ins_a", "ins_b"]);
assert.equal(result.core.equivalence_groups[0].dedupe_eligible, true);
assert.equal(result.projections.insights.length, 3);

const collapsed = result.projections.insights.find((item) => item.member_ids.includes("ins_a"));
assert.ok(collapsed);
assert.deepEqual(Array.from(collapsed.member_ids), ["ins_a", "ins_b"]);
assert.equal(collapsed.equivalence_collapsed, true);
assert.equal(collapsed.quality.max_score, 0.91);
assert.ok(collapsed.provenance.evidence.length >= 4);
assert.equal(collapsed.causal_status, "not_causal");
assert.ok(collapsed.concept_keys.includes("standardisering"));

assert.ok(result.core.resonance_edges.length >= 1, JSON.stringify(result.core.resonance_edges));
assert.ok(result.core.resonance_edges.every((edge) => edge.dedupe_eligible === false));
const resonance = result.core.resonance_edges.find((edge) => {
  const ids = new Set([edge.from, edge.to]);
  return ids.has(collapsed.id) && [...ids].some((id) => result.projections.insights.find((item) => item.id === id && item.member_ids.includes("ins_c")));
});
assert.ok(resonance, "resonance must preserve the collapsed A/B unit and C as distinct nodes");

const projectionDump = JSON.stringify(result.projections);
assert.doesNotMatch(projectionDump, /hemmelig-blokkert-konsept/);
assert.doesNotMatch(projectionDump, /ins_blocked/);
assert.ok(result.exclusions.some((entry) => entry.id === "ins_blocked"));

const insightIds = new Set(result.projections.insights.map((item) => item.id));
const conceptIds = new Set(result.projections.concepts.map((item) => item.id));
assert.ok(result.projections.concepts.some((concept) => concept.key === "standardisering" && concept.insight_ids.length === 2));
result.projections.concepts.forEach((concept) => concept.insight_ids.forEach((id) => assert.ok(insightIds.has(id), `concept ${concept.id} has unresolved insight ${id}`)));

assert.ok(result.projections.lists.length >= 2, "shared core and repeated concepts should yield list candidates");
result.projections.lists.forEach((list) => {
  assert.equal(list.meta.candidate_only, true);
  assert.equal(list.meta.read_only, true);
  list.items.forEach((item) => {
    assert.equal(item.type, "insight");
    assert.equal(item.source, "aha_semantic_v2");
    assert.ok(insightIds.has(item.refId), `list ${list.id} has unresolved ${item.refId}`);
  });
});

assert.ok(result.projections.paths.length >= 1);
result.projections.paths.forEach((path) => {
  assert.equal(path.status, "candidate");
  assert.equal(path.meta.candidate_only, true);
  path.steps.forEach((step) => {
    assert.equal(step.type, "insight");
    assert.equal(step.source, "aha_semantic_v2");
    assert.ok(insightIds.has(step.refId), `path ${path.id} has unresolved ${step.refId}`);
  });
  assert.deepEqual(Array.from(path.steps, (step) => step.meta.stage), ["orientation", "claim_evidence", "tension_counterexample", "uncertainty", "synthesis_next_inquiry"]);
});

const mindmap = result.projections.mindmap;
assert.equal(mindmap.read_only, true);
const mindmapIds = new Set(mindmap.nodes.map((node) => node.id));
assert.ok(mindmap.nodes.some((node) => node.type === "insight"));
assert.ok(mindmap.nodes.some((node) => node.type === "concept"));
assert.ok(mindmap.meta.branch_count >= 2 && mindmap.meta.branch_count <= 7);
mindmap.edges.forEach((edge) => {
  assert.ok(mindmapIds.has(edge.from), `mindmap unresolved from ${edge.from}`);
  assert.ok(mindmapIds.has(edge.to), `mindmap unresolved to ${edge.to}`);
});
const resonanceMindmapEdges = mindmap.edges.filter((edge) => edge.type === "resonates_with");
assert.ok(resonanceMindmapEdges.length >= 1);
assert.ok(resonanceMindmapEdges.every((edge) => edge.meta.dedupe_eligible === false));

for (const key of [
  "production_gate_authority", "automatic_projection_authority", "chamber_write", "canonical_write",
  "insights_write", "concepts_write", "lists_write", "paths_write", "mindmap_write", "meta_write",
  "persistent_write", "remote_write"
]) assert.equal(result.policy[key], false, `${key} must stay false`);

const adapters = api.adapters(result);
assert.equal(adapters.projection_id, result.projection_id);
assert.deepEqual(adapters.insights, result.projections.insights);
assert.deepEqual(adapters.concepts, result.projections.concepts);
assert.deepEqual(adapters.lists, result.projections.lists);
assert.deepEqual(adapters.paths, result.projections.paths);
assert.deepEqual(adapters.mindmap, result.projections.mindmap);
assert.deepEqual(api.surface(result, "concepts"), result.projections.concepts);
assert.equal(api.surface(result, "unknown"), null);

assert.equal(JSON.stringify(input), before, "projection must not mutate source insights");
assert.equal(storageCalls, 0, "projection must not touch localStorage");

// Same semantic set in another input order must produce the same projection id
// and the same five product projections.
const reverse = api.project({ insights: [...input].reverse() });
assert.equal(reverse.projection_id, result.projection_id);
assert.deepEqual(reverse.projections, result.projections);
assert.equal(reverse.validation.valid, true);

// No trusted inputs => fail closed, and no surface receives candidates.
const blockedOnly = api.project({ insights: [blockedE] });
assert.equal(blockedOnly.status, "blocked");
assert.ok(blockedOnly.blocking_reasons.includes("no_projection_ready_insights"));
assert.equal(blockedOnly.projections.insights.length, 0);
assert.equal(blockedOnly.projections.concepts.length, 0);
assert.equal(blockedOnly.projections.lists.length, 0);
assert.equal(blockedOnly.projections.paths.length, 0);
assert.equal(blockedOnly.projections.mindmap.nodes.length, 0);

// Dependency loss must also fail closed instead of falling back to legacy stores.
const saturationBackup = context.AHAInsightSaturationV2;
context.AHAInsightSaturationV2 = null;
const dependencyBlocked = api.project({ insights: [equivalentA] });
assert.equal(dependencyBlocked.status, "blocked");
assert.ok(dependencyBlocked.blocking_reasons.includes("insight_saturation_v2_unavailable"));
context.AHAInsightSaturationV2 = saturationBackup;

console.log("aha-semantic-projections-v2.test.cjs: OK");
