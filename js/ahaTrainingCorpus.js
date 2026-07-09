// ahaTrainingCorpus.js
// ─────────────────────────────────────────────
// AHA Training Corpus is a local review corpus. It stores user-approved local
// material for retrieval, examples and later export decisions. It does not
// train, fine-tune, upload, sync or call any model/backend. Alt er lokalt
// (localStorage) og approval-basert.
// ─────────────────────────────────────────────

(function (global) {
  "use strict";

  const STORAGE_KEY = "aha_training_corpus_v1";
  const ITEM_TYPE = "training_corpus_item";

  const ALLOWED_STATUS = ["raw", "reviewed", "approved", "rejected", "exported"];
  const ALLOWED_SOURCE_TYPES = ["note", "chat_message", "feed_post", "article", "afterwork", "insight", "manual_text"];
  const ALLOWED_LANGUAGES = ["no", "en", "unknown"];

  const CONSENT_KEYS = ["useForMemory", "useForTrainingExamples", "useForFineTuning", "useForStyle", "useForKnowledge"];

  function trainingBoundaryMeta(extra = {}) {
    return {
      source_app: "aha", origin_app: extra.origin_app || "aha_training", local_only: true, review_required: true, approval_required: true,
      training_data_candidate_only: extra.training_data_candidate_only ?? false, model_training_enabled: false, fine_tuning_enabled: false,
      remote_upload_enabled: false, backend_enabled: false, echonet_shared: false, sync_enabled: false, historygo_writeback_enabled: false,
      writes_to_insight_chamber: false, calls_model_api: false, ...extra
    };
  }
  function isUnavailableRecord(record) { return Boolean(record?.deleted_at || record?.deletedAt || record?.archived === true || record?.status === "archived" || record?.status === "rejected"); }

  function defaultConsent() {
    // useForFineTuning means only future explicit local export eligibility, not active fine-tuning.
    return {
      useForMemory: true,
      useForTrainingExamples: false,
      useForFineTuning: false,
      useForStyle: false,
      useForKnowledge: true
    };
  }

  // Eksisterende AHA-lagre vi kan hente tekst fra.
  const SOURCE_KEYS = {
    notes: "aha_notes_v1",
    feed: "aha_feed_posts_v1",
    articles: "aha_articles_v1",
    sourceEvents: "aha_source_events_v1",
    afterwork: "aha_afterwork_v1",
    insights: "aha_insight_chamber_v1"
  };

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

  // Stabil teksthash (djb2-variant) for dedup. Normaliserer whitespace og
  // store/små bokstaver slik at samme tekst alltid gir samme hash.
  function textHash(text) {
    const normalized = asText(text).replace(/\s+/g, " ").toLowerCase();
    let hash = 5381;
    for (let i = 0; i < normalized.length; i += 1) {
      hash = ((hash << 5) + hash + normalized.charCodeAt(i)) >>> 0;
    }
    return `t${hash.toString(36)}_${normalized.length}`;
  }

  // Enkel språkgjenkjenning. Norsk vinner ved norske tegn/ord, ellers
  // engelsk ved tydelige engelske ord, ellers unknown.
  function detectLanguage(text) {
    const value = asText(text).toLowerCase();
    if (!value) return "unknown";
    if (/[æøå]/.test(value)) return "no";
    const noWords = /(\b(og|jeg|ikke|som|det|å|på|med|for|har|kan|vil|være|dette|prosjektet|begrep)\b)/;
    const enWords = /(\b(the|and|is|are|this|that|with|for|have|will|project|concept)\b)/;
    const noHit = noWords.test(value);
    const enHit = enWords.test(value);
    if (noHit && !enHit) return "no";
    if (enHit && !noHit) return "en";
    if (noHit && enHit) return "no";
    return "unknown";
  }

  function normalizeStatus(status) {
    const normalized = asText(status).toLowerCase();
    return ALLOWED_STATUS.includes(normalized) ? normalized : "raw";
  }

  function normalizeLanguage(language, text) {
    const normalized = asText(language).toLowerCase();
    if (ALLOWED_LANGUAGES.includes(normalized) && normalized !== "unknown") return normalized;
    if (normalized === "unknown") return detectLanguage(text) === "unknown" ? "unknown" : detectLanguage(text);
    return detectLanguage(text);
  }

  function normalizeConsent(consent) {
    const base = defaultConsent();
    const src = asObject(consent);
    CONSENT_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(src, key)) base[key] = src[key] === true;
    });
    return base;
  }

  function normalizeStringArray(value) {
    const raw = Array.isArray(value) ? value : (typeof value === "string" ? value.split(",") : []);
    const seen = new Set();
    const out = [];
    raw.forEach((entry) => {
      const text = asText(entry?.label || entry?.name || entry);
      if (!text) return;
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(text);
    });
    return out;
  }

  // 11. normalizeCorpusItem – gir stabilt schema for ett corpus item.
  function normalizeCorpusItem(input) {
    const src = asObject(input);
    const now = nowIso();
    const text = asText(src.text);
    const deletedAt = src.deletedAt || src.deleted_at || "";

    return {
      id: asText(src.id) || makeId("corpus"),
      type: ITEM_TYPE,
      source: asText(src.source) || "manual",
      sourceId: asText(src.sourceId || src.source_id),
      sourceType: ALLOWED_SOURCE_TYPES.includes(asText(src.sourceType || src.source_type))
        ? asText(src.sourceType || src.source_type)
        : "manual_text",
      title: asText(src.title) || (text ? text.slice(0, 80) : "Uten tittel"),
      text,
      language: normalizeLanguage(src.language, text),
      project: asText(src.project),
      tags: normalizeStringArray(src.tags),
      concepts: normalizeStringArray(src.concepts),
      status: normalizeStatus(src.status),
      consent: normalizeConsent(src.consent),
      createdAt: src.createdAt || src.created_at || now,
      updatedAt: src.updatedAt || src.updated_at || src.createdAt || src.created_at || now,
      deletedAt: deletedAt || "",
      local_only: true,
      review_required: true,
      approval_required: true,
      training_data_candidate_only: true,
      model_training_enabled: false,
      fine_tuning_enabled: false,
      remote_upload_enabled: false,
      backend_enabled: false,
      echonet_shared: false,
      sync_enabled: false,
      historygo_writeback_enabled: false,
      writes_to_insight_chamber: false,
      calls_model_api: false,
      meta: { ...asObject(src.meta), ...trainingBoundaryMeta({ origin_app: "aha_training_corpus", object_type: "training_corpus_item", training_data_candidate_only: true }) },
      textHash: asText(src.textHash) || textHash(text)
    };
  }

  // 2/1. loadAllCorpus – hele lageret inkludert tombstones.
  function loadAllCorpus() {
    const storage = getStorage();
    if (!storage) return [];
    const raw = safeParse(storage.getItem(STORAGE_KEY) || "[]", []);
    return asArray(raw).map((item) => normalizeCorpusItem(item));
  }

  // 1. loadCorpus – aktivt corpus uten tombstoned items.
  function loadCorpus() {
    return loadAllCorpus().filter((item) => !isTombstoned(item));
  }

  // 3. saveCorpus – normaliserer og lagrer hele arrayet.
  function saveCorpus(items) {
    const normalized = asArray(items).map((item) => normalizeCorpusItem(item));
    try { getStorage()?.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch {}
    return normalized;
  }

  // 4. addCorpusItem – legger til nytt corpus item.
  function addCorpusItem(input) {
    const item = normalizeCorpusItem(input);
    if (!item.text && !item.title) return null;
    const all = loadAllCorpus();
    all.unshift(item);
    saveCorpus(all);
    return item;
  }

  // 5. updateCorpusItem – patcher ett item og setter updatedAt.
  function updateCorpusItem(id, patch) {
    const targetId = asText(id);
    if (!targetId) return null;
    const all = loadAllCorpus();
    const index = all.findIndex((item) => item.id === targetId);
    if (index < 0) return null;
    const current = all[index];
    const next = normalizeCorpusItem({
      ...current,
      ...asObject(patch),
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: nowIso()
    });
    all[index] = next;
    saveCorpus(all);
    return next;
  }

  // 6. markCorpusItemStatus – setter en gyldig status.
  function markCorpusItemStatus(id, status) {
    const normalized = normalizeStatus(status);
    if (!ALLOWED_STATUS.includes(asText(status).toLowerCase())) return null;
    return updateCorpusItem(id, { status: normalized });
  }

  // 7. setCorpusConsent – patcher consent for ett item.
  function setCorpusConsent(id, consentPatch) {
    const targetId = asText(id);
    if (!targetId) return null;
    const all = loadAllCorpus();
    const index = all.findIndex((item) => item.id === targetId);
    if (index < 0) return null;
    const current = all[index];
    const mergedConsent = { ...current.consent };
    const patch = asObject(consentPatch);
    CONSENT_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(patch, key)) mergedConsent[key] = patch[key] === true;
    });
    const next = normalizeCorpusItem({ ...current, consent: mergedConsent, updatedAt: nowIso() });
    all[index] = next;
    saveCorpus(all);
    return next;
  }

  // 8. deleteCorpusItem – setter tombstone (deletedAt).
  function deleteCorpusItem(id) {
    const targetId = asText(id);
    if (!targetId) return null;
    const all = loadAllCorpus();
    const index = all.findIndex((item) => item.id === targetId);
    if (index < 0) return null;
    const now = nowIso();
    all[index] = normalizeCorpusItem({ ...all[index], deletedAt: now, updatedAt: now });
    saveCorpus(all);
    return all[index];
  }

  // 9. collectCorpusStats – status- og consent-telling.
  function collectCorpusStats() {
    const active = loadCorpus();
    const stats = {
      total: active.length,
      raw: 0,
      reviewed: 0,
      approved: 0,
      rejected: 0,
      exported: 0,
      bySource: {},
      byLanguage: {},
      fineTuningAllowed: 0,
      trainingExamplesAllowed: 0,
      styleAllowed: 0,
      knowledgeAllowed: 0
    };

    active.forEach((item) => {
      if (Object.prototype.hasOwnProperty.call(stats, item.status)) stats[item.status] += 1;
      stats.bySource[item.source] = (stats.bySource[item.source] || 0) + 1;
      stats.byLanguage[item.language] = (stats.byLanguage[item.language] || 0) + 1;
      if (item.consent.useForFineTuning) stats.fineTuningAllowed += 1;
      if (item.consent.useForTrainingExamples) stats.trainingExamplesAllowed += 1;
      if (item.consent.useForStyle) stats.styleAllowed += 1;
      if (item.consent.useForKnowledge) stats.knowledgeAllowed += 1;
    });

    return stats;
  }

  // Henter ut tekstbærende objekter fra ett AHA-lager som corpus-input.
  function collectFromNotes() {
    return asArray(safeParse(getStorage()?.getItem(SOURCE_KEYS.notes) || "[]", []))
      .filter((note) => !isTombstoned(note))
      .map((note) => ({
        source: "aha_notes",
        sourceId: asText(note?.id),
        sourceType: "note",
        title: asText(note?.title),
        text: asText(note?.text),
        tags: note?.tags,
        createdAt: note?.created_at || note?.createdAt
      }))
      .filter((entry) => entry.text || entry.title);
  }

  function collectFromFeed() {
    return asArray(safeParse(getStorage()?.getItem(SOURCE_KEYS.feed) || "[]", []))
      .filter((post) => !isTombstoned(post))
      .map((post) => ({
        source: "aha_feed",
        sourceId: asText(post?.id),
        sourceType: "feed_post",
        title: "AHA Feed-post",
        text: asText(post?.text),
        tags: post?.tags,
        createdAt: post?.created_at || post?.createdAt
      }))
      .filter((entry) => entry.text);
  }

  function collectFromArticles() {
    return asArray(safeParse(getStorage()?.getItem(SOURCE_KEYS.articles) || "[]", []))
      .filter((article) => !isTombstoned(article))
      .map((article) => {
        const body = asText(article?.body);
        const summary = asText(article?.summary);
        return {
          source: "aha_articles",
          sourceId: asText(article?.id),
          sourceType: "article",
          title: asText(article?.title),
          text: body || summary,
          tags: article?.tags,
          project: asText(article?.section),
          createdAt: article?.createdAt || article?.created_at
        };
      })
      .filter((entry) => entry.text || entry.title);
  }

  function collectFromSourceEvents() {
    return asArray(safeParse(getStorage()?.getItem(SOURCE_KEYS.sourceEvents) || "[]", []))
      .filter((event) => !isTombstoned(event))
      .map((event) => ({
        source: "aha_afterwork" === event?.source_app ? "aha_afterwork" : "aha_chat",
        sourceId: asText(event?.id),
        sourceType: "chat_message",
        title: asText(event?.title),
        text: asText(event?.text),
        tags: event?.tags,
        createdAt: event?.created_at || event?.createdAt
      }))
      .filter((entry) => entry.text);
  }

  function collectFromAfterwork() {
    return asArray(safeParse(getStorage()?.getItem(SOURCE_KEYS.afterwork) || "[]", []))
      .filter((entry) => !isTombstoned(entry))
      .map((entry) => {
        const reflection = asText(entry?.reflection);
        const preview = asText(entry?.sourceTextPreview);
        const concepts = asArray(entry?.concepts).map((c) => asText(c?.label || c?.name || c)).filter(Boolean);
        return {
          source: "aha_afterwork",
          sourceId: asText(entry?.id),
          sourceType: "afterwork",
          title: reflection || preview || "AHA etterarbeid",
          text: reflection || preview,
          concepts,
          createdAt: entry?.createdAt || entry?.created_at
        };
      })
      .filter((entry) => entry.text);
  }

  function collectFromInsights() {
    const chamber = asObject(safeParse(getStorage()?.getItem(SOURCE_KEYS.insights) || "{}", {}));
    return asArray(chamber.insights)
      .filter((insight) => !isTombstoned(insight))
      .map((insight) => {
        const summary = asText(insight?.summary);
        const text = asText(insight?.text);
        const concepts = asArray(insight?.concepts).map((c) => asText(c?.label || c?.name || c)).filter(Boolean);
        return {
          source: "aha_insights",
          sourceId: asText(insight?.id),
          sourceType: "insight",
          title: asText(insight?.title || insight?.theme || insight?.summary) || "Innsikt",
          text: summary || text,
          concepts,
          createdAt: insight?.createdAt || insight?.created_at
        };
      })
      .filter((entry) => entry.text || entry.title);
  }

  // 10. importFromExistingAhaSources – samler tekst fra eksisterende lagre,
  //     deduper på source + sourceId + normalisert teksthash.
  function importFromExistingAhaSources(options = {}) {
    const opts = asObject(options);
    const collectors = {
      notes: collectFromNotes,
      feed: collectFromFeed,
      articles: collectFromArticles,
      sourceEvents: collectFromSourceEvents,
      afterwork: collectFromAfterwork,
      insights: collectFromInsights
    };

    let candidates = [];
    Object.keys(collectors).forEach((key) => {
      if (opts[key] === false) return;
      try { candidates = candidates.concat(collectors[key]()); } catch {}
    });

    const all = loadAllCorpus();
    const existingKeys = new Set();
    all.forEach((item) => {
      existingKeys.add(`${item.source}::${item.sourceId}`);
      existingKeys.add(`hash::${item.textHash}`);
    });

    let added = 0;
    let skipped = 0;
    candidates.forEach((candidate) => {
      const text = asText(candidate.text);
      if (!text && !asText(candidate.title)) { skipped += 1; return; }
      const hash = textHash(text);
      const sourceKey = `${asText(candidate.source)}::${asText(candidate.sourceId)}`;
      const hashKey = `hash::${hash}`;
      if ((asText(candidate.sourceId) && existingKeys.has(sourceKey)) || existingKeys.has(hashKey)) {
        skipped += 1;
        return;
      }
      const item = normalizeCorpusItem(candidate);
      all.unshift(item);
      existingKeys.add(sourceKey);
      existingKeys.add(hashKey);
      added += 1;
    });

    if (added) saveCorpus(all);
    return { ok: true, added, skipped, total: loadCorpus().length, ...trainingBoundaryMeta({ origin_app: "aha_training_corpus", object_type: "training_corpus_import", training_data_candidate_only: true }) };
  }

  const AHATrainingCorpus = {
    STORAGE_KEY,
    ITEM_TYPE,
    ALLOWED_STATUS: [...ALLOWED_STATUS],
    ALLOWED_SOURCE_TYPES: [...ALLOWED_SOURCE_TYPES],
    ALLOWED_LANGUAGES: [...ALLOWED_LANGUAGES],
    CONSENT_KEYS: [...CONSENT_KEYS],
    SOURCE_KEYS: { ...SOURCE_KEYS },
    defaultConsent,
    loadCorpus,
    loadAllCorpus,
    saveCorpus,
    addCorpusItem,
    updateCorpusItem,
    markCorpusItemStatus,
    setCorpusConsent,
    deleteCorpusItem,
    collectCorpusStats,
    importFromExistingAhaSources,
    normalizeCorpusItem,
    textHash,
    detectLanguage,
    trainingBoundaryMeta,
    isUnavailableRecord
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AHATrainingCorpus;
  }
  if (global) {
    global.AHATrainingCorpus = AHATrainingCorpus;
  }
})(typeof window !== "undefined" ? window : this);
