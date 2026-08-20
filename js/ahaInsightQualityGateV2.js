// ahaInsightQualityGateV2.js
// Pure fail-closed quality gate for Interpretation / Insight Synthesis V2.
// It can approve candidates for shadow review only. It never writes to Chamber,
// canonical storage, Meta, persistence or visible product surfaces.

(function (global) {
  "use strict";

  const GATE_SCHEMA = "aha_insight_quality_gate_v2";
  const SYNTHESIS_SHADOW_SCHEMA = "aha_insight_synthesis_shadow_v2";
  const INSIGHT_TYPES = Object.freeze(["principle", "mechanism", "pattern", "tension", "consequence", "generalization"]);
  const STOPWORDS = new Set([
    "og", "i", "på", "til", "av", "for", "med", "som", "det", "den", "de", "et", "en", "er", "var", "ble", "blir",
    "kan", "kunne", "skal", "har", "hadde", "om", "at", "fra", "når", "etter", "før", "mellom", "samtidig", "også",
    "the", "a", "an", "and", "or", "of", "to", "in", "for", "with", "that", "this", "is", "are", "was", "were", "can"
  ]);
  const GENERIC_PATTERNS = [
    /^dette (er|viser|betyr) (viktig|interessant|betydningsfullt)/i,
    /ting henger sammen/i,
    /det er viktig å forstå/i,
    /kan ha betydning$/i,
    /^teksten (viser|sier|beskriver)/i
  ];
  // Causal language is intentionally broader than explicit-source causality.
  // In particular, not_causal candidates must not smuggle causality through
  // grammatical variants such as "førte det ... til" or "skapes".
  const CAUSAL_LANGUAGE = /(?:\b(?:fordi|forårsaker|forårsaket|fører til|førte til|gjør at|gjorde at|resulterer i|resulterte i|på grunn av|som følge av|derfor|drivkraft|omformer|reduserer behovet|introduserer kompleksitet|bidrar til|causes?|caused|leads? to|led to|results? in|because)\b|\bfør(?:er|te)[^.!?]{0,100}\btil\b|(?:^|[^\p{L}\p{N}_])(?:skaper|skapes|skapte|skapt|gir|ga|øker|økte|reduserer|reduserte|muliggjør|muliggjorde|kanaliserer|kanaliserte)(?![\p{L}\p{N}_]))/iu;
  // Conservative source-explicit markers. "kan flytte" is included because the
  // live constraints/creativity source states that relation literally. Generic
  // before/after wording remains excluded.
  const EXPLICIT_CAUSAL_SOURCE = /\b(fordi|forårsaker|forårsaket|fører til|førte til|gjør at|gjorde at|resulterer i|resulterte i|på grunn av|som følge av|derfor|kan\s+flytte|causes?|caused|leads? to|led to|results? in|because)\b/i;
  // Do not use ASCII-style \b around Norwegian words such as "årsak": in JavaScript
  // \b is based on ASCII \w semantics and can miss boundaries before letters like å.
  const ANTI_CAUSAL_SOURCE = /(?:peker\s+ikke\s+ut|fastslår\s+ikke|viser\s+ikke|identifiserer\s+ikke|kan\s+ikke\s+fastslå|uten\s+å\s+fastslå)[^.!?]{0,160}(?:årsak|årsaken|kausal|kausalitet|forårsaker)/i;

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

  function contentTokens(value) {
    return normalize(value).split(/\s+/).filter((token) => token.length > 2 && !STOPWORDS.has(token));
  }

  function jaccard(left, right) {
    const a = new Set(contentTokens(left));
    const b = new Set(contentTokens(right));
    if (!a.size || !b.size) return 0;
    let intersection = 0;
    a.forEach((token) => { if (b.has(token)) intersection += 1; });
    const union = new Set([...a, ...b]).size;
    return union ? intersection / union : 0;
  }

  function round(value) {
    return Number(Math.max(0, Math.min(1, value)).toFixed(6));
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
      spans.push({ text, start: match.index + Math.max(0, leading), end: match.index + Math.max(0, leading) + text.length });
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
      let start = 0;
      while (start <= source.length - quote.length) {
        const offset = source.indexOf(quote, start);
        if (offset < 0) break;
        const end = offset + quote.length;
        const sentenceIndex = sentences.findIndex((sentence) => offset >= sentence.start && end <= sentence.end);
        if (sentenceIndex >= 0) indexes.add(sentenceIndex);
        start = offset + Math.max(1, quote.length);
      }
    });
    return indexes;
  }

  function isGeneric(value) {
    const text = String(value || "").trim();
    return GENERIC_PATTERNS.some((pattern) => pattern.test(text));
  }

  function maximumSentenceSimilarity(sourceText, insight) {
    const sentences = sourceSentences(sourceText);
    return sentences.reduce((best, sentence) => Math.max(best, jaccard(insight, sentence.text)), 0);
  }

  function evidenceGroundingScore(candidate) {
    const insightTokens = new Set(contentTokens(candidate?.insight));
    const evidenceTokens = new Set(safeArray(candidate?.evidence).flatMap((item) => contentTokens(item?.quote)));
    if (!insightTokens.size || !evidenceTokens.size) return 0;
    let overlap = 0;
    insightTokens.forEach((token) => { if (evidenceTokens.has(token)) overlap += 1; });
    return round(overlap / insightTokens.size);
  }

  function evaluateCandidate(candidate, sourceText, index) {
    const source = String(sourceText || "");
    const reasons = [];
    const insight = String(candidate?.insight || "").trim();
    const abstraction = String(candidate?.abstraction || "").trim();
    const why = String(candidate?.why_it_matters || "").trim();
    const uncertainty = String(candidate?.uncertainty || "").trim();
    const type = String(candidate?.type || "");
    const confidence = String(candidate?.confidence || "");
    const causalStatus = String(candidate?.causal_status || "");
    const evidence = safeArray(candidate?.evidence);

    if (!insight) reasons.push("insight_missing");
    if (!INSIGHT_TYPES.includes(type)) reasons.push("insight_type_invalid");
    if (!abstraction) reasons.push("abstraction_missing");
    if (!why) reasons.push("why_it_matters_missing");
    if (!["high", "medium", "low"].includes(confidence)) reasons.push("confidence_invalid");
    if (!["not_causal", "source_explicit", "interpretive"].includes(causalStatus)) reasons.push("causal_status_invalid");

    const insightTokenCount = contentTokens(insight).length;
    if (insightTokenCount < 7) reasons.push("insight_too_thin");
    if (isGeneric(insight)) reasons.push("insight_generic");
    if (isGeneric(why) || contentTokens(why).length < 5) reasons.push("why_it_matters_weak");
    if (contentTokens(abstraction).length < 5) reasons.push("abstraction_too_thin");
    if (source.includes(insight)) reasons.push("insight_literal_source");
    if (source.includes(abstraction)) reasons.push("abstraction_literal_source");

    if (evidence.length < 2 || evidence.length > 3) reasons.push("evidence_count_invalid");
    const uniqueQuotes = new Set();
    evidence.forEach((item, evidenceIndex) => {
      const quote = String(item?.quote || "");
      if (!quote || !source.includes(quote)) reasons.push(`evidence_not_exact:${evidenceIndex}`);
      const key = normalize(quote);
      if (key && uniqueQuotes.has(key)) reasons.push(`evidence_duplicate:${evidenceIndex}`);
      if (key) uniqueQuotes.add(key);
      if (!["supports", "limits"].includes(String(item?.role || ""))) reasons.push(`evidence_role_invalid:${evidenceIndex}`);
      if (normalize(insight) === key) reasons.push(`insight_equals_evidence:${evidenceIndex}`);
    });

    const evidenceSentenceCount = evidenceSentenceIndexes(source, evidence).size;
    if (evidence.length >= 2 && evidenceSentenceCount < 2) reasons.push("evidence_not_cross_claim");

    const sourceSimilarity = maximumSentenceSimilarity(source, insight);
    const semanticTransformScore = round(1 - sourceSimilarity);
    if (sourceSimilarity >= 0.72) reasons.push("source_near_paraphrase");

    const groundingScore = evidenceGroundingScore(candidate);
    if (groundingScore < 0.08) reasons.push("evidence_semantic_disconnect");

    const usesCausalLanguage = CAUSAL_LANGUAGE.test(insight);
    const evidenceHasExplicitCausality = evidence.some((item) => EXPLICIT_CAUSAL_SOURCE.test(String(item?.quote || "")));
    const sourceRejectsSimpleCausality = ANTI_CAUSAL_SOURCE.test(source);
    if (sourceRejectsSimpleCausality && (causalStatus !== "not_causal" || usesCausalLanguage)) {
      reasons.push("causality_contradicted_by_source");
    }
    if (usesCausalLanguage && causalStatus === "not_causal") reasons.push("causal_language_status_mismatch");
    if (causalStatus === "source_explicit" && !evidenceHasExplicitCausality) reasons.push("causality_not_source_explicit");
    if (causalStatus === "interpretive") {
      if (!uncertainty) reasons.push("interpretive_causality_requires_uncertainty");
      if (confidence === "high") reasons.push("interpretive_causality_overconfident");
    }

    const abstractionScore = round(Math.min(1, contentTokens(abstraction).length / 12));
    const usefulnessScore = round(Math.min(1, contentTokens(why).length / 12));
    const evidenceDiversityScore = round(Math.min(1, evidenceSentenceCount / 2));
    const causalDisciplineScore = reasons.some((reason) => reason.includes("causal") || reason.includes("causality")) ? 0 : 1;
    const qualityScore = round(
      semanticTransformScore * 0.30
      + groundingScore * 0.20
      + evidenceDiversityScore * 0.20
      + abstractionScore * 0.12
      + usefulnessScore * 0.08
      + causalDisciplineScore * 0.10
    );
    if (qualityScore < 0.55) reasons.push("quality_score_below_threshold");

    return {
      candidate_index: index,
      type,
      confidence,
      causal_status: causalStatus,
      eligible_for_insight_review: reasons.length === 0,
      blocking_reasons: reasons,
      metrics: {
        quality_score: qualityScore,
        semantic_transform_score: semanticTransformScore,
        max_source_sentence_similarity: round(sourceSimilarity),
        evidence_grounding_score: groundingScore,
        evidence_sentence_count: evidenceSentenceCount,
        abstraction_score: abstractionScore,
        usefulness_score: usefulnessScore,
        causal_discipline_score: causalDisciplineScore,
        evidence_has_explicit_causality: evidenceHasExplicitCausality,
        source_rejects_simple_causality: sourceRejectsSimpleCausality
      }
    };
  }

  function evaluateSynthesisShadow(input = {}) {
    const sourceText = String(input.source_text || "");
    const shadow = input.synthesis_shadow && typeof input.synthesis_shadow === "object" ? input.synthesis_shadow : null;
    const inputErrors = [];
    if (!sourceText) inputErrors.push("source_text_missing");
    if (!shadow) inputErrors.push("synthesis_shadow_missing");
    if (shadow && shadow.schema !== SYNTHESIS_SHADOW_SCHEMA) inputErrors.push("synthesis_shadow_schema_invalid");
    if (shadow?.policy) {
      if (shadow.policy.production_gate_authority !== false) inputErrors.push("production_gate_authority_not_false");
      if (shadow.policy.synthesis_allowed !== false) inputErrors.push("synthesis_allowed_not_false");
      if (shadow.policy.canonical_write !== false) inputErrors.push("canonical_write_not_false");
      if (shadow.policy.chamber_write !== false) inputErrors.push("chamber_write_not_false");
      if (shadow.policy.meta_write !== false) inputErrors.push("meta_write_not_false");
      if (shadow.policy.persistent_write !== false) inputErrors.push("persistent_write_not_false");
    }

    const decisions = shadow && !inputErrors.length
      ? safeArray(shadow.candidates).map((candidate, index) => evaluateCandidate(candidate, sourceText, index))
      : [];
    const eligible = decisions.filter((item) => item.eligible_for_insight_review);
    const averageQuality = decisions.length
      ? round(decisions.reduce((sum, item) => sum + item.metrics.quality_score, 0) / decisions.length)
      : null;

    return clone({
      schema: GATE_SCHEMA,
      version: 2,
      mode: "shadow",
      valid: inputErrors.length === 0,
      input_errors: inputErrors,
      source_event_id: shadow?.source_event_id || null,
      source_text_hash: shadow?.source_text_hash || null,
      candidate_count: decisions.length,
      eligible_count: eligible.length,
      rejected_count: decisions.length - eligible.length,
      average_quality_score: averageQuality,
      decisions,
      gate: {
        authoritative: false,
        live_gold_required: true,
        insight_review_available: inputErrors.length === 0 && eligible.length > 0,
        production_gate_authority: false,
        synthesis_allowed: false,
        canonical_write: false,
        chamber_write: false,
        meta_write: false,
        persistent_write: false,
        blocking_reasons: ["shadow_gate_not_authoritative", "live_gold_evaluation_required"]
      }
    });
  }

  const api = Object.freeze({
    GATE_SCHEMA,
    SYNTHESIS_SHADOW_SCHEMA,
    INSIGHT_TYPES,
    evaluateCandidate,
    evaluateSynthesisShadow
  });
  global.AHAInsightQualityGateV2 = api;
  global.AHAModuleApi?.register?.("insightQualityGateV2", api, {
    version: 2,
    legacyGlobal: "AHAInsightQualityGateV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
