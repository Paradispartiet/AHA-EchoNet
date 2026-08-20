const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { window: null, console };
context.window = context;
vm.runInNewContext(fs.readFileSync("js/ahaSemanticInsightReviewEvaluatorV2.js", "utf8"), context, { filename: "js/ahaSemanticInsightReviewEvaluatorV2.js" });
const api = context.AHASemanticInsightReviewEvaluatorV2;
assert.ok(api);
assert.equal(api.SCHEMA, "aha_semantic_insight_review_evaluator_v2");
assert.equal(api.SPEC_SCHEMA, "aha_semantic_insight_review_gold_v2");

const fixturePaths = [
  "tests/fixtures/semantic-live-reviewed/constraints-creativity-v1.json",
  "tests/fixtures/semantic-live-reviewed/retrieval-learning-v1.json",
  "tests/fixtures/semantic-live-reviewed/mixed-use-street-v1.json",
  "tests/fixtures/semantic-live-reviewed/delegation-bottleneck-v1.json",
  "tests/fixtures/semantic-live-reviewed/modularity-interfaces-v1.json",
  "tests/fixtures/semantic-live-reviewed/standardization-flexibility-v1.json"
];
const v1Fixtures = fixturePaths.map((path) => JSON.parse(fs.readFileSync(path, "utf8")));
const spec = JSON.parse(fs.readFileSync("tests/fixtures/semantic-insight-review-gold-v2.json", "utf8"));
const v2Snapshot = JSON.parse(fs.readFileSync("tests/fixtures/semantic-live-reviewed-v2/post-causal-language-v1.json", "utf8"));

const result = api.evaluateCorpus({ spec, v1Fixtures, v2Snapshot });
assert.equal(result.valid, true, JSON.stringify(result.errors));
assert.equal(result.case_count, 6);

// Same semantic review contract applied to the old V1 model shadow preserves
// the measured 1/6 interpretation baseline rather than moving the goalposts.
assert.deepEqual(JSON.parse(JSON.stringify(result.v1.metrics)), {
  true_positive: 1,
  predicted: 6,
  expected: 6,
  false_positive: 5,
  false_negative: 5,
  precision: 0.166667,
  recall: 0.166667,
  f1: 0.166667
});

// Post-#823 V2 matches five of the six reviewed meanings. Delegation remains
// deliberately unmatched because its synthesized wording loses the specific
// shift of disagreement to responsibility boundaries.
assert.deepEqual(JSON.parse(JSON.stringify(result.v2.metrics)), {
  true_positive: 5,
  predicted: 6,
  expected: 6,
  false_positive: 1,
  false_negative: 1,
  precision: 0.833333,
  recall: 0.833333,
  f1: 0.833333
});

const v2ById = new Map(result.v2.cases.map((item) => [item.fixture_id, item]));
for (const id of [
  "constraints_creativity_live_v1",
  "retrieval_learning_live_v1",
  "mixed_use_street_live_v1",
  "modularity_interfaces_live_v1",
  "standardization_flexibility_live_v1"
]) {
  const item = v2ById.get(id);
  assert.ok(item, id);
  assert.equal(item.metrics.true_positive, 1, `${id}: should match reviewed meaning`);
}

const delegation = v2ById.get("delegation_bottleneck_live_v1");
assert.ok(delegation);
assert.equal(delegation.metrics.true_positive, 0);
assert.equal(delegation.decisions.length, 1);
assert.equal(delegation.decisions[0].matched, false);
assert.ok(
  delegation.decisions[0].reasons.includes("meaning_group_missing:responsibility_boundaries"),
  JSON.stringify(delegation.decisions[0])
);

// The evaluator must not let evidence quotes supply missing Insight meaning.
{
  const reviewCase = spec.cases.find((item) => item.fixture_id === "delegation_bottleneck_live_v1");
  const source = v1Fixtures.find((item) => item.id === "delegation_bottleneck_live_v1").source_text;
  const candidate = {
    insight: "Delegasjon endrer samordningseffektiviteten og plasseringen av uenighet.",
    abstraction: "Beslutningsstruktur endrer hvor konflikt opptrer.",
    uncertainty: "",
    evidence: [{ quote: "Etter at beslutningsmyndighet ble delegert innen tydelige rammer, gikk lokale valg raskere, mens uenighet oftere samlet seg i grensene mellom ansvarsområdene.", role: "supports" }]
  };
  const decision = api.evaluateCandidate(candidate, source, reviewCase, 0);
  assert.equal(decision.matched, false);
  assert.ok(decision.reasons.includes("meaning_group_missing:responsibility_boundaries"));
}

assert.equal(result.policy.replaces_v1_gold_evaluator, false);
assert.equal(result.policy.production_gate_authority, false);
assert.equal(result.policy.canonical_write, false);
assert.equal(result.policy.chamber_write, false);
assert.equal(result.policy.meta_write, false);
assert.equal(result.policy.persistent_write, false);

console.log("aha-semantic-insight-review-evaluator-v2 passed: V1 F1 0.166667 -> V2 F1 0.833333");
