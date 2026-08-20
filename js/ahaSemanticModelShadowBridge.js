// ahaSemanticModelShadowBridge.js
// Optional QA bridge from deterministic SemanticDocument shadow to the
// source-direct semantic-model endpoint. Disabled by default and memory-only.

(function (global) {
  "use strict";

  const BRIDGE_SCHEMA = "aha_semantic_model_shadow_v1";
  const BRIDGE_VERSION = 1;
  const ENDPOINT_SCHEMA = "aha_semantic_model_contract_v1";
  const ANALYSIS_SCHEMA = "aha_semantic_model_output_v1";
  const SOURCE_EVENT_NAME = "aha:semantic-document-shadow";
  const MODEL_EVENT_NAME = "aha:semantic-model-shadow";

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeKey(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
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
      getAgentUrl = (path) => {
        try {
          return global.AHAChatInsightPipeline?.create?.({})?.buildAhaAgentUrl?.(path) || "";
        } catch {
          return "";
        }
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
    let lastModelShadow = null;

    function isEnabled() {
      if (typeof isEnabledOverride === "function") return isEnabledOverride() === true;
      if (global.AHA_SEMANTIC_MODEL_SHADOW === true) return true;
      const search = String(global.location?.search || "");
      try {
        const Params = global.URLSearchParams || (typeof URLSearchParams !== "undefined" ? URLSearchParams : null);
        if (Params && new Params(search).get("ahaSemanticModelShadow") === "1") return true;
      } catch {}
      return /(?:^|[?&])ahaSemanticModelShadow=1(?:&|$)/.test(search);
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
        const anchor = (Array.isArray(anchors) ? anchors : []).find((item) => (
          index >= item.start_offset && end <= item.end_offset
        ));
        if (anchor) {
          spans.push({
            anchor_id: anchor.id,
            start_offset: index,
            end_offset: end,
            text: source.slice(index, end)
          });
        }
        offset = index + Math.max(1, needle.length);
      }
      return spans;
    }

    function mapEvidenceQuotes(sourceText, quotes, anchors, label) {
      const list = Array.isArray(quotes) ? quotes : [];
      if (!list.length) throw new Error(`semantic_model_shadow_missing_evidence:${label}`);
      return list.map((quote, index) => {
        const spans = findExactSpans(sourceText, quote, anchors);
        if (!spans.length) throw new Error(`semantic_model_shadow_unmapped_evidence:${label}:${index}`);
        return {
          quote: String(quote),
          spans
        };
      });
    }

    function validateEndpointEnvelope(envelope) {
      if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return false;
      if (envelope.ok !== true || envelope.schema !== ENDPOINT_SCHEMA) return false;
      if (!envelope.analysis || envelope.analysis.schema !== ANALYSIS_SCHEMA) return false;
      const policy = envelope.policy;
      if (!policy || typeof policy !== "object") return false;
      if (policy.source_text_returned !== false) return false;
      if (policy.canonical_write !== false) return false;
      if (policy.persistent_write !== false) return false;
      if (policy.meta_write !== false) return false;
      if (policy.synthesis_allowed !== false) return false;
      if (Object.prototype.hasOwnProperty.call(envelope, "source_text")) return false;
      if (Object.prototype.hasOwnProperty.call(envelope, "raw_model_output")) return false;
      return true;
    }

    function buildComparison(deterministicDocument, modelAnalysis, semanticApi) {
      const normalize = typeof semanticApi?.normalizeSemanticKey === "function"
        ? (value) => semanticApi.normalizeSemanticKey(value)
        : normalizeKey;
      const deterministicEntityKeys = new Set((deterministicDocument.entities || [])
        .map((item) => normalize(item.normalized_key || item.label)).filter(Boolean));
      const deterministicConceptKeys = new Set((deterministicDocument.concepts || [])
        .map((item) => normalize(item.normalized_key || item.label)).filter(Boolean));
      const deterministicClaimKeys = new Set((deterministicDocument.claims || [])
        .map((item) => normalize(item.normalized_key || item.text)).filter(Boolean));

      const modelEntities = Array.isArray(modelAnalysis.entities) ? modelAnalysis.entities : [];
      const modelConcepts = Array.isArray(modelAnalysis.concepts) ? modelAnalysis.concepts : [];
      const propositions = Array.isArray(modelAnalysis.propositions) ? modelAnalysis.propositions : [];
      const relations = Array.isArray(modelAnalysis.relations) ? modelAnalysis.relations : [];
      const unresolved = Array.isArray(modelAnalysis.unresolved_inferences) ? modelAnalysis.unresolved_inferences : [];

      const entityOverlap = modelEntities.filter((item) => {
        const keys = [normalize(item.source_surface), normalize(item.canonical_label)].filter(Boolean);
        return keys.some((key) => deterministicEntityKeys.has(key));
      }).length;
      const conceptOverlap = modelConcepts.filter((item) => {
        const keys = [normalize(item.source_surface), normalize(item.canonical_label)].filter(Boolean);
        return keys.some((key) => deterministicConceptKeys.has(key));
      }).length;
      const sourceClaimOverlap = propositions.filter((item) => (
        item.kind === "source_claim" && deterministicClaimKeys.has(normalize(item.text))
      )).length;

      return {
        deterministic: {
          entity_count: (deterministicDocument.entities || []).length,
          concept_count: (deterministicDocument.concepts || []).length,
          claim_count: (deterministicDocument.claims || []).length,
          relation_count: (deterministicDocument.relations || []).length
        },
        model: {
          entity_count: modelEntities.length,
          concept_count: modelConcepts.length,
          proposition_count: propositions.length,
          relation_count: relations.length,
          unresolved_inference_count: unresolved.length
        },
        entity_overlap_count: entityOverlap,
        concept_overlap_count: conceptOverlap,
        source_claim_overlap_count: sourceClaimOverlap,
        interpretation_count: propositions.filter((item) => item.kind === "interpretation").length,
        inference_count: propositions.filter((item) => item.kind === "inference").length,
        semantic_relation_count: relations.length,
        unresolved_inference_count: unresolved.length
      };
    }

    function buildModelShadow(deterministicDocument, sourceText, endpointEnvelope) {
      if (!validateEndpointEnvelope(endpointEnvelope)) {
        throw new Error("semantic_model_shadow_invalid_endpoint_envelope");
      }
      const source = String(sourceText || "");
      const doc = deterministicDocument && typeof deterministicDocument === "object"
        ? deterministicDocument
        : null;
      if (!doc || !source) throw new Error("semantic_model_shadow_missing_source_context");
      const anchors = Array.isArray(doc.evidence_anchors) ? doc.evidence_anchors : [];
      const analysis = endpointEnvelope.analysis;

      const entities = (Array.isArray(analysis.entities) ? analysis.entities : []).map((item, index) => {
        const sourceSurfaceSpans = findExactSpans(source, item.source_surface, anchors);
        if (!sourceSurfaceSpans.length) throw new Error(`semantic_model_shadow_unmapped_entity_surface:${index}`);
        return {
          source_surface: String(item.source_surface),
          canonical_label: String(item.canonical_label),
          entity_type: String(item.entity_type),
          confidence: String(item.confidence),
          source_surface_spans: sourceSurfaceSpans,
          evidence: mapEvidenceQuotes(source, item.evidence_quotes, anchors, `entity:${index}`)
        };
      });

      const concepts = (Array.isArray(analysis.concepts) ? analysis.concepts : []).map((item, index) => {
        const sourceSurfaceSpans = findExactSpans(source, item.source_surface, anchors);
        if (!sourceSurfaceSpans.length) throw new Error(`semantic_model_shadow_unmapped_concept_surface:${index}`);
        return {
          source_surface: String(item.source_surface),
          canonical_label: String(item.canonical_label),
          confidence: String(item.confidence),
          source_surface_spans: sourceSurfaceSpans,
          evidence: mapEvidenceQuotes(source, item.evidence_quotes, anchors, `concept:${index}`)
        };
      });

      const propositions = (Array.isArray(analysis.propositions) ? analysis.propositions : []).map((item, index) => {
        const mapped = {
          kind: String(item.kind),
          text: String(item.text),
          confidence: String(item.confidence),
          evidence: mapEvidenceQuotes(source, item.evidence_quotes, anchors, `proposition:${index}`)
        };
        if (item.kind === "source_claim") {
          mapped.source_claim_spans = findExactSpans(source, item.text, anchors);
          if (!mapped.source_claim_spans.length) {
            throw new Error(`semantic_model_shadow_unmapped_source_claim:${index}`);
          }
        }
        return mapped;
      });

      const relations = (Array.isArray(analysis.relations) ? analysis.relations : []).map((item, index) => ({
        relation_type: String(item.relation_type),
        from_label: String(item.from_label),
        to_label: String(item.to_label),
        epistemic_status: String(item.epistemic_status),
        confidence: String(item.confidence),
        evidence: mapEvidenceQuotes(source, item.evidence_quotes, anchors, `relation:${index}`)
      }));

      const unresolvedInferences = (Array.isArray(analysis.unresolved_inferences) ? analysis.unresolved_inferences : []).map((item, index) => ({
        text: String(item.text),
        confidence: String(item.confidence),
        evidence: mapEvidenceQuotes(source, item.evidence_quotes, anchors, `unresolved:${index}`)
      }));

      const semanticApi = typeof getSemanticDocumentApi === "function" ? getSemanticDocumentApi() : null;
      const comparison = buildComparison(doc, analysis, semanticApi);
      return {
        schema: BRIDGE_SCHEMA,
        version: BRIDGE_VERSION,
        mode: "shadow",
        source_event_id: doc.source_event_id || null,
        source_text_hash: doc.source_text_hash,
        deterministic_document_id: doc.id || null,
        model: String(endpointEnvelope.model || "") || null,
        response_id: String(endpointEnvelope.response_id || "") || null,
        entities,
        concepts,
        propositions,
        relations,
        unresolved_inferences: unresolvedInferences,
        comparison,
        policy: {
          canonical_write: false,
          persistent_write: false,
          meta_write: false,
          visible_output_changed: false,
          synthesis_allowed: false,
          source_text_stored: false
        }
      };
    }

    async function requestSemanticModelAnalysis(sourceText, context = {}) {
      const endpoint = String(getAgentUrl("semantic-document") || "").trim();
      if (!endpoint) return null;
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: String(sourceText || ""),
            format: ANALYSIS_SCHEMA,
            context: context && typeof context === "object" && !Array.isArray(context) ? context : {}
          })
        });
      } catch {
        console.warn("AHASemanticModelShadowBridge: semantic endpoint utilgjengelig");
        return null;
      }
      if (!response?.ok) return null;
      let data;
      try { data = await response.json(); }
      catch { return null; }
      return validateEndpointEnvelope(data) ? data : null;
    }

    function findSourceEvent(sourceEventId) {
      const api = typeof getSourcesApi === "function" ? getSourcesApi() : null;
      const events = api?.loadSourceEvents?.();
      if (!Array.isArray(events)) return null;
      return events.find((event) => String(event?.id || "") === String(sourceEventId || "")) || null;
    }

    function dispatchModelShadowSummary(shadow) {
      if (typeof dispatchEvent !== "function" || typeof CustomEventImpl !== "function") return;
      try {
        dispatchEvent(new CustomEventImpl(MODEL_EVENT_NAME, {
          detail: {
            schema: shadow.schema,
            version: shadow.version,
            source_event_id: shadow.source_event_id,
            source_text_hash: shadow.source_text_hash,
            model: shadow.model,
            entity_count: shadow.entities.length,
            concept_count: shadow.concepts.length,
            proposition_count: shadow.propositions.length,
            relation_count: shadow.relations.length,
            unresolved_inference_count: shadow.unresolved_inferences.length,
            comparison: clone(shadow.comparison),
            synthesis_allowed: false
          }
        }));
      } catch {}
    }

    async function handleSemanticDocumentShadow(eventOrDetail) {
      if (!isEnabled()) return null;
      const sequence = ++requestSequence;
      const detail = eventOrDetail?.detail && typeof eventOrDetail.detail === "object"
        ? eventOrDetail.detail
        : eventOrDetail;
      if (!detail || typeof detail !== "object") return null;
      const sourceEventId = String(detail.source_event_id || "").trim();
      const sourceTextHash = String(detail.source_text_hash || "").trim();
      if (!sourceEventId || !sourceTextHash) return null;

      const semanticApi = typeof getSemanticDocumentApi === "function" ? getSemanticDocumentApi() : null;
      const deterministicDocument = semanticApi?.getLastShadowSemanticDocument?.();
      if (!deterministicDocument) return null;
      if (String(deterministicDocument.source_event_id || "") !== sourceEventId) return null;
      if (String(deterministicDocument.source_text_hash || "") !== sourceTextHash) return null;

      const sourceEvent = findSourceEvent(sourceEventId);
      const sourceText = String(sourceEvent?.text || "");
      if (!sourceText) return null;
      if (typeof semanticApi?.sha256Hex !== "function") return null;
      if (semanticApi.sha256Hex(sourceText) !== sourceTextHash) return null;

      const envelope = await requestSemanticModelAnalysis(sourceText, {
        source_event_id: sourceEventId,
        source_type: deterministicDocument.source_type || sourceEvent?.source_type || "unknown",
        language: deterministicDocument.language || "und"
      });
      if (!envelope || sequence !== requestSequence) return null;

      let shadow;
      try {
        shadow = buildModelShadow(deterministicDocument, sourceText, envelope);
      } catch {
        console.warn("AHASemanticModelShadowBridge: model shadow evidence mapping failed");
        return null;
      }
      if (sequence !== requestSequence) return null;
      lastModelShadow = clone(shadow);
      dispatchModelShadowSummary(lastModelShadow);
      return clone(lastModelShadow);
    }

    function getLastModelShadow() {
      return clone(lastModelShadow);
    }

    function clearLastModelShadow() {
      lastModelShadow = null;
    }

    const listener = (event) => { void handleSemanticDocumentShadow(event); };

    function bind() {
      if (bound || typeof addEventListener !== "function") return false;
      addEventListener(SOURCE_EVENT_NAME, listener);
      bound = true;
      return true;
    }

    function unbind() {
      if (!bound) return false;
      if (typeof removeEventListener === "function") removeEventListener(SOURCE_EVENT_NAME, listener);
      bound = false;
      return true;
    }

    function getStatus() {
      return {
        version: BRIDGE_SCHEMA,
        enabled: isEnabled(),
        bound,
        has_model_shadow: Boolean(lastModelShadow),
        source_event_id: lastModelShadow?.source_event_id || null,
        synthesis_allowed: false,
        persistent_write: false,
        canonical_write: false,
        meta_write: false
      };
    }

    return Object.freeze({
      isEnabled,
      findExactSpans,
      validateEndpointEnvelope,
      buildModelShadow,
      requestSemanticModelAnalysis,
      handleSemanticDocumentShadow,
      getLastModelShadow,
      clearLastModelShadow,
      bind,
      unbind,
      getStatus
    });
  }

  const publicApi = Object.freeze({
    SCHEMA: BRIDGE_SCHEMA,
    VERSION: BRIDGE_VERSION,
    create
  });
  global.AHASemanticModelShadowBridge = publicApi;
  global.AHAModuleApi?.register?.("semanticModelShadowBridge", publicApi, {
    version: 1,
    legacyGlobal: "AHASemanticModelShadowBridge",
    exports: Object.keys(publicApi)
  });

  const runtime = create();
  global.AHASemanticModelShadowRuntime = runtime;
  if (global.document && typeof global.addEventListener === "function") runtime.bind();
})(typeof window !== "undefined" ? window : globalThis);
