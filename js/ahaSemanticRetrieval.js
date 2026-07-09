// AHA Semantic Retrieval V2 – lokal, forklarbar semantisk/hybrid retrieval.
(function (global) {
  "use strict";

  function personalAiBoundaryMeta(extra = {}) { return { source_app: "aha", origin_app: extra.origin_app || "aha_personal_ai", local_only: true, control_surface_only: extra.control_surface_only ?? false, retrieval_only: extra.retrieval_only ?? false, evaluation_only: extra.evaluation_only ?? false, preview_only: extra.preview_only ?? false, model_training_enabled: false, fine_tuning_enabled: false, remote_upload_enabled: false, backend_enabled: false, echonet_shared: false, sync_enabled: false, historygo_writeback_enabled: false, writes_to_insight_chamber: false, calls_model_api: false, ...extra }; }
  function isUnavailableRecord(record) { return Boolean(record?.deleted_at || record?.deletedAt || record?.archived === true || record?.status === "archived" || record?.status === "rejected"); }

  const STORAGE_KEY = "aha_personal_semantic_index_v1";
  const VERSION = "v2";
  const VECTOR_MODEL = "local_semantic_v1";
  const STOPWORDS = new Set(["og","det","som","for","med","til","jeg","du","den","de","en","et","på","av","i","å","er","at","har","kan","skal","vil","ikke","eller","men","der","her","når","hva","hvordan","hvorfor","dette","disse","min","mitt","mine","din","ditt","sine","seg","fra","om"]);
  const STEM_SUFFIXES = ["else","ene","ing","lig","het","er","en","et"];

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function asText(value) { return String(value ?? "").trim(); }
  function oneLine(value) { return asText(value).replace(/\s+/g, " "); }
  function truncate(value, max = 260) { const text = oneLine(value); return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trim()}…`; }
  function nowIso(options = {}) { return new Date(options.now || Date.now()).toISOString(); }
  function normalizeToken(value) { return oneLine(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s-]+/gu, " ").replace(/-/g, " "); }
  function tokenize(value) { return normalizeToken(value).split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 3 && !STOPWORDS.has(t)); }
  function unique(list) { return [...new Set(asArray(list).map((v) => oneLine(v)).filter(Boolean))]; }
  function addWeight(weights, term, weight) { const key = normalizeToken(term).trim(); if (!key || key.length < 3 || STOPWORDS.has(key)) return; weights[key] = Math.round(((weights[key] || 0) + weight) * 1000) / 1000; }
  function stem(token) { const lower = normalizeToken(token).trim(); const suffix = STEM_SUFFIXES.find((s) => lower.length > s.length + 3 && lower.endsWith(s)); return suffix ? lower.slice(0, -suffix.length) : lower; }
  function phrasesFrom(text) { const tokens = tokenize(text); const out = []; for (let i = 0; i < tokens.length - 1; i += 1) out.push(`${tokens[i]} ${tokens[i + 1]}`); return unique(out).slice(0, 24); }
  function textHash(text) { let hash = 0; const value = asText(text); for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0; return `h${Math.abs(hash)}`; }
  function sourceWeight(sourceType, source) { const type = asText(sourceType); if (type === "confirmed_claim") return 1; if (type === "important_claim") return 0.95; if (type === "corpus_item" || source === "training_corpus") return 0.82; if (type === "training_example" || source === "training_examples") return 0.78; if (type === "readiness_summary") return 0.45; return 0.6; }

  function extractSemanticFeatures(text, item = {}) {
    const src = asObject(item);
    const bodyTokens = tokenize(text);
    const titleTokens = tokenize(src.title);
    const excerptTokens = tokenize(src.excerpt);
    const concepts = unique(asArray(src.concepts).concat(asArray(src.tags))).map((v) => normalizeToken(v).trim()).filter(Boolean);
    const projectTerms = tokenize(src.project).concat(asText(src.project) ? [normalizeToken(src.project).trim()] : []).filter(Boolean);
    const tokens = unique(titleTokens.concat(excerptTokens, bodyTokens, concepts.flatMap(tokenize), projectTerms));
    const stems = unique(tokens.map(stem).filter((t) => t.length >= 3));
    const phrases = phrasesFrom([src.title, src.excerpt, text].filter(Boolean).join(" "));
    const weightedTerms = {};
    bodyTokens.forEach((t) => addWeight(weightedTerms, t, 1));
    excerptTokens.forEach((t) => addWeight(weightedTerms, t, 1.4));
    titleTokens.forEach((t) => addWeight(weightedTerms, t, 2.2));
    stems.forEach((t) => addWeight(weightedTerms, t, 0.7));
    concepts.forEach((c) => { addWeight(weightedTerms, c, 2.8); tokenize(c).forEach((t) => addWeight(weightedTerms, t, 2.5)); });
    projectTerms.forEach((p) => addWeight(weightedTerms, p, 3));
    if (["confirmed_claim", "important_claim"].includes(src.sourceType)) Object.keys(weightedTerms).forEach((k) => { weightedTerms[k] = Math.round(weightedTerms[k] * 1.15 * 1000) / 1000; });
    return { tokens, concepts, stems, phrases, projectTerms: unique(projectTerms), weightedTerms };
  }

  function buildLocalVector(features) {
    const weights = { ...asObject(features?.weightedTerms) };
    const dimensions = Object.keys(weights).sort();
    return { dimensions, weights };
  }

  function cosineSimilarity(vectorA, vectorB) {
    const a = asObject(vectorA?.weights); const b = asObject(vectorB?.weights);
    let dot = 0; let magA = 0; let magB = 0;
    Object.keys(a).forEach((k) => { const av = Number(a[k]) || 0; magA += av * av; if (b[k]) dot += av * (Number(b[k]) || 0); });
    Object.keys(b).forEach((k) => { const bv = Number(b[k]) || 0; magB += bv * bv; });
    if (!magA || !magB) return 0;
    return Math.max(0, Math.min(1, dot / (Math.sqrt(magA) * Math.sqrt(magB))));
  }

  function overlap(a, b) { const set = new Set(asArray(b).map((v) => normalizeToken(v).trim())); return asArray(a).map((v) => normalizeToken(v).trim()).filter((v) => v && set.has(v)); }
  function semanticSimilarity(queryFeatures, itemFeatures) {
    const q = asObject(queryFeatures); const i = asObject(itemFeatures);
    const vector = cosineSimilarity(buildLocalVector(q), buildLocalVector(i));
    const conceptHits = overlap(q.tokens.concat(q.concepts || []), i.concepts || []);
    const projectHits = overlap(q.tokens.concat(q.projectTerms || []), i.projectTerms || []);
    const phraseHits = overlap(q.phrases || [], i.phrases || []);
    let score = vector * 0.62 + Math.min(0.18, conceptHits.length * 0.06) + Math.min(0.14, projectHits.length * 0.07) + Math.min(0.08, phraseHits.length * 0.04);
    const reasons = [];
    if (vector >= 0.12) reasons.push("semantisk nærhet");
    if (conceptHits.length) reasons.push(`begrepsmatch: ${unique(conceptHits).slice(0, 4).join(", ")}`);
    if (projectHits.length) reasons.push(`prosjektmatch: ${unique(projectHits).slice(0, 3).join(", ")}`);
    if (phraseHits.length) reasons.push(`frasematch: ${unique(phraseHits).slice(0, 2).join(", ")}`);
    return { score: Math.round(Math.min(1, score) * 1000) / 1000, reasons };
  }

  function normalizeSemanticItem(item) {
    const src = asObject(item); const text = oneLine(src.text || src.excerpt || src.title); const features = src.semanticFeatures || extractSemanticFeatures(text, src);
    return { id: asText(src.id) || `semantic:${src.source}:${src.sourceId}`, type: "semantic_retrieval_item", source: asText(src.source), sourceId: asText(src.sourceId), sourceType: asText(src.sourceType), title: truncate(src.title || text || "Personlig kunnskap", 120), text, excerpt: truncate(src.excerpt || text, 280), language: asText(src.language) || "no", project: oneLine(src.project), concepts: unique(src.concepts), tags: unique(src.tags), taskType: asText(src.taskType), lexicalTokens: unique(src.lexicalTokens || tokenize([src.title, text].join(" "))), semanticFeatures: features, vector: src.vector || buildLocalVector(features), vectorModel: asText(src.vectorModel) || VECTOR_MODEL, textHash: asText(src.textHash) || textHash(text), weight: Number(src.weight) || 1, consent: asObject(src.consent), createdAt: asText(src.createdAt), updatedAt: asText(src.updatedAt || src.createdAt), meta: asObject(src.meta) };
  }

  function buildSemanticIndex(options = {}) {
    const base = global.AHAPersonalRetrieval?.buildRetrievalIndex ? global.AHAPersonalRetrieval.buildRetrievalIndex(options) : { items: [] };
    const items = asArray(base.items).map(normalizeSemanticItem);
    const bySource = {}; const bySourceType = {};
    items.forEach((item) => { bySource[item.source] = (bySource[item.source] || 0) + 1; bySourceType[item.sourceType] = (bySourceType[item.sourceType] || 0) + 1; });
    return { generatedAt: nowIso(options), version: VERSION, vectorModel: VECTOR_MODEL, local_only: true, retrieval_only: true, model_training_enabled: false, fine_tuning_enabled: false, remote_upload_enabled: false, backend_enabled: false, echonet_shared: false, sync_enabled: false, calls_model_api: false, meta: personalAiBoundaryMeta({ origin_app: "aha_semantic_retrieval", object_type: "semantic_retrieval_index", retrieval_only: true }), items, stats: { total: items.length, bySource, bySourceType, vectorModel: VECTOR_MODEL, corpusItems: bySource.training_corpus || 0, examples: bySource.training_examples || 0, memoryClaims: bySource.meta_insights_memory || 0 } };
  }
  function saveSemanticIndex(index) { const safe = { ...asObject(index), items: asArray(index?.items).map(normalizeSemanticItem), vectorModel: VECTOR_MODEL, version: VERSION, generatedAt: asText(index?.generatedAt) || nowIso() }; try { global.localStorage?.setItem(STORAGE_KEY, JSON.stringify(safe)); } catch {} return safe; }
  function loadSemanticIndex() { try { const parsed = JSON.parse(global.localStorage?.getItem(STORAGE_KEY) || "null"); if (!parsed || !Array.isArray(parsed.items)) return null; return { ...parsed, items: parsed.items.map(normalizeSemanticItem) }; } catch { return null; } }
  function refreshSemanticIndex(options = {}) { return saveSemanticIndex(buildSemanticIndex(options)); }
  function getSemanticStatus() { const index = loadSemanticIndex(); const stats = asObject(index?.stats); return { available: Boolean(index && asArray(index.items).length), indexedItems: asArray(index?.items).length, vectorModel: asText(index?.vectorModel) || VECTOR_MODEL, lastBuiltAt: asText(index?.generatedAt), corpusItems: Number(stats.corpusItems) || 0, examples: Number(stats.examples) || 0, memoryClaims: Number(stats.memoryClaims) || 0 }; }

  function searchSemanticKnowledge(query, options = {}) {
    const index = options.index || loadSemanticIndex() || refreshSemanticIndex(options); const limit = Math.max(1, Number(options.limit) || 8); const minScore = Number(options.minScore ?? 0.1); const qf = extractSemanticFeatures(query, { title: query });
    const results = asArray(index?.items).map((item) => ({ item, ...semanticSimilarity(qf, item.semanticFeatures) })).filter((e) => e.score >= minScore).sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title)).slice(0, limit).map(({ item, score, reasons }) => ({ id: item.id, source: item.source, sourceId: item.sourceId, sourceType: item.sourceType, title: item.title, excerpt: item.excerpt, semanticScore: score, reasons: reasons.concat([item.sourceType === "confirmed_claim" ? "bekreftet selvinnsikt" : "", item.sourceType === "corpus_item" ? "godkjent corpus" : ""].filter(Boolean)), project: item.project, concepts: item.concepts, taskType: item.taskType, meta: item.meta }));
    return { query: asText(query), generatedAt: nowIso(options), vectorModel: VECTOR_MODEL, local_only: true, retrieval_only: true, model_training_enabled: false, fine_tuning_enabled: false, remote_upload_enabled: false, backend_enabled: false, calls_model_api: false, results, stats: { indexedItems: asArray(index?.items).length, returnedItems: results.length } };
  }
  function normLex(score) { return Math.max(0, Math.min(1, (Number(score) || 0) / 30)); }
  function hybridSearch(query, options = {}) {
    const lexical = global.AHAPersonalRetrieval?.searchPersonalKnowledge ? global.AHAPersonalRetrieval.searchPersonalKnowledge(query, { ...options, limit: Math.max(8, Number(options.limit) || 8), minScore: options.lexicalMinScore ?? 1 }) : { results: [] };
    const semantic = searchSemanticKnowledge(query, { ...options, limit: Math.max(8, Number(options.limit) || 8), minScore: options.semanticMinScore ?? 0.1 });
    const byId = new Map();
    asArray(lexical.results).forEach((r) => byId.set(r.id, { ...r, lexicalScore: normLex(r.score), semanticScore: 0, reasons: asArray(r.reasons) }));
    asArray(semantic.results).forEach((r) => { const cur = byId.get(r.id) || { ...r, lexicalScore: 0, reasons: [] }; byId.set(r.id, { ...cur, ...r, lexicalScore: cur.lexicalScore || 0, semanticScore: Number(r.semanticScore) || 0, reasons: unique(asArray(cur.reasons).concat(r.reasons)) }); });
    const results = [...byId.values()].map((r) => ({ ...r, hybridScore: Math.round(((r.lexicalScore * 0.45) + (r.semanticScore * 0.45) + (sourceWeight(r.sourceType, r.source) * 0.10)) * 1000) / 1000 })).sort((a, b) => b.hybridScore - a.hybridScore).slice(0, Math.max(1, Number(options.limit) || 8));
    return { query: asText(query), generatedAt: nowIso(options), local_only: true, retrieval_only: true, model_training_enabled: false, fine_tuning_enabled: false, remote_upload_enabled: false, backend_enabled: false, calls_model_api: false, results, lexicalCount: asArray(lexical.results).length, semanticCount: asArray(semantic.results).length, hybridCount: results.length };
  }
  function buildSemanticRagContext(query, options = {}) { const maxLength = Math.min(1200, Math.max(700, Number(options.maxLength) || 1000)); const search = hybridSearch(query, { ...options, limit: Math.min(5, Number(options.limit) || 5) }); const lines = ["Relevant personlig kunnskap fra AHA Semantic Retrieval:"]; search.results.forEach((item, index) => lines.push(`${index + 1}. [${item.title} / ${item.source}] ${truncate(item.excerpt, 190)}`)); if (!search.results.length) lines.push("Ingen relevante godkjente personlige kilder funnet."); lines.push("Bruk dette når det styrker svaret."); return { query: search.query, generatedAt: search.generatedAt, local_only: true, retrieval_only: true, model_training_enabled: false, fine_tuning_enabled: false, remote_upload_enabled: false, backend_enabled: false, calls_model_api: false, results: search.results, contextText: truncate(lines.join("\n"), maxLength), sourceSummary: search.results.reduce((out, item) => { out[item.source] = (out[item.source] || 0) + 1; return out; }, {}), evidence: search.results.map((item) => ({ source: item.source, sourceId: item.sourceId, sourceType: item.sourceType, title: item.title, excerpt: item.excerpt, lexicalScore: item.lexicalScore, semanticScore: item.semanticScore, hybridScore: item.hybridScore, reasons: item.reasons })) }; }
  function buildSemanticPromptBlock(ragContext, options = {}) { const rag = asObject(ragContext); if (!asArray(rag.results).length && options.includeEmpty !== true) return ""; return truncate(["AHA Semantic Retrieval:", "Følgende godkjente personlige kilder er semantisk relevante for denne meldingen:", rag.contextText, "Svar med støtte i dette materialet der det passer, og ikke overdriv hvis kildene er svake."].join("\n"), Number(options.maxLength) || 1300); }

  function getKnowledgeMapBoosts(query) {
    const km = global.AHAKnowledgeMap;
    if (!km || typeof km.searchKnowledgeMap !== "function") return { available:false, projects:[], concepts:[], relatedNodes:[] };
    try { const results = km.searchKnowledgeMap(query).results || []; return { available:true, projects: results.filter((n)=>n.nodeType==="project").slice(0,5), concepts: results.filter((n)=>n.nodeType==="concept").slice(0,8), relatedNodes: results.slice(0,10) }; }
    catch { return { available:true, projects:[], concepts:[], relatedNodes:[] }; }
  }

  global.AHASemanticRetrieval = { personalAiBoundaryMeta, isUnavailableRecord, STORAGE_KEY, VERSION, VECTOR_MODEL, extractSemanticFeatures, buildLocalVector, cosineSimilarity, semanticSimilarity, buildSemanticIndex, saveSemanticIndex, loadSemanticIndex, refreshSemanticIndex, getSemanticStatus, searchSemanticKnowledge, hybridSearch, buildSemanticRagContext, buildSemanticPromptBlock, getKnowledgeMapBoosts };
})(typeof window !== "undefined" ? window : globalThis);
