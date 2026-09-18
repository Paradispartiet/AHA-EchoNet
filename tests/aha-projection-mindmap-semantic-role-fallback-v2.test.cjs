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
  "js/ahaSemanticProjectionsV2.js",
  "js/ahaProjectionArtifactQualityV2.js"
]) vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });

const projection = context.AHASemanticProjectionsV2;
const quality = context.AHAProjectionArtifactQualityV2;
assert.ok(projection);
assert.ok(quality);

function makeInsight(id, insight, concepts, type, qualityScore = 0.82) {
  return {
    id,
    source_event_id: "source_attention",
    source_text_hash: "a".repeat(64),
    semantic_concepts: concepts,
    candidate: {
      insight,
      type,
      causal_status: "not_causal",
      evidence: [
        { quote: `Første eksakte kildebelegg for ${id} med tilstrekkelig lengde til proveniens.`, role: "supports", exact_source_match: true },
        { quote: `Andre eksakte kildebelegg for ${id} med tilstrekkelig lengde til proveniens.`, role: "context", exact_source_match: true }
      ]
    },
    gate_decision: {
      eligible_for_insight_review: true,
      blocking_reasons: [],
      metrics: { quality_score: qualityScore }
    }
  };
}

function readModel(projected) {
  const adapters = projection.adapters(projected);
  return {
    schema: "aha_projection_product_read_model_v2",
    version: 2,
    mode: "read_only",
    status: "ready",
    projection_id: projected.projection_id,
    validation: { valid: true, errors: [] },
    surfaces: {
      insights: adapters.insights,
      concepts: adapters.concepts,
      lists: adapters.lists,
      paths: adapters.paths,
      mindmap: adapters.mindmap
    },
    policy: { persistent_write: false, remote_write: false }
  };
}

function branches(mindmap) {
  const byId = new Map(mindmap.nodes.map((node) => [node.id, node]));
  return mindmap.edges
    .filter((edge) => edge.type === "theme_branch")
    .map((edge) => ({ edge, node: byId.get(edge.to) }));
}

const attention = projection.project({ insights: [
  makeInsight(
    "attention_tension",
    "Digitale verktøy har en iboende spenning mellom tidsbesparelse og konkurranse om oppmerksomhet.",
    ["digitale", "digitale verktøy"],
    "tension",
    0.71
  ),
  makeInsight(
    "attention_consequence",
    "Hyppige avbrudd fra digitale verktøy kan fragmentere arbeidsdagen som en konsekvens av hvordan verktøyene strukturerer oppmerksomheten.",
    ["digitale", "digitale verktøy"],
    "consequence",
    0.74
  )
] });

assert.equal(attention.validation.valid, true, JSON.stringify(attention.validation));
const attentionBranches = branches(attention.projections.mindmap);
assert.equal(attentionBranches.length, 2, "true concept-branch scarcity with two distinct semantic roles must still yield two meaningful Mindmap branches");
assert.deepEqual(
  attentionBranches.map(({ node }) => node.meta?.semantic_role).sort(),
  ["consequence", "tension"],
  "fallback branches must represent the two observed semantic roles"
);
assert.ok(attentionBranches.every(({ node }) => node.type === "concept"));
assert.ok(attentionBranches.every(({ node }) => node.meta?.branch_basis === "semantic_role"));
assert.ok(attentionBranches.every(({ edge }) => edge.meta?.semantic_basis === "ranked_semantic_role"));
assert.ok(
  !attentionBranches.some(({ node }) => node.meta?.concept_key === "digitale"),
  "semantic-role fallback must not revive the lexically subsumed broad sibling concept"
);
const attentionHierarchy = attention.projections.mindmap.edges.filter((edge) => edge.type === "supports_insight");
const attentionInsightIds = attention.projections.mindmap.nodes.filter((node) => node.type === "insight").map((node) => node.id);
assert.ok(attentionInsightIds.length === 2);
assert.ok(attentionInsightIds.every((id) => attentionHierarchy.filter((edge) => edge.to === id).length === 1),
  "every insight must keep exactly one primary hierarchy parent");

const filteredAttention = quality.filterReadModel(readModel(attention));
assert.ok(filteredAttention.surfaces.mindmap.nodes.length > 0, "quality filter must retain a provenance-safe semantic-role fallback Mindmap");
assert.equal(filteredAttention.artifact_quality.mindmap.passed, true, JSON.stringify(filteredAttention.artifact_quality.mindmap));
assert.deepEqual(Array.from(filteredAttention.artifact_quality.mindmap.reasons), []);

const sameRole = projection.project({ insights: [
  makeInsight("same_a", "Digitale verktøy påvirker arbeidsflyten på én måte.", ["digitale", "digitale verktøy"], "generalization"),
  makeInsight("same_b", "Digitale verktøy påvirker arbeidsflyten på en annen måte.", ["digitale", "digitale verktøy"], "generalization")
] });
const sameRoleBranches = branches(sameRole.projections.mindmap);
assert.ok(sameRoleBranches.every(({ edge }) => edge.meta?.semantic_basis !== "ranked_semantic_role"),
  "duplicate semantic roles must not be fabricated into multiple fallback branches");
const filteredSameRole = quality.filterReadModel(readModel(sameRole));
assert.equal(filteredSameRole.surfaces.mindmap.nodes.length, 0,
  "one real concept branch plus one duplicated semantic role must remain below the Mindmap quality gate");

const independentConcepts = projection.project({ insights: [
  makeInsight("independent_a", "Avbrudd fragmenterer oppmerksomheten.", ["avbrudd", "oppmerksomhet"], "tension"),
  makeInsight("independent_b", "Skjermtid påvirker arbeidsdagen.", ["skjermtid", "arbeidsdag"], "consequence")
] });
const independentBranches = branches(independentConcepts.projections.mindmap);
assert.ok(independentBranches.length >= 2);
assert.ok(independentBranches.every(({ edge }) => edge.meta?.semantic_basis === "ranked_source_concept"),
  "semantic-role fallback must never replace an already valid multi-concept hierarchy");

const singleInsight = projection.project({ insights: [
  makeInsight("single", "Digitale verktøy kan fragmentere oppmerksomheten.", ["digitale verktøy"], "tension")
] });
assert.ok(branches(singleInsight.projections.mindmap).every(({ edge }) => edge.meta?.semantic_basis !== "ranked_semantic_role"),
  "a single insight must never create synthetic role diversity");

console.log("aha-projection-mindmap-semantic-role-fallback-v2.test.cjs: OK");
