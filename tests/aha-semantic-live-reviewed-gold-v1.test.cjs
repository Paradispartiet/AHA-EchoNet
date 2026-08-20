const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { window: null, console };
context.window = context;
vm.runInNewContext(fs.readFileSync("js/ahaSemanticGoldEvaluator.js", "utf8"), context, { filename: "js/ahaSemanticGoldEvaluator.js" });
vm.runInNewContext(fs.readFileSync("js/ahaSemanticGoldSuite.js", "utf8"), context, { filename: "js/ahaSemanticGoldSuite.js" });

const evaluator = context.AHASemanticGoldEvaluator;
const suite = context.AHASemanticGoldSuite;
assert.ok(evaluator);
assert.ok(suite);

const fixturePaths = [
  "tests/fixtures/semantic-live-reviewed/constraints-creativity-v1.json",
  "tests/fixtures/semantic-live-reviewed/retrieval-learning-v1.json",
  "tests/fixtures/semantic-live-reviewed/mixed-use-street-v1.json",
  "tests/fixtures/semantic-live-reviewed/delegation-bottleneck-v1.json",
  "tests/fixtures/semantic-live-reviewed/modularity-interfaces-v1.json",
  "tests/fixtures/semantic-live-reviewed/standardization-flexibility-v1.json"
];

const fixtures = fixturePaths.map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
assert.equal(fixtures.length, 6);
assert.equal(new Set(fixtures.map((fixture) => fixture.id)).size, 6);

for (const fixture of fixtures) {
  assert.equal(fixture.schema, "aha_semantic_gold_fixture_v1");
  assert.equal(fixture.provenance?.kind, "live_production_capture");
  assert.ok(fixture.provenance?.captured_at);
  assert.equal(fixture.provenance?.model, "gpt-4.1-mini-2025-04-14");
  assert.equal(fixture.source_event_id, fixture.model_shadow?.source_event_id);

  const result = evaluator.evaluateGoldFixture({
    gold_fixture: fixture,
    model_shadow: fixture.model_shadow
  });
  assert.equal(result.valid, true, `${fixture.id}: ${JSON.stringify(result.errors)}`);
  for (const dimension of suite.DIMENSIONS) {
    assert.deepEqual(
      JSON.parse(JSON.stringify({
        precision: result.dimensions[dimension].precision,
        recall: result.dimensions[dimension].recall,
        f1: result.dimensions[dimension].f1
      })),
      fixture.expected[dimension],
      `${fixture.id}:${dimension}`
    );
  }
  assert.equal(result.macro_f1, fixture.expected.macro_f1, `${fixture.id}:macro_f1`);
  assert.equal(result.production_gate_authority, false);
}

const aggregate = suite.evaluateGoldSet({ fixtures });
assert.equal(aggregate.valid, true, JSON.stringify(aggregate.errors));
assert.equal(aggregate.fixture_count, 6);
assert.equal(aggregate.valid_fixture_count, 6);
assert.equal(aggregate.production_gate_authority, false);
assert.equal(aggregate.synthesis_allowed, false);

assert.deepEqual(JSON.parse(JSON.stringify(aggregate.dimensions.entities)), {
  true_positive: 18,
  predicted: 20,
  expected: 19,
  false_positive: 2,
  false_negative: 1,
  precision: 0.9,
  recall: 0.947368,
  f1: 0.923077
});
assert.deepEqual(JSON.parse(JSON.stringify(aggregate.dimensions.concepts)), {
  true_positive: 24,
  predicted: 25,
  expected: 37,
  false_positive: 1,
  false_negative: 13,
  precision: 0.96,
  recall: 0.648649,
  f1: 0.774194
});
assert.deepEqual(JSON.parse(JSON.stringify(aggregate.dimensions.source_claims)), {
  true_positive: 18,
  predicted: 18,
  expected: 18,
  false_positive: 0,
  false_negative: 0,
  precision: 1,
  recall: 1,
  f1: 1
});
assert.deepEqual(JSON.parse(JSON.stringify(aggregate.dimensions.relations)), {
  true_positive: 11,
  predicted: 22,
  expected: 20,
  false_positive: 11,
  false_negative: 9,
  precision: 0.5,
  recall: 0.55,
  f1: 0.52381
});
assert.deepEqual(JSON.parse(JSON.stringify(aggregate.dimensions.interpretations)), {
  true_positive: 1,
  predicted: 6,
  expected: 6,
  false_positive: 5,
  false_negative: 5,
  precision: 0.166667,
  recall: 0.166667,
  f1: 0.166667
});
assert.equal(aggregate.macro_f1, 0.67755);

const standardization = aggregate.fixture_results.find((item) => item.fixture_id === "standardization_flexibility_live_v1");
const constraints = aggregate.fixture_results.find((item) => item.fixture_id === "constraints_creativity_live_v1");
assert.equal(standardization.macro_f1, 0.814286);
assert.equal(constraints.macro_f1, 0.708333);

const rejected = JSON.parse(fs.readFileSync("tests/fixtures/semantic-live-reviewed/rejected-live-captures-v1.json", "utf8"));
assert.equal(rejected.production_gate_authority, false);
assert.equal(rejected.cases.length, 1);
assert.equal(rejected.cases[0].id, "museum_attention_live_v1");
assert.equal(rejected.cases[0].attempts, 5);
assert.equal(rejected.cases[0].valid_model_shadow, false);
assert.equal(rejected.cases[0].included_in_gold_metrics, false);
assert.equal(rejected.cases[0].attempt_results.length, 5);
assert.ok(rejected.cases[0].attempt_results.every((item) => item.error === "semantic_model_validation_failed"));
assert.equal(rejected.cases[0].policy.synthesis_allowed, false);
assert.equal(rejected.cases[0].policy.canonical_write, false);
assert.equal(rejected.cases[0].policy.meta_write, false);
assert.equal(rejected.cases[0].policy.persistent_write, false);

console.log("aha-semantic-live-reviewed-gold-v1 passed");
