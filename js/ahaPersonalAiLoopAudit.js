// AHA Personal AI Loop Audit V1 – lokal og read-only validering av kjeden
// godkjent materiale → personlig retrieval → RAG → AHA Chat.
(function (global) {
  "use strict";

  const STORAGE_KEY = "aha_personal_ai_loop_audit_v1";
  const DEFAULT_QUERY = "Hva vet AHA om mine viktigste prosjekter og begreper?";
  const MODULES = [
    "AHAChatPersonalContext",
    "AHAPersonalRetrieval",
    "AHAMetaInsightsMemory",
    "AHATrainingCorpus",
    "AHATrainingExamples",
    "AHAPersonalModelReadiness"
  ];

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function asText(value) { return String(value ?? "").trim(); }
  function safeCall(fn, fallback) {
    try { return typeof fn === "function" ? fn() : fallback; } catch { return fallback; }
  }
  function latestTimestamp(items) {
    return asArray(items).reduce((latest, item) => {
      const time = Date.parse(item?.updatedAt || item?.createdAt || "");
      return Number.isFinite(time) ? Math.max(latest, time) : latest;
    }, 0);
  }
  function approvedCorpusItems() {
    return asArray(safeCall(() => global.AHATrainingCorpus?.loadCorpus?.(), []))
      .filter((item) => item?.status === "approved"
        && (item?.consent?.useForKnowledge === true || item?.consent?.useForMemory === true));
  }
  function approvedExampleItems() {
    return asArray(safeCall(() => global.AHATrainingExamples?.loadExamples?.(), []))
      .filter((item) => item?.status === "approved");
  }
  function getReadOnlyIndex(options = {}) {
    const api = global.AHAPersonalRetrieval;
    const saved = safeCall(() => api?.loadRetrievalIndex?.(), null);
    if (saved) return { index: saved, persisted: true };
    const built = safeCall(() => api?.buildRetrievalIndex?.(options), null);
    return { index: built, persisted: false };
  }

  function checkDataSources() {
    const modules = {};
    MODULES.forEach((name) => { modules[name] = Boolean(global[name] && typeof global[name] === "object"); });
    const missing = MODULES.filter((name) => !modules[name]);
    return { ok: missing.length === 0, modules, missing, availableCount: MODULES.length - missing.length };
  }

  function checkApprovedMaterial() {
    const memory = asObject(safeCall(() => global.AHAMetaInsightsMemory?.summarizeMemory?.(), {}));
    const corpus = asArray(safeCall(() => global.AHATrainingCorpus?.loadCorpus?.(), []));
    const examples = asArray(safeCall(() => global.AHATrainingExamples?.loadExamples?.(), []));
    const approvedCorpus = corpus.filter((item) => item?.status === "approved");
    const approvedExamples = examples.filter((item) => item?.status === "approved");
    const examplesByTaskType = {};
    approvedExamples.forEach((item) => {
      const taskType = asText(item?.taskType) || "unknown";
      examplesByTaskType[taskType] = (examplesByTaskType[taskType] || 0) + 1;
    });
    const result = {
      ok: Boolean(asArray(memory.confirmedClaims).length || asArray(memory.importantClaims).length || approvedCorpus.length || approvedExamples.length),
      confirmedClaims: asArray(memory.confirmedClaims).length,
      importantClaims: asArray(memory.importantClaims).length,
      approvedCorpus: approvedCorpus.length,
      approvedExamples: approvedExamples.length,
      knowledgeAllowedCorpus: approvedCorpus.filter((item) => item?.consent?.useForKnowledge === true).length,
      memoryAllowedCorpus: approvedCorpus.filter((item) => item?.consent?.useForMemory === true).length,
      examplesByTaskType
    };
    return result;
  }

  function checkRetrievalIndex() {
    const api = global.AHAPersonalRetrieval;
    const status = asObject(safeCall(() => api?.getRetrievalStatus?.(), {}));
    const index = safeCall(() => api?.loadRetrievalIndex?.(), null);
    const corpus = approvedCorpusItems();
    const examples = approvedExampleItems();
    const memory = asObject(safeCall(() => global.AHAMetaInsightsMemory?.loadMemory?.(), {}));
    const approvedExists = checkApprovedMaterial().ok;
    const builtAt = Date.parse(status.lastBuiltAt || "");
    const latestSourceUpdate = Math.max(latestTimestamp(corpus), latestTimestamp(examples), Date.parse(memory.updatedAt || "") || 0);
    const needsRefresh = !index
      || (Number(status.indexedItems) === 0 && approvedExists)
      || (latestSourceUpdate > 0 && (!Number.isFinite(builtAt) || builtAt < latestSourceUpdate));
    return {
      ok: Boolean(status.available) && !needsRefresh,
      available: Boolean(status.available),
      indexedItems: Number(status.indexedItems) || 0,
      corpusItems: Number(status.corpusItems) || 0,
      examples: Number(status.examples) || 0,
      memoryClaims: Number(status.memoryClaims) || 0,
      lastBuiltAt: asText(status.lastBuiltAt),
      needsRefresh
    };
  }

  function simulateQuery(query, options = {}) {
    const value = asText(query) || DEFAULT_QUERY;
    const chatApi = global.AHAChatPersonalContext;
    const retrievalApi = global.AHAPersonalRetrieval;
    const readOnlyIndex = getReadOnlyIndex(options);
    const queryOptions = { ...options, retrievalIndex: readOnlyIndex.index };
    const messageContext = safeCall(() => chatApi?.buildMessageContext?.(value, queryOptions), null);
    const personalContext = messageContext?.context || safeCall(() => chatApi?.buildPersonalContext?.(options), null);
    const retrieval = messageContext?.retrieval
      || safeCall(() => retrievalApi?.buildRagContext?.(value, { ...options, index: readOnlyIndex.index }), null);
    const prompt = asText(messageContext?.prompt)
      || asText(safeCall(() => retrievalApi?.buildRagPromptBlock?.(retrieval, { includeEmpty: true }), ""));
    const topResults = asArray(retrieval?.results).slice(0, Number(options.limit) || 5);
    return {
      query: value,
      personalContextAvailable: Boolean(personalContext),
      retrievalAvailable: Boolean(retrieval),
      usedPersistedIndex: readOnlyIndex.persisted,
      resultCount: topResults.length,
      topResults,
      promptPreview: prompt.slice(0, 1200),
      reasons: topResults.flatMap((item) => asArray(item?.reasons)).filter(Boolean),
      ok: Boolean(personalContext && retrieval && prompt && topResults.length)
    };
  }

  function checkChatIntegration() {
    const doc = global.document;
    const scripts = doc ? [...doc.querySelectorAll("script[src]")].map((script) => script.getAttribute("src") || "") : [];
    const required = ["ahaPersonalRetrieval.js", "ahaChatPersonalContext.js", "ahaPersonalAiLoopAudit.js"];
    const scriptsLoaded = required.every((name) => scripts.some((src) => src.includes(name)))
      || required.every((name) => name === "ahaPersonalAiLoopAudit.js"
        ? Boolean(global.AHAPersonalAiLoopAudit)
        : Boolean(global[name === "ahaPersonalRetrieval.js" ? "AHAPersonalRetrieval" : "AHAChatPersonalContext"]));
    const hasPersonalContextPanel = Boolean(doc?.getElementById("aha-personal-context-panel"));
    const hasRetrievalPanel = Boolean(doc?.getElementById("aha-personal-retrieval-panel"));
    const notes = [];
    if (!doc) notes.push("DOM er ikke tilgjengelig; modulstatus er kontrollert i stedet.");
    if (!scriptsLoaded) notes.push("En eller flere nødvendige chat-moduler er ikke lastet.");
    if (doc && !hasPersonalContextPanel) notes.push("Personal context-panelet mangler.");
    if (doc && !hasRetrievalPanel) notes.push("Retrieval-panelet mangler.");
    return {
      ok: scriptsLoaded && (!doc || (hasPersonalContextPanel && hasRetrievalPanel)),
      scriptsLoaded,
      hasPersonalContextPanel,
      hasRetrievalPanel,
      notes
    };
  }

  function checkPrivacyAndConsent() {
    const readOnlyIndex = getReadOnlyIndex();
    const index = readOnlyIndex.index;
    const items = asArray(index?.items);
    const findings = [];
    const disallowed = items.filter((item) => {
      if (item?.source === "training_corpus") {
        return item?.meta?.status !== "approved"
          || !(item?.consent?.useForKnowledge === true || item?.consent?.useForMemory === true);
      }
      if (item?.source === "training_examples") return item?.meta?.status !== "approved";
      if (item?.source === "meta_insights_memory") return !["confirmed_claim", "important_claim"].includes(item?.sourceType);
      return false;
    });
    if (disallowed.length) findings.push(`${disallowed.length} indekserte items bryter godkjennings- eller samtykkekrav.`);
    else if (readOnlyIndex.persisted) findings.push("Den lagrede indeksen inneholder bare godkjent corpus/examples og bekreftede eller viktige memory claims.");
    else findings.push("En read-only indeks-simulering inneholder bare godkjent corpus/examples og bekreftede eller viktige memory claims.");
    const consentAware = !items.some((item) => item?.source === "training_corpus"
      && !(item?.consent?.useForKnowledge === true || item?.consent?.useForMemory === true));
    return { ok: Boolean(index) && disallowed.length === 0, approvedOnly: disallowed.length === 0, consentAware, findings };
  }

  function buildRecommendations(audit) {
    const recs = [];
    if (audit.retrieval?.needsRefresh) recs.push("Bygg retrieval-indeks fra Training Dashboard.");
    if (!audit.readiness?.approvedCorpus) recs.push("Godkjenn flere corpus items.");
    if (!audit.readiness?.approvedExamples) recs.push("Godkjenn flere training examples.");
    if (!Number(audit.readiness?.examplesByTaskType?.memory_fact)) recs.push("Legg til flere memory_fact examples.");
    if (!audit.chat?.sampleQuery?.ok) recs.push("Kjør testmelding i chat for å kontrollere retrieval.");
    if (audit.chat?.sampleQuery?.resultCount < 2 && audit.readiness?.approvedCorpus) recs.push("Legg til flere prosjektbegreper i corpus for bedre match.");
    if (!audit.privacy?.ok) recs.push("Fjern materiale som mangler godkjenning eller relevant samtykke fra retrieval-indeksen.");
    if (!recs.length) recs.push("Fortsett å kvalitetssikre nytt personlig materiale og bygg indeksen etter endringer.");
    return recs.slice(0, 6);
  }

  function runAudit(options = {}) {
    const dataSources = checkDataSources();
    const approved = checkApprovedMaterial();
    const retrieval = checkRetrievalIndex();
    const integration = checkChatIntegration();
    const privacy = checkPrivacyAndConsent();
    const sampleQuery = simulateQuery(options.query, options);
    const readinessReport = safeCall(() => global.AHAPersonalModelReadiness?.buildReadinessReport?.(), {});
    const checks = { dataSources, approvedMaterial: approved, retrievalIndex: retrieval, chatIntegration: integration, privacyAndConsent: privacy };
    const passed = Object.values(checks).filter((check) => check.ok).length;
    let score = Math.round((passed / Object.keys(checks).length) * 70);
    score += sampleQuery.ok ? 20 : (sampleQuery.personalContextAvailable ? 5 : 0);
    score += Math.min(10, Math.round((Number(readinessReport?.score) || 0) / 10));
    score = Math.min(100, score);
    let status = "empty";
    if (approved.ok || retrieval.indexedItems) status = score >= 85 ? "strong" : score >= 60 ? "working" : "partial";
    const audit = {
      generatedAt: new Date(options.now || Date.now()).toISOString(),
      status,
      score,
      checks,
      dataFlow: {
        message: "AHAChatPersonalContext.buildMessageContext",
        personalContext: "AHAChatPersonalContext.buildPersonalContext",
        retrieval: "AHAPersonalRetrieval.buildRagContext",
        ragPrompt: "AHAPersonalRetrieval.buildRagPromptBlock",
        chatPrompt: "messageContext.prompt"
      },
      readiness: { ...approved, level: asText(readinessReport?.level) || "ukjent", score: Number(readinessReport?.score) || 0 },
      retrieval,
      chat: { integration, sampleQuery },
      privacy,
      recommendations: [],
      summary: ""
    };
    audit.recommendations = buildRecommendations(audit);
    audit.summary = status === "empty"
      ? "Den personlige AI-sløyfen har ikke godkjent materiale å validere ennå."
      : `Personal AI Loop er ${status} med score ${score}/100, ${retrieval.indexedItems} indekserte items og ${sampleQuery.resultCount} treff på testspørringen.`;
    return audit;
  }

  function loadLastAudit() {
    try { return JSON.parse(global.localStorage?.getItem(STORAGE_KEY) || "null"); } catch { return null; }
  }

  global.AHAPersonalAiLoopAudit = {
    STORAGE_KEY,
    DEFAULT_QUERY,
    runAudit,
    checkDataSources,
    checkApprovedMaterial,
    checkRetrievalIndex,
    simulateQuery,
    checkChatIntegration,
    checkPrivacyAndConsent,
    buildRecommendations,
    loadLastAudit
  };
})(typeof window !== "undefined" ? window : globalThis);
