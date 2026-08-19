const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("js/ahaSemanticGoldEvaluator.js", "utf8");
const context = { window: null, console };
context.window = context;
vm.runInNewContext(source, context, { filename: "js/ahaSemanticGoldEvaluator.js" });

const api = context.AHASemanticGoldEvaluator;
assert.ok(api);
assert.equal(api.GOLD_SCHEMA, "aha_semantic_gold_fixture_v1");
assert.equal(api.GOLD_EVALUATION_SCHEMA, "aha_semantic_gold_evaluation_v1");

const fixtureSet = JSON.parse(fs.readFileSync("tests/fixtures/aha-semantic-evaluation-gold-v1.json", "utf8"));
assert.equal(fixtureSet.schema, "aha_semantic_gold_fixture_set_v1");
assert.equal(fixtureSet.production_gate_authority, false);
assert.ok(Array.isArray(fixtureSet.fixtures));
assert.ok(fixtureSet.fixtures.length >= 2);

for (const fixture of fixtureSet.fixtures) {
  const result = api.evaluateGoldFixture({ gold_fixture: fixture, model_shadow: fixture.model_shadow });
  assert.equal(result.valid, true, `${fixture.id}: ${result.errors.join(", ")}`);
  assert.equal(result.fixture_id, fixture.id);
  assert.equal(result.production_gate_authority, false);
  for (const dimension of ["entities", "concepts", "source_claims", "relations", "interpretations"]) {
    const actual = result.dimensions[dimension];
    const expected = fixture.expected[dimension];
    assert.equal(actual.precision, expected.precision, `${fixture.id}/${dimension}: precision`);
    assert.equal(actual.recall, expected.recall, `${fixture.id}/${dimension}: recall`);
    assert.equal(actual.f1, expected.f1, `${fixture.id}/${dimension}: f1`);
  }
  assert.equal(result.macro_f1, fixture.expected.macro_f1, `${fixture.id}: macro_f1`);
}

{
  const fixture = structuredClone(fixtureSet.fixtures[0]);
  fixture.model_shadow.entities.push({ source_surface: "Oslo", canonical_label: "Oslo", entity_type: "place" });
  const result = api.evaluateGoldFixture({ gold_fixture: fixture, model_shadow: fixture.model_shadow });
  assert.equal(result.dimensions.entities.true_positive, 2);
  assert.equal(result.dimensions.entities.predicted, 3);
  assert.equal(result.dimensions.entities.false_positive, 1);
  assert.equal(result.dimensions.entities.precision, 0.666667);
  assert.equal(result.dimensions.entities.recall, 1);
}

{
  const fixture = structuredClone(fixtureSet.fixtures[0]);
  fixture.model_shadow.concepts = [];
  const result = api.evaluateGoldFixture({ gold_fixture: fixture, model_shadow: fixture.model_shadow });
  assert.equal(result.dimensions.concepts.true_positive, 0);
  assert.equal(result.dimensions.concepts.predicted, 0);
  assert.equal(result.dimensions.concepts.expected, 1);
  assert.equal(result.dimensions.concepts.precision, 0);
  assert.equal(result.dimensions.concepts.recall, 0);
  assert.equal(result.dimensions.concepts.f1, 0);
}

{
  const fixture = structuredClone(fixtureSet.fixtures[0]);
  fixture.model_shadow.propositions[1].text = "Makt og miljø er viktige temaer.";
  fixture.model_shadow.propositions[1].evidence = [{ quote: "feil quote" }];
  const result = api.evaluateGoldFixture({ gold_fixture: fixture, model_shadow: fixture.model_shadow });
  assert.equal(result.dimensions.interpretations.true_positive, 0);
  assert.equal(result.dimensions.interpretations.false_positive, 1);
  assert.equal(result.dimensions.interpretations.false_negative, 1);
  assert.equal(result.dimensions.interpretations.f1, 0);
}

{
  const fixture = structuredClone(fixtureSet.fixtures[0]);
  fixture.schema = "wrong_schema";
  const result = api.evaluateGoldFixture({ gold_fixture: fixture, model_shadow: fixture.model_shadow });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("gold_fixture_schema_invalid"));
  assert.equal(result.macro_f1, null);
  assert.equal(result.production_gate_authority, false);
}

{
  const fixture = structuredClone(fixtureSet.fixtures[0]);
  fixture.source_event_id = "gold_src_other";
  const result = api.evaluateGoldFixture({ gold_fixture: fixture, model_shadow: fixture.model_shadow });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("source_event_id_mismatch"));
}

console.log("aha-semantic-gold-evaluator-v1 passed");
