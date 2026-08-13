// ahaChat.js
// Ren kobling mellom AHA Chat UI og eksisterende InsightsEngine.

(function (global) {
  "use strict";

  const SUBJECT_ID = "sub_laring";
  const STORAGE_KEY = "aha_insight_chamber_v1";
  const HIGHLIGHTS_STORAGE_KEY = "aha_chat_highlights_v1";
  const CHAT_THREAD_ID = "default_thread";

  const AUTO_OUTPUT_STORAGE_KEY = "aha_chat_auto_outputs_v1";
  const AFTERWORK_STORAGE_KEY = "aha_afterwork_v1";
  const PENDING_CHAT_PROMPT_KEY = "aha_pending_chat_prompt_v1";
  let personalUi = null;
  let insightPipeline = null;

  function resolveModule(name, legacyGlobal) {
    return global.AHAModuleApi?.resolve?.(name, legacyGlobal, { version: 1 }) || global[legacyGlobal] || null;
  }

  function insightsApi() { return resolveModule("insights", "InsightsEngine"); }
  function ingestApi() { return resolveModule("ingest", "AHAIngest"); }
  function sourcesApi() { return resolveModule("sources", "AHASources"); }
  function chatModule(name, legacyGlobal) { return resolveModule(`chat.${name}`, legacyGlobal); }

  const textUtils = chatModule("textUtils", "AHAChatTextUtils");
  if (!textUtils) throw new Error("AHAChatTextUtils må lastes før ahaChat.js.");
  const shortHash = textUtils.shortHash;
  const takeKeywords = textUtils.takeKeywords;
  const sourceHash = textUtils.sourceHash;
  if (typeof shortHash !== "function" || typeof takeKeywords !== "function" || typeof sourceHash !== "function") {
    throw new Error("AHAChatTextUtils må eksponere shortHash, takeKeywords og sourceHash.");
  }

  const analysisPolicy = chatModule("analysisPolicy", "AHAChatAnalysisPolicy")?.create?.({
    signals: chatModule("signals", "AHAChatSignals"),
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
  });
  if (!analysisPolicy) throw new Error("AHAChatAnalysisPolicy må lastes før ahaChat.js.");

  const normalizeConceptSurface = analysisPolicy.normalizeConceptSurface;
  const normalizeVisibleAcademicLabel = analysisPolicy.normalizeVisibleAcademicLabel;
  const normalizeAcademicConceptLabel = analysisPolicy.normalizeAcademicConceptLabel;
  const filterCrossDomainTextItems = analysisPolicy.filterCrossDomainTextItems;
  const detectLiteraryAttachmentSignal = analysisPolicy.detectLiteraryAttachmentSignal;
  const detectSahelClimateConflictSignal = analysisPolicy.detectSahelClimateConflictSignal;
  const detectInstitutionalMediaHistorySignal = analysisPolicy.detectInstitutionalMediaHistorySignal;
  const extractMainInstitutionName = analysisPolicy.extractMainInstitutionName;
  const subjectMatchesFromCalibration = analysisPolicy.subjectMatchesFromCalibration;
  const detectAutoAnalysisDomain = analysisPolicy.detectAutoAnalysisDomain;
  const detectSongLyricChildCultureSignal = analysisPolicy.detectSongLyricChildCultureSignal;
  const sourceSupportsMediaInstitutionTerms = analysisPolicy.sourceSupportsMediaInstitutionTerms;
  const firstUnsupportedCanonicalDomainTerm = analysisPolicy.firstUnsupportedCanonicalDomainTerm;
  const containsUnsupportedCanonicalDomainTerm = analysisPolicy.containsUnsupportedCanonicalDomainTerm;
  const stripUnsupportedCanonicalItems = analysisPolicy.stripUnsupportedCanonicalItems;
  const getSongLyricChildCultureSubjectMatches = analysisPolicy.getSongLyricChildCultureSubjectMatches;
  const buildSongLyricChildCulturePayload = analysisPolicy.buildSongLyricChildCulturePayload;
  const enforceCanonicalSourceGrounding = analysisPolicy.enforceCanonicalSourceGrounding;
  const buildCanonicalEvidenceAnchors = analysisPolicy.buildCanonicalEvidenceAnchors;
  const normalizeSubjectMatches = analysisPolicy.normalizeSubjectMatches;
  const getLiterarySubjectMatches = analysisPolicy.getLiterarySubjectMatches;
  const getInstitutionalMediaHistorySubjectMatches = analysisPolicy.getInstitutionalMediaHistorySubjectMatches;
  const getLiteraryAttachmentLearningPath = analysisPolicy.getLiteraryAttachmentLearningPath;
  const short = analysisPolicy.short;
  const hasAcademicSignals = analysisPolicy.hasAcademicSignals;
  const filterDomainInsightCards = analysisPolicy.filterDomainInsightCards;
  const normalizeAcademicAfterworkPayload = analysisPolicy.normalizeAcademicAfterworkPayload;
  const isGenericDisplayConcept = analysisPolicy.isGenericDisplayConcept;
  const extractAcademicPhraseConcepts = analysisPolicy.extractAcademicPhraseConcepts;
  const normalizeSimpleStringList = analysisPolicy.normalizeSimpleStringList;
  const normalizeTheoreticalLinks = analysisPolicy.normalizeTheoreticalLinks;
  const extractAcademicTheoryLinks = analysisPolicy.extractAcademicTheoryLinks;
  const mergeTheoryLinks = analysisPolicy.mergeTheoryLinks;
  const buildAcademicConceptCandidates = analysisPolicy.buildAcademicConceptCandidates;

  const conceptPolicy = chatModule("conceptPolicy", "AHAChatConceptPolicy")?.create?.({
    normalizeAfterworkConcept: (...args) => normalizeAfterworkConcept(...args),
    normalizeConceptSurface,
    normalizeVisibleAcademicLabel,
    isGenericDisplayConcept,
    detectPublicAdministrationReformSignal,
    extractAcademicPhraseConcepts
  });
  if (!conceptPolicy) throw new Error("AHAChatConceptPolicy må lastes før ahaChat.js.");

  const normalizeConceptKey = conceptPolicy.normalizeConceptKey;
  const getCanonicalConceptLabel = conceptPolicy.getCanonicalConceptLabel;
  const getCanonicalConceptKey = conceptPolicy.getCanonicalConceptKey;
  const isBlockedStandaloneConcept = conceptPolicy.isBlockedStandaloneConcept;
  const prioritizeVisibleConceptEdges = conceptPolicy.prioritizeVisibleConceptEdges;
  const applyPhraseConceptDisplayPreference = conceptPolicy.applyPhraseConceptDisplayPreference;
  const filterConceptLabels = conceptPolicy.filterConceptLabels;
  const canonicalizeDisplayConcept = conceptPolicy.canonicalizeDisplayConcept;

  const analysisRunContract = chatModule("analysisRunContract", "AHAChatAnalysisRunContract");
  if (!analysisRunContract) throw new Error("AHAChatAnalysisRunContract må lastes før ahaChat.js.");

  const memoryControls = chatModule("memoryControls", "AHAChatMemoryControls")?.create?.({
    loadChamber: loadChamberFromStorage,
    renderControls: renderAhaMemoryControls,
    updateStatus: updateAhaMemoryStatus
  });
  if (!memoryControls) throw new Error("AHAChatMemoryControls må lastes før ahaChat.js.");

  const normalizeAhaMemoryControls = memoryControls.normalizeAhaMemoryControls;
  const loadAhaMemoryControls = memoryControls.loadAhaMemoryControls;
  const saveAhaMemoryControls = memoryControls.saveAhaMemoryControls;
  const setAhaMemoryControl = memoryControls.setAhaMemoryControl;
  const resetAhaMemoryControls = memoryControls.resetAhaMemoryControls;
  const isAhaSavingEnabled = memoryControls.isAhaSavingEnabled;
  const isAhaMemoryUseEnabled = memoryControls.isAhaMemoryUseEnabled;
  const buildAhaMemoryOffContext = memoryControls.buildAhaMemoryOffContext;
  const loadAhaMemoryExclusions = memoryControls.loadAhaMemoryExclusions;
  const saveAhaMemoryExclusions = memoryControls.saveAhaMemoryExclusions;
  const getAhaMemoryInsightStableKey = memoryControls.getAhaMemoryInsightStableKey;
  const getAhaMemoryInsightKey = memoryControls.getAhaMemoryInsightKey;
  const getAhaMemoryExclusionCount = memoryControls.getAhaMemoryExclusionCount;
  const isAhaMemoryInsightExcluded = memoryControls.isAhaMemoryInsightExcluded;
  const excludeAhaMemoryInsight = memoryControls.excludeAhaMemoryInsight;
  const includeAhaMemoryInsight = memoryControls.includeAhaMemoryInsight;
  const resetAhaMemoryExclusions = memoryControls.resetAhaMemoryExclusions;
  const getAhaExcludedMemoryItems = memoryControls.getAhaExcludedMemoryItems;

  const afterwork = chatModule("afterwork", "AHAChatAfterwork")?.create?.({
    storageKey: AFTERWORK_STORAGE_KEY,
    sourceHash,
    escHtml,
    normalizeDisplayText,
    filterConceptLabels,
    canonicalizeDisplayConcept,
    renderAuxPanel,
    renderPanel,
    setStatusNote
  });
  if (!afterwork) throw new Error("AHAChatAfterwork må lastes før ahaChat.js.");

  const loadAfterworkEntries = afterwork.loadAfterworkEntries;
  const saveAfterworkEntries = afterwork.saveAfterworkEntries;
  const formatAfterworkDate = afterwork.formatAfterworkDate;
  const renderAfterworkEntry = afterwork.renderAfterworkEntry;
  const showSavedAfterwork = afterwork.showSavedAfterwork;
  const buildAfterworkPrompt = afterwork.buildAfterworkPrompt;
  const buildFromAfterworkEntry = afterwork.buildFromAfterworkEntry;
  const deleteAfterworkEntry = afterwork.deleteAfterworkEntry;
  global.showMeta = showMeta;
  global.showSavedAfterwork = showSavedAfterwork;

  const memoryRuntime = chatModule("memoryRuntime", "AHAChatMemoryRuntime")?.create?.({
    loadChamber: loadChamberFromStorage,
    loadAfterworkEntries,
    loadControls: loadAhaMemoryControls,
    normalizeControls: normalizeAhaMemoryControls,
    loadExclusions: loadAhaMemoryExclusions,
    isExcluded: isAhaMemoryInsightExcluded,
    getInsightKey: getAhaMemoryInsightKey
  });
  if (!memoryRuntime) throw new Error("AHAChatMemoryRuntime må lastes før ahaChat.js.");

  const normalizeAhaMemoryText = memoryRuntime.normalizeAhaMemoryText;
  const memoryConceptLabel = memoryRuntime.memoryConceptLabel;
  const isAhaMemoryQuestion = memoryRuntime.isAhaMemoryQuestion;
  const findRelevantLocalMemory = memoryRuntime.findRelevantLocalMemory;
  const shouldUseAhaMemory = memoryRuntime.shouldUseAhaMemory;
  const formatAhaMemoryContextForAgent = memoryRuntime.formatAhaMemoryContextForAgent;
  const buildAhaMemoryContext = memoryRuntime.buildAhaMemoryContext;
  const isAhaMemoryDebugEnabled = memoryRuntime.isAhaMemoryDebugEnabled;
  const buildAhaMemoryTransparency = memoryRuntime.buildAhaMemoryTransparency;
  const formatAhaMemoryTransparencyDetails = memoryRuntime.formatAhaMemoryTransparencyDetails;
  const formatAhaMemoryTimestamp = memoryRuntime.formatAhaMemoryTimestamp;
  const describeAhaEmbeddingStatus = memoryRuntime.describeAhaEmbeddingStatus;
  const explainAhaEmbeddingStatus = memoryRuntime.explainAhaEmbeddingStatus;
  const getAhaEmbeddingHealthWithTimeout = memoryRuntime.getAhaEmbeddingHealthWithTimeout;
  const buildAhaMemoryStatus = memoryRuntime.buildAhaMemoryStatus;
  const buildAhaLearningContractReply = memoryRuntime.buildAhaLearningContractReply;

  const runContext = chatModule("runContext", "AHAChatRunContext")?.create?.({
    analysisRunContract,
    sourceHash,
    shortHash,
    takeKeywords,
    formatMemoryContextForAgent: formatAhaMemoryContextForAgent,
    buildMemoryOffContext: buildAhaMemoryOffContext,
    defaultConversationId: CHAT_THREAD_ID
  });
  if (!runContext) throw new Error("AHAChatRunContext må lastes før ahaChat.js.");

  const getActiveAnalysisRun = runContext.getActiveAnalysisRun;
  const setActiveAnalysisRun = runContext.setActiveAnalysisRun;
  const createAnalysisRun = runContext.createAnalysisRun;
  const updateAnalysisRun = runContext.updateAnalysisRun;
  const bindAnalysisArtifact = runContext.bindAnalysisArtifact;
  const artifactMatchesActiveRun = runContext.artifactMatchesActiveRun;
  const isActiveAnalysisRun = runContext.isActiveAnalysisRun;
  const scoreRetrievalAgainstSource = runContext.scoreRetrievalAgainstSource;
  const filterRetrievalForActiveSource = runContext.filterRetrievalForActiveSource;
  const filterMemoryContextForActiveSource = runContext.filterMemoryContextForActiveSource;

  const afterworkAutoAdapter = chatModule("afterwork", "AHAChatAfterwork")?.createAutoOutputAdapter?.({
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
  });
  if (!afterworkAutoAdapter) throw new Error("AHAChatAfterworkAutoAdapter må lastes før ahaChat.js.");
  const normalizeAfterworkConcept = afterworkAutoAdapter.normalizeAfterworkConcept;
  const saveAutoOutputAsAfterwork = afterworkAutoAdapter.saveAutoOutputAsAfterwork;
  const ensureAfterworkForLatestAnalysis = afterworkAutoAdapter.ensureAfterworkForLatestAnalysis;

  const academicInsightView = chatModule("academicInsightView", "AHAChatAcademicInsightView")?.create?.({
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
  });
  if (!academicInsightView) throw new Error("AHAChatAcademicInsightView må lastes før ahaChat.js.");
  const parseLabeledInsightCards = academicInsightView.parseLabeledInsightCards;
  const readLatestAcademicContext = academicInsightView.readLatestAcademicContext;
  const buildAcademicSyntheticInsightCards = academicInsightView.buildAcademicSyntheticInsightCards;

  const insightView = chatModule("insightView", "AHAChatInsightView")?.create?.({
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
  });
  if (!insightView) throw new Error("AHAChatInsightView må lastes før ahaChat.js.");

  const renderInsightCard = insightView.renderInsightCard;
  const isFragmentaryInsightCard = insightView.isFragmentaryInsightCard;
  const getDisplayInsights = insightView.getDisplayInsights;
  const resolvePanelAction = insightView.resolvePanelAction;
  const applyEmneSuggestionAction = insightView.applyEmneSuggestionAction;
  const applyMergeAction = insightView.applyMergeAction;
  const handleResolvedPanelAction = insightView.handleResolvedPanelAction;
  const bindPanelActionHandler = insightView.bindPanelActionHandler;
  const renderMergeSuggestionsSection = insightView.renderMergeSuggestionsSection;
  const showInsights = insightView.showInsights;

  personalUi = chatModule("personalUi", "AHAChatPersonalUi")?.create?.({
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
  });
  if (!personalUi) throw new Error("AHAChatPersonalUi må lastes før ahaChat.js.");

  const conversationView = chatModule("conversationView", "AHAChatConversationView")?.create?.({
    storageKey: HIGHLIGHTS_STORAGE_KEY,
    threadId: CHAT_THREAD_ID,
    shortHash,
    setStatusNote,
    renderAhaMemoryTransparency,
    renderAhaAnswerEvaluation,
    refreshAhaExplorer
  });
  if (!conversationView) throw new Error("AHAChatConversationView må lastes før ahaChat.js.");
  const appendChat = conversationView.appendChat;
  const renderHighlightsRail = conversationView.renderHighlightsRail;
  const updateEmptyState = conversationView.updateEmptyState;
  const updateAnswerActionsVisibility = conversationView.updateAnswerActionsVisibility;

  const autoAnalysis = chatModule("autoAnalysis", "AHAChatAutoAnalysis")?.create?.({
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
  });
  if (!autoAnalysis) throw new Error("AHAChatAutoAnalysis må lastes før ahaChat.js.");

  const getUrlDominanceInfo = autoAnalysis.getUrlDominanceInfo;
  const isSportsArticleAnalysis = autoAnalysis.isSportsArticleAnalysis;
  const buildArticleSourceTextFromAnalysis = autoAnalysis.buildArticleSourceTextFromAnalysis;
  const buildArticleAutoOutputsFromAnalysis = autoAnalysis.buildArticleAutoOutputsFromAnalysis;
  const AHA_RUNTIME_KNOWLEDGE_POLICY = autoAnalysis.AHA_RUNTIME_KNOWLEDGE_POLICY;
  const buildSourceGroundedAcademicPayload = autoAnalysis.buildSourceGroundedAcademicPayload;
  const applyRuntimeKnowledgePolicy = autoAnalysis.applyRuntimeKnowledgePolicy;
  const isTransientAnalysisDocument = autoAnalysis.isTransientAnalysisDocument;
  const buildAutoOutputs = autoAnalysis.buildAutoOutputs;
  const buildAutoOutputFallbackPayload = autoAnalysis.buildAutoOutputFallbackPayload;

  const autoOutputView = chatModule("autoOutputView", "AHAChatAutoOutputView")?.create?.({
    enforceCanonicalSourceGrounding,
    getActiveAnalysisRun,
    artifactMatchesActiveRun,
    analysisTopicMismatch,
    renderAnalysisDebugPanel,
    setExportButtonsEnabled,
    safeMarkupSortItems,
    safeMarkupList,
    safeMarkupText,
    detectTextType,
    buildHistoryGoSuggestion,
    filterCrossDomainAutoPayload,
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
    getLiterarySubjectMatches
  });
  if (!autoOutputView) throw new Error("AHAChatAutoOutputView må lastes før ahaChat.js.");

  const humanizeTextType = autoOutputView.humanizeTextType;
  const buildAhaSerCard = autoOutputView.buildAhaSerCard;
  const renderAutoOutputPayload = autoOutputView.renderAutoOutputPayload;

  const canonicalAnalysis = chatModule("canonicalAnalysis", "AHAChatCanonicalAnalysis")?.create?.({
    buildAhaSerCard,
    AHA_RUNTIME_KNOWLEDGE_POLICY,
    detectTextType,
    detectAutoAnalysisDomain,
    normalizeSubjectMatches,
    normalizeFagkoblinger,
    normalizeHistoryGoLinks,
    buildAcademicConceptCandidates
  });
  if (!canonicalAnalysis) throw new Error("AHAChatCanonicalAnalysis må lastes før ahaChat.js.");

  const isPythonEngineFeatureEnabled = canonicalAnalysis.isPythonEngineFeatureEnabled;
  const isValidCanonicalAnalysisShape = canonicalAnalysis.isValidCanonicalAnalysisShape;
  const buildPythonFallbackMeta = canonicalAnalysis.buildPythonFallbackMeta;
  const resolveCanonicalAnalysisWithOptionalPythonEngine = canonicalAnalysis.resolveCanonicalAnalysisWithOptionalPythonEngine;
  const buildCanonicalAnalysis = canonicalAnalysis.buildCanonicalAnalysis;
  const normalizeAnalysisConfidence = canonicalAnalysis.normalizeAnalysisConfidence;
  const normalizeAnalysisWarnings = canonicalAnalysis.normalizeAnalysisWarnings;
  const buildHistoryGoLinksFromDomain = canonicalAnalysis.buildHistoryGoLinksFromDomain;

  const autoOutputRuntime = chatModule("autoOutputView", "AHAChatAutoOutputView")?.createRuntime?.({
    storageKey: AUTO_OUTPUT_STORAGE_KEY,
    defaultConversationId: CHAT_THREAD_ID,
    runtimeKnowledgePolicy: AHA_RUNTIME_KNOWLEDGE_POLICY,
    getActiveAnalysisRun,
    sourceHash,
    buildAutoOutputs,
    detectTextType,
    short,
    buildAutoOutputFallbackPayload,
    getUrlDominanceInfo,
    buildArticleSourceTextFromAnalysis,
    detectAutoAnalysisDomain,
    normalizeSubjectMatches,
    subjectMatchesFromCalibration,
    getLiterarySubjectMatches,
    getLiteraryAttachmentLearningPath,
    isSportsArticleAnalysis,
    applyRuntimeKnowledgePolicy,
    filterCrossDomainAutoPayload,
    enforceCanonicalSourceGrounding,
    buildCanonicalAnalysis,
    resolveCanonicalAnalysisWithOptionalPythonEngine,
    isActiveAnalysisRun,
    bindAnalysisArtifact,
    updateAnalysisRun,
    renderAutoOutputPayload,
    setExportButtonsEnabled,
    loadAutoOutputs,
    setActiveAnalysisRun,
    takeKeywords,
    refreshAhaExplorer
  });
  if (!autoOutputRuntime) throw new Error("AHAChatAutoOutputRuntime må lastes før ahaChat.js.");
  const renderAutoOutputs = autoOutputRuntime.renderAutoOutputs;
  const focusAutoCard = autoOutputRuntime.focusAutoCard;
  const restoreAutoOutputFromStorage = autoOutputRuntime.restoreAutoOutputFromStorage;

  const replySubjectPolicy = chatModule("replyFormat", "AHAChatReplyFormat")?.createSubjectPolicy?.({
    detectAutoAnalysisDomain,
    getLiterarySubjectMatches,
    getInstitutionalMediaHistorySubjectMatches
  });
  if (!replySubjectPolicy) throw new Error("AHAChatReplySubjectPolicy må lastes før ahaChat.js.");
  const forceLiteraryFagkoblingerInReply = replySubjectPolicy.forceLiteraryFagkoblingerInReply;
  const forceInstitutionalMediaHistoryFagkoblingerInReply = replySubjectPolicy.forceInstitutionalMediaHistoryFagkoblingerInReply;
  const stripFagkoblingerSections = replySubjectPolicy.stripFagkoblingerSections;

  const metaAiSession = global.AHAMetaInsightsAgent?.createChatSession?.({
    updateEmptyState,
    setStatusNote
  }) || {
    getActiveMetaAiSession: () => null,
    renderMetaAiSessionBox: () => null,
    startMetaAiSession: () => null,
    saveMetaAiClaimFeedback: () => null,
    renderMetaAiClaims: () => null,
    maybeHandleMetaAiAgentReply: () => null
  };
  const getActiveMetaAiSession = metaAiSession.getActiveMetaAiSession;
  const renderMetaAiSessionBox = metaAiSession.renderMetaAiSessionBox;
  const startMetaAiSession = metaAiSession.startMetaAiSession;
  const saveMetaAiClaimFeedback = metaAiSession.saveMetaAiClaimFeedback;
  const renderMetaAiClaims = metaAiSession.renderMetaAiClaims;
  const maybeHandleMetaAiAgentReply = metaAiSession.maybeHandleMetaAiAgentReply;

  const submissionRuntime = chatModule("runContext", "AHAChatRunContext")?.createSubmissionRuntime?.({
    config: {
      threadId: CHAT_THREAD_ID,
      subjectId: SUBJECT_ID
    },
    input: {
      getUrlDominanceInfo,
      isTransientAnalysisDocument,
      isAhaSavingEnabled,
      getThemeId,
      getFieldId,
      handleUserMessage,
      handleUserMessageInsightCandidatesInBackground
    },
    memory: {
      isMemoryQuestion: isAhaMemoryQuestion,
      buildMemoryStatus: buildAhaMemoryStatus,
      renderMemoryStatus: renderAhaMemoryStatus,
      buildLearningContractReply: buildAhaLearningContractReply,
      updateMemoryStatus: updateAhaMemoryStatus,
      isMemoryUseEnabled: isAhaMemoryUseEnabled,
      buildMemoryContext: buildAhaMemoryContext,
      buildMemoryOffContext: buildAhaMemoryOffContext,
      filterMemoryContextForActiveSource,
      suggestCategoryChips
    },
    retrieval: {
      filterForActiveSource: filterRetrievalForActiveSource,
      buildPersonalMessageContext: buildAhaPersonalMessageContext,
      buildAnswerPackage: buildAhaAnswerPackage,
      renderPersonalRetrieval: renderAhaPersonalRetrieval,
      renderAnswerComposer: renderAhaAnswerComposer,
      renderPersonalContextStatus: renderAhaPersonalContextStatus,
      renderPersonalAiLoopStatus: renderAhaPersonalAiLoopStatus
    },
    analysis: {
      createAnalysisRun,
      updateAnalysisRun,
      setActiveAnalysisRun,
      clearActiveAnalysisState,
      isActiveAnalysisRun,
      buildArticleSourceTextFromAnalysis,
      askAgent: askAhaAgent,
      cleanArticleText,
      detectTextType,
      enrichSubjectMatchesForClimateConflict,
      enrichSubjectMatchesForPublicAdministration,
      detectAutoAnalysisDomain,
      getLiterarySubjectMatches,
      getInstitutionalMediaHistorySubjectMatches,
      stripFagkoblingerSections,
      forceLiteraryFagkoblingerInReply,
      forceInstitutionalMediaHistoryFagkoblingerInReply,
      normalizeVisibleReply: normalizeAhaVisibleReply,
      evaluateAnswerForChat: evaluateAhaAnswerForChat,
      maybeHandleMetaAiAgentReply,
      renderAutoOutputs,
      ensureAfterworkForLatestAnalysis
    },
    ui: {
      renderChatMemoryStatus: renderAhaChatMemoryStatus,
      appendChat,
      setProcessing: setAhaProcessing,
      setStatusNote
    }
  });
  if (!submissionRuntime) throw new Error("AHAChatSubmissionRuntime må lastes før ahaChat.js.");
  const submitAhaChatMessage = submissionRuntime.submitAhaChatMessage;

  function analysisTopicMismatch(payload, run = getActiveAnalysisRun()) {
    const sourceText = String(document.getElementById("aha-auto-output")?.dataset?.sourceText || "");
    return runContext.analysisTopicMismatch(payload, run, sourceText);
  }

  function renderAnalysisDebugPanel(payload = {}) {
    const canonical = payload?.canonicalAnalysis && typeof payload.canonicalAnalysis === "object" ? payload.canonicalAnalysis : {};
    const afterwork = payload && typeof payload === "object" ? payload : {};
    const run = getActiveAnalysisRun() || {};
    const activeRunId = run.analysisRunId || run.runId || "";
    return `<aside class="aha-analysis-debug" data-dev-info="analysis-run"><strong>Dev analysebinding</strong><dl>` +
      `<div><dt>activeRunId</dt><dd>${escHtml(activeRunId)}</dd></div>` +
      `<div><dt>canonicalAnalysis.runId</dt><dd>${escHtml(canonical.analysisRunId || canonical.runId || "")}</dd></div>` +
      `<div><dt>afterwork.runId</dt><dd>${escHtml(afterwork.analysisRunId || afterwork.runId || "")}</dd></div>` +
      `<div><dt>sourceHash</dt><dd>${escHtml(afterwork.sourceHash || afterwork.sourceTextHash || run.sourceHash || "")}</dd></div>` +
      `<div><dt>sourceKind</dt><dd>${escHtml(afterwork.sourceKind || run.sourceKind || "")}</dd></div>` +
      `<div><dt>lastUpdated</dt><dd>${escHtml(afterwork.lastUpdated || afterwork.createdAt || new Date().toISOString())}</dd></div>` +
      `</dl></aside>`;
  }

  function clearActiveAnalysisState(run, message = "AHA analyserer ny kilde …") {
    if (run) setActiveAnalysisRun(run);
    try { global.localStorage?.removeItem(AUTO_OUTPUT_STORAGE_KEY); } catch {}
    const host = document.getElementById("aha-auto-output");
    if (host) {
      host.dataset.analysisId = run?.analysisId || "";
      host.dataset.analysisRunId = run?.analysisRunId || run?.runId || "";
      host.dataset.runId = run?.runId || run?.analysisRunId || "";
      host.dataset.sourceId = run?.sourceId || "";
      host.dataset.sourceTextHash = run?.sourceHash || "";
      host.dataset.sourceTextPreview = run?.sourcePreview || "";
      host.innerHTML = `<div class="auto-output-head"><h2>AHA etterarbeid</h2><p>${escHtml(message)}</p></div>${renderAnalysisDebugPanel({})}`;
    }
    renderAhaPersonalRetrieval(null);
    renderAhaAnswerComposer(null);
    renderPanel("");
    const afterworkPanel = document.getElementById("afterwork-panel");
    if (afterworkPanel) afterworkPanel.innerHTML = "";
    try { global.AHAExplorer?.clear?.(run); } catch (err) { console.warn("AHA Explorer clear feilet", err); }
    const evaluationStatus = document.getElementById("aha-answer-evaluation-status");
    if (evaluationStatus) evaluationStatus.textContent = "Svar-evaluering venter på aktiv analyse.";
    setExportButtonsEnabled(false);
  }


  const AHA_INSIGHT_CONTRACT = Object.freeze({
    FUNCTIONAL_TYPES: new Set([
      "observation", "question", "task", "problem", "solution",
      "decision", "definition", "contradiction", "learning_point", "pattern", "memory", "principle"
    ])
  });
  const INSIGHT_NOISE_PATTERN = /\b(les også|les ogsa|annonsørinnhold|annonsorinnhold|logo|illustrasjon|annonse|sponset|kjolefavoritter|bryllupsgjesten)\b/ig;
  const LEADING_PUNCTUATION_PATTERN = /^[\s"'“”«».,:;|\-–—]+/;
  const LES_OGSA_TEASER_PATTERN = /(«|»|"|')?\s*les\s+også\s*:?\s*[^.!?\n]*(?:[.!?]|$)/ig;
  const TEASER_TITLE_PATTERN = /^(når\s+vekst\s+blir\s+en\s+trussel)\b/i;
  function loadChamberFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return insightsApi().createEmptyChamber();
      return JSON.parse(raw);
    } catch (e) {
      console.warn("Kunne ikke laste innsiktskammer, lager nytt.", e);
      return insightsApi().createEmptyChamber();
    }
  }

  function saveChamberToStorage(chamber) {
    try {
      // Stempler hvert lokale skriv med tidspunkt så ahaChamberSync kan
      // sammenligne mot Supabase sin updated_at i pull-fasen.
      if (chamber && typeof chamber === "object") {
        chamber._local_updated_at = new Date().toISOString();
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chamber));
      try {
        global.dispatchEvent(new CustomEvent("aha:chamber-saved", {
          detail: { source: "ahaChat", insight_count: (chamber?.insights || []).length }
        }));
      } catch {}
    } catch (e) {
      console.warn("Kunne ikke lagre innsiktskammer.", e);
    }
  }

  function getThemeId() {
    const input = document.getElementById("theme-id");
    const value = input && String(input.value || "").trim();
    return value || "th_default";
  }

  function getFieldId() { return null; }

  function out(message) {
    const el = document.getElementById("out");
    if (!el) return;
    el.textContent = String(message || "");
  }
  function setStatusNote(message) {
    const el = document.getElementById("chat-status-note");
    if (!el) return;
    el.textContent = String(message || "");
  }

  function escHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getAhaPersonalContextApi(...args) { return personalUi?.getAhaPersonalContextApi(...args) ?? null; }
  function buildAhaPersonalMessageContext(...args) { return personalUi?.buildAhaPersonalMessageContext(...args) ?? null; }
  function buildAhaAnswerPackage(...args) { return personalUi?.buildAhaAnswerPackage(...args) ?? null; }
  function renderAhaAnswerComposer(...args) { return personalUi?.renderAhaAnswerComposer(...args); }
  function renderAhaAnswerEvaluation(...args) { return personalUi?.renderAhaAnswerEvaluation(...args); }
  function evaluateAhaAnswerForChat(...args) { return personalUi?.evaluateAhaAnswerForChat(...args) ?? null; }
  function renderAhaPersonalContextStatus(...args) { return personalUi?.renderAhaPersonalContextStatus(...args) ?? null; }
  function renderAhaPersonalRetrieval(...args) { return personalUi?.renderAhaPersonalRetrieval(...args); }
  function buildAhaPersonalAiLoopChatReadinessStatus(...args) { return personalUi?.buildAhaPersonalAiLoopChatReadinessStatus(...args); }
  function renderAhaPersonalAiLoopStatus(...args) { return personalUi?.renderAhaPersonalAiLoopStatus(...args) ?? null; }
  function renderAhaMemoryTransparency(...args) { return personalUi?.renderAhaMemoryTransparency(...args) ?? null; }
  function renderAhaMemoryStatus(...args) { return personalUi?.renderAhaMemoryStatus(...args); }
  function renderAhaMemoryControls(...args) { return personalUi?.renderAhaMemoryControls(...args) ?? null; }
  function bindAhaMemoryControls(...args) { return personalUi?.bindAhaMemoryControls(...args); }
  async function updateAhaMemoryStatus(...args) { return personalUi?.updateAhaMemoryStatus(...args) ?? null; }
  function renderAuxPanel(targetId, markup) {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.innerHTML = String(markup || "");
  }



  function currentInsights() {
    const chamber = loadChamberFromStorage();
    const engine = insightsApi();
    const active = typeof engine?.getActiveInsights === "function"
      ? engine.getActiveInsights(chamber)
      : (chamber?.insights || []);
    return active.filter(
      (ins) => ins.subject_id === SUBJECT_ID && ins.theme_id === getThemeId()
    );
  }

  function renderPanel(html) {
    const panel = document.getElementById("panel");
    if (panel) panel.innerHTML = html;
  }

  function getInsightPipeline() {
    if (!insightPipeline) {
      insightPipeline = chatModule("insightPipeline", "AHAChatInsightPipeline")?.create?.({
        filterConceptLabels,
        normalizeSimpleStringList,
        normalizeTheoreticalLinks,
        extractAcademicPhraseConcepts,
        normalizeAfterworkConcept,
        functionalTypes: AHA_INSIGHT_CONTRACT.FUNCTIONAL_TYPES,
        weakConceptWords: { has: conceptPolicy.isWeakConceptWord }
      });
    }
    if (!insightPipeline) throw new Error("AHAChatInsightPipeline må lastes før ahaChat.js.");
    return insightPipeline;
  }

  function generateAIInsightCandidates(...args) { return getInsightPipeline().generateAIInsightCandidates(...args); }
  function normalizeInsightCandidate(...args) { return getInsightPipeline().normalizeInsightCandidate(...args); }
  function isWeakInsightCandidate(...args) { return getInsightPipeline().isWeakInsightCandidate(...args); }
  function buildSemanticInsightCandidates(...args) { return getInsightPipeline().buildSemanticInsightCandidates(...args); }
  function normalizeFunctionalType(...args) { return getInsightPipeline().normalizeFunctionalType(...args); }
  function normalizeCandidateConcepts(...args) { return getInsightPipeline().normalizeCandidateConcepts(...args); }



  function ingestUserMessageWithCandidates(messageText, candidates) {
    const text = String(messageText || "").trim();
    const engine = insightsApi();
    if (!text || !engine) return 0;

    const themeId = getThemeId();
    const fieldId = getFieldId();
    const localCandidates = buildSemanticInsightCandidates(text, { minInsights: 1, maxInsights: 5 });
    const chunks = Array.isArray(candidates) && candidates.length ? candidates : localCandidates;

    const ingest = ingestApi();
    if (ingest && typeof ingest.ingest === "function") {
      // AHAIngest håndterer både source event-loggen, signal-konstruksjon
      // og innlegging i innsiktskammeret. Dobbeltlagring av source events
      // unngås ved at vi ikke lenger kaller AHASources.addSourceEvent her.
      const payload = {
        source_type: "chat",
        source_app: "aha_chat",
        content_type: "text",
        title: "AHA Chat-melding",
        text,
        user_created: true,
        imported: false,
        created_at: new Date().toISOString(),
        subject_id: SUBJECT_ID,
        theme_id: themeId,
        field_id: fieldId,
        meta: { theme_id: themeId, field_id: fieldId }
      };
      if (typeof ingest.ingestWithCandidates === "function") {
        ingest.ingestWithCandidates(payload, chunks);
      } else {
        chunks.forEach((chunk) => ingest.ingest(Object.assign({}, payload, { text: chunk })));
      }
      return chunks.length;
    }

    // Fallback hvis AHAIngest ikke er lastet: skriv direkte til motoren
    // og logg source event manuelt slik vi alltid har gjort.
    let chamber = loadChamberFromStorage();
    chunks.forEach((chunk) => {
      const text = typeof chunk === "string" ? chunk : String(chunk?.text || chunk?.summary || chunk?.title || "").trim();
      if (!text) return;
      const signal = engine.createSignalFromMessage(
        text,
        SUBJECT_ID,
        themeId,
        { field_id: fieldId }
      );
      chamber = engine.addSignalToChamber(chamber, signal);
    });
    saveChamberToStorage(chamber);

    sourcesApi()?.addSourceEvent?.({
      source_type: "chat",
      source_app: "aha_chat",
      content_type: "text",
      title: "AHA Chat-melding",
      text,
      user_created: true,
      imported: false,
      created_at: new Date().toISOString(),
      meta: { theme_id: themeId, field_id: fieldId }
    });

    return chunks.length;
  }

  function handleUserMessage(messageText) {
    return ingestUserMessageWithCandidates(messageText);
  }

  async function handleUserMessageInsightCandidatesInBackground(messageText) {
    const text = String(messageText || "").trim();
    if (!text || !insightsApi()) return 0;
    const themeId = getThemeId();
    const fieldId = getFieldId();
    const aiCandidates = await generateAIInsightCandidates(text, {
      subject_id: SUBJECT_ID,
      theme_id: themeId,
      field_id: fieldId,
      ai_state: buildAIState()
    });
    if (!aiCandidates.length) return 0;
    return ingestUserMessageWithCandidates(text, aiCandidates);
  }


  function buildAIState(options = {}) {
    const includeMemory = options?.includeMemory !== false;
    if (!includeMemory) {
      return {
        top_insights: [],
        concepts: [],
        meta_profile: {}
      };
    }

    const chamber = loadChamberFromStorage();
    const insights = currentInsights();
    const topInsights = insights.slice(0, 8).map((ins) => ({
      id: ins.id,
      title: ins.title || "Innsikt",
      summary: ins.summary || "",
      concepts: (ins.concepts || []).map(memoryConceptLabel).filter(Boolean),
      theme_id: ins.theme_id || null,
      subject_id: ins.subject_id || null
    }));
    const concepts = [];
    topInsights.forEach((ins) => (ins.concepts || []).forEach((c) => concepts.push(c)));
    const metaProfile = global.MetaInsightsEngine?.buildUserMetaProfile?.(chamber, SUBJECT_ID) || {};
    return {
      top_insights: topInsights,
      concepts,
      meta_profile: metaProfile
    };
  }

  async function askAhaAgent(message, options = {}) {
    const apiBase = String(global.AHA_AGENT_API || "").trim().replace(/\/$/, "");
    if (!apiBase) throw new Error("missing_api_base");

    const memoryContext = options?.memoryContext && options.memoryContext.used ? options.memoryContext : null;
    const personalContext = options?.personalContext && typeof options.personalContext === "object" ? options.personalContext : null;
    const body = {
      message,
      ai_state: buildAIState({ includeMemory: Boolean(memoryContext), includePersonalContext: Boolean(personalContext?.prompt) }),
      memory_context: memoryContext,
      personal_context: personalContext ? {
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
      } : null,
      // Bakoverkompatibelt felt for eldre agentkode, men fylles bare når
      // Memory Relevance Gate faktisk har valgt relevante minnetreff.
      similar_insights: memoryContext?.semanticMatches || [],
      profile: {}
    };
    const res = await fetch(`${apiBase}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`chat_http_${res.status}`);
    return res.json();
  }

  function safeMarkupText(value) {
    return escHtml(cleanArticleText(String(value || "")).replace(/\s+/g, " ").trim());
  }
  function safeMarkupList(values) {
    return (Array.isArray(values) ? values : []).map((item) => safeMarkupText(item));
  }
  function safeMarkupSortItems(items) {
    return (Array.isArray(items) ? items : []).map((item) => ({
      label: safeMarkupText(item?.label),
      text: safeMarkupText(item?.text)
    }));
  }

  function normalizeDisplayText(value) {
    return String(value || "")
      .replace(/underviser(\s+)viktigheten/gi, (_match, gap) => `understreker${gap}viktigheten`);
  }
  const knowledgeView = chatModule("knowledgeView", "AHAChatKnowledgeView")?.create?.({
    subjectId: SUBJECT_ID,
    loadChamberFromStorage,
    loadAutoOutputs,
    loadAfterworkEntries,
    getThemeId,
    out,
    currentInsights,
    filterConceptLabels,
    canonicalizeDisplayConcept,
    normalizeConceptKey,
    getCanonicalConceptLabel,
    getCanonicalConceptKey,
    isBlockedStandaloneConcept,
    escHtml,
    extractAcademicPhraseConcepts,
    extractAcademicTheoryLinks,
    prioritizeVisibleConceptEdges,
    isGenericDisplayConcept,
    normalizeAfterworkConcept,
    applyPhraseConceptDisplayPreference,
    detectPublicAdministrationReformSignal,
    readLatestAcademicContext,
    detectAutoAnalysisDomain,
    renderAuxPanel,
    renderPanel
  });
  if (!knowledgeView) throw new Error("AHAChatKnowledgeView må lastes før ahaChat.js.");

  function showStatus() {
    return knowledgeView.showStatus();
  }

  function showConcepts() {
    return knowledgeView.showConcepts();
  }

  function showMeta() {
    return knowledgeView.showMeta();
  }

  function showKnowledgeMap() {
    return knowledgeView.showKnowledgeMap();
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(HIGHLIGHTS_STORAGE_KEY);
    localStorage.removeItem(AUTO_OUTPUT_STORAGE_KEY);
    localStorage.removeItem(AFTERWORK_STORAGE_KEY);
    out("AHA-kammer nullstilt.");
    setStatusNote("Nullstilt lokalt kammer og highlights.");
    renderPanel("");
    const log = document.getElementById("chat-log");
    if (log) log.innerHTML = "";
    const autoOutput = document.getElementById("aha-auto-output");
    if (autoOutput) autoOutput.innerHTML = "";
    const metaProfilePanel = document.getElementById("meta-profile-panel");
    if (metaProfilePanel) metaProfilePanel.innerHTML = "";
    const afterworkPanel = document.getElementById("afterwork-panel");
    if (afterworkPanel) afterworkPanel.innerHTML = "";
    ["aha-auto-output", "afterwork-panel"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el?.dataset) return;
      delete el.dataset.sourceText;
      delete el.dataset.sourceTextHash;
      delete el.dataset.sourceTextPreview;
    });
    renderHighlightsRail();
    updateEmptyState();
  }

  function cleanArticleText(raw) {
    return textUtils.cleanArticleText(raw);
  }

  function toSentences(text) {
    return textUtils.toSentences(text);
  }

  function collectOpinionArticleEvidence(raw, sentences) {
    return textUtils.collectOpinionArticleEvidence(raw, sentences);
  }

  function detectTextType(raw) {
    return chatModule("signals", "AHAChatSignals").detectTextType(raw);
  }

  function loadAutoOutputs() {
    try {
      const raw = localStorage.getItem(AUTO_OUTPUT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      // Bakoverkompatibilitet: gammel cache var ren payload.
      if (parsed.payload && typeof parsed.payload === "object") return parsed;
      return { payload: parsed };
    } catch { return null; }
  }


  function setAhaProcessing(isProcessing, message = "AHA analyserer teksten …") {
    const indicator = document.getElementById("aha-processing-indicator");
    const text = document.getElementById("aha-processing-text");
    const sendBtn = document.getElementById("btn-send");

    if (text) text.textContent = message;
    if (indicator) indicator.hidden = !isProcessing;
    if (sendBtn) sendBtn.disabled = Boolean(isProcessing);
    document.body.classList.toggle("aha-is-processing", Boolean(isProcessing));
  }

  function setExportButtonsEnabled(enabled) {
    const isEnabled = Boolean(enabled);
    [
      "btn-export-analysis",
      "btn-export-analysis-json",
      "btn-export-analysis-main",
      "btn-export-analysis-json-main",
      "btn-export"
    ].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = !isEnabled;
    });
  }

  // Fag-/emne-anriking ligger i ahaChatSubjects.js; her beholdes tynne delegerende wrappere.
  function normalizeSubjectLinks(subjectMatches) {
    return chatModule("subjects", "AHAChatSubjects").normalizeSubjectLinks(subjectMatches);
  }
  function enrichSubjectMatchesForClimateConflict(text, subjectMatches) {
    return chatModule("subjects", "AHAChatSubjects").enrichSubjectMatchesForClimateConflict(text, subjectMatches);
  }
  function detectPublicAdministrationReformSignal(text) {
    return chatModule("signals", "AHAChatSignals").detectPublicAdministrationReformSignal(text);
  }
  function detectPublicAdministrationSignal(text) {
    return chatModule("signals", "AHAChatSignals").detectPublicAdministrationSignal(text);
  }
  function enrichSubjectMatchesForPublicAdministration(text, subjectMatches) {
    return chatModule("subjects", "AHAChatSubjects").enrichSubjectMatchesForPublicAdministration(text, subjectMatches);
  }

  function resolveConceptTerm(term) {
    if (term == null) return "";
    if (typeof term === "string") return term;
    if (typeof term === "number") return String(term);
    if (typeof term === "object") {
      return String(term?.label || term?.title || term?.key || term?.term || term?.name || term?.subject_label || term?.subject_id || term?.id || term?.value || "");
    }
    return String(term || "");
  }

  function getLatestAhaReplyFromDom() {
    const rows = Array.from(document.querySelectorAll(".chat-line-aha"));
    const last = rows[rows.length - 1];
    return String(last?.textContent || "").trim();
  }


  function normalizeFagkoblinger(value) {
    return chatModule("subjects", "AHAChatSubjects").normalizeFagkoblinger(value);
  }

  function normalizeHistoryGoLinks(value) {
    const items = Array.isArray(value) ? value : [];
    const out = [];
    const seen = new Set();
    items.forEach((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const normalized = {
          type: String(item.type || item.kind || "topic").trim() || "topic",
          id: String(item.id || item.slug || item.key || item.title || "").trim(),
          title: String(item.title || item.label || item.name || item.id || "").trim(),
          reason: String(item.reason || item.why || item.explanation || "").trim()
        };
        if (!normalized.id && normalized.title) normalized.id = normalizeConceptKey(normalized.title).replace(/\s+/g, "_");
        if (!normalized.title) normalized.title = normalized.id;
        if (!normalized.id && !normalized.title) return;
        const sig = `${normalized.type}::${normalized.id}::${normalized.title}`.toLowerCase();
        if (seen.has(sig)) return;
        seen.add(sig);
        out.push(normalized);
        return;
      }
      const text = String(item || "").trim();
      if (!text) return;
      const id = normalizeConceptKey(text).replace(/\s+/g, "_");
      const sig = `topic::${id}::${text}`.toLowerCase();
      if (seen.has(sig)) return;
      seen.add(sig);
      out.push({ type: "topic", id, title: text, reason: "" });
    });
    return out;
  }

  function inferReligiousLexiconEvidence(rawText = "") {
    return chatModule("signals", "AHAChatSignals").inferReligiousLexiconEvidence(rawText);
  }

  function isAcademicLikeType(type) {
    return chatModule("subjects", "AHAChatSubjects").isAcademicLikeType(type);
  }

  function isDayLogType(type) {
    return chatModule("subjects", "AHAChatSubjects").isDayLogType(type);
  }

  function ensureAcademicAfterworkShape(afterwork = {}, canonical = {}) {
    if (!isAcademicLikeType(canonical?.contentType)) return afterwork;
    const out = Object.assign({}, afterwork);
    const summary = String(out.summary || "").trim();
    if (!summary || /kort dagsoppsummering/i.test(summary) || /ikke dagbokmateriale/i.test(summary)) {
      const groundedSummary = String(canonical?.keyInsight || canonical?.reflection || canonical?.theme || "").trim();
      out.summary = groundedSummary ? `Kort fagoppsummering: ${groundedSummary}` : "Kort fagoppsummering: Kilden analyseres ut fra sitt eget faglige innhold.";
    }
    const reflection = String(out.reflection || "").trim();
    if (!reflection || /dagslogg/i.test(reflection)) out.reflection = String(canonical?.reflection || "");
    const path = Array.isArray(out.path) ? out.path : [];
    const dayLogPathSignals = /(oppsummer hendelsene kort|finn ett mønster eller én følelse|velg én ting du tar med videre i morgen)/i;
    if (!path.length || path.some((step) => dayLogPathSignals.test(String(step || "")))) out.path = Array.isArray(canonical?.path) ? canonical.path : [];
    return out;
  }

  function getAhaExportDeps() {
    return {
      loadAutoOutputs,
      analysisRunContract,
      getActiveAnalysisRun,
      loadAfterworkEntries,
      sourceHash,
      buildCanonicalAnalysis,
      ensureAcademicAfterworkShape,
      normalizeSubjectLinks,
      normalizeFagkoblinger,
      getLatestAhaReplyFromDom,
      loadChamberFromStorage,
      getCalibrationStatus: () =>
        (typeof global.AHACalibration?.getStatus === "function"
          ? global.AHACalibration.getStatus()
          : {}),
      buildMetaProfile: (chamber) =>
        (typeof insightsApi()?.buildMetaProfile === "function"
          ? (insightsApi().buildMetaProfile(chamber) || {})
          : (chamber?.meta || {})),
      setStatusNote,
      out
    };
  }

  function buildAhaAnalysisExportBundle() {
    return chatModule("export", "AHAChatExport").buildAhaAnalysisExportBundle(getAhaExportDeps());
  }

  function formatAhaAnalysisExportMarkdown(bundle) {
    return chatModule("export", "AHAChatExport").formatAhaAnalysisExportMarkdown(bundle);
  }

  async function copyAhaAnalysisExportMarkdown() {
    return chatModule("export", "AHAChatExport").copyAhaAnalysisExportMarkdown(getAhaExportDeps());
  }

  function exportAhaAnalysisJson() {
    return chatModule("export", "AHAChatExport").exportAhaAnalysisJson(getAhaExportDeps());
  }

  // AHA Analyse Explorer: fanene under chatten rendres fra samme
  // eksportbundle som Kopier analyse / Eksporter JSON bruker. Debounce
  // fordi bundlen bygges på nytt ved hver oppdatering.
  let explorerRefreshTimer = null;
  function refreshAhaExplorer() {
    if (!global.AHAExplorer?.render) return;
    if (explorerRefreshTimer) clearTimeout(explorerRefreshTimer);
    explorerRefreshTimer = setTimeout(() => {
      explorerRefreshTimer = null;
      try {
        global.AHAExplorer.render(buildAhaAnalysisExportBundle());
      } catch (err) {
        console.warn("AHA Explorer-oppdatering feilet", err);
      }
    }, 150);
  }
  global.refreshAhaExplorer = refreshAhaExplorer;
  // Analyse-hjelpere ligger i ahaChatAnalysis.js; her beholdes tynne delegerende wrappere.
  function buildOpinionArticleQualityAnalysis(raw, evidence, sentences) {
    return chatModule("analysis", "AHAChatAnalysis").buildOpinionArticleQualityAnalysis(raw, evidence, sentences);
  }

  function buildHistoryGoSuggestion(payload, sourceText) {
    const source = String(sourceText || "");
    const text = `${source} ${(Array.isArray(payload?.insightCards) ? payload.insightCards.join(" ") : "")}`.toLowerCase();
    const navSignal = detectPublicAdministrationReformSignal(source || text);
    const literarySignal = detectLiteraryAttachmentSignal(source || text);
    if (navSignal?.strong) {
      return `<article class="auto-card" data-auto-card="historygo">
        <h4>History Go-kobling funnet</h4>
        <p><strong>Tema:</strong> Offentlig forvaltning</p>
        <p><strong>Mulig History Go-kategori:</strong> politikk — Politikk & samfunn</p>
        <p><strong>Kan brukes til:</strong> quizspørsmål · leksikonoppføring · læringssti · begrepskort · fagkobling</p>
      </article>`;
    }
    if (literarySignal?.strong) {
      return `<article class="auto-card" data-auto-card="historygo">
        <h4>History Go-kobling funnet</h4>
        <p><strong>Tema:</strong> Litteratur og psykologi</p>
        <p><strong>Mulig History Go-kategori:</strong> litteratur — Litteratur</p>
        <p><strong>Kan brukes til:</strong> forfatterkort · verk-leksikon · begrepskort · litteraturquiz · fagkobling mellom psykologi og litteratur</p>
      </article>`;
    }
    return "";
  }

  function filterCrossDomainAutoPayload(payload, sourceText) {
    const safe = payload && typeof payload === "object" ? payload : {};
    const src = String(sourceText || "").toLowerCase();
    const domain = detectAutoAnalysisDomain(src, safe);
    if (domain !== "literary_attachment") return safe;
    const blocked = /(sahel|mali|klima som konfliktforklaring|klimaforklaring|knapphetsskolen|ressursknapphet|miljøsikkerhet|politisk økologi|environmental security|climate conflict|makt- og produksjonsforhold)/i;
    const filterArray = (arr) => (Array.isArray(arr) ? arr.filter((item) => !blocked.test(typeof item === "string" ? item : `${item?.label || ""} ${item?.text || ""} ${item?.title || ""} ${item?.summary || ""}`)) : []);
    return {
      ...safe,
      reflection: blocked.test(String(safe.reflection || "")) ? "" : String(safe.reflection || ""),
      sortItems: filterArray(safe.sortItems),
      list: filterArray(safe.list),
      insightCards: filterArray(safe.insightCards),
      path: getLiteraryAttachmentLearningPath(),
      keywords: filterArray(safe.keywords),
      subjectMatches: getLiterarySubjectMatches(),
      subjectLinks: getLiterarySubjectMatches(),
      theoryLinks: filterArray(safe.theoryLinks),
      thoughts: {
        hovedspor: blocked.test(String(safe?.thoughts?.hovedspor || "")) ? "" : String(safe?.thoughts?.hovedspor || ""),
        lose_tanker: blocked.test(String(safe?.thoughts?.lose_tanker || "")) ? "" : String(safe?.thoughts?.lose_tanker || ""),
        neste_steg: blocked.test(String(safe?.thoughts?.neste_steg || "")) ? "" : String(safe?.thoughts?.neste_steg || "")
      }
    };
  }

  // AHA Chat viser ett relevant hovedsvar med passende lengde. Tekstnormaliseringen
  // ligger i ahaChatReplyFormat.js; her beholdes en tynn delegerende wrapper.
  function normalizeAhaVisibleReply(rawReply, userText) {
    return chatModule("replyFormat", "AHAChatReplyFormat").normalizeAhaVisibleReply(rawReply, userText);
  }

  function consumePendingChatPrompt() {
    const raw = localStorage.getItem(PENDING_CHAT_PROMPT_KEY);
    if (!raw) return;
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const prompt = String(payload?.prompt || "").trim();
    if (!prompt) return;
    const msg = document.getElementById("msg");
    if (!msg) return;
    if (String(msg.value || "").trim()) return;
    msg.value = prompt;
    msg.dispatchEvent(new Event("input", { bubbles: true }));
    msg.focus();
    localStorage.removeItem(PENDING_CHAT_PROMPT_KEY);
    if (String(payload?.type || "") === "meta_insights_ai_session") {
      startMetaAiSession(payload);
      return;
    }
    setStatusNote("Klar til å bygge videre fra AHA Home.");
  }

  function renderAhaChatMemoryStatus() {
    const host = document.getElementById("aha-chat-memory-status");
    if (!host) return null;
    const api = global.AHAChatPersistence;
    if (!api?.collectChatStats) {
      host.textContent = "Chat-minne er ikke aktivt. Samtaler brukes ikke som treningsgrunnlag før du har godkjent dem i Data Intake.";
      return null;
    }
    const session = api.getOrCreateCurrentSession?.();
    const stats = api.collectChatStats();
    host.textContent = `Lagring aktiv. Session: ${session?.id || "ukjent"}. Meldinger i session: ${(session?.messages || []).length}. Totalt: ${stats.messages}. Samtaler brukes ikke som treningsgrunnlag før du har godkjent dem i Data Intake.`;
    return stats;
  }

  function bind() {
    const button = document.getElementById("btn-send");
    const textarea = document.getElementById("msg");
    if (button && textarea) {
      button.addEventListener("click", async () => {
        const text = textarea.value.trim();
        if (!text) return;
        await submitAhaChatMessage(text, textarea);
      });
    }

    document.getElementById("btn-insights")?.addEventListener("click", showInsights);
    document.getElementById("btn-status")?.addEventListener("click", showStatus);
    document.getElementById("btn-concepts")?.addEventListener("click", showConcepts);
    document.getElementById("btn-meta")?.addEventListener("click", showMeta);
    document.getElementById("btn-knowledge-map")?.addEventListener("click", showKnowledgeMap);
    document.getElementById("btn-saved-afterwork")?.addEventListener("click", showSavedAfterwork);
    document.getElementById("btn-export")?.addEventListener("click", exportAhaAnalysisJson);
    document.getElementById("btn-export-analysis")?.addEventListener("click", () => { void copyAhaAnalysisExportMarkdown(); });
    document.getElementById("btn-export-analysis-json")?.addEventListener("click", exportAhaAnalysisJson);
    document.getElementById("btn-export-analysis-main")?.addEventListener("click", () => { void copyAhaAnalysisExportMarkdown(); });
    document.getElementById("btn-export-analysis-json-main")?.addEventListener("click", exportAhaAnalysisJson);
    document.getElementById("btn-reset")?.addEventListener("click", reset);
    bindActionChips();
    bindAhaMemoryControls();

    bindPanelActionHandler();
    setAhaProcessing(false);
    restoreAutoOutputFromStorage();
    consumePendingChatPrompt();

    // Når et nytt merge-forslag persisteres på chamberet, re-rendr
    // panelet hvis det vises. UI-en henter forslagene rett fra
    // localStorage, så den trenger bare et signal om å oppdatere seg.
    global.addEventListener("aha:merge-suggested", () => {
      const panel = document.getElementById("panel");
      if (panel && panel.querySelector(".insight-panel")) showInsights();
    });

    ["aha:chamber-saved", "aha:embedding-stored", "aha:embeddings-bulk-complete"].forEach((eventName) => {
      global.addEventListener(eventName, () => { void updateAhaMemoryStatus(); });
    });
    void updateAhaMemoryStatus();
    renderAhaChatMemoryStatus();
    renderAhaPersonalContextStatus();

    updateEmptyState();
    renderHighlightsRail();
    const log = document.getElementById("chat-log");
    if (log) {
      log.addEventListener("scroll", renderHighlightsRail);
      window.addEventListener("resize", renderHighlightsRail);
    }
  }

  function suggestCategoryChips() {
    const insights = currentInsights().slice(0, 6);
    const labels = [];
    insights.forEach((ins) => {
      (ins.emner || []).forEach((emne) => labels.push(emne));
      (ins.concepts || []).forEach((concept) => labels.push(concept?.label || concept?.key));
      (ins.patterns || []).forEach((pattern) => labels.push(pattern?.label || pattern?.key));
    });
    const filteredLabels = filterConceptLabels(labels);
    return [...new Set(filteredLabels)].slice(0, 8);
  }

  function bindActionChips() {
    document.querySelectorAll("[data-chat-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-chat-action");
        if (action === "import_hg") {
          document.getElementById("btn-import-hg")?.click();
          return;
        }
        if (action === "koble_hg") {
          setStatusNote("Koblinger vises gjennom innsikter og fagkoblinger i chatten.");
          return;
        }
        if (action === "lag_innsikt") showInsights();
        focusAutoCard(action);
        setStatusNote("Viser valgt analysekort.");
      });
    });
  }

  global.AHAMemoryControls = {
    get() { return loadAhaMemoryControls(); },
    set(key, value) { return setAhaMemoryControl(key, value); },
    enableSaving() { return setAhaMemoryControl("saveNewInsights", true); },
    disableSaving() { return setAhaMemoryControl("saveNewInsights", false); },
    enableMemoryUse() { return setAhaMemoryControl("useExistingMemory", true); },
    disableMemoryUse() { return setAhaMemoryControl("useExistingMemory", false); },
    reset() { return resetAhaMemoryControls(); }
  };

  global.AHAMemoryDebug = {
    enable() { global.localStorage?.setItem("aha_memory_debug", "true"); },
    disable() { global.localStorage?.removeItem("aha_memory_debug"); },
    isEnabled() { return isAhaMemoryDebugEnabled(); }
  };

  global.AHAMemoryExclusions = {
    get() { return loadAhaMemoryExclusions(); },
    exclude(insightOrId, reason) { return excludeAhaMemoryInsight(insightOrId, reason); },
    include(insightOrId) { return includeAhaMemoryInsight(insightOrId); },
    reset() { return resetAhaMemoryExclusions(); },
    items() { return getAhaExcludedMemoryItems(); },
    isExcluded(insightOrId) { return isAhaMemoryInsightExcluded(insightOrId); }
  };

  global.loadChamberFromStorage = global.loadChamberFromStorage || loadChamberFromStorage;
  global.saveChamberToStorage = global.saveChamberToStorage || saveChamberToStorage;
  global.AHATestHooks = Object.assign({}, global.AHATestHooks || {}, { detectTextType, buildCanonicalAnalysis, buildAhaAnalysisExportBundle, formatAhaAnalysisExportMarkdown, buildAutoOutputs, renderAutoOutputs, detectAutoAnalysisDomain, buildAcademicConceptCandidates, buildSourceGroundedAcademicPayload, applyRuntimeKnowledgePolicy, isTransientAnalysisDocument, AHA_RUNTIME_KNOWLEDGE_POLICY, normalizeFagkoblinger, resolveCanonicalAnalysisWithOptionalPythonEngine, isAhaMemoryQuestion, buildAhaLearningContractReply, buildAhaMemoryStatus, shouldUseAhaMemory, buildAhaMemoryContext, buildAhaMemoryOffContext, loadAhaMemoryControls, saveAhaMemoryControls, setAhaMemoryControl, isAhaSavingEnabled, isAhaMemoryUseEnabled, loadAhaMemoryExclusions, saveAhaMemoryExclusions, getAhaMemoryInsightStableKey, getAhaMemoryInsightKey, isAhaMemoryInsightExcluded, excludeAhaMemoryInsight, includeAhaMemoryInsight, resetAhaMemoryExclusions, getAhaExcludedMemoryItems, renderAhaMemoryControls, bindAhaMemoryControls, submitAhaChatMessage, findRelevantLocalMemory, formatAhaMemoryContextForAgent, isAhaMemoryDebugEnabled, buildAhaMemoryTransparency, formatAhaMemoryTransparencyDetails, renderAhaMemoryTransparency, appendChat, updateAnswerActionsVisibility, getActiveMetaAiSession, startMetaAiSession, renderMetaAiSessionBox, renderMetaAiClaims, maybeHandleMetaAiAgentReply, saveMetaAiClaimFeedback, buildAhaPersonalAiLoopChatReadinessStatus, renderAhaPersonalAiLoopStatus, buildAhaAnswerPackage, renderAhaAnswerComposer, createAnalysisRun, updateAnalysisRun, bindAnalysisArtifact, artifactMatchesActiveRun, clearActiveAnalysisState, renderAutoOutputPayload, enforceCanonicalSourceGrounding, filterRetrievalForActiveSource, scoreRetrievalAgainstSource, filterMemoryContextForActiveSource, isActiveAnalysisRun });

  global.AHAActiveRun = {
    get() { return getActiveAnalysisRun(); },
    isActive(run) { return isActiveAnalysisRun(run); },
    matches(artifact) { return artifactMatchesActiveRun(artifact, getActiveAnalysisRun()); },
    bind(artifact) { return bindAnalysisArtifact(artifact, getActiveAnalysisRun()); }
  };

  const chatApi = {
    loadChamberFromStorage,
    saveChamberToStorage,
    handleUserMessage,
    askAhaAgent,
    buildAIState,
    isAhaMemoryQuestion,
    buildAhaLearningContractReply,
    buildAhaMemoryStatus,
    shouldUseAhaMemory,
    buildAhaMemoryContext,
    buildAhaMemoryOffContext,
    loadAhaMemoryControls,
    saveAhaMemoryControls,
    setAhaMemoryControl,
    isAhaSavingEnabled,
    isAhaMemoryUseEnabled,
    loadAhaMemoryExclusions,
    saveAhaMemoryExclusions,
    getAhaMemoryInsightStableKey,
    getAhaMemoryInsightKey,
    isAhaMemoryInsightExcluded,
    excludeAhaMemoryInsight,
    includeAhaMemoryInsight,
    resetAhaMemoryExclusions,
    getAhaExcludedMemoryItems,
    renderAhaMemoryControls,
    bindAhaMemoryControls,
    submitAhaChatMessage,
    findRelevantLocalMemory,
    formatAhaMemoryContextForAgent,
    isAhaMemoryDebugEnabled,
    buildAhaMemoryTransparency,
    formatAhaMemoryTransparencyDetails,
    renderAhaMemoryTransparency,
    appendChat,
    updateAhaMemoryStatus,
    buildAhaPersonalAiLoopChatReadinessStatus,
    renderAhaPersonalAiLoopStatus,
    buildAhaAnswerPackage,
    renderAhaAnswerComposer,
    createAnalysisRun,
    updateAnalysisRun,
    bindAnalysisArtifact,
    artifactMatchesActiveRun,
    clearActiveAnalysisState,
    renderAutoOutputPayload,
    filterRetrievalForActiveSource,
    scoreRetrievalAgainstSource,
    filterMemoryContextForActiveSource,
    isActiveAnalysisRun
  };
  global.AHAChat = chatApi;
  global.AHAModuleApi?.register?.("chat", chatApi, {
    version: 1,
    legacyGlobal: "AHAChat",
    exports: Object.keys(chatApi)
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})(window);
