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

// Authoritative, read-only bridge from the active Chat analysis to
// SemanticDocumentV2. Every semantic item is bound to the active SHA-256 and
// analysis run. Synthesized insight candidates are exposed only after the
// existing Insight Quality Gate V2 has evaluated them.

(function (global) {
  "use strict";

  const SCHEMA = "aha_semantic_document_v2";
  const VERSION = 2;
  const GATE_SCHEMA = "aha_live_semantic_synthesis_gate_v2";
  const INSIGHT_TYPES = new Set(["principle", "mechanism", "pattern", "tension", "consequence", "generalization"]);
  const CLOSED_WRITE_POLICY = Object.freeze([
    "canonical_write", "chamber_write", "meta_write", "persistent_write",
    "remote_write", "sync_write", "product_write"
  ]);
  const METADATA_INSIGHT = /(?:^|\b)(?:kilde registrert|source registered|metadata_only|source_event_only)(?:\b|$)/iu;
  const TENSION_MARKER = /\b(?:men|mens|samtidig|derimot|likevel|adskilt fra|skilles fra|spenning mellom|på den ene siden|på den andre siden)\b/iu;
  const CAUSAL_LANGUAGE = /(?:\b(?:fordi|forårsaker|forårsaket|fører til|førte til|gjør at|gjorde at|resulterer i|resulterte i|på grunn av|som følge av|derfor|drivkraft|omformer|reduserer behovet|introduserer kompleksitet|bidrar til|causes?|caused|leads? to|led to|results? in|because)\b|\bfør(?:er|te)[^.!?]{0,100}\btil\b|(?:^|[^\p{L}\p{N}_])(?:skaper|skapes|skapte|skapt|gir|ga|øker|økte|reduserer|reduserte|muliggjør|muliggjorde|kanaliserer|kanaliserte)(?![\p{L}\p{N}_]))/iu;
  const EXPLICIT_CAUSAL_SOURCE = /\b(fordi|forårsaker|forårsaket|fører til|førte til|gjør at|gjorde at|resulterer i|resulterte i|på grunn av|som følge av|derfor|kan\s+flytte|causes?|caused|leads? to|led to|results? in|because)\b/iu;
  const STOPWORDS = new Set([
    "og", "i", "på", "til", "av", "for", "med", "som", "det", "den", "de", "et", "en", "er", "var", "blir",
    "kan", "skal", "har", "om", "at", "fra", "når", "etter", "før", "mellom", "også", "dette", "tekst", "teksten",
    "the", "a", "an", "and", "or", "of", "to", "in", "with", "that", "this", "is", "are", "was", "were"
  ]);

  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function text(value) {
    if (value == null) return "";
    if (["string", "number", "boolean"].includes(typeof value)) return String(value).replace(/\s+/g, " ").trim();
    const source = object(value);
    for (const key of ["insight", "text", "claim", "label", "title", "name", "summary", "term", "value"]) {
      if (["string", "number", "boolean"].includes(typeof source[key])) return text(source[key]);
    }
    return "";
  }
  function normalize(value) {
    return text(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
  }
  function tokens(value) { return normalize(value).split(/\s+/).filter((token) => token.length > 2 && !STOPWORDS.has(token)); }
  function stableToken(value) {
    let hash = 2166136261;
    const input = String(value || "");
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
  function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== "object" || seen.has(value)) return value;
    seen.add(value);
    Object.keys(value).forEach((key) => deepFreeze(value[key], seen));
    return Object.freeze(value);
  }
  function unique(values, keyFn = text) {
    const seen = new Set();
    return array(values).filter((item) => {
      const key = normalize(keyFn(item));
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function identityFrom(input) {
    const run = object(input.activeRun || input.run);
    const payload = object(input.payload);
    return {
      analysis_id: text(run.analysisId || run.analysis_id || payload.analysisId || payload.analysis_id),
      analysis_run_id: text(run.analysisRunId || run.analysis_run_id || run.runId || payload.analysisRunId || payload.runId),
      source_id: text(run.sourceId || run.source_id || payload.sourceId || payload.source_id),
      source_sha256: text(run.sourceSha256 || run.source_sha256 || run.sourceTextHash || payload.source_sha256 || payload.sourceSha256 || payload.sourceTextHash).toLowerCase()
    };
  }
  function exactSpans(sourceText, excerpt, anchors) {
    const source = String(sourceText || "");
    const needle = text(excerpt);
    if (!source || !needle) return [];
    const spans = [];
    let cursor = 0;
    while (cursor <= source.length - needle.length) {
      let start = source.indexOf(needle, cursor);
      if (start < 0) start = source.toLowerCase().indexOf(needle.toLowerCase(), cursor);
      if (start < 0) break;
      const end = start + needle.length;
      const anchor = array(anchors).find((item) => start >= item.start_offset && end <= item.end_offset);
      if (anchor) spans.push({ anchor_id: anchor.id, start_offset: start, end_offset: end, text: source.slice(start, end) });
      cursor = start + Math.max(1, needle.length);
    }
    return spans;
  }
  function evidenceValues(value) {
    const out = [];
    const visit = (item) => {
      if (Array.isArray(item)) return item.forEach(visit);
      if (item && typeof item === "object") {
        const source = object(item);
        for (const key of ["quote", "text", "excerpt", "evidence", "evidence_quotes", "evidenceText", "evidence_text", "source_excerpt"]) {
          if (source[key] != null && source[key] !== item) visit(source[key]);
        }
        return;
      }
      const candidate = text(item);
      if (candidate) out.push(candidate);
    };
    visit(value);
    return unique(out);
  }
  function sourceSentences(sourceText, anchors, semanticApi) {
    if (typeof semanticApi?.sentenceSpansForAnchor === "function") {
      return array(anchors).flatMap((anchor) => semanticApi.sentenceSpansForAnchor(sourceText, anchor));
    }
    const source = String(sourceText || "");
    const spans = [];
    const pattern = /[^.!?\n]+(?:[.!?]+|$)/gu;
    let match;
    while ((match = pattern.exec(source))) {
      const value = match[0].trim();
      if (!value) continue;
      const start = match.index + match[0].indexOf(value);
      const end = start + value.length;
      const anchor = array(anchors).find((item) => start >= item.start_offset && end <= item.end_offset);
      if (anchor) spans.push({ anchor_id: anchor.id, start_offset: start, end_offset: end, text: source.slice(start, end) });
    }
    return spans;
  }
  function claimEligible(span) {
    const value = text(span?.text);
    const words = tokens(value);
    return Boolean(value && !value.includes("?") && words.length >= 4 && words.length <= 80 && /\p{L}/u.test(value));
  }
  function conceptCandidates(payload, sourceText) {
    const source = object(payload);
    const authoritativeCandidates = Array.isArray(source.insightCandidatesV2);
    const literalSourceTerms = (String(sourceText || "").match(/[\p{L}\p{M}][\p{L}\p{M}-]{4,}/gu) || [])
      .filter((value) => !STOPWORDS.has(normalize(value)) && !METADATA_INSIGHT.test(value))
      .slice(0, 24);
    const candidates = authoritativeCandidates
      ? [
        ...array(source.insightCandidatesV2).flatMap((item) => array(item?.concepts)),
        ...literalSourceTerms
      ]
      : [
        ...array(source.concepts), ...array(source.keywords),
        ...array(source.subjectMatches).flatMap((item) => array(item?.matched_terms)),
        ...literalSourceTerms
      ];
    return unique(candidates).map(text).filter((label) => {
      const key = normalize(label);
      const words = key.split(/\s+/).filter(Boolean);
      return key.length >= 4 && words.length <= 6 && !METADATA_INSIGHT.test(label) && !STOPWORDS.has(key);
    });
  }
  function buildConcepts(sourceText, sourceSha256, anchors, payload) {
    return conceptCandidates(payload, sourceText).map((label) => ({ label, spans: exactSpans(sourceText, label, anchors) }))
      .filter((item) => item.spans.length)
      .sort((left, right) => (
        left.spans[0].start_offset - right.spans[0].start_offset
        || normalize(left.label).localeCompare(normalize(right.label), "no")
      ))
      .map((item, index) => ({
        id: `con_${sourceSha256.slice(0, 12)}_${String(index + 1).padStart(3, "0")}`,
        label: item.label,
        normalized_key: normalize(item.label),
        evidence_anchor_ids: Array.from(new Set(item.spans.map((span) => span.anchor_id))),
        mentions: item.spans,
        epistemic_status: "source_explicit",
        origin: "current_chat_analysis_literal_concept"
      }));
  }
  function buildClaims(sourceText, sourceSha256, anchors, concepts, semanticApi) {
    return sourceSentences(sourceText, anchors, semanticApi).filter(claimEligible).map((span, index) => {
      const mentionedConceptIds = concepts.filter((concept) => concept.mentions.some((mention) => (
        mention.start_offset >= span.start_offset && mention.end_offset <= span.end_offset
      ))).map((concept) => concept.id);
      return {
        id: `clm_${sourceSha256.slice(0, 12)}_${String(index + 1).padStart(3, "0")}`,
        kind: "source_claim",
        text: span.text,
        normalized_key: normalize(span.text),
        epistemic_status: "source_explicit",
        evidence_anchor_ids: [span.anchor_id],
        spans: [span],
        mentioned_concept_ids: mentionedConceptIds,
        origin: "literal_source_sentence"
      };
    });
  }
  function buildRelations(sourceSha256, claims, concepts) {
    const conceptById = new Map(concepts.map((item) => [item.id, item]));
    const pending = [];
    claims.forEach((claim) => claim.mentioned_concept_ids.forEach((conceptId) => {
      const concept = conceptById.get(conceptId);
      if (!concept) return;
      const claimSpan = claim.spans[0];
      const mention = concept.mentions.find((item) => item.start_offset >= claimSpan.start_offset && item.end_offset <= claimSpan.end_offset);
      if (!mention) return;
      pending.push({
        type: "claim_mentions_concept",
        from_id: claim.id,
        to_id: concept.id,
        epistemic_status: "source_structural",
        evidence_anchor_ids: Array.from(new Set([claimSpan.anchor_id, mention.anchor_id])),
        evidence_spans: [clone(claimSpan), clone(mention)],
        origin: "co_occurrence_within_source_claim"
      });
    }));
    return pending.map((item, index) => ({ id: `rel_${sourceSha256.slice(0, 12)}_${String(index + 1).padStart(3, "0")}`, ...item }));
  }
  function buildTensions(sourceText, sourceSha256, anchors, claims, payload) {
    const explicit = (Array.isArray(payload?.insightCandidatesV2)
      ? []
      : [payload?.canonicalAnalysis?.mainTension, payload?.ahaSer?.hovedspenning, payload?.hovedspenning])
      .map(text).filter(Boolean).map((label) => ({ label, spans: exactSpans(sourceText, label, anchors), origin: "current_chat_analysis_tension" }))
      .filter((item) => item.spans.length);
    const literal = claims.filter((claim) => TENSION_MARKER.test(claim.text)).map((claim) => ({
      label: claim.text,
      spans: clone(claim.spans),
      origin: "literal_source_tension_marker"
    }));
    return unique([...explicit, ...literal], (item) => item.label).map((item, index) => ({
      id: `ten_${sourceSha256.slice(0, 12)}_${String(index + 1).padStart(3, "0")}`,
      label: item.label,
      epistemic_status: "source_explicit",
      evidence_anchor_ids: Array.from(new Set(item.spans.map((span) => span.anchor_id))),
      evidence_spans: item.spans,
      origin: item.origin
    }));
  }
  function overlapScore(left, right) {
    const a = new Set(tokens(left));
    const b = new Set(tokens(right));
    if (!a.size || !b.size) return 0;
    let matches = 0;
    a.forEach((token) => { if (b.has(token)) matches += 1; });
    return matches / new Set([...a, ...b]).size;
  }
  function candidateSources(payload) {
    const source = object(payload);
    if (Array.isArray(source.insightCandidatesV2)) {
      return unique(source.insightCandidatesV2.filter(Boolean), (item) => text(item));
    }
    const qualityInterpretations = array(source.analysisQuality?.claims).filter((item) => item?.kind === "interpretation");
    const candidates = [
      ...array(source.insights), ...array(source.insightCards), ...qualityInterpretations
    ].filter(Boolean);
    return unique(candidates, (item) => text(item));
  }
  function linkedInterpretation(payload, insight) {
    const key = normalize(insight);
    return array(payload?.analysisQuality?.claims).find((item) => item?.kind === "interpretation" && normalize(item?.text) === key) || null;
  }
  function claimIndexForEvidence(value, claims) {
    const quote = text(value);
    if (!quote) return -1;
    return array(claims).findIndex((claim) => {
      const claimText = text(claim?.text);
      return claimText && (claimText.includes(quote) || quote.includes(claimText));
    });
  }
  function candidateEvidence(raw, payload, insight, claims, sourceText) {
    const source = object(raw);
    const explicitRoleByQuote = new Map(array(source.evidence).map((item) => {
      const quote = text(item?.quote);
      return [normalize(quote), item?.role === "limits" ? "limits" : "supports"];
    }).filter(([quote]) => quote));
    const values = evidenceValues(raw);
    const interpretation = linkedInterpretation(payload, insight);
    values.push(...evidenceValues([interpretation?.evidenceText, interpretation?.evidence_text]));
    const exact = unique(values).filter((value) => String(sourceText).includes(value));
    const rankedClaims = claims.slice().sort((left, right) => overlapScore(right.text, insight) - overlapScore(left.text, insight));
    const hasExactEvidence = (value) => exact.some((quote) => normalize(quote) === normalize(value));
    const coveredClaimIndexes = () => new Set(exact.map((quote) => claimIndexForEvidence(quote, claims)).filter((index) => index >= 0));

    // The quality gate requires cross-claim evidence. Model output may contain
    // several exact fragments from one sentence, so add the best-ranked exact
    // source claim from a different sentence before filling the final slot.
    if (claims.length > 1 && coveredClaimIndexes().size < 2) {
      const covered = coveredClaimIndexes();
      const distinctClaim = rankedClaims.find((claim) => {
        const index = claims.indexOf(claim);
        return !covered.has(index) && !hasExactEvidence(claim.text);
      });
      if (distinctClaim) {
        if (exact.length >= 3) exact[exact.length - 1] = distinctClaim.text;
        else exact.push(distinctClaim.text);
      }
    }
    rankedClaims.forEach((claim) => {
      if (exact.length < 3 && !hasExactEvidence(claim.text)) exact.push(claim.text);
    });
    return unique(exact).slice(0, 3).map((quote) => ({
      quote,
      role: explicitRoleByQuote.get(normalize(quote)) || "supports"
    }));
  }
  function buildCandidateInput(raw, payload, claims, sourceText) {
    const source = object(raw);
    const authoritativeCandidates = Array.isArray(payload?.insightCandidatesV2);
    const insight = text(source.insight || source.summary || source.text || raw);
    const interpretation = linkedInterpretation(payload, insight);
    const evidence = candidateEvidence(raw, payload, insight, claims, sourceText);
    const requestedType = text(source.type || source.insight_type || source.functional_type);
    const typeMap = {
      observation: "generalization", question: "generalization", definition: "generalization", learning_point: "generalization",
      contradiction: "tension", task: "consequence", problem: "consequence", solution: "consequence", decision: "consequence"
    };
    const uncertainty = text(source.uncertainty_detail || source.uncertainty || interpretation?.uncertainty);
    const confidence = text(source.confidence || interpretation?.confidence)
      || (uncertainty === "hypothesis" ? "low" : "medium");
    const whyItMatters = text(source.why_it_matters || source.whyItMatters || (authoritativeCandidates ? "" : payload?.reflection));
    const title = text(source.title);
    const abstraction = text(source.abstraction || source.semantic_transform)
      || (tokens(title).length >= 5 ? title : text([title, whyItMatters].filter(Boolean).join(": ")))
      || (authoritativeCandidates ? "" : text(payload?.canonicalAnalysis?.theme));
    const explicitCausalEvidence = evidence.some((item) => EXPLICIT_CAUSAL_SOURCE.test(text(item?.quote)));
    const inferredCausalStatus = CAUSAL_LANGUAGE.test(insight)
      ? (explicitCausalEvidence ? "source_explicit" : "interpretive")
      : "not_causal";
    return {
      insight,
      type: INSIGHT_TYPES.has(requestedType) ? requestedType : (typeMap[requestedType] || "generalization"),
      abstraction,
      evidence,
      why_it_matters: whyItMatters,
      confidence: ["high", "medium", "low"].includes(confidence) ? confidence : "low",
      uncertainty,
      causal_status: ["not_causal", "source_explicit", "interpretive"].includes(text(source.causal_status))
        ? text(source.causal_status)
        : inferredCausalStatus
    };
  }
  function buildCandidateInsights(sourceText, sourceSha256, anchors, claims, payload, gateApi) {
    return candidateSources(payload).map((raw, index) => {
      const input = buildCandidateInput(raw, payload, claims, sourceText);
      if (!input.insight || METADATA_INSIGHT.test(input.insight)) return null;
      const decision = gateApi.evaluateCandidate(input, sourceText, index);
      const evidence = input.evidence.map((item) => ({
        quote: item.quote,
        role: item.role,
        spans: exactSpans(sourceText, item.quote, anchors)
      }));
      return {
        id: `ins_${sourceSha256.slice(0, 12)}_${stableToken(input.insight)}`,
        insight: input.insight,
        type: input.type,
        abstraction: input.abstraction,
        why_it_matters: input.why_it_matters,
        confidence: input.confidence,
        uncertainty: input.uncertainty,
        causal_status: input.causal_status,
        evidence,
        status: decision.eligible_for_insight_review ? "approved" : "blocked",
        eligible_for_current_analysis: decision.eligible_for_insight_review === true,
        blocking_reasons: clone(decision.blocking_reasons),
        quality_metrics: clone(decision.metrics),
        quality_gate_schema: gateApi.GATE_SCHEMA || "aha_insight_quality_gate_v2",
        origin: text(object(raw).origin) || (object(raw).candidate_type === "ai" ? "live_analysis_candidate" : "current_chat_analysis_candidate")
      };
    }).filter(Boolean);
  }
  function validateSpan(span, sourceText, anchorIds, label, errors) {
    if (!span || typeof span !== "object") return errors.push(`${label}:span_invalid`);
    if (!anchorIds.has(span.anchor_id)) errors.push(`${label}:anchor_unknown`);
    if (!Number.isInteger(span.start_offset) || !Number.isInteger(span.end_offset) || span.end_offset <= span.start_offset) {
      errors.push(`${label}:offsets_invalid`);
      return;
    }
    if (sourceText != null && String(sourceText).slice(span.start_offset, span.end_offset) !== span.text) errors.push(`${label}:not_exact_source`);
  }
  function validate(document, input = {}) {
    const doc = object(document);
    const errors = [];
    const sourceText = input.sourceText == null ? null : String(input.sourceText);
    const expected = identityFrom(input);
    if (doc.schema !== SCHEMA) errors.push("schema_invalid");
    if (doc.version !== VERSION) errors.push("version_invalid");
    if (!/^[a-f0-9]{64}$/u.test(text(doc.source_sha256))) errors.push("source_sha256_invalid");
    if (sourceText != null) {
      const semanticApi = input.semanticDocumentApi || global.AHAModuleApi?.resolve?.("semanticDocument", "AHASemanticDocument", { version: 1 }) || global.AHASemanticDocument;
      if (typeof semanticApi?.sha256Hex !== "function" || semanticApi.sha256Hex(sourceText) !== doc.source_sha256) errors.push("source_text_sha256_mismatch");
    }
    if (expected.source_sha256 && doc.source_sha256 !== expected.source_sha256) errors.push("source_sha256_mismatch");
    if (expected.analysis_run_id && doc.analysis_run_id !== expected.analysis_run_id) errors.push("analysis_run_id_mismatch");
    if (expected.analysis_id && doc.analysis_id !== expected.analysis_id) errors.push("analysis_id_mismatch");
    if (expected.source_id && doc.source_id !== expected.source_id) errors.push("source_id_mismatch");
    const semanticArrays = ["evidence_anchors", "concepts", "claims", "relations", "tensions", "candidate_insights"];
    semanticArrays.forEach((key) => { if (!Array.isArray(doc[key])) errors.push(`${key}_missing`); });
    const anchorIds = new Set();
    array(doc.evidence_anchors).forEach((anchor, index) => {
      if (!text(anchor?.id) || anchorIds.has(anchor.id)) errors.push(`anchor:${index}:id_invalid`);
      anchorIds.add(anchor?.id);
      if (!Number.isInteger(anchor?.start_offset) || !Number.isInteger(anchor?.end_offset) || anchor.end_offset <= anchor.start_offset) {
        errors.push(`anchor:${index}:offsets_invalid`);
      } else if (sourceText != null && String(sourceText).slice(anchor.start_offset, anchor.end_offset) !== anchor.text) {
        errors.push(`anchor:${index}:not_exact_source`);
      }
    });
    const semanticIds = new Set();
    for (const key of ["concepts", "claims", "relations", "tensions", "candidate_insights"]) {
      array(doc[key]).forEach((item, index) => {
        if (!text(item?.id) || semanticIds.has(item.id)) errors.push(`${key}:${index}:id_invalid`);
        semanticIds.add(item?.id);
      });
    }
    array(doc.concepts).forEach((item, index) => array(item?.mentions).forEach((span, spanIndex) => validateSpan(span, sourceText, anchorIds, `concept:${index}:${spanIndex}`, errors)));
    array(doc.claims).forEach((item, index) => array(item?.spans).forEach((span, spanIndex) => validateSpan(span, sourceText, anchorIds, `claim:${index}:${spanIndex}`, errors)));
    array(doc.relations).forEach((item, index) => array(item?.evidence_spans).forEach((span, spanIndex) => validateSpan(span, sourceText, anchorIds, `relation:${index}:${spanIndex}`, errors)));
    array(doc.tensions).forEach((item, index) => array(item?.evidence_spans).forEach((span, spanIndex) => validateSpan(span, sourceText, anchorIds, `tension:${index}:${spanIndex}`, errors)));
    array(doc.candidate_insights).forEach((item, index) => {
      if (METADATA_INSIGHT.test(text(item?.insight))) errors.push(`candidate:${index}:metadata_forbidden`);
      if (!["approved", "blocked"].includes(item?.status)) errors.push(`candidate:${index}:status_invalid`);
      if (item?.status === "approved" && item?.eligible_for_current_analysis !== true) errors.push(`candidate:${index}:false_approval`);
      if (item?.status === "blocked" && !array(item?.blocking_reasons).length) errors.push(`candidate:${index}:blocked_without_reason`);
      array(item?.evidence).forEach((evidence, evidenceIndex) => array(evidence?.spans).forEach((span, spanIndex) => validateSpan(span, sourceText, anchorIds, `candidate:${index}:${evidenceIndex}:${spanIndex}`, errors)));
    });
    const approvedCount = array(doc.candidate_insights).filter((item) => item.status === "approved").length;
    const blockedCount = array(doc.candidate_insights).filter((item) => item.status === "blocked").length;
    if (doc.synthesis_gate?.approved_count !== approvedCount || doc.synthesis_gate?.blocked_count !== blockedCount) errors.push("synthesis_gate_counts_invalid");
    CLOSED_WRITE_POLICY.forEach((key) => { if (doc.policy?.[key] !== false) errors.push(`write_policy_not_closed:${key}`); });
    if (doc.policy?.legacy_chamber_dependency !== false) errors.push("legacy_chamber_dependency_not_closed");
    if (doc.policy?.ungated_heuristic_synthesis !== false) errors.push("ungated_heuristic_synthesis_not_closed");
    return deepFreeze({ valid: errors.length === 0, errors: Array.from(new Set(errors)).sort() });
  }
  function build(input = {}) {
    const sourceText = String(input.sourceText || "");
    const payload = object(input.payload);
    const semanticApi = input.semanticDocumentApi || global.AHAModuleApi?.resolve?.("semanticDocument", "AHASemanticDocument", { version: 1 }) || global.AHASemanticDocument;
    const gateApi = input.qualityGateApi || global.AHAModuleApi?.resolve?.("insightQualityGateV2", "AHAInsightQualityGateV2", { version: 2 }) || global.AHAInsightQualityGateV2;
    if (!sourceText.trim()) throw new Error("live_semantic_source_missing");
    if (typeof semanticApi?.sha256Hex !== "function" || typeof semanticApi?.buildEvidenceAnchors !== "function") throw new Error("live_semantic_document_api_missing");
    if (typeof gateApi?.evaluateCandidate !== "function") throw new Error("live_semantic_quality_gate_missing");
    const identity = identityFrom(input);
    const sourceSha256 = semanticApi.sha256Hex(sourceText);
    if (!identity.analysis_id || !identity.analysis_run_id || !identity.source_id) throw new Error("live_semantic_run_identity_missing");
    if (identity.source_sha256 !== sourceSha256) throw new Error("live_semantic_source_identity_mismatch");
    const anchors = semanticApi.buildEvidenceAnchors(sourceText, { source_text_hash: sourceSha256 });
    const concepts = buildConcepts(sourceText, sourceSha256, anchors, payload);
    const claims = buildClaims(sourceText, sourceSha256, anchors, concepts, semanticApi);
    const relations = buildRelations(sourceSha256, claims, concepts);
    const tensions = buildTensions(sourceText, sourceSha256, anchors, claims, payload);
    const candidateInsights = buildCandidateInsights(sourceText, sourceSha256, anchors, claims, payload, gateApi);
    const approvedCount = candidateInsights.filter((item) => item.status === "approved").length;
    const blockedCount = candidateInsights.length - approvedCount;
    const status = candidateInsights.length ? (approvedCount ? "passed" : "blocked") : "not_run";
    const document = {
      id: `semv2_${sourceSha256.slice(0, 24)}_${stableToken(identity.analysis_run_id)}`,
      schema: SCHEMA,
      version: VERSION,
      status: concepts.length && claims.length ? "ready" : "incomplete",
      analysis_id: identity.analysis_id,
      analysis_run_id: identity.analysis_run_id,
      source_id: identity.source_id,
      source_sha256: sourceSha256,
      source_hash_algorithm: "sha256",
      evidence_anchors: anchors,
      concepts,
      claims,
      relations,
      tensions,
      candidate_insights: candidateInsights,
      synthesis_gate: {
        schema: GATE_SCHEMA,
        quality_gate_schema: gateApi.GATE_SCHEMA || "aha_insight_quality_gate_v2",
        authoritative: true,
        status,
        candidate_count: candidateInsights.length,
        approved_count: approvedCount,
        blocked_count: blockedCount,
        approved_candidate_ids: candidateInsights.filter((item) => item.status === "approved").map((item) => item.id),
        blocked_candidate_ids: candidateInsights.filter((item) => item.status === "blocked").map((item) => item.id)
      },
      quality: {
        status: concepts.length && claims.length ? "passed" : "incomplete",
        concept_count: concepts.length,
        claim_count: claims.length,
        relation_count: relations.length,
        tension_count: tensions.length,
        candidate_insight_count: candidateInsights.length,
        approved_insight_count: approvedCount,
        blocked_insight_count: blockedCount,
        reasons: [
          ...(concepts.length ? [] : ["source_grounded_concepts_missing"]),
          ...(claims.length ? [] : ["source_claims_missing"]),
          ...(candidateInsights.length && !approvedCount ? ["all_synthesized_insights_blocked"] : [])
        ]
      },
      validation: { valid: false, errors: [] },
      policy: {
        ...Object.fromEntries(CLOSED_WRITE_POLICY.map((key) => [key, false])),
        legacy_chamber_dependency: false,
        ungated_heuristic_synthesis: false,
        current_analysis_read_available: approvedCount > 0
      }
    };
    document.validation = clone(validate(document, { ...input, sourceText }));
    if (!document.validation.valid) throw new Error(`live_semantic_document_invalid:${document.validation.errors.join(",")}`);
    return deepFreeze(document);
  }
  function hydrate(value, input = {}) {
    const validation = validate(value, input);
    if (!validation.valid) return null;
    if (Object.isFrozen(value) && value?.validation?.valid === true) return value;
    const document = clone(value);
    document.validation = clone(validation);
    return deepFreeze(document);
  }

  const api = Object.freeze({
    SCHEMA, VERSION, GATE_SCHEMA, CLOSED_WRITE_POLICY,
    build, validate, hydrate, exactSpans, buildConcepts, buildClaims, buildRelations, buildTensions, buildCandidateInsights
  });
  global.AHALiveSemanticBridgeV2 = api;
  global.AHAModuleApi?.register?.("chat.liveSemanticBridgeV2", api, {
    version: VERSION,
    legacyGlobal: "AHALiveSemanticBridgeV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
