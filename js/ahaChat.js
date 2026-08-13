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
  const WEAK_CONCEPT_WORDS = new Set(["illustrasjon","logo","annonsørinnhold","annonsorinnhold","annonse","sponset","les","også","ogsa","les også","les ogsa","årets","arets","populære","populaere","kjole","kjoler","bryllupsgjesten","sesongens","favoritter","finnes","egen","form","lærer","mennesker","blir","ikke","bare","over","ligger","lavt","noen","helt","ennå","norske","norsk","moderne","viktig","viktigste","store","små","nye","gamle","tydelig","særlig","mildt","sagt","refleksjon","innsikt","samtale","analyse","nødvendighet","nodvendighet"]);
  const GENERIC_DISPLAY_CONCEPTS = new Set(["kunnskap","forståelse","budskap","bekreftelse","sier","viser","dette","grunnlag","tillegg","verden","noen","videre","eksempel"]);
  const ACADEMIC_PHRASE_CONCEPTS = [
    "politisk økologi","empirisk forskning","internasjonal forskning","dominerende narrativ","politisk narrativ","knapphetsskolen","miljøsikkerhet","environmental security","scarcity school","statens politikk","marginalisering av pastoralister","marginalisering","pastoralister","politisk-historisk forklaring","politisk og historisk","klimadrevet konflikt","klimaendringer og konflikter","malthusiansk forklaring","ressursknapphet","miljødegradering","miljøforringelse","nedbørsdata","klimadata","casestudier fra Mali","Sahel","Mali","Sahel-greening","ørkenspredning","tørke","global klimaendring","lokale forhold","forskningsgrunnlag","policy-momentum",
    "nav-reformen","nav-kontorene","strukturelle utfordringer","manglende måloppnåelse","statlig styring","kommunale målsetninger","kommunale virkemidler","stat–kommune-partnerskap","partnerskap mellom stat og kommune","lokal organisering","arbeidsrettet oppfølging","omstillingskostnader","omstillingsprosess","organisasjonsreform","innholdsreform","kontorstørrelse","ytelsessaksbehandling","arbeidsavklaringspenger","arbeidsevnevurdering","forenklingsarbeid","standardisering og byråkrati","virksomhetsutvikling","reformeffekter","effektforskning","prosessevaluering","arbeidslinja","individuell oppfølging","brukerrettet bistand","lokal implementering"
  ];
  const ACADEMIC_THEORY_RULES = [
    {
      key: "thomas_homer_dixon",
      triggers: [/\bthomas\s+homer-?dixon\b/i, /\bhomer-?dixon\b/i],
      link: {
        thinker: "Thomas Homer-Dixon",
        theory: "Knapphetsskolen / miljøsikkerhet",
        connection: "Brukes i teksten som representant for teorien om ressursknapphet, miljødegradering og konflikt.",
        score: 0.75
      }
    },
    {
      key: "knapphetsskolen",
      triggers: [/\bknapphetsskolen\b/i, /\bscarcity\s+school\b/i, /\bressursknapphet\b/i, /\bmalthusiansk\b/i],
      link: {
        thinker: "Knapphetsskolen",
        theory: "Ressursknapphet og konflikt",
        connection: "Teksten diskuterer knapphetsskolens forklaring om at ressursknapphet kan føre til voldelig konflikt.",
        score: 0.70
      }
    },
    {
      key: "miljosikkerhet",
      triggers: [/\bmiljøsikkerhet\b/i, /\benvironmental\s+security\b/i, /\bthe\s+environmental\s+security\s+school\b/i],
      link: {
        thinker: "Miljøsikkerhet",
        theory: "Miljøsikkerhet",
        connection: "Teksten behandler miljøsikkerhet som en teori om koblingen mellom miljødegradering, ressursknapphet og konflikt.",
        score: 0.70
      }
    },
    {
      key: "politisk_okologi",
      triggers: [/\bpolitisk\s+økologi\b/i, /\bpolitical\s+ecology\b/i, /\bmaktperspektiv\b/i, /\bmakt-?\s*og\s*produksjonsforhold\b/i, /\bmaktforhold\b/i, /\bproduksjonsforhold\b/i],
      link: {
        thinker: "Politisk økologi",
        theory: "Politisk økologi",
        connection: "Teksten bruker politisk økologi som kritikk av enkle knapphetsforklaringer og vektlegger makt, kontekst og produksjonsforhold.",
        score: 0.82
      }
    },
    {
      key: "peluso_watts",
      triggers: [/\bpeluso\b/i, /\bwatts\b/i, /\bpeluso\s*&\s*watts\b/i],
      link: {
        thinker: "Peluso & Watts",
        theory: "Politisk økologi / makt og vold",
        connection: "Kobles til kritikken av enkel årsakskjede fra ressursknapphet til vold.",
        score: 0.76
      }
    },
    {
      key: "ester_boserup",
      triggers: [/\bester\s+boserup\b/i, /\bboserup\b/i, /\bbærekraftig\s+intensivering\b/i],
      link: {
        thinker: "Ester Boserup",
        theory: "Boserupsk intensivering",
        connection: "Teksten viser til Boserups teori om at befolkningsvekst kan bidra til intensivering og forbedret ressursgrunnlag.",
        score: 0.72
      }
    },
    {
      key: "edward_said",
      triggers: [/\bedward\s+said\b/i, /\bsaid\b/i, /\borientalisme?n?\b/i],
      link: {
        thinker: "Edward Said",
        theory: "Orientalisme",
        connection: "Teksten bruker orientalisme som kritikk av vestlige forestillinger om fattige land og afrikanske småbønder/husdyrgjetere.",
        score: 0.75
      }
    },
    {
      key: "prio_gleditsch",
      triggers: [/\bgleditsch\b/i, /\bprio\b/i, /\bfredsforskningsinstituttet\b/i, /\bnordås\s*&\s*gleditsch\b/i, /\bbinningsbø\b/i, /\bde\s+soysa\b/i, /\btheisen\b/i, /\braleigh\s*&\s*urdal\b/i],
      link: {
        thinker: "PRIO / Gleditsch",
        theory: "Kvantitativ kritikk av klima-konflikt-koblingen",
        connection: "Teksten viser til kvantitative studier som kritiserer den påståtte sammenhengen mellom klimaendringer, ressursknapphet og voldelige konflikter.",
        score: 0.70
      }
    },
    {
      key: "robert_kaplan",
      triggers: [/\brobert\s+kaplan\b/i, /\bkaplan\b/i],
      link: {
        thinker: "Robert Kaplan",
        theory: "Populærmalthusiansk konfliktfortelling",
        connection: "Teksten bruker Kaplan som eksempel på en innflytelsesrik journalistisk formidling av knapphet, overbefolkning og miljøkrise som konfliktforklaring.",
        score: 0.62
      }
    },
    {
      key: "bachler_swiss_peace",
      triggers: [/\bbächler\b/i, /\bbachler\b/i, /\bswiss\s+peace\b/i, /\bbächler\s*&\s*spillmann\b/i],
      link: {
        thinker: "Bächler / Swiss Peace",
        theory: "Miljødegradering som konfliktforklaring",
        connection: "Teksten viser til Bächler og Swiss Peace som eksempler på forskning som kobler afrikanske tørrlandsområder, miljødegradering og vold.",
        score: 0.62
      }
    },
    {
      key: "barnett_salehyan",
      triggers: [/\bbarnett\b/i, /\bsalehyan\b/i],
      link: {
        thinker: "Barnett / Salehyan",
        theory: "Kritikk av klima-konflikt-koblingen",
        connection: "Teksten viser til forskning som kritiserer ideen om at klimaendringer direkte fører til voldelige konflikter.",
        score: 0.60
      }
    }
  ];

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
        weakConceptWords: WEAK_CONCEPT_WORDS
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


  function isGenericDisplayConcept(value) {
    return GENERIC_DISPLAY_CONCEPTS.has(normalizeAfterworkConcept(value));
  }

  function extractAcademicPhraseConcepts(text) {
    const source = String(text || "");
    if (!source.trim()) return [];
    const out = [];
    const seen = new Set();
    ACADEMIC_PHRASE_CONCEPTS.forEach((phrase) => {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`, "iu");
      if (!re.test(source)) return;
      const key = normalizeAfterworkConcept(phrase);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(phrase);
    });
    return out.slice(0, 12);
  }
  function normalizeSimpleStringList(list, max) {
    const out = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((item) => {
      const value = String(item || "").trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(value);
    });
    return out.slice(0, Math.max(1, Number(max || 5)));
  }
  function normalizeTheoreticalLinks(list, max) {
    const out = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((item) => {
      if (!item || typeof item !== "object") return;
      const name = String(item.name || "").trim();
      const relation = String(item.relation || "").trim();
      if (!name || !relation) return;
      const key = `${name.toLowerCase()}|${relation.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ name, relation });
    });
    return out.slice(0, Math.max(1, Number(max || 5)));
  }


  function extractAcademicTheoryLinks(text) {
    const source = String(text || "");
    if (!source.trim()) return [];
    const out = [];
    const publicAdminSignal = detectPublicAdministrationReformSignal(source);
    ACADEMIC_THEORY_RULES.forEach((rule) => {
      if (rule?.key === "peluso_watts") return;
      if (!Array.isArray(rule?.triggers) || !rule.triggers.some((re) => re.test(source))) return;
      out.push({
        thinker: rule.link.thinker,
        theory: rule.link.theory,
        score: Number(rule.link.score || 0),
        connection: rule.link.connection
      });
    });
    const paragraphs = source.split(/\n{2,}|\r\n{2,}/).map((part) => part.trim()).filter(Boolean);
    const hasPelusoAndWattsInParagraph = paragraphs.some((part) => /\bpeluso\b/i.test(part) && /\bwatts\b/i.test(part));
    const sentences = source.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
    const hasPelusoAndWattsInSentence = sentences.some((part) => /\bpeluso\b/i.test(part) && /\bwatts\b/i.test(part));
    const pelusoMatches = Array.from(source.matchAll(/\bpeluso\b/gi));
    const wattsMatches = Array.from(source.matchAll(/\bwatts\b/gi));
    const hasPelusoWattsNearby = pelusoMatches.some((pelusoMatch) => wattsMatches.some((wattsMatch) => Math.abs((pelusoMatch.index || 0) - (wattsMatch.index || 0)) <= 300));
    if (hasPelusoAndWattsInParagraph || hasPelusoAndWattsInSentence || hasPelusoWattsNearby) {
      out.push({
        thinker: "Peluso & Watts",
        theory: "Politisk økologi / makt og vold",
        score: 0.76,
        connection: "Kobles til kritikken av enkel årsakskjede fra ressursknapphet via økonomisk nedgang og migrasjon til vold."
      });
    }
    if (publicAdminSignal.strong) {
      const txt = source.toLowerCase();
      const has = (arr) => arr.some((term) => txt.includes(term));
      const hits = (arr) => arr.filter((term) => txt.includes(term)).length;
      const addTheory = (thinker, theory, score, connection) => out.push({ thinker, theory, score, connection });
      if (has(["bakkebyråkrati", "street-level bureaucracy"]) || (has(["nav-kontor", "lokalkontor", "arbeidsrettet oppfølging"]) && has(["individuell oppfølging", "brukerrettet bistand", "arbeidsrettet oppfølging"]))) addTheory("Michael Lipsky", "Bakkebyråkrati / street-level bureaucracy", 0.74, "Teksten handler om hvordan lokale frontlinjekontorer skal omsette sentrale mål og regler til individuell oppfølging av brukere.");
      if (has(["implementering", "iverksetting", "reformgjennomføring", "etablering av nav-kontor", "prosessevaluering", "omstillingsprosess"])) addTheory("Implementeringsteori", "Implementeringsteori", 0.76, "Teksten analyserer hvordan reformmål omsettes i lokal praksis gjennom etablering, organisering og iverksetting.");
      if (hits(["implementering", "iverksetting", "reform", "nav-kontor", "måloppnåelse", "flere i arbeid"]) >= 3) addTheory("Pressman & Wildavsky", "Implementeringsteori", 0.68, "Teksten kan forstås som en analyse av implementeringsgapet mellom reformintensjon og lokal måloppnåelse.");
      if (has(["organisasjonsreform", "organisering", "organisatorisk design", "fusjonert", "samlokalisert", "kontorstørrelse", "virksomhetsutvikling"])) addTheory("Organisasjonsteori", "Organisasjonsteori", 0.76, "Teksten analyserer hvordan organisering, kontorstørrelse og arbeidsdeling påvirker NAV-kontorenes resultater.");
      if (has(["partnerskap mellom stat og kommune", "stat og kommune", "stat–kommune", "statlige mål", "kommunale mål"]) && has(["strukturelle utfordringer", "styring", "kommunale virkemidler"])) addTheory("Institusjonell teori", "Institusjonell teori", 0.72, "Teksten viser hvordan ulike institusjonelle logikker og målstrukturer kan skape varige spenninger i NAV-kontorene.");
      if (has(["institusjonell teori", "institusjonelle logikker", "offentlig organisering", "statlige mål", "kommunale mål"]) && has(["organisasjonsreform", "styring"])) addTheory("March & Olsen", "Institusjonell organisasjonsteori", 0.64, "Teksten kan kobles til institusjonell organisasjonsteori gjennom analysen av mål, regler og organisasjonslogikker.");
      if (hits(["standardisering", "målstyring", "effektivisering", "forenkling", "direktorat", "statlig styring", "resultat", "måloppnåelse"]) >= 2) addTheory("New Public Management", "New Public Management", 0.68, "Teksten berører styrings- og standardiseringslogikker i offentlig reform, særlig forholdet mellom mål, resultater og lokal oppgaveløsning.");
      if (hits(["new public management", "standardisering", "målstyring", "offentlig reform", "resultatstyring"]) >= 2) addTheory("Christopher Hood", "New Public Management", 0.62, "Teksten kan kobles til New Public Management gjennom vekt på styring, standardisering og resultatorientering i offentlig sektor.");
      if (has(["partnerskap", "stat og kommune", "stat–kommune", "kommunale mål", "statlige mål"])) addTheory("Samstyring / governance", "Samstyring / governance", 0.74, "Teksten analyserer hvordan partnerskapet mellom stat og kommune skaper koordinerings- og styringsutfordringer.");
      if (has(["nav-evalueringen", "prosessevaluering", "effektevaluering", "effektforskning", "negative effekter", "måloppnåelse"])) addTheory("Reformevaluering", "Reformevaluering", 0.73, "Teksten bygger på prosess- og effektdata for å vurdere om NAV-reformen har nådd sine mål.");
    }
    return out;
  }

  function mergeTheoryLinks(existingLinks, extractedLinks, maxItems) {
    const bestByKey = new Map();
    const add = (item) => {
      if (!item || typeof item !== "object") return;
      const thinker = String(item.thinker || item.name || "").trim();
      const theory = String(item.theory || "").trim();
      const connection = String(item.connection || item.relation || "").trim();
      const score = Number(item.score || item.relevance_score || 0);
      if (!thinker && !theory) return;
      const key = `${thinker.toLowerCase()}|${theory.toLowerCase()}`;
      const prev = bestByKey.get(key);
      if (!prev || score > prev.score) bestByKey.set(key, { thinker, theory, connection, score });
    };
    (Array.isArray(existingLinks) ? existingLinks : []).forEach(add);
    (Array.isArray(extractedLinks) ? extractedLinks : []).forEach(add);
    return Array.from(bestByKey.values())
      .sort((a, b) => (b.score - a.score) || a.thinker.localeCompare(b.thinker))
      .slice(0, Math.max(1, Number(maxItems || 5)));
  }

  function collectTheoryNodeLabels(chamber) {
    const labels = new Map();
    const add = (value) => {
      const label = String(value || "").trim();
      if (!label) return;
      const key = label.toLowerCase();
      if (!labels.has(key)) labels.set(key, label);
    };
    (Array.isArray(chamber?.insights) ? chamber.insights : []).forEach((insight) => {
      (Array.isArray(insight?.thinkers) ? insight.thinkers : []).forEach(add);
      (Array.isArray(insight?.theories) ? insight.theories : []).forEach(add);
      (Array.isArray(insight?.theoretical_links) ? insight.theoretical_links : []).forEach((link) => {
        add(link?.thinker);
        add(link?.theory);
        add(link?.name);
      });
      (Array.isArray(insight?.theoryLinks) ? insight.theoryLinks : []).forEach((link) => {
        add(link?.thinker);
        add(link?.theory);
        add(link?.name);
      });
      const insightText = [insight?.title, insight?.summary, insight?.text, insight?.source_text].filter(Boolean).join(" ");
      extractAcademicTheoryLinks(insightText).forEach((link) => {
        add(link?.thinker);
        add(link?.theory);
      });
    });
    return Array.from(labels.values());
  }

  function buildConceptEdgeContext(chamber, theoryLinks) {
    const safeChamber = chamber && typeof chamber === "object" ? chamber : {};
    const insights = Array.isArray(safeChamber?.insights) ? safeChamber.insights : [];
    const autoOutputs = Array.isArray(safeChamber?.auto_outputs) ? safeChamber.auto_outputs : [];
    const textParts = [];
    const concepts = [];
    const keywords = [];
    const phraseConcepts = [];
    const subjectLinks = [];
    const addText = (value) => {
      const text = String(value || "").trim();
      if (text) textParts.push(text);
    };
    insights.forEach((insight) => {
      addText(insight?.title);
      addText(insight?.summary);
      addText(insight?.text);
      addText(insight?.source_text);
      (Array.isArray(insight?.concepts) ? insight.concepts : []).forEach((item) => concepts.push(item));
      (Array.isArray(insight?.keywords) ? insight.keywords : []).forEach((item) => keywords.push(item));
      (Array.isArray(insight?.phraseConcepts) ? insight.phraseConcepts : []).forEach((item) => phraseConcepts.push(item));
      (Array.isArray(insight?.subjectLinks) ? insight.subjectLinks : []).forEach((item) => subjectLinks.push(item));
    });
    autoOutputs.forEach((entry) => addText(entry?.content || entry?.text || entry?.summary));
    const activeSource = resolveActiveAnalysisContext();
    addText(activeSource?.sourceText);
    (Array.isArray(activeSource?.concepts) ? activeSource.concepts : []).forEach((item) => concepts.push(item));
    (Array.isArray(activeSource?.keywords) ? activeSource.keywords : []).forEach((item) => keywords.push(item));
    (Array.isArray(activeSource?.phraseConcepts) ? activeSource.phraseConcepts : []).forEach((item) => phraseConcepts.push(item));
    (Array.isArray(activeSource?.subjectLinks) ? activeSource.subjectLinks : []).forEach((item) => subjectLinks.push(item));
    return { text: textParts.join("\n"), concepts, keywords, phraseConcepts, subjectLinks, theoryLinks };
  }

  function resolveActiveAnalysisContext() {
    const context = { sourceText: "", concepts: [], keywords: [], phraseConcepts: [], subjectLinks: [] };
    const addUnique = (target, items) => {
      (Array.isArray(items) ? items : []).forEach((item) => {
        const value = typeof item === "string" ? item : (item?.label || item?.name || item?.title || item?.key || item?.term || item?.value || item);
        if (value == null) return;
        if (target.some((existing) => JSON.stringify(existing) === JSON.stringify(item))) return;
        target.push(item);
      });
    };
    const usePayload = (payload) => {
      if (!payload || typeof payload !== "object") return;
      addUnique(context.concepts, payload?.concepts);
      addUnique(context.keywords, payload?.keywords);
      addUnique(context.phraseConcepts, payload?.phraseConcepts);
      addUnique(context.subjectLinks, payload?.subjectLinks || payload?.subject_matches || payload?.subjectMatches);
    };

    try {
      const cache = loadAutoOutputs();
      if (cache && typeof cache === "object") {
        const activeText = String(cache?.sourceText || cache?.payload?.sourceText || "").trim();
        if (activeText) context.sourceText = activeText;
        usePayload(cache?.payload);
      }
    } catch (err) {
      console.warn("Kunne ikke lese aktiv auto-output fra cache", err);
    }

    try {
      const host = typeof document !== "undefined" ? document.getElementById("aha-auto-output") : null;
      const domText = String(host?.dataset?.sourceText || "").trim();
      if (domText) context.sourceText = domText;
    } catch (err) {
      console.warn("Kunne ikke lese aktiv auto-output fra DOM", err);
    }

    try {
      if (!context.sourceText) {
        const entries = loadAfterworkEntries();
        const latest = Array.isArray(entries) ? entries[entries.length - 1] : null;
        const previewText = String(latest?.sourceTextPreview || "").trim();
        if (previewText) context.sourceText = previewText;
        usePayload(latest);
      }
    } catch (err) {
      console.warn("Kunne ikke lese afterwork fallback", err);
    }

    if (!Array.isArray(context.phraseConcepts) || !context.phraseConcepts.length) {
      context.phraseConcepts = extractAcademicPhraseConcepts(context.sourceText || "");
    }
    return context;
  }

  function prioritizeVisibleConceptEdges(edges, theoryLinks, context) {
    const list = (Array.isArray(edges) ? edges : []).map((edge) => ({ ...edge }));
    const ctx = context && typeof context === "object" ? context : {};
    const sourceText = String(ctx?.text || "");
    const normalizedText = normalizeConceptKey(sourceText);
    const theoryTokens = new Set((Array.isArray(theoryLinks) ? theoryLinks : []).flatMap((link) => [link?.name, link?.relation, link?.thinker, link?.theory]).map((v) => normalizeConceptKey(v)).filter(Boolean));
    const edgePhrasePairs = [
      { from: "ressursknapphet", to: "knapphetsskolen", left: ["ressursknapphet"], right: ["knapphetsskolen", "scarcity school"] },
      { from: "politisk økologi", to: "ressursknapphet", left: ["politisk økologi", "political ecology"], right: ["ressursknapphet"] },
      { from: "politisk økologi", to: "makt- og produksjonsforhold", left: ["politisk økologi", "political ecology"], right: ["makt- og produksjonsforhold", "maktforhold", "produksjonsforhold", "maktperspektiv"] },
      { from: "dominerende narrativ", to: "empirisk forskning", left: ["dominerende narrativ", "narrativ"], right: ["empirisk forskning", "empiri", "klimadata", "nedbørsdata"] },
      { from: "klimaforklaring", to: "politisk-historisk forklaring", left: ["klimaendringer", "klimaforklaring", "klimadrevet"], right: ["politisk og historisk", "politisk-historisk", "statens politikk", "marginalisering"] },
      { from: "marginalisering", to: "pastoralister", left: ["marginalisering"], right: ["pastoralister"] },
      { from: "marginalisering av pastoralister", to: "statens politikk", left: ["marginalisering av pastoralister", "marginalisering"], right: ["statens politikk"], requires: ["pastoralister"] },
      { from: "miljøsikkerhet", to: "politisk økologi", left: ["miljøsikkerhet", "environmental security"], right: ["politisk økologi", "political ecology"] },
      { from: "malthusiansk forklaring", to: "empirisk casestudie", left: ["malthusiansk", "knapphetsskolen", "ressursknapphet"], right: ["casestudier", "mali", "empirisk forskning"] },
      { from: "omstillingskostnader", to: "strukturelle utfordringer", left: ["omstillingskostnader", "omstillingsprosess"], right: ["strukturelle utfordringer"] },
      { from: "statlig styring", to: "kommunale målsetninger", left: ["statlig styring", "statlige mål"], right: ["kommunale målsetninger", "kommunale virkemidler"] },
      { from: "organisasjonsreform", to: "innholdsreform", left: ["organisasjonsreform"], right: ["innholdsreform"] },
      { from: "arbeidsrettet oppfølging", to: "ytelsessaksbehandling", left: ["arbeidsrettet oppfølging"], right: ["ytelsessaksbehandling", "arbeidsavklaringspenger"] },
      { from: "standardisering", to: "byråkrati", left: ["standardisering"], right: ["byråkrati"] }
    ];
    const conceptPool = new Set();
    const addConcept = (value) => {
      if (value == null) return;
      const term = typeof value === "string" ? value : (value?.label || value?.name || value?.title || value?.key || value?.term || value?.value || "");
      const normalized = normalizeConceptKey(term);
      if (normalized) conceptPool.add(normalized);
    };
    list.forEach((edge) => {
      conceptPool.add(normalizeConceptKey(edge?.from));
      conceptPool.add(normalizeConceptKey(edge?.to));
    });
    theoryTokens.forEach((token) => conceptPool.add(token));
    (Array.isArray(ctx?.concepts) ? ctx.concepts : []).forEach(addConcept);
    (Array.isArray(ctx?.keywords) ? ctx.keywords : []).forEach(addConcept);
    (Array.isArray(ctx?.phraseConcepts) ? ctx.phraseConcepts : []).forEach(addConcept);
    (Array.isArray(ctx?.subjectLinks) ? ctx.subjectLinks : []).forEach(addConcept);
    (Array.isArray(theoryLinks) ? theoryLinks : []).forEach((link) => {
      addConcept(link?.name); addConcept(link?.relation); addConcept(link?.thinker); addConcept(link?.theory);
      extractAcademicPhraseConcepts(link?.connection || "").forEach((phrase) => conceptPool.add(normalizeConceptKey(phrase)));
    });
    extractAcademicPhraseConcepts(sourceText).forEach((phrase) => conceptPool.add(normalizeConceptKey(phrase)));
    const derivedEdges = [];
    const hasAny = (variants) => variants.some((variant) => conceptPool.has(normalizeConceptKey(variant)) || normalizedText.includes(normalizeConceptKey(variant)));
    const isPublicAdmin = detectPublicAdministrationReformSignal(sourceText).strong;
    edgePhrasePairs.forEach((rule) => {
      const isPublicRule = ["omstillingskostnader", "statlig styring", "organisasjonsreform", "arbeidsrettet oppfølging", "standardisering"].includes(rule.from);
      if (isPublicRule && !isPublicAdmin) return;
      if (!hasAny(rule.left) || !hasAny(rule.right)) return;
      if (Array.isArray(rule.requires) && !hasAny(rule.requires)) return;
      const from = rule.from;
      const to = rule.to;
      const key = [from, to].sort((a, b) => a.localeCompare(b)).join("::");
      const exists = list.some((edge) => [normalizeConceptKey(edge?.from), normalizeConceptKey(edge?.to)].sort((a, b) => a.localeCompare(b)).join("::") === key);
      if (!exists) derivedEdges.push({ from, to, weight: 1.25, type: "co_occurs", derived_visible: true });
    });
    derivedEdges.slice(0, 5).forEach((edge) => list.push(edge));

    const conceptKeys = new Set(list.flatMap((edge) => [normalizeConceptKey(edge?.from), normalizeConceptKey(edge?.to)]));
    const weakSingles = new Set();
    if (conceptKeys.has("politisk økologi")) weakSingles.add("økologi");
    if (conceptKeys.has("ressursknapphet") || conceptKeys.has("knapphetsskolen")) weakSingles.add("knapphet");
    if (conceptKeys.has("politisk-historisk forklaring") || conceptKeys.has("politisk og historisk")) { weakSingles.add("politisk"); weakSingles.add("historisk"); }
    if (conceptKeys.has("malthusiansk forklaring")) weakSingles.add("malthusiansk");
    if (conceptKeys.has("marginalisering av pastoralister")) {
      weakSingles.add("marginalisering");
      weakSingles.add("pastoralister");
    }
    if (conceptKeys.has("strukturelle utfordringer") || conceptKeys.has("manglende måloppnåelse")) weakSingles.add("måloppnåelse");
    if (conceptKeys.has("statlig styring")) weakSingles.add("styring");
    if (conceptKeys.has("kommunale målsetninger")) weakSingles.add("retning");
    if (conceptKeys.has("kontorstørrelse")) weakSingles.add("størrelse");
    if (conceptKeys.has("arbeidsrettet oppfølging")) weakSingles.add("oppfølging");
    if (conceptKeys.has("standardisering og byråkrati")) weakSingles.add("standardisering");
    return list
      .map((edge) => {
        const from = normalizeConceptKey(edge?.from);
        const to = normalizeConceptKey(edge?.to);
        const fromWords = from.split(/\s+/).length;
        const toWords = to.split(/\s+/).length;
        const phraseBoost = (fromWords > 1 ? 0.2 : 0) + (toWords > 1 ? 0.2 : 0) + (edge?.derived_visible ? 0.35 : 0);
        const weakPenalty = (weakSingles.has(from) || weakSingles.has(to)) ? 0.35 : 0;
        return { ...edge, _displayScore: Number(edge?.weight || 0) + phraseBoost - weakPenalty };
      })
      .sort((a, b) => (b._displayScore - a._displayScore) || ((b?.weight || 0) - (a?.weight || 0)));
  }

  function applyPhraseConceptDisplayPreference(items, keyGetter) {
    const list = Array.isArray(items) ? items.slice() : [];
    const keys = new Set(list.map((item) => normalizeAfterworkConcept(keyGetter(item))));
    const shouldHide = new Set();
    if (keys.has("politisk økologi")) shouldHide.add("økologi");
    if (keys.has("ressursknapphet") || keys.has("knapphetsskolen")) shouldHide.add("knapphet");
    if (keys.has("politisk-historisk forklaring") || keys.has("politisk og historisk")) {
      shouldHide.add("politisk");
      shouldHide.add("historisk");
    }
    if (keys.has("malthusiansk forklaring")) shouldHide.add("malthusiansk");
    if (keys.has("strukturelle utfordringer") || keys.has("manglende måloppnåelse")) shouldHide.add("måloppnåelse");
    if (keys.has("statlig styring")) shouldHide.add("styring");
    if (keys.has("kommunale målsetninger")) shouldHide.add("retning");
    if (keys.has("kontorstørrelse")) shouldHide.add("størrelse");
    if (keys.has("arbeidsrettet oppfølging")) shouldHide.add("oppfølging");
    if (keys.has("standardisering og byråkrati")) shouldHide.add("standardisering");
    return list.filter((item) => !shouldHide.has(normalizeAfterworkConcept(keyGetter(item))));
  }

  function filterConceptLabels(concepts) {
    const seen = new Set();
    return (Array.isArray(concepts) ? concepts : [])
      .map((c) => typeof c === "string" ? c : (c?.label || c?.key || c?.term || ""))
      .map((c) => getCanonicalConceptLabel(String(c || "").trim()))
      .filter((c) => c && !WEAK_CONCEPT_WORDS.has(c.toLowerCase()))
      .filter((c) => !isBlockedStandaloneConcept(c))
      .filter((c) => !isGenericDisplayConcept(c))
      .filter((c, _, arr) => {
        const keys = new Set(arr.map((term) => normalizeAfterworkConcept(term)));
        const normalized = normalizeAfterworkConcept(c);
        if (keys.has("politisk økologi") && normalized === "økologi") return false;
        if ((keys.has("ressursknapphet") || keys.has("knapphetsskolen")) && normalized === "knapphet") return false;
        if ((keys.has("politisk-historisk forklaring") || keys.has("politisk og historisk")) && (normalized === "politisk" || normalized === "historisk")) return false;
        if (keys.has("malthusiansk forklaring") && normalized === "malthusiansk") return false;
        return true;
      })
      .filter((c) => {
        const key = c.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }
  function canonicalizeDisplayConcept(term) {
    const raw = normalizeConceptSurface(term);
    const key = normalizeAfterworkConcept(raw);
    if (/^nav[-\s]?kontor(ene|er|e)?$/.test(key) || ["navkontor","navkontorer","navkontore","lokalkontor","lokalkontorene"].includes(key)) return "NAV-kontor";
    if (["nav-reformen", "nav reformen", "navreformen"].includes(key) || (key === "reformen" && /nav/.test(normalizeAfterworkConcept(raw)))) return "NAV-reformen";
    if (["stat og kommune","stat-kommune","stat–kommune","statlig og kommunal","statlige og kommunale mål","kommunale målsetninger","kommunale mål","partnerskap mellom stat og kommune","kommunalt partnerskap"].includes(key)) return "Stat–kommune-samspill";
    if (["arbeidsrettet oppfølging","arbeidsrettet virksomhet","arbeidsrettede oppfølgingen","oppfølging mot arbeid","arbeidsmarkedstilknytning"].includes(key)) return "Arbeidsrettet oppfølging";
    if (["måloppnåelse","manglende måloppnåelse","reformens mål","mål om flere i arbeid","flere i arbeid og aktivitet","færre på trygd"].includes(key)) return "Måloppnåelse";
    if (["strukturell utfordring","strukturelle utfordringer","strukturelle vansker","strukturelle problemer","strukturelle årsaker","organisatoriske utfordringer","varige strukturelle utfordringer"].includes(key)) return "Strukturelle utfordringer";
    if (["standardisering og byråkrati","byråkrati og standardisering"].includes(key)) return "Standardisering og byråkrati";
    if (["omstillingsprosess","omstillingskostnad","omstillingskostnader","implementeringsstøy","midlertidig omstilling","omstillingsproblemer"].includes(key)) return "Omstillingsprosess";
    if (["kommunale målsetninger","kommunale mål","statlige og kommunale mål","statlig styring vs kommunale mål","statlig og kommunal","stat og kommune","stat-kommune","stat–kommune","kommunalt partnerskap","partnerskap mellom stat og kommune"].includes(key)) return "Stat–kommune-samspill";
    return raw;
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

  function normalizeConceptSurface(value) {
    return resolveConceptTerm(value)
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeVisibleAcademicLabel(value) {
    const text = String(value || "");
    if (!text) return "";
    return text
      .replace(/\bnavkontore\b/gi, "NAV-kontorene")
      .replace(/\bnavkontorene\b/gi, "NAV-kontorene")
      .replace(/\bnavkontorer\b/gi, "NAV-kontorene")
      .replace(/\bnav-kontorene\b/gi, "NAV-kontorene")
      .replace(/\bnav-kontorer\b/gi, "NAV-kontorene")
      .replace(/\bnav reformen\b/gi, "NAV-reformen")
      .replace(/\bnavreformen\b/gi, "NAV-reformen")
      .replace(/\bnav-reformen\b/gi, "NAV-reformen");
  }
  function normalizeAcademicConceptLabel(value) {
    return normalizeVisibleAcademicLabel(value);
  }

  function filterCrossDomainTextItems(items, sourceText) {
    const src = String(sourceText || "");
    const list = Array.isArray(items) ? items : [];
    const sourceHasPublicAdmin = Boolean(detectPublicAdministrationReformSignal(src)?.strong);
    const sourceHasSahelMali = /(sahel|mali|politisk økologi|knapphetsskolen|ressursknapphet|miljødegradering|miljøsikkerhet)/i.test(src);
    const blocked = sourceHasPublicAdmin
      ? /(sahel|mali|knapphetsskolen|politisk økologi|ressursknapphet|miljødegradering|miljøsikkerhet|klima og miljø kan være bakgrunnsfaktorer|konfliktutvikling|marginalisering av pastoralister|environmental security|makt- og produksjonsforhold)/i
      : (sourceHasSahelMali ? /(nav|nav-reformen|nav-kontorene|offentlig forvaltning|velferdsstat|arbeidslinja|bakkebyråkrati|stat–kommune|stat-kommune|arbeidsrettet oppfølging|kommunale målsetninger)/i : null);
    if (!blocked) return list;
    return list.filter((item) => !blocked.test(String(item || "")));
  }


  function detectLiteraryAttachmentSignal(text) {
    return chatModule("signals", "AHAChatSignals").detectLiteraryAttachmentSignal(text);
  }
  function detectSahelClimateConflictSignal(text) {
    const src = String(text || "");
    const hasSahel = /\bsahel\b|\bmali\b/i.test(src);
    const hasConflict = /\bkonflikt\b|\bconflict\b/i.test(src);
    const hasClimate = /\bklima\b|\bclimate\b|\bmiljø\b/i.test(src);
    const hasTheory = /\bknapphetsskolen\b|\bressursknapphet\b|\bmiljøsikkerhet\b|\bpolitisk økologi\b|\benvironmental security\b/i.test(src);
    return { strong: (hasSahel && (hasConflict || hasClimate)) || (hasSahel && hasTheory), hasSahel, hasConflict, hasClimate, hasTheory };
  }
  function detectInstitutionalMediaHistorySignal(text) {
    return chatModule("signals", "AHAChatSignals").detectInstitutionalMediaHistorySignal(text);
  }
  function extractMainInstitutionName(text) {
    const source = String(text || "");
    const sentences = toSentences(source).slice(0, 2);
    const head = sentences.join(" ");
    const scan = `${head} ${source}`;
    const tokens = scan.match(/\b[A-ZÆØÅ][A-Za-zÆØÅæøå-]{1,}(?:\s+[A-ZÆØÅ][A-Za-zÆØÅæøå-]{1,}){0,3}\b/g) || [];
    const blocked = new Set(["Det", "Den", "Dette", "I", "På", "For", "Og", "En", "Et", "Som", "Av", "Til"]);
    const counts = new Map();
    tokens.forEach((token) => {
      const clean = String(token || "").trim();
      if (!clean || blocked.has(clean)) return;
      counts.set(clean, (counts.get(clean) || 0) + 1);
    });
    const priorityPatterns = [
      /\b([A-ZÆØÅ][A-Za-zÆØÅæøå-]+(?:\s+[A-ZÆØÅ][A-Za-zÆØÅæøå-]+){0,3})\s+er\s+en?\b/g,
      /\b([A-ZÆØÅ][A-Za-zÆØÅæøå-]+(?:\s+[A-ZÆØÅ][A-Za-zÆØÅæøå-]+){0,3})\s+ble\s+grunnlagt\b/g,
      /\b([A-ZÆØÅ][A-Za-zÆØÅæøå-]+(?:\s+[A-ZÆØÅ][A-Za-zÆØÅæøå-]+){0,3})\s+vart\s+grunnlagd\b/g,
      /\b([A-ZÆØÅ][A-Za-zÆØÅæøå-]+(?:\s+[A-ZÆØÅ][A-Za-zÆØÅæøå-]+){0,3})\s+grunnlagt\b/g,
      /\b([A-ZÆØÅ][A-Za-zÆØÅæøå-]+(?:\s+[A-ZÆØÅ][A-Za-zÆØÅæøå-]+){0,3})\s+(avis|institusjon|organisasjon|universitet|museum|bibliotek|stiftelse)\b/g
    ];
    const priority = new Map();
    priorityPatterns.forEach((pattern) => {
      let m;
      while ((m = pattern.exec(head)) !== null) {
        const key = String(m[1] || "").trim();
        if (key && !blocked.has(key)) priority.set(key, (priority.get(key) || 0) + 2);
      }
    });
    const candidates = [...new Set([...counts.keys(), ...priority.keys()])];
    if (!candidates.length) return "institusjonen";
    const ranked = candidates
      .map((name) => ({
        name,
        score: (counts.get(name) || 0) + (priority.get(name) || 0) + (head.includes(name) ? 1 : 0)
      }))
      .sort((a, b) => b.score - a.score);
    return ranked[0]?.name || "hovedobjektet";
  }
  function subjectMatchesFromCalibration(calibrated) {
    const emner = Array.isArray(calibrated?.matched_emner) ? calibrated.matched_emner : [];
    if (!emner.length) return [];
    const bestScore = Math.max(...emner.map((item) => Number(item?.score || 0)), 0);
    const floor = Math.max(1.5, bestScore * 0.45);
    const rows = emner
      .filter((item) => item?.subject_id && item?.emne_id && Number(item?.score || 0) >= floor)
      .slice(0, 6)
      .map((item) => ({
        title: String(item?.title || item?.short_label || item?.emne_id || "").trim(),
        subject_label: String(item?.title || item?.short_label || item?.subject_id || "").trim(),
        subject_id: String(item?.subject_id || "").trim(),
        emne_id: String(item?.emne_id || "").trim(),
        id: String(item?.emne_id || item?.subject_id || "").trim(),
        score: Number(item?.score || 0),
        source: "historygo_fag_calibration"
      }));
    return normalizeSubjectMatches(rows);
  }

  function detectAutoAnalysisDomain(sourceText, payload = {}) {
    const src = String(sourceText || "");
    const payloadText = `${payload?.reflection || ""} ${(Array.isArray(payload?.sortItems) ? payload.sortItems : []).map((item) => `${item?.label || ""} ${item?.text || ""}`).join(" ")}`;
    const domainText = src.trim().length >= 25 ? src : `${src} ${payloadText}`;
    const canonicalDomain = chatModule("signals", "AHAChatSignals").detectCanonicalAnalysisDomain(domainText);
    if (canonicalDomain) return canonicalDomain;
    if (detectPublicAdministrationSignal(domainText).strong) return "public_administration";
    if (detectSongLyricChildCultureSignal(src).strong) return "song_lyric_child_culture";
    if (detectSahelClimateConflictSignal(domainText).strong) return "sahel_climate_conflict";
    return "generic_academic";
  }

  function detectSongLyricChildCultureSignal(text) {
    const src = cleanArticleText(text || "").toLowerCase();
    const terms = [
      "barnesang", "barnesanger", "sanglyrikk", "sang og sanglyrikk", "barnekultur",
      "barnelitteratur", "barnelitterære", "sjangerrikdom", "rim", "rytme",
      "regler", "nonsens", "vuggesang", "bevegelsessang", "musikk", "oppdragelse",
      "utdanning", "identitetsdannelse", "ritualer", "kulturforskning", "litteraturforskning"
    ];
    const hits = terms.filter((term) => src.includes(term));
    const hasSang = /\bsang(?:en|er|lyrikk|tekster)?\b/i.test(src);
    const hasChildCulture = /\b(barne|barn|barnekultur|barnelitteratur|oppdragelse|utdanning)\b/i.test(src);
    return { strong: hits.length >= 2 || (hasSang && hasChildCulture), hits };
  }

  const CANONICAL_BLOCKED_DOMAIN_TERMS = [
    "redaksjonell", "eierskap", "eierskapsskifter", "medieoffentlighet", "presse",
    "institusjonell omforming", "økonomisk avhengighet", "medieaktør", "norsk politisk pressehistorie"
  ];
  const CANONICAL_MEDIA_SUPPORT_PATTERNS = [
    /\bredaksjon/i, /\bavis(?:a|en|er)?\b/i, /\bpresse\b/i, /\beierskap\b/i,
    /\boffentlighet\b/i, /\bøkonomisk avhengighet\b/i, /\bjournalistikk\b/i, /\bmedie(?:r|hus|aktør)?\b/i
  ];

  function sourceSupportsMediaInstitutionTerms(sourceText) {
    return CANONICAL_MEDIA_SUPPORT_PATTERNS.some((pattern) => pattern.test(String(sourceText || "")));
  }

  function firstUnsupportedCanonicalDomainTerm(value, sourceText) {
    const text = String(value || "").toLowerCase();
    if (!text) return "";
    if (sourceSupportsMediaInstitutionTerms(sourceText)) return "";
    return CANONICAL_BLOCKED_DOMAIN_TERMS.find((term) => text.includes(term)) || "";
  }

  function containsUnsupportedCanonicalDomainTerm(value, sourceText) {
    return Boolean(firstUnsupportedCanonicalDomainTerm(value, sourceText));
  }

  function logSkippedUnsupportedCanonicalField(field, term, sourceText) {
    const safeField = String(field || "unknown");
    const safeTerm = String(term || "unknown");
    const hash = sourceHash(sourceText || "");
    console.warn(`Skipped unsupported canonicalAnalysis field: field=${safeField}, term=${safeTerm}, sourceHash=${hash}`);
  }

  function stripUnsupportedCanonicalItems(items, sourceText, field = "unknown") {
    return (Array.isArray(items) ? items : []).filter((item) => {
      const text = typeof item === "string" ? item : `${item?.label || ""} ${item?.text || ""} ${item?.title || ""} ${item?.subject_label || ""}`;
      const term = firstUnsupportedCanonicalDomainTerm(text, sourceText);
      if (term) {
        logSkippedUnsupportedCanonicalField(field, term, sourceText);
        return false;
      }
      return true;
    });
  }

  function getSongLyricChildCultureSubjectMatches() {
    return normalizeSubjectMatches([
      "Barnelitteratur",
      "Barnekultur",
      "Lyrikk, rytme og språk",
      "Musikk",
      "Sanglyrikk",
      "Utdanning og oppdragelse",
      "Identitetsdannelse",
      "Ritualer",
      "Kultur- og litteraturforskning"
    ]);
  }

  function buildSongLyricChildCulturePayload(payload, sourceText) {
    const safe = payload && typeof payload === "object" ? payload : {};
    return {
      ...safe,
      textType: safe.textType || "academic_article",
      reflection: "Teksten handler om sang og sanglyrikk i barnekulturen, med vekt på barnelitteratur, musikk, språk, oppdragelse, identitetsdannelse og behovet for mer forskning.",
      sortItems: [
        { label: "Tema", text: "Sanglyrikk i barnekultur og barnelitteratur." },
        { label: "Sjangerrikdom", text: "Barnesang samler lyrikk, rytme, musikk, lek, ritualer og pedagogiske funksjoner." },
        { label: "Hovedspenning", text: "Kulturell praksis og kunstform ↔ forskningens behov for tydeligere begreper og mer empirisk kunnskap." },
        { label: "Faglig betydning", text: "Sanglyrikk knyttes til språk, utdanning, oppdragelse, fellesskap og identitetsdannelse." }
      ],
      day: "Kort fagoppsummering: Teksten analyserer barnesang og sanglyrikk som barnekultur, barnelitteratur, musikk, språkpraksis og forskningsfelt.",
      thoughts: {
        hovedspor: "Barnesang bør forstås som kulturell praksis, kunstform og lyrikk i barns hverdags- og læringskultur.",
        lose_tanker: "Skill mellom musikk, lyrikk, pedagogikk, ritualer, lek og identitetsdannelse før sporene kobles.",
        neste_steg: "Finn tekstbelegg for hvordan sanglyrikk virker i språk, oppdragelse, ritualer og barnekultur."
      },
      list: [
        "Les sang som kulturell praksis og kunstform, ikke som institusjonsnavn.",
        "Koble barnesang til barnelitteratur, lyrikk, rytme og musikk.",
        "Undersøk pedagogiske spor: utdanning, oppdragelse og språk.",
        "Se etter ritualer, fellesskap og identitetsdannelse.",
        "Marker hvor teksten etterlyser mer kultur- og litteraturforskning."
      ],
      path: [
        "Kartlegg hvordan teksten definerer sanglyrikk og barnesang.",
        "Sorter eksempler etter lyrikk, rytme, musikk, lek og ritual.",
        "Analyser pedagogiske og kulturelle funksjoner.",
        "Koble funn til barnelitteratur, barnekultur og identitetsdannelse.",
        "Formuler forskningsspørsmål der teksten peker på kunnskapshull."
      ],
      subjectMatches: getSongLyricChildCultureSubjectMatches(),
      subjectLinks: getSongLyricChildCultureSubjectMatches(),
      canonicalAnalysis: {
        ...(safe.canonicalAnalysis && typeof safe.canonicalAnalysis === "object" ? safe.canonicalAnalysis : {}),
        contentType: "Fagtekst om barnekultur og sanglyrikk",
        theme: "Sang og sanglyrikk i barnekulturen",
        mainTension: "Barnesang som kulturell praksis/kunstform ↔ behovet for mer forskning på sjanger, språk, oppdragelse og identitetsdannelse.",
        keyInsight: "Sanglyrikk i barnekulturen forstås gjennom barnelitteratur, musikk, lyrikk, språk, ritualer, utdanning og identitetsdannelse.",
        nextStep: "Undersøk tekstbelegg for hvordan sanglyrikk fungerer i barnekultur, læring, ritualer og identitetsdannelse.",
        fieldConnections: getSongLyricChildCultureSubjectMatches().map((item) => item.title)
      },
      ahaSer: {
        innholdstype: "Fagtekst om barnekultur og sanglyrikk",
        tema: "Sang og sanglyrikk i barnekulturen.",
        hovedspenning: "Barnesang som kulturell praksis/kunstform ↔ behovet for mer forskning på sjanger, språk, oppdragelse og identitetsdannelse.",
        viktigsteInnsikt: "Teksten viser at sanglyrikk i barnekulturen må forstås gjennom barnelitteratur, musikk, lyrikk, språk, ritualer, utdanning og identitetsdannelse.",
        fagkoblinger: getSongLyricChildCultureSubjectMatches().map((item) => item.title),
        nesteSteg: "Undersøk konkrete tekstbelegg for hvordan sanglyrikk fungerer i barnekultur, læring, ritualer og identitetsdannelse.",
        kortSvar: "Teksten handler om barnesang og sanglyrikk som del av barnekultur, barnelitteratur, musikk, språk og oppdragelse – ikke om mediehistorie eller institusjonshistorie."
      }
    };
  }

  function enforceCanonicalSourceGrounding(payload, sourceText) {
    const source = String(sourceText || "");
    const safe = payload && typeof payload === "object" ? payload : {};
    let out = { ...safe };
    if (detectSongLyricChildCultureSignal(source).strong) out = buildSongLyricChildCulturePayload(out, source);
    out.sortItems = stripUnsupportedCanonicalItems(out.sortItems, source, "structure");
    out.list = stripUnsupportedCanonicalItems(out.list, source, "list");
    out.path = stripUnsupportedCanonicalItems(out.path, source, "learningPath");
    out.insightCards = stripUnsupportedCanonicalItems(out.insightCards, source, "mainInsight");
    out.subjectMatches = stripUnsupportedCanonicalItems(out.subjectMatches, source, "fagkoblinger");
    out.subjectLinks = stripUnsupportedCanonicalItems(out.subjectLinks, source, "fagkoblinger");
    if (out.ahaSer && typeof out.ahaSer === "object") {
      out.ahaSer = { ...out.ahaSer };
      ["tema", "hovedspenning", "viktigsteInnsikt", "nesteSteg", "kortSvar"].forEach((key) => {
        const term = firstUnsupportedCanonicalDomainTerm(out.ahaSer[key], source);
        if (term) {
          logSkippedUnsupportedCanonicalField(key, term, source);
          out.ahaSer[key] = "";
        }
      });
      out.ahaSer.fagkoblinger = stripUnsupportedCanonicalItems(Array.isArray(out.ahaSer.fagkoblinger) ? out.ahaSer.fagkoblinger : String(out.ahaSer.fagkoblinger || "").split("·"), source, "fagkoblinger");
    }
    if (out.canonicalAnalysis && typeof out.canonicalAnalysis === "object") {
      out.canonicalAnalysis = { ...out.canonicalAnalysis };
      ["contentType", "topic", "theme", "mainTension", "keyInsight", "mainInsight", "nextStep", "reflection", "summary"].forEach((key) => {
        const term = firstUnsupportedCanonicalDomainTerm(out.canonicalAnalysis[key], source);
        if (term) {
          logSkippedUnsupportedCanonicalField(key, term, source);
          out.canonicalAnalysis[key] = "";
        }
      });
      out.canonicalAnalysis.fieldConnections = stripUnsupportedCanonicalItems(out.canonicalAnalysis.fieldConnections, source, "fagkoblinger");
      out.canonicalAnalysis.suggestedActions = stripUnsupportedCanonicalItems(out.canonicalAnalysis.suggestedActions, source, "nextStep");
      out.canonicalAnalysis.analysisRunId = out.canonicalAnalysis.analysisRunId || out.analysisRunId || out.runId || "";
      out.canonicalAnalysis.runId = out.canonicalAnalysis.runId || out.runId || out.analysisRunId || "";
      out.canonicalAnalysis.sourceHash = out.canonicalAnalysis.sourceHash || out.sourceHash || out.sourceTextHash || sourceHash(source);
      out.canonicalAnalysis.sourceTextHash = out.canonicalAnalysis.sourceTextHash || out.sourceTextHash || out.sourceHash || sourceHash(source);
      out.canonicalAnalysis.evidenceAnchors = buildCanonicalEvidenceAnchors(out, source);
    }
    const reflectionTerm = firstUnsupportedCanonicalDomainTerm(out.reflection, source);
    if (reflectionTerm) {
      logSkippedUnsupportedCanonicalField("mainInsight", reflectionTerm, source);
      out.reflection = "";
    }
    if (out.thoughts && typeof out.thoughts === "object") {
      out.thoughts = { ...out.thoughts };
      Object.keys(out.thoughts).forEach((key) => {
        const term = firstUnsupportedCanonicalDomainTerm(out.thoughts[key], source);
        if (term) {
          logSkippedUnsupportedCanonicalField(key === "neste_steg" ? "nextStep" : "mainInsight", term, source);
          out.thoughts[key] = "";
        }
      });
    }
    return out;
  }

  function buildCanonicalEvidenceAnchors(payload, sourceText) {
    const source = cleanArticleText(sourceText || "");
    const sentences = toSentences(source).filter(Boolean);
    const fields = {
      innholdstype: payload?.ahaSer?.innholdstype || payload?.contentType || payload?.textType || payload?.canonicalAnalysis?.contentType,
      tema: payload?.ahaSer?.tema || payload?.canonicalAnalysis?.theme,
      hovedspenning: payload?.ahaSer?.hovedspenning || payload?.canonicalAnalysis?.mainTension,
      viktigsteInnsikt: payload?.ahaSer?.viktigsteInnsikt || payload?.canonicalAnalysis?.keyInsight,
      nesteSteg: payload?.ahaSer?.nesteSteg || (Array.isArray(payload?.path) ? payload.path[0] : ""),
      fagkoblinger: Array.isArray(payload?.ahaSer?.fagkoblinger) ? payload.ahaSer.fagkoblinger.join(" ") : String(payload?.ahaSer?.fagkoblinger || "")
    };
    const anchors = {};
    Object.entries(fields).forEach(([key, value]) => {
      const fieldWords = takeKeywords(String(value || ""), 8).map((item) => item.toLowerCase());
      const match = sentences.find((sentence) => fieldWords.some((word) => word.length > 3 && sentence.toLowerCase().includes(word)));
      if (match) anchors[key] = short(match, 180);
    });
    return anchors;
  }

  function normalizeSubjectMatches(subjectMatches) {
    const list = Array.isArray(subjectMatches) ? subjectMatches : [];
    return list.map((item) => {
      if (typeof item === "string") return { title: item, subject_label: item, subject_id: normalizeConceptKey(item) || item.toLowerCase() };
      const title = String(item?.title || item?.subject_label || item?.subject_id || item?.id || "").trim();
      const subject_label = String(item?.subject_label || title).trim();
      const subject_id = String(item?.subject_id || normalizeConceptKey(title) || title.toLowerCase()).trim();
      return { ...item, title, subject_label, subject_id };
    }).filter((item) => item.title);
  }

  function getLiterarySubjectMatches() {
    return normalizeSubjectMatches(["Litteraturvitenskap", "Psykologi", "Tilknytningsteori", "Autofiksjon", "Narratologi", "Deiksis", "Nymaterialisme", "Virkelighetslitteratur"]);
  }
  function getInstitutionalMediaHistorySubjectMatches(sourceText, payload = {}) {
    const src = String(sourceText || "");
    const payloadText = `${payload?.reflection || ""} ${(Array.isArray(payload?.sortItems) ? payload.sortItems : []).map((item) => `${item?.label || ""} ${item?.text || ""}`).join(" ")}`;
    const combined = `${src} ${payloadText}`;
    const signal = detectInstitutionalMediaHistorySignal(combined);
    const isNewspaperText = /\b(morgenbladet|avis|redaksjon|journalistikk|kommentaravis|nisjeavis)\b/i.test(combined);
    const isMediaText = /\b(media|medie|presse|offentlighet|kulturjournalistikk|redaksjonell)\b/i.test(combined);
    if (signal?.strong && (isNewspaperText || isMediaText)) {
      return normalizeSubjectMatches([
        "Mediehistorie",
        "Presse og offentlighet",
        "Eierskap og redaksjonell uavhengighet",
        "Kulturjournalistikk",
        "Akademisk offentlighet",
        "Norsk politisk pressehistorie"
      ]);
    }
    return normalizeSubjectMatches([
      "Institusjonshistorie",
      "Offentlighet",
      "Eierskap og autonomi",
      "Styring og samfunnsrolle"
    ]);
  }
  function getLiteraryAttachmentLearningPath() {
    return [
      "Identifiser romanens bruk av tilknytningsteori.",
      "Analyser deiktisk poetikk og tiltaleform.",
      "Undersøk forholdet mellom far–barn-tilknytning og ekteskapelig løsrivelse.",
      "Sammenlign Knausgårds og Linda Boström Knausgårds perspektiver.",
      "Drøft hvordan nymaterialisme, sårbarhet og mytologi utfordrer en ren psykologisk forklaring."
    ];
  }

  function short(text, maxLen = 180) {
    const normalized = normalizeDisplayText(text).replace(/\s+/g, " ").trim();
    if (!normalized) return "";
    if (normalized.length <= maxLen) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
  }


  function hasAcademicSignals(payload, sourceText) {
    const sortItems = Array.isArray(payload?.sortItems) ? payload.sortItems : [];
    const labels = sortItems.map((item) => normalizeConceptKey(item?.label || ""));
    const reflection = normalizeConceptKey(payload?.reflection || "");
    const signalText = `${String(sourceText || "")} ${String(payload?.reflection || "")} ${sortItems.map((item) => `${item?.label || ""} ${item?.text || ""}`).join(" ")}`.toLowerCase();
    const hasSortLabelSignal = labels.some((label) => ["hovedargument", "motargument", "spenning i teksten", "teorikoblinger"].some((needle) => label.includes(needle)));
    const hasTopicSignal = /(sahel|mali|ressursknapphet|politisk økologi|knapphetsskolen)/i.test(signalText) || /(sahel|mali|ressursknapphet|politisk økologi|knapphetsskolen)/i.test(reflection);
    return hasSortLabelSignal || hasTopicSignal;
  }

  function normalizeAcademicAfterworkPayload(payload, sourceText, textType) {
    const safePayload = payload && typeof payload === "object" ? payload : {};
    const src = String(sourceText || "");
    if (!AHA_RUNTIME_KNOWLEDGE_POLICY.legacyArticleTemplatesEnabled && (textType === "academic_article" || detectTextType(src) === "academic_article")) {
      return applyRuntimeKnowledgePolicy(safePayload, src);
    }
    const payloadSignalText = `${safePayload.reflection || ""} ${(Array.isArray(safePayload.sortItems) ? safePayload.sortItems : []).map((item) => `${item?.label || ""} ${item?.text || ""}`).join(" ")}`;
    const publicAdminSignal = detectPublicAdministrationReformSignal(src);
    const payloadPublicAdminSignal = detectPublicAdministrationReformSignal(payloadSignalText);
    const hasStrongSourceSahelMali = /(sahel|mali|politisk økologi|knapphetsskolen|ressursknapphet|miljødegradering)/i.test(src);
    const hasStrongPayloadSahelMali = /(sahel|mali|politisk økologi|knapphetsskolen|ressursknapphet|miljødegradering)/i.test(payloadSignalText);
    const sourceWeakOrEmpty = src.trim().length < 25;
    const hasSahelMali = hasStrongSourceSahelMali || (sourceWeakOrEmpty && hasStrongPayloadSahelMali);
    const hasPublicAdminSignal = Boolean(publicAdminSignal?.strong) || (sourceWeakOrEmpty && Boolean(payloadPublicAdminSignal?.strong));
    const domain = detectAutoAnalysisDomain(src, safePayload);
    if (domain === "literary_attachment") {
      return {
        ...safePayload,
        textType: "academic_article",
        path: getLiteraryAttachmentLearningPath().map(normalizeVisibleAcademicLabel),
        subjectMatches: getLiterarySubjectMatches(),
        subjectLinks: getLiterarySubjectMatches()
      };
    }
    const isAcademic = textType === "academic_article" || hasAcademicSignals(safePayload, src) || hasPublicAdminSignal;
    if (!isAcademic) return safePayload;
    const institutionalHistorySignal = detectInstitutionalMediaHistorySignal(src || payloadSignalText);
    if (institutionalHistorySignal?.strong) {
      return {
        ...safePayload,
        textType: "academic_article"
      };
    }

    const religiousLexiconSignal = inferReligiousLexiconEvidence(src || payloadSignalText);
    if (religiousLexiconSignal?.strong) {
      return {
        ...safePayload,
        textType: "academic_article",
        reflection: normalizeVisibleAcademicLabel(String(safePayload.reflection || "Teksten er en religionsfaglig leksikontekst med vekt på pinsefortelling, teologi, symbolikk og kirkelig praksis.")),
        sortItems: (Array.isArray(safePayload.sortItems) ? safePayload.sortItems : []).map((item) => ({
          label: normalizeVisibleAcademicLabel(item?.label || ""),
          text: normalizeVisibleAcademicLabel(item?.text || "")
        })),
        list: filterCrossDomainTextItems(Array.isArray(safePayload.list) ? safePayload.list : [], src).slice(0, 6).map(normalizeDisplayText),
        path: (Array.isArray(safePayload.path) ? safePayload.path : []).slice(0, 5).map(normalizeVisibleAcademicLabel),
        insightCards: filterDomainInsightCards(Array.isArray(safePayload.insightCards) ? safePayload.insightCards : [], src).slice(0, 4).map((entry) => typeof entry === "string" ? normalizeDisplayText(entry) : ({
          ...entry,
          title: normalizeDisplayText(entry?.title || ""),
          summary: normalizeDisplayText(entry?.summary || entry?.text || "")
        }))
      };
    }

    const isPublicAdmin = hasPublicAdminSignal && !hasSahelMali;
    const reflection = isPublicAdmin
      ? "Teksten undersøker om NAVs måloppnåelse best forklares av midlertidige omstillingskostnader eller mer varige strukturelle utfordringer i styring, organisering og stat–kommune-samspill. Den sentrale bevegelsen går fra en implementeringsforklaring til en strukturell analyse av forenklingsarbeid, statlig styring og motstridende mål mellom stat og kommune. Analysen bygger på data og argumentasjon i artikkelen og peker på at utfordringene ikke kan forstås som midlertidig reformstøy alene. Den faglige spenningen ligger mellom omstillingskostnad og strukturell forklaring."
      : (String(safePayload.reflection || "").trim() || "Teksten undersøker konkurrerende forklaringer og vurderer hvordan metode, funn og teori henger sammen i en akademisk analyse.");

    const academicSortItems = isPublicAdmin
      ? [
          { label: "Problemstilling", text: "Hvorfor har NAV-kontorene ikke nådd målene om flere i arbeid og aktivitet i samme grad som forventet?" },
          { label: "Hovedforklaring", text: "Tidligere forklaringer vektlegger omstillingsprosessen ved etableringen av NAV-kontorene." },
          { label: "Alternativ forklaring", text: "Artikkelen peker på mer langsiktige strukturelle utfordringer i lokalkontorene." },
          { label: "Empirisk grunnlag", text: "Analysen bygger på kvalitative og kvantitative data fra NAV-kontorer, inkludert prosess- og effektdata." },
          { label: "Strukturelle utfordringer", text: "Forenklingsarbeid, styringspraksis og målkonflikter mellom stat og kommune trekkes frem som sentrale forklaringer." },
          { label: "Implikasjon / videre analyse", text: "NAV-reformen krever organisatoriske og styringsmessige grep, ikke bare mer tid i implementeringsfasen." }
        ]
      : [
          { label: "Problemstilling", text: String((safePayload.sortItems || []).find((item) => /problem|hovedinnsikt/i.test(String(item?.label || "")))?.text || "Hva er den sentrale faglige problemstillingen i teksten?").trim() },
          { label: "Hovedpåstand", text: String((safePayload.sortItems || []).find((item) => /hovedargument|hovedpåstand/i.test(String(item?.label || "")))?.text || "").trim() },
          { label: "Alternativ forklaring", text: String((safePayload.sortItems || []).find((item) => /motargument|kritikk|alternativ/i.test(String(item?.label || "")))?.text || "").trim() },
          { label: "Faglig spenning", text: String((safePayload.sortItems || []).find((item) => /spenning/i.test(String(item?.label || "")))?.text || "").trim() },
          { label: "Neste analysegrep", text: "Presiser forholdet mellom metode, funn og teori for å styrke forklaringskraften." }
        ].filter((item) => item.text);

    const normalizedList = filterCrossDomainTextItems((isPublicAdmin
      ? [
          "Skille tydelig mellom omstillingsforklaring og strukturell forklaring.",
          "Koble effektforskning og prosessdata til NAV-kontorenes lokale organisering.",
          "Analysere hvordan statlig styring og kommunale mål trekker i ulik retning.",
          "Vurdere hvordan kontorstørrelse påvirker arbeidsrettet oppfølging.",
          "Presisere hvilke organisatoriske og styringsmessige grep som kan styrke måloppnåelsen."
        ]
      : (Array.isArray(safePayload.list) ? safePayload.list : [])), src).slice(0, 6);
    const navInsights = [
      "Hovedinnsikt: Artikkelen viser at NAVs manglende måloppnåelse ikke bare kan forklares med midlertidig omstilling, men også med varige strukturelle utfordringer.",
      "Hovedargument: NAV-kontorenes resultater påvirkes av forenklingsarbeid, statlig styring, kommunale mål og lokal organisering.",
      "Motargument/kritikk: En ren omstillingsforklaring undervurderer mer grunnleggende organisatoriske og styringsmessige problemer.",
      "Spenning: Spenningen ligger mellom omstillingskostnad og strukturell forklaring."
    ];
    const normalizedInsights = filterDomainInsightCards((isPublicAdmin ? navInsights : (Array.isArray(safePayload.insightCards) ? safePayload.insightCards : [])), src).slice(0, 4);
    return {
      ...safePayload,
      textType: "academic_article",
      reflection: normalizeVisibleAcademicLabel(reflection),
      sortItems: academicSortItems.map((item) => ({ label: normalizeVisibleAcademicLabel(item.label), text: normalizeVisibleAcademicLabel(item.text) })),
      thoughts: {
        hovedspor: normalizeVisibleAcademicLabel(isPublicAdmin
          ? "NAVs måloppnåelse analyseres som et mulig strukturelt styrings- og organisasjonsproblem."
          : String(safePayload?.thoughts?.hovedspor || "Teksten analyserer en faglig problemstilling med konkurrerende forklaringer.")),
        lose_tanker: normalizeVisibleAcademicLabel(isPublicAdmin
          ? "Omstillingskostnader, statlig styring, kommunale mål og arbeidsrettet oppfølging bør holdes analytisk adskilt."
          : String(safePayload?.thoughts?.lose_tanker || "Metode, funn og implikasjon bør kobles tydeligere i analysen.")),
        neste_steg: normalizeVisibleAcademicLabel(isPublicAdmin
          ? "Skille tydelig mellom midlertidige implementeringsproblemer og varige strukturelle utfordringer i NAV-kontorene."
          : String(safePayload?.thoughts?.neste_steg || "Formuler neste analysegrep som tester forklaringsmodellen mot empirien."))
      },
      path: (isPublicAdmin
        ? [
            "Identifiser hovedproblemstillingen om måloppnåelse i NAV-reformen.",
            "Skill mellom omstillingsforklaring og strukturell forklaring.",
            "Knytt metode/data til funn om NAV-kontorene.",
            "Analyser spenningen mellom statlig styring og kommunale mål.",
            "Vurder implikasjoner for arbeidsrettet oppfølging."
          ]
        : [
            "Identifiser hovedproblemstillingen.",
            "Skill mellom hovedforklaring og alternativ forklaring.",
            "Knytt metode/data til funn.",
            "Finn faglige spenninger i teksten.",
            "Formuler et konkret neste analysegrep."
          ]).map(normalizeVisibleAcademicLabel),
      list: normalizedList.map(normalizeDisplayText),
      insightCards: normalizedInsights.map((entry) => {
        if (typeof entry === "string") return normalizeDisplayText(entry);
        return {
          ...entry,
          title: normalizeDisplayText(entry?.title || ""),
          summary: normalizeDisplayText(entry?.summary || entry?.text || ""),
          concepts: (Array.isArray(entry?.concepts) ? entry.concepts : []).map(normalizeAcademicConceptLabel)
        };
      })
    };
  }

  function parseLabeledInsightCards(insights) {
    const list = Array.isArray(insights) ? insights : [];
    const parsed = { tema: "", hovedspenning: "", viktigsteInnsikt: "" };
    list.forEach((item) => {
      const text = String(item?.summary || item?.text || item || "").trim();
      const lower = text.toLowerCase();
      if (!parsed.tema && lower.startsWith("tema:")) parsed.tema = text.replace(/^tema:\s*/i, "").trim();
      if (!parsed.hovedspenning && lower.startsWith("hovedspenning:")) parsed.hovedspenning = text.replace(/^hovedspenning:\s*/i, "").trim();
      if (!parsed.viktigsteInnsikt && (lower.startsWith("viktigste innsikt:") || lower.startsWith("hovedinnsikt:"))) {
        parsed.viktigsteInnsikt = text.replace(/^(viktigste innsikt|hovedinnsikt):\s*/i, "").trim();
      }
    });
    return parsed;
  }

  function readLatestAcademicContext() {
    const empty = { textType: "", sourceText: "", phraseConcepts: [], payload: null };
    try {
      const cache = loadAutoOutputs();
      const payload = cache?.payload && typeof cache.payload === "object" ? cache.payload : null;
      const sourceText = String(cache?.sourceText || payload?.sourceText || "").trim();
      const payloadTextType = String(payload?.textType || "").trim();
      const detectedTextType = sourceText ? detectTextType(sourceText) : "";
      const inferredAcademic = payloadTextType === "academic_article" || detectedTextType === "academic_article" || hasAcademicSignals(payload, sourceText);
      if (sourceText && inferredAcademic) {
        return { textType: "academic_article", sourceText, phraseConcepts: extractAcademicPhraseConcepts(sourceText).slice(0, 8), payload };
      }
    } catch (err) {
      console.warn("Kunne ikke lese auto-output for akademisk kontekst", err);
    }

    try {
      const latestAcademic = loadAfterworkEntries()
        .slice()
        .reverse()
        .find((entry) => String(entry?.textType || "").trim() === "academic_article");
      const sourceText = String(latestAcademic?.sourceText || latestAcademic?.sourceTextPreview || "").trim();
      if (sourceText) {
        return { textType: "academic_article", sourceText, phraseConcepts: extractAcademicPhraseConcepts(sourceText).slice(0, 8), payload: null };
      }
    } catch (err) {
      console.warn("Kunne ikke lese lagret etterarbeid for akademisk kontekst", err);
    }
    return empty;
  }

  function buildAcademicSyntheticInsightCards() {
    const context = readLatestAcademicContext();
    const text = String(context?.sourceText || "").trim();
    const payload = context?.payload && typeof context.payload === "object" ? context.payload : null;
    const payloadSortItems = Array.isArray(payload?.sortItems) ? payload.sortItems : [];
    const payloadInsightCards = Array.isArray(payload?.insightCards) ? payload.insightCards : [];
    const payloadReflection = String(payload?.reflection || "").trim();
    if (!AHA_RUNTIME_KNOWLEDGE_POLICY.legacyArticleTemplatesEnabled) {
      if (!text) return [];
      return buildSourceGroundedAcademicPayload(text).insightCards;
    }
    const sourceSortItems = payloadSortItems.length ? payloadSortItems : [];

    let fallbackSynthesis = null;
    if (!sourceSortItems.length && !payloadReflection && !payloadInsightCards.length && text) {
      try {
        fallbackSynthesis = buildAutoOutputs(text, "");
      } catch (err) {
        console.warn("Kunne ikke bygge syntetiske akademiske innsikter", err);
      }
    }

    const sortItems = sourceSortItems.length ? sourceSortItems : (Array.isArray(fallbackSynthesis?.sortItems) ? fallbackSynthesis.sortItems : []);
    const normalizedCards = payloadInsightCards
      .map((card) => ({ ...card, title: String(card?.title || card?.candidate_title || "").trim(), summary: String(card?.summary || card?.candidate_summary || card?.text || "").trim() }))
      .filter((card) => card.title && card.summary && !isFragmentaryInsightCard(card));
    const byTitle = (needle) => normalizedCards.find((card) => normalizeConceptKey(card.title).includes(needle));
    const pickSort = (matcher) => {
      const hit = sortItems.find((item) => matcher(normalizeConceptKey(item?.label || "")));
      return String(hit?.text || "").trim();
    };
    const pick = (kind, fallback) => {
      const fromCards = byTitle(kind);
      if (fromCards?.summary) return fromCards.summary;
      if (kind === "hovedinnsikt") return pickSort((label) => label.includes("kort hovedinnsikt")) || payloadReflection || fallbackSynthesis?.reflection || fallback;
      if (kind === "hovedargument") return pickSort((label) => label.includes("hovedargument")) || fallback;
      if (kind === "motargument") return pickSort((label) => label.includes("motargument")) || fallback;
      if (kind === "spenning") return pickSort((label) => label.includes("spenning")) || fallback;
      return fallback;
    };

    const domain = detectAutoAnalysisDomain(text, payload || {});
    const sourceHasPublicAdmin = domain === "public_admin_nav" || domain === "public_administration_reform";
    const sourceHasSahelMali = domain === "sahel_climate_conflict";
    const domainBlockedTerms = sourceHasPublicAdmin
      ? /(knapphetsskolen|politisk økologi|sahel|mali|ressursknapphet|miljødegradering)/i
      : (sourceHasSahelMali ? /(nav|offentlig forvaltning|velferdsstat|arbeidslinja|bakkebyråkrati|stat–kommune|stat-kommune)/i : null);
    if (domain === "institutional_media_history") {
      const explicitAhaSer = payload?.ahaSer && typeof payload.ahaSer === "object" ? payload.ahaSer : {};
      const sourceEntityName = extractMainInstitutionName(text);
      const isMorgenbladet = /\bmorgenbladet\b/i.test(text);
      const hasNicheTerms = /\bnisjeavis|kulturavis|kommentaravis\b/i.test(text);
      const entityName = sourceEntityName && sourceEntityName !== "institusjonen" ? sourceEntityName : (isMorgenbladet ? "Morgenbladet" : "Institusjonen");
      const hovedspenning = String(explicitAhaSer?.hovedspenning || "").trim();
      const kortSvar = String(explicitAhaSer?.kortSvar || payloadReflection || "").trim();
      const tema = String(explicitAhaSer?.tema || "").trim();
      const mediaConcepts = hasNicheTerms
        ? ["mediehistorie", "eierskap", "politisk profil", "kulturavis"]
        : ["mediehistorie", "eierskap", "politisk profil", "redaksjonell linje"];
      const spenningTitle = hovedspenning || "Autonomi og økonomiske rammer";
      const spenningSummary = hovedspenning
        ? `Teksten synliggjør spenningen ${hovedspenning.toLowerCase()}, og hvordan denne former institusjonens utvikling over tid.`
        : `Teksten synliggjør en varig spenning mellom redaksjonell autonomi og økonomiske rammer i ${entityName}.`;
      const rolleSummary = tema
        ? `${entityName} forstås gjennom ${tema.toLowerCase()}, med vekt på offentlig rolle og faglig profil over tid.`
        : (kortSvar || `${entityName} framstår som en medieinstitusjon der offentlig rolle, faglig profil og historisk utvikling må leses samlet.`);
      return [
        { title: isMorgenbladet ? "Morgenbladets institusjonelle omforming" : `${entityName}s institusjonelle omforming`, summary: pick("hovedinnsikt", String(explicitAhaSer?.viktigsteInnsikt || `${entityName} overlever gjennom institusjonell omforming i samspill mellom redaksjonell profil, eierskap og økonomi.`).trim()), concepts: mediaConcepts, candidate_type: "synthetic" },
        { title: spenningTitle, summary: spenningSummary, concepts: ["redaksjonell uavhengighet", "økonomisk avhengighet", "eierskap", "statsstøtte"], candidate_type: "synthetic" },
        { title: "Offentlig rolle og faglig profil", summary: rolleSummary, concepts: hasNicheTerms ? ["nisjeavis", "akademisk offentlighet", "kulturjournalistikk", "kvalitetsjournalistikk"] : ["offentlighet", "faglig profil", "medierolle", "institusjonell utvikling"], candidate_type: "synthetic" }
      ];
    }

    return [
      { title: "Hovedinnsikt", summary: pick("hovedinnsikt", domain === "literary_attachment" ? "Om våren gjør tilknytning til et eksistensielt og litterært nøkkelbegrep, ikke bare et psykologisk fagbegrep." : "Teksten argumenterer for en sammensatt faglig forklaring."), concepts: domain === "literary_attachment" ? ["Knausgård", "Om våren", "tilknytningsteori"] : ["problemstilling", "teori", "funn"], candidate_type: "synthetic" },
      { title: "Hovedargument", summary: pick("hovedargument", domain === "literary_attachment" ? "Romanen bekrefter deler av tilknytningsteorien, men viser også dens begrensninger gjennom skildringer av sårbarhet, sykdom, kropp, materialitet og uforklarlige vekstkrefter." : "Hovedargumentet underbygges gjennom tekstnær analyse og teoretisk sammenstilling."), concepts: domain === "literary_attachment" ? ["Bowlby", "autofiksjon", "sårbarhet"] : ["hovedargument", "metode", "analyse"], candidate_type: "synthetic" },
      { title: "Motargument/kritikk", summary: pick("motargument", domain === "literary_attachment" ? "En ren tilknytningsteoretisk lesning blir for smal fordi romanen åpner for mytologiske, autofiksjonelle og nymaterialistiske forklaringsnivåer." : "Alternative forklaringer tester hovedpåstanden og synliggjør begrensninger."), concepts: domain === "literary_attachment" ? ["nymaterialisme", "performativitet", "litteraturvitenskap"] : ["motargument", "kritikk", "alternativ forklaring"], candidate_type: "synthetic" },
      { title: "Spenning i teksten", summary: pick("spenning", domain === "literary_attachment" ? "Psykologisk tilknytningsteori står mot romanens bredere litterære utforskning av tilknytning, forknytning og løsrivelse." : "Spenningen står mellom konkurrerende faglige tolkningsnivåer."), concepts: domain === "literary_attachment" ? ["deiksis", "løsrivelse", "virkelighetslitteratur"] : ["spenning", "teori", "tolkning"], candidate_type: "synthetic" }
    ]
      .filter((card) => String(card?.summary || "").trim())
      .filter((card) => !isFragmentaryInsightCard(card))
      .filter((card) => {
        if (!domainBlockedTerms) return true;
        const body = `${card?.title || ""} ${card?.summary || ""} ${(Array.isArray(card?.concepts) ? card.concepts : []).join(" ")}`;
        return !domainBlockedTerms.test(body);
      });
  }



  function filterDomainInsightCards(cards, sourceText) {
    const list = Array.isArray(cards) ? cards : [];
    const src = String(sourceText || "");
    const sourceHasPublicAdmin = Boolean(detectPublicAdministrationReformSignal(src)?.strong);
    const sourceHasSahelMali = /(sahel|mali|politisk økologi|knapphetsskolen|ressursknapphet|miljødegradering)/i.test(src);
    const blocked = sourceHasPublicAdmin
      ? /(sahel|mali|knapphetsskolen|politisk økologi|ressursknapphet|miljødegradering|miljøsikkerhet|klima og miljø kan være bakgrunnsfaktorer|konfliktutvikling|marginalisering av pastoralister|environmental security|makt- og produksjonsforhold)/i
      : (sourceHasSahelMali ? /(nav|nav-reformen|nav-kontorene|offentlig forvaltning|velferdsstat|arbeidslinja|bakkebyråkrati|stat–kommune|stat-kommune|arbeidsrettet oppfølging|kommunale målsetninger)/i : null);
    if (!blocked) return list;
    return list.filter((card) => {
      const body = `${card?.title || ""} ${card?.summary || ""} ${(Array.isArray(card?.concepts) ? card.concepts : []).join(" ")}`;
      return !blocked.test(body);
    });
  }


  const knowledgeView = chatModule("knowledgeView", "AHAChatKnowledgeView")?.create?.({
    subjectId: SUBJECT_ID,
    loadChamberFromStorage,
    getThemeId,
    out,
    currentInsights,
    filterConceptLabels,
    canonicalizeDisplayConcept,
    escHtml,
    resolveActiveAnalysisContext,
    extractAcademicPhraseConcepts,
    extractAcademicTheoryLinks,
    prioritizeVisibleConceptEdges,
    isGenericDisplayConcept,
    normalizeConceptSurface,
    normalizeVisibleAcademicLabel,
    normalizeAfterworkConcept,
    applyPhraseConceptDisplayPreference,
    detectPublicAdministrationReformSignal,
    buildConceptEdgeContext,
    collectTheoryNodeLabels,
    readLatestAcademicContext,
    detectAutoAnalysisDomain,
    renderAuxPanel,
    renderPanel
  });
  if (!knowledgeView) throw new Error("AHAChatKnowledgeView må lastes før ahaChat.js.");

  function showStatus() {
    return knowledgeView.showStatus();
  }

  function normalizeConceptKey(value) {
    return knowledgeView.normalizeConceptKey(value);
  }

  function getCanonicalConceptLabel(value) {
    return knowledgeView.getCanonicalConceptLabel(value);
  }

  function isBlockedStandaloneConcept(value) {
    return knowledgeView.isBlockedStandaloneConcept(value);
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

  function normalizeAcademicCandidateText(value) {
    return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  }

  function academicCandidateInSource(sourceText, term) {
    const haystack = normalizeAcademicCandidateText(cleanArticleText(sourceText));
    const needle = normalizeAcademicCandidateText(term);
    if (!haystack || !needle) return false;
    return ` ${haystack} `.includes(` ${needle} `);
  }

  function buildAcademicConceptCandidates(sourceText = "", payload = {}) {
    const fromPayload = []
      .concat(Array.isArray(payload?.concepts) ? payload.concepts : [])
      .concat(Array.isArray(payload?.keywords) ? payload.keywords : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const sourceBoundSubjectTerms = []
      .concat(Array.isArray(payload?.subjectMatches) ? payload.subjectMatches : [])
      .concat(Array.isArray(payload?.subjectLinks) ? payload.subjectLinks : [])
      .flatMap((match) => Array.isArray(match?.matched_terms) ? match.matched_terms : [])
      .map((item) => String(item || "").trim())
      .filter((term) => term && academicCandidateInSource(sourceText, term));
    const phraseConcepts = typeof extractAcademicPhraseConcepts === "function" ? extractAcademicPhraseConcepts(sourceText).slice(0, 12) : [];
    const candidates = [
      "Pinse", "pentekosté", "Den hellige ånd", "tungetale", "nådegave", "tydning", "apostlene", "Babels tårn", "kirkens fødselsdag", "gregoriansk kalender", "juliansk kalender", "treenighetssøndag"
    ];
    const lexiconHits = candidates.filter((term) => academicCandidateInSource(sourceText, term));
    return Array.from(new Set(sourceBoundSubjectTerms.concat(fromPayload, phraseConcepts, lexiconHits))).slice(0, 20);
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
  global.AHATestHooks = Object.assign({}, global.AHATestHooks || {}, { detectTextType, buildCanonicalAnalysis, buildAhaAnalysisExportBundle, formatAhaAnalysisExportMarkdown, buildAutoOutputs, renderAutoOutputs, detectAutoAnalysisDomain, buildAcademicConceptCandidates, buildSourceGroundedAcademicPayload, applyRuntimeKnowledgePolicy, isTransientAnalysisDocument, AHA_RUNTIME_KNOWLEDGE_POLICY, normalizeFagkoblinger, resolveCanonicalAnalysisWithOptionalPythonEngine, isAhaMemoryQuestion, buildAhaLearningContractReply, buildAhaMemoryStatus, shouldUseAhaMemory, buildAhaMemoryContext, buildAhaMemoryOffContext, loadAhaMemoryControls, saveAhaMemoryControls, setAhaMemoryControl, isAhaSavingEnabled, isAhaMemoryUseEnabled, loadAhaMemoryExclusions, saveAhaMemoryExclusions, getAhaMemoryInsightStableKey, getAhaMemoryInsightKey, isAhaMemoryInsightExcluded, excludeAhaMemoryInsight, includeAhaMemoryInsight, resetAhaMemoryExclusions, getAhaExcludedMemoryItems, renderAhaMemoryControls, bindAhaMemoryControls, submitAhaChatMessage, findRelevantLocalMemory, formatAhaMemoryContextForAgent, isAhaMemoryDebugEnabled, buildAhaMemoryTransparency, formatAhaMemoryTransparencyDetails, renderAhaMemoryTransparency, appendChat, updateAnswerActionsVisibility, getActiveMetaAiSession, startMetaAiSession, renderMetaAiSessionBox, renderMetaAiClaims, maybeHandleMetaAiAgentReply, saveMetaAiClaimFeedback, buildAhaPersonalAiLoopChatReadinessStatus, renderAhaPersonalAiLoopStatus, buildAhaAnswerPackage, renderAhaAnswerComposer, createAnalysisRun, bindAnalysisArtifact, artifactMatchesActiveRun, clearActiveAnalysisState, renderAutoOutputPayload, enforceCanonicalSourceGrounding, filterRetrievalForActiveSource, scoreRetrievalAgainstSource, filterMemoryContextForActiveSource, isActiveAnalysisRun });

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
