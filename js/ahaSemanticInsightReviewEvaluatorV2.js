// ahaSemanticInsightReviewEvaluatorV2.js
// Deterministic semantic review evaluator for comparing V1 interpretations and
// V2 synthesized Insight candidates under the SAME review contract.
// This does not replace or mutate AHASemanticGoldEvaluator V1.

(function (global) {
  "use strict";

  const SCHEMA = "aha_semantic_insight_review_evaluator_v2";
  const SPEC_SCHEMA = "aha_semantic_insight_review_gold_v2";

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function round(value) {
    return value == null ? null : Number(value.toFixed(6));
  }

  function metric(tp, predicted, expected) {
    const precision = predicted > 0 ? tp / predicted : (expected > 0 ? 0 : null);
    const recall = expected > 0 ? tp / expected : null;
    const f1 = precision != null && recall != null && precision + recall > 0
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

  function sourceSentences(sourceText) {
    const source = String(sourceText || "");
    const spans = [];
    const re = /[^.!?]+(?:[.!?]+|$)/g;
    let match;
    while ((match = re.exec(source))) {
      const text = match[0].trim();
      if (!text) continue;
      const leading = match[0].indexOf(text);
      spans.push({
        index: spans.length,
        text,
        start: match.index + Math.max(0, leading),
        end: match.index + Math.max(0, leading) + text.length
      });
    }
    return spans;
  }

  function evidenceSentenceIndexes(sourceText, evidence) {
    const source = String(sourceText || "");
    const sentences = sourceSentences(source);
    const indexes = new Set();
    safeArray(evidence).forEach((item) => {
      const quote = String(item?.quote || "");
      if (!quote) return;
      let offset = 0;
      while (offset <= source.length - quote.length) {
        const start = source.indexOf(quote, offset);
        if (start < 0) break;
        const end = start + quote.length;
        const sentence = sentences.find((entry) => start >= entry.start && end <= entry.end);
        if (sentence) indexes.add(sentence.index);
        offset = start + Math.max(1, quote.length);
      }
    });
    return indexes;
  }

  function candidateReviewText(candidate) {
    // Evidence and why_it_matters are intentionally excluded. Meaning must be
    // present in the candidate's own synthesized understanding, not borrowed
    // from source quotes or downstream usefulness prose.
    return normalize([
      candidate?.insight || candidate?.text || "",
      candidate?.abstraction || "",
      candidate?.uncertainty || ""
    ].join(" "));
  }

  function groupMatches(text, group) {
    return safeArray(group?.aliases).some((alias) => {
      const normalized = normalize(alias);
      return normalized && text.includes(normalized);
    });
  }

  function evidenceRequirementMatches(evidence, required) {
    const needle = String(required || "");
    if (!needle) return true;
    return safeArray(evidence).some((item) => {
      const quote = String(item?.quote || "");
      return quote.includes(needle) || needle.includes(quote);
    });
  }

  function evaluateCandidate(candidate, sourceText, reviewCase, index = 0) {
    const text = candidateReviewText(candidate);
    const evidence = safeArray(candidate?.evidence);
    const meaningGroups = safeArray(reviewCase?.required_meaning_groups);
    const meaning = meaningGroups.map((group) => ({
      id: String(group?.id || ""),
      matched: groupMatches(text, group),
      aliases: clone(group?.aliases || [])
    }));
    const missingMeaningGroups = meaning.filter((item) => !item.matched).map((item) => item.id);

    const forbiddenHits = safeArray(reviewCase?.forbidden_meanings)
      .map((item) => String(item || ""))
      .filter((item) => normalize(item) && text.includes(normalize(item)));

    const evidenceRequirements = safeArray(reviewCase?.required_evidence_substrings).map((required) => ({
      required: String(required),
      matched: evidenceRequirementMatches(evidence, required)
    }));
    const missingEvidence = evidenceRequirements.filter((item) => !item.matched).map((item) => item.required);
    const sentenceCount = evidenceSentenceIndexes(sourceText, evidence).size;
    const minimumSentences = Math.max(1, Number(reviewCase?.min_evidence_sentences || 1));

    const reasons = [];
    if (!text) reasons.push("review_text_missing");
    missingMeaningGroups.forEach((id) => reasons.push(`meaning_group_missing:${id}`));
    missingEvidence.forEach((required) => reasons.push(`evidence_requirement_missing:${required}`));
    if (sentenceCount < minimumSentences) reasons.push(`evidence_sentence_count_below:${minimumSentences}`);
    forbiddenHits.forEach((hit) => reasons.push(`forbidden_meaning:${hit}`));

    return {
      candidate_index: index,
      matched: reasons.length === 0,
      reasons,
      meaning_groups: meaning,
      evidence_requirements: evidenceRequirements,
      evidence_sentence_count: sentenceCount,
      minimum_evidence_sentences: minimumSentences,
      review_text: text
    };
  }

  function adaptV1Interpretations(fixture) {
    return safeArray(fixture?.model_shadow?.propositions)
      .filter((item) => item?.kind === "interpretation")
      .map((item) => ({
        insight: String(item?.text || ""),
        abstraction: "",
        uncertainty: "",
        evidence: safeArray(item?.evidence).map((entry) => ({ quote: String(entry?.quote || ""), role: "supports" })),
        source_layer: "semantic_model_v1"
      }));
  }

  function adaptV2Candidates(liveCase) {
    const decisions = safeArray(liveCase?.gate_decisions);
    const eligible = new Set(decisions.filter((item) => item?.eligible_for_insight_review === true).map((item) => Number(item.candidate_index)));
    return safeArray(liveCase?.candidates)
      .map((candidate, index) => ({ ...clone(candidate), _candidate_index: index }))
      .filter((candidate) => eligible.has(Number(candidate._candidate_index)))
      .map((candidate) => {
        delete candidate._candidate_index;
        candidate.source_layer = "insight_synthesis_v2";
        return candidate;
      });
  }

  function evaluateCase({ sourceText, reviewCase, candidates } = {}) {
    const expected = Number(reviewCase?.expected_insight_count || 1);
    const decisions = safeArray(candidates).map((candidate, index) => evaluateCandidate(candidate, sourceText, reviewCase, index));
    // One gold Insight per current live-reviewed case. Greedy one-to-one matching
    // is deterministic and prevents multiple paraphrases from inflating TP.
    const tp = Math.min(expected, decisions.filter((item) => item.matched).length);
    return {
      fixture_id: String(reviewCase?.fixture_id || ""),
      decisions,
      metrics: metric(tp, decisions.length, expected)
    };
  }

  function evaluateCorpus({ spec, v1Fixtures = [], v2Snapshot = null } = {}) {
    const errors = [];
    if (!spec || spec.schema !== SPEC_SCHEMA) errors.push("review_spec_invalid");
    const specCases = safeArray(spec?.cases);
    const v1ById = new Map(safeArray(v1Fixtures).map((fixture) => [String(fixture?.id || fixture?.source_event_id || ""), fixture]));
    const v2ById = new Map(safeArray(v2Snapshot?.cases).map((item) => [String(item?.fixture_id || ""), item]));
    const v1Results = [];
    const v2Results = [];

    specCases.forEach((reviewCase) => {
      const id = String(reviewCase?.fixture_id || "");
      const fixture = v1ById.get(id);
      if (!fixture) {
        errors.push(`v1_fixture_missing:${id}`);
        return;
      }
      const sourceText = String(fixture?.source_text || "");
      v1Results.push(evaluateCase({ sourceText, reviewCase, candidates: adaptV1Interpretations(fixture) }));
      const liveCase = v2ById.get(id);
      if (!liveCase) {
        errors.push(`v2_case_missing:${id}`);
        return;
      }
      v2Results.push(evaluateCase({ sourceText, reviewCase, candidates: adaptV2Candidates(liveCase) }));
    });

    function aggregate(results) {
      const totals = results.reduce((sum, item) => {
        sum.tp += Number(item?.metrics?.true_positive || 0);
        sum.predicted += Number(item?.metrics?.predicted || 0);
        sum.expected += Number(item?.metrics?.expected || 0);
        return sum;
      }, { tp: 0, predicted: 0, expected: 0 });
      return metric(totals.tp, totals.predicted, totals.expected);
    }

    return clone({
      schema: SCHEMA,
      valid: errors.length === 0,
      errors,
      case_count: specCases.length,
      v1: { metrics: aggregate(v1Results), cases: v1Results },
      v2: { metrics: aggregate(v2Results), cases: v2Results },
      policy: {
        replaces_v1_gold_evaluator: false,
        canonical_write: false,
        chamber_write: false,
        meta_write: false,
        persistent_write: false,
        production_gate_authority: false
      }
    });
  }

  const api = Object.freeze({
    SCHEMA,
    SPEC_SCHEMA,
    normalize,
    sourceSentences,
    evaluateCandidate,
    adaptV1Interpretations,
    adaptV2Candidates,
    evaluateCase,
    evaluateCorpus
  });

  global.AHASemanticInsightReviewEvaluatorV2 = api;
  global.AHAModuleApi?.register?.("semanticInsightReviewEvaluatorV2", api, {
    version: 2,
    legacyGlobal: "AHASemanticInsightReviewEvaluatorV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
