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
    insight: "Kommunens forsøk med lengre åpningstid på biblioteket økte antallet besøk i forsøksperioden.",
    provenance: { evidence: [{ quote: "lengre åpningstid" }], source_refs: [{ field: "source_id", value: "a" }] }
  },
  {
    id: "b",
    insight: "Resultatet av forsøket med lengre åpningstid må vurderes opp mot hvilke grupper som faktisk brukte tilbudet.",
    provenance: { evidence: [{ quote: "hvilke grupper" }], source_refs: [{ field: "source_id", value: "b" }] }
  },
  {
    id: "c",
    insight: "Kveldsbesøkene økte særlig blant studenter som tidligere kom før ordinær stengetid.",
    provenance: { evidence: [{ quote: "Kveldsbesøkene økte" }], source_refs: [{ field: "source_id", value: "c" }] }
  }
];

const stages = [
  "orientation",
  "claim_evidence",
  "tension_counterexample",
  "uncertainty",
  "synthesis_next_inquiry"
];

function path(id, refs) {
  return {
    id,
    title: "Undersøk: lengre",
    description: "Kildebundet læringssti.",
    goal: "Undersøk kildene.",
    learningOutcome: "Kunne vurdere kildene.",
    meta: {
      semantic_shape: "ordered_inquiry_v2",
      stage_selection: "semantic_role_ranked_not_round_robin",
      semantic_basis_label: "lengre"
    },
    steps: stages.map((stage, index) => ({
      id: `${id}_step_${index}`,
      refId: refs[index],
      order: index,
      narrative: "Denne teksten erstattes av kildebundet refinement før visning.",
      learningOutcome: "Dette læringsutbyttet erstattes av kildebundet refinement.",
      meta: {
        stage,
        semantic_role: stage,
        semantic_basis: id === "path_ab" ? "resonance" : "shared_concept",
        selection_reason: `best_source_bound_fit_for_${stage}`,
        source_bound_narrative: true
      }
    }))
  };
}

const model = {
  status: "ready",
  projection_id: "projection_path_collision",
  validation: { valid: true },
  surfaces: {
    insights,
    concepts: [],
    lists: [],
    paths: [
      path("path_ab", ["a", "b", "a", "b", "a"]),
      path("path_abc", ["a", "b", "c", "b", "a"])
    ],
    mindmap: { nodes: [], edges: [], read_only: true }
  }
};

const refined = api.refineReadModel(model);
assert.equal(refined.surfaces.paths.length, 2, "different ref sets must remain distinct path candidates");

const byId = new Map(refined.surfaces.paths.map((entry) => [entry.id, entry]));
const pathAB = byId.get("path_ab");
const pathABC = byId.get("path_abc");
assert.ok(pathAB && pathABC);

assert.deepEqual(
  [...new Set(pathAB.steps.map((step) => step.refId))].sort(),
  ["a", "b"],
  "display refinement must preserve the two-source path refs"
);
assert.deepEqual(
  [...new Set(pathABC.steps.map((step) => step.refId))].sort(),
  ["a", "b", "c"],
  "display refinement must preserve the three-source path refs"
);
assert.notEqual(
  pathAB.title,
  pathABC.title,
  "different source-bound path candidates must not render with the same human-facing title"
);

console.log("aha-projection-path-display-collision-v2.test.cjs: OK");
