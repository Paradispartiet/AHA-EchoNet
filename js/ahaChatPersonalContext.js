// ahaChatPersonalContext.js
// ─────────────────────────────────────────────
// AHA Chat Personal Context – local-first, godkjent personlig kontekst for
// AHA Chat. Modulen leser bare godkjent/brukersamtykket materiale fra Meta
// Insights Memory, Training Corpus, Training Examples og Personal Model
// Readiness, og bygger en kort promptpakke som kan injiseres i chatflyten.
// ─────────────────────────────────────────────

(function (global) {
  "use strict";

  const VERSION = "v1";
  const SOURCE = "aha_chat_personal_context";
  const PREFERRED_TASK_TYPES = ["memory_fact", "project_explanation", "style_example", "concept_explanation", "summary"];
  const STOPWORDS = new Set([
    "aha", "jeg", "meg", "min", "mitt", "mine", "du", "deg", "det", "den", "dette", "som", "for", "med", "til", "fra", "og", "eller", "men", "om", "på", "i", "å", "er", "en", "et", "av", "kan", "skal", "vil", "hva", "hvordan", "hvorfor", "the", "and", "for", "with", "that", "this"
  ]);

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function asText(value) { return String(value ?? "").trim(); }
  function oneLine(value) { return asText(value).replace(/\s+/g, " "); }
  function truncate(value, max = 220) {
    const text = oneLine(value);
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
  }
  function uniqueTexts(values, limit = 20) {
    const seen = new Set();
    const out = [];
    asArray(values).forEach((value) => {
      const text = oneLine(value?.claimText || value?.text || value?.title || value?.label || value);
      const key = text.toLowerCase();
      if (!text || seen.has(key)) return;
      seen.add(key);
      out.push(text);
    });
    return out.slice(0, limit);
  }
  function claimText(claim) { return oneLine(claim?.claimText || claim?.text || claim?.title || claim); }
  function normalizeToken(value) {
    return asText(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9æøå]+/gi, " ").trim();
  }
  function tokens(value) {
    return normalizeToken(value).split(/\s+/).filter((token) => token.length >= 3 && !STOPWORDS.has(token));
  }
  function tokenSet(value) { return new Set(tokens(value)); }
  function overlapScore(queryTokens, value, weight = 1) {
    const hay = tokenSet(value);
    let score = 0;
    queryTokens.forEach((token) => { if (hay.has(token)) score += weight; });
    return score;
  }

  function safeCall(fn, fallback) {
    try { return typeof fn === "function" ? fn() : fallback; } catch { return fallback; }
  }

  function readMemory() {
    const api = global.AHAMetaInsightsMemory;
    const summary = api && typeof api.summarizeMemory === "function" ? safeCall(() => api.summarizeMemory(), {}) : {};
    const pack = api && typeof api.buildMemoryPack === "function" ? safeCall(() => api.buildMemoryPack(), {}) : {};
    const activeSelfModel = asObject(summary.activeSelfModel || pack.active_self_model);
    return {
      confirmedClaims: asArray(summary.confirmedClaims).slice(0, 12),
      partialClaims: asArray(summary.partialClaims).slice(0, 8),
      importantClaims: asArray(summary.importantClaims).slice(0, 10),
      activeSelfModel,
      activePatterns: asArray(activeSelfModel.activePatterns || activeSelfModel.active_patterns).slice(0, 8),
      activeProjects: asArray(activeSelfModel.activeProjects || activeSelfModel.active_projects).slice(0, 8),
      activeTensions: asArray(activeSelfModel.activeTensions || activeSelfModel.active_tensions).slice(0, 8),
      memoryPack: pack && typeof pack === "object" ? pack : {}
    };
  }

  function corpusAllowed(item) {
    const consent = asObject(item?.consent);
    return item?.status === "approved" && (consent.useForKnowledge === true || consent.useForMemory === true);
  }

  function readCorpus(options = {}) {
    const api = global.AHATrainingCorpus;
    const limit = Number(options.corpusLimit) || 10;
    const items = api && typeof api.loadCorpus === "function" ? safeCall(() => api.loadCorpus(), []) : [];
    return asArray(items)
      .filter(corpusAllowed)
      .map((item) => ({
        id: asText(item.id),
        title: truncate(item.title, 90),
        source: asText(item.source || item.sourceType),
        project: asText(item.project),
        concepts: asArray(item.concepts).map(oneLine).filter(Boolean).slice(0, 8),
        excerpt: truncate(item.text || item.title, 260)
      }))
      .filter((item) => item.id || item.title || item.excerpt)
      .sort((a, b) => (b.concepts.length + (b.project ? 2 : 0)) - (a.concepts.length + (a.project ? 2 : 0)))
      .slice(0, Math.min(10, Math.max(5, limit)));
  }

  function readExamples(options = {}) {
    const api = global.AHATrainingExamples;
    const limit = Number(options.exampleLimit) || 10;
    const order = new Map(PREFERRED_TASK_TYPES.map((type, index) => [type, index]));
    const examples = api && typeof api.loadExamples === "function" ? safeCall(() => api.loadExamples(), []) : [];
    return asArray(examples)
      .filter((example) => example?.status === "approved")
      .sort((a, b) => (order.get(a.taskType) ?? 99) - (order.get(b.taskType) ?? 99))
      .map((example) => ({
        id: asText(example.id),
        taskType: asText(example.taskType),
        input: truncate(example.input, 220),
        output: truncate(example.output, 260),
        language: asText(example.language || "unknown")
      }))
      .filter((example) => example.id || example.input || example.output)
      .slice(0, Math.min(10, Math.max(5, limit)));
  }

  function readReadiness() {
    const api = global.AHAPersonalModelReadiness;
    if (!api || typeof api.buildReadinessReport !== "function") return null;
    const report = safeCall(() => api.buildReadinessReport(), null);
    if (!report) return null;
    const compact = typeof api.buildCompactPack === "function" ? safeCall(() => api.buildCompactPack(report), null) : null;
    return compact || report;
  }

  function buildStyleProfile(examples) {
    const styleExamples = asArray(examples).filter((example) => example.taskType === "style_example").slice(0, 3);
    const toneHints = [];
    const text = styleExamples.map((example) => `${example.input} ${example.output}`).join(" ").toLowerCase();
    if (/kort|konsis|presis|tydelig/.test(text)) toneHints.push("kort og tydelig");
    if (/varm|personlig|trygg|støttende/.test(text)) toneHints.push("varm og støttende");
    if (/struktur|punkt|liste|steg/.test(text)) toneHints.push("strukturert");
    if (!toneHints.length && styleExamples.length) toneHints.push("følg godkjente stileksempler");
    return {
      hasStyleExamples: styleExamples.length > 0,
      toneHints,
      sampleCount: styleExamples.length,
      examples: styleExamples.map((example) => ({ id: example.id, input: example.input, output: example.output })).slice(0, 3)
    };
  }

  function buildProjects(memory, corpus, examples) {
    const fromCorpus = asArray(corpus).map((item) => item.project).filter(Boolean);
    const fromExamples = asArray(examples)
      .filter((example) => example.taskType === "project_explanation")
      .flatMap((example) => [example.input, example.output]);
    const fromClaims = asArray(memory.importantClaims).map(claimText).filter((text) => /prosjekt|arbeider|jobber|bygger|utvikler/i.test(text));
    const fromMemory = asArray(memory.activeProjects).map((item) => oneLine(item?.label || item?.title || item)).filter(Boolean);
    return uniqueTexts([...fromCorpus, ...fromMemory, ...fromClaims, ...fromExamples], 10).map((label) => ({ label: truncate(label, 120) }));
  }

  function buildActiveSelfModel(memory) {
    return {
      confirmedClaims: uniqueTexts(memory.confirmedClaims, 8),
      importantClaims: uniqueTexts(memory.importantClaims, 6),
      activeProjects: uniqueTexts(memory.activeProjects, 6),
      activeTensions: uniqueTexts(memory.activeTensions, 5),
      activePatterns: uniqueTexts(memory.activePatterns, 5),
      learningMode: asText(memory.activeSelfModel?.learningMode || memory.activeSelfModel?.learning_mode)
    };
  }

  function buildEvidence(memory, corpus, examples, readiness, style) {
    return {
      confirmedClaims: asArray(memory.confirmedClaims).length,
      approvedCorpus: asArray(corpus).length,
      approvedExamples: asArray(examples).length,
      styleExamples: Number(style?.sampleCount) || 0,
      projectExamples: asArray(examples).filter((example) => example.taskType === "project_explanation").length,
      readinessScore: Number(readiness?.score) || 0
    };
  }

  function compactList(values, maxItems = 3, maxLen = 220) {
    const text = uniqueTexts(values, maxItems).join("; ");
    return truncate(text, maxLen) || "ingen godkjente data ennå";
  }

  function buildCompactPrompt(context, options = {}) {
    const ctx = asObject(context);
    const memory = asObject(ctx.memory);
    const active = asObject(ctx.activeSelfModel);
    const corpus = asArray(ctx.corpus);
    const examples = asArray(ctx.examples);
    const projects = asArray(ctx.projects).map((project) => project.label || project);
    const style = asObject(ctx.style);
    const readiness = asObject(ctx.readiness);
    const concepts = uniqueTexts(corpus.flatMap((item) => item.concepts || []), 8).slice(0, 6);
    const lines = [
      "Personlig AHA-kontekst:",
      `Bekreftet selvinnsikt: ${compactList(active.confirmedClaims || memory.confirmedClaims, 3, 240)}.`,
      `Aktive prosjekter: ${compactList(projects, 4, 220)}.`,
      `Relevante begreper: ${compactList(concepts, 6, 180)}.`,
      `Godkjente eksempler: ${compactList(examples.map((example) => `${example.taskType}: ${example.output || example.input}`), 3, 240)}.`,
      `Svarstil: ${style.hasStyleExamples ? compactList(style.toneHints, 3, 120) : "naturlig, tydelig og prosjektbevisst"}.`,
      `Readiness: ${asText(readiness.level) || "ukjent"}${Number.isFinite(Number(readiness.score)) ? ` (${Number(readiness.score)}/100)` : ""}.`,
      "Bruk dette bare når relevant, og skill tydelig mellom godkjent kontekst og brukerens nye melding."
    ];
    const max = Number(options.maxLength) || 1200;
    return truncate(lines.join("\n"), max);
  }

  function buildPersonalContext(options = {}) {
    const memory = readMemory();
    const corpus = readCorpus(options);
    const examples = readExamples(options);
    const readiness = readReadiness();
    const style = buildStyleProfile(examples);
    const projects = buildProjects(memory, corpus, examples);
    const activeSelfModel = buildActiveSelfModel(memory);
    const context = {
      generatedAt: new Date().toISOString(),
      version: VERSION,
      source: SOURCE,
      memory,
      corpus,
      examples,
      readiness,
      style,
      projects,
      activeSelfModel,
      compactPrompt: "",
      evidence: {}
    };
    context.evidence = buildEvidence(memory, corpus, examples, readiness, style);
    context.compactPrompt = buildCompactPrompt(context, options);
    return context;
  }

  function selectRelevantContext(userMessage, context, options = {}) {
    const query = tokenSet(userMessage);
    const ctx = asObject(context);
    const scoreThreshold = Number(options.scoreThreshold) || 1;
    const scoreItem = (value, weight) => overlapScore(query, value, weight);
    const relevantClaims = [...asArray(ctx.memory?.confirmedClaims), ...asArray(ctx.memory?.importantClaims)]
      .map((claim) => ({ claim, score: scoreItem(claimText(claim), 2) }))
      .filter((item) => item.score >= scoreThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((item) => item.claim);
    const relevantCorpus = asArray(ctx.corpus)
      .map((item) => ({ item, score: scoreItem(`${item.title} ${item.project} ${(item.concepts || []).join(" ")} ${item.excerpt}`, 2) }))
      .filter((entry) => entry.score >= scoreThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((entry) => entry.item);
    const relevantExamples = asArray(ctx.examples)
      .map((example) => ({ example, score: scoreItem(`${example.taskType} ${example.input} ${example.output}`, 1.5) }))
      .filter((entry) => entry.score >= scoreThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((entry) => entry.example);
    const relevantProjects = asArray(ctx.projects)
      .map((project) => ({ project, score: scoreItem(project.label || project, 2) }))
      .filter((entry) => entry.score >= scoreThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((entry) => entry.project);
    const score = relevantClaims.length * 2 + relevantCorpus.length * 2 + relevantExamples.length + relevantProjects.length * 2;
    return { relevantClaims, relevantCorpus, relevantExamples, relevantProjects, score };
  }

  function buildRelevantPrompt(userMessage, context, relevant, options = {}) {
    const rel = asObject(relevant);
    const fallback = rel.score > 0 ? [] : asArray(context?.projects).slice(0, 2).map((project) => project.label || project);
    const lines = ["AHA personal context for denne meldingen:"];
    const claims = asArray(rel.relevantClaims).map(claimText);
    const corpus = asArray(rel.relevantCorpus).map((item) => `${item.title || item.project}: ${item.excerpt}`);
    const examples = asArray(rel.relevantExamples).map((example) => `${example.taskType}: ${example.output || example.input}`);
    const projects = asArray(rel.relevantProjects).map((project) => project.label || project).concat(fallback);
    if (claims.length) lines.push(`Bekreftet selvinnsikt: ${compactList(claims, 3, 240)}.`);
    if (projects.length) lines.push(`Prosjektkontekst: ${compactList(projects, 3, 180)}.`);
    if (corpus.length) lines.push(`Godkjent kunnskapsgrunnlag: ${compactList(corpus, 3, 300)}.`);
    if (examples.length) lines.push(`Godkjente eksempler: ${compactList(examples, 2, 220)}.`);
    if (context?.style?.hasStyleExamples) lines.push(`Svarstil: ${compactList(context.style.toneHints, 3, 120)}.`);
    if (context?.readiness) lines.push(`Readiness: ${asText(context.readiness.level) || "ukjent"} (${Number(context.readiness.score) || 0}/100).`);
    lines.push("Bruk konteksten bare når den er relevant for brukerens nye melding.");
    return truncate(lines.join("\n"), Number(options.maxLength) || 900);
  }

  function buildMessageContext(userMessage, options = {}) {
    const context = buildPersonalContext(options);
    const relevant = selectRelevantContext(userMessage, context, options);
    const personalPrompt = buildRelevantPrompt(userMessage, context, relevant, options);
    let retrieval = null;
    let retrievalPrompt = "";
    const retrievalApi = global.AHAPersonalRetrieval;
    if (retrievalApi && typeof retrievalApi.buildRagContext === "function") {
      retrieval = safeCall(() => retrievalApi.buildRagContext(userMessage, { limit: 5 }), null);
      if (retrieval && retrieval.semanticAvailable && global.AHASemanticRetrieval?.buildSemanticPromptBlock) {
        retrievalPrompt = safeCall(() => global.AHASemanticRetrieval.buildSemanticPromptBlock(retrieval), "");
      }
      if (!retrievalPrompt && retrieval && typeof retrievalApi.buildRagPromptBlock === "function") {
        retrievalPrompt = safeCall(() => retrievalApi.buildRagPromptBlock(retrieval), "");
      }
    }
    if (retrieval) {
      retrieval.mode = retrieval.mode || (retrieval.semanticAvailable ? "hybrid" : "lexical");
      retrieval.semanticAvailable = Boolean(retrieval.semanticAvailable);
    }
    const prompt = [personalPrompt, retrievalPrompt].filter(Boolean).join("\n\n");
    return { context, relevant, retrieval, prompt };
  }

  function getPersonalContextStatus() {
    const context = buildPersonalContext({ corpusLimit: 10, exampleLimit: 10 });
    const retrievalStatus = asObject(safeCall(() => global.AHAPersonalRetrieval?.getRetrievalStatus?.(), {}));
    const semanticStatus = asObject(safeCall(() => global.AHASemanticRetrieval?.getSemanticStatus?.(), {}));
    return {
      available: Boolean(context.evidence.confirmedClaims || context.evidence.approvedCorpus || context.evidence.approvedExamples),
      approvedCorpus: context.evidence.approvedCorpus,
      approvedExamples: context.evidence.approvedExamples,
      confirmedClaims: context.evidence.confirmedClaims,
      readinessLevel: asText(context.readiness?.level) || "ukjent",
      readinessScore: Number(context.readiness?.score) || 0,
      hasStyleProfile: Boolean(context.style.hasStyleExamples),
      hasProjectContext: asArray(context.projects).length > 0,
      retrievalAvailable: Boolean(retrievalStatus.available),
      indexedItems: Number(retrievalStatus.indexedItems) || 0,
      lastRetrievalIndexBuiltAt: asText(retrievalStatus.lastBuiltAt),
      semanticRetrievalAvailable: Boolean(semanticStatus.available),
      semanticIndexedItems: Number(semanticStatus.indexedItems) || 0,
      semanticVectorModel: asText(semanticStatus.vectorModel),
      retrievalMode: semanticStatus.available ? "hybrid" : (retrievalStatus.available ? "lexical" : "none")
    };
  }

  const AHAChatPersonalContext = {
    VERSION,
    SOURCE,
    buildPersonalContext,
    buildCompactPrompt,
    selectRelevantContext,
    buildMessageContext,
    getPersonalContextStatus
  };

  global.AHAChatPersonalContext = AHAChatPersonalContext;
})(typeof window !== "undefined" ? window : globalThis);
