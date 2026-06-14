// AHA Personal AI Loop Audit V1 – lokal, read-only validering av kjeden
// godkjent personlig materiale → retrieval → RAG → AHA Chat.
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
      const timestamp = Date.parse(item?.updatedAt || item?.createdAt || "");
      return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
    }, 0);
  }

  function checkDataSources() {
    const modules = {};
    MODULES.forEach((name) => {
      const api = global[name];
      modules[name] = Boolean(api && typeof api === "object");
    });
    const missing = MODULES.filter((name) => !modules[name]);
    return { ok: missing.length === 0, modules, missing, availableCount: MODULES.length - missing.length };
  }

  function readApprovedMaterial() {
    const memory = asObject(safeCall(() => global.AHAMetaInsightsMemory?.summarizeMemory?.(), {}));
    const corpus = asArray(safeCall(() => global.AHATrainingCorpus?.loadCorpus?.(), []));
    const examples = asArray(safeCall(() => global.AHATrainingExamples?.loadExamples?.(), []));
    const confirmed = asArray(memory.confirmedClaims);
    const important = asArray(memory.importantClaims);
    const approvedCorpusItems = corpus.filter((item) => item?.status === "approved"
      && (item?.consent?.useForKnowledge === true || item?.consent?.useForMemory === true));
    const approvedExampleItems = examples.filter((item) => item?.status === "approved");
    return { memory, corpus, examples, confirmed, important, approvedCorpusItems, approvedExampleItems };
  }

  function checkApprovedMaterial() {
    const material = readApprovedMaterial();
    const examplesByTaskType = {};
    material.approvedExampleItems.forEach((example) => {
      const taskType = asText(example?.taskType || example?.task_type) || "unknown";
      examplesByTaskType[taskType] = (examplesByTaskType[taskType] || 0) + 1;
    });
    const knowledgeAllowedCorpus = material.approvedCorpusItems.filter((item) => item?.consent?.useForKnowledge === true).length;
    const memoryAllowedCorpus = material.approvedCorpusItems.filter((item) => item?.consent?.useForMemory === true).length;
    const approvedCorpus = material.approvedCorpusItems.length;
    const approvedExamples = material.approvedExampleItems.length;
    const confirmedClaims = material.confirmed.length;
    const importantClaims = material.important.length;
    return {
      ok: confirmedClaims + importantClaims + approvedCorpus + approvedExamples > 0,
      confirmedClaims,
      importantClaims,
      approvedCorpus,
      approvedExamples,
      knowledgeAllowedCorpus,
      memoryAllowedCorpus,
      examplesByTaskType
    };
  }

  function checkRetrievalIndex() {
    const api = global.AHAPersonalRetrieval;
    const status = asObject(safeCall(() => api?.getRetrievalStatus?.(), {}));
    const material = readApprovedMaterial();
    const latestSourceUpdate = Math.max(
      latestTimestamp(material.approvedCorpusItems),
      latestTimestamp(material.approvedExampleItems),
      latestTimestamp([...material.confirmed, ...material.important]),
      Date.parse(asText(safeCall(() => global.AHAMetaInsightsMemory?.loadMemory?.()?.updatedAt, ""))) || 0
    );
    const lastBuilt = Date.parse(asText(status.lastBuiltAt)) || 0;
    const approvedCount = material.approvedCorpusItems.filter((item) => item?.consent?.useForKnowledge === true || item?.consent?.useForMemory === true).length
      + material.approvedExampleItems.length + material.confirmed.length + material.important.length;
    const indexedItems = Number(status.indexedItems) || 0;
    const needsRefresh = !lastBuilt || (indexedItems === 0 && approvedCount > 0) || (latestSourceUpdate > 0 && lastBuilt < latestSourceUpdate);
    return {
      ok: Boolean(status.available && indexedItems > 0 && !needsRefresh),
      available: Boolean(status.available),
      indexedItems,
      corpusItems: Number(status.corpusItems) || 0,
      examples: Number(status.examples) || 0,
      memoryClaims: Number(status.memoryClaims) || 0,
      lastBuiltAt: asText(status.lastBuiltAt),
      needsRefresh
    };
  }

  function simulateQuery(query = DEFAULT_QUERY, options = {}) {
    const cleanQuery = asText(query) || DEFAULT_QUERY;
    const personalApi = global.AHAChatPersonalContext;
    const retrievalApi = global.AHAPersonalRetrieval;
    const personal = safeCall(() => personalApi?.buildPersonalContext?.(options), null);
    const index = safeCall(() => retrievalApi?.loadRetrievalIndex?.(), null);
    const retrieval = index
      ? safeCall(() => retrievalApi?.buildRagContext?.(cleanQuery, { ...options, index }), null)
      : null;
    const promptBlock = safeCall(() => retrievalApi?.buildRagPromptBlock?.(retrieval, options), "");
    const results = asArray(retrieval?.results);
    return {
      query: cleanQuery,
      personalContextAvailable: Boolean(personal),
      retrievalAvailable: Boolean(retrieval),
      resultCount: results.length,
      topResults: results.slice(0, 5).map((result) => ({
        source: asText(result.source),
        sourceId: asText(result.sourceId),
        sourceType: asText(result.sourceType),
        title: asText(result.title),
        score: Number(result.hybridScore ?? result.score ?? result.semanticScore) || 0,
        reasons: asArray(result.reasons)
      })),
      promptPreview: asText(promptBlock).slice(0, 1400),
      reasons: [...new Set(results.flatMap((result) => asArray(result.reasons)).map(asText).filter(Boolean))].slice(0, 12),
      ok: Boolean(results.length && promptBlock)
    };
  }

  function checkChatIntegration() {
    const doc = global.document;
    const scripts = doc ? asArray(doc.querySelectorAll?.("script[src]")).map((node) => node.getAttribute("src") || "") : [];
    const loaded = checkDataSources().modules;
    const scriptsLoaded = {
      personalContext: Boolean(loaded.AHAChatPersonalContext || scripts.some((src) => src.includes("ahaChatPersonalContext.js"))),
      retrieval: Boolean(loaded.AHAPersonalRetrieval || scripts.some((src) => src.includes("ahaPersonalRetrieval.js"))),
      audit: Boolean(global.AHAPersonalAiLoopAudit || scripts.some((src) => src.includes("ahaPersonalAiLoopAudit.js")))
    };
    const hasPersonalContextPanel = Boolean(doc?.getElementById?.("aha-personal-context-panel"));
    const hasRetrievalPanel = Boolean(doc?.getElementById?.("aha-personal-retrieval-panel"));
    const notes = [];
    if (!doc) notes.push("DOM er ikke tilgjengelig; modulstatus ble kontrollert uten UI.");
    if (!hasPersonalContextPanel && doc) notes.push("Personal context-panelet mangler.");
    if (!hasRetrievalPanel && doc) notes.push("Retrieval-panelet mangler.");
    return {
      ok: scriptsLoaded.personalContext && scriptsLoaded.retrieval && (!doc || (hasPersonalContextPanel && hasRetrievalPanel)),
      scriptsLoaded,
      hasPersonalContextPanel,
      hasRetrievalPanel,
      notes
    };
  }

  function checkPrivacyAndConsent() {
    const api = global.AHAPersonalRetrieval;
    const index = asObject(safeCall(() => api?.loadRetrievalIndex?.(), null));
    const items = asArray(index.items);
    const findings = [];
    const invalid = items.filter((item) => {
      if (item.source === "training_corpus") {
        return item.meta?.status !== "approved" || !(item.consent?.useForKnowledge === true || item.consent?.useForMemory === true);
      }
      if (item.source === "training_examples") return item.meta?.status !== "approved";
      if (item.source === "meta_insights_memory") return !["confirmed_claim", "important_claim"].includes(item.sourceType);
      return false;
    });
    if (invalid.length) findings.push(`${invalid.length} retrieval-items bryter approved-/consent-filteret.`);
    else findings.push("Retrieval-indeksen bruker bare godkjente kilder og tillatte memory claims.");
    const corpusItems = items.filter((item) => item.source === "training_corpus");
    const consentAware = corpusItems.every((item) => item.consent?.useForKnowledge === true || item.consent?.useForMemory === true);
    return { ok: invalid.length === 0, approvedOnly: invalid.length === 0, consentAware, findings };
  }

  function checkSemanticRetrieval() {
    const api = global.AHASemanticRetrieval;
    if (!api?.getSemanticStatus) return { ok: false, available: false, indexedItems: 0, vectorModel: "", sampleSemanticResults: 0, hybridReady: false, hasReasons: false };
    const status = asObject(safeCall(() => api.getSemanticStatus(), {}));
    const sample = asObject(safeCall(() => api.searchSemanticKnowledge?.(DEFAULT_QUERY, { limit: 3, minScore: 0 }), {}));
    const hybrid = asObject(safeCall(() => api.hybridSearch?.(DEFAULT_QUERY, { limit: 3, minScore: 0 }), {}));
    const hasReasons = asArray(sample.results).some((item) => asArray(item.reasons).length)
      || asArray(hybrid.results).some((item) => asArray(item.reasons).length);
    return {
      ok: Boolean(status.available && (asArray(hybrid.results).length || asArray(sample.results).length)),
      available: Boolean(status.available),
      indexedItems: Number(status.indexedItems) || 0,
      vectorModel: asText(status.vectorModel),
      sampleSemanticResults: asArray(sample.results).length,
      hybridReady: Boolean(asArray(hybrid.results).length),
      hasReasons
    };
  }

  function buildRecommendations(audit) {
    const recs = [];
    const approved = asObject(audit?.checks?.approvedMaterial);
    const retrieval = asObject(audit?.retrieval);
    const chat = asObject(audit?.chat);
    const privacy = asObject(audit?.privacy);
    if (retrieval.needsRefresh) recs.push("Bygg retrieval-indeks fra Training Dashboard.");
    if (!Number(approved.approvedCorpus)) recs.push("Godkjenn flere corpus items.");
    if (!Number(approved.approvedExamples)) recs.push("Godkjenn flere training examples.");
    if (!Number(asObject(approved.examplesByTaskType).memory_fact)) recs.push("Legg til flere memory_fact examples.");
    if (!audit?.checks?.sampleQuery?.ok) recs.push("Kjør testmelding i chat for å kontrollere retrieval.");
    if (Number(approved.approvedCorpus) > 0 && audit?.checks?.sampleQuery?.resultCount < 2) recs.push("Legg til flere prosjektbegreper i corpus for bedre match.");
    if (!chat.ok) recs.push("Kontroller at chat laster personal context- og retrieval-modulene.");
    if (!privacy.ok) recs.push("Fjern retrieval-items som mangler godkjenning eller kunnskap/minne-samtykke.");
    if (!recs.length) recs.push("Kjør audit jevnlig etter nye godkjenninger og kontroller kildereasons i chat.");
    return [...new Set(recs)].slice(0, 6);
  }

  function runAudit(options = {}) {
    const dataSources = checkDataSources();
    const approvedMaterial = checkApprovedMaterial();
    const retrieval = checkRetrievalIndex();
    const sampleQuery = simulateQuery(options.query, options);
    const chat = checkChatIntegration();
    const privacy = checkPrivacyAndConsent();
    const semanticRetrieval = checkSemanticRetrieval();
    const readiness = asObject(safeCall(() => global.AHAPersonalModelReadiness?.buildReadinessReport?.(), {}));
    let score = 0;
    score += Math.round((dataSources.availableCount / MODULES.length) * 15);
    if (approvedMaterial.ok) score += 15;
    if (retrieval.available) score += 10;
    if (retrieval.ok) score += 10;
    if (sampleQuery.ok) score += 20;
    if (chat.ok) score += 10;
    if (privacy.ok && privacy.consentAware) score += 15;
    if (semanticRetrieval.ok) score += 5;
    score = Math.min(100, score);
    const materialCount = approvedMaterial.confirmedClaims + approvedMaterial.importantClaims
      + approvedMaterial.approvedCorpus + approvedMaterial.approvedExamples;
    let status = materialCount > 0 ? "partial" : "empty";
    if (materialCount > 0 && retrieval.ok && sampleQuery.ok && privacy.ok && score >= 65) status = "working";
    if (materialCount > 0 && score >= 85 && dataSources.ok && chat.ok && semanticRetrieval.ok) status = "strong";
    const audit = {
      generatedAt: new Date(options.now || Date.now()).toISOString(),
      status,
      score,
      checks: { dataSources, approvedMaterial, retrievalIndex: retrieval, sampleQuery, chatIntegration: chat, privacyAndConsent: privacy },
      dataFlow: {
        input: "chat message",
        personalContext: dataSources.modules.AHAChatPersonalContext,
        retrieval: retrieval.available,
        approvedResults: sampleQuery.resultCount,
        ragPromptBlock: Boolean(sampleQuery.promptPreview),
        chatBasis: sampleQuery.ok,
        visibleStatus: chat.hasPersonalContextPanel && chat.hasRetrievalPanel,
        explainableReasons: sampleQuery.reasons.length > 0
      },
      readiness,
      retrieval,
      chat,
      privacy,
      semanticRetrieval,
      recommendations: [],
      summary: ""
    };
    audit.recommendations = buildRecommendations(audit);
    audit.summary = status === "empty"
      ? "Personal AI Loop mangler godkjent personlig materiale."
      : status === "partial"
        ? "Personal AI Loop er delvis koblet, men indeks eller relevante testtreff mangler."
        : status === "working"
          ? "Personal AI Loop fungerer fra godkjent materiale via retrieval til RAG-kontekst."
          : "Personal AI Loop er sterk, forklarbar og consent-aware på tvers av hele kjeden.";
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
    checkSemanticRetrieval,
    buildRecommendations,
    loadLastAudit
  };
})(typeof window !== "undefined" ? window : globalThis);
