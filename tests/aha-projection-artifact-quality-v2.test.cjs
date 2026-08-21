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

const insights = ["a", "b", "c"].map((id) => ({
  id,
  provenance: { evidence: [{ quote: `Belegg ${id}` }], source_refs: [{ field: "source_id", value: `source_${id}` }] }
}));
const goodList = {
  id: "list_good",
  title: "Utforsk demokrati",
  items: insights.map((insight) => ({ refId: insight.id, title: `Demokrati ${insight.id}`, meta: { concept_keys: ["demokrati", `perspektiv_${insight.id}`] } })),
  meta: { semantic_basis: "shared_concept", semantic_basis_label: "demokrati" }
};
const weakList = {
  id: "list_weak",
  items: [{ refId: "a" }, { refId: "b" }],
  meta: { semantic_basis: "fallback_core" }
};
assert.equal(api.evaluateList(goodList, { insights }).passed, true);
assert.equal(api.evaluateList(weakList, { insights }).passed, false);

const goodPath = {
  id: "path_good",
  steps: [
    { refId: "a", order: 0, narrative: "Orienter deg i temaet og kontroller hva kildegrunnlaget faktisk støtter.", learningOutcome: "Kunne gjengi hovedspørsmålet og kildegrunnlaget.", meta: { stage: "orientation" } },
    { refId: "b", order: 1, narrative: "Undersøk den sentrale påstanden og skill mellom belegg og tolkning.", learningOutcome: "Kunne koble påstanden til konkret kildebelegg.", meta: { stage: "claim_evidence" } },
    { refId: "c", order: 2, narrative: "Let etter en spenning, begrensning eller et moteksempel som utfordrer forklaringen.", learningOutcome: "Kunne forklare en spenning og et relevant moteksempel.", meta: { stage: "tension_counterexample" } },
    { refId: "b", order: 3, narrative: "Kartlegg usikre antakelser, manglende belegg og mulige alternative forklaringer.", learningOutcome: "Kunne skille kunnskap fra begrunnet usikkerhet.", meta: { stage: "uncertainty" } },
    { refId: "a", order: 4, narrative: "Syntetiser det som holder og formuler en presis neste undersøkelse.", learningOutcome: "Kunne formulere en syntese og ett åpent spørsmål.", meta: { stage: "synthesis_next_inquiry" } }
  ]
};
assert.equal(api.evaluatePath(goodPath, { insights }).passed, true);
assert.equal(api.evaluatePath({ ...goodPath, id: "short", steps: goodPath.steps.slice(0, 2) }, { insights }).passed, false);

const goodMindmap = {
  nodes: [
    { id: "root", type: "theme", meta: { root: true } },
    { id: "concept_a", type: "concept" },
    { id: "concept_b", type: "concept" },
    { id: "insight_a", type: "insight" },
    { id: "insight_b", type: "insight" }
  ],
  edges: [
    { from: "root", to: "concept_a", type: "theme_branch" },
    { from: "root", to: "concept_b", type: "theme_branch" },
    { from: "concept_a", to: "insight_a", type: "supports_insight" },
    { from: "concept_b", to: "insight_b", type: "supports_insight" }
  ],
  read_only: true,
  meta: { projection_id: "projection_1" }
};
assert.equal(api.evaluateMindmap(goodMindmap).passed, true);

const model = {
  schema: "aha_projection_product_read_model_v2",
  version: 2,
  mode: "read_only",
  status: "ready",
  projection_id: "projection_1",
  validation: { valid: true, errors: [] },
  surfaces: {
    insights,
    concepts: [],
    lists: [goodList, weakList],
    paths: [goodPath, { ...goodPath, id: "path_short", steps: goodPath.steps.slice(0, 2) }],
    mindmap: goodMindmap
  },
  policy: { persistent_write: false, remote_write: false }
};
const before = JSON.stringify(model);
const filtered = api.filterReadModel(model);
assert.deepEqual(Array.from(filtered.surfaces.lists, (item) => item.id), ["list_good"]);
assert.deepEqual(Array.from(filtered.surfaces.paths, (item) => item.id), ["path_good"]);
assert.equal(filtered.surfaces.mindmap.nodes.length, 5);
assert.equal(filtered.artifact_quality.mindmap.passed, true);
assert.equal(JSON.stringify(model), before, "quality filter must not mutate source model");
assert.equal(filtered.artifact_quality.policy.persistent_write, false);
assert.equal(filtered.artifact_quality.policy.automatic_acceptance, false);

console.log("aha-projection-artifact-quality-v2.test.cjs: OK");
