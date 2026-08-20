// ahaInsightSynthesisRuntimeV2.js
// Memory-only browser runtime: validated semantic model shadow -> dedicated
// Interpretation / Insight Synthesis V2 -> Insight Quality Gate V2.
// No canonical, Chamber, Meta, persistent or visible writes.

(function (global) {
  "use strict";

  const SHADOW_SCHEMA = "aha_insight_synthesis_shadow_v2";
  const ENDPOINT_SCHEMA = "aha_insight_synthesis_contract_v2";
  const OUTPUT_SCHEMA = "aha_insight_synthesis_output_v2";
  const MODEL_EVENT_NAME = "aha:semantic-model-shadow";
  const SYNTHESIS_EVENT_NAME = "aha:insight-synthesis-shadow";
  const GATE_EVENT_NAME = "aha:insight-quality-v2-shadow";

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function create(deps = {}) {
    const {
      getSourcesApi = () => global.AHAModuleApi?.resolve?.("sources", "AHASources", { version: 1 }) || global.AHASources || null,
      getSemanticDocumentApi = () => global.AHAModuleApi?.resolve?.("semanticDocument", "AHASemanticDocument", { version: 1 }) || global.AHASemanticDocument || null,
      getModelShadowRuntime = () => global.AHASemanticModelShadowRuntime || null,
      getQualityGateApi = () => global.AHAModuleApi?.resolve?.("insightQualityGateV2", "AHAInsightQualityGateV2", { version: 2 }) || global.AHAInsightQualityGateV2 || null,
      getAgentUrl = (path) => {
        try { return global.AHAChatInsightPipeline?.create?.({})?.buildAhaAgentUrl?.(path) || ""; }
        catch { return ""; }
      },
      fetchImpl = (...args) => global.fetch(...args),
      isEnabled: isEnabledOverride,
      addEventListener = (...args) => global.addEventListener?.(...args),
      removeEventListener = (...args) => global.removeEventListener?.(...args),
      dispatchEvent = (...args) => global.dispatchEvent?.(...args),
      CustomEventImpl = global.CustomEvent
    } = deps;

    let bound = false;
    let requestSequence = 0;
    let lastSynthesisShadow = null;
    let lastGateEvaluation = null;

    function isEnabled() {
      if (typeof isEnabledOverride === "function") return isEnabledOverride() === true;
      if (global.AHA_INSIGHT_SYNTHESIS_V2_SHADOW === true) return true;
      const search = String(global.location?.search || "");
      try {
        const Params = global.URLSearchParams || (typeof URLSearchParams !== "undefined" ? URLSearchParams : null);
        if (Params && new Params(search).get("ahaInsightSynthesisV2") === "1") return true;
      } catch {}
      return /(?:^|[?&])ahaInsightSynthesisV2=1(?:&|$)/.test(search);
    }

    function findSourceEvent(sourceEventId) {
      const events = getSourcesApi()?.loadSourceEvents?.();
      if (!Array.isArray(events)) return null;
      return events.find((event) => String(event?.id || "") === String(sourceEventId || "")) || null;
    }

    function uniqueBy(items, keyFn) {
      const seen = new Set();
      return safeArray(items).filter((item) => {
        const key = String(keyFn(item) || "").trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    function buildSemanticContext(modelShadow) {
      const entities = uniqueBy(modelShadow?.entities, (item) => item?.canonical_label || item?.source_surface)
        .slice(0, 16)
        .map((item) => ({
          label: String(item?.canonical_label || item?.source_surface || "").trim(),
          entity_type: String(item?.entity_type || "other").trim() || "other"
        }));
      const concepts = uniqueBy(modelShadow?.concepts, (item) => item?.canonical_label || item?.source_surface)
        .slice(0, 20)
        .map((item) => ({ label: String(item?.canonical_label || item?.source_surface || "").trim() }));
      const sourceClaims = uniqueBy(
        safeArray(modelShadow?.propositions).filter((item) => item?.kind === "source_claim"),
        (item) => item?.text
      ).slice(0, 16).map((item) => ({ text: String(item?.text || "") }));
      const relations = safeArray(modelShadow?.relations)
        .filter((item) => item?.epistemic_status === "source_explicit")
        .slice(0, 20)
        .map((item) => ({
          relation_type: String(item?.relation_type || "other"),
          from_label: String(item?.from_label || ""),
          to_label: String(item?.to_label || ""),
          epistemic_status: "source_explicit"
        }));
      return { entities, concepts, source_claims: sourceClaims, relations };
    }

    function validateEndpointEnvelope(envelope) {
      if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return false;
      if (envelope.ok !== true || envelope.schema !== ENDPOINT_SCHEMA) return false;
      if (!envelope.synthesis || envelope.synthesis.schema !== OUTPUT_SCHEMA) return false;
      const policy = envelope.policy;
      if (!policy || typeof policy !== "object") return false;
      if (policy.source_text_returned !== false) return false;
      if (policy.raw_model_output_returned !== false) return false;
      if (policy.shadow_synthesis_generated !== true) return false;
      if (policy.production_gate_authority !== false) return false;
      if (policy.synthesis_allowed !== false) return false;
      if (policy.canonical_write !== false) return false;
      if (policy.chamber_write !== false) return false;
      if (policy.persistent_write !== false) return false;
      if (policy.meta_write !== false) return false;
      if (Object.prototype.hasOwnProperty.call(envelope, "source_text")) return false;
      if (Object.prototype.hasOwnProperty.call(envelope, "raw_model_output")) return false;
      return true;
    }

    function findExactSpans(sourceText, quote, anchors) {
      const source = String(sourceText || "");
      const needle = String(quote || "");
      if (!source || !needle) return [];
      const spans = [];
      let offset = 0;
      while (offset <= source.length - needle.length) {
        const index = source.indexOf(needle, offset);
        if (index < 0) break;
        const end = index + needle.length;
        const anchor = safeArray(anchors).find((item) => index >= item.start_offset && end <= item.end_offset);
        if (anchor) spans.push({ anchor_id: anchor.id, start_offset: index, end_offset: end, text: source.slice(index, end) });
        offset = index + Math.max(1, needle.length);
      }
      return spans;
    }

    function buildSynthesisShadow({ deterministicDocument, modelShadow, sourceText, endpointEnvelope }) {
      if (!validateEndpointEnvelope(endpointEnvelope)) throw new Error("insight_synthesis_invalid_endpoint_envelope");
      const anchors = safeArray(deterministicDocument?.evidence_anchors);
      const candidates = safeArray(endpointEnvelope.synthesis?.candidates).map((candidate, candidateIndex) => ({
        insight: String(candidate?.insight || ""),
        type: String(candidate?.type || ""),
        abstraction: String(candidate?.abstraction || ""),
        evidence: safeArray(candidate?.evidence).map((item, evidenceIndex) => {
          const quote = String(item?.quote || "");
          const spans = findExactSpans(sourceText, quote, anchors);
          if (!spans.length) throw new Error(`insight_synthesis_unmapped_evidence:${candidateIndex}:${evidenceIndex}`);
          return { quote, role: String(item?.role || "supports"), spans };
        }),
        why_it_matters: String(candidate?.why_it_matters || ""),
        confidence: String(candidate?.confidence || ""),
        uncertainty: String(candidate?.uncertainty || ""),
        causal_status: String(candidate?.causal_status || "")
      }));
      return {
        schema: SHADOW_SCHEMA,
        version: 2,
        mode: "shadow",
        source_event_id: deterministicDocument?.source_event_id || modelShadow?.source_event_id || null,
        source_text_hash: deterministicDocument?.source_text_hash || modelShadow?.source_text_hash || null,
        deterministic_document_id: deterministicDocument?.id || null,
        semantic_model_response_id: modelShadow?.response_id || null,
        synthesis_model: String(endpointEnvelope.model || "") || null,
        synthesis_response_id: String(endpointEnvelope.response_id || "") || null,
        semantic_context: buildSemanticContext(modelShadow),
        candidates,
        policy: {
          production_gate_authority: false,
          synthesis_allowed: false,
          canonical_write: false,
          chamber_write: false,
          persistent_write: false,
          meta_write: false,
          source_text_stored: false
        }
      };
    }

    async function requestSynthesis(sourceText, semanticContext, context = {}) {
      const endpoint = String(getAgentUrl("semantic-document") || "").trim();
      if (!endpoint) return null;
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: String(sourceText || ""),
            format: OUTPUT_SCHEMA,
            semantic_context: semanticContext,
            context: context && typeof context === "object" && !Array.isArray(context) ? context : {}
          })
        });
      } catch {
        console.warn("AHAInsightSynthesisRuntimeV2: synthesis endpoint utilgjengelig");
        return null;
      }
      if (!response?.ok) return null;
      let data;
      try { data = await response.json(); }
      catch { return null; }
      return validateEndpointEnvelope(data) ? data : null;
    }

    function dispatchSummary(eventName, detail) {
      if (typeof dispatchEvent !== "function" || typeof CustomEventImpl !== "function") return;
      try { dispatchEvent(new CustomEventImpl(eventName, { detail: clone(detail) })); }
      catch {}
    }

    async function handleModelShadow(eventOrDetail) {
      if (!isEnabled()) return null;
      const sequence = ++requestSequence;
      const detail = eventOrDetail?.detail && typeof eventOrDetail.detail === "object" ? eventOrDetail.detail : eventOrDetail;
      if (!detail || typeof detail !== "object") return null;
      const sourceEventId = String(detail.source_event_id || "").trim();
      const sourceTextHash = String(detail.source_text_hash || "").trim();
      if (!sourceEventId || !sourceTextHash) return null;

      const semanticApi = getSemanticDocumentApi();
      const modelRuntime = getModelShadowRuntime();
      const gateApi = getQualityGateApi();
      if (!semanticApi?.getLastShadowSemanticDocument || !semanticApi?.sha256Hex) return null;
      if (!modelRuntime?.getLastModelShadow) return null;
      if (!gateApi?.evaluateSynthesisShadow) return null;

      const deterministicDocument = semanticApi.getLastShadowSemanticDocument();
      const modelShadow = modelRuntime.getLastModelShadow();
      if (!deterministicDocument || !modelShadow) return null;
      if (String(deterministicDocument.source_event_id || "") !== sourceEventId) return null;
      if (String(modelShadow.source_event_id || "") !== sourceEventId) return null;
      if (String(deterministicDocument.source_text_hash || "") !== sourceTextHash) return null;
      if (String(modelShadow.source_text_hash || "") !== sourceTextHash) return null;

      const sourceEvent = findSourceEvent(sourceEventId);
      const sourceText = String(sourceEvent?.text || "");
      if (!sourceText || semanticApi.sha256Hex(sourceText) !== sourceTextHash) return null;

      const semanticContext = buildSemanticContext(modelShadow);
      if (!semanticContext.source_claims.length) return null;
      const envelope = await requestSynthesis(sourceText, semanticContext, {
        source_event_id: sourceEventId,
        source_type: deterministicDocument.source_type || sourceEvent?.source_type || "unknown",
        language: deterministicDocument.language || "und"
      });
      if (!envelope || sequence !== requestSequence) return null;

      let shadow;
      try {
        shadow = buildSynthesisShadow({ deterministicDocument, modelShadow, sourceText, endpointEnvelope: envelope });
      } catch {
        console.warn("AHAInsightSynthesisRuntimeV2: synthesis evidence mapping failed");
        return null;
      }
      if (sequence !== requestSequence) return null;

      const evaluation = gateApi.evaluateSynthesisShadow({ source_text: sourceText, synthesis_shadow: shadow });
      if (!evaluation || evaluation.valid !== true || sequence !== requestSequence) return null;
      lastSynthesisShadow = clone(shadow);
      lastGateEvaluation = clone(evaluation);

      dispatchSummary(SYNTHESIS_EVENT_NAME, {
        schema: shadow.schema,
        version: shadow.version,
        source_event_id: shadow.source_event_id,
        source_text_hash: shadow.source_text_hash,
        candidate_count: shadow.candidates.length,
        synthesis_model: shadow.synthesis_model,
        synthesis_allowed: false,
        canonical_write: false,
        chamber_write: false
      });
      dispatchSummary(GATE_EVENT_NAME, {
        schema: evaluation.schema,
        version: evaluation.version,
        source_event_id: evaluation.source_event_id,
        source_text_hash: evaluation.source_text_hash,
        valid: evaluation.valid,
        candidate_count: evaluation.candidate_count,
        eligible_count: evaluation.eligible_count,
        rejected_count: evaluation.rejected_count,
        average_quality_score: evaluation.average_quality_score,
        gate: clone(evaluation.gate)
      });
      return { synthesis_shadow: clone(lastSynthesisShadow), gate_evaluation: clone(lastGateEvaluation) };
    }

    function getLastSynthesisShadow() { return clone(lastSynthesisShadow); }
    function getLastGateEvaluation() { return clone(lastGateEvaluation); }
    function clear() { lastSynthesisShadow = null; lastGateEvaluation = null; }
    const listener = (event) => { handleModelShadow(event); };
    function bind() {
      if (bound || typeof addEventListener !== "function") return false;
      addEventListener(MODEL_EVENT_NAME, listener);
      bound = true;
      return true;
    }
    function unbind() {
      if (!bound) return false;
      if (typeof removeEventListener === "function") removeEventListener(MODEL_EVENT_NAME, listener);
      bound = false;
      return true;
    }
    function getStatus() {
      return {
        version: SHADOW_SCHEMA,
        enabled: isEnabled(),
        bound,
        has_synthesis_shadow: Boolean(lastSynthesisShadow),
        has_gate_evaluation: Boolean(lastGateEvaluation),
        source_event_id: lastSynthesisShadow?.source_event_id || null,
        eligible_count: lastGateEvaluation?.eligible_count ?? null,
        production_gate_authority: false,
        synthesis_allowed: false,
        canonical_write: false,
        chamber_write: false,
        meta_write: false,
        persistent_write: false
      };
    }

    return Object.freeze({
      buildSemanticContext,
      buildSynthesisShadow,
      requestSynthesis,
      handleModelShadow,
      getLastSynthesisShadow,
      getLastGateEvaluation,
      clear,
      bind,
      unbind,
      getStatus
    });
  }

  const api = Object.freeze({ SHADOW_SCHEMA, VERSION: 2, create });
  global.AHAInsightSynthesisRuntimeV2 = api;
  global.AHAModuleApi?.register?.("insightSynthesisRuntimeV2", api, {
    version: 2,
    legacyGlobal: "AHAInsightSynthesisRuntimeV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
