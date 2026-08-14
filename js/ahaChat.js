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

  function insightsApi() { return providerLoader.resolve("insights", "InsightsEngine"); }
  function ingestApi() { return providerLoader.resolve("ingest", "AHAIngest"); }
  function sourcesApi() { return providerLoader.resolve("sources", "AHASources"); }

  const textUtils = providerLoader.require("textUtils");
  const shortHash = textUtils.shortHash;
  const takeKeywords = textUtils.takeKeywords;
  const sourceHash = textUtils.sourceHash;
  const cleanArticleText = textUtils.cleanArticleText;
  const toSentences = textUtils.toSentences;
  const collectOpinionArticleEvidence = textUtils.collectOpinionArticleEvidence;

  const signals = providerLoader.require("signals");
  const detectTextType = signals.detectTextType;
  const detectPublicAdministrationReformSignal = signals.detectPublicAdministrationReformSignal;
  const detectPublicAdministrationSignal = signals.detectPublicAdministrationSignal;
  const inferReligiousLexiconEvidence = signals.inferReligiousLexiconEvidence;

  const subjects = providerLoader.require("subjects");
  const normalizeSubjectLinks = subjects.normalizeSubjectLinks;
  const enrichSubjectMatchesForClimateConflict = subjects.enrichSubjectMatchesForClimateConflict;
  const enrichSubjectMatchesForPublicAdministration = subjects.enrichSubjectMatchesForPublicAdministration;
  const normalizeFagkoblinger = subjects.normalizeFagkoblinger;
  const isAcademicLikeType = subjects.isAcademicLikeType;

  const analysis = providerLoader.require("analysis");
  const buildOpinionArticleQualityAnalysis = analysis.buildOpinionArticleQualityAnalysis;

  const replyFormat = providerLoader.require("replyFormat");
  const normalizeAhaVisibleReply = replyFormat.normalizeAhaVisibleReply;

  const chamberStore = providerLoader.instantiate("chamberStore", {
    createEmptyChamber: () => insightsApi().createEmptyChamber()
  });
  const loadChamberFromStorage = chamberStore.load;
  const saveChamberToStorage = chamberStore.save;
  const clearChamberStorage = chamberStore.clear;

  const autoOutputStore = providerLoader.instantiate("autoOutputStore", {
    sourceHash,
    defaultConversationId: CHAT_THREAD_ID
  });
  const loadAutoOutputs = autoOutputStore.load;
  const saveAutoOutputs = autoOutputStore.save;
  const clearAutoOutputs = autoOutputStore.clear;

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
    renderChatMemoryStatus: renderAhaChatMemoryStatus
  } = shellRuntime;

  const analysisPolicy = providerLoader.instantiate("analysisPolicy", {
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

  const conceptPolicy = providerLoader.instantiate("conceptPolicy", {
    normalizeAfterworkConcept: (...args) => normalizeAfterworkConcept(...args),
    normalizeConceptSurface,
    normalizeVisibleAcademicLabel,
    isGenericDisplayConcept,
    detectPublicAdministrationReformSignal,
    extractAcademicPhraseConcepts
  });

  const normalizeConceptKey = conceptPolicy.normalizeConceptKey;
  const getCanonicalConceptLabel = conceptPolicy.getCanonicalConceptLabel;
  const getCanonicalConceptKey = conceptPolicy.getCanonicalConceptKey;
  const isBlockedStandaloneConcept = conceptPolicy.isBlockedStandaloneConcept;
  const prioritizeVisibleConceptEdges = conceptPolicy.prioritizeVisibleConceptEdges;
  const applyPhraseConceptDisplayPreference = conceptPolicy.applyPhraseConceptDisplayPreference;
  const filterConceptLabels = conceptPolicy.filterConceptLabels;
  const canonicalizeDisplayConcept = conceptPolicy.canonicalizeDisplayConcept;

  const analysisRunContract = providerLoader.require("analysisRunContract");

  const memoryControls = providerLoader.instantiate("memoryControls", {
    loadChamber: loadChamberFromStorage
  });
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

  const afterwork = providerLoader.instantiate("afterwork", {
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

  const loadAfterworkEntries = afterwork.loadAfterworkEntries;
  const saveAfterworkEntries = afterwork.saveAfterworkEntries;
  const formatAfterworkDate = afterwork.formatAfterworkDate;
  const renderAfterworkEntry = afterwork.renderAfterworkEntry;
  const showSavedAfterwork = afterwork.showSavedAfterwork;
  const buildAfterworkPrompt = afterwork.buildAfterworkPrompt;
  const buildFromAfterworkEntry = afterwork.buildFromAfterworkEntry;
  const deleteAfterworkEntry = afterwork.deleteAfterworkEntry;

  const memoryRuntime = providerLoader.instantiate("memoryRuntime", {
    loadChamber: loadChamberFromStorage,
    loadAfterworkEntries,
    loadControls: loadAhaMemoryControls,
    normalizeControls: normalizeAhaMemoryControls,
    loadExclusions: loadAhaMemoryExclusions,
    isExcluded: isAhaMemoryInsightExcluded,
    getInsightKey: getAhaMemoryInsightKey
  });

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

  const runContext = providerLoader.instantiate("runContext", {
    analysisRunContract,
    sourceHash,
    shortHash,
    takeKeywords,
    formatMemoryContextForAgent: formatAhaMemoryContextForAgent,
    buildMemoryOffContext: buildAhaMemoryOffContext,
    defaultConversationId: CHAT_THREAD_ID
  });

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

  const afterworkAutoAdapter = providerLoader.instantiate("afterwork", {
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
  }, { factory: "createAutoOutputAdapter", label: "AHAChatAfterworkAutoAdapter" });
  const normalizeAfterworkConcept = afterworkAutoAdapter.normalizeAfterworkConcept;
  const saveAutoOutputAsAfterwork = afterworkAutoAdapter.saveAutoOutputAsAfterwork;
  const ensureAfterworkForLatestAnalysis = afterworkAutoAdapter.ensureAfterworkForLatestAnalysis;

  const insightPipeline = providerLoader.instantiate("insightPipeline", {
    filterConceptLabels,
    normalizeSimpleStringList,
    normalizeTheoreticalLinks,
    extractAcademicPhraseConcepts,
    normalizeAfterworkConcept,
    weakConceptWords: { has: conceptPolicy.isWeakConceptWord }
  });
  const generateAIInsightCandidates = insightPipeline.generateAIInsightCandidates;
  const buildSemanticInsightCandidates = insightPipeline.buildSemanticInsightCandidates;

  const agentRuntime = providerLoader.instantiate("agentRuntime", {
    subjectId: SUBJECT_ID,
    getApiBase: () => global.AHA_AGENT_API,
    fetchImpl: (...args) => global.fetch(...args),
    loadChamber: loadChamberFromStorage,
    getCurrentInsights: currentInsights,
    memoryConceptLabel,
    buildUserMetaProfile: (chamber, subjectId) =>
      global.MetaInsightsEngine?.buildUserMetaProfile?.(chamber, subjectId) || {}
  });
  const buildAIState = agentRuntime.buildAIState;
  const askAhaAgent = agentRuntime.askAhaAgent;

  const ingestRuntime = providerLoader.instantiate("ingestRuntime", {
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
  const handleUserMessage = ingestRuntime.handleUserMessage;
  const handleUserMessageInsightCandidatesInBackground = ingestRuntime.handleUserMessageInsightCandidatesInBackground;

  const academicInsightView = providerLoader.instantiate("academicInsightView", {
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
  const parseLabeledInsightCards = academicInsightView.parseLabeledInsightCards;
  const readLatestAcademicContext = academicInsightView.readLatestAcademicContext;
  const buildAcademicSyntheticInsightCards = academicInsightView.buildAcademicSyntheticInsightCards;

  const insightView = providerLoader.instantiate("insightView", {
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

  const personalUi = providerLoader.instantiate("personalUi", {
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

  const conversationView = providerLoader.instantiate("conversationView", {
    storageKey: HIGHLIGHTS_STORAGE_KEY,
    threadId: CHAT_THREAD_ID,
    shortHash,
    setStatusNote,
    renderAhaMemoryTransparency,
    renderAhaAnswerEvaluation,
    refreshAhaExplorer
  });
  const appendChat = conversationView.appendChat;
  const renderHighlightsRail = conversationView.renderHighlightsRail;
  const updateEmptyState = conversationView.updateEmptyState;
  const updateAnswerActionsVisibility = conversationView.updateAnswerActionsVisibility;

  const analysisStateView = providerLoader.instantiate("analysisStateView", {
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
  const renderAnalysisDebugPanel = analysisStateView.renderAnalysisDebugPanel;
  const setExportButtonsEnabled = analysisStateView.setExportButtonsEnabled;
  const setAhaProcessing = analysisStateView.setProcessing;
  const clearActiveAnalysisState = analysisStateView.clearActiveAnalysisState;
  const resetAnalysisStateView = analysisStateView.resetView;

  const autoAnalysis = providerLoader.instantiate("autoAnalysis", {
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

  const autoOutputView = providerLoader.instantiate("autoOutputView", {
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

  const humanizeTextType = autoOutputView.humanizeTextType;
  const buildAhaSerCard = autoOutputView.buildAhaSerCard;
  const renderAutoOutputPayload = autoOutputView.renderAutoOutputPayload;
  const filterCrossDomainAutoPayload = autoOutputView.filterCrossDomainAutoPayload;

  const canonicalAnalysis = providerLoader.instantiate("canonicalAnalysis", {
    buildAhaSerCard,
    AHA_RUNTIME_KNOWLEDGE_POLICY,
    detectTextType,
    detectAutoAnalysisDomain,
    normalizeSubjectMatches,
    normalizeFagkoblinger,
    normalizeConceptKey,
    buildAcademicConceptCandidates
  });

  const isPythonEngineFeatureEnabled = canonicalAnalysis.isPythonEngineFeatureEnabled;
  const isValidCanonicalAnalysisShape = canonicalAnalysis.isValidCanonicalAnalysisShape;
  const buildPythonFallbackMeta = canonicalAnalysis.buildPythonFallbackMeta;
  const resolveCanonicalAnalysisWithOptionalPythonEngine = canonicalAnalysis.resolveCanonicalAnalysisWithOptionalPythonEngine;
  const buildCanonicalAnalysis = canonicalAnalysis.buildCanonicalAnalysis;
  const normalizeAnalysisConfidence = canonicalAnalysis.normalizeAnalysisConfidence;
  const normalizeAnalysisWarnings = canonicalAnalysis.normalizeAnalysisWarnings;
  const buildHistoryGoLinksFromDomain = canonicalAnalysis.buildHistoryGoLinksFromDomain;

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
