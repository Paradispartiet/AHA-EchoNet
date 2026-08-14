// Offentlig Chat-fasade, kompatibilitetsglobaler og test-hook-eksponering.

(function (global) {
  "use strict";

  const TEST_HOOK_EXPORTS = Object.freeze([
    "detectTextType", "buildCanonicalAnalysis", "buildAhaAnalysisExportBundle",
    "formatAhaAnalysisExportMarkdown", "buildAutoOutputs", "renderAutoOutputs",
    "detectAutoAnalysisDomain", "buildAcademicConceptCandidates",
    "buildSourceGroundedAcademicPayload", "applyRuntimeKnowledgePolicy",
    "isTransientAnalysisDocument", "AHA_RUNTIME_KNOWLEDGE_POLICY", "normalizeFagkoblinger",
    "resolveCanonicalAnalysisWithOptionalPythonEngine", "isAhaMemoryQuestion",
    "buildAhaLearningContractReply", "buildAhaMemoryStatus", "shouldUseAhaMemory",
    "buildAhaMemoryContext", "buildAhaMemoryOffContext", "loadAhaMemoryControls",
    "saveAhaMemoryControls", "setAhaMemoryControl", "isAhaSavingEnabled",
    "isAhaMemoryUseEnabled", "loadAhaMemoryExclusions", "saveAhaMemoryExclusions",
    "getAhaMemoryInsightStableKey", "getAhaMemoryInsightKey", "isAhaMemoryInsightExcluded",
    "excludeAhaMemoryInsight", "includeAhaMemoryInsight", "resetAhaMemoryExclusions",
    "getAhaExcludedMemoryItems", "renderAhaMemoryControls", "bindAhaMemoryControls",
    "submitAhaChatMessage", "findRelevantLocalMemory", "formatAhaMemoryContextForAgent",
    "isAhaMemoryDebugEnabled", "buildAhaMemoryTransparency",
    "formatAhaMemoryTransparencyDetails", "renderAhaMemoryTransparency", "appendChat",
    "updateAnswerActionsVisibility", "getActiveMetaAiSession", "startMetaAiSession",
    "renderMetaAiSessionBox", "renderMetaAiClaims", "maybeHandleMetaAiAgentReply",
    "saveMetaAiClaimFeedback", "buildAhaPersonalAiLoopChatReadinessStatus",
    "renderAhaPersonalAiLoopStatus", "buildAhaAnswerPackage", "renderAhaAnswerComposer",
    "createAnalysisRun", "updateAnalysisRun", "bindAnalysisArtifact",
    "artifactMatchesActiveRun", "clearActiveAnalysisState", "renderAutoOutputPayload",
    "enforceCanonicalSourceGrounding", "filterRetrievalForActiveSource",
    "scoreRetrievalAgainstSource", "filterMemoryContextForActiveSource", "isActiveAnalysisRun"
  ]);

  const CHAT_EXPORTS = Object.freeze([
    "loadChamberFromStorage", "saveChamberToStorage", "handleUserMessage", "askAhaAgent",
    "buildAIState", "isAhaMemoryQuestion", "buildAhaLearningContractReply",
    "buildAhaMemoryStatus", "shouldUseAhaMemory", "buildAhaMemoryContext",
    "buildAhaMemoryOffContext", "loadAhaMemoryControls", "saveAhaMemoryControls",
    "setAhaMemoryControl", "isAhaSavingEnabled", "isAhaMemoryUseEnabled",
    "loadAhaMemoryExclusions", "saveAhaMemoryExclusions", "getAhaMemoryInsightStableKey",
    "getAhaMemoryInsightKey", "isAhaMemoryInsightExcluded", "excludeAhaMemoryInsight",
    "includeAhaMemoryInsight", "resetAhaMemoryExclusions", "getAhaExcludedMemoryItems",
    "renderAhaMemoryControls", "bindAhaMemoryControls", "submitAhaChatMessage",
    "findRelevantLocalMemory", "formatAhaMemoryContextForAgent", "isAhaMemoryDebugEnabled",
    "buildAhaMemoryTransparency", "formatAhaMemoryTransparencyDetails",
    "renderAhaMemoryTransparency", "appendChat", "updateAhaMemoryStatus",
    "buildAhaPersonalAiLoopChatReadinessStatus", "renderAhaPersonalAiLoopStatus",
    "buildAhaAnswerPackage", "renderAhaAnswerComposer", "createAnalysisRun",
    "updateAnalysisRun", "bindAnalysisArtifact", "artifactMatchesActiveRun",
    "clearActiveAnalysisState", "renderAutoOutputPayload", "filterRetrievalForActiveSource",
    "scoreRetrievalAgainstSource", "filterMemoryContextForActiveSource", "isActiveAnalysisRun"
  ]);

  const COMPATIBILITY_EXPORTS = Object.freeze([
    "refreshAhaExplorer", "showSavedAfterwork", "showMeta", "loadChamberFromStorage",
    "saveChamberToStorage", "loadAhaMemoryControls", "setAhaMemoryControl",
    "resetAhaMemoryControls", "isAhaMemoryDebugEnabled", "loadAhaMemoryExclusions",
    "excludeAhaMemoryInsight", "includeAhaMemoryInsight", "resetAhaMemoryExclusions",
    "getAhaExcludedMemoryItems", "isAhaMemoryInsightExcluded", "getActiveAnalysisRun",
    "isActiveAnalysisRun", "artifactMatchesActiveRun", "bindAnalysisArtifact", "bind"
  ]);

  const REQUIRED_BINDINGS = Object.freeze(Array.from(new Set([
    ...TEST_HOOK_EXPORTS,
    ...CHAT_EXPORTS,
    ...COMPATIBILITY_EXPORTS
  ])));

  function pick(source, names) {
    const out = {};
    names.forEach((name) => { out[name] = source[name]; });
    return out;
  }

  function create(deps = {}) {
    const bindings = deps.bindings;
    if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) {
      throw new Error("AHAChatRuntimeFacade mangler avhengighet: bindings");
    }
    REQUIRED_BINDINGS.forEach((name) => {
      if (!(name in bindings)) throw new Error(`AHAChatRuntimeFacade mangler binding: ${name}`);
      if (name !== "AHA_RUNTIME_KNOWLEDGE_POLICY" && typeof bindings[name] !== "function") {
        throw new Error(`AHAChatRuntimeFacade krever funksjonsbinding: ${name}`);
      }
    });

    const documentRef = deps.document || global.document;
    let installed = null;

    function install() {
      if (installed) return installed;
      const chatApi = pick(bindings, CHAT_EXPORTS);
      const testHooks = Object.assign({}, global.AHATestHooks || {}, pick(bindings, TEST_HOOK_EXPORTS));

      global.refreshAhaExplorer = bindings.refreshAhaExplorer;
      global.showSavedAfterwork = bindings.showSavedAfterwork;
      global.showMeta = bindings.showMeta;
      global.loadChamberFromStorage = global.loadChamberFromStorage || bindings.loadChamberFromStorage;
      global.saveChamberToStorage = global.saveChamberToStorage || bindings.saveChamberToStorage;
      global.AHATestHooks = testHooks;

      global.AHAMemoryControls = {
        get() { return bindings.loadAhaMemoryControls(); },
        set(key, value) { return bindings.setAhaMemoryControl(key, value); },
        enableSaving() { return bindings.setAhaMemoryControl("saveNewInsights", true); },
        disableSaving() { return bindings.setAhaMemoryControl("saveNewInsights", false); },
        enableMemoryUse() { return bindings.setAhaMemoryControl("useExistingMemory", true); },
        disableMemoryUse() { return bindings.setAhaMemoryControl("useExistingMemory", false); },
        reset() { return bindings.resetAhaMemoryControls(); }
      };

      global.AHAMemoryDebug = {
        enable() { global.localStorage?.setItem("aha_memory_debug", "true"); },
        disable() { global.localStorage?.removeItem("aha_memory_debug"); },
        isEnabled() { return bindings.isAhaMemoryDebugEnabled(); }
      };

      global.AHAMemoryExclusions = {
        get() { return bindings.loadAhaMemoryExclusions(); },
        exclude(insightOrId, reason) { return bindings.excludeAhaMemoryInsight(insightOrId, reason); },
        include(insightOrId) { return bindings.includeAhaMemoryInsight(insightOrId); },
        reset() { return bindings.resetAhaMemoryExclusions(); },
        items() { return bindings.getAhaExcludedMemoryItems(); },
        isExcluded(insightOrId) { return bindings.isAhaMemoryInsightExcluded(insightOrId); }
      };

      global.AHAActiveRun = {
        get() { return bindings.getActiveAnalysisRun(); },
        isActive(run) { return bindings.isActiveAnalysisRun(run); },
        matches(artifact) { return bindings.artifactMatchesActiveRun(artifact, bindings.getActiveAnalysisRun()); },
        bind(artifact) { return bindings.bindAnalysisArtifact(artifact, bindings.getActiveAnalysisRun()); }
      };

      global.AHAChat = chatApi;
      global.AHAModuleApi?.register?.("chat", chatApi, {
        version: 1,
        legacyGlobal: "AHAChat",
        exports: CHAT_EXPORTS
      });

      if (documentRef?.readyState === "loading") documentRef.addEventListener("DOMContentLoaded", bindings.bind);
      else bindings.bind();

      installed = Object.freeze({ chatApi, testHooks });
      return installed;
    }

    return Object.freeze({ install });
  }

  const publicApi = Object.freeze({ create, TEST_HOOK_EXPORTS, CHAT_EXPORTS, REQUIRED_BINDINGS });
  global.AHAChatRuntimeFacade = publicApi;
  global.AHAModuleApi?.register?.("chat.runtimeFacade", publicApi, {
    version: 1,
    legacyGlobal: "AHAChatRuntimeFacade",
    exports: Object.keys(publicApi)
  });
})(window);
