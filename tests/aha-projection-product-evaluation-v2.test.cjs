const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

let storageCalls = 0;
const context = {
  console,
  localStorage: new Proxy({}, { get() { storageCalls += 1; throw new Error("evaluation pipeline must remain store-free"); } })
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

for (const file of [
  "js/ahaInsightRelationClassifierV2.js",
  "js/ahaInsightSaturationV2.js",
  "js/ahaKnowledgeMigrationV2.js",
  "js/ahaSemanticProjectionsV2.js",
  "js/ahaV2ProductIntegrationGate.js",
  "js/ahaProjectionProductContractV2.js",
  "js/ahaProjectionArtifactQualityV2.js",
  "js/ahaProjectionProductReadModelV2.js"
]) vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });

const corpus = JSON.parse(fs.readFileSync("tests/fixtures/aha-projection-product-evaluation-v2.json", "utf8"));
assert.equal(corpus.cases.length, 24);
assert.equal(new Set(corpus.cases.map((entry) => entry.genre)).size, 8);

function sourceHash(id) {
  const seed = Buffer.from(id).toString("hex").slice(0, 16) || "a";
  return seed.padEnd(64, seed[0]).slice(0, 64);
}

function makeInsights(entry) {
  const sentences = entry.source_text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return entry.claims.map((claim, index) => ({
    id: `${entry.id}_insight_${index + 1}`,
    source_event_id: `${entry.id}_source_${index + 1}`,
    source_text_hash: sourceHash(`${entry.id}_${index}`),
    semantic_concepts: [entry.focus, `${entry.genre}_${index + 1}`],
    candidate: {
      insight: claim,
      type: index === 2 ? "method" : "principle",
      causal_status: "not_causal",
      evidence: [
        { quote: sentences[0] || entry.source_text, role: "supports" },
        { quote: sentences[1] || entry.source_text, role: "limits" }
      ]
    },
    gate_decision: {
      eligible_for_insight_review: entry.expected_visible === true,
      blocking_reasons: entry.expected_visible === true ? [] : ["insufficient_evidence"],
      metrics: { quality_score: entry.expected_visible === true ? 0.88 - index * 0.01 : 0.42 }
    }
  }));
}

const results = [];
for (const entry of corpus.cases) {
  const input = { legacy_insights: makeInsights(entry), legacy_lists: [], legacy_paths: [], legacy_mindmaps: [] };
  const model = context.AHAProjectionProductReadModelV2.build(input);
  const visible = model.status === "ready"
    && model.validation?.valid === true
    && model.surfaces.lists.length > 0
    && model.surfaces.paths.length > 0
    && model.surfaces.mindmap.nodes.length > 0;
  assert.equal(visible, entry.expected_visible, `${entry.id} visibility mismatch: ${JSON.stringify(model.artifact_quality || model.blocking_reasons)}`);
  if (visible) {
    assert.ok(model.surfaces.lists.every((item) => item.quality?.passed === true), `${entry.id} leaked weak list`);
    assert.ok(model.surfaces.paths.every((item) => item.quality?.passed === true), `${entry.id} leaked weak path`);
    assert.equal(model.surfaces.mindmap.quality?.passed, true, `${entry.id} leaked weak mindmap`);
    assert.ok(model.surfaces.paths.every((path) => path.steps.map((step) => step.meta.stage).join("|") === "orientation|claim_evidence|tension_counterexample|uncertainty|synthesis_next_inquiry"));
  }
  results.push({ id: entry.id, genre: entry.genre, visible });
}

assert.equal(results.filter((entry) => entry.visible).length, 21);
assert.equal(results.filter((entry) => !entry.visible).length, 3);
assert.equal(storageCalls, 0);

const deterministicCase = corpus.cases.find((entry) => entry.expected_visible);
const forward = context.AHAProjectionProductReadModelV2.build({ legacy_insights: makeInsights(deterministicCase) });
const reverse = context.AHAProjectionProductReadModelV2.build({ legacy_insights: makeInsights(deterministicCase).reverse() });
assert.equal(forward.projection_id, reverse.projection_id);
assert.deepEqual(forward.surfaces, reverse.surfaces);

const review = JSON.parse(fs.readFileSync("ops/evaluation/aha-projection-product-human-review-v2.json", "utf8"));
assert.equal(review.release_rule.automatic_persistence_allowed, false);
assert.equal(review.review_rows.reduce((sum, row) => sum + row.cases, 0), 24);
assert.equal(review.status, "agent_pre_review_complete_independent_human_review_open");

console.log("aha-projection-product-evaluation-v2.test.cjs: OK (24 cases)");
