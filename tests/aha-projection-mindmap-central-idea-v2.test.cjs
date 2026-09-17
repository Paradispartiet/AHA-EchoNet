const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaProjectionArtifactQualityV2.js", "utf8"), context, { filename: "js/ahaProjectionArtifactQualityV2.js" });

const api = context.AHAProjectionArtifactQualityV2;
assert.ok(api);

const insights = [
  {
    id: "wait_measure",
    insight: "Sykehuset rapporterer kortere ventetid etter en ny arbeidsdeling, men målingen utelater viderehenviste pasienter.",
    quality: { mean_score: 0.84 },
    provenance: { evidence: [{ quote: "kortere ventetid" }], source_refs: [{ field: "source_id", value: "health_source" }] }
  },
  {
    id: "union_concern",
    insight: "Tillitsvalgte mener ventetidsmålingen kan skjule utfordringer når viderehenviste pasienter ikke telles med.",
    quality: { mean_score: 0.78 },
    provenance: { evidence: [{ quote: "viderehenviste pasienter" }], source_refs: [{ field: "source_id", value: "health_source" }] }
  },
  {
    id: "work_division",
    insight: "Den nye arbeidsdelingen er knyttet til kortere rapportert ventetid.",
    quality: { mean_score: 0.76 },
    provenance: { evidence: [{ quote: "arbeidsdelingen" }], source_refs: [{ field: "source_id", value: "health_source" }] }
  }
];

const mindmap = {
  nodes: [
    {
      id: "root",
      title: "Sammenhengen mellom Sykehuset og arbeidsdeling",
      type: "theme",
      meta: {
        root: true,
        semantic_shape: "ranked_hierarchy_v2",
        central_idea: "Sammenhengen mellom Sykehuset og arbeidsdeling"
      }
    },
    {
      id: "hospital",
      title: "Sykehuset",
      type: "concept",
      meta: { concept_key: "sykehuset", branch_reason: "Sykehuset organiserer en kildebundet perspektivgren i analysen." }
    },
    {
      id: "division",
      title: "arbeidsdeling",
      type: "concept",
      meta: { concept_key: "arbeidsdeling", branch_reason: "Arbeidsdeling organiserer en kildebundet perspektivgren i analysen." }
    },
    { id: "wait_measure", title: insights[0].insight, type: "insight", refId: "wait_measure", meta: { quality_score: 0.84 } },
    { id: "union_concern", title: insights[1].insight, type: "insight", refId: "union_concern", meta: { quality_score: 0.78 } },
    { id: "work_division", title: insights[2].insight, type: "insight", refId: "work_division", meta: { quality_score: 0.76 } }
  ],
  edges: [
    { from: "root", to: "hospital", type: "theme_branch", meta: { semantic_basis: "ranked_source_concept", branch_reason: "Sykehuset organiserer en egen kildebundet perspektivgren." } },
    { from: "root", to: "division", type: "theme_branch", meta: { semantic_basis: "ranked_source_concept", branch_reason: "Arbeidsdeling organiserer en egen kildebundet perspektivgren." } },
    { from: "hospital", to: "wait_measure", type: "supports_insight" },
    { from: "hospital", to: "union_concern", type: "supports_insight" },
    { from: "division", to: "work_division", type: "supports_insight" }
  ],
  read_only: true,
  meta: {
    projection_id: "projection_health_root",
    semantic_shape: "ranked_hierarchy_v2",
    branch_assignment: "one_primary_hierarchy_parent_per_insight"
  }
};

const model = {
  schema: "aha_projection_product_read_model_v2",
  version: 2,
  mode: "read_only",
  status: "ready",
  projection_id: "projection_health_root",
  validation: { valid: true, errors: [] },
  surfaces: { insights, concepts: [], lists: [], paths: [], mindmap },
  policy: { persistent_write: false, remote_write: false }
};

const beforeEdges = JSON.stringify(model.surfaces.mindmap.edges);
const refined = api.refineReadModel(model);
const root = refined.surfaces.mindmap.nodes.find((node) => node.type === "theme" && node.meta?.root === true);

assert.equal(root.meta.original_title, "Sammenhengen mellom Sykehuset og arbeidsdeling");
assert.equal(root.meta.display_theme_source, "source_bound_insight_text", "generated concept-pair root must be replaced from source-bound insight text");
assert.ok(root.title.startsWith("Oversikt: Sykehuset rapporterer kortere ventetid"), root.title);
assert.ok(!root.title.includes("Sammenhengen mellom Sykehuset og arbeidsdeling"));
assert.equal(root.meta.central_idea, root.title, "displayed root and central_idea must remain synchronized");
assert.equal(JSON.stringify(refined.surfaces.mindmap.edges), beforeEdges, "root display refinement must not alter graph semantics");
assert.equal(refined.policy.persistent_write, false);
assert.equal(refined.policy.remote_write, false);

console.log("aha-projection-mindmap-central-idea-v2.test.cjs: OK");
