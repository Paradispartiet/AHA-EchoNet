// ahaSemanticGoldEvaluator.js
// Pure QA evaluator for hand-labeled Semantic Model fixtures.
// Gold metrics are separate from deterministic↔model agreement metrics.

(function (global) {
  "use strict";

  const GOLD_SCHEMA = "aha_semantic_gold_fixture_v1";
  const GOLD_EVALUATION_SCHEMA = "aha_semantic_gold_evaluation_v1";

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function metric(tp, predicted, expected) {
    const precision = predicted > 0 ? tp / predicted : (expected > 0 ? 0 : null);
    const recall = expected > 0 ? tp / expected : null;
    const f1 = precision != null && recall != null && (precision + recall) > 0
      ? (2 * precision * recall) / (precision + recall)
      : (precision === 0 && recall === 0 ? 0 : null);
    const round = (value) => value == null ? null : Number(value.toFixed(6));
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

  function aliases(item) {
    return [item?.label, ...safeArray(item?.aliases)].map(normalize).filter(Boolean);
  }

  function buildCanonicalAliasMap(gold) {
    const map = new Map();
    [...safeArray(gold?.entities), ...safeArray(gold?.concepts)].forEach((item) => {
      const canonical = normalize(item?.label);
      if (!canonical) return;
      aliases(item).forEach((alias) => map.set(alias, canonical));
    });
    return map;
  }

  function canonicalLabel(value, aliasMap) {
    const key = normalize(value);
    return aliasMap.get(key) || key;
  }

  function countUniqueMatches(predicted, expected, matches) {
    const usedExpected = new Set();
    let tp = 0;
    predicted.forEach((candidate, candidateIndex) => {
      const matchIndex = expected.findIndex((goldItem, goldIndex) => (
        !usedExpected.has(goldIndex) && matches(candidate, goldItem, candidateIndex, goldIndex)
      ));
      if (matchIndex >= 0) {
        usedExpected.add(matchIndex);
        tp += 1;
      }
    });
    return metric(tp, predicted.length, expected.length);
  }

  function evaluateEntities(modelShadow, gold) {
    const predicted = safeArray(modelShadow?.entities);
    const expected = safeArray(gold?.entities);
    return countUniqueMatches(predicted, expected, (candidate, goldItem) => {
      const candidateKeys = [candidate?.source_surface, candidate?.canonical_label].map(normalize).filter(Boolean);
      const goldKeys = aliases(goldItem);
      const labelMatch = candidateKeys.some((key) => goldKeys.includes(key));
      const expectedType = String(goldItem?.entity_type || "").trim();
      return labelMatch && (!expectedType || String(candidate?.entity_type || "") === expectedType);
    });
  }

  function evaluateConcepts(modelShadow, gold) {
    const predicted = safeArray(modelShadow?.concepts);
    const expected = safeArray(gold?.concepts);
    return countUniqueMatches(predicted, expected, (candidate, goldItem) => {
      const candidateKeys = [candidate?.source_surface, candidate?.canonical_label].map(normalize).filter(Boolean);
      const goldKeys = aliases(goldItem);
      return candidateKeys.some((key) => goldKeys.includes(key));
    });
  }

  function evaluateSourceClaims(modelShadow, gold) {
    const predicted = safeArray(modelShadow?.propositions).filter((item) => item?.kind === "source_claim");
    const expected = safeArray(gold?.source_claims);
    return countUniqueMatches(predicted, expected, (candidate, goldItem) => (
      normalize(candidate?.text) === normalize(goldItem?.text)
    ));
  }

  function evaluateRelations(modelShadow, gold, aliasMap) {
    const predicted = safeArray(modelShadow?.relations);
    const expected = safeArray(gold?.relations);
    return countUniqueMatches(predicted, expected, (candidate, goldItem) => (
      String(candidate?.relation_type || "") === String(goldItem?.relation_type || "")
      && canonicalLabel(candidate?.from_label, aliasMap) === canonicalLabel(goldItem?.from_label, aliasMap)
      && canonicalLabel(candidate?.to_label, aliasMap) === canonicalLabel(goldItem?.to_label, aliasMap)
      && String(candidate?.epistemic_status || "") === String(goldItem?.epistemic_status || "")
    ));
  }

  function evidenceQuotes(item) {
    return safeArray(item?.evidence).map((entry) => String(entry?.quote || "")).filter(Boolean);
  }

  function interpretationMatches(candidate, goldItem) {
    const text = normalize(candidate?.text);
    if (!text || candidate?.kind !== "interpretation") return false;
    const required = safeArray(goldItem?.required_terms).map(normalize).filter(Boolean);
    const forbidden = safeArray(goldItem?.forbidden_terms).map(normalize).filter(Boolean);
    if (!required.every((term) => text.includes(term))) return false;
    if (forbidden.some((term) => text.includes(term))) return false;
    const requiredEvidence = safeArray(goldItem?.evidence_quotes).map(String).filter(Boolean);
    const candidateEvidence = evidenceQuotes(candidate);
    return requiredEvidence.every((quote) => candidateEvidence.includes(quote));
  }

  function evaluateInterpretations(modelShadow, gold) {
    const predicted = safeArray(modelShadow?.propositions).filter((item) => item?.kind === "interpretation");
    const expected = safeArray(gold?.interpretations);
    return countUniqueMatches(predicted, expected, interpretationMatches);
  }

  function macroF1(dimensions) {
    const values = Object.values(dimensions).map((item) => item?.f1).filter((value) => Number.isFinite(value));
    return values.length
      ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6))
      : null;
  }

  function evaluateGoldFixture(input = {}) {
    const fixture = input.gold_fixture && typeof input.gold_fixture === "object" ? input.gold_fixture : null;
    const modelShadow = input.model_shadow && typeof input.model_shadow === "object" ? input.model_shadow : null;
    const errors = [];
    if (!fixture) errors.push("gold_fixture_missing");
    if (!modelShadow) errors.push("model_shadow_missing");
    if (fixture && fixture.schema !== GOLD_SCHEMA) errors.push("gold_fixture_schema_invalid");
    if (fixture && !String(fixture.id || "").trim()) errors.push("gold_fixture_id_missing");
    if (fixture && !String(fixture.source_text || "")) errors.push("gold_fixture_source_missing");
    if (fixture && modelShadow && fixture.source_event_id && modelShadow.source_event_id
        && String(fixture.source_event_id) !== String(modelShadow.source_event_id)) {
      errors.push("source_event_id_mismatch");
    }

    if (errors.length) {
      return {
        schema: GOLD_EVALUATION_SCHEMA,
        version: 1,
        valid: false,
        errors,
        fixture_id: fixture?.id || null,
        dimensions: {},
        macro_f1: null,
        production_gate_authority: false
      };
    }

    const gold = fixture.gold || {};
    const aliasMap = buildCanonicalAliasMap(gold);
    const dimensions = {
      entities: evaluateEntities(modelShadow, gold),
      concepts: evaluateConcepts(modelShadow, gold),
      source_claims: evaluateSourceClaims(modelShadow, gold),
      relations: evaluateRelations(modelShadow, gold, aliasMap),
      interpretations: evaluateInterpretations(modelShadow, gold)
    };

    return {
      schema: GOLD_EVALUATION_SCHEMA,
      version: 1,
      valid: true,
      errors: [],
      fixture_id: fixture.id,
      dimensions,
      macro_f1: macroF1(dimensions),
      production_gate_authority: false,
      note: "gold_fixture_metrics_are_offline_qa_not_production_write_authority"
    };
  }

  const api = Object.freeze({
    GOLD_SCHEMA,
    GOLD_EVALUATION_SCHEMA,
    evaluateGoldFixture
  });
  global.AHASemanticGoldEvaluator = api;
  global.AHAModuleApi?.register?.("semanticGoldEvaluator", api, {
    version: 1,
    legacyGlobal: "AHASemanticGoldEvaluator",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
