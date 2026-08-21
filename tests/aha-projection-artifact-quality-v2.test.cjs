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
assert.equal(api.DISPLAY_REFINEMENT, "source_bound_usefulness_v2");

const insights = [
  {
    id: "a",
    title: "Gratis lunsj kan påvirke arbeidsroen etter pausen",
    insight: "Gratis lunsj kan påvirke arbeidsroen etter pausen.",
    provenance: { evidence: [{ quote: "Gratis lunsj" }], source_refs: [{ field: "source_id", value: "source_a" }] }
  },
  {
    id: "b",
    title: "Fraværet var foreløpig uendret",
    insight: "Fraværet var foreløpig uendret etter forsøket.",
    provenance: { evidence: [{ quote: "Fraværet" }], source_refs: [{ field: "source_id", value: "source_b" }] }
  },
  {
    id: "c",
    title: "Arbeidsro og fravær må vurderes separat",
    insight: "Arbeidsro og fravær må vurderes som separate utfall.",
    provenance: { evidence: [{ quote: "Arbeidsro" }], source_refs: [{ field: "source_id", value: "source_c" }] }
  }
];

const goodList = {
  id: "list_good",
  title: "Utforsk skolemåltid",
  items: insights.map((insight) => ({ refId: insight.id, title: insight.title, meta: { concept_keys: ["skolemåltid", `perspektiv_${insight.id}`] } })),
  meta: { semantic_basis: "shared_concept", semantic_basis_label: "skolemåltid" }
};
const weakList = {
  id: "list_weak",
  items: [{ refId: "a" }, { refId: "b" }],
  meta: { semantic_basis: "fallback_core" }
};
const lowInformationList = {
  id: "list_low_information",
  title: "Utforsk alene",
  description: "Strukturelt riktig, men menneskelig svakt.",
  items: [
    { refId: "a", title: insights[0].title, meta: { concept_keys: ["alene", "lunsj"] } },
    { refId: "b", title: insights[1].title, meta: { concept_keys: ["alene", "fravær"] } }
  ],
  meta: { semantic_basis: "shared_concept", semantic_basis_label: "alene" }
};
assert.equal(api.evaluateList(goodList, { insights }).passed, true);
assert.equal(api.evaluateList(weakList, { insights }).passed, false);
const rawLowInformationQuality = api.evaluateList(lowInformationList, { insights });
assert.equal(rawLowInformationQuality.passed, false);
assert.ok(rawLowInformationQuality.reasons.includes("list_display_anchor_low_information"));

const genericPath = {
  id: "path_generic",
  title: "Undersøk: alene",
  steps: [
    { refId: "a", order: 0, narrative: "Orienter deg i temaet og kontroller hva kildegrunnlaget faktisk støtter.", learningOutcome: "Kunne gjengi hovedspørsmålet og kildegrunnlaget.", meta: { stage: "orientation", semantic_basis: "shared_concept" } },
    { refId: "b", order: 1, narrative: "Undersøk den sentrale påstanden og skill mellom belegg og tolkning.", learningOutcome: "Kunne koble påstanden til konkret kildebelegg.", meta: { stage: "claim_evidence", semantic_basis: "shared_concept" } },
    { refId: "c", order: 2, narrative: "Let etter en spenning, begrensning eller et moteksempel som utfordrer forklaringen.", learningOutcome: "Kunne forklare en spenning og et relevant moteksempel.", meta: { stage: "tension_counterexample", semantic_basis: "shared_concept" } },
    { refId: "b", order: 3, narrative: "Kartlegg usikre antakelser, manglende belegg og mulige alternative forklaringer.", learningOutcome: "Kunne skille kunnskap fra begrunnet usikkerhet.", meta: { stage: "uncertainty", semantic_basis: "shared_concept" } },
    { refId: "a", order: 4, narrative: "Syntetiser det som holder og formuler en presis neste undersøkelse.", learningOutcome: "Kunne formulere en syntese og ett åpent spørsmål.", meta: { stage: "synthesis_next_inquiry", semantic_basis: "shared_concept" } }
  ]
};
const rawPathQuality = api.evaluatePath(genericPath, { insights });
assert.equal(rawPathQuality.passed, false, "generic path copy must not pass when source insight text is available");
assert.ok(rawPathQuality.reasons.includes("path_transitions_not_source_bound"));
assert.equal(api.evaluatePath({ ...genericPath, id: "short", steps: genericPath.steps.slice(0, 2) }, { insights }).passed, false);

