// ahaChatIngestRuntime.js
// Orkestrerer AHA Chat-kandidater inn i kanonisk AHAIngest med eksplisitt legacy-fallback.

(function (global) {
  "use strict";

  function create(deps = {}) {
    const {
      subjectId,
      getInsightsApi,
      getIngestApi,
      getSourcesApi,
      getThemeId,
      getFieldId,
      buildSemanticInsightCandidates,
      generateAIInsightCandidates,
      buildAIState,
      loadChamber,
      saveChamber,
      now = () => new Date().toISOString()
    } = deps;

    function buildChatPayload(text, themeId, fieldId) {
      return {
        source_type: "chat",
        source_app: "aha_chat",
        content_type: "text",
        title: "AHA Chat-melding",
        text,
        user_created: true,
        imported: false,
        created_at: now(),
        subject_id: subjectId,
        theme_id: themeId,
        field_id: fieldId,
        meta: { theme_id: themeId, field_id: fieldId }
      };
    }

    function ingestThroughLegacyFallback(engine, payload, chunks) {
      let chamber = loadChamber();
      chunks.forEach((chunk) => {
        const candidateText = typeof chunk === "string"
          ? chunk
          : String(chunk?.text || chunk?.summary || chunk?.title || "").trim();
        if (!candidateText) return;
        const signal = engine.createSignalFromMessage(
          candidateText,
          subjectId,
          payload.theme_id,
          { field_id: payload.field_id }
        );
        chamber = engine.addSignalToChamber(chamber, signal);
      });
      saveChamber(chamber);

      getSourcesApi()?.addSourceEvent?.({
        source_type: payload.source_type,
        source_app: payload.source_app,
        content_type: payload.content_type,
        title: payload.title,
        text: payload.text,
        user_created: payload.user_created,
        imported: payload.imported,
        created_at: payload.created_at,
        meta: payload.meta
      });
    }

    function ingestUserMessageWithCandidates(messageText, candidates) {
      const text = String(messageText || "").trim();
      const engine = getInsightsApi();
      if (!text || !engine) return 0;

      const themeId = getThemeId();
      const fieldId = getFieldId();
      const localCandidates = buildSemanticInsightCandidates(text, { minInsights: 1, maxInsights: 5 });
      const chunks = Array.isArray(candidates) && candidates.length ? candidates : localCandidates;
      const payload = buildChatPayload(text, themeId, fieldId);
      const ingest = getIngestApi();

      if (ingest && typeof ingest.ingest === "function") {
        if (typeof ingest.ingestWithCandidates === "function") {
          ingest.ingestWithCandidates(payload, chunks);
        } else {
          chunks.forEach((chunk) => ingest.ingest(Object.assign({}, payload, { text: chunk })));
        }
        return chunks.length;
      }

      ingestThroughLegacyFallback(engine, payload, chunks);
      return chunks.length;
    }

    function handleUserMessage(messageText) {
      return ingestUserMessageWithCandidates(messageText);
    }

    async function handleUserMessageInsightCandidatesInBackground(messageText) {
      const text = String(messageText || "").trim();
      if (!text || !getInsightsApi()) return 0;
      const themeId = getThemeId();
      const fieldId = getFieldId();
      const aiCandidates = await generateAIInsightCandidates(text, {
        subject_id: subjectId,
        theme_id: themeId,
        field_id: fieldId,
        ai_state: buildAIState()
      });
      if (!aiCandidates.length) return 0;
      return ingestUserMessageWithCandidates(text, aiCandidates);
    }

    return Object.freeze({
      buildChatPayload,
      ingestUserMessageWithCandidates,
      handleUserMessage,
      handleUserMessageInsightCandidatesInBackground
    });
  }

  const publicApi = Object.freeze({ create });
  global.AHAChatIngestRuntime = publicApi;
  global.AHAModuleApi?.register?.("chat.ingestRuntime", publicApi, {
    version: 1,
    legacyGlobal: "AHAChatIngestRuntime",
    exports: Object.keys(publicApi)
  });
})(typeof window !== "undefined" ? window : globalThis);
