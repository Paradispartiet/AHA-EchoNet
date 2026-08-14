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

    function buildAgentRequestBody(message, options = {}) {
      const memoryContext = options?.memoryContext?.used ? options.memoryContext : null;
      const personalContext = options?.personalContext && typeof options.personalContext === "object"
        ? options.personalContext
        : null;
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
        profile: {}
      };
    }

    async function askAhaAgent(message, options = {}) {
      const apiBase = String(getApiBase() || "").trim().replace(/\/$/, "");
      if (!apiBase) throw new Error("missing_api_base");
      const response = await fetchImpl(`${apiBase}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildAgentRequestBody(message, options))
      });
      if (!response.ok) throw new Error(`chat_http_${response.status}`);
      return response.json();
    }

    return Object.freeze({
      buildAIState,
      buildPersonalContextPayload,
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
