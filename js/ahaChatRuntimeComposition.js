// Avsluttende komposisjonsrot for AHA Chat-runtime.

(function (global) {
  "use strict";

  const REQUIRED_MODULE_METHODS = Object.freeze({
    export: "createRuntime",
    autoOutputView: "createRuntime",
    replyFormat: "createSubjectPolicy",
    runContext: "createSubmissionRuntime",
    knowledgeView: "create",
    uiRuntime: "create",
    runtimeFacade: "create"
  });

  const REQUIRED_CONFIG = Object.freeze([
    "subjectId", "threadId", "pendingPromptKey", "highlightsStorageKey", "afterworkStorageKey"
  ]);

  const REQUIRED_BINDINGS = Object.freeze([
    "loadAutoOutputs", "analysisRunContract", "getActiveAnalysisRun", "loadAfterworkEntries",
    "sourceHash", "buildCanonicalAnalysis", "normalizeSubjectLinks", "normalizeFagkoblinger",
    "isAcademicLikeType", "loadChamberFromStorage", "saveChamberToStorage", "getInsightsApi",
    "setStatusNote", "out", "AHA_RUNTIME_KNOWLEDGE_POLICY", "buildAutoOutputs", "detectTextType",
    "short", "buildAutoOutputFallbackPayload", "getUrlDominanceInfo",
    "buildArticleSourceTextFromAnalysis", "detectAutoAnalysisDomain", "normalizeSubjectMatches",
    "subjectMatchesFromCalibration", "getLiterarySubjectMatches", "getLiteraryAttachmentLearningPath",
    "isSportsArticleAnalysis", "applyRuntimeKnowledgePolicy", "filterCrossDomainAutoPayload",
    "enforceCanonicalSourceGrounding", "resolveCanonicalAnalysisWithOptionalPythonEngine",
    "isActiveAnalysisRun", "bindAnalysisArtifact", "updateAnalysisRun", "renderAutoOutputPayload",
    "setExportButtonsEnabled", "saveAutoOutputs", "setActiveAnalysisRun", "takeKeywords",
    "refreshAhaExplorer", "getInstitutionalMediaHistorySubjectMatches", "updateEmptyState",
    "isTransientAnalysisDocument", "isAhaSavingEnabled", "getThemeId", "getFieldId",
    "handleUserMessage", "handleUserMessageInsightCandidatesInBackground", "isAhaMemoryQuestion",
    "buildAhaMemoryStatus", "renderAhaMemoryStatus", "buildAhaLearningContractReply",
    "updateAhaMemoryStatus", "isAhaMemoryUseEnabled", "buildAhaMemoryContext",
    "buildAhaMemoryOffContext", "filterMemoryContextForActiveSource", "suggestCategoryChips",
    "filterRetrievalForActiveSource", "buildAhaPersonalMessageContext", "buildAhaAnswerPackage",
    "renderAhaPersonalRetrieval", "renderAhaAnswerComposer", "renderAhaPersonalContextStatus",
    "renderAhaPersonalAiLoopStatus", "createAnalysisRun", "clearActiveAnalysisState", "askAhaAgent",
    "cleanArticleText", "enrichSubjectMatchesForClimateConflict",
    "enrichSubjectMatchesForPublicAdministration", "normalizeAhaVisibleReply",
    "evaluateAhaAnswerForChat", "ensureAfterworkForLatestAnalysis", "renderAhaChatMemoryStatus",
    "appendChat", "setAhaProcessing", "loadAfterworkEntries", "currentInsights",
    "filterConceptLabels", "canonicalizeDisplayConcept", "normalizeConceptKey",
    "getCanonicalConceptLabel", "getCanonicalConceptKey", "isBlockedStandaloneConcept", "escHtml",
    "extractAcademicPhraseConcepts", "extractAcademicTheoryLinks", "prioritizeVisibleConceptEdges",
    "isGenericDisplayConcept", "normalizeAfterworkConcept", "applyPhraseConceptDisplayPreference",
    "detectPublicAdministrationReformSignal", "readLatestAcademicContext", "renderAuxPanel",
    "renderPanel", "showInsights", "showSavedAfterwork", "clearChamberStorage", "clearAutoOutputs",
    "resetAnalysisStateView", "bindAhaMemoryControls", "bindPanelActionHandler", "renderHighlightsRail",
    "buildAIState", "buildAcademicConceptCandidates", "buildSourceGroundedAcademicPayload",
    "shouldUseAhaMemory", "loadAhaMemoryControls", "saveAhaMemoryControls", "setAhaMemoryControl",
    "resetAhaMemoryControls", "loadAhaMemoryExclusions", "saveAhaMemoryExclusions",
    "getAhaMemoryInsightStableKey", "getAhaMemoryInsightKey", "isAhaMemoryInsightExcluded",
    "excludeAhaMemoryInsight", "includeAhaMemoryInsight", "resetAhaMemoryExclusions",
    "getAhaExcludedMemoryItems", "renderAhaMemoryControls", "findRelevantLocalMemory",
    "formatAhaMemoryContextForAgent", "isAhaMemoryDebugEnabled", "buildAhaMemoryTransparency",
    "formatAhaMemoryTransparencyDetails", "updateAnswerActionsVisibility", "scoreRetrievalAgainstSource",
    "artifactMatchesActiveRun"
  ]);

  function requireObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`AHAChatRuntimeComposition mangler avhengighet: ${label}`);
    }
    return value;
  }

  function create(deps = {}) {
    const config = requireObject(deps.config, "config");
    const modules = requireObject(deps.modules, "modules");
    const b = requireObject(deps.bindings, "bindings");

    REQUIRED_CONFIG.forEach((name) => {
      if (typeof config[name] !== "string" || !config[name]) {
        throw new Error(`AHAChatRuntimeComposition mangler config: ${name}`);
      }
    });
    Object.entries(REQUIRED_MODULE_METHODS).forEach(([name, method]) => {
      if (typeof modules[name]?.[method] !== "function") {
        throw new Error(`AHAChatRuntimeComposition krever modulmetode: ${name}.${method}`);
      }
    });
    REQUIRED_BINDINGS.forEach((name) => {
      if (!(name in b)) throw new Error(`AHAChatRuntimeComposition mangler binding: ${name}`);
    });

    const exportRuntime = modules.export.createRuntime({
      loadAutoOutputs: b.loadAutoOutputs,
      analysisRunContract: b.analysisRunContract,
      getActiveAnalysisRun: b.getActiveAnalysisRun,
      loadAfterworkEntries: b.loadAfterworkEntries,
      sourceHash: b.sourceHash,
      buildCanonicalAnalysis: b.buildCanonicalAnalysis,
      normalizeSubjectLinks: b.normalizeSubjectLinks,
      normalizeFagkoblinger: b.normalizeFagkoblinger,
      isAcademicLikeType: b.isAcademicLikeType,
      loadChamberFromStorage: b.loadChamberFromStorage,
      buildMetaProfile: (chamber) => {
        const insights = b.getInsightsApi();
        return typeof insights?.buildMetaProfile === "function"
          ? (insights.buildMetaProfile(chamber) || {})
          : (chamber?.meta || {});
      },
      setStatusNote: b.setStatusNote,
      out: b.out
    });
    if (!exportRuntime) throw new Error("AHAChatExportRuntime må lastes før ahaChat.js.");

    const autoOutputRuntime = modules.autoOutputView.createRuntime({
      defaultConversationId: config.threadId,
      runtimeKnowledgePolicy: b.AHA_RUNTIME_KNOWLEDGE_POLICY,
      getActiveAnalysisRun: b.getActiveAnalysisRun,
      sourceHash: b.sourceHash,
      buildAutoOutputs: b.buildAutoOutputs,
      detectTextType: b.detectTextType,
      short: b.short,
      buildAutoOutputFallbackPayload: b.buildAutoOutputFallbackPayload,
      getUrlDominanceInfo: b.getUrlDominanceInfo,
      buildArticleSourceTextFromAnalysis: b.buildArticleSourceTextFromAnalysis,
      detectAutoAnalysisDomain: b.detectAutoAnalysisDomain,
      normalizeSubjectMatches: b.normalizeSubjectMatches,
      subjectMatchesFromCalibration: b.subjectMatchesFromCalibration,
      getLiterarySubjectMatches: b.getLiterarySubjectMatches,
      getLiteraryAttachmentLearningPath: b.getLiteraryAttachmentLearningPath,
      isSportsArticleAnalysis: b.isSportsArticleAnalysis,
      applyRuntimeKnowledgePolicy: b.applyRuntimeKnowledgePolicy,
      filterCrossDomainAutoPayload: b.filterCrossDomainAutoPayload,
      enforceCanonicalSourceGrounding: b.enforceCanonicalSourceGrounding,
      buildCanonicalAnalysis: b.buildCanonicalAnalysis,
      resolveCanonicalAnalysisWithOptionalPythonEngine: b.resolveCanonicalAnalysisWithOptionalPythonEngine,
      isActiveAnalysisRun: b.isActiveAnalysisRun,
      bindAnalysisArtifact: b.bindAnalysisArtifact,
      updateAnalysisRun: b.updateAnalysisRun,
      renderAutoOutputPayload: b.renderAutoOutputPayload,
      setExportButtonsEnabled: b.setExportButtonsEnabled,
      loadAutoOutputs: b.loadAutoOutputs,
      saveAutoOutputs: b.saveAutoOutputs,
      setActiveAnalysisRun: b.setActiveAnalysisRun,
      takeKeywords: b.takeKeywords,
      refreshAhaExplorer: b.refreshAhaExplorer
    });
    if (!autoOutputRuntime) throw new Error("AHAChatAutoOutputRuntime må lastes før ahaChat.js.");

    const replySubjectPolicy = modules.replyFormat.createSubjectPolicy({
      detectAutoAnalysisDomain: b.detectAutoAnalysisDomain,
      getLiterarySubjectMatches: b.getLiterarySubjectMatches,
      getInstitutionalMediaHistorySubjectMatches: b.getInstitutionalMediaHistorySubjectMatches
    });
    if (!replySubjectPolicy) throw new Error("AHAChatReplySubjectPolicy må lastes før ahaChat.js.");

    const metaAiSession = modules.metaInsightsAgent?.createChatSession?.({
      updateEmptyState: b.updateEmptyState,
      setStatusNote: b.setStatusNote
    }) || {
      getActiveMetaAiSession: () => null,
      renderMetaAiSessionBox: () => null,
      startMetaAiSession: () => null,
      saveMetaAiClaimFeedback: () => null,
      renderMetaAiClaims: () => null,
      maybeHandleMetaAiAgentReply: () => null
    };

    const submissionRuntime = modules.runContext.createSubmissionRuntime({
      config: { threadId: config.threadId, subjectId: config.subjectId },
      input: {
        getUrlDominanceInfo: b.getUrlDominanceInfo,
        isTransientAnalysisDocument: b.isTransientAnalysisDocument,
        isAhaSavingEnabled: b.isAhaSavingEnabled,
        getThemeId: b.getThemeId,
        getFieldId: b.getFieldId,
        handleUserMessage: b.handleUserMessage,
        handleUserMessageInsightCandidatesInBackground: b.handleUserMessageInsightCandidatesInBackground
      },
      memory: {
        isMemoryQuestion: b.isAhaMemoryQuestion,
        buildMemoryStatus: b.buildAhaMemoryStatus,
        renderMemoryStatus: b.renderAhaMemoryStatus,
        buildLearningContractReply: b.buildAhaLearningContractReply,
        updateMemoryStatus: b.updateAhaMemoryStatus,
        isMemoryUseEnabled: b.isAhaMemoryUseEnabled,
        buildMemoryContext: b.buildAhaMemoryContext,
        buildMemoryOffContext: b.buildAhaMemoryOffContext,
        filterMemoryContextForActiveSource: b.filterMemoryContextForActiveSource,
        suggestCategoryChips: b.suggestCategoryChips
      },
      retrieval: {
        filterForActiveSource: b.filterRetrievalForActiveSource,
        buildPersonalMessageContext: b.buildAhaPersonalMessageContext,
        buildAnswerPackage: b.buildAhaAnswerPackage,
        renderPersonalRetrieval: b.renderAhaPersonalRetrieval,
        renderAnswerComposer: b.renderAhaAnswerComposer,
        renderPersonalContextStatus: b.renderAhaPersonalContextStatus,
        renderPersonalAiLoopStatus: b.renderAhaPersonalAiLoopStatus
      },
      analysis: {
        createAnalysisRun: b.createAnalysisRun,
        updateAnalysisRun: b.updateAnalysisRun,
        setActiveAnalysisRun: b.setActiveAnalysisRun,
        clearActiveAnalysisState: b.clearActiveAnalysisState,
        isActiveAnalysisRun: b.isActiveAnalysisRun,
        buildArticleSourceTextFromAnalysis: b.buildArticleSourceTextFromAnalysis,
        askAgent: b.askAhaAgent,
        cleanArticleText: b.cleanArticleText,
        detectTextType: b.detectTextType,
        enrichSubjectMatchesForClimateConflict: b.enrichSubjectMatchesForClimateConflict,
        enrichSubjectMatchesForPublicAdministration: b.enrichSubjectMatchesForPublicAdministration,
        detectAutoAnalysisDomain: b.detectAutoAnalysisDomain,
        getLiterarySubjectMatches: b.getLiterarySubjectMatches,
        getInstitutionalMediaHistorySubjectMatches: b.getInstitutionalMediaHistorySubjectMatches,
        stripFagkoblingerSections: replySubjectPolicy.stripFagkoblingerSections,
        forceLiteraryFagkoblingerInReply: replySubjectPolicy.forceLiteraryFagkoblingerInReply,
        forceInstitutionalMediaHistoryFagkoblingerInReply: replySubjectPolicy.forceInstitutionalMediaHistoryFagkoblingerInReply,
        normalizeVisibleReply: b.normalizeAhaVisibleReply,
        evaluateAnswerForChat: b.evaluateAhaAnswerForChat,
        maybeHandleMetaAiAgentReply: metaAiSession.maybeHandleMetaAiAgentReply,
        renderAutoOutputs: autoOutputRuntime.renderAutoOutputs,
        ensureAfterworkForLatestAnalysis: b.ensureAfterworkForLatestAnalysis
      },
      ui: {
        renderChatMemoryStatus: b.renderAhaChatMemoryStatus,
        appendChat: b.appendChat,
        setProcessing: b.setAhaProcessing,
        setStatusNote: b.setStatusNote
      }
    });
    if (!submissionRuntime) throw new Error("AHAChatSubmissionRuntime må lastes før ahaChat.js.");

    const knowledgeView = modules.knowledgeView.create({
      subjectId: config.subjectId,
      loadChamberFromStorage: b.loadChamberFromStorage,
      loadAutoOutputs: b.loadAutoOutputs,
      loadAfterworkEntries: b.loadAfterworkEntries,
      getThemeId: b.getThemeId,
      out: b.out,
      currentInsights: b.currentInsights,
      filterConceptLabels: b.filterConceptLabels,
      canonicalizeDisplayConcept: b.canonicalizeDisplayConcept,
      normalizeConceptKey: b.normalizeConceptKey,
      getCanonicalConceptLabel: b.getCanonicalConceptLabel,
      getCanonicalConceptKey: b.getCanonicalConceptKey,
      isBlockedStandaloneConcept: b.isBlockedStandaloneConcept,
      escHtml: b.escHtml,
      extractAcademicPhraseConcepts: b.extractAcademicPhraseConcepts,
      extractAcademicTheoryLinks: b.extractAcademicTheoryLinks,
      prioritizeVisibleConceptEdges: b.prioritizeVisibleConceptEdges,
      isGenericDisplayConcept: b.isGenericDisplayConcept,
      normalizeAfterworkConcept: b.normalizeAfterworkConcept,
      applyPhraseConceptDisplayPreference: b.applyPhraseConceptDisplayPreference,
      detectPublicAdministrationReformSignal: b.detectPublicAdministrationReformSignal,
      readLatestAcademicContext: b.readLatestAcademicContext,
      detectAutoAnalysisDomain: b.detectAutoAnalysisDomain,
      renderAuxPanel: b.renderAuxPanel,
      renderPanel: b.renderPanel
    });
    if (!knowledgeView) throw new Error("AHAChatKnowledgeView må lastes før ahaChat.js.");

    const uiRuntime = modules.uiRuntime.create({
      pendingPromptKey: config.pendingPromptKey,
      highlightsStorageKey: config.highlightsStorageKey,
      afterworkStorageKey: config.afterworkStorageKey,
      submitMessage: submissionRuntime.submitAhaChatMessage,
      showInsights: b.showInsights,
      showStatus: knowledgeView.showStatus,
      showConcepts: knowledgeView.showConcepts,
      showMeta: knowledgeView.showMeta,
      showKnowledgeMap: knowledgeView.showKnowledgeMap,
      showSavedAfterwork: b.showSavedAfterwork,
      exportAnalysisJson: exportRuntime.exportAhaAnalysisJson,
      copyAnalysisMarkdown: exportRuntime.copyAhaAnalysisExportMarkdown,
      clearChamber: b.clearChamberStorage,
      clearAutoOutputs: b.clearAutoOutputs,
      out: b.out,
      setStatusNote: b.setStatusNote,
      resetAnalysisView: b.resetAnalysisStateView,
      focusAutoCard: autoOutputRuntime.focusAutoCard,
      bindMemoryControls: b.bindAhaMemoryControls,
      bindPanelActions: b.bindPanelActionHandler,
      setProcessing: b.setAhaProcessing,
      restoreAutoOutput: autoOutputRuntime.restoreAutoOutputFromStorage,
      startMetaAiSession: metaAiSession.startMetaAiSession,
      updateMemoryStatus: b.updateAhaMemoryStatus,
      renderChatMemoryStatus: b.renderAhaChatMemoryStatus,
      renderPersonalContextStatus: b.renderAhaPersonalContextStatus,
      updateEmptyState: b.updateEmptyState,
      renderHighlightsRail: b.renderHighlightsRail
    });
    if (!uiRuntime) throw new Error("AHAChatUiRuntime må lastes før ahaChat.js.");

    const runtimeFacade = modules.runtimeFacade.create({
      bindings: {
        ...b,
        showMeta: knowledgeView.showMeta,
        bind: uiRuntime.bind,
        submitAhaChatMessage: submissionRuntime.submitAhaChatMessage,
        buildAhaAnalysisExportBundle: exportRuntime.buildAhaAnalysisExportBundle,
        formatAhaAnalysisExportMarkdown: exportRuntime.formatAhaAnalysisExportMarkdown,
        renderAutoOutputs: autoOutputRuntime.renderAutoOutputs,
        getActiveMetaAiSession: metaAiSession.getActiveMetaAiSession,
        startMetaAiSession: metaAiSession.startMetaAiSession,
        renderMetaAiSessionBox: metaAiSession.renderMetaAiSessionBox,
        renderMetaAiClaims: metaAiSession.renderMetaAiClaims,
        maybeHandleMetaAiAgentReply: metaAiSession.maybeHandleMetaAiAgentReply,
        saveMetaAiClaimFeedback: metaAiSession.saveMetaAiClaimFeedback
      }
    });
    if (!runtimeFacade) throw new Error("AHAChatRuntimeFacade må lastes før ahaChat.js.");

    return Object.freeze({
      install() { return runtimeFacade.install(); }
    });
  }

  const publicApi = Object.freeze({ create, REQUIRED_MODULE_METHODS, REQUIRED_CONFIG, REQUIRED_BINDINGS });
  global.AHAChatRuntimeComposition = publicApi;
  global.AHAModuleApi?.register?.("chat.runtimeComposition", publicApi, {
    version: 1,
    legacyGlobal: "AHAChatRuntimeComposition",
    exports: Object.keys(publicApi)
  });
})(window);
