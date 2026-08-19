// ahaSemanticEvaluationRuntime.js
// Memory-only runtime bridge from model-shadow metadata to the pure semantic
// quality gate. No network, canonical, Meta, persistence, or visible UI writes.

(function (global) {
  "use strict";

  const RUNTIME_SCHEMA = "aha_semantic_evaluation_runtime_v1";
  const MODEL_EVENT_NAME = "aha:semantic-model-shadow";
  const EVALUATION_EVENT_NAME = "aha:semantic-evaluation-shadow";

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function create(deps = {}) {
    const {
      getSourcesApi = () => (
        global.AHAModuleApi?.resolve?.("sources", "AHASources", { version: 1 })
        || global.AHASources
        || null
      ),
      getSemanticDocumentApi = () => (
        global.AHAModuleApi?.resolve?.("semanticDocument", "AHASemanticDocument", { version: 1 })
        || global.AHASemanticDocument
        || null
      ),
      getModelShadowRuntime = () => global.AHASemanticModelShadowRuntime || null,
      getQualityGateApi = () => (
        global.AHAModuleApi?.resolve?.("semanticInsightQualityGate", "AHASemanticInsightQualityGate", { version: 1 })
        || global.AHASemanticInsightQualityGate
        || null
      ),
      addEventListener = (...args) => global.addEventListener?.(...args),
      removeEventListener = (...args) => global.removeEventListener?.(...args),
      dispatchEvent = (...args) => global.dispatchEvent?.(...args),
      CustomEventImpl = global.CustomEvent
    } = deps;

    let bound = false;
    let lastEvaluation = null;

    function findSourceEvent(sourceEventId) {
      const events = getSourcesApi()?.loadSourceEvents?.();
      if (!Array.isArray(events)) return null;
      return events.find((event) => String(event?.id || "") === String(sourceEventId || "")) || null;
    }

    function safeEventSummary(evaluation) {
      return {
        schema: evaluation.schema,
        version: evaluation.version,
        source_event_id: evaluation.source_event_id || null,
        source_text_hash: evaluation.source_text_hash || null,
        valid: evaluation.valid === true,
        metrics: clone(evaluation.metrics || {}),
        gate: clone(evaluation.gate || {})
      };
    }

    function dispatchEvaluationSummary(evaluation) {
      if (typeof dispatchEvent !== "function" || typeof CustomEventImpl !== "function") return;
      try {
        dispatchEvent(new CustomEventImpl(EVALUATION_EVENT_NAME, {
          detail: safeEventSummary(evaluation)
        }));
      } catch {}
    }

    function handleModelShadow(eventOrDetail) {
      const detail = eventOrDetail?.detail && typeof eventOrDetail.detail === "object"
        ? eventOrDetail.detail
        : eventOrDetail;
      if (!detail || typeof detail !== "object") return null;

      const sourceEventId = String(detail.source_event_id || "").trim();
      const sourceTextHash = String(detail.source_text_hash || "").trim();
      if (!sourceEventId || !sourceTextHash) return null;

      const semanticApi = getSemanticDocumentApi();
      const modelRuntime = getModelShadowRuntime();
      const gateApi = getQualityGateApi();
      if (!semanticApi?.getLastShadowSemanticDocument || !semanticApi?.sha256Hex) return null;
      if (!modelRuntime?.getLastModelShadow) return null;
      if (!gateApi?.evaluateSemanticShadow) return null;

      const deterministic = semanticApi.getLastShadowSemanticDocument();
      const modelShadow = modelRuntime.getLastModelShadow();
      if (!deterministic || !modelShadow) return null;

      if (String(deterministic.source_event_id || "") !== sourceEventId) return null;
      if (String(modelShadow.source_event_id || "") !== sourceEventId) return null;
      if (String(deterministic.source_text_hash || "") !== sourceTextHash) return null;
      if (String(modelShadow.source_text_hash || "") !== sourceTextHash) return null;

      const sourceEvent = findSourceEvent(sourceEventId);
      const sourceText = String(sourceEvent?.text || "");
      if (!sourceText) return null;
      if (semanticApi.sha256Hex(sourceText) !== sourceTextHash) return null;

      const evaluation = gateApi.evaluateSemanticShadow({
        source_text: sourceText,
        deterministic_document: deterministic,
        model_shadow: modelShadow
      });
      if (!evaluation || typeof evaluation !== "object") return null;

      lastEvaluation = clone(evaluation);
      dispatchEvaluationSummary(lastEvaluation);
      return clone(lastEvaluation);
    }

    function getLastEvaluation() {
      return clone(lastEvaluation);
    }

    function clearLastEvaluation() {
      lastEvaluation = null;
    }

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
        version: RUNTIME_SCHEMA,
        bound,
        has_evaluation: Boolean(lastEvaluation),
        source_event_id: lastEvaluation?.source_event_id || null,
        evaluation_valid: lastEvaluation?.valid === true,
        synthesis_allowed: false,
        canonical_write: false,
        meta_write: false,
        persistent_write: false
      };
    }

    return Object.freeze({
      handleModelShadow,
      getLastEvaluation,
      clearLastEvaluation,
      bind,
      unbind,
      getStatus
    });
  }

  const api = Object.freeze({
    SCHEMA: RUNTIME_SCHEMA,
    VERSION: 1,
    create
  });
  global.AHASemanticEvaluationRuntime = api;
  global.AHAModuleApi?.register?.("semanticEvaluationRuntime", api, {
    version: 1,
    legacyGlobal: "AHASemanticEvaluationRuntime",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
