// ahaChat.js
// Ren kobling mellom AHA Chat UI og eksisterende InsightsEngine.

(function (global) {
  "use strict";

  const SUBJECT_ID = "sub_laring";
  const HIGHLIGHTS_STORAGE_KEY = "aha_chat_highlights_v1";
  const CHAT_THREAD_ID = "default_thread";

  const AFTERWORK_STORAGE_KEY = "aha_afterwork_v1";
  const PENDING_CHAT_PROMPT_KEY = "aha_pending_chat_prompt_v1";

  const providerLoaderApi = global.AHAModuleApi?.resolve?.(
    "chat.providerLoader", "AHAChatProviderLoader", { version: 1 }
  ) || global.AHAChatProviderLoader;
  if (!providerLoaderApi) throw new Error("AHAChatProviderLoader må lastes før ahaChat.js.");
  const providerLoader = providerLoaderApi.create({ moduleApi: global.AHAModuleApi, legacyRoot: global });
  const capabilityBindings = providerLoader.require("capabilityBindings");

  function insightsApi() { return providerLoader.resolve("insights", "InsightsEngine"); }
  function ingestApi() { return providerLoader.resolve("ingest", "AHAIngest"); }
  function sourcesApi() { return providerLoader.resolve("sources", "AHASources"); }

  const {
    shortHash, takeKeywords, sourceHash, cleanArticleText, toSentences,
    collectOpinionArticleEvidence
  } = capabilityBindings.bind("textUtils", providerLoader.require("textUtils"));

  const signals = capabilityBindings.bind("signals", providerLoader.require("signals"));
  const {
    detectTextType, detectPublicAdministrationReformSignal,
    detectPublicAdministrationSignal, inferReligiousLexiconEvidence
  } = signals;

  const {
    normalizeSubjectLinks, enrichSubjectMatchesForClimateConflict,
    enrichSubjectMatchesForPublicAdministration, normalizeFagkoblinger, isAcademicLikeType
  } = capabilityBindings.bind("subjects", providerLoader.require("subjects"));

  const { buildOpinionArticleQualityAnalysis } = capabilityBindings.bind(
    "analysis", providerLoader.require("analysis")
  );

  const replyFormat = capabilityBindings.bind("replyFormat", providerLoader.require("replyFormat"));
  const { normalizeAhaVisibleReply } = replyFormat;

  const { loadChamberFromStorage, saveChamberToStorage, clearChamberStorage } = capabilityBindings.bind(
    "chamberStore",
    providerLoader.instantiate("chamberStore", {
      createEmptyChamber: () => insightsApi().createEmptyChamber()
    })
  );

  const { loadAutoOutputs, saveAutoOutputs, clearAutoOutputs } = capabilityBindings.bind(
    "autoOutputStore",
    providerLoader.instantiate("autoOutputStore", {
      sourceHash,
      defaultConversationId: CHAT_THREAD_ID
    })
  );

  const uiRuntimeModule = providerLoader.require("uiRuntime");
  const shellRuntime = providerLoader.instantiate("uiRuntime", {
    subjectId: SUBJECT_ID,
    loadChamberFromStorage,
    getInsightsApi: insightsApi,
    filterConceptLabels: (...args) => filterConceptLabels(...args),
    buildExportBundle: (...args) => buildAhaAnalysisExportBundle(...args)
  }, { factory: "createShell", label: "AHAChatShellRuntime" });
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
  } = capabilityBindings.bind("shellRuntime", shellRuntime);

  const {
    normalizeConceptSurface, normalizeVisibleAcademicLabel, detectLiteraryAttachmentSignal,
    detectInstitutionalMediaHistorySignal, extractMainInstitutionName, subjectMatchesFromCalibration,
    detectAutoAnalysisDomain, getSongLyricChildCultureSubjectMatches, enforceCanonicalSourceGrounding,
    normalizeSubjectMatches, getLiterarySubjectMatches, getInstitutionalMediaHistorySubjectMatches,
    getLiteraryAttachmentLearningPath, short, hasAcademicSignals, filterDomainInsightCards,
    normalizeAcademicAfterworkPayload, isGenericDisplayConcept, extractAcademicPhraseConcepts,
    normalizeSimpleStringList, normalizeTheoreticalLinks, extractAcademicTheoryLinks,
    mergeTheoryLinks, buildAcademicConceptCandidates
  } = capabilityBindings.bind("analysisPolicy", providerLoader.instantiate("analysisPolicy", {
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
    getApiBase: () => global.AHA_AGENT_API,
    fetchImpl: (...args) => global.fetch(...args),
    loadChamber: loadChamberFromStorage,
    getCurrentInsights: currentInsights,
    memoryConceptLabel,
    buildUserMetaProfile: (chamber, subjectId) =>
      global.MetaInsightsEngine?.buildUserMetaProfile?.(chamber, subjectId) || {}
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
    getLiteraryAttachmentLearningPath
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
      metaInsightsAgent: global.AHAMetaInsightsAgent,
      runContext: providerLoader.require("runContext"),
      knowledgeView: providerLoader.require("knowledgeView"),
      uiRuntime: uiRuntimeModule,
      runtimeFacade: providerLoader.require("runtimeFacade")
    },
    bindings: {
      loadAutoOutputs, analysisRunContract, getActiveAnalysisRun, loadAfterworkEntries, sourceHash,
      buildCanonicalAnalysis, normalizeSubjectLinks, normalizeFagkoblinger, isAcademicLikeType,
      loadChamberFromStorage, saveChamberToStorage, getInsightsApi: insightsApi, setStatusNote, out,
      AHA_RUNTIME_KNOWLEDGE_POLICY, buildAutoOutputs, detectTextType, short,
      buildAutoOutputFallbackPayload, getUrlDominanceInfo, buildArticleSourceTextFromAnalysis,
      detectAutoAnalysisDomain, normalizeSubjectMatches, subjectMatchesFromCalibration,
      getLiterarySubjectMatches, getLiteraryAttachmentLearningPath, isSportsArticleAnalysis,
      applyRuntimeKnowledgePolicy, filterCrossDomainAutoPayload, enforceCanonicalSourceGrounding,
      resolveCanonicalAnalysisWithOptionalPythonEngine, isActiveAnalysisRun, bindAnalysisArtifact,
      updateAnalysisRun, renderAutoOutputPayload, setExportButtonsEnabled, saveAutoOutputs,
      setActiveAnalysisRun, takeKeywords, refreshAhaExplorer, getInstitutionalMediaHistorySubjectMatches,
      updateEmptyState, isTransientAnalysisDocument, isAhaSavingEnabled, getThemeId, getFieldId,
      handleUserMessage, handleUserMessageInsightCandidatesInBackground, isAhaMemoryQuestion,
      buildAhaMemoryStatus, renderAhaMemoryStatus, buildAhaLearningContractReply, updateAhaMemoryStatus,
      isAhaMemoryUseEnabled, buildAhaMemoryContext, buildAhaMemoryOffContext,
      filterMemoryContextForActiveSource, suggestCategoryChips, filterRetrievalForActiveSource,
      buildAhaPersonalMessageContext, buildAhaAnswerPackage, renderAhaPersonalRetrieval,
      renderAhaAnswerComposer, renderAhaPersonalContextStatus, renderAhaPersonalAiLoopStatus,
      createAnalysisRun, clearActiveAnalysisState, askAhaAgent, cleanArticleText,
      enrichSubjectMatchesForClimateConflict, enrichSubjectMatchesForPublicAdministration,
      normalizeAhaVisibleReply, evaluateAhaAnswerForChat, ensureAfterworkForLatestAnalysis,
      renderAhaChatMemoryStatus, appendChat, setAhaProcessing, currentInsights, filterConceptLabels,
      canonicalizeDisplayConcept, normalizeConceptKey, getCanonicalConceptLabel,
      getCanonicalConceptKey, isBlockedStandaloneConcept, escHtml, extractAcademicPhraseConcepts,
      extractAcademicTheoryLinks, prioritizeVisibleConceptEdges, isGenericDisplayConcept,
      normalizeAfterworkConcept, applyPhraseConceptDisplayPreference,
      detectPublicAdministrationReformSignal, readLatestAcademicContext, renderAuxPanel, renderPanel,
      showInsights, showSavedAfterwork, clearChamberStorage, clearAutoOutputs, resetAnalysisStateView,
      bindAhaMemoryControls, bindPanelActionHandler, renderHighlightsRail, buildAIState,
      buildAcademicConceptCandidates, buildSourceGroundedAcademicPayload, shouldUseAhaMemory,
      loadAhaMemoryControls, saveAhaMemoryControls, setAhaMemoryControl, resetAhaMemoryControls,
      loadAhaMemoryExclusions, saveAhaMemoryExclusions, getAhaMemoryInsightStableKey,
      getAhaMemoryInsightKey, isAhaMemoryInsightExcluded, excludeAhaMemoryInsight,
      includeAhaMemoryInsight, resetAhaMemoryExclusions, getAhaExcludedMemoryItems,
      renderAhaMemoryControls, bindAhaMemoryControls, findRelevantLocalMemory,
      formatAhaMemoryContextForAgent, isAhaMemoryDebugEnabled, buildAhaMemoryTransparency,
      formatAhaMemoryTransparencyDetails, renderAhaMemoryTransparency, updateAnswerActionsVisibility,
      scoreRetrievalAgainstSource, artifactMatchesActiveRun, buildAhaPersonalAiLoopChatReadinessStatus
    }
  });
  runtimeComposition.install();
})(window);
