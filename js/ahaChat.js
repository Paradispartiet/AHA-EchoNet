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

  const autoAnalysis = chatModule("autoAnalysis", "AHAChatAutoAnalysis")?.create?.({
    cleanArticleText,
    toSentences,
    takeKeywords,
    short,
    detectTextType,
    normalizeSubjectMatches,
    normalizeAcademicAfterworkPayload,
    collectLiteraryDiaryEvidence,
    buildLiteraryDiarySortItems,
    collectOpinionArticleEvidence,
    buildOpinionArticleQualityAnalysis,
    currentInsights,
    sourceHasAny,
    inferReligiousLexiconEvidence,
    detectAutoAnalysisDomain,
    detectInstitutionalMediaHistorySignal,
    detectLiteraryAttachmentSignal,
    detectPublicAdministrationReformSignal,
    extractAcademicPhraseConcepts,
    extractAcademicTheoryLinks,
    extractMainInstitutionName,
    lowerFirst,
    sentence
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
  function getThreadId() {
    return CHAT_THREAD_ID;
  }

  function normalizePreview(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }

  function stripTrailingPunctuation(text) {
    return String(text || "")
      .trim()
      .replace(/[.!?;,:\s…]+$/u, "")
      .trim();
  }

  function lowerFirst(text) {
    const value = String(text || "").trim();
    if (!value) return "";
    return value.charAt(0).toLowerCase() + value.slice(1);
  }

  function sentence(text) {
    const cleaned = stripTrailingPunctuation(text);
    if (!cleaned) return "";
    return `${cleaned}.`;
  }

  function sourceHasTerm(sourceText, terms) {
    const src = String(sourceText || "").toLowerCase();
    const list = Array.isArray(terms) ? terms : [terms];
    return list.some((term) => {
      const t = String(term || "").toLowerCase().trim();
      if (!t) return false;
      return src.includes(t);
    });
  }

  function sourceHasAny(sourceText, patterns) {
    const src = String(sourceText || "");
    const list = Array.isArray(patterns) ? patterns : [patterns];
    return list.some((pattern) => {
      if (!pattern) return false;
      if (pattern instanceof RegExp) return pattern.test(src);
      return sourceHasTerm(src, String(pattern));
    });
  }

  function shortHash(input) {
    let hash = 5381;
    const value = String(input || "");
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) + hash) + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function makeStableMessageId(role, text, createdAt) {
    const key = `${String(role || "").trim()}|${String(createdAt || "").trim()}|${normalizePreview(text)}`;
    return `msg_${shortHash(key)}`;
  }

  function loadHighlights() {
    try {
      const raw = localStorage.getItem(HIGHLIGHTS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveHighlights(highlights) {
    localStorage.setItem(HIGHLIGHTS_STORAGE_KEY, JSON.stringify(highlights || {}));
  }

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


  function dedupeSubjectMatches(matches) {
    const list = Array.isArray(matches) ? matches : [];
    const seenLabels = new Set();
    const seenIds = new Set();
    return list.filter((item) => {
      const label = String(item?.title || item?.subject_label || "").trim().toLowerCase();
      const id = String(item?.subject_id || item?.emne_id || "").trim().toLowerCase();
      if (label) {
        if (seenLabels.has(label)) return false;
        seenLabels.add(label);
        return true;
      }
      if (!id || seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
  }

  function renderSubjectChips(row, matches) {
    const links = dedupeSubjectMatches(matches);
    if (!row || !links.length) return;
    const wrap = document.createElement("section");
    wrap.className = "subject-links";
    wrap.innerHTML = '<span class="subject-links-label">Fagkoblinger</span>';
    const chips = document.createElement("div");
    chips.className = "subject-link-chips";
    links.forEach((item) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "subject-link-chip";
      chip.textContent = String(item?.title || item?.subject_label || "Fagkobling");
      chip.addEventListener("click", () => {
        setComposerText(`Bygg videre på dette med utgangspunkt i [${chip.textContent}].`);
        setStatusNote(`La inn fagkobling: ${chip.textContent}`);
      });
      chips.appendChild(chip);
    });
    wrap.appendChild(chips);
    row.appendChild(wrap);
  }

  function appendChat(role, text, options) {
    const log = document.getElementById("chat-log");
    if (!log) return;
    const createdAt = String(options?.createdAt || new Date().toISOString());
    const messageId = String(options?.messageId || makeStableMessageId(role, text, createdAt));
    const row = document.createElement("article");
    row.className = `chat-line-row chat-line-row-${role}`;
    row.dataset.messageId = messageId;
    row.dataset.createdAt = createdAt;
    row.dataset.messageRole = role === "aha" ? "assistant" : role;

    const sender = document.createElement("span");
    sender.className = "chat-line-sender";
    sender.textContent = role === "user" ? "Du" : "AHA";
    row.appendChild(sender);

    const div = document.createElement("div");
    div.className = `chat-line chat-line-${role}`;
    div.id = `chat-message-${messageId}`;
    // Lange brukermeldinger er som regel innlimt kildetekst: vis dem som en
    // egen sammenleggbar «innlimt tekst»-boble så samtalen forblir lesbar.
    if (role === "user" && text.length > 480) {
      div.classList.add("chat-line-paste");
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `Innlimt tekst (${text.length} tegn) – «${previewText(text)} …»`;
      const body = document.createElement("p");
      body.className = "chat-line-paste-body";
      body.textContent = text;
      details.appendChild(summary);
      details.appendChild(body);
      div.appendChild(details);
    } else {
      div.textContent = text;
    }

    const highlightBtn = document.createElement("button");
    highlightBtn.type = "button";
    highlightBtn.className = "highlight-toggle-btn";
    highlightBtn.setAttribute("aria-label", "Marker melding som highlight");
    highlightBtn.setAttribute("title", "Highlight");
    highlightBtn.textContent = "✦";
    highlightBtn.addEventListener("click", () => toggleHighlight(row, text));

    row.appendChild(div);
    const categories = Array.isArray(options?.categoryChips) ? options.categoryChips.filter(Boolean).slice(0, 8) : [];
    const subjectMatches = Array.isArray(options?.subjectMatches) ? options.subjectMatches.slice(0, 8) : [];
    if (categories.length) {
      const chips = document.createElement("div");
      chips.className = "message-category-chips";
      chips.setAttribute("aria-label", "Bygg-videre-kategorier");
      categories.forEach((label) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "message-category-chip";
        chip.textContent = String(label);
        chip.addEventListener("click", () => {
          setComposerText(`Bygg videre på svaret med fokus på "${label}".`);
          setStatusNote(`La inn forslag for videre arbeid: ${label}`);
        });
        chips.appendChild(chip);
      });
      row.appendChild(chips);
    }
    if (subjectMatches.length) renderSubjectChips(row, subjectMatches);
    if (role === "aha" && options?.memoryContext) renderAhaMemoryTransparency(row, options.memoryContext);
    if (role === "aha" && options?.answerEvaluation) renderAhaAnswerEvaluation(row, options.answerEvaluation);
    row.appendChild(highlightBtn);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    syncMessageHighlightState(row);
    renderHighlightsRail();
    updateEmptyState();
    updateAnswerActionsVisibility();
    if (role === "aha") refreshAhaExplorer();
    return row;
  }

  function previewText(text) {
    return String(text || "").trim().replace(/\s+/g, " ").slice(0, 96);
  }

  function toggleHighlight(row, text) {
    const messageId = row?.dataset?.messageId;
    if (!messageId) return;
    const threadId = getThreadId();
    const all = loadHighlights();
    const thread = all[threadId] || {};
    if (thread[messageId]) {
      delete thread[messageId];
    } else {
      thread[messageId] = { messageId, createdAt: row.dataset.createdAt || new Date().toISOString(), preview: previewText(text) };
    }
    all[threadId] = thread;
    saveHighlights(all);
    syncMessageHighlightState(row);
    renderHighlightsRail();
    setStatusNote(thread[messageId] ? "Highlight lagret." : "Highlight fjernet.");
  }

  function isHighlighted(messageId) {
    const thread = loadHighlights()[getThreadId()] || {};
    return Boolean(thread[messageId]);
  }

  function syncMessageHighlightState(row) {
    const messageId = row?.dataset?.messageId;
    if (!messageId) return;
    row.classList.toggle("is-highlighted", isHighlighted(messageId));
  }

  function renderHighlightsRail() {
    const rail = document.getElementById("chat-highlights-rail");
    const log = document.getElementById("chat-log");
    if (!rail || !log) return;
    rail.innerHTML = "";
    const thread = loadHighlights()[getThreadId()] || {};
    const rows = Array.from(log.querySelectorAll(".chat-line-row"));
    const max = Math.max(1, log.scrollHeight - log.clientHeight);
    let markerCount = 0;
    rows.forEach((row) => {
      const messageId = row.dataset.messageId;
      if (!thread[messageId]) return;
      markerCount += 1;
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "highlight-rail-marker";
      const offset = Math.max(0, row.offsetTop - 8);
      const ratio = Math.min(1, Math.max(0, offset / max));
      marker.style.top = `${ratio * 100}%`;
      marker.title = thread[messageId].preview || "Highlight";
      marker.setAttribute("aria-label", `Gå til highlight: ${thread[messageId].preview || "melding"}`);
      marker.addEventListener("click", () => {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      rail.appendChild(marker);
    });
    rail.classList.toggle("is-empty", markerCount === 0);
  }

  function updateEmptyState() {
    const empty = document.getElementById("empty-state");
    const log = document.getElementById("chat-log");
    if (!empty || !log) return;
    empty.style.display = log.children.length ? "none" : "block";
    renderHighlightsRail();
    updateAnswerActionsVisibility();
  }

  function updateAnswerActionsVisibility() {
    const actions = document.querySelector?.(".answer-actions");
    const log = document.getElementById("chat-log");
    if (!actions || !log) return;
    const hasAhaAnswer = Boolean(log.querySelector?.(".chat-line-row-aha"));
    actions.classList.toggle("has-aha-answer", hasAhaAnswer);
  }

  function setComposerText(value) {
    const textarea = document.getElementById("msg");
    if (!textarea) return;
    textarea.value = value;
    textarea.focus();
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
    return chatModule("textUtils", "AHAChatTextUtils").cleanArticleText(raw);
  }

  function toSentences(text) {
    return chatModule("textUtils", "AHAChatTextUtils").toSentences(text);
  }

  function collectOpinionArticleEvidence(raw, sentences) {
    return chatModule("textUtils", "AHAChatTextUtils").collectOpinionArticleEvidence(raw, sentences);
  }

  function detectTextType(raw) {
    return chatModule("signals", "AHAChatSignals").detectTextType(raw);
  }

  function buildLiteraryDiarySortItems(raw, sentences) {
    const text = String(raw || "");
    const normalizedText = ` ${text.toLowerCase()} `;
    const hasSName = sourceHasAny(text, [/\bS\b/, /\b\sS\s*[:\-]/]);
    const categoryDefs = [
      {
        label: "Åpningsscene / sted",
        signals: ["kurbad", "hageanlegg", "park", "leilighet", "sted", "badet", "middelhavet", "utkikkspunkt", "parker"],
        summary: "Stedsscener forankrer teksten i konkrete omgivelser."
      },
      {
        label: "Relasjonen til S",
        signals: [" s ", " henne", " ring", "ringer", "telefon", "slutt å ring", "tilbake", "såret", "sint", "kjærlighet", "prinsesse"],
        summary: "Relasjonen til S er et tydelig spor i dagbokbevegelsen."
      },
      {
        label: "Sosial uro og selvbilde",
        signals: ["fjern", "snakke med noen", "selvhevdende", "dårlig samvittighet", "ikke jeg heller", "burde", "skam", "skyld", "uro"],
        summary: "Sosial uro og selvvurdering preger fortellerstemmen."
      },
      {
        label: "Møter med fremmede",
        signals: ["kongo", "mann", "fyr", "longboard", "sykepleier", "vingård", "kompisen", "venn", "hule", "knivdrap"],
        summary: "Møter med fremmede utvider tekstens sosiale rom."
      },
      {
        label: "Reise, nomadisme og forfatterliv",
        signals: ["england", "fotballkamper", "reise", "biarriz", "campe", "middelhavet", "nomader", "forfatter", "poetisk", "leve vilt"],
        summary: "Reise, nomadisme eller skrivende selvbilde er til stede i teksten."
      },
      {
        label: "Rus og drift",
        signals: ["røyka", "weed", "feber", "trøkk", "vilt"],
        summary: "Rus eller intensitet markerer et eget driftsspor."
      },
      {
        label: "Skyld, skam og selvforsvar",
        signals: ["dårlig samvittighet", "skyld", "skam", "såret", "sint", "dårlig behandlet", "behandlet henne", "ingen rett"],
        summary: "Skyld, skam eller selvforsvar skaper tydelig indre friksjon."
      }
    ];

    const normalize = (v) => ` ${String(v || "").toLowerCase()} `;
    const matchesForCategory = (def) => {
      const found = (sentences || []).find((line) => {
        const normalized = normalize(line);
        return def.signals.some((signal) => normalized.includes(normalize(signal)));
      });
      return found ? short(found) : "";
    };

    const sortItems = categoryDefs
      .map((def) => {
        if (def.label === "Relasjonen til S" && !hasSName) return null;
        const hit = matchesForCategory(def);
        if (!hit) return null;
        if (def.label === "Relasjonen til S") {
          const hasConflict = ["slutt å ring", "såret", "sint", "dårlig behandlet", "ingen rett"].some((s) => normalizedText.includes(normalize(s)));
          if (hasConflict) return { label: def.label, text: "Relasjonen til S kombinerer kontaktbehov med tydelig konflikt." };
          return { label: def.label, text: "Relasjonen til S er et tydelig relasjonelt spor." };
        }
        return { label: def.label, text: def.summary };
      })
      .filter(Boolean)
      .slice(0, 5);

    if (sortItems.length) return sortItems;
    return [
      { label: "Scener og observasjoner", text: "Teksten bygger mening gjennom konkrete scener og observerende blikk." },
      { label: "Relasjonelt spor", text: "Relasjonelle spenninger driver den indre bevegelsen fremover." },
      { label: "Indre uro", text: "Understrømmen er uro, selvforklaring og søken etter frihet." }
    ];
  }

  function collectLiteraryDiaryEvidence(raw, sentences) {
    const text = String(raw || "");
    const normalizedText = ` ${text.toLowerCase()} `;
    const normalize = (v) => ` ${String(v || "").toLowerCase()} `;
    const hasAny = (signals) => signals.some((signal) => normalizedText.includes(normalize(signal)));
    const matchLine = (signals) => (sentences || []).find((line) => {
      const norm = normalize(line);
      return signals.some((signal) => norm.includes(normalize(signal)));
    }) || "";

    const hasSName = sourceHasAny(text, [/\bS\b/, /\b\sS\s*[:\-]/]);
    const evidence = {
      hasPlaceScene: hasAny(["kurbad", "hageanlegg", "park", "leilighet", "badet", "middelhavet", "utkikkspunkt", "sted", "by"]),
      hasSRelation: hasSName && hasAny([" s ", " henne", "tilbake", "såret", "sint", "prinsesse", "kjærlighet", "slutt å ring"]),
      hasPhone: hasAny(["ring", "ringer", "telefon", "svarte", "hørte", "slutt å ring"]),
      hasStrangers: hasAny(["kongo", "mann", "fyr", "longboard", "sykepleier", "vingård", "kompisen", "venn", "hule", "knivdrap"]),
      hasTravel: hasAny(["reise", "reiste", "flytte", "flyttet", "hotell", "tog", "fly", "vei", "veien", "bytte by", "byskifte", "england", "biarriz", "campe", "middelhavet", "fotballkamper"]),
      hasNomadism: hasAny(["nomade", "nomader", "nomadisme"]),
      hasWriterLife: hasAny(["forfatter", "poetisk", "skrive", "tekst", "leve vilt"]),
      hasShameGuilt: hasAny(["skyld", "skam", "dårlig samvittighet", "såret", "sint", "dårlig behandlet", "ingen rett"]),
      hasSocialUnease: hasAny(["fjern", "snakke med noen", "selvhevdende", "ikke jeg heller", "fremmedhet", "uro"]),
      hasSubstanceOrIntensity: hasAny(["røyka", "weed", "feber", "trøkk", "vilt"]),
      hasInnerMonologue: hasAny(["jeg trodde", "jeg burde", "jeg er lei", "jeg skjønner", "jeg tenkte", "jeg burde tenkt"]),
      matchedThemes: []
    };

    const themes = [];
    if (evidence.hasPlaceScene) themes.push("sted");
    if (evidence.hasSRelation) themes.push("relasjon");
    if (evidence.hasPhone) themes.push("telefonkontakt");
    if (evidence.hasStrangers) themes.push("møter");
    if (evidence.hasTravel) themes.push("reise");
    if (evidence.hasNomadism) themes.push("nomadisme");
    if (evidence.hasWriterLife) themes.push("forfatterliv");
    if (evidence.hasShameGuilt) themes.push("skyld/skam");
    if (evidence.hasSocialUnease) themes.push("sosial uro");
    if (evidence.hasSubstanceOrIntensity) themes.push("intensitet");
    if (evidence.hasInnerMonologue) themes.push("indre monolog");
    evidence.matchedThemes = themes;
    evidence.textSnippets = {
      place: matchLine(["kurbad", "hageanlegg", "park", "leilighet", "badet", "middelhavet", "utkikkspunkt", "sted", "by"]),
      relation: matchLine([" s ", " henne", "tilbake", "såret", "sint", "prinsesse", "kjærlighet", "slutt å ring"]),
      phone: matchLine(["ring", "ringer", "telefon", "svarte", "hørte", "slutt å ring"])
    };
    return evidence;
  }

  function takeKeywords(text, maxItems) {
    const tokens = String(text || "").toLowerCase().match(/[a-zæøå0-9]{2,}/g) || [];
    const stop = new Set(["litt","henne","han","hun","hadde","har","var","være","vært","blir","ble","blitt","dette","denne","disse","fordi","kanskje","hvorfor","etter","veldig","ikke","bare","også","med","som","skal","mellom","uten","noen","noe","alle","der","her","nå","fortsatt","først","tredje","runden","gammel","gamle","unge","godt","dårlig","helt","ennå","eller","men","jeg","meg","min","mine","du","deg","din","de","dem","den","det","en","ei","et","på","i","av","til","fra","og","å","norske","norsk","moderne","viktig","viktigste","store","små","nye","gamle","tydelig","særlig","mildt","sagt"]);
    const weakVerbs = new Set(["gjorde","gjør","gjort","tenkte","tenker","synes","sier","sa","våknet","hentet","leverte","dro","kom","går","gikk"]);
    const whitelist = new Set(["kurbad","hageanlegg","dame","telefon","kongo","relasjon","kjærlighet","skyld","skam","fremmedhet","ensomhet","uro","observasjon","nomade","nomadisme","begjær","forfatter","forfatterliv","reise","frihet","kontroll","rus","kropp","språk","møte","minner","konflikt","lengsel","by","park","sted","leilighet","samtale","vennskap","risiko","momsfritak","mediepolitikk","redaktørstyrte","medier","ytringsfrihet","medieøkonomi","journalistikk","regjering","kulturminister","finansdepartementet","annonseinntekter","plattformer","offentlighet","handlingsrom","schibsted","medietilsynet"]);
    const counts = new Map();
    const scores = new Map();
    tokens.forEach((token) => {
      if (token.length < 4) return;
      if (stop.has(token)) return;
      if (weakVerbs.has(token)) return;
      const freq = (counts.get(token) || 0) + 1;
      counts.set(token, freq);
      let score = freq;
      if (whitelist.has(token)) score += 3;
      if (token.length >= 8) score += 1;
      scores.set(token, score);
    });
    return Array.from(scores.entries()).sort((a,b)=>b[1]-a[1]).slice(0, maxItems).map(([word]) => word);
  }

  function sourceHash(text) {
    const normalized = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
    return normalized ? shortHash(normalized) : "";
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
