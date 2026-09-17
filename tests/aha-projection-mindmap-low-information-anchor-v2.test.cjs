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

function mindmapWithAnchor(anchor, title = anchor, originalTitle = anchor) {
  return {
    nodes: [
      {
        id: "root",
        title: "Skolemåltid: semantisk oversikt",
        type: "theme",
        meta: {
          root: true,
          semantic_shape: "ranked_hierarchy_v2",
          central_idea: "Skolemåltid: semantisk oversikt"
        }
      },
      {
        id: "concept_a",
        title,
        type: "concept",
        meta: {
          concept_key: anchor,
          original_title: originalTitle,
          branch_reason: `Grenen samler kildebundne innsikter rundt kildebegrepet «${anchor}» i analysen.`
        }
      },
      {
        id: "concept_b",
        title: "fravær",
        type: "concept",
        meta: {
          concept_key: "fravær",
          original_title: "fravær",
          branch_reason: "Grenen samler kildebundne innsikter om fravær i forsøket."
        }
      },
      { id: "a", title: "Gratis lunsj kan påvirke arbeidsroen", type: "insight", refId: "a" },
      { id: "b", title: "Fraværet var foreløpig uendret", type: "insight", refId: "b" }
    ],
    edges: [
      {
        from: "root",
        to: "concept_a",
        type: "theme_branch",
        meta: {
          semantic_basis: "ranked_source_concept",
          branch_reason: `Kildebegrepet «${anchor}» er valgt som egen perspektivgren i analysen.`
        }
      },
      {
        from: "root",
        to: "concept_b",
        type: "theme_branch",
        meta: {
          semantic_basis: "ranked_source_concept",
          branch_reason: "Fravær er valgt som en egen kildebundet perspektivgren i analysen."
        }
      },
      { from: "concept_a", to: "a", type: "supports_insight" },
      { from: "concept_b", to: "b", type: "supports_insight" }
    ],
    read_only: true,
    meta: {
      projection_id: "projection_anchor_regression",
      semantic_shape: "ranked_hierarchy_v2",
      branch_assignment: "one_primary_hierarchy_parent_per_insight"
    }
  };
}

const meaningful = api.evaluateMindmap(mindmapWithAnchor("arbeidsro"));
assert.equal(meaningful.passed, true, "a meaningful source concept must remain eligible");
assert.ok(!meaningful.reasons.includes("mindmap_branch_anchor_low_information"));

for (const anchor of ["antall", "samtidig", "hyppig"]) {
  const quality = api.evaluateMindmap(mindmapWithAnchor(anchor));
  assert.equal(quality.passed, false, `${anchor} must fail closed as an unrefined low-information branch anchor`);
  assert.ok(
    quality.reasons.includes("mindmap_branch_anchor_low_information"),
    `${anchor} must expose the low-information anchor reason`
  );
}

const masked = api.evaluateMindmap(
  mindmapWithAnchor(
    "antall",
    "Spor: Gratis lunsj kan påvirke arbeidsroen etter pausen",
    "antall"
  )
);
assert.equal(masked.passed, false, "an arbitrary display title must not hide a weak semantic concept key");
assert.ok(masked.reasons.includes("mindmap_branch_anchor_low_information"));

const refinedModel = api.refineReadModel({
  status: "ready",
  validation: { valid: true },
  projection_id: "projection_anchor_regression",
  surfaces: {
    insights: [
      { id: "a", insight: "Gratis lunsj kan påvirke arbeidsroen etter pausen." },
      { id: "b", insight: "Fraværet var foreløpig uendret i forsøket." }
    ],
    concepts: [],
    lists: [],
    paths: [],
    mindmap: mindmapWithAnchor("antall")
  }
});
const refinedBranch = refinedModel.surfaces.mindmap.nodes.find((node) => node.id === "concept_a");
assert.equal(refinedBranch.meta.display_theme_source, "source_bound_insight_text");
assert.notEqual(refinedBranch.title, "antall");
const refinedQuality = api.evaluateMindmap(refinedModel.surfaces.mindmap);
assert.equal(refinedQuality.passed, true, "source-bound refinement may recover a weak raw branch anchor");
assert.ok(!refinedQuality.reasons.includes("mindmap_branch_anchor_low_information"));

console.log("aha-projection-mindmap-low-information-anchor-v2.test.cjs: OK");
