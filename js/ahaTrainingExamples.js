// ahaTrainingExamples.js
// ─────────────────────────────────────────────
// AHA Training Examples – genererer og forvalter treningseksempler.
// Tar godkjente corpus items fra AHATrainingCorpus og lager enkle
// algoritmiske training examples (V1). Brukeren godkjenner hvert example,
// og kun godkjente examples med fine-tuning-samtykke eksporteres som JSONL.
//   corpus item → training example → example-godkjenning → JSONL-eksport
// Alt er lokalt (localStorage). Ingen sync, ingen nettverkskall.
// ─────────────────────────────────────────────

(function (global) {
  "use strict";

  const STORAGE_KEY = "aha_training_examples_v1";
  const ITEM_TYPE = "training_example";

  const ALLOWED_TASK_TYPES = [
    "summary",
    "question_answer",
    "concept_explanation",
    "style_example",
    "project_explanation",
    "rewrite",
    "classification",
    "memory_fact"
  ];
  const ALLOWED_STATUS = ["draft", "approved", "rejected", "needs_review", "exported"];

  // Norske formuleringer som signaliserer et minnefaktum om brukeren.
  const MEMORY_FACT_PATTERNS = [
    "jeg ønsker",
    "jeg vil",
    "jeg jobber med",
    "prosjektet heter",
    "jeg foretrekker",
    "jeg liker"
  ];

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function asText(value) { return String(value ?? "").trim(); }

  function getStorage() {
    try { return global.localStorage || null; } catch { return null; }
  }

  function safeParse(raw, fallback) {
    try {
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function makeId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function isTombstoned(item) {
    return Boolean(item?.deletedAt || item?.deleted_at);
  }

  function normalizeStatus(status) {
    const normalized = asText(status).toLowerCase();
    return ALLOWED_STATUS.includes(normalized) ? normalized : "draft";
  }

  function normalizeTaskType(taskType) {
    const normalized = asText(taskType).toLowerCase();
    return ALLOWED_TASK_TYPES.includes(normalized) ? normalized : "summary";
  }

  function normalizeLanguage(language) {
    const normalized = asText(language).toLowerCase();
    return ["no", "en", "unknown"].includes(normalized) ? normalized : "unknown";
  }

  function normalizeQuality(quality) {
    const src = asObject(quality);
    const score = Number(src.score);
    return {
      score: Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0,
      reason: asText(src.reason)
    };
  }

  function normalizeStringArray(value) {
    const raw = Array.isArray(value) ? value : (typeof value === "string" ? value.split(",") : []);
    const out = [];
    raw.forEach((entry) => {
      const text = asText(entry);
      if (text) out.push(text);
    });
    return out;
  }

  function normalizeExample(input) {
    const src = asObject(input);
    const now = nowIso();
    const deletedAt = src.deletedAt || src.deleted_at || "";
    return {
      id: asText(src.id) || makeId("example"),
      type: ITEM_TYPE,
      corpusItemId: asText(src.corpusItemId || src.corpus_item_id),
      source: asText(src.source) || "aha_training_examples",
      taskType: normalizeTaskType(src.taskType || src.task_type),
      input: asText(src.input),
      output: asText(src.output),
      language: normalizeLanguage(src.language),
      status: normalizeStatus(src.status),
      quality: normalizeQuality(src.quality),
      labels: normalizeStringArray(src.labels),
      createdAt: src.createdAt || src.created_at || now,
      updatedAt: src.updatedAt || src.updated_at || src.createdAt || src.created_at || now,
      deletedAt: deletedAt || "",
      meta: asObject(src.meta)
    };
  }

  // 2. loadAllExamples – hele lageret inkludert tombstones.
  function loadAllExamples() {
    const storage = getStorage();
    if (!storage) return [];
    const raw = safeParse(storage.getItem(STORAGE_KEY) || "[]", []);
    return asArray(raw).map((item) => normalizeExample(item));
  }

  // 1. loadExamples – aktive examples uten tombstones.
  function loadExamples() {
    return loadAllExamples().filter((item) => !isTombstoned(item));
  }

  // 3. saveExamples – normaliserer og lagrer hele arrayet.
  function saveExamples(items) {
    const normalized = asArray(items).map((item) => normalizeExample(item));
    try { getStorage()?.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch {}
    return normalized;
  }

  // 4. addExample – legger til nytt example.
  function addExample(input) {
    const example = normalizeExample(input);
    if (!example.input || !example.output) return null;
    const all = loadAllExamples();
    all.unshift(example);
    saveExamples(all);
    return example;
  }

  // 5. updateExample – patcher ett example og setter updatedAt.
  function updateExample(id, patch) {
    const targetId = asText(id);
    if (!targetId) return null;
    const all = loadAllExamples();
    const index = all.findIndex((item) => item.id === targetId);
    if (index < 0) return null;
    const current = all[index];
    const next = normalizeExample({
      ...current,
      ...asObject(patch),
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: nowIso()
    });
    all[index] = next;
    saveExamples(all);
    return next;
  }

  // 6. markExampleStatus – setter en gyldig status.
  function markExampleStatus(id, status) {
    if (!ALLOWED_STATUS.includes(asText(status).toLowerCase())) return null;
    return updateExample(id, { status: normalizeStatus(status) });
  }

  // 7. deleteExample – setter tombstone (deletedAt).
  function deleteExample(id) {
    const targetId = asText(id);
    if (!targetId) return null;
    const all = loadAllExamples();
    const index = all.findIndex((item) => item.id === targetId);
    if (index < 0) return null;
    const now = nowIso();
    all[index] = normalizeExample({ ...all[index], deletedAt: now, updatedAt: now });
    saveExamples(all);
    return all[index];
  }

  function shortSummary(text, limit = 240) {
    const value = asText(text).replace(/\s+/g, " ");
    if (value.length <= limit) return value;
    return `${value.slice(0, limit - 1)}…`;
  }

  function buildMemoryFact(corpusItem) {
    const text = asText(corpusItem?.text).replace(/\s+/g, " ");
    const lower = text.toLowerCase();
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    for (const pattern of MEMORY_FACT_PATTERNS) {
      if (!lower.includes(pattern)) continue;
      const match = sentences.find((sentence) => sentence.toLowerCase().includes(pattern));
      return shortSummary(match || text, 200);
    }
    return "";
  }

  // 8. generateExamplesFromCorpusItem – algoritmisk V1-generator.
  //    Lager summary, concept_explanation, project_explanation, style_example
  //    og memory_fact basert på corpus item-innholdet og samtykke.
  function generateExamplesFromCorpusItem(corpusItem, options = {}) {
    const item = asObject(corpusItem);
    const text = asText(item.text);
    const title = asText(item.title);
    if (!text && !title) return [];

    const opts = asObject(options);
    const language = ["no", "en", "unknown"].includes(asText(item.language)) ? asText(item.language) : "no";
    const consent = asObject(item.consent);
    const concepts = asArray(item.concepts).map((c) => asText(c)).filter(Boolean);
    const project = asText(item.project);
    const examples = [];
    const base = {
      corpusItemId: asText(item.id),
      source: asText(item.source) || "aha_training_examples",
      language
    };

    // summary
    examples.push(normalizeExample({
      ...base,
      taskType: "summary",
      input: "Oppsummer denne teksten kort.",
      output: shortSummary(text || title) || title,
      quality: { score: 0.5, reason: "Algoritmisk V1-oppsummering." },
      meta: { generator: "v1", basis: "title_or_text" }
    }));

    // concept_explanation – ett per begrep (begrenset).
    concepts.slice(0, opts.maxConcepts || 3).forEach((concept) => {
      examples.push(normalizeExample({
        ...base,
        taskType: "concept_explanation",
        input: `Forklar begrepet: ${concept}`,
        output: shortSummary(text || title) || `Begrepet «${concept}» går igjen i dette materialet.`,
        labels: [concept],
        quality: { score: 0.4, reason: "Algoritmisk begrepsforklaring." },
        meta: { generator: "v1", concept }
      }));
    });

    // project_explanation
    if (project) {
      examples.push(normalizeExample({
        ...base,
        taskType: "project_explanation",
        input: `Forklar prosjektet: ${project}`,
        output: shortSummary(text || title) || `Dette materialet hører til prosjektet «${project}».`,
        labels: [project],
        quality: { score: 0.4, reason: "Algoritmisk prosjektforklaring." },
        meta: { generator: "v1", project }
      }));
    }

    // style_example – kun ved stil-samtykke.
    if (consent.useForStyle === true && text) {
      examples.push(normalizeExample({
        ...base,
        taskType: "style_example",
        input: "Skriv en kort tekst i min vanlige stil.",
        output: shortSummary(text),
        quality: { score: 0.5, reason: "Stil-eksempel fra brukerens egen tekst." },
        meta: { generator: "v1", basis: "style" }
      }));
    }

    // memory_fact – kun ved tydelige formuleringer.
    const fact = buildMemoryFact(item);
    if (fact) {
      examples.push(normalizeExample({
        ...base,
        taskType: "memory_fact",
        input: "Hva bør AHA huske fra denne teksten?",
        output: fact,
        quality: { score: 0.6, reason: "Minnefaktum utledet fra tydelig formulering." },
        meta: { generator: "v1", basis: "memory_fact" }
      }));
    }

    return examples;
  }

  // 9. generateExamplesFromApprovedCorpus – lager og lagrer examples fra
  //    corpus items med status approved og consent.useForTrainingExamples.
  function generateExamplesFromApprovedCorpus(options = {}) {
    const corpusApi = global.AHATrainingCorpus;
    if (!corpusApi || typeof corpusApi.loadCorpus !== "function") {
      return { ok: false, error: "missing_corpus", added: 0, total: loadExamples().length };
    }

    const opts = asObject(options);
    const corpus = corpusApi.loadCorpus().filter((item) =>
      item.status === "approved" && asObject(item.consent).useForTrainingExamples === true
    );

    const all = loadAllExamples();
    const existing = new Set(all.map((ex) => `${ex.corpusItemId}::${ex.taskType}::${ex.input}`));
    let added = 0;

    corpus.forEach((item) => {
      generateExamplesFromCorpusItem(item, opts).forEach((example) => {
        const key = `${example.corpusItemId}::${example.taskType}::${example.input}`;
        if (existing.has(key)) return;
        all.unshift(example);
        existing.add(key);
        added += 1;
      });
    });

    if (added) saveExamples(all);
    return { ok: true, added, corpusItems: corpus.length, total: loadExamples().length };
  }

  // 10. collectExampleStats – status- og taskType-telling.
  function collectExampleStats() {
    const active = loadExamples();
    const stats = {
      total: active.length,
      draft: 0,
      approved: 0,
      rejected: 0,
      needsReview: 0,
      exported: 0,
      byTaskType: {}
    };
    active.forEach((example) => {
      if (example.status === "needs_review") stats.needsReview += 1;
      else if (Object.prototype.hasOwnProperty.call(stats, example.status)) stats[example.status] += 1;
      stats.byTaskType[example.taskType] = (stats.byTaskType[example.taskType] || 0) + 1;
    });
    return stats;
  }

  // Bygger oppslag corpusItemId → corpus item for samtykkesjekk.
  function buildCorpusConsentMap() {
    const corpusApi = global.AHATrainingCorpus;
    const map = new Map();
    if (corpusApi && typeof corpusApi.loadCorpus === "function") {
      corpusApi.loadCorpus().forEach((item) => map.set(item.id, item));
    }
    return map;
  }

  // Returnerer examples som er godkjent og har fine-tuning-samtykke på
  // tilhørende corpus item.
  function selectExportableExamples() {
    const corpusMap = buildCorpusConsentMap();
    return loadExamples().filter((example) => {
      if (example.status !== "approved") return false;
      const corpusItem = corpusMap.get(example.corpusItemId);
      return Boolean(corpusItem && asObject(corpusItem.consent).useForFineTuning === true);
    });
  }

  function exampleToJsonlLine(example) {
    return JSON.stringify({
      messages: [
        { role: "user", content: example.input },
        { role: "assistant", content: example.output }
      ],
      metadata: {
        taskType: example.taskType,
        source: "aha_training_examples",
        language: example.language || "no"
      }
    });
  }

  // 11. exportApprovedExamples – returnerer JSONL-streng for godkjente
  //     examples med fine-tuning-samtykke på corpus-laget.
  function exportApprovedExamples(format = "jsonl") {
    if (asText(format).toLowerCase() !== "jsonl") {
      return "";
    }
    return selectExportableExamples().map(exampleToJsonlLine).join("\n");
  }

  // 12. downloadApprovedExamples – lokal browser-nedlasting av JSONL.
  function downloadApprovedExamples() {
    const content = exportApprovedExamples("jsonl");
    const fileName = "aha-training-examples.jsonl";
    try {
      const doc = global.document;
      const blob = new global.Blob([content], { type: "application/jsonl" });
      const url = global.URL.createObjectURL(blob);
      const link = doc.createElement("a");
      link.href = url;
      link.download = fileName;
      doc.body.appendChild(link);
      link.click();
      doc.body.removeChild(link);
      global.URL.revokeObjectURL(url);
      return { ok: true, fileName, bytes: content.length };
    } catch (error) {
      return { ok: false, error: String(error), content };
    }
  }

  const AHATrainingExamples = {
    STORAGE_KEY,
    ITEM_TYPE,
    ALLOWED_TASK_TYPES: [...ALLOWED_TASK_TYPES],
    ALLOWED_STATUS: [...ALLOWED_STATUS],
    MEMORY_FACT_PATTERNS: [...MEMORY_FACT_PATTERNS],
    loadExamples,
    loadAllExamples,
    saveExamples,
    addExample,
    updateExample,
    markExampleStatus,
    deleteExample,
    generateExamplesFromCorpusItem,
    generateExamplesFromApprovedCorpus,
    collectExampleStats,
    selectExportableExamples,
    exportApprovedExamples,
    downloadApprovedExamples,
    normalizeExample
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AHATrainingExamples;
  }
  if (global) {
    global.AHATrainingExamples = AHATrainingExamples;
  }
})(typeof window !== "undefined" ? window : this);
