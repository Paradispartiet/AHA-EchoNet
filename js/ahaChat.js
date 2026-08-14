// ahaChat.js
// Ren kobling mellom AHA Chat UI og eksisterende InsightsEngine.

(function (global) {
  "use strict";

  const SUBJECT_ID = "sub_laring";
  const HIGHLIGHTS_STORAGE_KEY = "aha_chat_highlights_v1";
  const CHAT_THREAD_ID = "default_thread";

  const AFTERWORK_STORAGE_KEY = "aha_afterwork_v1";
  const PENDING_CHAT_PROMPT_KEY = "aha_pending_chat_prompt_v1";

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
  const cleanArticleText = textUtils.cleanArticleText;
  const toSentences = textUtils.toSentences;
  const collectOpinionArticleEvidence = textUtils.collectOpinionArticleEvidence;
  if ([shortHash, takeKeywords, sourceHash, cleanArticleText, toSentences, collectOpinionArticleEvidence].some((fn) => typeof fn !== "function")) {
    throw new Error("AHAChatTextUtils må eksponere alle tekst- og kildeprimitiver.");
  }

  const signals = chatModule("signals", "AHAChatSignals");
  if (!signals) throw new Error("AHAChatSignals må lastes før ahaChat.js.");
  const detectTextType = signals.detectTextType;
  const detectPublicAdministrationReformSignal = signals.detectPublicAdministrationReformSignal;
  const detectPublicAdministrationSignal = signals.detectPublicAdministrationSignal;
  const inferReligiousLexiconEvidence = signals.inferReligiousLexiconEvidence;
  if ([detectTextType, detectPublicAdministrationReformSignal, detectPublicAdministrationSignal, inferReligiousLexiconEvidence].some((fn) => typeof fn !== "function")) {
    throw new Error("AHAChatSignals må eksponere alle signalprimitiver.");
  }

  const subjects = chatModule("subjects", "AHAChatSubjects");
  if (!subjects) throw new Error("AHAChatSubjects må lastes før ahaChat.js.");
  const normalizeSubjectLinks = subjects.normalizeSubjectLinks;
  const enrichSubjectMatchesForClimateConflict = subjects.enrichSubjectMatchesForClimateConflict;
  const enrichSubjectMatchesForPublicAdministration = subjects.enrichSubjectMatchesForPublicAdministration;
  const normalizeFagkoblinger = subjects.normalizeFagkoblinger;
  const isAcademicLikeType = subjects.isAcademicLikeType;
  if ([normalizeSubjectLinks, enrichSubjectMatchesForClimateConflict, enrichSubjectMatchesForPublicAdministration, normalizeFagkoblinger, isAcademicLikeType].some((fn) => typeof fn !== "function")) {
    throw new Error("AHAChatSubjects må eksponere alle fagkoblingsprimitiver.");
  }

  const analysis = chatModule("analysis", "AHAChatAnalysis");
  const buildOpinionArticleQualityAnalysis = analysis?.buildOpinionArticleQualityAnalysis;
  if (typeof buildOpinionArticleQualityAnalysis !== "function") {
    throw new Error("AHAChatAnalysis må eksponere buildOpinionArticleQualityAnalysis.");
  }

  const replyFormat = chatModule("replyFormat", "AHAChatReplyFormat");
  const normalizeAhaVisibleReply = replyFormat?.normalizeAhaVisibleReply;
  if (typeof normalizeAhaVisibleReply !== "function") {
    throw new Error("AHAChatReplyFormat må eksponere normalizeAhaVisibleReply.");
  }

  const chamberStore = chatModule("chamberStore", "AHAChatChamberStore")?.create?.({
    createEmptyChamber: () => insightsApi().createEmptyChamber()
  });
  if (!chamberStore) throw new Error("AHAChatChamberStore må lastes før ahaChat.js.");
  const loadChamberFromStorage = chamberStore.load;
  const saveChamberToStorage = chamberStore.save;
  const clearChamberStorage = chamberStore.clear;

  const autoOutputStore = chatModule("autoOutputStore", "AHAChatAutoOutputStore")?.create?.({
    sourceHash,
    defaultConversationId: CHAT_THREAD_ID
  });
  if (!autoOutputStore) throw new Error("AHAChatAutoOutputStore må lastes før ahaChat.js.");
  const loadAutoOutputs = autoOutputStore.load;
  const saveAutoOutputs = autoOutputStore.save;
  const clearAutoOutputs = autoOutputStore.clear;

  const analysisPolicy = chatModule("analysisPolicy", "AHAChatAnalysisPolicy")?.create?.({
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
    loadChamber: loadChamberFromStorage
  });
  if (!memoryControls) throw new Error("AHAChatMemoryControls må lastes før ahaChat.js.");
  if (typeof memoryControls.bindView !== "function") throw new Error("AHAChatMemoryControls må eksponere bindView.");

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

  const insightPipeline = chatModule("insightPipeline", "AHAChatInsightPipeline")?.create?.({
    filterConceptLabels,
    normalizeSimpleStringList,
    normalizeTheoreticalLinks,
    extractAcademicPhraseConcepts,
    normalizeAfterworkConcept,
    weakConceptWords: { has: conceptPolicy.isWeakConceptWord }
  });
  if (!insightPipeline) throw new Error("AHAChatInsightPipeline må lastes før ahaChat.js.");
  const generateAIInsightCandidates = insightPipeline.generateAIInsightCandidates;
  const buildSemanticInsightCandidates = insightPipeline.buildSemanticInsightCandidates;

  const agentRuntime = chatModule("agentRuntime", "AHAChatAgentRuntime")?.create?.({
    subjectId: SUBJECT_ID,
    getApiBase: () => global.AHA_AGENT_API,
    fetchImpl: (...args) => global.fetch(...args),
    loadChamber: loadChamberFromStorage,
    getCurrentInsights: currentInsights,
    memoryConceptLabel,
    buildUserMetaProfile: (chamber, subjectId) =>
      global.MetaInsightsEngine?.buildUserMetaProfile?.(chamber, subjectId) || {}
  });
  if (!agentRuntime) throw new Error("AHAChatAgentRuntime må lastes før ahaChat.js.");
  const buildAIState = agentRuntime.buildAIState;
  const askAhaAgent = agentRuntime.askAhaAgent;

  const ingestRuntime = chatModule("ingestRuntime", "AHAChatIngestRuntime")?.create?.({
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
  });
  if (!ingestRuntime) throw new Error("AHAChatIngestRuntime må lastes før ahaChat.js.");
  const handleUserMessage = ingestRuntime.handleUserMessage;
  const handleUserMessageInsightCandidatesInBackground = ingestRuntime.handleUserMessageInsightCandidatesInBackground;

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

  const personalUi = chatModule("personalUi", "AHAChatPersonalUi")?.create?.({
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

  const analysisStateView = chatModule("analysisStateView", "AHAChatAnalysisStateView")?.create?.({
    getActiveAnalysisRun,
    setActiveAnalysisRun,
    clearAutoOutputs,
    escHtml,
    renderAhaPersonalRetrieval,
    renderAhaAnswerComposer,
    renderPanel,
    renderHighlightsRail,
    updateEmptyState
  });
  if (!analysisStateView) throw new Error("AHAChatAnalysisStateView må lastes før ahaChat.js.");
  const renderAnalysisDebugPanel = analysisStateView.renderAnalysisDebugPanel;
  const setExportButtonsEnabled = analysisStateView.setExportButtonsEnabled;
  const setAhaProcessing = analysisStateView.setProcessing;
  const clearActiveAnalysisState = analysisStateView.clearActiveAnalysisState;
  const resetAnalysisStateView = analysisStateView.resetView;

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
  });
  if (!autoOutputView) throw new Error("AHAChatAutoOutputView må lastes før ahaChat.js.");

  const humanizeTextType = autoOutputView.humanizeTextType;
  const buildAhaSerCard = autoOutputView.buildAhaSerCard;
  const renderAutoOutputPayload = autoOutputView.renderAutoOutputPayload;
  const filterCrossDomainAutoPayload = autoOutputView.filterCrossDomainAutoPayload;

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

  const exportRuntime = chatModule("export", "AHAChatExport")?.createRuntime?.({
    loadAutoOutputs,
    analysisRunContract,
    getActiveAnalysisRun,
    loadAfterworkEntries,
    sourceHash,
    buildCanonicalAnalysis,
    normalizeSubjectLinks,
    normalizeFagkoblinger,
    isAcademicLikeType,
    loadChamberFromStorage,
    buildMetaProfile: (chamber) =>
      (typeof insightsApi()?.buildMetaProfile === "function"
        ? (insightsApi().buildMetaProfile(chamber) || {})
        : (chamber?.meta || {})),
    setStatusNote,
    out
  });
  if (!exportRuntime) throw new Error("AHAChatExportRuntime må lastes før ahaChat.js.");
  const {
    buildAhaAnalysisExportBundle,
    formatAhaAnalysisExportMarkdown,
    copyAhaAnalysisExportMarkdown,
    exportAhaAnalysisJson
  } = exportRuntime;

  const autoOutputRuntime = chatModule("autoOutputView", "AHAChatAutoOutputView")?.createRuntime?.({
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
    saveAutoOutputs,
    setActiveAnalysisRun,
    takeKeywords,
    refreshAhaExplorer
  });
  if (!autoOutputRuntime) throw new Error("AHAChatAutoOutputRuntime må lastes før ahaChat.js.");
  const renderAutoOutputs = autoOutputRuntime.renderAutoOutputs;
  const focusAutoCard = autoOutputRuntime.focusAutoCard;
  const restoreAutoOutputFromStorage = autoOutputRuntime.restoreAutoOutputFromStorage;

  const replySubjectPolicy = replyFormat?.createSubjectPolicy?.({
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
  const { showStatus, showConcepts, showMeta, showKnowledgeMap } = knowledgeView;
  global.showMeta = showMeta;

  function resolveConceptTerm(term) {
    if (term == null) return "";
    if (typeof term === "string") return term;
    if (typeof term === "number") return String(term);
    if (typeof term === "object") {
      return String(term?.label || term?.title || term?.key || term?.term || term?.name || term?.subject_label || term?.subject_id || term?.id || term?.value || "");
    }
    return String(term || "");
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

  const uiRuntime = chatModule("uiRuntime", "AHAChatUiRuntime")?.create?.({
    pendingPromptKey: PENDING_CHAT_PROMPT_KEY,
    highlightsStorageKey: HIGHLIGHTS_STORAGE_KEY,
    afterworkStorageKey: AFTERWORK_STORAGE_KEY,
    submitMessage: submitAhaChatMessage,
    showInsights,
    showStatus,
    showConcepts,
    showMeta,
    showKnowledgeMap,
    showSavedAfterwork,
    exportAnalysisJson: exportAhaAnalysisJson,
    copyAnalysisMarkdown: copyAhaAnalysisExportMarkdown,
    clearChamber: clearChamberStorage,
    clearAutoOutputs,
    out,
    setStatusNote,
    resetAnalysisView: resetAnalysisStateView,
    focusAutoCard,
    bindMemoryControls: bindAhaMemoryControls,
    bindPanelActions: bindPanelActionHandler,
    setProcessing: setAhaProcessing,
    restoreAutoOutput: restoreAutoOutputFromStorage,
    startMetaAiSession,
    updateMemoryStatus: updateAhaMemoryStatus,
    renderChatMemoryStatus: renderAhaChatMemoryStatus,
    renderPersonalContextStatus: renderAhaPersonalContextStatus,
    updateEmptyState,
    renderHighlightsRail
  });
  if (!uiRuntime) throw new Error("AHAChatUiRuntime må lastes før ahaChat.js.");
  const bind = uiRuntime.bind;

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
