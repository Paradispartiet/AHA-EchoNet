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

  const memoryControls = global.AHAChatMemoryControls?.create?.({
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

  const afterwork = global.AHAChatAfterwork?.create?.({
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

  const memoryRuntime = global.AHAChatMemoryRuntime?.create?.({
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

  const runContext = global.AHAChatRunContext?.create?.({
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

  const insightView = global.AHAChatInsightView?.create?.({
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

  const autoAnalysis = global.AHAChatAutoAnalysis?.create?.({
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

  const autoOutputView = global.AHAChatAutoOutputView?.create?.({
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

  const canonicalAnalysis = global.AHAChatCanonicalAnalysis?.create?.({
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
      if (!raw) return global.InsightsEngine.createEmptyChamber();
      return JSON.parse(raw);
    } catch (e) {
      console.warn("Kunne ikke laste innsiktskammer, lager nytt.", e);
      return global.InsightsEngine.createEmptyChamber();
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

  function getAhaPersonalContextApi() {
    return global.AHAChatPersonalContext && typeof global.AHAChatPersonalContext === "object"
      ? global.AHAChatPersonalContext
      : null;
  }

  function buildAhaPersonalMessageContext(userText) {
    const api = getAhaPersonalContextApi();
    if (!api || typeof api.buildMessageContext !== "function") return null;
    try {
      return api.buildMessageContext(userText, { maxLength: 900 });
    } catch (err) {
      console.warn("AHA personlig kontekst kunne ikke bygges", err);
      return null;
    }
  }

  function buildAhaAnswerPackage(userText) {
    const api = global.AHAPersonalAnswerComposer;
    if (!api || typeof api.buildAnswerPackage !== "function") return null;
    try { return api.buildAnswerPackage(userText, { maxLength: 2200 }); }
    catch (err) { console.warn("AHA Answer Composer kunne ikke bygge svargrunnlag", err); return null; }
  }

  function renderAhaAnswerComposer(answerPackage) {
    const status = document.getElementById("aha-answer-composer-status");
    const details = document.getElementById("aha-answer-composer-details");
    if (!status || !details) return;
    const pack = answerPackage && typeof answerPackage === "object" ? answerPackage : null;
    if (!pack) {
      status.textContent = "AHA Answer Composer er ikke tilgjengelig for denne meldingen.";
      details.innerHTML = "";
      return;
    }
    const st = pack.status || {};
    const retrievalMode = pack.context?.retrieval?.mode || (st.hasSemanticRetrieval ? "hybrid" : (st.hasRetrieval ? "lexical" : "none"));
    status.textContent = `AHA Answer Composer aktiv · intent: ${st.intent || "unknown"} · kilder: ${Number(st.selectedSourceCount) || 0} · retrieval mode: ${retrievalMode} · semantic available: ${st.hasSemanticRetrieval ? "ja" : "nei"} · ready: ${st.ready ? "ja" : "nei"}.`;
    const sources = Array.isArray(pack.context?.selectedSources) ? pack.context.selectedSources : [];
    const sections = Array.isArray(pack.context?.answerPlan?.sections) ? pack.context.answerPlan.sections.join(", ") : "kort svar, neste steg";
    details.innerHTML = `
      <article class="aha-personal-retrieval-result">
        <strong>Answer plan</strong>
        <span>${escHtml(pack.context?.answerPlan?.responseMode || "direct_answer")} · ${escHtml(sections)}</span>
        <small>${escHtml(pack.localPreview?.summary || "Lokal preview ikke tilgjengelig.")}</small>
      </article>
      ${sources.slice(0, 5).map((item) => `
        <article class="aha-personal-retrieval-result">
          <strong>${escHtml(item.title || item.source)}</strong>
          <span>${escHtml(item.sourceType || item.source)} · lexicalScore ${Number(item.lexicalScore) || 0} · semanticScore ${Number(item.semanticScore) || 0} · hybridScore ${Number(item.hybridScore) || 0}</span>
          <small>${escHtml((item.reasons || []).slice(0, 4).join(" · "))}</small>
        </article>
      `).join("")}
    `;
  }


  function renderAhaAnswerEvaluation(row, evaluation) {
    const panelStatus = document.getElementById("aha-answer-evaluation-status");
    if (panelStatus && evaluation) {
      panelStatus.textContent = `Svar-evaluering aktiv · score ${Number(evaluation.score) || 0}/100 · status ${evaluation.status || "unknown"} · training suggestion: ${evaluation.trainingSuggestion?.shouldCreateExample ? "ja" : "nei"}.`;
    }
    if (!row || !evaluation) return;
    const wrap = document.createElement("section");
    wrap.className = "aha-answer-evaluation";
    const dims = evaluation.dimensions || {};
    const used = Array.isArray(evaluation.sourceUse?.usedSources) ? evaluation.sourceUse.usedSources : [];
    const suggestions = Array.isArray(evaluation.improvementSuggestions) ? evaluation.improvementSuggestions : [];
    wrap.innerHTML = `
      <strong>AHA svar-evaluering</strong>
      <span>Score ${Number(evaluation.score) || 0}/100 · status ${escHtml(evaluation.status || "unknown")} · intent ${Number(dims.intentAlignment?.score) || 0} · source grounding ${Number(dims.sourceGrounding?.score) || 0} · personal relevance ${Number(dims.personalRelevance?.score) || 0} · next step ${Number(dims.nextStep?.score) || 0}</span>
      <details><summary>Svar-evaluering</summary>
        <div>Dimensjoner: intent ${Number(dims.intentAlignment?.score) || 0}, kilder ${Number(dims.sourceGrounding?.score) || 0}, personlig relevans ${Number(dims.personalRelevance?.score) || 0}, transparens ${Number(dims.transparency?.score) || 0}, neste steg ${Number(dims.nextStep?.score) || 0}.</div>
        <div>Kilder brukt: ${used.length ? used.map((s) => escHtml(s.title || s.sourceId || s.source)).join(" · ") : "Ingen tydelig kildebruk funnet."}</div>
        <ul>${suggestions.slice(0,5).map((x) => `<li>${escHtml(x)}</li>`).join("")}</ul>
        ${evaluation.trainingSuggestion?.shouldCreateExample ? `<button type="button" data-save-training-example="1">Lagre som training example</button> <a href="training.html">Åpne training.html</a>` : `<small>${escHtml(evaluation.trainingSuggestion?.reason || "Ingen training suggestion.")}</small>`}
      </details>`;
    const btn = wrap.querySelector('[data-save-training-example="1"]');
    btn?.addEventListener("click", () => {
      const api = global.AHATrainingExamples;
      const draft = evaluation.trainingSuggestion?.draftExample;
      if (api?.addExample && draft) {
        api.addExample({ ...draft, status: "needs_review" });
        btn.textContent = "Lagret som training example";
        btn.disabled = true;
      }
    });
    row.appendChild(wrap);
  }

  function evaluateAhaAnswerForChat(userMessage, answerText, answerPackage, row) {
    const api = global.AHAPersonalAnswerEvaluation;
    if (!api?.evaluateAnswer) return null;
    try {
      const activeRun = getActiveAnalysisRun();
      const evaluation = bindAnalysisArtifact(api.evaluateAnswer(userMessage, answerText, answerPackage), activeRun);
      const saved = api.saveEvaluation ? bindAnalysisArtifact(api.saveEvaluation(evaluation), activeRun) : evaluation;
      renderAhaAnswerEvaluation(row, saved);
      return saved;
    } catch (err) {
      console.warn("AHA svar-evaluering feilet", err);
      return null;
    }
  }

  function renderAhaPersonalContextStatus(statusArg = null) {
    const host = document.getElementById("aha-personal-context-status");
    if (!host) return null;
    const api = getAhaPersonalContextApi();
    if (!api || typeof api.getPersonalContextStatus !== "function") {
      host.textContent = "Personlig kontekst er ikke tilgjengelig ennå.";
      return null;
    }
    let status = statusArg;
    try { status = status || api.getPersonalContextStatus(); } catch { status = null; }
    if (!status) {
      host.textContent = "Personlig kontekst kunne ikke leses akkurat nå.";
      return null;
    }
    const active = status.available ? "AHA personlig kontekst aktiv" : "AHA personlig kontekst klar, men trenger mer godkjent materiale";
    const retrieval = status.retrievalAvailable ? ` Personlig søk aktiv (${Number(status.indexedItems) || 0} indeksert).` : "";
    const semantic = status.semanticRetrievalAvailable ? ` Semantisk søk aktiv (${Number(status.semanticIndexedItems) || 0} indeksert, ${status.semanticVectorModel || "local_semantic_v1"}). Retrieval mode: ${status.retrievalMode || "hybrid"}.` : "";
    host.textContent = `${active}. Readiness: ${status.readinessLevel || "ukjent"} (${Number(status.readinessScore) || 0}/100). Bekreftet selvinnsikt: ${Number(status.confirmedClaims) || 0}. Godkjent corpus: ${Number(status.approvedCorpus) || 0}. Godkjente examples: ${Number(status.approvedExamples) || 0}.${retrieval}${semantic}`;
    return status;
  }

  function renderAhaPersonalRetrieval(retrieval) {
    const status = document.getElementById("aha-personal-retrieval-status");
    const results = document.getElementById("aha-personal-retrieval-results");
    if (!status || !results) return;
    const hits = Array.isArray(retrieval?.results) ? retrieval.results : [];
    status.textContent = retrieval
      ? `Personlig søk aktiv. Semantisk søk ${retrieval.semanticAvailable ? "aktiv" : "ikke aktiv"}. Mode: ${retrieval.mode || "lexical"}. Query: «${retrieval.query || ""}». ${hits.length} relevante treff.`
      : "Personlig søk er ikke tilgjengelig for denne meldingen.";
    results.innerHTML = hits.slice(0, 3).map((item) => `
      <article class="aha-personal-retrieval-result">
        <strong>${escHtml(item.title || item.source)}</strong>
        <span>${escHtml(item.source)} · lexicalScore ${Number(item.lexicalScore ?? item.score) || 0} · semanticScore ${Number(item.semanticScore) || 0} · hybridScore ${Number(item.hybridScore) || 0}</span>
        <small>${escHtml((item.reasons || []).slice(0, 4).join(" · "))}</small>
      </article>
    `).join("");
  }


  const AHA_CHAT_READINESS_LABELS = {
    ready: "Ready",
    partially_ready: "Partially ready",
    blocked: "Blocked",
    unknown: "Unknown"
  };

  function compactAhaChatReadinessText(value, fallback) {
    const text = String(value || fallback || "")
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[redacted]")
      .replace(/\b(?:sk|pk|ghp)_[A-Za-z0-9_\-]{6,}\b/gi, "[redacted]")
      .replace(/\b(?:api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi, "credential [redacted]")
      .replace(/\b(?:api[_-]?key|token|secret)\b/gi, "credential")
      .replace(/\s+/g, " ")
      .trim();
    return (text || String(fallback || "Manual review required.")).slice(0, 120);
  }

  function compactAhaChatReadinessList(items) {
    const seen = new Set();
    return (Array.isArray(items) ? items : [])
      .map((item) => compactAhaChatReadinessText(typeof item === "string" ? item : item?.title, "Review status"))
      .filter((item) => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
      })
      .slice(0, 3);
  }

  function failClosedAhaChatReadinessStatus(message) {
    return {
      state: "unknown",
      label: AHA_CHAT_READINESS_LABELS.unknown,
      message: compactAhaChatReadinessText(message, "Cached readiness is missing or invalid."),
      blockerCount: 0,
      warningCount: 0,
      topBlockers: [],
      topWarnings: [],
      operatorNextStep: "Manual audit/review required in Training Dashboard.",
      source: "cached_audit_summary",
      compactOnly: true,
      redacted: true,
      requiresManualReview: true
    };
  }

  function buildAhaPersonalAiLoopChatReadinessStatus(cachedSummaryOrAuditResult) {
    if (!cachedSummaryOrAuditResult || typeof cachedSummaryOrAuditResult !== "object" || Array.isArray(cachedSummaryOrAuditResult)) {
      return failClosedAhaChatReadinessStatus("Cached readiness is missing or invalid.");
    }

    const compact = cachedSummaryOrAuditResult.compactOperatorRecommendationSummary
      || cachedSummaryOrAuditResult.operatorRecommendationSummary
      || (global.AHAPersonalAiLoopAudit?.["buildCompact" + "OperatorRecommendationSummary"]
        ? global.AHAPersonalAiLoopAudit["buildCompact" + "OperatorRecommendationSummary"](cachedSummaryOrAuditResult)
        : null);
    const counts = compact && typeof compact === "object" ? (compact.countsBySeverity || {}) : {};
    const blockerCount = Math.max(0, Number(counts.blocker || cachedSummaryOrAuditResult.blockerCount || 0) || 0);
    const warningCount = Math.max(0, Number(counts.warning || cachedSummaryOrAuditResult.warningCount || 0) || 0);
    const topBlockerWarningTitles = compactAhaChatReadinessList(compact?.topBlockerWarningTitles);
    const topBlockers = compactAhaChatReadinessList(cachedSummaryOrAuditResult.topBlockers || compact?.topBlockers)
      .concat(topBlockerWarningTitles.slice(0, blockerCount ? 3 : 0))
      .slice(0, 3);
    const topWarnings = compactAhaChatReadinessList(cachedSummaryOrAuditResult.topWarnings || compact?.topWarnings)
      .concat(topBlockerWarningTitles.slice(blockerCount ? 0 : 0, warningCount ? 3 : 0))
      .slice(0, 3);
    const approved = cachedSummaryOrAuditResult.checks?.approvedMaterial || cachedSummaryOrAuditResult.approvedMaterial || {};
    const approvedMaterialCount = (Number(approved.approvedCorpus) || 0)
      + (Number(approved.approvedExamples) || 0)
      + (Number(approved.confirmedClaims) || 0)
      + (Number(approved.importantClaims) || 0);
    const compactAvailable = Boolean(compact && typeof compact === "object" && compact.compactOnly === true && compact.redacted === true);
    const auditStatus = String(cachedSummaryOrAuditResult.status || compact?.status || "").trim();

    let state = "unknown";
    if (blockerCount > 0) state = "blocked";
    else if (!compactAvailable || !approvedMaterialCount) state = "unknown";
    else if (warningCount > 0) state = "partially_ready";
    else if (["working", "strong", "ready"].includes(auditStatus) || cachedSummaryOrAuditResult.ready === true) state = "ready";
    else state = "partially_ready";

    const needsManual = state !== "ready";
    const message = state === "ready"
      ? "Personal AI Loop has compact cached readiness for Chat."
      : state === "partially_ready"
        ? "Personal AI Loop has warnings that need manual review."
        : state === "blocked"
          ? "Personal AI Loop has blockers that prevent Chat readiness."
          : "Personal AI Loop readiness cannot be confirmed from cache.";

    return {
      state,
      label: AHA_CHAT_READINESS_LABELS[state] || AHA_CHAT_READINESS_LABELS.unknown,
      message,
      blockerCount,
      warningCount,
      topBlockers: blockerCount ? (topBlockers.length ? topBlockers : ["Review blockers manually"]) : [],
      topWarnings: warningCount ? (topWarnings.length ? topWarnings : ["Review warnings manually"]) : [],
      operatorNextStep: compactAhaChatReadinessText(compact?.operatorNextStep || cachedSummaryOrAuditResult.operatorNextStep, "Manual audit/review required in Training Dashboard."),
      source: "cached_audit_summary",
      compactOnly: true,
      redacted: true,
      requiresManualReview: needsManual
    };
  }

  function renderAhaPersonalAiLoopStatus() {
    const host = document.getElementById("aha-personal-ai-loop-status");
    if (!host) return null;
    const api = global.AHAPersonalAiLoopAudit;
    let audit = null;
    if (api?.loadLastAudit) {
      try { audit = api.loadLastAudit(); } catch {}
    }
    const status = buildAhaPersonalAiLoopChatReadinessStatus(audit);
    const manual = status.requiresManualReview ? " Manual audit/review required." : "";
    const blockers = status.topBlockers.length ? ` Blockers: ${status.topBlockers.join(" · ")}.` : "";
    const warnings = status.topWarnings.length ? ` Warnings: ${status.topWarnings.join(" · ")}.` : "";
    host.textContent = `Chat readiness: ${status.label}. ${status.message} Blockers: ${status.blockerCount}. Warnings: ${status.warningCount}. Next step: ${status.operatorNextStep}.${manual}${blockers}${warnings}`;
    return status;
  }


  function renderAhaMemoryTransparency(row, memoryContext) {
    if (!row || !memoryContext) return null;
    const transparency = buildAhaMemoryTransparency(memoryContext);
    if (!transparency.visible) return null;

    const details = document.createElement("details");
    details.className = `memory-transparency${transparency.used ? "" : " memory-transparency-debug"}`;

    const summary = document.createElement("summary");
    summary.textContent = `${transparency.label} · ${transparency.used ? "Vis" : "Vis grunn"}`;
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "memory-transparency-details";

    if (!transparency.used) {
      const title = document.createElement("p");
      title.className = "memory-transparency-meta";
      title.textContent = "Minne ikke brukt";
      body.appendChild(title);
    }

    const meta = document.createElement("dl");
    meta.className = "memory-transparency-meta";
    [
      ["Grunn", transparency.reason || "Ukjent"],
      ["Modus", transparency.mode || "off"],
      ["Sikkerhet", Number(transparency.confidence || 0).toFixed(2)]
    ].forEach(([term, value]) => {
      const dt = document.createElement("dt");
      dt.textContent = term;
      const dd = document.createElement("dd");
      dd.textContent = value;
      meta.appendChild(dt);
      meta.appendChild(dd);
    });
    body.appendChild(meta);

    if (transparency.used && transparency.selectedInsights.length) {
      const listLabel = document.createElement("p");
      listLabel.className = "memory-transparency-list-label";
      listLabel.textContent = "Innsikter brukt:";
      body.appendChild(listLabel);

      const list = document.createElement("ol");
      list.className = "memory-transparency-list";
      transparency.selectedInsights.forEach((insight) => {
        const item = document.createElement("li");
        item.className = "memory-transparency-insight";
        const title = document.createElement("strong");
        title.textContent = insight.title;
        item.appendChild(title);
        if (insight.summary) {
          const summaryText = document.createElement("p");
          summaryText.textContent = insight.summary;
          item.appendChild(summaryText);
        }
        if (insight.concepts?.length) {
          const concepts = document.createElement("span");
          concepts.className = "memory-transparency-concepts";
          concepts.textContent = `Begreper: ${insight.concepts.join(", ")}`;
          item.appendChild(concepts);
        }
        const actions = document.createElement("div");
        actions.className = "memory-transparency-actions";
        if (insight.id) {
          const openBtn = document.createElement("button");
          openBtn.type = "button";
          openBtn.className = "memory-transparency-action";
          openBtn.textContent = "Åpne";
          openBtn.addEventListener("click", () => {
            showInsights();
            setStatusNote(`Viser innsiktspanel for ${insight.title}.`);
          });
          actions.appendChild(openBtn);
        }
        const excludeBtn = document.createElement("button");
        excludeBtn.type = "button";
        excludeBtn.className = "memory-transparency-action memory-transparency-exclude";
        excludeBtn.textContent = insight.excluded ? "Ekskludert fra fremtidig minnebruk" : "Ikke bruk igjen";
        excludeBtn.disabled = Boolean(insight.excluded);
        excludeBtn.addEventListener("click", () => {
          excludeAhaMemoryInsight(insight, "memory_transparency");
          insight.excluded = true;
          excludeBtn.textContent = "Ekskludert fra fremtidig minnebruk";
          excludeBtn.disabled = true;
          item.classList?.add?.("memory-transparency-insight-excluded");
          setStatusNote("Innsikten er fjernet fra fremtidig minnebruk.");
        });
        actions.appendChild(excludeBtn);
        item.appendChild(actions);
        if (insight.excluded) item.classList?.add?.("memory-transparency-insight-excluded");
        list.appendChild(item);
      });
      body.appendChild(list);
    }

    details.appendChild(body);
    row.appendChild(details);
    return details;
  }


  function escHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderAhaMemoryStatus(status) {
    const el = document.getElementById("aha-memory-status");
    if (!el) return;
    if (!status || typeof status !== "object") {
      el.textContent = "Minne kunne ikke leses akkurat nå.";
      return;
    }
    const local = status.local || {};
    const controls = normalizeAhaMemoryControls(status.controls || loadAhaMemoryControls());
    const savedCount = Number(local.activeInsights || 0);
    const savedAt = local.lastLocalSave ? formatAhaMemoryTimestamp(local.lastLocalSave) : "";
    const embeddingCode = String(status.embedding?.status || status.embedding?.reason || "");
    const backendWarning = embeddingCode === "backend_unreachable"
      ? `<span class="memory-warning">Backend utilgjengelig – semantisk minne kan være begrenset.</span>`
      : "";
    el.innerHTML = `
      <span><strong>Lokalt minne aktivt</strong></span>
      <span>${escHtml(String(savedCount))} innsikt${savedCount === 1 ? "" : "er"} lagret</span>
      ${savedAt ? `<span><strong>Siste lagring:</strong> ${escHtml(savedAt)}</span>` : ""}
      <span><strong>Lagring:</strong> ${controls.saveNewInsights ? "på" : "av"}</span>
      ${backendWarning}
    `;
  }

  function renderAhaMemoryControls(controls = loadAhaMemoryControls()) {
    const host = document.getElementById("aha-memory-controls");
    if (!host) return null;
    const current = normalizeAhaMemoryControls(controls);
    const excludedItems = getAhaExcludedMemoryItems();
    const exclusionCount = excludedItems.length;
    const visibleItems = excludedItems.slice(0, 20);
    const exclusionMarkup = visibleItems.length
      ? `<div class="aha-memory-exclusions-list">${visibleItems.map((item) => `
          <div class="aha-memory-exclusion-item">
            <div class="aha-memory-exclusion-copy">
              <div class="aha-memory-exclusion-title">${escHtml(item.title)}</div>
              <div class="aha-memory-exclusion-summary">${escHtml(item.summary || "Ingen sammendragstekst.")}</div>
              <div class="aha-memory-exclusion-meta">${item.foundInChamber ? "Funnet i innsiktskammer" : "Kun lokal nøkkel"}</div>
            </div>
            <div class="aha-memory-exclusion-actions">
              <button type="button" class="aha-memory-exclusion-btn" data-aha-memory-exclusion-action="include" data-aha-memory-exclusion-type="${escHtml(item.type)}" data-aha-memory-exclusion-value="${escHtml(item.value)}">Bruk igjen</button>
            </div>
          </div>
        `).join("")}</div>`
      : `<p class="aha-memory-exclusions-empty">Ingen innsikter er ekskludert fra minnebruk.</p>`;
    const overflowMarkup = excludedItems.length > visibleItems.length
      ? `<p class="aha-memory-exclusion-meta">Viser 20 av ${escHtml(String(excludedItems.length))} ekskluderte innsikter.</p>`
      : "";
    host.innerHTML = `
      <details class="aha-memory-controls-panel">
        <summary>Minnestyring</summary>
        <div class="aha-memory-controls-body">
          <label><input type="checkbox" data-aha-memory-control="saveNewInsights" ${current.saveNewInsights ? "checked" : ""}> Lagre nye innsikter fra chat</label>
          <label><input type="checkbox" data-aha-memory-control="useExistingMemory" ${current.useExistingMemory ? "checked" : ""}> Bruk relevant AHA-minne i svar</label>
          <div class="aha-memory-controls-status" aria-live="polite">
            <span><strong>Lagring:</strong> ${current.saveNewInsights ? "på" : "av"}</span>
            <span><strong>Minnebruk:</strong> ${current.useExistingMemory ? "på" : "av"}</span>
            <span><strong>Ekskluderte innsikter:</strong> ${escHtml(String(exclusionCount))}</span>
          </div>
          <details class="aha-memory-exclusions">
            <summary>Ekskluderte innsikter (${escHtml(String(exclusionCount))})</summary>
            <div class="aha-memory-exclusions-body">
              ${exclusionMarkup}
              ${overflowMarkup}
              <button type="button" class="aha-memory-exclusion-btn aha-memory-exclusion-reset" data-aha-memory-exclusion-action="reset" ${exclusionCount ? "" : "disabled"}>Nullstill ekskluderinger</button>
            </div>
          </details>
        </div>
      </details>
    `;
    return current;
  }

  function bindAhaMemoryControls() {
    const host = document.getElementById("aha-memory-controls");
    if (!host) return;
    renderAhaMemoryControls();
    host.addEventListener("change", (event) => {
      const input = event?.target;
      const key = input?.getAttribute?.("data-aha-memory-control");
      if (!key) return;
      const next = setAhaMemoryControl(key, Boolean(input.checked));
      renderAhaMemoryControls(next);
      setStatusNote(`Minnestyring oppdatert: lagring ${next.saveNewInsights ? "på" : "av"}, minnebruk ${next.useExistingMemory ? "på" : "av"}.`);
    });
    host.addEventListener("click", (event) => {
      const button = event?.target?.closest?.("[data-aha-memory-exclusion-action]") || event?.target;
      const action = button?.getAttribute?.("data-aha-memory-exclusion-action");
      if (!action) return;
      if (action === "include") {
        const value = button.getAttribute("data-aha-memory-exclusion-value") || "";
        includeAhaMemoryInsight(value);
        renderAhaMemoryControls();
        void updateAhaMemoryStatus();
        setStatusNote("Innsikten kan nå brukes som minne igjen.");
        return;
      }
      if (action === "reset") {
        resetAhaMemoryExclusions();
        renderAhaMemoryControls();
        void updateAhaMemoryStatus();
        setStatusNote("Alle minne-ekskluderinger er nullstilt.");
      }
    });
  }

  async function updateAhaMemoryStatus() {
    const el = document.getElementById("aha-memory-status");
    if (el) el.textContent = "Leser minnestatus …";
    try {
      const status = await buildAhaMemoryStatus();
      renderAhaMemoryStatus(status);
      return status;
    } catch (err) {
      console.warn("Minnestatus kunne ikke leses", err);
      if (el) el.textContent = "Minnestatus kunne ikke leses akkurat nå.";
      return null;
    }
  }

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
    const active = typeof global.InsightsEngine.getActiveInsights === "function"
      ? global.InsightsEngine.getActiveInsights(chamber)
      : (chamber?.insights || []);
    return active.filter(
      (ins) => ins.subject_id === SUBJECT_ID && ins.theme_id === getThemeId()
    );
  }

  function renderPanel(html) {
    const panel = document.getElementById("panel");
    if (panel) panel.innerHTML = html;
  }


  function buildAhaAgentUrl(path) {
    const rawBase = String(global.AHA_AGENT_API || "").trim();
    if (!rawBase) return "";

    const base = rawBase.replace(/\/+$/, "");
    const normalizedPath = `/${String(path || "").trim().replace(/^\/+/, "")}`;
    const hasApiBase = /\/api\/aha-agent$/i.test(base);
    const rootBase = hasApiBase ? base : `${base}/api/aha-agent`;
    return `${rootBase}${normalizedPath}`;
  }

  async function generateAIInsightCandidates(text, context) {
    const raw = String(text || "").trim();
    if (!raw) return [];
    const insightCandidatesUrl = buildAhaAgentUrl("insight-candidates");
    if (!insightCandidatesUrl) return [];

    const body = {
      text: raw,
      context: context || {},
      format: "insight_candidates_v1"
    };

    try {
      const res = await fetch(insightCandidatesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) return [];
      const data = await res.json();
      const candidates = Array.isArray(data?.candidates) ? data.candidates : (Array.isArray(data) ? data : []);
      return candidates
        .map((candidate) => normalizeInsightCandidate(candidate))
        .filter(Boolean)
        .filter((candidate) => !isWeakInsightCandidate(candidate, raw))
        .slice(0, 5);
    } catch (err) {
      console.warn("AI insight-candidates utilgjengelig", err);
      return [];
    }
  }

  function normalizeInsightCandidate(candidate) {
    if (!candidate || typeof candidate !== "object") return null;
    const text = String(candidate.text || candidate.summary || "").replace(/\s+/g, " ").trim();
    if (!text) return null;
    const summary = String(candidate.summary || text).replace(/\s+/g, " ").trim();
    const title = String(candidate.title || summary.split(/[.!?…]/)[0] || "Innsikt").trim().slice(0, 120);
    if (!title || !summary) return null;

    const concepts = filterConceptLabels(normalizeCandidateConcepts(candidate.concepts || [], text)).slice(0, 8);
    const thinkers = normalizeSimpleStringList(candidate.thinkers, 5);
    const theories = normalizeSimpleStringList(candidate.theories, 5);
    const traditions = normalizeSimpleStringList(candidate.traditions, 5);
    const theoreticalLinks = normalizeTheoreticalLinks(candidate.theoretical_links, 5);

    return {
      title,
      summary: summary.length > 320 ? `${summary.slice(0, 317)}…` : summary,
      text,
      functional_type: normalizeFunctionalType(candidate.functional_type),
      concepts,
      thinkers,
      theories,
      traditions,
      theoretical_links: theoreticalLinks,
      candidate_type: "ai"
    };
  }

  function isWeakInsightCandidate(candidate, sourceText) {
    if (!candidate || typeof candidate !== "object") return true;

    const title = String(candidate.title || "").replace(/\s+/g, " ").trim();
    const titleLower = title.toLowerCase();
    const genericTitles = new Set(["observasjon", "innsikt", "analyse"]);

    const summary = String(candidate.summary || candidate.text || "").replace(/\s+/g, " ").trim();
    const summaryLower = summary.toLowerCase();
    const source = String(sourceText || "").replace(/\s+/g, " ").trim();
    const sourceLower = source.toLowerCase();
    const sourceStart = sourceLower.slice(0, 220);

    const concepts = Array.isArray(candidate.concepts) ? candidate.concepts : [];
    const conceptWords = concepts
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean);
    const nonWeakConcepts = conceptWords.filter((word) => !WEAK_CONCEPT_WORDS.has(word));
    const hasTheory = Boolean(
      (Array.isArray(candidate.thinkers) && candidate.thinkers.length) ||
      (Array.isArray(candidate.theories) && candidate.theories.length) ||
      (Array.isArray(candidate.traditions) && candidate.traditions.length) ||
      (Array.isArray(candidate.theoretical_links) && candidate.theoretical_links.length)
    );

    if (!title || genericTitles.has(titleLower)) return true;
    if (!summary) return true;
    if (sourceStart && (summaryLower === sourceStart || sourceStart.startsWith(summaryLower) || summaryLower.startsWith(sourceStart))) return true;
    if (sourceStart && summaryLower.slice(0, 140) === sourceStart.slice(0, 140)) return true;
    if (!conceptWords.length && !hasTheory) return true;
    if (conceptWords.length > 0 && nonWeakConcepts.length === 0 && !hasTheory) return true;

    return false;
  }

  function ingestUserMessageWithCandidates(messageText, candidates) {
    const text = String(messageText || "").trim();
    if (!text || !global.InsightsEngine) return 0;

    const themeId = getThemeId();
    const fieldId = getFieldId();
    const localCandidates = buildSemanticInsightCandidates(text, { minInsights: 1, maxInsights: 5 });
    const chunks = Array.isArray(candidates) && candidates.length ? candidates : localCandidates;

    if (global.AHAIngest && typeof global.AHAIngest.ingest === "function") {
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
      if (typeof global.AHAIngest.ingestWithCandidates === "function") {
        global.AHAIngest.ingestWithCandidates(payload, chunks);
      } else {
        chunks.forEach((chunk) => global.AHAIngest.ingest(Object.assign({}, payload, { text: chunk })));
      }
      return chunks.length;
    }

    // Fallback hvis AHAIngest ikke er lastet: skriv direkte til motoren
    // og logg source event manuelt slik vi alltid har gjort.
    let chamber = loadChamberFromStorage();
    chunks.forEach((chunk) => {
      const text = typeof chunk === "string" ? chunk : String(chunk?.text || chunk?.summary || chunk?.title || "").trim();
      if (!text) return;
      const signal = global.InsightsEngine.createSignalFromMessage(
        text,
        SUBJECT_ID,
        themeId,
        { field_id: fieldId }
      );
      chamber = global.InsightsEngine.addSignalToChamber(chamber, signal);
    });
    saveChamberToStorage(chamber);

    global.AHASources?.addSourceEvent?.({
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
    if (!text || !global.InsightsEngine) return 0;
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

  function buildSemanticInsightCandidates(text, options) {
    const raw = String(text || "").trim();
    if (!raw) return [];
    const playCityFallback = buildPlayCityFallbackCandidates(raw);
    if (playCityFallback.length) return playCityFallback;
    const sentences = splitIntoSentences(raw);
    if (sentences.length <= 2 || raw.length < 180) {
      return [toCandidateObject(raw, "observation")];
    }

    const minInsights = Number(options?.minInsights || 1);
    const maxInsights = Math.min(5, Math.max(1, Number(options?.maxInsights || 5)));
    const desired = raw.length < 320 ? 2 : raw.length < 700 ? 3 : 4;
    const target = Math.min(maxInsights, Math.max(minInsights, desired));

    const themeRules = [
      { type: "principle", re: /\b(kunnskap|prinsipp|lærer|læring|forstå|innsikt|erfaring)\b/i },
      { type: "problem", re: /\b(problem|straff|fengsel|vold|kontroll|krise|konflikt|ondt)\b/i },
      { type: "solution", re: /\b(løsning|kan|bør|må|frihet|legalisering|sikkerhet|reform)\b/i },
      { type: "contrast", re: /\b(men|samtidig|likevel|på den ene siden|på den andre siden)\b/i },
      { type: "question", re: /\?|\b(hvorfor|hvordan|hva om)\b/i }
    ];

    const groups = [];
    const used = new Set();
    themeRules.forEach((rule) => {
      const idxs = [];
      sentences.forEach((sentence, idx) => {
        if (!used.has(idx) && rule.re.test(sentence)) idxs.push(idx);
      });
      if (!idxs.length) return;
      idxs.forEach((idx) => used.add(idx));
      groups.push({ type: rule.type, text: idxs.map((idx) => sentences[idx]).join(" ") });
    });
    if (used.size < sentences.length) {
      const rest = sentences.filter((_, idx) => !used.has(idx)).join(" ");
      if (rest) groups.push({ type: "observation", text: rest });
    }

    const deduped = [];
    const seen = new Set();
    groups.forEach((group) => {
      const clean = String(group.text || "").replace(/\s+/g, " ").trim();
      if (!clean || clean.length < 60) return;
      const key = clean.toLowerCase().slice(0, 160);
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(toCandidateObject(clean, group.type));
    });

    if (!deduped.length) return [toCandidateObject(raw, "observation")];
    if (deduped.length <= target) return deduped;

    return deduped.slice(0, target);
  }

  function normalizeFunctionalType(value) {
    const raw = String(value || "").trim().toLowerCase();
    const mapped = raw === "contrast" ? "contradiction" : raw;
    if (AHA_INSIGHT_CONTRACT.FUNCTIONAL_TYPES.has(mapped)) return mapped;
    return "observation";
  }

  function normalizeCandidateConcepts(concepts, text) {
    const out = [];
    const seen = new Set();
    const add = (value) => {
      const label = String(value || "").trim();
      if (!label) return;
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(label);
    };
    (Array.isArray(concepts) ? concepts : []).forEach((c) => {
      if (typeof c === "string") add(c);
      else if (c && typeof c === "object") add(c.label || c.key || c.term);
    });
    const phraseConcepts = extractAcademicPhraseConcepts(text);
    const phraseKeys = new Set(phraseConcepts.map((item) => normalizeAfterworkConcept(item)));
    const prioritized = [...phraseConcepts];
    out.forEach((label) => {
      const key = normalizeAfterworkConcept(label);
      if (!phraseKeys.has(key)) prioritized.push(label);
    });
    return prioritized;
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

  function buildPlayCityFallbackCandidates(raw) {
    const text = String(raw || "");
    const lower = text.toLowerCase();
    const playHit = /\blek\b|\blæring\b|\btrygghet\b/.test(lower);
    const cityHit = /\bbyrom\b|\bparker\b|\btorg\b|\bbibliotek\b|\bskolegård/.test(lower);
    if (!playHit || !cityHit) return [];
    return [
      { title: "Lek som kunnskapsform", summary: "Lek gir mennesker rom til å prøve, feile og begynne på nytt uten skam, og fungerer som sosial og emosjonell læring.", functional_type: "principle", concepts: ["lek", "kunnskap", "læring", "trygghet"], candidate_type: "semantic" },
      { title: "Byrom som frihetsrom", summary: "Byen blir mer enn infrastruktur når parker, torg, skolegårder og bibliotek åpner for tilstedeværelse, fantasi og kroppslig utfoldelse.", functional_type: "principle", concepts: ["byrom", "frihet", "offentlighet", "fantasi"], candidate_type: "semantic" },
      { title: "Fellesskap gjennom uformelle møteplasser", summary: "Uformelle møteplasser lar språk, kropp og relasjoner vokse uten sterk måling, eierskap eller kontroll.", functional_type: "pattern", concepts: ["fellesskap", "møteplass", "kropp", "relasjoner"], candidate_type: "semantic" }
    ].map((c) => Object.assign({}, c, { text: c.summary }));
  }

  function toCandidateObject(text, functionalType) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    const summary = clean.length > 220 ? `${clean.slice(0, 217)}…` : clean;
    const concepts = normalizeCandidateConcepts([], clean);
    return {
      title: summary.split(/[.!?…]/)[0].slice(0, 80) || "Innsikt",
      summary,
      text: clean,
      functional_type: normalizeFunctionalType(functionalType),
      concepts,
      candidate_type: "semantic"
    };
  }

  function splitIntoSentences(text) {
    const normalized = String(text || "").replace(/\r\n?/g, "\n");
    const paragraphs = normalized.split(/\n+/).map((part) => part.trim()).filter(Boolean);
    const chunks = [];

    paragraphs.forEach((paragraph) => {
      const matches = paragraph.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [];
      matches.forEach((match) => {
        const chunk = String(match || "").trim();
        if (chunk) chunks.push(chunk);
      });
    });

    return chunks;
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
    return global.AHAChatSignals.detectLiteraryAttachmentSignal(text);
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
    return global.AHAChatSignals.detectInstitutionalMediaHistorySignal(text);
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
    if (detectPublicAdministrationReformSignal(domainText).strong) return "public_admin_nav";
    if (detectPublicAdministrationSignal(domainText).strong) return "public_administration";
    if (detectLiteraryAttachmentSignal(domainText).strong) return "literary_attachment";
    if (detectSongLyricChildCultureSignal(src).strong) return "song_lyric_child_culture";
    if (detectSahelClimateConflictSignal(domainText).strong) return "sahel_climate_conflict";
    if (detectInstitutionalMediaHistorySignal(domainText).strong) return "institutional_media_history";
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
    const sourceHasPublicAdmin = domain === "public_admin_nav";
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


  function showStatus() {
    const chamber = loadChamberFromStorage();
    const stats = global.InsightsEngine.computeTopicStats(chamber, SUBJECT_ID, getThemeId());
    out(JSON.stringify(stats, null, 2));
  }

  function showConcepts() {
    const insights = currentInsights();
    const concepts = new Set();
    const rawTerms = new Set();
    const claims = new Set();
    const patterns = new Set();
    const markers = new Set();

    insights.forEach((ins) => {
      (ins.concepts || []).forEach((c) => {
        const label = (c && (c.label || c.key)) || c;
        if (label) concepts.add(label);
      });
      (ins.raw_terms || []).forEach((c) => {
        const label = (c && (c.key || c.label)) || c;
        if (label) rawTerms.add(label);
      });
      (ins.claims || []).forEach((c) => {
        const label = c && c.text;
        if (label) claims.add(label);
      });
      (ins.patterns || []).forEach((c) => {
        const label = (c && (c.label || c.key)) || c;
        if (label) patterns.add(label);
      });
      (ins.markers || []).forEach((c) => {
        const label = c && c.value;
        if (label) markers.add(label);
      });
    });

    const visibleConcepts = filterConceptLabels([...concepts].map(canonicalizeDisplayConcept));
    out(JSON.stringify({
      concepts: visibleConcepts,
      patterns: [...patterns].filter(Boolean),
      claims: [...claims].filter(Boolean),
      markers: [...markers].filter(Boolean),
      raw_terms: [...rawTerms].filter(Boolean)
    }, null, 2));
  }

  function renderMetaSection(label, items) {
    const list = (items || []).filter(Boolean);
    if (!list.length) return "";
    const body = list.map((item) => `<li>${item}</li>`).join("");
    return `<section class="meta-section">
      <h4 class="meta-section-label">${escHtml(label)}</h4>
      <ul class="meta-section-list">${body}</ul>
    </section>`;
  }

  function buildDedupedTheoryLinks(chamber, maxItems) {
    const safeChamber = chamber && typeof chamber === "object" ? chamber : {};
    const bestByKey = new Map();
    const normalizeTheoryKey = (value) => String(value || "").toLowerCase().trim().replace(/\s+/g, " ");
    const addTheoryLink = (raw) => {
      if (!raw || typeof raw !== "object") return;
      const thinker = String(raw?.thinker || "").trim();
      const theory = String(raw?.theory || "").trim();
      const name = String(raw?.name || thinker || theory || "Ukjent").trim();
      const relation = String(raw?.relation || raw?.connection || "").trim();
      if (!name || !relation) return;
      const score = Number(raw?.relevance_score ?? raw?.score ?? 0);
      if (!Number.isFinite(score)) return;
      const key = `${normalizeTheoryKey(name)}::${normalizeTheoryKey(relation)}`;
      const current = bestByKey.get(key);
      if (!current || score > current.score) {
        bestByKey.set(key, {
          name,
          relation: relation.length > 160 ? `${relation.slice(0, 157)}…` : relation,
          score
        });
      }
    };
    (Array.isArray(safeChamber?.insights) ? safeChamber.insights : []).forEach((insight) => {
      if (!global.InsightsEngine?.scoreTheoryRelevance) return;
      const scored = global.InsightsEngine.scoreTheoryRelevance(insight, safeChamber) || [];
      scored.forEach(addTheoryLink);
    });
    const chamberText = (Array.isArray(safeChamber?.insights) ? safeChamber.insights : [])
      .map((insight) => [insight?.title, insight?.summary, insight?.text, insight?.source_text].filter(Boolean).join(" "))
      .join("\n");
    const activeContext = resolveActiveAnalysisContext();
    const activeSourceText = String(activeContext?.sourceText || "").trim();
    const activeContextText = [
      activeSourceText,
      ...extractAcademicPhraseConcepts(activeSourceText),
      ...(Array.isArray(activeContext?.subjectLinks) ? activeContext.subjectLinks.map((item) => item?.title || item?.name || item?.label || item?.key || "") : []),
      ...(Array.isArray(activeContext?.keywords) ? activeContext.keywords.map((item) => item?.label || item?.name || item?.key || item || "") : [])
    ].filter(Boolean).join("\n");
    [chamberText, activeSourceText, activeContextText].forEach((sourceText) => {
      extractAcademicTheoryLinks(sourceText).forEach(addTheoryLink);
    });
    return Array.from(bestByKey.values())
      .sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name))
      .slice(0, Math.max(1, Number(maxItems || 5)));
  }

  function collectTheoryPeople(chamber, recurringTopTheories, maxItems) {
    const counts = new Map();
    const add = (value) => {
      const label = String(value || "").trim();
      if (!label) return;
      const key = label.toLowerCase();
      const prev = counts.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        counts.set(key, { key: label, count: 1 });
      }
    };

    (Array.isArray(recurringTopTheories) ? recurringTopTheories : []).forEach((item) => {
      if (!item || !item.key) return;
      counts.set(String(item.key).trim().toLowerCase(), { key: String(item.key).trim(), count: Number(item.count || 1) });
    });

    (Array.isArray(chamber?.insights) ? chamber.insights : []).forEach((insight) => {
      const insightText = [insight?.title, insight?.summary, insight?.text, insight?.source_text].filter(Boolean).join(" ");
      (Array.isArray(insight?.thinkers) ? insight.thinkers : []).forEach(add);
      (Array.isArray(insight?.theories) ? insight.theories : []).forEach(add);
      (Array.isArray(insight?.theoretical_links) ? insight.theoretical_links : []).forEach((link) => {
        add(link?.name);
        add(link?.theory);
      });
      extractAcademicTheoryLinks(insightText).forEach((link) => {
        add(link?.thinker);
        add(link?.theory);
      });
    });

    return Array.from(counts.values())
      .filter((item) => item.key)
      .sort((a, b) => (b.count - a.count) || a.key.localeCompare(b.key))
      .slice(0, Math.max(1, Number(maxItems || 4)));
  }

  function renderConceptNetwork(graphData, theoryLinks, context) {
    const graph = graphData && typeof graphData === "object" ? graphData : {};
    const strongestPairs = Array.isArray(graph?.strongest_pairs) ? graph.strongest_pairs : [];
    const strongestEdges = strongestPairs.map((pair) => ({
      from: String(pair?.from || pair?.a || "").trim(),
      to: String(pair?.to || pair?.b || "").trim(),
      weight: Number(pair?.weight || pair?.score || pair?.count || 0),
      type: "co_occurs"
    }));
    const coOccursEdges = (Array.isArray(graph?.edges) ? graph.edges : [])
      .filter((edge) => edge?.type === "co_occurs" && edge?.from && edge?.to)
      .map((edge) => ({ from: String(edge.from).trim(), to: String(edge.to).trim(), weight: Number(edge.weight || 0), type: "co_occurs" }));
    const mergedByKey = new Map();
    [...strongestEdges, ...coOccursEdges].forEach((edge) => {
      if (!edge.from || !edge.to || edge.from === edge.to) return;
      const pairKey = [edge.from, edge.to].sort((a, b) => a.localeCompare(b)).join("::");
      const prev = mergedByKey.get(pairKey);
      if (!prev || edge.weight > prev.weight) mergedByKey.set(pairKey, edge);
    });

    const sortedConnections = prioritizeVisibleConceptEdges(Array.from(mergedByKey.values()), theoryLinks, context)
      .filter((edge) => !isGenericDisplayConcept(edge.from) && !isGenericDisplayConcept(edge.to))
      .slice(0, 8);

    if (sortedConnections.length < 2) {
      return "<p class='knowledge-sub'>For få koblinger til å bygge nettverk ennå.</p>";
    }

    const nodeStrength = new Map();
    sortedConnections.forEach((edge) => {
      const baseWeight = Math.max(1, Number(edge.weight || 0));
      const from = normalizeConceptKey(edge.from);
      const to = normalizeConceptKey(edge.to);
      nodeStrength.set(from, (nodeStrength.get(from) || 0) + baseWeight);
      nodeStrength.set(to, (nodeStrength.get(to) || 0) + baseWeight);
    });

    const weakVariants = new Set();
    if (nodeStrength.has("ressursknapphet") || nodeStrength.has("knapphetsskolen")) weakVariants.add("knapphet");
    if (nodeStrength.has("politisk økologi")) weakVariants.add("økologi");

    const topConcepts = Array.from(nodeStrength.entries())
      .filter(([concept]) => !weakVariants.has(concept))
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .map(([concept]) => concept)
      .filter((concept, idx, arr) => concept && arr.indexOf(concept) === idx)
      .slice(0, 5);

    if (topConcepts.length < 2) {
      return "<p class='knowledge-sub'>For få koblinger til å bygge nettverk ennå.</p>";
    }

    const topSet = new Set(topConcepts);
    const networkEdges = sortedConnections.filter((edge) => topSet.has(normalizeConceptKey(edge.from)) && topSet.has(normalizeConceptKey(edge.to)));
    if (!networkEdges.length) {
      return "<p class='knowledge-sub'>For få koblinger til å bygge nettverk ennå.</p>";
    }

    const displayedPairs = new Set();
    const rows = networkEdges
      .map((edge) => {
        const from = normalizeConceptKey(edge.from);
        const to = normalizeConceptKey(edge.to);
        if (!from || !to || from === to) return "";
        if (weakVariants.has(from) || weakVariants.has(to)) return "";
        const pairKey = [from, to].sort((a, b) => a.localeCompare(b)).join("::");
        if (displayedPairs.has(pairKey)) return "";
        displayedPairs.add(pairKey);
        return `<li class="concept-network-item"><span class="concept-node-badge">${escHtml(displayConceptLabel(from))}</span><span class="concept-link-line">↔</span><span class="concept-node-badge">${escHtml(displayConceptLabel(to))}</span></li>`;
      })
      .filter(Boolean)
      .slice(0, 8)
      .join("");

    if (!rows) {
      return "<p class='knowledge-sub'>For få koblinger til å bygge nettverk ennå.</p>";
    }

    return `<div class="concept-network" aria-label="Begrepsnettverk">
      <ul class="concept-network-list">${rows}</ul>
    </div>`;
  }



  function displayConceptLabel(value) {
    return getCanonicalConceptLabel(value);
  }

  function normalizeConceptKey(value) {
    return getCanonicalConceptKey(value);
  }

  function getCanonicalConceptLabel(value) {
    return canonicalizeDisplayConcept(normalizeVisibleAcademicLabel(normalizeConceptSurface(value))).trim();
  }

  function getCanonicalConceptKey(value) {
    return normalizeAfterworkConcept(getCanonicalConceptLabel(value));
  }

  function isBlockedStandaloneConcept(value) {
    const key = getCanonicalConceptKey(value);
    return [
      "retning",
      "retninger",
      "størrelse",
      "oppmerksomhet",
      "mulighet",
      "virksomhet",
      "påtilknytning",
      "navkontore"
    ].includes(key);
  }

  function buildCanonicalConceptPair(source, target) {
    const sourceLabel = getCanonicalConceptLabel(source);
    const targetLabel = getCanonicalConceptLabel(target);
    const sourceKey = getCanonicalConceptKey(sourceLabel);
    const targetKey = getCanonicalConceptKey(targetLabel);
    if (!sourceKey || !targetKey) return null;
    if (sourceKey === targetKey) return null;
    if (isNearPhraseOverlap(sourceKey, targetKey)) return null;
    if (isGenericDisplayConcept(sourceLabel) || isGenericDisplayConcept(targetLabel)) return null;
    if (isBlockedStandaloneConcept(sourceLabel) || isBlockedStandaloneConcept(targetLabel)) return null;
    return { sourceLabel, targetLabel, sourceKey, targetKey };
  }

  function isNearPhraseOverlap(sourceKey, targetKey) {
    const a = normalizeAfterworkConcept(sourceKey);
    const b = normalizeAfterworkConcept(targetKey);
    if (!a || !b || a === b) return false;
    const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
    if (!longer.includes(shorter)) return false;
    const shorterTokens = shorter.split(" ").filter(Boolean);
    const longerTokens = longer.split(" ").filter(Boolean);
    if (!shorterTokens.length || longerTokens.length <= shorterTokens.length) return false;
    const shorterSet = new Set(shorterTokens);
    const overlapCount = longerTokens.filter((token) => shorterSet.has(token)).length;
    return overlapCount >= shorterTokens.length;
  }

  function filterGenericConceptItems(items, keyGetter) {
    return applyPhraseConceptDisplayPreference((Array.isArray(items) ? items : []).filter((item) => {
      const label = getCanonicalConceptLabel(keyGetter(item));
      return label && !isGenericDisplayConcept(label) && !isBlockedStandaloneConcept(label);
    }), keyGetter);
  }

  function buildCurrentFocusConceptSet(recurringThemes, conceptGraph, profile) {
    const fromRecent = (profile?.temporal?.recent_focus?.concepts || [])
      .slice(0, 12)
      .map((item) => normalizeConceptKey(item?.key));
    const from14d = (recurringThemes?.["14d"]?.top_concepts || [])
      .slice(0, 12)
      .map((item) => normalizeConceptKey(item?.key));
    const fromGraph = Object.values(conceptGraph?.nodes || {})
      .filter((node) => node?.type === "concept")
      .sort((a, b) => Number(b?.count || 0) - Number(a?.count || 0))
      .slice(0, 15)
      .map((node) => normalizeConceptKey(node?.key || node?.id || node?.label));

    return new Set([...fromRecent, ...from14d, ...fromGraph].filter(Boolean));
  }

  function tensionOverlapsFocus(item, focusSet) {
    if (!item || !(focusSet instanceof Set) || !focusSet.size) return false;
    const raw = String(item?.title || item?.key || "").toLowerCase();
    const pair = raw
      .split(/↔|<->|↔|—|-|vs\.?/i)
      .map((part) => normalizeConceptKey(part))
      .filter(Boolean);
    if (!pair.length) return false;
    return pair.some((concept) => focusSet.has(concept));
  }

  function canonicalizeConceptPairTitle(value) {
    const raw = String(value || "");
    const parts = raw.split(/\s*(?:↔|<->|—|-|vs\.?)\s*/i).map((part) => getCanonicalConceptLabel(part)).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]} ↔ ${parts[1]}`;
    return getCanonicalConceptLabel(raw) || raw;
  }
  function derivePublicAdministrationTensions(context) {
    const sourceText = String(context?.text || "");
    const signal = detectPublicAdministrationReformSignal(sourceText);
    if (!signal.strong) return [];
    const txt = sourceText.toLowerCase();
    const has = (arr) => arr.some((term) => txt.includes(term));
    const out = [];
    const add = (title, strength) => out.push({ title, strength });
    if (has(["omstillingskostnader", "omstillingsprosess"]) && has(["strukturelle utfordringer", "grunnleggende strukturelle"])) add("omstillingskostnad ↔ strukturell utfordring", 2.1);
    if (has(["statlig styring", "statlige mål"]) && has(["kommune", "kommunale mål", "partnerskap"])) add("statlig styring ↔ kommunalt partnerskap", 2.0);
    if (has(["standardisering", "byråkrati", "statlig styring"]) && has(["lokal organisering", "lokalkontor", "individuell oppfølging"])) add("standardisering ↔ lokal tilpasning", 1.9);
    if (has(["organisasjonsreform"]) && has(["innholdsreform"])) add("organisasjonsreform ↔ innholdsreform", 2.2);
    if (has(["flere i arbeid", "måloppnåelse"]) && has(["negative effekter", "mindre sannsynlighet for arbeid", "ugunstig retning"])) add("mål om flere i arbeid ↔ negative reformeffekter", 1.8);
    if (has(["statlig styring", "direktorat", "reformdesign"]) && has(["lokal organisering", "nav-kontor", "iverksetting"])) add("sentralt reformdesign ↔ lokal implementering", 1.8);
    if (has(["arbeidsrettet oppfølging", "oppfølgingsarbeid"]) && has(["ytelsessaksbehandling", "arbeidsavklaringspenger", "inntektssikring"])) add("arbeidsrettet oppfølging ↔ ytelsessaksbehandling", 2.0);
    return out.slice(0, 5);
  }

  function renderKnowledgeMapSection(chamber, profile) {
    const safeChamber = chamber && typeof chamber === "object" ? chamber : {};
    const recurringThemes = global.InsightsEngine?.getRecurringThemes
      ? global.InsightsEngine.getRecurringThemes(safeChamber, { windows: [14, 30] })
      : {};
    const conceptGraph = global.InsightsEngine?.buildConceptGraph
      ? global.InsightsEngine.buildConceptGraph(safeChamber)
      : { nodes: {}, edges: [] };

    const theoryLinks = buildDedupedTheoryLinks(safeChamber, 5);
    const conceptEdgeContext = buildConceptEdgeContext(safeChamber, theoryLinks);

    const tensions = global.InsightsEngine?.detectTensions
      ? (global.InsightsEngine.detectTensions(safeChamber) || [])
      : [];

    const graphNodes = Object.values(conceptGraph?.nodes || {});
    const visibleGraphNodes = graphNodes.filter((node) => {
      if (node?.type !== "concept") return true;
      return !isGenericDisplayConcept(node?.key || node?.id || node?.label);
    });
    const conceptNodeCount = visibleGraphNodes.filter((node) => node?.type === "concept").length;
    const graphTheoryNodes = graphNodes.filter((node) => node?.type === "theory" || node?.type === "thinker").length;
    const extractedTheoryNodes = collectTheoryNodeLabels(safeChamber).length;
    const theoryNodeCount = Math.max(graphTheoryNodes, extractedTheoryNodes);
    const focusConcepts = buildCurrentFocusConceptSet(recurringThemes, conceptGraph, profile);
    const prioritizedEdges = (conceptGraph?.edges || [])
      .filter((edge) => edge?.type === "co_occurs")
      .filter((edge) => !isGenericDisplayConcept(edge?.from) && !isGenericDisplayConcept(edge?.to))
      .filter((edge) => {
        const from = normalizeConceptKey(edge?.from);
        const to = normalizeConceptKey(edge?.to);
        return focusConcepts.has(from) || focusConcepts.has(to);
      });
    const edgePool = prioritizedEdges.length
      ? prioritizedEdges
      : (conceptGraph?.edges || [])
        .filter((edge) => edge?.type === "co_occurs")
        .filter((edge) => !isGenericDisplayConcept(edge?.from) && !isGenericDisplayConcept(edge?.to));
    const topEdges = (() => {
      const deduped = new Map();
      prioritizeVisibleConceptEdges(edgePool, theoryLinks, conceptEdgeContext).forEach((edge) => {
        const pair = buildCanonicalConceptPair(edge?.from, edge?.to);
        if (!pair) return;
        const pairKey = [pair.sourceKey, pair.targetKey].sort((a, b) => a.localeCompare(b)).join("::");
        const prev = deduped.get(pairKey);
        const weight = Number(edge?.weight || 0);
        if (!prev || weight > Number(prev?.weight || 0)) deduped.set(pairKey, { ...edge, from: pair.sourceLabel, to: pair.targetLabel, weight });
      });
      return Array.from(deduped.values())
        .sort((a, b) => Number(b?.weight || 0) - Number(a?.weight || 0))
        .slice(0, 3);
    })();

    const visibleThemes14d = aggregateVisibleConceptCounts(recurringThemes?.["14d"]?.top_concepts || [], "key", "count");
    const visibleThemes30d = aggregateVisibleConceptCounts(recurringThemes?.["30d"]?.top_concepts || [], "key", "count");
    const themes14d = filterGenericConceptItems(visibleThemes14d, (item) => item?.key).slice(0, 3);
    const themes30d = filterGenericConceptItems(visibleThemes30d, (item) => item?.key).slice(0, 3);
    const latestAcademicContext = readLatestAcademicContext();
    const latestContextSource = String(latestAcademicContext?.sourceText || "").toLowerCase();
    const institutionalMediaSource = isInstitutionalMediaHistorySource(latestContextSource, latestAcademicContext?.payload || {});
    const theoryAllowedForInstitutionalMedia = !institutionalMediaSource || sourceMentionsTheoryForInstitutionalHistory(latestContextSource);
    const visibleTheoryLinks = theoryAllowedForInstitutionalMedia ? theoryLinks : [];
    const topTheoryPeople = theoryAllowedForInstitutionalMedia
      ? aggregateVisibleConceptCounts(collectTheoryPeople(safeChamber, recurringThemes?.["30d"]?.top_theories, 8), "key", "count").slice(0, 4)
      : [];
    const profileTensions = profile?.tensions || {};
    const sourceHasGreenTransition = /(fossil|fornybar|omstilling|grønn|gronn|klima|bærekraft|baerekraft)/i.test(latestContextSource);
    const sourceHasCenterPeriphery = /(sentralmakt|lokalsamfunn|kommune|distrikt|sentrum|periferi)/i.test(latestContextSource);
    const shouldSuppressTransitionPairs = latestContextSource && !sourceHasGreenTransition;
    const shouldSuppressCenterPeripheryPairs = latestContextSource && !sourceHasCenterPeriphery;
    const isSuppressedHistoricalPair = (sourceLabel, targetLabel) => {
      const pairText = `${sourceLabel} ${targetLabel}`.toLowerCase();
      if (shouldSuppressTransitionPairs && /(fossil|fornybar|omstilling|grønn|gronn)/i.test(pairText)) return true;
      if (shouldSuppressCenterPeripheryPairs && /(sentralmakt|lokalsamfunn)/i.test(pairText)) return true;
      return false;
    };
    const conceptPairTensions = (profileTensions.concept_pair_tensions || [])
      .slice()
      .sort((a, b) => (Number(b?.strength) || 0) - (Number(a?.strength) || 0))
      .slice(0, 5)
      .map((item) => {
        const pair = buildCanonicalConceptPair(item?.source, item?.target);
        if (!pair) return null;
        if (isSuppressedHistoricalPair(pair.sourceLabel, pair.targetLabel)) return null;
        return { title: `${pair.sourceLabel} ↔ ${pair.targetLabel}`, strength: item?.strength || 0 };
      })
      .filter(Boolean);
    const paradoxTensions = (profileTensions.paradox_pairs || [])
      .slice(0, 5)
      .map((item) => ({
        title: (item?.shared_concepts || []).slice(0, 2).join(" ↔ ") || "Paradoks",
        strength: (item?.shared_concepts || []).length || 0
      }));
    const conceptScoreTensions = (profileTensions.concept_tensions || [])
      .filter((item) => tensionOverlapsFocus(item, focusConcepts))
      .slice(0, 5)
      .map((item) => ({ title: canonicalizeConceptPairTitle(item?.key || "Ukjent"), strength: item?.combined || 0 }));
    const fallbackTensions = tensions
      .filter((item) => tensionOverlapsFocus(item, focusConcepts))
      .slice(0, 5)
      .map((item) => ({ ...item, title: canonicalizeConceptPairTitle(item?.title || item?.key || "") }));
    const visibleTensions = conceptPairTensions.length
      ? conceptPairTensions
      : paradoxTensions.length
        ? paradoxTensions
        : conceptScoreTensions.length
          ? conceptScoreTensions
          : fallbackTensions;
    const derivedPublicAdminTensions = derivePublicAdministrationTensions(conceptEdgeContext);
    const mergedTensions = [...derivedPublicAdminTensions, ...visibleTensions]
      .map((item) => ({ ...item, title: canonicalizeConceptPairTitle(item?.title || item?.key || "") }))
      .filter((item) => !(institutionalMediaSource && shouldSuppressInstitutionalPair(item?.title || "", latestContextSource)))
      .filter((item, index, arr) => arr.findIndex((other) => String(other?.title || "").toLowerCase() === String(item?.title || "").toLowerCase()) === index)
      .slice(0, 5);

    const totalInsights = Array.isArray(safeChamber?.insights) ? safeChamber.insights.length : 0;
    const lowData = totalInsights > 0 && totalInsights < 12;
    const lowDataBanner = lowData ? `<p class="knowledge-sub"><strong>Tidlig mønsterindikasjon</strong><br>Datagrunnlag: lite (${totalInsights} innsikter)<br>Sikkerhet: lav/middels</p>` : "";
    const edgeWarning = lowData && topEdges.length ? `<p class="knowledge-sub">Sterk kobling, men lite datagrunnlag. Forekomst: ${totalInsights} tekster/innsikter. Sikkerhet: lav/middels.</p>` : "";
    return `<section class="knowledge-map-block">
      <h3>Kunnskapskart for hele chamberet</h3>
      <p class="knowledge-sub"><strong>Historiske chamber-mønstre</strong> (kan avvike fra siste tekst).</p>
      ${lowDataBanner}
      <div class="knowledge-map-grid">
        <article class="knowledge-card">
          <h4>Tilbakevendende tema</h4>
          <p class="knowledge-sub">14d: ${themes14d.length ? themes14d.map((item) => `${escHtml(displayConceptLabel(item.key))} (${item.count})`).join(", ") : "Ingen tydelige begreper ennå."}</p>
          <p class="knowledge-sub">30d: ${themes30d.length ? themes30d.map((item) => `${escHtml(displayConceptLabel(item.key))} (${item.count})`).join(", ") : "Mangler data for siste 30 dager."}</p>
          <p class="knowledge-sub">Teori/tenkere: ${topTheoryPeople.length ? topTheoryPeople.map((item) => `${escHtml(displayConceptLabel(item.key))} (${item.count})`).join(", ") : "Ingen teorikoblinger funnet ennå."}</p>
        </article>
        <article class="knowledge-card">
          <h4>Begrepsgraf</h4>
          <p class="knowledge-sub">Begrepsnoder: <strong>${conceptNodeCount}</strong></p>
          <p class="knowledge-sub">Teori-/tenkernoder: <strong>${theoryNodeCount}</strong></p>
          <p class="knowledge-sub">Sterkeste co-occurs: ${topEdges.length ? topEdges.map((edge) => `${escHtml(displayConceptLabel(edge.from))} ↔ ${escHtml(displayConceptLabel(edge.to))} (${edge.weight})`).join(", ") : "Ingen samforekomst-koblinger ennå."}</p>
          ${edgeWarning}
          <h5 class="knowledge-mini-title">Begrepsnettverk</h5>
          ${renderConceptNetwork(conceptGraph, theoryLinks, conceptEdgeContext)}
        </article>
        <article class="knowledge-card">
          <h4>Teorikoblinger</h4>
          ${visibleTheoryLinks.length ? `<ul>${visibleTheoryLinks.map((link) => `<li><strong>${escHtml(link.name)}</strong> · ${escHtml(link.score.toFixed(2))}${link.relation ? ` · ${escHtml(link.relation)}` : ""}</li>`).join("")}</ul>` : "<p class='knowledge-sub'>Ingen teoretiske koblinger å score ennå.</p>"}
        </article>
        <article class="knowledge-card">
          <h4>Spenninger</h4>
          ${mergedTensions.length ? `<ul>${mergedTensions.map((item) => `<li><strong>${escHtml(String(item?.title || "Ukjent"))}</strong> · styrke ${escHtml(String(item?.strength || 0))}</li>`).join("")}</ul>` : "<p class='knowledge-sub'>Ingen spenninger koblet til de nyeste temaene ennå.</p>"}
        </article>
      </div>
    </section>`;
  }

  function chamberHasKnowledgeMapData(chamber) {
    return Boolean(chamber && Array.isArray(chamber.insights) && chamber.insights.length);
  }

  function aggregateVisibleConceptCounts(items, keyField = "key", countField = "count") {
    const totals = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const raw = String(item?.[keyField] || "").trim();
      if (!raw) return;
      const label = getCanonicalConceptLabel(raw);
      const key = getCanonicalConceptKey(label);
      if (!label || !key || isGenericDisplayConcept(label) || isBlockedStandaloneConcept(label)) return;
      const prev = totals.get(key) || { ...item, [keyField]: label, [countField]: 0 };
      prev[countField] += Number(item?.[countField] || 0);
      totals.set(key, prev);
    });
    return Array.from(totals.values()).sort((a, b) => Number(b?.[countField] || 0) - Number(a?.[countField] || 0));
  }

  function isInstitutionalMediaHistorySource(text, payload = null) {
    const sourceText = String(text || "");
    const inferredPayload = payload && typeof payload === "object" ? payload : (readLatestAcademicContext()?.payload || {});
    return detectAutoAnalysisDomain(sourceText, inferredPayload) === "institutional_media_history";
  }

  function sourceMentionsTheoryForInstitutionalHistory(sourceText) {
    const txt = String(sourceText || "");
    return /\bsennett\b|offentlighetsteori|public sphere/i.test(txt);
  }

  function shouldSuppressInstitutionalPair(title, sourceText) {
    const normalizedTitle = normalizeConceptKey(String(title || ""));
    const src = String(sourceText || "").toLowerCase();
    const genericPairs = [
      ["politikk", "vitenskap"],
      ["policy", "momentum"],
      ["policy-momentum", "forskningsgrunnlag"],
      ["fossil økonomi", "fornybar økonomi"],
      ["sentralmakt", "lokalsamfunn"],
      ["frihet", "kontroll"],
      ["trygghet", "risiko"],
      ["fellesskap", "eierskap"]
    ];
    return genericPairs.some(([left, right]) => {
      if (!(normalizedTitle.includes(normalizeConceptKey(left)) && normalizedTitle.includes(normalizeConceptKey(right)))) return false;
      return !(src.includes(left) && src.includes(right));
    });
  }

  function collectInstitutionalTextNearTensions(latestAcademicContext) {
    const payload = latestAcademicContext?.payload && typeof latestAcademicContext.payload === "object"
      ? latestAcademicContext.payload
      : {};
    const ahaSer = payload?.ahaSer && typeof payload.ahaSer === "object" ? payload.ahaSer : {};
    const sortItems = Array.isArray(payload?.sortItems) ? payload.sortItems : [];
    const sourceText = String(latestAcademicContext?.sourceText || "").toLowerCase();
    const matchesSource = (title) => {
      const pair = String(title || "").split(/↔|<->|—| vs\.? /i).map((part) => part.trim()).filter(Boolean);
      if (pair.length < 2) return false;
      return sourceText.includes(pair[0].toLowerCase()) && sourceText.includes(pair[1].toLowerCase());
    };
    const items = [];
    const hovedspenning = String(ahaSer?.hovedspenning || "").trim().replace(/[.。]\s*$/, "");
    if (hovedspenning) items.push(hovedspenning);
    const konfliktlinjerRaw = String(
      sortItems.find((item) => normalizeConceptKey(item?.label || "").includes("konfliktlinjer"))?.text || ""
    ).trim();
    if (konfliktlinjerRaw) {
      konfliktlinjerRaw.split(/[;\n]+/).map((part) => part.trim()).filter(Boolean).forEach((part) => items.push(part.replace(/[.。]\s*$/, "")));
    }
    return items
      .map((item) => canonicalizeConceptPairTitle(item))
      .filter((item) => item.includes("↔"))
      .filter((item) => !shouldSuppressInstitutionalPair(item, sourceText) || matchesSource(item))
      .filter((item, idx, arr) => arr.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === idx);
  }

  function renderMetaProfile(profile, chamber) {
    if (!profile || typeof profile !== "object") return "";

    const recent = profile.temporal?.recent_focus || {};
    const tensions = profile.tensions || {};
    const recs = profile.recommendations || {};
    const totalInsights = Array.isArray(profile.insights) ? profile.insights.length : 0;
    const window = recent.window_days ? ` (siste ${recent.window_days} dager)` : "";

    const recentConcepts = filterGenericConceptItems(aggregateVisibleConceptCounts(recent.concepts || [], "key", "count"), (item) => item?.key).slice(0, 6).map((c) =>
      `${escHtml(displayConceptLabel(c.key))} <span class="meta-count">×${c.count}</span>`
    );
    const emerging = filterGenericConceptItems(aggregateVisibleConceptCounts(recent.emerging || [], "key", "count"), (item) => item?.key).slice(0, 5).map((c) =>
      `${escHtml(displayConceptLabel(c.key))} <span class="meta-count">×${c.count}</span>`
    );
    const fading = filterGenericConceptItems(aggregateVisibleConceptCounts(recent.fading || [], "key", "prev_count"), (item) => item?.key).slice(0, 5).map((c) =>
      `${escHtml(displayConceptLabel(c.key))} <span class="meta-count">tidligere ×${c.prev_count}</span>`
    );
    const latestAcademicContext = readLatestAcademicContext();
    const latestContextSource = String(latestAcademicContext?.sourceText || "").toLowerCase();
    const institutionalMediaSource = isInstitutionalMediaHistorySource(latestContextSource, latestAcademicContext?.payload || {});
    const sourceHasGreenTransition = /(fossil|fornybar|omstilling|grønn|gronn|klima|bærekraft|baerekraft)/i.test(latestContextSource);
    const sourceHasCenterPeriphery = /(sentralmakt|lokalsamfunn|kommune|distrikt|sentrum|periferi)/i.test(latestContextSource);
    const shouldSuppressTransitionPairs = latestContextSource && !sourceHasGreenTransition;
    const shouldSuppressCenterPeripheryPairs = latestContextSource && !sourceHasCenterPeriphery;
    const isSuppressedHistoricalPair = (sourceLabel, targetLabel) => {
      const pairText = `${sourceLabel} ${targetLabel}`.toLowerCase();
      if (shouldSuppressTransitionPairs && /(fossil|fornybar|omstilling|grønn|gronn)/i.test(pairText)) return true;
      if (shouldSuppressCenterPeripheryPairs && /(sentralmakt|lokalsamfunn)/i.test(pairText)) return true;
      return false;
    };

    const conceptPairTensions = (() => {
      const deduped = new Map();
      (tensions.concept_pair_tensions || []).forEach((t) => {
        const pair = buildCanonicalConceptPair(t?.source, t?.target);
        if (!pair) return;
        const pairKey = [pair.sourceKey, pair.targetKey].sort((a, b) => a.localeCompare(b)).join("::");
        const strength = Number(t?.strength || 0);
        const prev = deduped.get(pairKey);
        if (!prev || strength > Number(prev?.strength || 0)) deduped.set(pairKey, { pair, strength });
      });
      return Array.from(deduped.values())
        .sort((a, b) => Number(b.strength) - Number(a.strength))
        .slice(0, 5)
        .filter(({ pair }) => !isSuppressedHistoricalPair(pair.sourceLabel, pair.targetLabel))
        .filter(({ pair }) => !(institutionalMediaSource && shouldSuppressInstitutionalPair(`${pair.sourceLabel} ↔ ${pair.targetLabel}`, latestContextSource)))
        .map(({ pair, strength }) => `${escHtml(pair.sourceLabel)} ↔ ${escHtml(pair.targetLabel)} <span class="meta-count">styrke ${escHtml(String(strength))}</span>`);
    })();
    const conceptTensions = (tensions.concept_tensions || []).slice(0, 5).map((t) => {
      const key = displayConceptLabel(t?.key || "");
      if (!key || isGenericDisplayConcept(key)) return "";
      return `${escHtml(key)} <span class="meta-count">spenning ${Number(t.combined).toFixed(2)}</span>`;
    }).filter(Boolean);
    const paradoxes = (tensions.paradox_pairs || []).slice(0, 5).map((p) => {
      const shared = (p.shared_concepts || []).slice(0, 3).map(escHtml).join(", ");
      const themeText = p.theme_id ? ` i <em>${escHtml(p.theme_id)}</em>` : "";
      return `${shared || "(begreper)"}${themeText}`;
    });
    const unstick = (recs.unstick_prompts || [])
      .filter((u) => !/\b(th_default|default|unknown|null|undefined)\b/i.test(String(u?.concept || u?.prompt || "")))
      .slice(0, 4).map((u) => escHtml(u.prompt || ""));
    const resurface = (recs.resurface_insights || []).slice(0, 4).map((r) =>
      `${escHtml((r.summary || "").slice(0, 160))} <span class="meta-count">${escHtml((r.shared_concepts || []).map((concept) => displayConceptLabel(concept)).join(", "))}</span>`
    );
    const bridging = (() => {
      const deduped = new Map();
      (recs.bridging_pairs || []).forEach((b) => {
        const pair = buildCanonicalConceptPair(b?.source, b?.target);
        if (!pair) return;
        const pairKey = [pair.sourceKey, pair.targetKey].sort((a, b) => a.localeCompare(b)).join("::");
        const npmi = Number(b?.npmi || 0);
        const prev = deduped.get(pairKey);
        if (!prev || npmi > Number(prev?.npmi || 0)) deduped.set(pairKey, { pair, npmi });
      });
      return Array.from(deduped.values())
        .sort((a, b) => b.npmi - a.npmi)
        .slice(0, 4)
        .map(({ pair, npmi }) => `${escHtml(pair.sourceLabel)} ↔ ${escHtml(pair.targetLabel)} <span class="meta-count">npmi ${npmi.toFixed(2)}</span>`);
    })();
    const topKnownConcepts = new Set((recent.concepts || []).map((c) => getCanonicalConceptKey(c?.key)).filter(Boolean));
    const underexplored = filterGenericConceptItems(aggregateVisibleConceptCounts(recs.underexplored_concepts || [], "key", "count"), (item) => item?.key)
      .map((u) => ({ ...u, key: getCanonicalConceptLabel(u?.key) }))
      .filter((u) => !topKnownConcepts.has(getCanonicalConceptKey(u?.key)))
      .slice(0, 5).map((u) =>
      `${escHtml(displayConceptLabel(u.key))} <span class="meta-count">×${u.count} · ${escHtml(u.reason || "")}</span>`
    );
    const knowledgeMapTensions = (() => {
      const kmTensions = global.InsightsEngine?.detectTensions ? (global.InsightsEngine.detectTensions(chamber) || []) : [];
      return (kmTensions || []).map((item) => {
        const title = String(item?.title || item?.key || "");
        const parts = title.split(/↔|<->|—| vs\.? /i).map((part) => part.trim()).filter(Boolean);
        if (parts.length < 2) return null;
        const pair = buildCanonicalConceptPair(parts[0], parts[1]);
        if (!pair) return null;
        return `${escHtml(pair.sourceLabel)} ↔ ${escHtml(pair.targetLabel)} <span class="meta-count">styrke ${escHtml(String(item?.strength || item?.combined || 0))}</span>`;
      }).filter(Boolean);
    })();
    const derivedPublicAdminTensions = derivePublicAdministrationTensions(buildConceptEdgeContext(chamber || {}, buildDedupedTheoryLinks(chamber || {}, 5)))
      .map((item) => {
        const parts = String(item?.title || "").split(/↔|<->|—| vs\.? /i).map((part) => part.trim()).filter(Boolean);
        if (parts.length < 2) return null;
        const pair = buildCanonicalConceptPair(parts[0], parts[1]);
        if (!pair) return null;
        return `${escHtml(pair.sourceLabel)} ↔ ${escHtml(pair.targetLabel)} <span class="meta-count">styrke ${escHtml(String(item?.strength || 0))}</span>`;
      })
      .filter(Boolean);
    const institutionalTextNearTensions = institutionalMediaSource ? collectInstitutionalTextNearTensions(latestAcademicContext) : [];
    const tensionSectionItems = institutionalMediaSource
      ? (institutionalTextNearTensions.length
        ? institutionalTextNearTensions.slice(0, 3).map((title) => escHtml(title))
        : ["Ingen spenninger koblet til de nyeste temaene ennå."])
      : conceptPairTensions.length
      ? conceptPairTensions.slice(0, 3)
      : (derivedPublicAdminTensions.length
        ? derivedPublicAdminTensions.slice(0, 3)
        : (knowledgeMapTensions.length
          ? knowledgeMapTensions.slice(0, 3)
          : (conceptTensions.length ? conceptTensions.slice(0, 3) : ["Ingen tydelig todelt spenning ennå."])));

    const sections = [
      renderMetaSection(`Det du tenker mest på${window}`, recentConcepts),
      renderMetaSection("Nye temaer som dukker opp", emerging),
      renderMetaSection("Tankegods som har stilnet", fading),
      renderMetaSection("Spenninger jeg ser", tensionSectionItems),
      renderMetaSection("Paradokser i materialet", paradoxes),
      renderMetaSection("Spørsmål som kan løsne fastlåsthet", unstick),
      renderMetaSection("Refleksjoner verdt å hente frem", resurface),
      renderMetaSection("Koblinger verdt å tenke videre på", bridging),
      renderMetaSection("Nye begreper som trenger flere koblinger", underexplored)
    ].filter(Boolean).join("");

    const knowledgeMap = renderKnowledgeMapSection(chamber, profile);

    const lowData = totalInsights > 0 && totalInsights < 12;
    const lowDataBanner = lowData
      ? `<p class="meta-sub"><strong>Tidlig mønsterindikasjon</strong><br>Datagrunnlag: lite (${totalInsights} innsikter)<br>Sikkerhet: lav/middels</p>`
      : "";

    if (!sections) {
      return `<div class="meta-profile">
        <h3>Hva AHA ser i hele materialet ditt</h3>
        ${lowDataBanner}
        <p class="meta-empty">AHA har ennå ikke nok å gå på. Skriv mer i chat eller importer fra History Go.</p>
        ${knowledgeMap}
      </div>`;
    }

    return `<div class="meta-profile">
      <h3>Hva AHA ser i hele materialet ditt</h3>
      ${lowDataBanner}
      <p class="meta-meta">${totalInsights} innsikter analysert på tvers av hele chamberet.</p>
      ${sections}
      ${knowledgeMap}
    </div>`;
  }

  function showMeta() {
    const chamber = loadChamberFromStorage();
    if (!global.MetaInsightsEngine?.buildUserMetaProfile) {
      out("MetaInsightsEngine mangler buildUserMetaProfile.");
      return;
    }
    const profile = global.MetaInsightsEngine.buildUserMetaProfile(chamber, SUBJECT_ID);
    const html = renderMetaProfile(profile, chamber);
    renderAuxPanel("meta-profile-panel", html);
    renderPanel(html);
    out("");
  }

  function showKnowledgeMap() {
    const chamber = loadChamberFromStorage();
    const hasData = chamberHasKnowledgeMapData(chamber);
    if (!global.MetaInsightsEngine?.buildUserMetaProfile) {
      out("MetaInsightsEngine mangler buildUserMetaProfile.");
      return;
    }
    const profile = global.MetaInsightsEngine.buildUserMetaProfile(chamber, SUBJECT_ID);
    const content = hasData
      ? renderKnowledgeMapSection(chamber, profile)
      : `<section class="knowledge-map-block">
          <h3>Kunnskapskart for hele chamberet</h3>
          <p class="meta-empty">AHA har ikke nok innsikter til å bygge kunnskapskart ennå.</p>
        </section>`;
    renderPanel(`<div class="insight-panel">${content}</div>`);
    out("");
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
    return global.AHAChatTextUtils.cleanArticleText(raw);
  }

  function toSentences(text) {
    return global.AHAChatTextUtils.toSentences(text);
  }

  function collectOpinionArticleEvidence(raw, sentences) {
    return global.AHAChatTextUtils.collectOpinionArticleEvidence(raw, sentences);
  }

  function detectTextType(raw) {
    return global.AHAChatSignals.detectTextType(raw);
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
    return global.AHAChatSubjects.normalizeSubjectLinks(subjectMatches);
  }
  function enrichSubjectMatchesForClimateConflict(text, subjectMatches) {
    return global.AHAChatSubjects.enrichSubjectMatchesForClimateConflict(text, subjectMatches);
  }
  function detectPublicAdministrationReformSignal(text) {
    return global.AHAChatSignals.detectPublicAdministrationReformSignal(text);
  }
  function detectPublicAdministrationSignal(text) {
    return global.AHAChatSignals.detectPublicAdministrationSignal(text);
  }
  function enrichSubjectMatchesForPublicAdministration(text, subjectMatches) {
    return global.AHAChatSubjects.enrichSubjectMatchesForPublicAdministration(text, subjectMatches);
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

  function normalizeAfterworkConcept(term) {
    return resolveConceptTerm(term).toLowerCase().replace(/[“”"'`´]/g, "").replace(/\s+/g, " ").trim();
  }

  function isGoodAfterworkConcept(term, options) {
    const normalized = normalizeAfterworkConcept(term);
    if (!normalized || normalized.length < 3) return false;
    const hasMultiWords = normalized.includes(" ");
    const source = String(options?.source || "generic");
    const blocked = new Set([
      "annonsørinnhold","annonse","logo","illustrasjon","les også","kjolevalg","kjole","kjoler","bryllupsgjesten","terrasse","plank","garanti","årets","populære","sikre","nydelige",
      "markussen","norge","omstilles","fortsetter","bygge","naturens","retning","retninger","bekostning","dette","tekst","sier","skal","gjøre","være","blir","kommer","spør","svarer"
    ]);
    if (blocked.has(normalized)) return false;
    const genericWords = new Set(["med","som","for","mot","inn","ut","opp","ned","der","her","alle","flere","kan","vil","må","når","hvor","hvorfor","hva"]);
    if (!hasMultiWords && genericWords.has(normalized)) return false;
    const weakSingleWords = new Set(["politikk","samfunn","klima","debatt","endring"]);
    if (!hasMultiWords && source !== "matched_terms" && weakSingleWords.has(normalized)) return false;
    if (!hasMultiWords && /^(\p{Lu}[\p{L}-]+)$/u.test(String(term || ""))) return false;
    return true;
  }

  function deriveConceptsFromAfterwork(payload, fallbackKeywords, subjectLinks, sourceText) {
    const concepts = [];
    const seen = new Set();
    const safePayloadKeywords = Array.isArray(payload?.keywords) ? payload.keywords : [];
    const safeFallbackKeywords = Array.isArray(fallbackKeywords) ? fallbackKeywords : [];
    const safeSubjectLinks = Array.isArray(subjectLinks) ? subjectLinks : [];
    const cleanedSource = cleanTextForConceptExtraction(sourceText || "").toLowerCase();
    const phraseConcepts = extractAcademicPhraseConcepts(sourceText || "");

    function addConcept(term, source) {
      const normalized = normalizeAfterworkConcept(term);
      if (!isGoodAfterworkConcept(normalized, { source })) return;
      if (seen.has(normalized)) return;
      seen.add(normalized);
      concepts.push(normalized);
    }

    phraseConcepts.forEach((phrase) => addConcept(phrase, "phrase_concept"));
    safeSubjectLinks.forEach((link) => {
      (Array.isArray(link?.matched_terms) ? link.matched_terms : []).forEach((term) => addConcept(term, "matched_terms"));
    });

    safePayloadKeywords.forEach((word) => addConcept(word, "payload_keywords"));
    safeFallbackKeywords.forEach((word) => addConcept(word, "fallback_keywords"));

    const textType = String(payload?.textType || "").trim().toLowerCase();
    const hasClimateTransition = safeSubjectLinks.some((link) => {
      const id = String(link?.id || "").toLowerCase();
      const subjectId = String(link?.subject_id || "").toLowerCase();
      const title = String(link?.title || "").toLowerCase();
      return id.includes("climate_transition") || subjectId.includes("climate_transition") || title.includes("klima") || title.includes("omstilling");
    }) || /klima|omstilling|olje|fornybar|bærekraft/.test(cleanedSource);

    if (textType === "opinion_article" && hasClimateTransition) {
      const domainConcepts = [
        "omstilling","oljeavhengighet","bærekraft","naturhensyn","arealnøytralitet","fornybar energi","lokalsamfunn","sirkulærøkonomi","samiske rettigheter","naturens tålegrenser","grønn verdiskaping","grønne jobber"
      ];
      domainConcepts.forEach((concept) => {
        const normalized = normalizeAfterworkConcept(concept);
        const foundInMatchedTerms = safeSubjectLinks.some((link) => (Array.isArray(link?.matched_terms) ? link.matched_terms : []).some((term) => normalizeAfterworkConcept(term) === normalized));
        if (foundInMatchedTerms || cleanedSource.includes(normalized)) addConcept(concept, "domain_fallback");
      });
    }

    if (textType) addConcept(textType, "text_type");
    return concepts.slice(0, 16);
  }

  function makeAfterworkObject(payload, sourceText, options) {
    const source = String(sourceText || "").trim();
    const basePayload = payload && typeof payload === "object" ? payload : {};
    const normalizedPayload = normalizeAcademicAfterworkPayload(basePayload, source, basePayload.textType || detectTextType(source));
    const sourceTextHash = sourceHash(source);
    const safeSortItems = Array.isArray(normalizedPayload.sortItems) ? normalizedPayload.sortItems : [];
    const safeThoughts = normalizedPayload.thoughts && typeof normalizedPayload.thoughts === "object" ? normalizedPayload.thoughts : {};
    const safeList = Array.isArray(normalizedPayload.list) ? normalizedPayload.list : [];
    const safeInsights = Array.isArray(normalizedPayload.insightCards) ? normalizedPayload.insightCards : [];
    const safePath = Array.isArray(normalizedPayload.path) ? normalizedPayload.path : [];
    const safeSubjectMatches = Array.isArray(options?.subjectMatches) ? options.subjectMatches : (Array.isArray(normalizedPayload.subjectMatches) ? normalizedPayload.subjectMatches : []);
    const subjectLinks = normalizeSubjectLinks(safeSubjectMatches);
    const analysisSource = cleanTextForConceptExtraction(source);
    const keywords = takeKeywords(analysisSource, 8);
    const concepts = deriveConceptsFromAfterwork(normalizedPayload, keywords, subjectLinks, source);
    const extractedTheoryLinks = extractAcademicTheoryLinks(source);
    const theoryLinks = mergeTheoryLinks(normalizedPayload?.theoryLinks || normalizedPayload?.theoretical_links, extractedTheoryLinks, 5);
    const thinkers = normalizeSimpleStringList((normalizedPayload?.thinkers || []).concat(theoryLinks.map((item) => item.thinker).filter(Boolean)), 8);
    const theories = normalizeSimpleStringList((normalizedPayload?.theories || []).concat(theoryLinks.map((item) => item.theory).filter(Boolean)), 8);
    const structuralLabels = safeSortItems
      .map((item) => String(item?.label || "").trim())
      .filter(Boolean)
      .slice(0, 12);
    const activeRun = getActiveAnalysisRun();
    return {
      id: `afterwork_${Date.now()}_${shortHash(`${sourceTextHash}|${JSON.stringify(normalizedPayload)}`)}`,
      analysisId: options?.analysisId || activeRun?.analysisId || "",
      analysisRunId: options?.analysisRunId || options?.runId || activeRun?.analysisRunId || activeRun?.runId || "",
      runId: options?.runId || options?.analysisRunId || activeRun?.runId || activeRun?.analysisRunId || "",
      conversationId: options?.conversationId || options?.sessionId || activeRun?.conversationId || activeRun?.sessionId || CHAT_THREAD_ID,
      turnId: options?.turnId || activeRun?.turnId || "",
      sourceId: options?.sourceId || activeRun?.sourceId || (sourceTextHash ? `source_${sourceTextHash}` : ""),
      sourceKind: options?.sourceKind || activeRun?.sourceKind || "chat",
      topicLabel: options?.topicLabel || activeRun?.topicLabel || takeKeywords(source, 4).join(" · "),
      sessionId: options?.sessionId || options?.conversationId || activeRun?.sessionId || activeRun?.conversationId || CHAT_THREAD_ID,
      type: "aha_afterwork",
      source: "chat",
      textType: normalizedPayload.textType || detectTextType(source),
      createdAt: new Date().toISOString(),
      sourceText,
      sourceTextHash,
      sourceHash: sourceTextHash,
      sourceFingerprint: sourceTextHash,
      sourceTextPreview: source.replace(/\s+/g, " ").slice(0, 180),
      reflection: String(normalizedPayload.reflection || ""),
      sortItems: safeSortItems,
      daySummary: String(normalizedPayload.day || ""),
      thoughtSorting: {
        hovedspor: String(safeThoughts.hovedspor || ""),
        lose_tanker: String(safeThoughts.lose_tanker || ""),
        neste_steg: String(safeThoughts.neste_steg || "")
      },
      list: safeList,
      insights: safeInsights,
      learningPath: safePath,
      subjectLinks,
      keywords,
      concepts,
      structuralLabels,
      theoryLinks,
      thinkers,
      theories
    };
  }

  function saveAutoOutputAsAfterwork(payload, sourceText, options) {
    const source = String(sourceText || "").trim();
    if (!source) return { saved: false, reason: "missing_source_text", entry: null };
    const entry = makeAfterworkObject(payload, source, options);
    const entries = loadAfterworkEntries();
    const payloadSignature = shortHash(JSON.stringify({
      reflection: entry.reflection,
      sortItems: entry.sortItems,
      daySummary: entry.daySummary,
      thoughtSorting: entry.thoughtSorting,
      list: entry.list,
      insights: entry.insights,
      learningPath: entry.learningPath
    }));
    const exists = entries.some((item) => {
      const existingSignature = shortHash(JSON.stringify({
        reflection: item?.reflection || "",
        sortItems: Array.isArray(item?.sortItems) ? item.sortItems : [],
        daySummary: item?.daySummary || "",
        thoughtSorting: item?.thoughtSorting || {},
        list: Array.isArray(item?.list) ? item.list : [],
        insights: Array.isArray(item?.insights) ? item.insights : [],
        learningPath: Array.isArray(item?.learningPath) ? item.learningPath : []
      }));
      return String(item?.sourceTextHash || "") === entry.sourceTextHash && existingSignature === payloadSignature;
    });
    if (exists) return { saved: false, reason: "duplicate", entry: null };
    entries.push(entry);
    saveAfterworkEntries(entries);
    return { saved: true, reason: "saved", entry };
  }


  function ensureAfterworkForLatestAnalysis(sourceText, options = {}) {
    const source = String(sourceText || "").trim();
    if (!source) return { saved: false, reason: "missing_source_text", entry: null };
    const auto = loadAutoOutputs();
    const payload = auto?.payload && typeof auto.payload === "object" ? auto.payload : null;
    if (!payload) return { saved: false, reason: "missing_payload", entry: null };
    const autoSourceHash = String(auto?.sourceTextHash || sourceHash(auto?.sourceText || source));
    const currentHash = sourceHash(source);
    if (!autoSourceHash || autoSourceHash !== currentHash) return { saved: false, reason: "hash_mismatch", entry: null };
    const activeRun = getActiveAnalysisRun();
    const expectedRunId = String(options?.analysisRunId || options?.runId || activeRun?.analysisRunId || activeRun?.runId || "");
    const gotRunId = String(auto?.analysisRunId || auto?.runId || payload?.analysisRunId || payload?.runId || "");
    if (expectedRunId && gotRunId && expectedRunId !== gotRunId) {
      console.warn(`Skipped stale AHA analysis payload: expected ${expectedRunId}, got ${gotRunId}.`);
      return { saved: false, reason: "run_mismatch", entry: null };
    }
    const result = saveAutoOutputAsAfterwork(payload, source, options);
    if (result.reason === "duplicate") {
      const entries = loadAfterworkEntries();
      const match = entries.find((entry) => String(entry?.sourceTextHash || "") === currentHash);
      if (match) {
        match.lastReferencedAt = new Date().toISOString();
        saveAfterworkEntries(entries);
      }
    }
    return result;
  }

  function getLatestAhaReplyFromDom() {
    const rows = Array.from(document.querySelectorAll(".chat-line-aha"));
    const last = rows[rows.length - 1];
    return String(last?.textContent || "").trim();
  }


  function normalizeFagkoblinger(value) {
    return global.AHAChatSubjects.normalizeFagkoblinger(value);
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
    return global.AHAChatSignals.inferReligiousLexiconEvidence(rawText);
  }

  function isAcademicLikeType(type) {
    return global.AHAChatSubjects.isAcademicLikeType(type);
  }

  function isDayLogType(type) {
    return global.AHAChatSubjects.isDayLogType(type);
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
        (typeof global.InsightsEngine?.buildMetaProfile === "function"
          ? (global.InsightsEngine.buildMetaProfile(chamber) || {})
          : (chamber?.meta || {})),
      setStatusNote,
      out
    };
  }

  function buildAhaAnalysisExportBundle() {
    return global.AHAChatExport.buildAhaAnalysisExportBundle(getAhaExportDeps());
  }

  function formatAhaAnalysisExportMarkdown(bundle) {
    return global.AHAChatExport.formatAhaAnalysisExportMarkdown(bundle);
  }

  async function copyAhaAnalysisExportMarkdown() {
    return global.AHAChatExport.copyAhaAnalysisExportMarkdown(getAhaExportDeps());
  }

  function exportAhaAnalysisJson() {
    return global.AHAChatExport.exportAhaAnalysisJson(getAhaExportDeps());
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
    return global.AHAChatAnalysis.buildOpinionArticleQualityAnalysis(raw, evidence, sentences);
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

  function buildAutoOutputFallbackPayload(userText, ahaReply, options = {}) {
    const sourceText = String(userText || "");
    if (!AHA_RUNTIME_KNOWLEDGE_POLICY.legacyArticleTemplatesEnabled && detectTextType(sourceText) === "academic_article") {
      return buildSourceGroundedAcademicPayload(sourceText);
    }
    const replyText = String(ahaReply || "");
    const combined = `${sourceText} ${replyText}`.toLowerCase();
    const hasSahelAcademicEvidence = sourceHasAny(sourceText, [/\bsahel\b/i, /\bmali\b/i, /\bressursknapphet\b/i, /\bpolitisk økologi\b/i, /\bknapphetsskolen\b/i, /\bmiljøsikkerhet\b/i, /\benvironmental security\b/i, /\bclimate conflict\b/i]);
    const hasKnausgardEvidence = sourceHasAny(sourceText, [/\bknausgård\b/i, /\bkarl ove\b/i]);
    const hasOmVaarenEvidence = sourceHasAny(sourceText, [/\bom våren\b/i]);
    const hasLindaEvidence = sourceHasAny(sourceText, [/\blinda boström knausgård\b/i]);
    const hasAttachmentTheoryEvidence = sourceHasAny(sourceText, [/\btilknytningsteori\b/i, /\bbowlby\b/i, /\battachment\b/i]);
    const hasLiteraryWorkEvidence = hasKnausgardEvidence || hasOmVaarenEvidence || hasLindaEvidence;
    const academicSignals = /(ressursknapphet|politisk økologi|knapphetsskolen|miljøsikkerhet|climate conflict|environmental security|tilknytningsteori|autofiksjon|deiksis|knausgård)/i;
    const publicAdminSignal = detectPublicAdministrationReformSignal(sourceText);
    const baseTextType = detectTextType(sourceText);
    const isAcademic = baseTextType === "academic_article" || academicSignals.test(combined) || Boolean(publicAdminSignal?.strong) || hasSahelAcademicEvidence || hasAttachmentTheoryEvidence || hasLiteraryWorkEvidence;
    const literaryAttachmentSignal = hasLiteraryWorkEvidence ? detectLiteraryAttachmentSignal(combined) : { strong: false };
    const isNavAcademic = Boolean(publicAdminSignal?.strong);
    const isSahelClimateAcademic = hasSahelAcademicEvidence;
    const isLiteraryAttachmentAcademic = hasLiteraryWorkEvidence && literaryAttachmentSignal?.strong;
    const reflectionCandidate = [replyText, sourceText]
      .flatMap((text) => String(text || "").split(/(?<=[.!?])\s+/))
      .map((part) => part.trim())
      .find((part) => part && part.length >= 20 && /[a-zæøå]/i.test(part));

    const payload = {
      textType: baseTextType,
      reflection: reflectionCandidate || sourceText || replyText || "Teksten peker på flere mulige tolkninger.",
      sortItems: [],
      day: "",
      thoughts: {},
      list: [],
      insightCards: [],
      path: [],
      subjectMatches: Array.isArray(options.subjectMatches) ? options.subjectMatches : []
    };

    if (isAcademic) {
      payload.textType = "academic_article";
      payload.day = "Ikke dagbokmateriale – ingen dagsoppsummering laget.";
      if (isNavAcademic) {
        payload.sortItems = [
          { label: "Kort hovedinnsikt", text: "NAVs manglende måloppnåelse skyldes ikke bare midlertidig omstilling, men også varige strukturelle utfordringer." },
          { label: "Tema", text: "NAV-reformen og måloppnåelse." },
          { label: "Hovedspenning", text: "Omstillingskostnad vs. strukturell utfordring." },
          { label: "Hovedargument", text: "Styring, organisering og stat–kommune-samspill påvirker måloppnåelsen i NAV-kontorene." }
        ];
        payload.list = [
          "Skill mellom omstillingsprosess og varige strukturelle utfordringer.",
          "Analyser hvordan statlig styring og kommunale mål påvirker måloppnåelse.",
          "Vurder kontorstørrelse og lokal organisering i arbeidsrettet oppfølging.",
          "Koble reformevaluering til organisasjonsteori, bakkebyråkrati og governance/samstyring."
        ];
        payload.insightCards = [
          "Hovedinnsikt: NAVs manglende måloppnåelse kan ikke forklares som midlertidig reformstøy alene.",
          "Hovedargument: Statlig styring, kommunale mål og lokal organisering skaper varige strukturelle utfordringer.",
          "Spenning i teksten: Omstillingskostnad versus strukturell forklaring.",
          "Neste analyse: Undersøk hvordan stat–kommune-samspill former arbeidsrettet oppfølging."
        ];
        payload.path = [
          "Definer måloppnåelse i NAV-reformen.",
          "Sorter funn etter omstillingskostnad vs. strukturell forklaring.",
          "Analyser stat–kommune-samspill og kontorstørrelse.",
          "Test tolkningene mot organisasjonsteori og bakkebyråkrati."
        ];
        payload.thoughts = {
          hovedspor: "NAV-reformen bør forstås gjennom strukturelle styrings- og organisasjonsforhold.",
          lose_tanker: "Skille tydelig mellom implementeringsstøy, kommunale mål og varige organisasjonsutfordringer.",
          neste_steg: "Undersøk hvordan statlig styring, kommunale mål og lokal organisering påvirker arbeidsrettet oppfølging."
        };
      } else if (isSahelClimateAcademic) {
        payload.sortItems = [
          { label: "Kort hovedinnsikt", text: "Teksten utfordrer en enkel klimaforklaring på konflikt og peker mot politiske, historiske og maktmessige årsaker." },
          { label: "Hovedargument", text: "Klima og miljø kan være bakgrunnsfaktorer, men konfliktutvikling forklares bedre gjennom politikk, historie, marginalisering og institusjonelle forhold." },
          { label: "Motargument / kritikk", text: "Knapphetsskolens lineære årsakskjede fra miljøforringelse til vold kritiseres for svak empirisk og kontekstuell forklaringskraft." },
          { label: "Spenning i teksten", text: "Spenningen står mellom miljøsikkerhet/knapphetsskolen og politisk økologi." }
        ];
        payload.list = [
          "Skille tydelig mellom empiri, teori og normativ vurdering.",
          "Sammenlikn knapphetsskolen og politisk økologi med samme casegrunnlag.",
          "Vis hvordan politisk marginalisering påvirker konfliktforløp.",
          "Bruk sitater som belegg, men la syntesen være i egne ord.",
          "Avslutt med hva analysen endrer i konfliktforståelsen."
        ];
        payload.insightCards = [
          "Hovedinnsikt: Konflikter i Sahel/Mali kan ikke forklares lineært med klima alene.",
          "Hovedargument: Politikk, historie og maktforhold gir sterkere forklaringskraft enn ressursdeterminisme.",
          "Motargument/kritikk: Knapphetsskolen undervurderer institusjoner, aktørmakt og lokal kontekst.",
          "Spenning i teksten: Miljøsikkerhet og politisk økologi peker på ulike årsakslogikker."
        ];
        payload.path = [
          "Kartlegg hovedpåstand og motpåstand.",
          "Sorter belegg etter forklaringsmodell.",
          "Test modellene mot samme Mali-case.",
          "Formuler syntese med blinde soner og forklaringskraft."
        ];
        payload.thoughts = {
          hovedspor: "Konfliktutvikling forklares best når politiske og historiske forhold vektes tyngre enn lineær knapphet.",
          lose_tanker: "Begreper som miljøsikkerhet, marginalisering og ressursknapphet må avgrenses tydelig for å unngå begrepsglidning.",
          neste_steg: "Velg én empirisk case og vis konkret hva hver modell forklarer – og overser."
        };
      } else if (isLiteraryAttachmentAcademic) {
        payload.reflection = "Teksten undersøker hvordan Karl Ove Knausgårds Om våren kan leses i dialog med tilknytningsteori. Den viser hvordan romanen både bruker psykologiske begreper om tilknytning, trygghet, arbeidsmodeller og relasjonell sårbarhet, og samtidig overskrider teorien gjennom autofiksjon, deiksis, performativ skriving, mytologiske bilder og nymaterialistiske perspektiver. Den faglige spenningen ligger mellom psykologisk teori og litterær erkjennelse.";
        payload.sortItems = [
          { label: "Problemstilling", text: "Hvordan kan Knausgårds Om våren leses i dialog med tilknytningsteori?" },
          { label: "Hovedpåstand", text: "Romanen bekrefter deler av tilknytningsteorien, men overskrider den gjennom litterære, mytologiske og nymaterialistiske perspektiver." },
          { label: "Teoretisk ramme", text: "Bowlbys tilknytningsteori, utviklingspsykologi, parterapi og litteraturvitenskapelig analyse." },
          { label: "Litterær metode", text: "Analyse av autofiksjon, deiksis, tiltaleform, performativitet og relasjonen mellom liv og tekst." },
          { label: "Hovedspenning", text: "Psykologisk tilknytningsteori vs. litterær/mytologisk utforskning av tilknytning, forknytning og løsrivelse." },
          { label: "Implikasjon", text: "Litteraturen kan belyse psykologiske problemstillinger på måter fagpsykologien ikke fullt ut fanger." }
        ];
        payload.insightCards = [
          "Hovedinnsikt: Om våren gjør tilknytning til et eksistensielt og litterært nøkkelbegrep, ikke bare et psykologisk fagbegrep.",
          "Hovedargument: Romanen bekrefter deler av tilknytningsteorien, men viser også dens begrensninger gjennom skildringer av sårbarhet, sykdom, kropp, materialitet og uforklarlige vekstkrefter.",
          "Motargument/kritikk: En ren tilknytningsteoretisk lesning blir for smal fordi romanen åpner for mytologiske, autofiksjonelle og nymaterialistiske forklaringsnivåer.",
          "Spenning: Psykologisk tilknytningsteori står mot romanens bredere litterære utforskning av tilknytning, forknytning og løsrivelse."
        ];
        payload.list = ["Skill mellom tilknytning som psykologisk teori og tilknytning som litterært motiv.","Analyser hvordan deiksis og tiltaleformen skaper et performativt tilknytningsrom.","Vis hvordan romanen skildrer både tilknytning til barnet og løsrivelse fra ektefellen.","Koble Bowlbys teori til autofiksjonens problem om liv, tekst og ansvar.","Drøft hvordan nymaterialisme og mytologiske bilder utvider analysen utover psykologi."];
        payload.path = ["Identifiser romanens bruk av tilknytningsteori.","Analyser deiktisk poetikk og tiltaleform.","Undersøk forholdet mellom far–barn-tilknytning og ekteskapelig løsrivelse.","Sammenlign Knausgårds og Linda Boström Knausgårds perspektiver.","Drøft hvordan nymaterialisme, sårbarhet og mytologi utfordrer en ren psykologisk forklaring."];
        payload.thoughts = { hovedspor: "Knausgårds Om våren leses som en litterær utforskning av tilknytning, løsrivelse og sårbarhet i dialog med psykologisk tilknytningsteori.", lose_tanker: "Autofiksjon, deiksis, Bowlby, Linda Boström Knausgård, nymaterialisme og Valborg-motivet bør holdes analytisk adskilt før de kobles.", neste_steg: "Skill tydelig mellom hva tilknytningsteorien forklarer, og hva romanens litterære form, materialitet og mytologi tilfører." };
        payload.subjectMatches = ["Litteraturvitenskap","Psykologi","Tilknytningsteori","Autofiksjon","Narratologi","Deiksis","Nymaterialisme","Virkelighetslitteratur"];
      } else if (hasAttachmentTheoryEvidence) {
        payload.sortItems = [
          { label: "Problemstilling", text: "Hvordan brukes tilknytningsteori i tekstens analyse?" },
          { label: "Hovedpåstand", text: "Teksten bruker tilknytning som tolkningsramme for relasjon, trygghet og sårbarhet." },
          { label: "Teori", text: "Tydeliggjør hvilke begreper fra tilknytningsteori som faktisk brukes i materialet." },
          { label: "Implikasjon", text: "Skill mellom hva teorien forklarer, og hva teksten selv tilfører gjennom form og tolkning." }
        ];
        payload.list = [
          "Definer sentrale tilknytningsbegreper presist.",
          "Koble teori direkte til konkrete tekstbelegg.",
          "Skill mellom observasjon, tolkning og teoretisk påstand.",
          "Vurder alternative forklaringer på samme materiale."
        ];
        payload.insightCards = [
          "Hovedinnsikt: Tilknytningsteori brukes som analytisk ramme for relasjonelle mønstre.",
          "Hovedargument: Teorien må forankres i konkrete tekstbelegg for å gi forklaringskraft.",
          "Motargument/kritikk: En for bred teorianvendelse kan skjule tekstens egne nyanser.",
          "Neste analyse: Skill tydelig mellom teori, metode, empiri og tolkning."
        ];
        payload.path = [
          "Avklar problemstilling og begrepsbruk.",
          "Sorter belegg etter teori, metode og empiri.",
          "Test hovedtolkning mot et alternativ.",
          "Formuler en nøktern faglig syntese."
        ];
      } else {
        payload.sortItems = [
          { label: "Problemstilling", text: "Hva er tekstens sentrale faglige spørsmål?" },
          { label: "Hovedpåstand", text: "Teksten argumenterer for en tydelig faglig tolkning som bør testes mot alternative forklaringer." },
          { label: "Faglig spenning", text: "Spenningen ligger mellom hovedforklaring og alternative forståelser i materialet." },
          { label: "Implikasjon", text: "Presiser metode, teori og empiri for å styrke analysens forklaringskraft." }
        ];
      }
    }
    return payload;
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

  async function renderAutoOutputs(userText, ahaReply, options = {}) {
    const sourceText = String(userText || "");
    const host = document.getElementById("aha-auto-output");
    if (!sourceText.trim()) {
      if (host) {
      const run = options.analysisRun || getActiveAnalysisRun() || {};
      host.dataset.sourceText = sourceText;
      host.dataset.analysisId = run.analysisId || "";
      host.dataset.runId = run.runId || "";
      host.dataset.sourceId = run.sourceId || "";
      host.dataset.sourceTextHash = sourceHash(sourceText);
      host.dataset.sourceTextPreview = sourceText.replace(/\s+/g, " ").slice(0, 180);
    }
      return;
    }
    let payload;
    try {
      payload = buildAutoOutputs(userText, ahaReply);
    } catch (err) {
      console.warn("buildAutoOutputs feilet; bruker fallback-payload", {
        error: err?.message || String(err),
        stack: err?.stack || "",
        textType: detectTextType(sourceText),
        sourcePreview: short(sourceText, 220)
      });
      payload = buildAutoOutputFallbackPayload(userText, ahaReply, options);
    }
    const linkInfo = getUrlDominanceInfo(sourceText);
    const articleAnalysis = linkInfo.isSourceAction ? (payload.articleAnalysis || global.AHALinkReader?.getLatestArticleAnalysis?.()) : null;
    const effectiveSourceText = articleAnalysis ? buildArticleSourceTextFromAnalysis(articleAnalysis) : sourceText;
    const domain = detectAutoAnalysisDomain(effectiveSourceText, payload);
    const primarySubjectMatches = normalizeSubjectMatches(Array.isArray(options.subjectMatches) ? options.subjectMatches : []);
    payload.subjectMatches = primarySubjectMatches;
    if (!articleAnalysis && !primarySubjectMatches.length && global.AHACalibration?.matchText) {
      try {
        const calibrated = global.AHACalibration.matchText(sourceText, { topN: 10 });
        const calibratedMatches = subjectMatchesFromCalibration(calibrated);
        if (calibratedMatches.length) payload.subjectMatches = calibratedMatches;
      } catch (err) {
        console.warn("AHACalibration.matchText feilet", err);
      }
    }
    if (domain === "literary_attachment") {
      payload.subjectMatches = getLiterarySubjectMatches();
      payload.subjectLinks = getLiterarySubjectMatches();
      payload.path = getLiteraryAttachmentLearningPath();
    }
    if (articleAnalysis && isSportsArticleAnalysis(articleAnalysis)) {
      payload.subjectMatches = payload.subjectMatches || [];
      payload.subjectLinks = payload.subjectMatches;
      payload.theoryLinks = [];
      if (payload.ahaSer) payload.ahaSer.fagkoblinger = ["Sport", "Fotball", "Turneringsspill", "Prestasjon", "Psykologi/press", "Medier/sportsjournalistikk"].filter((item) => (articleAnalysis.concepts || []).join(" ").toLowerCase().includes(item.toLowerCase().split("/")[0]) || ["Sport", "Fotball", "Turneringsspill", "Prestasjon", "Psykologi/press", "Medier/sportsjournalistikk"].includes(item));
    }
    payload = (!AHA_RUNTIME_KNOWLEDGE_POLICY.legacyArticleTemplatesEnabled && detectTextType(effectiveSourceText) === "academic_article")
      ? applyRuntimeKnowledgePolicy(payload, effectiveSourceText)
      : filterCrossDomainAutoPayload(payload, effectiveSourceText);
    payload = enforceCanonicalSourceGrounding(payload, effectiveSourceText);
    const jsCanonicalAnalysis = buildCanonicalAnalysis(payload, effectiveSourceText);
    const resolvedCanonical = await resolveCanonicalAnalysisWithOptionalPythonEngine({
      message: effectiveSourceText,
      assistantReply: ahaReply,
      historyGoContext: { subjectMatches: payload.subjectMatches || [] },
      fallbackAnalysis: jsCanonicalAnalysis
    });
    const activeRun = options.analysisRun || getActiveAnalysisRun();
    if (!isActiveAnalysisRun(activeRun)) return;
    payload.canonicalAnalysis = resolvedCanonical.analysis;
    payload.canonicalAnalysisMeta = resolvedCanonical.meta;
    payload = enforceCanonicalSourceGrounding(payload, effectiveSourceText);
    bindAnalysisArtifact(payload, activeRun);
    if (payload.canonicalAnalysis && typeof payload.canonicalAnalysis === "object") bindAnalysisArtifact(payload.canonicalAnalysis, activeRun);
    if (options.persist !== false) {
      localStorage.setItem(AUTO_OUTPUT_STORAGE_KEY, JSON.stringify({
        activeRun: activeRun || null,
        payload,
        sourceText,
        analysisId: payload.analysisId || "",
        analysisRunId: payload.analysisRunId || payload.runId || "",
        runId: payload.runId || payload.analysisRunId || "",
        conversationId: payload.conversationId || payload.sessionId || CHAT_THREAD_ID,
        turnId: payload.turnId || "",
        sourceId: payload.sourceId || "",
        sourceKind: payload.sourceKind || (linkInfo.isSourceAction ? "url" : "pasted_text"),
        sessionId: payload.sessionId || payload.conversationId || CHAT_THREAD_ID,
        sourceHash: payload.sourceHash || sourceHash(sourceText),
        sourceFingerprint: payload.sourceFingerprint || sourceHash(sourceText),
        sourceTextHash: sourceHash(sourceText),
        sourceTextPreview: sourceText.replace(/\s+/g, " ").slice(0, 180),
        createdAt: new Date().toISOString()
      }));
    }
    if (host) {
      host.dataset.sourceText = sourceText;
      host.dataset.analysisId = payload.analysisId || "";
      host.dataset.analysisRunId = payload.analysisRunId || payload.runId || "";
      host.dataset.runId = payload.runId || payload.analysisRunId || "";
      host.dataset.sourceId = payload.sourceId || "";
      host.dataset.sourceTextHash = sourceHash(sourceText);
      host.dataset.sourceTextPreview = sourceText.replace(/\s+/g, " ").slice(0, 180);
    }
    renderAutoOutputPayload(payload);
    setExportButtonsEnabled(true);
  }


  function forceLiteraryFagkoblingerInReply(replyText, sourceText, payload = {}) {
    if (detectAutoAnalysisDomain(sourceText, payload) !== "literary_attachment") return String(replyText || "");
    const section = ["FAGKOBLINGER", ...getLiterarySubjectMatches().map((item) => item?.title || item?.subject_label || "").filter(Boolean)].join("\n");
    return replaceAllFagkoblingerSections(replyText, section);
  }

  function forceInstitutionalMediaHistoryFagkoblingerInReply(replyText, sourceText, payload = {}) {
    if (detectAutoAnalysisDomain(sourceText, payload) !== "institutional_media_history") return String(replyText || "");
    const section = ["FAGKOBLINGER", ...getInstitutionalMediaHistorySubjectMatches(sourceText, payload).map((item) => item?.title || item?.subject_label || "").filter(Boolean)].join("\n");
    return replaceAllFagkoblingerSections(replyText, section);
  }

  function replaceAllFagkoblingerSections(replyText, section) {
    const text = String(replyText || "");
    const normalizedSection = String(section || "").trim();
    if (!normalizedSection) return text;
    const sectionRegex = /(?:^|\n)FAGKOBLINGER[\s\S]*?(?=\n[A-ZÆØÅ][A-ZÆØÅ0-9 _-]{2,}\n|$)/gi;
    const matches = text.match(sectionRegex) || [];
    const normalizedMatches = matches.map((item) => String(item || "").trim()).filter(Boolean);
    if (normalizedMatches.length === 1 && normalizedMatches[0] === normalizedSection) return text;
    const stripped = text
      .replace(sectionRegex, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return `${stripped}\n\n${normalizedSection}`.trim();
  }

  function stripFagkoblingerSections(replyText) {
    return String(replyText || "")
      .replace(/(?:^|\n)FAGKOBLINGER[\s\S]*?(?=\n[A-ZÆØÅ][A-ZÆØÅ0-9 _-]{2,}\n|$)/gi, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }


  // AHA Chat viser ett relevant hovedsvar med passende lengde. Tekstnormaliseringen
  // ligger i ahaChatReplyFormat.js; her beholdes en tynn delegerende wrapper.
  function normalizeAhaVisibleReply(rawReply, userText) {
    return global.AHAChatReplyFormat.normalizeAhaVisibleReply(rawReply, userText);
  }

  function focusAutoCard(action) {
    const host = document.getElementById("aha-auto-output");
    if (!host) return;
    host.querySelectorAll(".auto-card").forEach((card) => card.classList.remove("is-focused"));
    const target = host.querySelector(`[data-auto-card="${action}"]`);
    if (!target) return;
    target.classList.add("is-focused");
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function restoreAutoOutputFromStorage() {
    const cache = loadAutoOutputs();
    setExportButtonsEnabled(Boolean(cache?.payload));
    if (!cache) {
      // Ingen lagret analyse, men kammeret kan ha innsikter og kart som
      // Explorer-fanene skal vise ved sidelast.
      refreshAhaExplorer();
      return;
    }
    const payload = cache?.payload && typeof cache.payload === "object" ? cache.payload : cache;
    const sourceText = String(cache?.sourceText || "");
    const cachedRun = { analysisId: cache.analysisId || payload.analysisId || `analysis_${cache.sourceTextHash || sourceHash(sourceText)}`, analysisRunId: cache.analysisRunId || cache.runId || payload.analysisRunId || payload.runId || "restored", runId: cache.runId || cache.analysisRunId || payload.runId || payload.analysisRunId || "restored", conversationId: cache.conversationId || cache.sessionId || payload.conversationId || payload.sessionId || CHAT_THREAD_ID, turnId: cache.turnId || payload.turnId || "", sourceId: cache.sourceId || payload.sourceId || `source_${cache.sourceTextHash || sourceHash(sourceText)}`, sourceKind: cache.sourceKind || payload.sourceKind || "chat", topicLabel: cache.topicLabel || payload.topicLabel || takeKeywords(sourceText, 4).join(" · "), sessionId: cache.sessionId || cache.conversationId || payload.sessionId || payload.conversationId || CHAT_THREAD_ID, createdAt: cache.createdAt || payload.createdAt || new Date().toISOString(), sourceHash: cache.sourceHash || cache.sourceTextHash || sourceHash(sourceText), sourceFingerprint: cache.sourceFingerprint || cache.sourceTextHash || sourceHash(sourceText) };
    setActiveAnalysisRun(cachedRun);
    bindAnalysisArtifact(payload, cachedRun);
    const host = document.getElementById("aha-auto-output");
    if (host) {
      host.dataset.sourceText = sourceText;
      host.dataset.analysisId = payload.analysisId || "";
      host.dataset.analysisRunId = payload.analysisRunId || payload.runId || "";
      host.dataset.runId = payload.runId || payload.analysisRunId || "";
      host.dataset.sourceId = payload.sourceId || "";
      host.dataset.sourceTextHash = sourceHash(sourceText);
      host.dataset.sourceTextPreview = sourceText.replace(/\s+/g, " ").slice(0, 180);
    }
    renderAutoOutputPayload(payload);
    setExportButtonsEnabled(true);
  }

  // ── Meta Insights AI-session ─────────────────────────────
  // Når AHA Home starter en agentsesjon ("Tenk med Meta AI"), kommer
  // payloaden inn via aha_pending_chat_prompt_v1 med type
  // meta_insights_ai_session. Chatten prefyller agentprompten, viser en
  // session-boks og parser AI-svaret til claims som brukeren kan gi
  // feedback på. Feedback lagres lokalt i AHAMetaInsightsMemory.
  let activeMetaAiSession = null;

  function getActiveMetaAiSession() {
    return activeMetaAiSession;
  }

  function appendMetaAiLine(parent, className, text) {
    const el = document.createElement("div");
    el.className = className;
    el.textContent = text;
    parent.appendChild(el);
    return el;
  }

  function renderMetaAiSessionBox(session) {
    const log = document.getElementById("chat-log");
    if (!log || !session) return null;
    const summary = session.agentContext?.algorithmicSummary || {};
    const readiness = summary.readiness || {};
    const themes = (Array.isArray(summary.strongest_themes) ? summary.strongest_themes : []).slice(0, 3);
    const concepts = (Array.isArray(summary.strongest_concepts) ? summary.strongest_concepts : []).slice(0, 3);
    const box = document.createElement("section");
    box.className = "meta-ai-session-box";
    box.setAttribute("aria-label", "Meta Insights AI-session");
    box.dataset.sessionId = String(session.sessionId || "");
    appendMetaAiLine(box, "meta-ai-session-title", "Meta Insights AI");
    appendMetaAiLine(box, "meta-ai-session-row", `Session: ${session.sessionId || "ukjent"}`);
    appendMetaAiLine(box, "meta-ai-session-row", `Beredskap: ${readiness.level || "ukjent"} (${Number(readiness.score) || 0}/100)`);
    appendMetaAiLine(box, "meta-ai-session-row", `Læringsmodus: ${summary.learning_mode || "ukjent"}`);
    appendMetaAiLine(box, "meta-ai-session-row", `Topp temaer: ${themes.join(", ") || "ingen ennå"}`);
    appendMetaAiLine(box, "meta-ai-session-row", `Topp begreper: ${concepts.join(", ") || "ingen ennå"}`);
    log.appendChild(box);
    log.scrollTop = log.scrollHeight;
    updateEmptyState();
    return box;
  }

  function startMetaAiSession(payload) {
    activeMetaAiSession = {
      sessionId: String(payload?.sessionId || ""),
      createdAt: String(payload?.createdAt || ""),
      agentContext: payload?.agentContext && typeof payload.agentContext === "object" ? payload.agentContext : null
    };
    renderMetaAiSessionBox(activeMetaAiSession);
    setStatusNote("Meta Insights AI-session er klar. Send prompten for å la AHA tenke høyt.");
    return activeMetaAiSession;
  }

  function saveMetaAiClaimFeedback(claim, response, statusEl) {
    const memoryApi = global.AHAMetaInsightsMemory;
    const report = (text) => {
      if (statusEl) statusEl.textContent = text;
      setStatusNote(text);
    };
    if (!memoryApi || typeof memoryApi.addFeedback !== "function") {
      report("Meta-minnet er ikke tilgjengelig.");
      return null;
    }
    const result = memoryApi.addFeedback({
      sessionId: activeMetaAiSession?.sessionId || "",
      claimId: claim?.id || "",
      claimText: claim?.text || "",
      response,
      basis: Array.isArray(claim?.basis) ? claim.basis : [],
      confidence: Number(claim?.confidence) || 0
    });
    report(result?.ok ? `Feedback lagret: «${response}».` : "Kunne ikke lagre feedback.");
    return result;
  }

  function renderMetaAiClaimCard(parent, claim) {
    const card = document.createElement("article");
    card.className = "meta-ai-claim-card";
    card.dataset.claimId = String(claim.id || "");
    appendMetaAiLine(card, "meta-ai-claim-text", claim.text);
    if (Array.isArray(claim.basis) && claim.basis.length) {
      appendMetaAiLine(card, "meta-ai-claim-basis", `Grunnlag: ${claim.basis.join("; ")}`);
    }
    appendMetaAiLine(card, "meta-ai-claim-confidence", `Confidence: ${Number(claim.confidence) || 0}`);
    const statusEl = appendMetaAiLine(card, "meta-ai-claim-status", "");
    const buttonRow = document.createElement("div");
    buttonRow.className = "meta-ai-claim-feedback";
    const labels = { stemmer: "Stemmer", delvis: "Delvis", feil: "Feil", viktig: "Viktig", utdatert: "Utdatert" };
    ["stemmer", "delvis", "feil", "viktig", "utdatert"].forEach((response) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "meta-ai-feedback-btn";
      btn.dataset.feedbackResponse = response;
      btn.textContent = labels[response];
      btn.addEventListener("click", () => saveMetaAiClaimFeedback(claim, response, statusEl));
      buttonRow.appendChild(btn);
    });
    card.appendChild(buttonRow);
    parent.appendChild(card);
    return card;
  }

  function renderMetaAiClaims(parsed) {
    const log = document.getElementById("chat-log");
    if (!log) return null;
    const section = document.createElement("section");
    section.className = "meta-ai-claims";
    section.setAttribute("aria-label", "Meta Insights AI-hypoteser");
    if (parsed?.ok && Array.isArray(parsed.claims) && parsed.claims.length) {
      appendMetaAiLine(section, "meta-ai-claims-title", "AHA sine meta-hypoteser – gi feedback:");
      parsed.claims.forEach((claim) => renderMetaAiClaimCard(section, claim));
      (parsed.questions || []).slice(0, 3).forEach((question) => {
        appendMetaAiLine(section, "meta-ai-question", `Spørsmål: ${question}`);
      });
      if (parsed.suggested_next_step) {
        appendMetaAiLine(section, "meta-ai-next-step", `Foreslått neste steg: ${parsed.suggested_next_step}`);
      }
    } else {
      // Fritekstsvar håndteres rolig: feedback-modulen står klar til
      // neste strukturerte svar.
      appendMetaAiLine(section, "meta-ai-claims-title", "AHA svarte i fritekst. Feedback-knappene aktiveres når svaret kommer strukturert.");
    }
    log.appendChild(section);
    log.scrollTop = log.scrollHeight;
    updateEmptyState();
    return section;
  }

  function maybeHandleMetaAiAgentReply(rawReply) {
    if (!activeMetaAiSession) return null;
    const agentApi = global.AHAMetaInsightsAgent;
    if (!agentApi || typeof agentApi.parseAgentResponse !== "function") return null;
    let parsed = null;
    try {
      parsed = agentApi.parseAgentResponse(rawReply);
    } catch {
      return null;
    }
    renderMetaAiClaims(parsed);
    return parsed;
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

  async function submitAhaChatMessage(text, textarea = null) {
    const cleanText = String(text || "").trim();
    if (!cleanText) return null;
    const urlInfo = getUrlDominanceInfo(cleanText);
    const transientAnalysisDocument = isTransientAnalysisDocument(cleanText, urlInfo);
    const savingEnabled = isAhaSavingEnabled();
    const persistedUserMessage = savingEnabled ? global.AHAChatPersistence?.appendUserMessage?.(cleanText, { source: "aha_chat", threadId: CHAT_THREAD_ID, skip_insight: urlInfo.isSourceAction || transientAnalysisDocument, sourceRole: transientAnalysisDocument ? "analysis_source" : "user_memory", knowledgeEligible: !transientAnalysisDocument, memoryEligible: !transientAnalysisDocument, curationRequired: transientAnalysisDocument }) : null;
    renderAhaChatMemoryStatus();
    appendChat("user", cleanText);
    let linkReadPromise = null;
    if (global.AHALinkReader?.hasUrls?.(cleanText)) {
      linkReadPromise = global.AHALinkReader.processUrlsFromMessage(cleanText, {
        subject_id: SUBJECT_ID,
        theme_id: getThemeId(),
        field_id: getFieldId()
      }).catch((err) => {
        console.warn("AHA Link Reader feilet", err?.message || err);
      });
    }
    if (urlInfo.isSourceAction) {
      global.AHAIngest?.ingest?.({ source_type: "chat_source_action", source_app: "aha_chat", content_type: "url", title: "AHA Chat-lenke", text: cleanText, user_created: true, imported: false, skip_insight: true, created_at: new Date().toISOString(), meta: { skip_insight: true, url_only: urlInfo.urlOnly, url_dominated: urlInfo.urlDominated } });
    }
    if (isAhaMemoryQuestion(cleanText)) {
      if (textarea) textarea.value = "";
      setAhaProcessing(true, "AHA leser minnestatus …");
      try {
        const memoryStatus = await buildAhaMemoryStatus();
        renderAhaMemoryStatus(memoryStatus);
        const learningReply = buildAhaLearningContractReply(memoryStatus);
        if (savingEnabled) global.AHAChatPersistence?.appendAssistantMessage?.(learningReply, { source: "aha_chat", threadId: CHAT_THREAD_ID, tags: ["minne", "læring", "innsiktskammer"] });
        renderAhaChatMemoryStatus();
        appendChat("aha", learningReply, { categoryChips: ["minne", "læring", "innsiktskammer"] });
        return { type: "learning_contract", memoryStatus };
      } catch (err) {
        console.warn("AHA Learning Contract kunne ikke lese status", err);
        if (savingEnabled) global.AHAChatPersistence?.appendAssistantMessage?.("Minnestatus kunne ikke leses akkurat nå.", { source: "aha_chat", threadId: CHAT_THREAD_ID, tags: ["status"] });
        renderAhaChatMemoryStatus();
        appendChat("aha", "Minnestatus kunne ikke leses akkurat nå.");
        return { type: "learning_contract", error: err };
      } finally {
        setAhaProcessing(false);
        void updateAhaMemoryStatus();
      }
    }

    const sourceKind = urlInfo.isSourceAction ? "url" : "pasted_text";
    const analysisRun = createAnalysisRun(cleanText, { sourceId: persistedUserMessage?.id ? `chat_message_${persistedUserMessage.id}` : undefined, sourceKind });
    setActiveAnalysisRun(analysisRun);
    clearActiveAnalysisState(analysisRun);
    const memoryUseEnabled = isAhaMemoryUseEnabled();
    setAhaProcessing(true, memoryUseEnabled ? "AHA vurderer relevant minne …" : "AHA svarer uten tidligere minne …");
    if (urlInfo.isSourceAction && linkReadPromise) {
      setAhaProcessing(true, "AHA leser artikkelen …");
      await linkReadPromise;
    }
    const analysisInputText = urlInfo.isSourceAction ? (buildArticleSourceTextFromAnalysis(global.AHALinkReader?.getLatestArticleAnalysis?.() || {}) || cleanText) : cleanText;
    const rawMemoryContext = memoryUseEnabled ? await buildAhaMemoryContext(analysisInputText) : buildAhaMemoryOffContext();
    if (!isActiveAnalysisRun(analysisRun)) return null;
    const memoryContext = filterMemoryContextForActiveSource(rawMemoryContext, analysisInputText, analysisRun);
    const personalContext = filterRetrievalForActiveSource(buildAhaPersonalMessageContext(analysisInputText), analysisInputText, analysisRun);
    const answerPackage = filterRetrievalForActiveSource(buildAhaAnswerPackage(analysisInputText), analysisInputText, analysisRun);
    if (!isActiveAnalysisRun(analysisRun)) return null;
    if (personalContext && answerPackage) personalContext.answerPackage = answerPackage;
    renderAhaPersonalRetrieval(personalContext?.retrieval);
    renderAhaAnswerComposer(answerPackage);
    if (personalContext?.retrieval?.results?.length) {
      setStatusNote(`Personlig kontekst aktiv · Personlig søk aktiv · ${personalContext.retrieval.results.length} relevante treff.`);
    } else if (personalContext?.prompt) setStatusNote("Personlig kontekst aktiv.");
    if (answerPackage?.status?.ready) setStatusNote(`AHA Answer Composer aktiv · ${answerPackage.status.intent} · ${answerPackage.status.selectedSourceCount} kilder.`);
    renderAhaPersonalContextStatus();
    renderAhaPersonalAiLoopStatus();
    let count = 0;
    if (savingEnabled && !urlInfo.isSourceAction && !transientAnalysisDocument) {
      count = handleUserMessage(cleanText);
      void handleUserMessageInsightCandidatesInBackground(cleanText)
        .then((aiCount) => {
          if (aiCount > 0) setStatusNote(`Beriket med ${aiCount} AI-signal${aiCount === 1 ? "" : "er"} i bakgrunnen.`);
        })
        .catch((err) => {
          console.warn("AI insight-candidates bakgrunnsjobb feilet", err);
        });
    }
    if (textarea) textarea.value = "";
    if (savingEnabled && count > 0) setStatusNote(`Lagret ${count} signal${count === 1 ? "" : "er"} i bakgrunnen.`);
    if (!savingEnabled) setStatusNote("Lagring av nye innsikter er slått av.");
    if (memoryContext.used) setStatusNote("Bruker relevant AHA-minne.");
    void updateAhaMemoryStatus();
    setAhaProcessing(true, "AHA analyserer teksten …");
    try {
      setAhaProcessing(true, savingEnabled ? "AHA lager svar og etterarbeid …" : "AHA lager svar uten å lagre nye innsikter …");
      const agent = await askAhaAgent(analysisInputText, { memoryContext, personalContext });
      if (!isActiveAnalysisRun(analysisRun)) return null;
      const reply = String(agent?.reply || "").trim() || "AHA-agenten returnerte tomt svar.";
      const analysisText = cleanArticleText(analysisInputText);
      const rawSubjectMatches = global.AHASubjectEngine?.matchText
        ? await global.AHASubjectEngine.matchText(analysisText, { source: "chat", textType: detectTextType(cleanText) })
        : [];
      if (!isActiveAnalysisRun(analysisRun)) return null;
      const climateEnriched = enrichSubjectMatchesForClimateConflict(analysisText, rawSubjectMatches);
      const publicAdminEnriched = enrichSubjectMatchesForPublicAdministration(analysisText, climateEnriched);
      const domain = detectAutoAnalysisDomain(analysisText, { reflection: reply, subjectMatches: publicAdminEnriched });
      const subjectMatches = domain === "literary_attachment"
        ? getLiterarySubjectMatches()
        : domain === "institutional_media_history"
          ? getInstitutionalMediaHistorySubjectMatches(analysisText)
          : publicAdminEnriched;
      let safeReply = reply;
      if (domain === "literary_attachment" || domain === "institutional_media_history") {
        safeReply = stripFagkoblingerSections(safeReply);
      } else {
        safeReply = forceLiteraryFagkoblingerInReply(safeReply, analysisText, { subjectMatches });
        safeReply = forceInstitutionalMediaHistoryFagkoblingerInReply(safeReply, analysisText, { subjectMatches });
      }
      const visibleReply = normalizeAhaVisibleReply(safeReply, cleanText) || safeReply;
      if (!isActiveAnalysisRun(analysisRun)) return null;
      const categoryChips = memoryUseEnabled ? suggestCategoryChips() : [];
      const persistedAssistantMessage = savingEnabled ? global.AHAChatPersistence?.appendAssistantMessage?.(visibleReply, { source: "aha_chat", threadId: CHAT_THREAD_ID, answerPackageId: answerPackage?.id, intent: answerPackage?.status?.intent, retrievalSummary: personalContext?.retrieval?.summary || memoryContext?.reason || "", tags: categoryChips, concepts: subjectMatches?.map?.((m)=>m.label||m.title||m.id).filter(Boolean) }) : null;
      if (persistedAssistantMessage?.id && answerPackage) global.AHAChatPersistence?.attachAnswerPackage?.(persistedAssistantMessage.id, answerPackage);
      renderAhaChatMemoryStatus();
      const ahaRow = appendChat("aha", visibleReply, { categoryChips, subjectMatches, memoryContext });
      const answerEvaluation = evaluateAhaAnswerForChat(cleanText, visibleReply, answerPackage, ahaRow);
      if (persistedAssistantMessage?.id && answerEvaluation) global.AHAChatPersistence?.attachAnswerEvaluation?.(persistedAssistantMessage.id, answerEvaluation);
      renderAhaChatMemoryStatus();
      // Meta Insights AI-session: parse rå-svaret (før visningsnormalisering)
      // til claims med feedback-knapper.
      try { maybeHandleMetaAiAgentReply(reply); } catch (metaErr) { console.warn("Meta Insights AI-claims feilet", metaErr); }
      if (!isActiveAnalysisRun(analysisRun)) return null;
      try { await renderAutoOutputs(cleanText, safeReply, { subjectMatches: urlInfo.isSourceAction ? [] : subjectMatches, persist: savingEnabled, analysisRun }); } catch (autoErr) { console.warn("Auto-output feilet", autoErr); }
      if (!isActiveAnalysisRun(analysisRun)) return null;
      if (savingEnabled) {
        try { ensureAfterworkForLatestAnalysis(cleanText, { subjectMatches: urlInfo.isSourceAction ? [] : subjectMatches, ...analysisRun }); } catch (afterErr) { console.warn("Auto-etterarbeid feilet", afterErr); }
        // AHA-agentens egne svar skal vises i chatten og logges som
        // source event, men IKKE bli en ordinær brukerinnsikt. AI-
        // oppsummeringer hører ikke hjemme i innsiktskammeret. skip_insight
        // får AHAIngest til å stoppe etter source-event-loggen.
        global.AHAIngest?.ingest?.({
          source_type: "aha_agent",
          source_app: "aha_chat",
          content_type: "text",
          title: "AHA-agent svar",
          text: visibleReply,
          user_created: false,
          imported: false,
          skip_insight: true,
          created_at: new Date().toISOString(),
          meta: {
            response_id: agent?.response_id || null,
            model: agent?.model || null,
            raw_reply: visibleReply === safeReply ? null : safeReply,
            memory_context_used: Boolean(memoryContext.used),
            memory_context_reason: memoryContext.used ? memoryContext.reason : null,
            personal_context_used: Boolean(personalContext?.prompt),
            personal_context_evidence: personalContext?.context?.evidence || null,
            answer_composer_status: answerPackage?.status || null,
            answer_evaluation: answerEvaluation ? { status: answerEvaluation.status, score: answerEvaluation.score } : null
          }
        });
      }
      return { type: "agent_reply", agent, memoryContext, personalContext, answerPackage, savingEnabled, memoryUseEnabled };
    } catch (err) {
      console.warn("AHA-agent utilgjengelig", err);
      if (!isActiveAnalysisRun(analysisRun)) return null;
      if (savingEnabled) global.AHAChatPersistence?.appendAssistantMessage?.("AHA-agenten er ikke tilgjengelig akkurat nå.", { source: "aha_chat", threadId: CHAT_THREAD_ID, tags: ["status"] });
      renderAhaChatMemoryStatus();
      appendChat("aha", "AHA-agenten er ikke tilgjengelig akkurat nå.");
      try { await renderAutoOutputs(cleanText, "", { subjectMatches: [], persist: savingEnabled, analysisRun }); } catch (autoErr) { console.warn("Auto-output feilet", autoErr); }
      if (savingEnabled && isActiveAnalysisRun(analysisRun)) {
        try { ensureAfterworkForLatestAnalysis(cleanText, { subjectMatches: [], ...analysisRun }); } catch (afterErr) { console.warn("Auto-etterarbeid feilet", afterErr); }
      }
      return { type: "agent_error", error: err, memoryContext, personalContext, answerPackage, savingEnabled, memoryUseEnabled };
    } finally {
      if (isActiveAnalysisRun(analysisRun)) {
        setAhaProcessing(false);
        void updateAhaMemoryStatus();
      }
    }
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

  global.AHAChat = {
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

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})(window);
