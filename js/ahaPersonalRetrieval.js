// AHA Personal Retrieval / RAG V1 – lokal, samtykkestyrt og forklarbar.
(function (global) {
  "use strict";

  const STORAGE_KEY = "aha_personal_retrieval_index_v1";
  const VERSION = "v1";
  const STOPWORDS = new Set(["og", "det", "som", "for", "med", "til", "jeg", "du", "den", "de", "en", "et", "på", "av"]);

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function asText(value) { return String(value ?? "").trim(); }
  function oneLine(value) { return asText(value).replace(/\s+/g, " "); }
  function truncate(value, max = 260) {
    const text = oneLine(value);
    return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
  }
  function safeCall(fn, fallback) {
    try { return typeof fn === "function" ? fn() : fallback; } catch { return fallback; }
  }
  function normalizeList(value) {
    return [...new Set(asArray(value).map((item) => oneLine(item?.label || item?.name || item?.key || item)).filter(Boolean))];
  }
  function nowIso(options = {}) {
    return new Date(options.now || Date.now()).toISOString();
  }
  function makeId(source, sourceId, suffix = "") {
    return ["retrieval", source, sourceId || suffix || "item"].filter(Boolean).join(":");
  }
  function normalizeItem(item) {
    const src = asObject(item);
    return {
      id: asText(src.id) || makeId(src.source, src.sourceId),
      type: "retrieval_item",
      source: asText(src.source),
      sourceId: asText(src.sourceId),
      sourceType: asText(src.sourceType),
      title: truncate(src.title || src.text || "Personlig kunnskap", 120),
      text: oneLine(src.text),
      excerpt: truncate(src.excerpt || src.text || src.title, 280),
      language: asText(src.language) || "no",
      project: oneLine(src.project),
      tags: normalizeList(src.tags),
      concepts: normalizeList(src.concepts),
      taskType: asText(src.taskType),
      consent: asObject(src.consent),
      weight: Number(src.weight) || 1,
      createdAt: asText(src.createdAt),
      updatedAt: asText(src.updatedAt || src.createdAt),
      meta: asObject(src.meta)
    };
  }

  function memoryItems(options = {}) {
    const api = global.AHAMetaInsightsMemory;
    if (!api) return [];
    const summary = safeCall(() => api.summarizeMemory(), {});
    const pack = safeCall(() => api.buildMemoryPack(), {});
    const groups = [
      ["confirmed_claim", asArray(summary.confirmedClaims), 3],
      ["important_claim", asArray(summary.importantClaims), 2.8]
    ];
    const items = [];
    groups.forEach(([sourceType, claims, weight]) => {
      claims.forEach((claim, index) => {
        const text = oneLine(claim?.claimText || claim?.text || claim);
        if (!text) return;
        const sourceId = asText(claim?.id) || `${sourceType}_${index + 1}`;
        items.push(normalizeItem({
          id: makeId("meta_insights_memory", sourceId),
          source: "meta_insights_memory", sourceId, sourceType,
          title: sourceType === "confirmed_claim" ? "Bekreftet selvinnsikt" : "Viktig selvinnsikt",
          text, excerpt: text, concepts: claim?.concepts, project: claim?.project,
          consent: { useForMemory: true }, weight,
          createdAt: claim?.createdAt, updatedAt: claim?.updatedAt,
          meta: { confidence: claim?.confidence, memoryPackAvailable: Boolean(pack && typeof pack === "object") }
        }));
      });
    });
    return items;
  }

  function corpusItems() {
    const items = safeCall(() => global.AHATrainingCorpus?.loadCorpus?.(), []);
    return asArray(items).filter((item) => {
      const consent = asObject(item?.consent);
      return item?.status === "approved" && (consent.useForKnowledge === true || consent.useForMemory === true);
    }).map((item) => normalizeItem({
      id: makeId("training_corpus", item.id), source: "training_corpus", sourceId: item.id,
      sourceType: "corpus_item", title: item.title, text: item.text, excerpt: item.text,
      language: item.language, project: item.project, tags: item.tags, concepts: item.concepts,
      consent: item.consent, weight: 2, createdAt: item.createdAt, updatedAt: item.updatedAt,
      meta: { status: item.status, originalSource: item.source, originalSourceId: item.sourceId }
    }));
  }

  function exampleItems() {
    const items = safeCall(() => global.AHATrainingExamples?.loadExamples?.(), []);
    return asArray(items).filter((item) => item?.status === "approved").map((item) => {
      const text = [item.input, item.output].filter(Boolean).join(" — ");
      return normalizeItem({
        id: makeId("training_examples", item.id), source: "training_examples", sourceId: item.id,
        sourceType: "training_example", title: `Godkjent eksempel: ${item.taskType || "eksempel"}`,
        text, excerpt: item.output || item.input, language: item.language, tags: item.labels,
        concepts: item.meta?.concepts, project: item.meta?.project, taskType: item.taskType,
        consent: { approved: true }, weight: 2.2, createdAt: item.createdAt, updatedAt: item.updatedAt,
        meta: { status: item.status, corpusItemId: item.corpusItemId, input: truncate(item.input, 180) }
      });
    });
  }

  function readinessItems(options = {}) {
    const api = global.AHAPersonalModelReadiness;
    if (!api?.buildReadinessReport) return [];
    const report = safeCall(() => api.buildReadinessReport(options), null);
    if (!report) return [];
    const compact = api.buildCompactPack ? safeCall(() => api.buildCompactPack(report), report) : report;
    const text = oneLine(compact.summary || report.summary || `Readiness ${compact.level || report.level || "ukjent"}, score ${Number(compact.score ?? report.score) || 0}.`);
    return [normalizeItem({
      id: makeId("personal_model_readiness", "current"), source: "personal_model_readiness",
      sourceId: "current", sourceType: "readiness_summary", title: "Personal Model Readiness",
      text, excerpt: text, concepts: ["personal model", "readiness", "RAG"],
      weight: 0.8, createdAt: report.generatedAt, updatedAt: report.generatedAt || nowIso(options),
      meta: { level: compact.level || report.level, score: Number(compact.score ?? report.score) || 0, status: report.ragReadiness?.ready ? "rag_ready" : "building" }
    })];
  }

  function buildRetrievalIndex(options = {}) {
    const items = [...memoryItems(options), ...corpusItems(), ...exampleItems(), ...readinessItems(options)];
    const bySource = {};
    const bySourceType = {};
    items.forEach((item) => {
      bySource[item.source] = (bySource[item.source] || 0) + 1;
      bySourceType[item.sourceType] = (bySourceType[item.sourceType] || 0) + 1;
    });
    return {
      generatedAt: nowIso(options), version: VERSION, items,
      stats: {
        total: items.length, bySource, bySourceType,
        corpusItems: bySource.training_corpus || 0,
        examples: bySource.training_examples || 0,
        memoryClaims: bySource.meta_insights_memory || 0,
        readinessItems: bySource.personal_model_readiness || 0
      }
    };
  }

  function saveRetrievalIndex(index) {
    const safe = asObject(index);
    const items = asArray(safe.items).map(normalizeItem);
    const normalized = { ...safe, version: VERSION, generatedAt: asText(safe.generatedAt) || nowIso(), items };
    try { global.localStorage?.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch {}
    return normalized;
  }
  function loadRetrievalIndex() {
    try {
      const parsed = JSON.parse(global.localStorage?.getItem(STORAGE_KEY) || "null");
      if (!parsed || !Array.isArray(parsed.items)) return null;
      return { ...parsed, items: parsed.items.map(normalizeItem) };
    } catch { return null; }
  }
  function refreshRetrievalIndex(options = {}) {
    return saveRetrievalIndex(buildRetrievalIndex(options));
  }
  function tokenize(text) {
    return oneLine(text).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s]+/gu, " ").split(/\s+/)
      .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
  }
  function matches(queryTokens, value) {
    const haystack = new Set(tokenize(Array.isArray(value) ? value.join(" ") : value));
    return queryTokens.filter((token) => haystack.has(token));
  }
  function addReason(reasons, label, hits) {
    if (hits.length) reasons.push(`${label}: ${hits.join(", ")}`);
  }
  function scoreItemAgainstQuery(itemArg, query, options = {}) {
    const item = normalizeItem(itemArg);
    const queryTokens = [...new Set(tokenize(query))];
    const reasons = [];
    let score = 0;
    const title = matches(queryTokens, item.title); score += title.length * 5; addReason(reasons, "match på tittel", title);
    const project = matches(queryTokens, item.project); score += project.length * 5; addReason(reasons, "match på prosjekt", project);
    const concepts = matches(queryTokens, item.concepts); score += concepts.length * 4.5; addReason(reasons, "match på begrep", concepts);
    const tags = matches(queryTokens, item.tags); score += tags.length * 3; addReason(reasons, "match på tag", tags);
    const body = matches(queryTokens, `${item.text} ${item.excerpt}`); score += body.length * 2; addReason(reasons, "match i tekst", body);
    const taskType = matches(queryTokens, item.taskType.replace(/_/g, " ")); score += taskType.length * 3; addReason(reasons, "relevant oppgavetype", taskType);
    if (score > 0 && item.sourceType === "confirmed_claim") { score += 4; reasons.push("bekreftet selvinnsikt"); }
    if (score > 0 && item.sourceType === "important_claim") { score += 3.5; reasons.push("viktig selvinnsikt"); }
    if (score > 0 && item.sourceType === "training_example") { score += 3; reasons.push("godkjent training example"); }
    if (score > 0 && item.sourceType === "corpus_item") { score += 2.5; reasons.push("godkjent corpus item"); }
    if (score > 0 && item.sourceType === "readiness_summary") { score += 1; reasons.push("readiness summary"); }
    score *= Number(options.ignoreSourceWeight ? 1 : item.weight) || 1;
    return { score: Math.round(score * 100) / 100, reasons };
  }

  function searchPersonalKnowledge(query, options = {}) {
    const index = options.index || loadRetrievalIndex() || refreshRetrievalIndex(options);
    const allowed = asArray(options.sources);
    const minScore = Number(options.minScore ?? 1);
    const limit = Math.max(1, Number(options.limit) || 8);
    const results = asArray(index?.items).filter((item) => !allowed.length || allowed.includes(item.source))
      .map((item) => ({ item, ...scoreItemAgainstQuery(item, query, options) }))
      .filter((entry) => entry.score >= minScore)
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
      .slice(0, limit)
      .map(({ item, score, reasons }) => ({
        id: item.id, source: item.source, sourceId: item.sourceId, sourceType: item.sourceType,
        title: item.title, excerpt: item.excerpt, score, reasons, project: item.project,
        concepts: item.concepts, taskType: item.taskType, meta: item.meta
      }));
    return {
      query: asText(query), generatedAt: nowIso(options), results,
      stats: { indexedItems: asArray(index?.items).length, matchedItems: results.length, returnedItems: results.length }
    };
  }

  function buildRagContext(query, options = {}) {
    const semanticApi = global.AHASemanticRetrieval;
    if (options.forceLexical !== true && semanticApi && typeof semanticApi.buildSemanticRagContext === "function") {
      const semantic = safeCall(() => semanticApi.buildSemanticRagContext(query, options), null);
      if (semantic && asArray(semantic.results).length) {
        return { ...semantic, mode: "hybrid", semanticAvailable: true };
      }
    }
    const maxLength = Math.min(1200, Math.max(700, Number(options.maxLength) || 1000));
    const search = searchPersonalKnowledge(query, { ...options, limit: Math.min(5, Number(options.limit) || 5) });
    const lines = ["Relevant personlig kunnskap fra AHA:"];
    search.results.forEach((item, index) => lines.push(`${index + 1}. [${item.title} / ${item.source}] ${truncate(item.excerpt, 190)}`));
    if (!search.results.length) lines.push("Ingen relevante godkjente personlige kilder funnet.");
    lines.push("Bruk dette når det er relevant for brukerens spørsmål.");
    return {
      query: search.query, generatedAt: search.generatedAt, results: search.results,
      mode: "lexical", semanticAvailable: Boolean(global.AHASemanticRetrieval),
      contextText: truncate(lines.join("\n"), maxLength),
      sourceSummary: search.results.reduce((out, item) => {
        out[item.source] = (out[item.source] || 0) + 1;
        return out;
      }, {}),
      evidence: search.results.map((item) => ({
        source: item.source, sourceId: item.sourceId, sourceType: item.sourceType,
        title: item.title, excerpt: item.excerpt, score: item.score, reasons: item.reasons
      }))
    };
  }
  function buildRagPromptBlock(ragContext, options = {}) {
    const rag = asObject(ragContext);
    if (!asArray(rag.results).length && options.includeEmpty !== true) return "";
    return truncate([
      "AHA Personal Retrieval:",
      "Følgende godkjente personlige kilder er relevante for denne meldingen:",
      rag.contextText,
      "Svar med støtte i dette materialet der det passer."
    ].join("\n"), Number(options.maxLength) || 1300);
  }
  function getRetrievalStatus() {
    const index = loadRetrievalIndex();
    const stats = asObject(index?.stats);
    return {
      available: Boolean(index && asArray(index.items).length),
      indexedItems: asArray(index?.items).length,
      corpusItems: Number(stats.corpusItems) || 0,
      examples: Number(stats.examples) || 0,
      memoryClaims: Number(stats.memoryClaims) || 0,
      lastBuiltAt: asText(index?.generatedAt)
    };
  }

  global.AHAPersonalRetrieval = {
    STORAGE_KEY, VERSION, buildRetrievalIndex, saveRetrievalIndex, loadRetrievalIndex,
    refreshRetrievalIndex, tokenize, scoreItemAgainstQuery, searchPersonalKnowledge,
    buildRagContext, buildRagPromptBlock, getRetrievalStatus
  };
})(typeof window !== "undefined" ? window : globalThis);
