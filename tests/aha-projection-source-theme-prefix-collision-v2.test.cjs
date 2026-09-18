const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("js/ahaProjectionArtifactQualityV2.js", "utf8"),
  context,
  { filename: "js/ahaProjectionArtifactQualityV2.js" }
);

const api = context.AHAProjectionArtifactQualityV2;
assert.ok(api);

const insights = [
  {
    id: "a",
    insight: "Forberedelse av klær og mat kvelden før er forbundet med en roligere morgen når planen holder.",
    provenance: { evidence: [{ quote: "roligere morgen" }], source_refs: [{ field: "source_id", value: "a" }] }
  },
  {
    id: "b",
    insight: "Forberedelse av klær og mat kvelden før er en effektiv strategi mot morgenstress under forutsigbare forhold.",
    provenance: { evidence: [{ quote: "effektiv strategi" }], source_refs: [{ field: "source_id", value: "b" }] }
  }
];

const list = {
  id: "list_prefix_collision",
  title: "Sammenheng: resonans",
  items: insights.map((insight) => ({
    id: `item_${insight.id}`,
    title: insight.insight,
    refId: insight.id,
    meta: { concept_keys: ["morgenrutine"] }
  })),
  meta: {
    semantic_basis: "resonance",
    semantic_basis_label: "resonans",
    semantic_shape: "thematic_membership_v2",
    member_ref_ids: ["a", "b"],
    dedupe_eligible: false
  }
};

const stages = [
  "orientation",
  "claim_evidence",
  "tension_counterexample",
  "uncertainty",
  "synthesis_next_inquiry"
];

const path = {
  id: "path_prefix_collision",
  title: "Undersøk: resonans",
  meta: {
    semantic_shape: "ordered_inquiry_v2",
    stage_selection: "semantic_role_ranked_not_round_robin"
  },
  steps: stages.map((stage, index) => ({
    id: `step_${index}`,
    refId: index % 2 === 0 ? "a" : "b",
    order: index,
    meta: {
      stage,
      semantic_role: stage,
      semantic_basis: "resonance",
      selection_reason: `best_source_bound_fit_for_${stage}`,
      source_bound_narrative: true
    }
  }))
};

const model = {
  status: "ready",
  projection_id: "projection_prefix_collision",
  validation: { valid: true },
  surfaces: {
    insights,
    concepts: [],
    lists: [list],
    paths: [path],
    mindmap: { nodes: [], edges: [], read_only: true }
  }
};

const refined = api.refineReadModel(model);
const refinedList = refined.surfaces.lists[0];
const refinedPath = refined.surfaces.paths[0];

assert.ok(
  refinedList.title.includes("↔"),
  "a two-source resonance List must keep both source sides visible when compact prefixes initially collide"
);
assert.ok(
  refinedPath.title.includes("↔"),
  "a two-source resonance Path must keep both source sides visible when compact prefixes initially collide"
);
assert.deepEqual(
  refinedList.items.map((item) => item.refId).sort(),
  ["a", "b"],
  "display refinement must preserve List refs"
);
assert.deepEqual(
  [...new Set(refinedPath.steps.map((step) => step.refId))].sort(),
  ["a", "b"],
  "display refinement must preserve Path refs"
);

console.log("aha-projection-source-theme-prefix-collision-v2.test.cjs: OK");
