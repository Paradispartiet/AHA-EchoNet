// Versjonert provider-instansieringsgraf for AHA Chat.

(function (global) {
  "use strict";

  function requireObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`AHAChatApplicationComposition mangler avhengighet: ${label}`);
    }
    return value;
  }

  function requireMethods(value, methods, label) {
    const object = requireObject(value, label);
    const missing = methods.filter((name) => typeof object[name] !== "function");
    if (missing.length) {
      throw new Error(`AHAChatApplicationComposition krever: ${label}.${missing.join(`, ${label}.`)}`);
    }
    return object;
  }

  function create(deps = {}) {
    const providerLoader = requireMethods(
      deps.providerLoader, ["resolve", "require", "instantiate"], "providerLoader"
    );
    const environment = requireMethods(deps.environment, [
      "getAgentApiBase", "fetchImpl", "buildUserMetaProfile",
      "getMetaInsightsAgent", "getExportBundleBuilder"
    ], "environment");

  const SUBJECT_ID = "sub_laring";
  const HIGHLIGHTS_STORAGE_KEY = "aha_chat_highlights_v1";
  const CHAT_THREAD_ID = "default_thread";

  const AFTERWORK_STORAGE_KEY = "aha_afterwork_v1";
  const PENDING_CHAT_PROMPT_KEY = "aha_pending_chat_prompt_v1";

  const capabilityBindings = providerLoader.require("capabilityBindings");
  const analysisBundleV2 = providerLoader.require("analysisBundleV2");

  function insightsApi() { return providerLoader.resolve("insights", "InsightsEngine"); }
  function ingestApi() { return providerLoader.resolve("ingest", "AHAIngest"); }
  function sourcesApi() { return providerLoader.resolve("sources", "AHASources"); }

  const textUtils = capabilityBindings.bind("textUtils", providerLoader.require("textUtils"));
  const {
    shortHash, takeKeywords, sourceHash, cleanArticleText, toSentences,
    collectOpinionArticleEvidence
  } = textUtils;

  const signals = capabilityBindings.bind("signals", providerLoader.require("signals"));
  const {
    detectTextType, detectPublicAdministrationReformSignal,
    detectPublicAdministrationSignal, inferReligiousLexiconEvidence
  } = signals;

  const subjects = capabilityBindings.bind("subjects", providerLoader.require("subjects"));
  const {
    normalizeSubjectLinks, enrichSubjectMatchesForClimateConflict,
    enrichSubjectMatchesForPublicAdministration, normalizeFagkoblinger, isAcademicLikeType
  } = subjects;

  const { buildOpinionArticleQualityAnalysis } = capabilityBindings.bind(
    "analysis", providerLoader.require("analysis")
  );

  const replyFormat = capabilityBindings.bind("replyFormat", providerLoader.require("replyFormat"));
  const { normalizeAhaVisibleReply } = replyFormat;

  const chamberStore = capabilityBindings.bind(
    "chamberStore",
    providerLoader.instantiate("chamberStore", {
      createEmptyChamber: () => insightsApi().createEmptyChamber()
    })
  );
  const { loadChamberFromStorage, saveChamberToStorage, clearChamberStorage } = chamberStore;

  const autoOutputStore = capabilityBindings.bind(
    "autoOutputStore",
    providerLoader.instantiate("autoOutputStore", {
      sourceHash,
      analysisBundleV2,
      defaultConversationId: CHAT_THREAD_ID
    })
  );
  const { loadAutoOutputs, saveAutoOutputs, clearAutoOutputs } = autoOutputStore;

  const uiRuntimeModule = providerLoader.require("uiRuntime");
  const shellRuntime = capabilityBindings.bind("shellRuntime", providerLoader.instantiate("uiRuntime", {
    subjectId: SUBJECT_ID,
    loadChamberFromStorage,
    getInsightsApi: insightsApi,
    filterConceptLabels: (...args) => filterConceptLabels(...args),
    buildExportBundle: (...args) => environment.getExportBundleBuilder()(...args)
  }, { factory: "createShell", label: "AHAChatShellRuntime" }));
  const {
    getThemeId,
    getFieldId,
    out,
    setStatusNote,
    escHtml,
    renderAuxPanel,
    renderPanel,
    currentInsights,
    normalizeDisplayText,
    resolveConceptTerm,
    suggestCategoryChips,
    refreshAhaExplorer,
    renderAhaChatMemoryStatus
  } = shellRuntime;

  const analysisPolicy = capabilityBindings.bind("analysisPolicy", providerLoader.instantiate("analysisPolicy", {
    signals,
    resolveConceptTerm,
    normalizeDisplayText,
    detectPublicAdministrationReformSignal,
    detectPublicAdministrationSignal,
    toSentences,
    cleanArticleText,
    sourceHash,
    takeKeywords,
    normalizeConceptKey: (...args) => normalizeConceptKey(...args),
    inferReligiousLexiconEvidence,
    detectTextType,
    applyRuntimeKnowledgePolicy: (...args) => applyRuntimeKnowledgePolicy(...args),
    getRuntimeKnowledgePolicy: () => AHA_RUNTIME_KNOWLEDGE_POLICY,
    normalizeAfterworkConcept: (...args) => normalizeAfterworkConcept(...args)
  }));
  const {
    normalizeConceptSurface, normalizeVisibleAcademicLabel, detectLiteraryAttachmentSignal,
    detectInstitutionalMediaHistorySignal, extractMainInstitutionName, subjectMatchesFromCalibration,
    detectAutoAnalysisDomain, getSongLyricChildCultureSubjectMatches, enforceCanonicalSourceGrounding,
    normalizeSubjectMatches, getLiterarySubjectMatches, getInstitutionalMediaHistorySubjectMatches,
    getLiteraryAttachmentLearningPath, short, hasAcademicSignals, filterDomainInsightCards,
    normalizeAcademicAfterworkPayload, isGenericDisplayConcept, extractAcademicPhraseConcepts,
    normalizeSimpleStringList, normalizeTheoreticalLinks, extractAcademicTheoryLinks,
    mergeTheoryLinks, buildAcademicConceptCandidates
  } = analysisPolicy;

  const conceptPolicy = capabilityBindings.bind("conceptPolicy", providerLoader.instantiate("conceptPolicy", {
    normalizeAfterworkConcept: (...args) => normalizeAfterworkConcept(...args),
    normalizeConceptSurface,
    normalizeVisibleAcademicLabel,
    isGenericDisplayConcept,
    detectPublicAdministrationReformSignal,
    extractAcademicPhraseConcepts
  }));
  const {
    normalizeConceptKey, getCanonicalConceptLabel, getCanonicalConceptKey, isBlockedStandaloneConcept,
    prioritizeVisibleConceptEdges, applyPhraseConceptDisplayPreference, filterConceptLabels,
    canonicalizeDisplayConcept
  } = conceptPolicy;

  const analysisRunContract = providerLoader.require("analysisRunContract");

  const memoryControls = capabilityBindings.bind("memoryControls", providerLoader.instantiate("memoryControls", {
    loadChamber: loadChamberFromStorage
  }));
  const {
    normalizeAhaMemoryControls, loadAhaMemoryControls, saveAhaMemoryControls, setAhaMemoryControl,
    resetAhaMemoryControls, isAhaSavingEnabled, isAhaMemoryUseEnabled, buildAhaMemoryOffContext,
    loadAhaMemoryExclusions, saveAhaMemoryExclusions, getAhaMemoryInsightStableKey,
    getAhaMemoryInsightKey, isAhaMemoryInsightExcluded, excludeAhaMemoryInsight,
    includeAhaMemoryInsight, resetAhaMemoryExclusions, getAhaExcludedMemoryItems
  } = memoryControls;

  const afterwork = capabilityBindings.bind("afterwork", providerLoader.instantiate("afterwork", {
    storageKey: AFTERWORK_STORAGE_KEY,
    sourceHash,
    escHtml,
    normalizeDisplayText,
    filterConceptLabels,
    canonicalizeDisplayConcept,
    renderAuxPanel,
    renderPanel,
    setStatusNote
  }));
  const {
    loadAfterworkEntries, saveAfterworkEntries, showSavedAfterwork,
    buildFromAfterworkEntry, deleteAfterworkEntry
  } = afterwork;

  const memoryRuntime = capabilityBindings.bind("memoryRuntime", providerLoader.instantiate("memoryRuntime", {
    loadChamber: loadChamberFromStorage,
    loadAfterworkEntries,
    loadControls: loadAhaMemoryControls,
    normalizeControls: normalizeAhaMemoryControls,
    loadExclusions: loadAhaMemoryExclusions,
    isExcluded: isAhaMemoryInsightExcluded,
    getInsightKey: getAhaMemoryInsightKey
  }));
  const {
    memoryConceptLabel, isAhaMemoryQuestion, findRelevantLocalMemory, shouldUseAhaMemory,
    formatAhaMemoryContextForAgent, buildAhaMemoryContext, isAhaMemoryDebugEnabled,
    buildAhaMemoryTransparency, formatAhaMemoryTransparencyDetails, formatAhaMemoryTimestamp,
    buildAhaMemoryStatus, buildAhaLearningContractReply
  } = memoryRuntime;

  const runContext = capabilityBindings.bind("runContext", providerLoader.instantiate("runContext", {
    analysisRunContract,
    sourceHash,
    shortHash,
    takeKeywords,
    formatMemoryContextForAgent: formatAhaMemoryContextForAgent,
    buildMemoryOffContext: buildAhaMemoryOffContext,
    defaultConversationId: CHAT_THREAD_ID
  }));
  const {
    getActiveAnalysisRun, setActiveAnalysisRun, createAnalysisRun, updateAnalysisRun,
    bindAnalysisArtifact, artifactMatchesActiveRun, isActiveAnalysisRun, scoreRetrievalAgainstSource,
    filterRetrievalForActiveSource, filterMemoryContextForActiveSource
  } = runContext;

  const afterworkAutoAdapter = capabilityBindings.bind("afterworkAutoAdapter", providerLoader.instantiate("afterwork", {
    defaultConversationId: CHAT_THREAD_ID,
    sourceHash,
    shortHash,
    resolveConceptTerm,
    cleanTextForConceptExtraction: cleanArticleText,
    extractAcademicPhraseConcepts,
    normalizeAcademicAfterworkPayload,
    detectTextType,
    normalizeSubjectLinks,
    takeKeywords,
    extractAcademicTheoryLinks,
    mergeTheoryLinks,
    normalizeSimpleStringList,
    getActiveAnalysisRun,
    loadAfterworkEntries,
    saveAfterworkEntries,
    loadAutoOutputs
  }, { factory: "createAutoOutputAdapter", label: "AHAChatAfterworkAutoAdapter" }));
  const {
    normalizeAfterworkConcept, saveAutoOutputAsAfterwork, ensureAfterworkForLatestAnalysis
  } = afterworkAutoAdapter;

  const insightPipeline = capabilityBindings.bind("insightPipeline", providerLoader.instantiate("insightPipeline", {
    filterConceptLabels,
    normalizeSimpleStringList,
    normalizeTheoreticalLinks,
    extractAcademicPhraseConcepts,
    normalizeAfterworkConcept,
    weakConceptWords: { has: conceptPolicy.isWeakConceptWord }
  }));
  const { generateAIInsightCandidates, buildSemanticInsightCandidates } = insightPipeline;

  const agentRuntime = capabilityBindings.bind("agentRuntime", providerLoader.instantiate("agentRuntime", {
    subjectId: SUBJECT_ID,
    getApiBase: () => environment.getAgentApiBase(),
    fetchImpl: (...args) => environment.fetchImpl(...args),
    loadChamber: loadChamberFromStorage,
    getCurrentInsights: currentInsights,
    memoryConceptLabel,
    buildUserMetaProfile: (chamber, subjectId) =>
      environment.buildUserMetaProfile(chamber, subjectId)
  }));
  const { buildAIState, askAhaAgent } = agentRuntime;

  const ingestRuntime = capabilityBindings.bind("ingestRuntime", providerLoader.instantiate("ingestRuntime", {
    subjectId: SUBJECT_ID,
    getInsightsApi: insightsApi,
    getIngestApi: ingestApi,
    getSourcesApi: sourcesApi,
    getThemeId,
    getFieldId,
    buildSemanticInsightCandidates,
    generateAIInsightCandidates,
    buildAIState,
    loadChamber: loadChamberFromStorage,
    saveChamber: saveChamberToStorage
  }));
  const { handleUserMessage, handleUserMessageInsightCandidatesInBackground } = ingestRuntime;

  const academicInsightView = capabilityBindings.bind("academicInsightView", providerLoader.instantiate("academicInsightView", {
    loadAutoOutputs,
    loadAfterworkEntries,
    detectTextType,
    hasAcademicSignals,
    extractAcademicPhraseConcepts,
    getRuntimeKnowledgePolicy: () => AHA_RUNTIME_KNOWLEDGE_POLICY,
    buildSourceGroundedAcademicPayload: (...args) => buildSourceGroundedAcademicPayload(...args),
    buildAutoOutputs: (...args) => buildAutoOutputs(...args),
    isFragmentaryInsightCard: (...args) => isFragmentaryInsightCard(...args),
    normalizeConceptKey,
    detectAutoAnalysisDomain,
    extractMainInstitutionName
  }));
  const {
    parseLabeledInsightCards, readLatestAcademicContext, buildAcademicSyntheticInsightCards
  } = academicInsightView;

  const insightView = capabilityBindings.bind("insightView", providerLoader.instantiate("insightView", {
    escHtml,
    normalizeConceptKey,
    normalizeDisplayText,
    filterConceptLabels,
    resolveConceptTerm,
    canonicalizeDisplayConcept,
    currentInsights,
    readLatestAcademicContext,
    filterDomainInsightCards,
    buildAcademicSyntheticInsightCards,
    loadChamber: loadChamberFromStorage,
    saveChamber: saveChamberToStorage,
    loadAfterworkEntries,
    deleteAfterworkEntry,
    buildFromAfterworkEntry,
    setStatusNote,
    renderPanel,
    loadAutoOutputs
  }));
  const { isFragmentaryInsightCard, bindPanelActionHandler, showInsights } = insightView;

  const personalUi = capabilityBindings.bind("personalUi", providerLoader.instantiate("personalUi", {
    getActiveAnalysisRun,
    bindAnalysisArtifact,
    buildAhaMemoryTransparency,
    showInsights,
    setStatusNote,
    excludeAhaMemoryInsight,
    normalizeAhaMemoryControls,
    loadAhaMemoryControls,
    formatAhaMemoryTimestamp,
    getAhaExcludedMemoryItems,
    setAhaMemoryControl,
    includeAhaMemoryInsight,
    resetAhaMemoryExclusions,
    buildAhaMemoryStatus
  }));

  memoryControls.bindView({
    renderControls: personalUi.renderAhaMemoryControls,
    updateStatus: personalUi.updateAhaMemoryStatus
  });

  const {
    buildAhaPersonalMessageContext, buildAhaAnswerPackage,
    renderAhaAnswerComposer, renderAhaAnswerEvaluation, evaluateAhaAnswerForChat,
    renderAhaPersonalContextStatus, renderAhaPersonalRetrieval,
    buildAhaPersonalAiLoopChatReadinessStatus, renderAhaPersonalAiLoopStatus,
    renderAhaMemoryTransparency, renderAhaMemoryStatus, renderAhaMemoryControls,
    bindAhaMemoryControls, updateAhaMemoryStatus
  } = personalUi;

  const conversationView = capabilityBindings.bind("conversationView", providerLoader.instantiate("conversationView", {
    storageKey: HIGHLIGHTS_STORAGE_KEY,
    threadId: CHAT_THREAD_ID,
    shortHash,
    setStatusNote,
    renderAhaMemoryTransparency,
    renderAhaAnswerEvaluation,
    refreshAhaExplorer
  }));
  const { appendChat, renderHighlightsRail, updateEmptyState, updateAnswerActionsVisibility } = conversationView;

  const analysisStateView = capabilityBindings.bind("analysisStateView", providerLoader.instantiate("analysisStateView", {
    getActiveAnalysisRun,
    setActiveAnalysisRun,
    clearAutoOutputs,
    escHtml,
    renderAhaPersonalRetrieval,
    renderAhaAnswerComposer,
    renderPanel,
    renderHighlightsRail,
    updateEmptyState
  }));
  const {
    renderAnalysisDebugPanel, setExportButtonsEnabled, setAhaProcessing,
    clearActiveAnalysisState, resetAnalysisStateView
  } = analysisStateView;

  const autoAnalysis = capabilityBindings.bind("autoAnalysis", providerLoader.instantiate("autoAnalysis", {
    cleanArticleText,
    toSentences,
    takeKeywords,
    short,
    detectTextType,
    normalizeSubjectMatches,
    normalizeAcademicAfterworkPayload,
    collectOpinionArticleEvidence,
    buildOpinionArticleQualityAnalysis,
    currentInsights,
    inferReligiousLexiconEvidence,
    detectAutoAnalysisDomain,
    detectInstitutionalMediaHistorySignal,
    detectLiteraryAttachmentSignal,
    detectPublicAdministrationReformSignal,
    extractAcademicPhraseConcepts,
    extractAcademicTheoryLinks,
    extractMainInstitutionName
  }));
  const {
    getUrlDominanceInfo, isSportsArticleAnalysis, buildArticleSourceTextFromAnalysis,
    AHA_RUNTIME_KNOWLEDGE_POLICY, buildSourceGroundedAcademicPayload, applyRuntimeKnowledgePolicy,
    isTransientAnalysisDocument, buildAutoOutputs, buildAutoOutputFallbackPayload
  } = autoAnalysis;

  const autoOutputView = capabilityBindings.bind("autoOutputView", providerLoader.instantiate("autoOutputView", {
    enforceCanonicalSourceGrounding,
    getActiveAnalysisRun,
    artifactMatchesActiveRun,
    analysisTopicMismatch: runContext.analysisTopicMismatch,
    renderAnalysisDebugPanel,
    setExportButtonsEnabled,
    escHtml,
    cleanArticleText,
    detectTextType,
    saveAutoOutputAsAfterwork,
    setStatusNote,
    refreshAhaExplorer,
    normalizeConceptKey,
    detectPublicAdministrationReformSignal,
    detectAutoAnalysisDomain,
    detectLiteraryAttachmentSignal,
    filterConceptLabels,
    canonicalizeDisplayConcept,
    detectInstitutionalMediaHistorySignal,
    parseLabeledInsightCards,
    updateAnalysisRun,
    getSongLyricChildCultureSubjectMatches,
    getLiterarySubjectMatches,
    getLiteraryAttachmentLearningPath,
    analysisBundleV2
  }));
  const { buildAhaSerCard, renderAutoOutputPayload, filterCrossDomainAutoPayload } = autoOutputView;

  const canonicalAnalysis = capabilityBindings.bind("canonicalAnalysis", providerLoader.instantiate("canonicalAnalysis", {
    buildAhaSerCard,
    AHA_RUNTIME_KNOWLEDGE_POLICY,
    detectTextType,
    detectAutoAnalysisDomain,
    normalizeSubjectMatches,
    normalizeFagkoblinger,
    normalizeConceptKey,
    buildAcademicConceptCandidates
  }));
  const { resolveCanonicalAnalysisWithOptionalPythonEngine, buildCanonicalAnalysis } = canonicalAnalysis;

  const runtimeComposition = providerLoader.instantiate("runtimeComposition", {
    config: {
      subjectId: SUBJECT_ID,
      threadId: CHAT_THREAD_ID,
      pendingPromptKey: PENDING_CHAT_PROMPT_KEY,
      highlightsStorageKey: HIGHLIGHTS_STORAGE_KEY,
      afterworkStorageKey: AFTERWORK_STORAGE_KEY
    },
    modules: {
      export: providerLoader.require("export"),
      autoOutputView: providerLoader.require("autoOutputView"),
      replyFormat,
      metaInsightsAgent: environment.getMetaInsightsAgent(),
      runContext: providerLoader.require("runContext"),
      knowledgeView: providerLoader.require("knowledgeView"),
      uiRuntime: uiRuntimeModule,
      runtimeFacade: providerLoader.require("runtimeFacade"),
      analysisBundleV2
    },
    capabilities: {
      core: Object.freeze({
        ...textUtils, ...signals, ...subjects, ...replyFormat,
        analysisRunContract, getInsightsApi: insightsApi
      }),
      persistence: Object.freeze({ ...chamberStore, ...autoOutputStore, ...afterwork }),
      analysis: Object.freeze({
        ...analysisPolicy, ...conceptPolicy, ...academicInsightView, ...afterworkAutoAdapter,
        ...autoAnalysis, ...autoOutputView, ...canonicalAnalysis
      }),
      execution: Object.freeze({ ...runContext, ...agentRuntime, ...ingestRuntime }),
      memory: Object.freeze({ ...memoryControls, ...memoryRuntime, ...personalUi }),
      view: Object.freeze({
        ...shellRuntime, ...insightView, ...conversationView, ...analysisStateView
      })
    }
  });
    if (typeof runtimeComposition.install !== "function") {
      throw new Error("AHAChatApplicationComposition krever: runtimeComposition.install");
    }
    return Object.freeze({ install: (...args) => runtimeComposition.install(...args) });
  }

  const publicApi = Object.freeze({ create });
  global.AHAChatApplicationComposition = publicApi;
  global.AHAModuleApi?.register?.("chat.applicationComposition", publicApi, {
    version: 1,
    legacyGlobal: "AHAChatApplicationComposition",
    exports: Object.keys(publicApi)
  });
})(window);
