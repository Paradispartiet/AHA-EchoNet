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

function makeInsight(id, insight, concepts, qualityScore) {
  return {
    id,
    source_event_id: `source_${id}`,
    source_text_hash: "a".repeat(64),
    semantic_concepts: concepts,
    candidate: {
      insight,
      type: "principle",
      causal_status: "not_causal",
      evidence: [
        { quote: `Første dokumenterte belegg for ${id}.`, role: "supports" },
        { quote: `Andre dokumenterte belegg for ${id}.`, role: "context" }
      ]
    },
    gate_decision: {
      eligible_for_insight_review: true,
      blocking_reasons: [],
      metrics: { quality_score: qualityScore }
    }
  };
}

function branchKeys(result) {
  const mindmap = result.projections.mindmap;
  const branchIds = new Set(
    mindmap.edges
      .filter((edge) => edge.type === "theme_branch")
      .map((edge) => edge.to)
  );
  return mindmap.nodes
    .filter((node) => branchIds.has(node.id))
    .map((node) => node.meta?.concept_key)
    .filter(Boolean);
}

const alternatives = api.project({ insights: [
  makeInsight(
    "meal_a",
    "Gratis lunsj kan påvirke arbeidsroen etter pausen.",
    ["gratis", "gratis lunsj", "arbeidsro"],
    0.85
  ),
  makeInsight(
    "meal_b",
    "Gratis tiltak kan også påvirke fraværet uten å være et fullverdig måltid.",
    ["gratis", "fravær"],
    0.9
  ),
  makeInsight(
    "meal_c",
    "Gratis lunsj kan gi en roligere oppstart når arbeidsroen allerede er sårbar.",
    ["gratis lunsj", "arbeidsro"],
    0.8
  ),
  makeInsight(
    "meal_d",
    "Arbeidsro og fravær må vurderes som egne utfall i forsøket.",
    ["arbeidsro", "fravær"],
    0.95
  )
] });

assert.equal(alternatives.validation.valid, true, JSON.stringify(alternatives.validation));
const alternativeKeys = branchKeys(alternatives);
assert.ok(alternativeKeys.includes("gratis lunsj"), "specific source concept must remain a mindmap branch");
assert.ok(alternativeKeys.includes("arbeidsro"), "independent alternative branch must remain available");
assert.ok(alternativeKeys.includes("fravær"), "another independent alternative branch must remain available");
assert.ok(
  !alternativeKeys.includes("gratis"),
  "a lexically subsumed sibling branch with overlapping support must yield to the more specific concept when independent alternatives exist"
);

const scarcity = api.project({ insights: [
  makeInsight(
    "scarce_a",
    "Gratis lunsj er det eneste konkrete temaet i den første innsikten.",
    ["gratis", "gratis lunsj"],
    0.8
  ),
  makeInsight(
    "scarce_b",
    "Gratis er det eneste delte kildebegrepet i den andre innsikten.",
    ["gratis"],
    0.9
  )
] });

assert.equal(scarcity.validation.valid, true, JSON.stringify(scarcity.validation));
const scarcityKeys = branchKeys(scarcity);
assert.ok(scarcityKeys.includes("gratis lunsj"), "specific branch must remain in a sparse map");
assert.ok(
  scarcityKeys.includes("gratis"),
  "true branch scarcity may retain the overlapping broader source concept rather than collapsing the map to one branch"
);

console.log("aha-projection-mindmap-sibling-subsumption-v2.test.cjs: OK");
