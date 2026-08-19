// ahaSemanticGoldSuite.js
// Aggregates hand-labeled semantic gold fixtures into micro precision/recall/F1.
// Offline QA only; never grants production write or synthesis authority.

(function (global) {
  "use strict";

  const SUITE_SCHEMA = "aha_semantic_gold_suite_v1";
  const DIMENSIONS = Object.freeze(["entities", "concepts", "source_claims", "relations", "interpretations"]);

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function round(value) {
    return value == null ? null : Number(value.toFixed(6));
  }

  function metric(tp, predicted, expected) {
    const precision = predicted > 0 ? tp / predicted : (expected > 0 ? 0 : null);
    const recall = expected > 0 ? tp / expected : null;
    const f1 = precision != null && recall != null && (precision + recall) > 0
      ? (2 * precision * recall) / (precision + recall)
      : (precision === 0 && recall === 0 ? 0 : null);
    return {
      true_positive: tp,
      predicted,
      expected,
      false_positive: Math.max(0, predicted - tp),
      false_negative: Math.max(0, expected - tp),
      precision: round(precision),
      recall: round(recall),
      f1: round(f1)
    };
  }

  function macroF1(dimensions) {
    const values = DIMENSIONS.map((name) => dimensions[name]?.f1).filter((value) => Number.isFinite(value));
    return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  }

  function evaluateGoldSet(input = {}) {
    const fixtures = safeArray(input.fixtures);
    const evaluator = input.evaluate_fixture
      || global.AHASemanticGoldEvaluator?.evaluateGoldFixture
      || global.AHAModuleApi?.resolve?.("semanticGoldEvaluator", "AHASemanticGoldEvaluator", { version: 1 })?.evaluateGoldFixture;

    if (typeof evaluator !== "function") {
      return {
        schema: SUITE_SCHEMA,
        version: 1,
        valid: false,
        errors: ["gold_evaluator_unavailable"],
        fixture_count: fixtures.length,
        valid_fixture_count: 0,
        dimensions: {},
        macro_f1: null,
        production_gate_authority: false
      };
    }

    const fixtureResults = fixtures.map((fixture) => evaluator({
      gold_fixture: fixture,
      model_shadow: fixture?.model_shadow
    }));
    const invalid = fixtureResults.filter((result) => result?.valid !== true);
    const sums = Object.fromEntries(DIMENSIONS.map((name) => [name, { tp: 0, predicted: 0, expected: 0 }]));

    fixtureResults.filter((result) => result?.valid === true).forEach((result) => {
      DIMENSIONS.forEach((name) => {
        const item = result.dimensions?.[name];
        if (!item) return;
        sums[name].tp += Number(item.true_positive || 0);
        sums[name].predicted += Number(item.predicted || 0);
        sums[name].expected += Number(item.expected || 0);
      });
    });

    const dimensions = Object.fromEntries(DIMENSIONS.map((name) => [
      name,
      metric(sums[name].tp, sums[name].predicted, sums[name].expected)
    ]));

    return {
      schema: SUITE_SCHEMA,
      version: 1,
      valid: invalid.length === 0 && fixtures.length > 0,
      errors: invalid.map((result) => ({ fixture_id: result?.fixture_id || null, errors: safeArray(result?.errors) })),
      fixture_count: fixtures.length,
      valid_fixture_count: fixtures.length - invalid.length,
      dimensions,
      macro_f1: macroF1(dimensions),
      fixture_results: fixtureResults.map((result) => ({
        fixture_id: result?.fixture_id || null,
        valid: result?.valid === true,
        macro_f1: result?.macro_f1 ?? null
      })),
      production_gate_authority: false,
      synthesis_allowed: false,
      note: "aggregate_gold_metrics_are_offline_qa_not_production_write_authority"
    };
  }

  const api = Object.freeze({ SUITE_SCHEMA, DIMENSIONS, evaluateGoldSet });
  global.AHASemanticGoldSuite = api;
  global.AHAModuleApi?.register?.("semanticGoldSuite", api, {
    version: 1,
    legacyGlobal: "AHASemanticGoldSuite",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
