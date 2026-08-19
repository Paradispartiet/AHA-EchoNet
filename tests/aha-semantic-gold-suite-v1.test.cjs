const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { window: null, console };
context.window = context;
vm.runInNewContext(fs.readFileSync("js/ahaSemanticGoldEvaluator.js", "utf8"), context, { filename: "js/ahaSemanticGoldEvaluator.js" });
vm.runInNewContext(fs.readFileSync("js/ahaSemanticGoldSuite.js", "utf8"), context, { filename: "js/ahaSemanticGoldSuite.js" });

const api = context.AHASemanticGoldSuite;
assert.ok(api);
assert.equal(api.SUITE_SCHEMA, "aha_semantic_gold_suite_v1");

const base = JSON.parse(fs.readFileSync("tests/fixtures/aha-semantic-evaluation-gold-v1.json", "utf8"));
const negative = JSON.parse(fs.readFileSync("tests/fixtures/aha-semantic-evaluation-gold-negative-v1.json", "utf8"));
const fixtures = [...base.fixtures, ...negative.fixtures];
assert.equal(fixtures.length, 6);

const result = api.evaluateGoldSet({ fixtures });
assert.equal(result.valid, true, JSON.stringify(result.errors));
assert.equal(result.fixture_count, 6);
assert.equal(result.valid_fixture_count, 6);
assert.equal(result.production_gate_authority, false);
assert.equal(result.synthesis_allowed, false);

assert.deepEqual(JSON.parse(JSON.stringify(result.dimensions.entities)), {
  true_positive: 4,
  predicted: 6,
  expected: 4,
  false_positive: 2,
  false_negative: 0,
  precision: 0.666667,
  recall: 1,
  f1: 0.8
});
assert.deepEqual(JSON.parse(JSON.stringify(result.dimensions.concepts)), {
  true_positive: 7,
  predicted: 8,
  expected: 8,
  false_positive: 1,
  false_negative: 1,
  precision: 0.875,
  recall: 0.875,
  f1: 0.875
});
assert.deepEqual(JSON.parse(JSON.stringify(result.dimensions.source_claims)), {
  true_positive: 6,
  predicted: 7,
  expected: 6,
  false_positive: 1,
  false_negative: 0,
  precision: 0.857143,
  recall: 1,
  f1: 0.923077
});
assert.deepEqual(JSON.parse(JSON.stringify(result.dimensions.relations)), {
  true_positive: 1,
  predicted: 3,
  expected: 3,
  false_positive: 2,
  false_negative: 2,
  precision: 0.333333,
  recall: 0.333333,
  f1: 0.333333
});
assert.deepEqual(JSON.parse(JSON.stringify(result.dimensions.interpretations)), {
  true_positive: 1,
  predicted: 3,
  expected: 3,
  false_positive: 2,
  false_negative: 2,
  precision: 0.333333,
  recall: 0.333333,
  f1: 0.333333
});
assert.equal(result.macro_f1, 0.652949);

const perfect = result.fixture_results.find((item) => item.fixture_id === "political_ecology_perfect_v1");
const imperfect = result.fixture_results.find((item) => item.fixture_id === "public_sphere_imperfect_v1");
assert.equal(perfect.macro_f1, 1);
assert.ok(imperfect.macro_f1 < 1);

{
  const broken = structuredClone(fixtures);
  broken[0].schema = "wrong_schema";
  const invalid = api.evaluateGoldSet({ fixtures: broken });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.valid_fixture_count, 5);
  assert.equal(invalid.errors.length, 1);
  assert.equal(invalid.production_gate_authority, false);
  assert.equal(invalid.synthesis_allowed, false);
}

{
  const unavailableContext = { window: null, console };
  unavailableContext.window = unavailableContext;
  vm.runInNewContext(fs.readFileSync("js/ahaSemanticGoldSuite.js", "utf8"), unavailableContext, { filename: "js/ahaSemanticGoldSuite.js" });
  const unavailable = unavailableContext.AHASemanticGoldSuite.evaluateGoldSet({ fixtures });
  assert.equal(unavailable.valid, false);
  assert.ok(unavailable.errors.includes("gold_evaluator_unavailable"));
  assert.equal(unavailable.production_gate_authority, false);
}

console.log("aha-semantic-gold-suite-v1 passed");
