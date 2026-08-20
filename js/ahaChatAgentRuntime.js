// ahaChatAgentRuntime.js
// Bygger AHA-agentens eksplisitte request-kontrakt og eier nettverksgrensen.

(function (global) {
  "use strict";

  function create(deps = {}) {
    const {
      subjectId,
      getApiBase,
      fetchImpl,
      loadChamber,
      getCurrentInsights,
      memoryConceptLabel,
      buildUserMetaProfile
    } = deps;
    let v2ModuleLoadPromise = null;

    function buildAIState(options = {}) {
      if (options?.includeMemory === false) {
        return {
          top_insights: [],
          concepts: [],
          meta_profile: {}
        };
      }

      const chamber = loadChamber();
      const topInsights = getCurrentInsights().slice(0, 8).map((insight) => ({
        id: insight.id,
        title: insight.title || "Innsikt",
        summary: insight.summary || "",
        concepts: (insight.concepts || []).map(memoryConceptLabel).filter(Boolean),
        theme_id: insight.theme_id || null,
        subject_id: insight.subject_id || null
      }));
      const concepts = [];
      topInsights.forEach((insight) => insight.concepts.forEach((concept) => concepts.push(concept)));
      return {
        top_insights: topInsights,
        concepts,
        meta_profile: buildUserMetaProfile(chamber, subjectId) || {}
      };
    }

    function buildPersonalContextPayload(personalContext) {
      if (!personalContext || typeof personalContext !== "object") return null;
      return {
        prompt: personalContext.answerPackage?.prompt || personalContext.prompt || "",
        answer_composer_prompt: personalContext.answerPackage?.prompt || "",
        answer_composer: personalContext.answerPackage || null,
        relevant: personalContext.relevant || {},
        retrieval: personalContext.retrieval || null,
        evidence: personalContext.context?.evidence || {},
        status: personalContext.context ? {
          readinessLevel: personalContext.context.readiness?.level || "ukjent",
          readinessScore: Number(personalContext.context.readiness?.score) || 0,
          approvedCorpus: Number(personalContext.context.evidence?.approvedCorpus) || 0,
          approvedExamples: Number(personalContext.context.evidence?.approvedExamples) || 0,
          confirmedClaims: Number(personalContext.context.evidence?.confirmedClaims) || 0
        } : {}
      };
    }

    function buildV2SemanticContextPayload(value) {
      if (!value || typeof value !== "object" || Array.isArray(value) || value.used !== true) return null;
      if (value.schema !== "aha_v2_chat_readonly_context_v1" || value.mode !== "read_only") return null;
      const policy = value.policy && typeof value.policy === "object" ? value.policy : {};
      const forbiddenAuthority = [
        "authoritative_for_chat",
        "current_user_claim_authority",
        "production_gate_authority",
        "activation_authority",
        "chamber_write",
        "canonical_write",
        "meta_write",
        "persistent_write",
        "remote_write",
        "normal_chat_persistence_authority"
      ].some((key) => policy[key] !== false);
      if (forbiddenAuthority) return null;

      const insights = (Array.isArray(value.insights) ? value.insights : []).slice(0, 6).map((insight) => ({
        id: String(insight?.id || ""),
        title: String(insight?.title || "").slice(0, 180),
        summary: String(insight?.summary || "").slice(0, 600),
        type: String(insight?.type || "insight").slice(0, 80),
        causal_status: String(insight?.causal_status || "unknown").slice(0, 80),
        relevance: Number(insight?.relevance) || 0,
        quality_score: Number(insight?.quality_score) || 0,
        concept_keys: (Array.isArray(insight?.concept_keys) ? insight.concept_keys : []).slice(0, 12).map((item) => String(item || "").slice(0, 120)),
        source_refs: (Array.isArray(insight?.source_refs) ? insight.source_refs : []).slice(0, 8).map((entry) => ({
          field: String(entry?.field || "").slice(0, 80),
          value: String(entry?.value || "").slice(0, 240)
        })).filter((entry) => entry.field && entry.value)
      })).filter((insight) => insight.id && insight.summary);
      if (!insights.length) return null;

      return {
        schema: "aha_v2_chat_readonly_context_v1",
        version: 1,
        mode: "read_only",
        used: true,
        gate_id: String(value.gate_id || ""),
        projection_id: String(value.projection_id || ""),
        source_hash: String(value.source_hash || ""),
        insights,
        concepts: (Array.isArray(value.concepts) ? value.concepts : []).slice(0, 12).map((concept) => ({
          id: String(concept?.id || ""),
          key: String(concept?.key || "").slice(0, 120),
          label: String(concept?.label || "").slice(0, 180),
          insight_ids: (Array.isArray(concept?.insight_ids) ? concept.insight_ids : []).slice(0, 6).map(String)
        })).filter((concept) => concept.id && concept.label),
        resonance_edges: (Array.isArray(value.resonance_edges) ? value.resonance_edges : []).slice(0, 8).map((edge) => ({
          id: String(edge?.id || ""),
          from: String(edge?.from || ""),
          to: String(edge?.to || ""),
          confidence: Number(edge?.confidence) || 0,
          dedupe_eligible: false
        })).filter((edge) => edge.from && edge.to),
        usage_rules: (Array.isArray(value.usage_rules) ? value.usage_rules : []).slice(0, 8).map((rule) => String(rule || "").slice(0, 160)),
        policy: {
          authoritative_for_chat: false,
          current_user_claim_authority: false,
          production_gate_authority: false,
          activation_authority: false,
          chamber_write: false,
          canonical_write: false,
          meta_write: false,
          persistent_write: false,
          remote_write: false,
          normal_chat_persistence_authority: false
        }
      };
    }

    function readChatMemoryControlState() {
      const chat = global.AHAChat;
      if (!chat || typeof chat.isAhaSavingEnabled !== "function" || typeof chat.isAhaMemoryUseEnabled !== "function") {
        return { available: false, savingEnabled: true, memoryUseEnabled: false };
      }
      try {
        return {
          available: true,
          savingEnabled: chat.isAhaSavingEnabled() !== false,
          memoryUseEnabled: chat.isAhaMemoryUseEnabled() !== false
        };
      } catch {
        return { available: false, savingEnabled: true, memoryUseEnabled: false };
      }
    }

    function selectedMemoryInsights(memoryContext) {
      return (Array.isArray(memoryContext?.selectedInsights) ? memoryContext.selectedInsights : [])
        .map((entry) => entry?.insight && typeof entry.insight === "object" ? entry.insight : entry)
        .filter((entry) => entry && typeof entry === "object");
    }

    async function ensureV2ChatReadOnlyContextApi() {
      if (global.AHAV2ChatReadOnlyContext?.build) return global.AHAV2ChatReadOnlyContext;
      if (v2ModuleLoadPromise) return v2ModuleLoadPromise;
      const base = global.document?.baseURI || global.location?.href || "";
      if (!base || typeof URL !== "function") return null;
      const modulePaths = [
        "js/ahaInsightRelationClassifierV2.js",
        "js/ahaInsightSaturationV2.js",
        "js/ahaKnowledgeMigrationV2.js",
        "js/ahaSemanticProjectionsV2.js",
        "js/ahaV2ProductIntegrationGate.js",
        "js/ahaV2ChatReadOnlyContext.js"
      ];
      v2ModuleLoadPromise = (async () => {
        for (const path of modulePaths) {
          await import(new URL(path, base).href);
        }
        return global.AHAV2ChatReadOnlyContext?.build ? global.AHAV2ChatReadOnlyContext : null;
      })().catch((error) => {
        global.console?.warn?.("AHA V2 read-only Chat context kunne ikke lastes", error?.message || error);
        return null;
      });
      return v2ModuleLoadPromise;
    }

    async function buildAutomaticV2SemanticContext(message, options = {}) {
      if (options?.semanticContextV2) return options.semanticContextV2;
      const memoryContext = options?.memoryContext?.used ? options.memoryContext : null;
      if (!memoryContext) return null;
      const controls = readChatMemoryControlState();
      if (!controls.available || controls.savingEnabled !== false || controls.memoryUseEnabled !== true) return null;
      const insights = selectedMemoryInsights(memoryContext);
      if (!insights.length) return null;
      const builder = await ensureV2ChatReadOnlyContextApi();
      if (!builder?.build) return null;
      try {
        const built = builder.build({
          source_text: message,
          legacy_insights: insights,
          memory_allowed: true,
          persistence_disabled: true
        });
        return built?.used === true ? built : null;
      } catch (error) {
        global.console?.warn?.("AHA V2 read-only Chat context ble droppet", error?.message || error);
        return null;
      }
    }

    function buildAgentRequestBody(message, options = {}) {
      const memoryContext = options?.memoryContext?.used ? options.memoryContext : null;
      const personalContext = options?.personalContext && typeof options.personalContext === "object"
        ? options.personalContext
        : null;
      const semanticContextV2 = buildV2SemanticContextPayload(options?.semanticContextV2);
      return {
        message,
        ai_state: buildAIState({
          includeMemory: Boolean(memoryContext),
          includePersonalContext: Boolean(personalContext?.prompt)
        }),
        memory_context: memoryContext,
        personal_context: buildPersonalContextPayload(personalContext),
        // Bakoverkompatibelt felt for eldre agentkode, men fylles bare når
        // Memory Relevance Gate faktisk har valgt relevante minnetreff.
        similar_insights: memoryContext?.semanticMatches || [],
        // Serverens eksisterende profile-felt transporterer den nye V2-
        // konteksten uten å blande den inn i Chamber/minne/ai_state. Feltet er
        // kun non-authoritative read-only context og åpner ingen skrivebane.
        profile: semanticContextV2 ? { semantic_context_v2: semanticContextV2 } : {}
      };
    }

    async function askAhaAgent(message, options = {}) {
      const apiBase = String(getApiBase() || "").trim().replace(/\/$/, "");
      if (!apiBase) throw new Error("missing_api_base");
      const semanticContextV2 = await buildAutomaticV2SemanticContext(message, options);
      const requestOptions = semanticContextV2 === options?.semanticContextV2
        ? options
        : { ...options, semanticContextV2 };
      const response = await fetchImpl(`${apiBase}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildAgentRequestBody(message, requestOptions))
      });
      if (!response.ok) throw new Error(`chat_http_${response.status}`);
      return response.json();
    }

    return Object.freeze({
      buildAIState,
      buildPersonalContextPayload,
      buildV2SemanticContextPayload,
      readChatMemoryControlState,
      selectedMemoryInsights,
      ensureV2ChatReadOnlyContextApi,
      buildAutomaticV2SemanticContext,
      buildAgentRequestBody,
      askAhaAgent
    });
  }

  const publicApi = Object.freeze({ create });
  global.AHAChatAgentRuntime = publicApi;
  global.AHAModuleApi?.register?.("chat.agentRuntime", publicApi, {
    version: 1,
    legacyGlobal: "AHAChatAgentRuntime",
    exports: Object.keys(publicApi)
  });
})(typeof window !== "undefined" ? window : globalThis);
