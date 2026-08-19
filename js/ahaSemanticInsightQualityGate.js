// ahaSemanticInsightQualityGate.js
// Pure, shadow-only evaluator for model-assisted SemanticDocument output.
// V1 can mark interpretations eligible for synthesis review, but never opens
// canonical synthesis/write permission.

(function (global) {
  "use strict";

  const EVALUATION_SCHEMA = "aha_semantic_evaluation_v1";
  const GATE_SCHEMA = "aha_synthesized_insight_quality_gate_v1";
  const MODEL_SHADOW_SCHEMA = "aha_semantic_model_shadow_v1";
  const HIGH_CONFIDENCE = "high";

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function ratio(numerator, denominator) {
    return denominator > 0 ? Number((numerator / denominator).toFixed(6)) : null;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function collectEvidenceBindings(modelShadow) {
    const bindings = [];
    const pushSpan = (span, meta) => bindings.push({ span, meta });
    const pushEvidence = (evidence, meta) => {
      safeArray(evidence).forEach((item, evidenceIndex) => {
        safeArray(item?.spans).forEach((span, spanIndex) => {
          pushSpan(span, Object.assign({}, meta, {
            binding_kind: "evidence_quote",
            evidence_index: evidenceIndex,
            span_index: spanIndex,
            expected_text: String(item?.quote || "")
          }));
        });
      });
    };

    safeArray(modelShadow?.entities).forEach((item, itemIndex) => {
      safeArray(item?.source_surface_spans).forEach((span, spanIndex) => {
        pushSpan(span, {
          item_type: "entity",
          item_index: itemIndex,
          binding_kind: "source_surface",
          span_index: spanIndex,
          expected_text: String(item?.source_surface || "")
        });
      });
      pushEvidence(item?.evidence, { item_type: "entity", item_index: itemIndex });
    });

    safeArray(modelShadow?.concepts).forEach((item, itemIndex) => {
      safeArray(item?.source_surface_spans).forEach((span, spanIndex) => {
        pushSpan(span, {
          item_type: "concept",
          item_index: itemIndex,
          binding_kind: "source_surface",
          span_index: spanIndex,
          expected_text: String(item?.source_surface || "")
        });
      });
      pushEvidence(item?.evidence, { item_type: "concept", item_index: itemIndex });
    });

    safeArray(modelShadow?.propositions).forEach((item, itemIndex) => {
      safeArray(item?.source_claim_spans).forEach((span, spanIndex) => {
        pushSpan(span, {
          item_type: "proposition",
          item_index: itemIndex,
          binding_kind: "source_claim",
          span_index: spanIndex,
          expected_text: String(item?.text || "")
        });
      });
      pushEvidence(item?.evidence, { item_type: "proposition", item_index: itemIndex });
    });

    safeArray(modelShadow?.relations).forEach((item, itemIndex) => {
      pushEvidence(item?.evidence, { item_type: "relation", item_index: itemIndex });
    });

    safeArray(modelShadow?.unresolved_inferences).forEach((item, itemIndex) => {
      pushEvidence(item?.evidence, { item_type: "unresolved_inference", item_index: itemIndex });
    });

    return bindings;
  }

  function validateBinding(binding, sourceText, anchorMap) {
    const source = String(sourceText || "");
    const span = binding?.span;
    const reasons = [];
    if (!span || typeof span !== "object") return { ok: false, reasons: ["span_not_object"] };
    if (!Number.isInteger(span.start_offset) || !Number.isInteger(span.end_offset)) {
      reasons.push("span_offsets_invalid");
      return { ok: false, reasons };
    }
    if (span.start_offset < 0 || span.end_offset <= span.start_offset || span.end_offset > source.length) {
      reasons.push("span_out_of_bounds");
      return { ok: false, reasons };
    }
    const sliced = source.slice(span.start_offset, span.end_offset);
    if (sliced !== span.text) reasons.push("span_not_exact_source_slice");
    const expected = String(binding?.meta?.expected_text || "");
    if (expected && span.text !== expected) reasons.push("span_not_expected_binding_text");
    const anchor = anchorMap.get(String(span.anchor_id || ""));
    if (!anchor) reasons.push("span_anchor_unknown");
    else if (span.start_offset < anchor.start_offset || span.end_offset > anchor.end_offset) {
      reasons.push("span_outside_anchor");
    }
    return { ok: reasons.length === 0, reasons };
  }

  function propositionEvidenceExact(modelShadow, propositionIndex, bindingResults) {
    const proposition = safeArray(modelShadow?.propositions)[propositionIndex];
    if (!proposition) return false;
    const relevant = bindingResults.filter((entry) => (
      entry.binding?.meta?.item_type === "proposition"
      && entry.binding?.meta?.item_index === propositionIndex
      && entry.binding?.meta?.binding_kind === "evidence_quote"
    ));
    return relevant.length > 0 && relevant.every((entry) => entry.validation.ok);
  }

  function buildPropositionDecisions(modelShadow, sourceText, bindingResults) {
    const source = String(sourceText || "");
    return safeArray(modelShadow?.propositions).map((proposition, index) => {
      const reasons = [];
      const kind = String(proposition?.kind || "");
      const confidence = String(proposition?.confidence || "");
      const evidenceExact = propositionEvidenceExact(modelShadow, index, bindingResults);

      if (kind === "source_claim") {
        reasons.push("source_claim_is_evidence_not_synthesis");
      } else if (kind === "inference") {
        reasons.push("inference_not_allowed_v1");
      } else if (kind !== "interpretation") {
        reasons.push("unsupported_proposition_kind");
      }

      if (kind === "interpretation") {
        if (confidence !== HIGH_CONFIDENCE) reasons.push("confidence_below_high");
        if (!evidenceExact) reasons.push("evidence_not_exact");
        if (!String(proposition?.text || "").trim()) reasons.push("interpretation_text_missing");
        if (String(proposition?.text || "").trim() && source.includes(String(proposition.text))) {
          reasons.push("interpretation_is_literal_source");
        }
      }

      return {
        proposition_index: index,
        kind,
        confidence,
        evidence_exact: evidenceExact,
        eligible_for_synthesis_review: reasons.length === 0,
        blocking_reasons: reasons
      };
    });
  }

  function relationEpistemicCounts(modelShadow) {
    const counts = { source_explicit: 0, interpretation: 0, inference: 0, unknown: 0 };
    safeArray(modelShadow?.relations).forEach((relation) => {
      const key = String(relation?.epistemic_status || "");
      if (Object.prototype.hasOwnProperty.call(counts, key)) counts[key] += 1;
      else counts.unknown += 1;
    });
    return counts;
  }

  function evaluateSemanticShadow(input = {}) {
    const sourceText = String(input.source_text || "");
    const deterministic = input.deterministic_document && typeof input.deterministic_document === "object"
      ? input.deterministic_document
      : null;
    const modelShadow = input.model_shadow && typeof input.model_shadow === "object"
      ? input.model_shadow
      : null;
    const inputErrors = [];

    if (!sourceText) inputErrors.push("source_text_missing");
    if (!deterministic) inputErrors.push("deterministic_document_missing");
    if (!modelShadow) inputErrors.push("model_shadow_missing");
    if (modelShadow && modelShadow.schema !== MODEL_SHADOW_SCHEMA) inputErrors.push("model_shadow_schema_invalid");
    if (deterministic && modelShadow) {
      if (String(deterministic.source_event_id || "") !== String(modelShadow.source_event_id || "")) {
        inputErrors.push("source_event_id_mismatch");
      }
      if (String(deterministic.source_text_hash || "") !== String(modelShadow.source_text_hash || "")) {
        inputErrors.push("source_text_hash_mismatch");
      }
    }

    const policy = modelShadow?.policy || {};
    if (modelShadow) {
      if (policy.canonical_write !== false) inputErrors.push("model_shadow_canonical_write_not_false");
      if (policy.persistent_write !== false) inputErrors.push("model_shadow_persistent_write_not_false");
      if (policy.meta_write !== false) inputErrors.push("model_shadow_meta_write_not_false");
      if (policy.visible_output_changed !== false) inputErrors.push("model_shadow_visible_output_not_false");
      if (policy.synthesis_allowed !== false) inputErrors.push("model_shadow_synthesis_not_false");
      if (policy.source_text_stored !== false) inputErrors.push("model_shadow_source_text_stored_not_false");
    }

    const anchorMap = new Map(safeArray(deterministic?.evidence_anchors).map((anchor) => [String(anchor?.id || ""), anchor]));
    safeArray(deterministic?.evidence_anchors).forEach((anchor, index) => {
      if (!anchor || typeof anchor !== "object") {
        inputErrors.push(`deterministic_anchor_invalid:${index}`);
        return;
      }
      if (!Number.isInteger(anchor.start_offset) || !Number.isInteger(anchor.end_offset)) {
        inputErrors.push(`deterministic_anchor_offsets_invalid:${index}`);
        return;
      }
      if (anchor.start_offset < 0 || anchor.end_offset <= anchor.start_offset || anchor.end_offset > sourceText.length) {
        inputErrors.push(`deterministic_anchor_out_of_bounds:${index}`);
        return;
      }
      if (sourceText.slice(anchor.start_offset, anchor.end_offset) !== anchor.text) {
        inputErrors.push(`deterministic_anchor_not_exact:${index}`);
      }
    });

    const bindings = modelShadow ? collectEvidenceBindings(modelShadow) : [];
    const bindingResults = bindings.map((binding) => ({
      binding,
      validation: validateBinding(binding, sourceText, anchorMap)
    }));
    const exactBindingCount = bindingResults.filter((entry) => entry.validation.ok).length;
    const invalidBindingCount = bindingResults.length - exactBindingCount;
    const uniqueEvidenceAnchors = new Set(bindingResults
      .filter((entry) => entry.validation.ok)
      .map((entry) => String(entry.binding?.span?.anchor_id || ""))
      .filter(Boolean));

    const comparison = modelShadow?.comparison || {};
    const modelCounts = comparison.model || {};
    const entityCount = Number(modelCounts.entity_count ?? safeArray(modelShadow?.entities).length) || 0;
    const conceptCount = Number(modelCounts.concept_count ?? safeArray(modelShadow?.concepts).length) || 0;
    const sourceClaimCount = safeArray(modelShadow?.propositions).filter((item) => item?.kind === "source_claim").length;
    const relationCounts = relationEpistemicCounts(modelShadow);
    const propositionDecisions = modelShadow
      ? buildPropositionDecisions(modelShadow, sourceText, bindingResults)
      : [];
    const eligibleCount = propositionDecisions.filter((item) => item.eligible_for_synthesis_review).length;

    const gateBlockingReasons = [
      "shadow_gate_not_authoritative",
      "gold_evaluation_required"
    ];
    if (inputErrors.length) gateBlockingReasons.push("evaluation_input_invalid");
    if (invalidBindingCount > 0) gateBlockingReasons.push("evidence_fidelity_below_one");

    const evaluationValid = inputErrors.length === 0 && invalidBindingCount === 0;
    const evaluation = {
      schema: EVALUATION_SCHEMA,
      version: 1,
      mode: "shadow",
      source_event_id: modelShadow?.source_event_id || deterministic?.source_event_id || null,
      source_text_hash: modelShadow?.source_text_hash || deterministic?.source_text_hash || null,
      valid: evaluationValid,
      input_errors: inputErrors,
      metrics: {
        evidence_binding_total: bindingResults.length,
        evidence_binding_exact: exactBindingCount,
        evidence_binding_invalid: invalidBindingCount,
        evidence_fidelity_rate: ratio(exactBindingCount, bindingResults.length),
        evidence_anchor_coverage_rate: ratio(uniqueEvidenceAnchors.size, anchorMap.size),
        entity_agreement_rate: ratio(Number(comparison.entity_overlap_count || 0), entityCount),
        concept_agreement_rate: ratio(Number(comparison.concept_overlap_count || 0), conceptCount),
        source_claim_agreement_rate: ratio(Number(comparison.source_claim_overlap_count || 0), sourceClaimCount),
        interpretation_count: safeArray(modelShadow?.propositions).filter((item) => item?.kind === "interpretation").length,
        inference_count: safeArray(modelShadow?.propositions).filter((item) => item?.kind === "inference").length,
        unresolved_inference_count: safeArray(modelShadow?.unresolved_inferences).length,
        relation_epistemic_counts: relationCounts,
        synthesis_review_eligible_count: eligibleCount,
        synthesis_review_blocked_count: propositionDecisions.length - eligibleCount
      },
      proposition_decisions: propositionDecisions,
      gate: {
        schema: GATE_SCHEMA,
        version: 1,
        authoritative: false,
        gold_evaluation_required: true,
        synthesis_review_available: evaluationValid && eligibleCount > 0,
        synthesis_allowed: false,
        canonical_write: false,
        meta_write: false,
        persistent_write: false,
        blocking_reasons: gateBlockingReasons
      }
    };

    return clone(evaluation);
  }

  const publicApi = Object.freeze({
    EVALUATION_SCHEMA,
    GATE_SCHEMA,
    evaluateSemanticShadow
  });
  global.AHASemanticInsightQualityGate = publicApi;
  global.AHAModuleApi?.register?.("semanticInsightQualityGate", publicApi, {
    version: 1,
    legacyGlobal: "AHASemanticInsightQualityGate",
    exports: Object.keys(publicApi)
  });
})(typeof window !== "undefined" ? window : globalThis);