const goodMindmap = {
  nodes: [
    { id: "root", title: "Skolemåltid: semantisk oversikt", type: "theme", meta: { root: true } },
    { id: "concept_a", title: "arbeidsro", type: "concept" },
    { id: "concept_b", title: "fravær", type: "concept" },
    { id: "a", title: insights[0].title, type: "insight", refId: "a" },
    { id: "b", title: insights[1].title, type: "insight", refId: "b" }
  ],
  edges: [
    { from: "root", to: "concept_a", type: "theme_branch" },
    { from: "root", to: "concept_b", type: "theme_branch" },
    { from: "concept_a", to: "a", type: "supports_insight" },
    { from: "concept_b", to: "b", type: "supports_insight" }
  ],
  read_only: true,
  meta: { projection_id: "projection_1" }
};
assert.equal(api.evaluateMindmap(goodMindmap).passed, true);

const duplicateShared = {
  id: "list_duplicate_shared",
  title: "Utforsk oppmerksomhet",
  items: [
    { refId: "b", title: insights[1].title, meta: { concept_keys: ["oppmerksomhet"] } },
    { refId: "c", title: insights[2].title, meta: { concept_keys: ["oppmerksomhet"] } }
  ],
  meta: { semantic_basis: "shared_concept", semantic_basis_label: "oppmerksomhet" }
};
const duplicateResonance = {
  id: "list_duplicate_resonance",
  title: `Sammenheng: ${insights[1].title} ↔ ${insights[2].title}`,
  items: [
    { refId: "b", title: insights[1].title, meta: { concept_keys: ["fravær"] } },
    { refId: "c", title: insights[2].title, meta: { concept_keys: ["arbeidsro"] } }
  ],
  meta: { semantic_basis: "resonance", semantic_basis_label: "resonans", dedupe_eligible: false }
};
const duplicatePath = {
  ...genericPath,
  id: "path_duplicate_resonance",
  steps: genericPath.steps.map((step, index) => ({ ...step, refId: index % 2 ? "c" : "b", meta: { ...step.meta, semantic_basis: "resonance" } }))
};
const duplicateSharedPath = {
  ...genericPath,
  id: "path_duplicate_shared",
  steps: genericPath.steps.map((step, index) => ({ ...step, refId: index % 2 ? "c" : "b", meta: { ...step.meta, semantic_basis: "shared_concept" } }))
};

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
    lists: [goodList, lowInformationList, duplicateShared, duplicateResonance, weakList],
    paths: [genericPath, duplicateSharedPath, duplicatePath, { ...genericPath, id: "path_short", steps: genericPath.steps.slice(0, 2) }],
    mindmap: goodMindmap
  },
  policy: { persistent_write: false, remote_write: false }
};
const before = JSON.stringify(model);
const refined = api.refineReadModel(model);
assert.equal(JSON.stringify(model), before, "refinement must not mutate source model");
assert.ok(refined.surfaces.lists.some((item) => item.id === "list_low_information"));
const rescued = refined.surfaces.lists.find((item) => item.id === "list_low_information");
assert.equal(rescued.meta.display_theme_source, "source_bound_insight_text");
assert.ok(!rescued.title.includes("alene"));
assert.ok(rescued.title.length <= api.MAX_PRODUCT_TITLE);
assert.ok(refined.surfaces.lists.some((item) => item.id === "list_duplicate_resonance"), "resonance should win an exact-ref duplicate");
assert.ok(!refined.surfaces.lists.some((item) => item.id === "list_duplicate_shared"));
assert.ok(refined.surfaces.paths.some((item) => item.id === "path_duplicate_resonance"));
assert.ok(!refined.surfaces.paths.some((item) => item.id === "path_duplicate_shared"));
const refinedGenericPath = refined.surfaces.paths.find((item) => item.id === "path_generic");
assert.ok(refinedGenericPath.steps.every((step) => step.meta.source_bound_narrative === true));
assert.equal(api.evaluatePath(refinedGenericPath, { insights }).passed, true);

const filtered = api.filterReadModel(model);
assert.ok(filtered.surfaces.lists.some((item) => item.id === "list_good"));
assert.ok(filtered.surfaces.lists.some((item) => item.id === "list_low_information"));
assert.ok(filtered.surfaces.lists.some((item) => item.id === "list_duplicate_resonance"));
assert.ok(!filtered.surfaces.lists.some((item) => item.id === "list_weak"));
assert.ok(filtered.surfaces.paths.some((item) => item.id === "path_generic"));
assert.ok(filtered.surfaces.paths.some((item) => item.id === "path_duplicate_resonance"));
assert.ok(!filtered.surfaces.paths.some((item) => item.id === "path_short"));
assert.equal(filtered.surfaces.mindmap.nodes.length, 5);
assert.equal(filtered.artifact_quality.mindmap.passed, true);
assert.equal(JSON.stringify(model), before, "quality filter must not mutate source model");
assert.equal(filtered.artifact_quality.policy.persistent_write, false);
assert.equal(filtered.artifact_quality.policy.remote_write, false);
assert.equal(filtered.artifact_quality.policy.automatic_acceptance, false);

console.log("aha-projection-artifact-quality-v2.test.cjs: OK (source-bound usefulness refinement)");
