// ahaSearch.js
// Fase 3F: første fungerende AHA Søk / Bibliotek (localStorage-first, read-only).

(function (global) {
  "use strict";

  const STORAGE_KEYS = {
    insights: "aha_insight_chamber_v1",
    sourceEvents: "aha_source_events_v1",
    notes: "aha_notes_v1",
    gallery: "aha_gallery_v1",
    feed: "aha_feed_posts_v1",
    insta: "aha_insta_posts_v1",
    lists: "aha_lists_v1",
    paths: "aha_paths_v1",
    articles: "aha_articles_v1",
    groups: "aha_groups_v1",
    musicLibrary: "aha_music_library_v1",
    musicBridge: "aha_music_history_go_bridge_v1",
    musicBridgeAlt: "aha_music_historygo_bridge_v1",
    trainingCorpus: "aha_training_corpus_v1",
    trainingExamples: "aha_training_examples_v1",
    dataIntake: "aha_data_intake_queue_v1",
    knowledgeCuration: "aha_knowledge_curation_v1",
    knowledgeMap: "aha_knowledge_map_v1",
    graphIntelligence: "aha_knowledge_graph_intelligence_v1",
    personalAnswerEvaluations: "aha_personal_answer_evaluations_v1",
    personalAiLoopAudit: "aha_personal_ai_loop_audit_v1"
  };

  const SECRET_KEY_PATTERNS = [
    /token/i,
    /refresh/i,
    /access/i,
    /secret/i,
    /pkce/i,
    /oauth/i,
    /api[_-]?key/i,
    /authorization/i
  ];

  let allItems = [];

  function isSecretKey(key) {
    return SECRET_KEY_PATTERNS.some((pattern) => pattern.test(String(key || "")));
  }

  function redactSearchText(value) {
    const text = String(value ?? "");
    if (!text) return "";
    return text.length > 1200 ? `${text.slice(0, 1200)}…` : text;
  }

  function safeParse(raw, fallback) {
    try {
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asText(value, fallback) {
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  function normalizeTags(tags) {
    if (global.AHAContracts?.normalizeTags) return global.AHAContracts.normalizeTags(tags);
    return asArray(tags).map((tag) => asText(tag, "")).filter(Boolean);
  }

  function isDeletedRecord(record) {
    return Boolean(record?.deletedAt || record?.deleted_at);
  }

  function truncate(text, max) {
    const value = asText(text, "");
    if (!value) return "";
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeDate(item) {
    return item?.updatedAt
      || item?.updated_at
      || item?.lastUpdated
      || item?.last_updated
      || item?.last_reanalyzed_at
      || item?.createdAt
      || item?.created_at
      || item?.firstSeen
      || item?.first_seen
      || "";
  }

  function itemTimestamp(item) {
    const t = Date.parse(normalizeDate(item));
    return Number.isFinite(t) ? t : 0;
  }

  function withBase(item, defaults) {
    if (!global.AHAContracts?.normalizeBaseItem) {
      return {
        id: asText(item?.id, ""),
        title: asText(item?.title, ""),
        type: asText(item?.type, defaults.type || "item"),
        source: asText(item?.source, defaults.source || "aha"),
        createdAt: item?.createdAt || item?.created_at || item?.firstSeen || item?.first_seen || new Date().toISOString(),
        updatedAt: item?.updatedAt || item?.updated_at || item?.lastUpdated || item?.last_updated || item?.createdAt || item?.created_at || item?.firstSeen || item?.first_seen || new Date().toISOString(),
        tags: normalizeTags(item?.tags),
        meta: item?.meta && typeof item.meta === "object" && !Array.isArray(item.meta) ? item.meta : {}
      };
    }
    return global.AHAContracts.normalizeBaseItem(item, defaults);
  }

  function createSearchItem(input) {
    return {
      id: asText(input?.id, ""),
      title: asText(input?.title, "Uten tittel"),
      type: asText(input?.type, "item"),
      source: asText(input?.source, "aha"),
      refId: asText(input?.refId, ""),
      text: redactSearchText(input?.text),
      tags: normalizeTags(input?.tags),
      createdAt: input?.createdAt || "",
      updatedAt: input?.updatedAt || "",
      last_reanalyzed_at: input?.last_reanalyzed_at || "",
      href: asText(input?.href, "index.html"),
      local_only: true,
      read_only: true,
      search_index_item: true,
      derived_index_only: true,
      backend_enabled: false,
      echonet_shared: false,
      sync_enabled: false,
      external_publish_enabled: false,
      historygo_writeback_enabled: false,
      contains_secret: false,
      ...(input?.safety && typeof input.safety === "object" && !Array.isArray(input.safety) ? input.safety : {}),
      meta: {
        source_app: "aha",
        origin_app: "aha_search",
        source_key: asText(input?.sourceKey, ""),
        object_type: asText(input?.objectType || input?.type, "item"),
        ...(input?.meta && typeof input.meta === "object" && !Array.isArray(input.meta) ? input.meta : {})
      }
    };
  }

  function loadByKey(key, fallback) {
    if (isSecretKey(key)) return fallback;
    return safeParse(localStorage.getItem(key) || JSON.stringify(fallback), fallback);
  }

  function safeField(value, fallback) {
    return redactSearchText(asText(value, fallback || ""));
  }

  function fieldText(record, fields) {
    return fields.filter((field) => !isSecretKey(field)).map((field) => safeField(record?.[field], "")).filter(Boolean).join(" ");
  }

  function pushGeneric(out, sourceKey, sourceId, records, options) {
    asArray(records).filter((record) => record && typeof record === "object" && !isDeletedRecord(record)).forEach((record, index) => {
      const refId = asText(record.id || record.key || record.uuid, `${sourceId}_${index}`);
      out.push(createSearchItem({
        id: `${sourceId}_${refId}`,
        title: safeField(record.title || record.name || record.label || record.query || record.input, options.title || "AHA-objekt"),
        type: options.type,
        source: sourceId,
        sourceKey,
        objectType: options.type,
        refId,
        text: fieldText(record, options.fields || []),
        tags: record.tags || record.keywords || record.concepts,
        createdAt: record.createdAt || record.created_at || "",
        updatedAt: record.updatedAt || record.updated_at || record.lastUpdated || "",
        href: options.href || "index.html",
        safety: options.safety || {},
        meta: { index, sourceId }
      }));
    });
  }

  function collectSearchItems() {
    const out = [];

    const chamber = loadByKey(STORAGE_KEYS.insights, { insights: [] });
    asArray(chamber?.insights).forEach((insight, index) => {
      const base = withBase(insight, { type: "insight", source: "aha_insights" });
      const refId = asText(insight?.id || base?.id, `insight_idx_${index}`);
      out.push(createSearchItem({
        id: `insight_${refId}`,
        title: asText(insight?.title || insight?.heading || insight?.label || insight?.summary, "Innsikt"),
        type: "insight",
        source: "aha_insights",
        refId,
        text: asText(insight?.summary || insight?.text || insight?.content || insight?.claim, ""),
        tags: insight?.tags || base?.tags || insight?.terms || insight?.keywords,
        createdAt: base?.createdAt,
        updatedAt: base?.updatedAt,
        href: "insights.html",
        meta: { index }
      }));
    });

    asArray(loadByKey(STORAGE_KEYS.sourceEvents, [])).forEach((event, index) => {
      const base = withBase(event, { type: asText(event?.source_type, "source_event"), source: "aha_source_events" });
      const refId = asText(event?.id || event?.event_id || event?.source_event_id || base?.id, `source_event_idx_${index}`);
      out.push(createSearchItem({
        id: `source_event_${refId}`,
        title: asText(event?.source_type || event?.source_app, "Source event"),
        type: asText(event?.source_type, "source_event"),
        source: "aha_source_events",
        refId,
        text: asText(event?.text || event?.title || event?.content, ""),
        tags: event?.tags || base?.tags,
        createdAt: base?.createdAt,
        updatedAt: base?.updatedAt,
        href: "insights.html",
        meta: { sourceApp: asText(event?.source_app, "") }
      }));
    });

    asArray(loadByKey(STORAGE_KEYS.notes, [])).filter((note) => !note?.deleted_at).forEach((note) => {
      const base = withBase(note, { type: "note", source: "aha_notes" });
      const refId = asText(note?.id || base?.id, "");
      const lastReanalyzedAt = note?.last_reanalyzed_at || "";
      const reanalysisLabel = lastReanalyzedAt ? " reanalyze reanalysis analysert på nytt" : "";
      if (!refId) return;
      out.push(createSearchItem({
        id: `note_${refId}`,
        title: asText(note?.title, "Notat"),
        type: "note",
        source: "aha_notes",
        refId,
        text: `${asText(note?.text || note?.body || note?.content, "")}${reanalysisLabel}`.trim(),
        tags: note?.tags || base?.tags,
        createdAt: base?.createdAt,
        updatedAt: note?.updatedAt || note?.updated_at || note?.lastUpdated || note?.last_updated || "",
        last_reanalyzed_at: lastReanalyzedAt,
        href: "notes.html",
        meta: {
          lastReanalyzedAt
        }
      }));
    });

    asArray(loadByKey(STORAGE_KEYS.gallery, [])).filter((item) => !item?.deleted_at).forEach((item) => {
      const base = withBase(item, { type: "gallery_item", source: "aha_gallery" });
      const refId = asText(item?.id || base?.id, "");
      if (!refId) return;
      out.push(createSearchItem({
        id: `gallery_${refId}`,
        title: asText(item?.title, "Galleriobjekt"),
        type: "gallery_item",
        source: "aha_gallery",
        refId,
        text: asText(item?.description || item?.caption, ""),
        tags: item?.tags || base?.tags,
        createdAt: base?.createdAt,
        updatedAt: base?.updatedAt,
        href: "gallery.html",
        meta: {}
      }));
    });

    asArray(loadByKey(STORAGE_KEYS.feed, [])).filter((post) => !post?.deleted_at).forEach((post) => {
      const base = withBase(post, { type: "feed_post", source: "aha_feed" });
      const refId = asText(post?.id || base?.id, "");
      if (!refId) return;
      const text = asText(post?.text, "");
      out.push(createSearchItem({
        id: `feed_${refId}`,
        title: text ? truncate(text, 60) : "Feed-post",
        type: "feed_post",
        source: "aha_feed",
        refId,
        text,
        tags: post?.tags || base?.tags,
        createdAt: base?.createdAt,
        updatedAt: base?.updatedAt,
        href: "feed.html",
        meta: {}
      }));
    });

    asArray(loadByKey(STORAGE_KEYS.insta, [])).filter((post) => !(post?.deleted_at || post?.deletedAt || post?.archived === true || post?.import_preview_only === true)).forEach((post) => {
      const base = withBase(post, { type: "insta_post", source: "aha_insta" });
      const refId = asText(post?.id || base?.id, "");
      if (!refId) return;
      out.push(createSearchItem({
        id: `insta_${refId}`,
        title: asText(post?.title || post?.caption, "Insta-post"),
        type: "insta_post",
        source: "aha_insta",
        refId,
        text: asText(post?.caption || post?.description, ""),
        tags: post?.tags || base?.tags,
        createdAt: base?.createdAt,
        updatedAt: base?.updatedAt,
        href: "insta.html",
        meta: {}
      }));
    });

    asArray(loadByKey(STORAGE_KEYS.lists, [])).filter((list) => !list?.deletedAt).forEach((list) => {
      const base = withBase(list, { type: "list", source: "aha_lists" });
      const refId = asText(list?.id || base?.id, "");
      if (!refId) return;
      const itemTitles = asArray(list?.items).map((item) => asText(item?.title, "")).filter(Boolean).join(" ");
      out.push(createSearchItem({
        id: `list_${refId}`,
        title: asText(list?.title, "Liste"),
        type: "list",
        source: "aha_lists",
        refId,
        text: `${asText(list?.description, "")} ${itemTitles}`.trim(),
        tags: list?.tags || base?.tags,
        createdAt: base?.createdAt,
        updatedAt: base?.updatedAt,
        href: "lists.html",
        meta: { itemCount: asArray(list?.items).length }
      }));
    });

    asArray(loadByKey(STORAGE_KEYS.paths, [])).filter((path) => !isDeletedRecord(path)).forEach((path) => {
      const base = withBase(path, { type: "path", source: "aha_paths" });
      const refId = asText(path?.id || base?.id, "");
      if (!refId) return;
      const stepTitles = asArray(path?.steps).map((step) => asText(step?.title, "")).filter(Boolean).join(" ");
      out.push(createSearchItem({
        id: `path_${refId}`,
        title: asText(path?.title, "Sti"),
        type: "path",
        source: "aha_paths",
        refId,
        text: `${asText(path?.description, "")} ${stepTitles}`.trim(),
        tags: path?.tags || base?.tags,
        createdAt: base?.createdAt,
        updatedAt: base?.updatedAt,
        href: "paths.html",
        meta: { stepCount: asArray(path?.steps).length }
      }));
    });

    asArray(loadByKey(STORAGE_KEYS.articles, [])).filter((article) => !isDeletedRecord(article)).forEach((article) => {
      const base = withBase(article, { type: "article", source: "aha_avisa" });
      const refId = asText(article?.id || base?.id, "");
      if (!refId) return;
      const refs = asArray(article?.references).map((ref) => asText(ref?.title, "")).filter(Boolean).join(" ");
      const publicationLayer = asText(article?.publicationLayer, "").toLowerCase()
        || (asText(article?.meta?.createdFromGroupId, "") || asArray(article?.references).some((ref) => asText(ref?.source, "") === "aha_groups") ? "group" : "personal");
      out.push(createSearchItem({
        id: `article_${refId}`,
        title: asText(article?.title, "Artikkelutkast"),
        type: "article",
        source: "aha_avisa",
        refId,
        text: `${asText(article?.summary, "")} ${asText(article?.body, "")} ${refs} ${publicationLayer}`.trim(),
        tags: article?.tags || base?.tags,
        createdAt: base?.createdAt,
        updatedAt: base?.updatedAt,
        href: "avisa.html",
        meta: { referenceCount: asArray(article?.references).length, publicationLayer }
      }));
    });

    asArray(loadByKey(STORAGE_KEYS.groups, [])).filter((group) => !group?.deletedAt && !group?.deleted_at).forEach((group, index) => {
      const base = withBase(group, { type: "group", source: "aha_groups" });
      const refId = asText(group?.id || base?.id, "");
      if (!refId) return;
      const memberNames = asArray(group?.members).map((member) => asText(member?.name || member?.title, "")).filter(Boolean).join(" ");
      const referenceTitles = asArray(group?.references).map((ref) => asText(ref?.title, "")).filter(Boolean).join(" ");
      const tags = normalizeTags(group?.tags || base?.tags);
      out.push(createSearchItem({
        id: `group_${refId}`,
        title: asText(group?.title, "Gruppe"),
        type: "group",
        source: "aha_groups",
        refId,
        text: `${asText(group?.description, "")} ${memberNames} ${referenceTitles} ${tags.join(" ")}`.trim(),
        tags,
        createdAt: base?.createdAt,
        updatedAt: base?.updatedAt,
        href: "groups.html",
        meta: { index }
      }));
    });


    const musicSafety = { metadata_only: true, audio_stored: false, audio_playback_enabled: false, spotify_token_included: false };
    const music = loadByKey(STORAGE_KEYS.musicLibrary, {});
    pushGeneric(out, STORAGE_KEYS.musicLibrary, "aha_music_library", asArray(music?.tracks), { type: "music_track", title: "Music track", fields: ["title", "name", "artist", "album", "description"], href: "music.html", safety: musicSafety });
    pushGeneric(out, STORAGE_KEYS.musicLibrary, "aha_music_library", asArray(music?.artists), { type: "music_artist", title: "Music artist", fields: ["name", "title", "description", "genres"], href: "music.html", safety: musicSafety });
    pushGeneric(out, STORAGE_KEYS.musicLibrary, "aha_music_library", asArray(music?.albums), { type: "music_album", title: "Music album", fields: ["name", "title", "artist", "description"], href: "music.html", safety: musicSafety });
    pushGeneric(out, STORAGE_KEYS.musicLibrary, "aha_music_library", asArray(music?.playlists), { type: "music_playlist", title: "Music playlist", fields: ["name", "title", "description"], href: "music.html", safety: musicSafety });

    const bridge = loadByKey(STORAGE_KEYS.musicBridge, loadByKey(STORAGE_KEYS.musicBridgeAlt, {}));
    pushGeneric(out, STORAGE_KEYS.musicBridge, "aha_music_historygo_bridge", asArray(bridge?.relations || bridge?.matches || bridge?.items || bridge?.reports), { type: "music_historygo_bridge_metadata", title: "Music History Go bridge", fields: ["title", "summary", "description", "relation", "sourceTitle", "trackTitle", "artistName"], href: "music.html", safety: musicSafety });

    const trainingSafety = { training_data_candidate_only: true, model_training_enabled: false, fine_tuning_enabled: false, remote_upload_enabled: false };
    pushGeneric(out, STORAGE_KEYS.trainingCorpus, "aha_training_corpus", loadByKey(STORAGE_KEYS.trainingCorpus, []), { type: "training_corpus_item", title: "Training corpus item", fields: ["title", "summary", "text", "sourceTitle"], href: "training.html", safety: trainingSafety });
    pushGeneric(out, STORAGE_KEYS.trainingExamples, "aha_training_examples", loadByKey(STORAGE_KEYS.trainingExamples, []), { type: "training_example", title: "Training example", fields: ["taskType", "input", "output", "summary"], href: "training.html", safety: trainingSafety });

    pushGeneric(out, STORAGE_KEYS.dataIntake, "aha_data_intake", loadByKey(STORAGE_KEYS.dataIntake, []), { type: "data_intake_candidate", title: "Data intake candidate", fields: ["title", "summary", "text", "sourceType"], href: "intake.html" });
    pushGeneric(out, STORAGE_KEYS.knowledgeCuration, "aha_knowledge_curation", loadByKey(STORAGE_KEYS.knowledgeCuration, []), { type: "knowledge_curation_item", title: "Curation item", fields: ["title", "summary", "text", "reviewNote"], href: "curation.html" });

    const graphSafety = { derived_graph_only: true, canonical_truth: false };
    const map = loadByKey(STORAGE_KEYS.knowledgeMap, {});
    pushGeneric(out, STORAGE_KEYS.knowledgeMap, "aha_knowledge_map", asArray(map?.nodes), { type: "knowledge_map_node", title: "Knowledge map node", fields: ["title", "label", "summary", "description"], href: "knowledge-map.html", safety: graphSafety });
    pushGeneric(out, STORAGE_KEYS.knowledgeMap, "aha_knowledge_map", asArray(map?.edges), { type: "knowledge_map_edge", title: "Knowledge map edge", fields: ["title", "label", "summary", "relation", "from", "to"], href: "knowledge-map.html", safety: graphSafety });
    const gi = loadByKey(STORAGE_KEYS.graphIntelligence, {});
    pushGeneric(out, STORAGE_KEYS.graphIntelligence, "aha_knowledge_graph_intelligence", asArray(gi?.suggestions || gi?.items), { type: "graph_intelligence_suggestion", title: "Graph suggestion", fields: ["title", "summary", "reason", "suggestion"], href: "knowledge-map.html#graph-intelligence", safety: graphSafety });

    const evalSafety = { evaluation_only: true, control_surface_only: true, model_training_enabled: false, calls_model_api: false };
    pushGeneric(out, STORAGE_KEYS.personalAnswerEvaluations, "aha_personal_answer_evaluations", loadByKey(STORAGE_KEYS.personalAnswerEvaluations, []), { type: "personal_answer_evaluation", title: "Personal answer evaluation", fields: ["query", "summary", "score", "rating"], href: "personal-ai.html", safety: evalSafety });
    const audit = loadByKey(STORAGE_KEYS.personalAiLoopAudit, {});
    pushGeneric(out, STORAGE_KEYS.personalAiLoopAudit, "aha_personal_ai_loop_audit_summary", asArray(audit?.summaries || audit?.runs || audit?.items), { type: "personal_ai_loop_audit_summary", title: "Personal AI loop audit summary", fields: ["query", "summary", "status", "score"], href: "personal-ai.html", safety: evalSafety });

    return out;
  }

  function searchItems(query, filters) {
    const q = asText(query, "").toLowerCase();
    const sourceFilter = asText(filters?.source, "");
    const typeFilter = asText(filters?.type, "");

    const filtered = allItems.filter((item) => {
      if (sourceFilter && item.source !== sourceFilter) return false;
      if (typeFilter && item.type !== typeFilter) return false;

      if (!q) return true;

      const haystack = [
        item.title,
        item.text,
        asText(item.meta?.publicationLayer, ""),
        asArray(item.tags).join(" "),
        item.source,
        item.type
      ].join(" ").toLowerCase();

      return haystack.includes(q);
    });

    return filtered.sort((a, b) => itemTimestamp(b) - itemTimestamp(a));
  }

  function updateFilterOptions() {
    const sourceSelect = document.getElementById("search-source-filter");
    const typeSelect = document.getElementById("search-type-filter");
    if (!sourceSelect || !typeSelect) return;

    const selectedSource = sourceSelect.value;
    const selectedType = typeSelect.value;

    const sources = Array.from(new Set(allItems.map((item) => item.source))).sort();
    const types = Array.from(new Set(allItems.map((item) => item.type))).sort();

    sourceSelect.innerHTML = `<option value="">Alle kilder</option>${sources.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}`;
    typeSelect.innerHTML = `<option value="">Alle typer</option>${types.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}`;

    sourceSelect.value = sources.includes(selectedSource) ? selectedSource : "";
    typeSelect.value = types.includes(selectedType) ? selectedType : "";
  }

  function render() {
    const queryInput = document.getElementById("search-query");
    const sourceFilter = document.getElementById("search-source-filter");
    const typeFilter = document.getElementById("search-type-filter");
    const statsEl = document.getElementById("search-stats");
    const resultsEl = document.getElementById("search-results");
    if (!resultsEl) return;

    const query = queryInput?.value || "";
    const filters = {
      source: sourceFilter?.value || "",
      type: typeFilter?.value || ""
    };

    const results = searchItems(query, filters);
    const sourceCount = new Set(allItems.map((item) => item.source)).size;
    const typeCount = new Set(allItems.map((item) => item.type)).size;

    if (statsEl) {
      statsEl.innerHTML = `
        <span class="aha-search-badge">Indekserte objekter: ${allItems.length}</span>
        <span class="aha-search-badge">Treff: ${results.length}</span>
        <span class="aha-search-badge">Kilder: ${sourceCount}</span>
        <span class="aha-search-badge">Typer: ${typeCount}</span>
      `;
    }

    if (!results.length) {
      resultsEl.innerHTML = '<article class="aha-search-card"><p>Ingen treff ennå. Prøv et annet søk eller nullstill filter.</p></article>';
      return;
    }

    resultsEl.innerHTML = results.map((item) => {
      const tags = asArray(item.tags).map((tag) => `<span class="aha-search-badge">${escapeHtml(tag)}</span>`).join("");
      const snippet = truncate(item.text, 180);
      const reanalysisMeta = item.meta?.lastReanalyzedAt
        ? `<div class="aha-search-meta">Analysert på nytt: ${escapeHtml(item.meta.lastReanalyzedAt)}</div>`
        : "";
      return `
        <article class="aha-search-card">
          <header class="aha-search-card-head">
            <h3>${escapeHtml(item.title)}</h3>
            <div class="aha-search-meta">${escapeHtml(item.type)} · ${escapeHtml(item.source)}</div>
          </header>
          <p>${escapeHtml(snippet || "Ingen tekst tilgjengelig.")}</p>
          ${tags ? `<div class="aha-search-tags">${tags}</div>` : ""}
          <div class="aha-search-meta">Opprettet: ${escapeHtml(asText(item.createdAt, "ukjent"))}</div>
          <div class="aha-search-meta">Oppdatert: ${escapeHtml(asText(item.updatedAt, "ukjent"))}</div>
          ${reanalysisMeta}
          <div class="aha-search-actions">
            <a class="aha-search-link" href="${escapeHtml(item.href)}">Åpne modul</a>
          </div>
        </article>
      `;
    }).join("");
  }

  function refresh() {
    allItems = collectSearchItems();
    allItems.sort((a, b) => itemTimestamp(b) - itemTimestamp(a));
    updateFilterOptions();
    render();
  }

  function bindEvents() {
    const queryInput = document.getElementById("search-query");
    const sourceFilter = document.getElementById("search-source-filter");
    const typeFilter = document.getElementById("search-type-filter");
    const refreshButton = document.getElementById("search-refresh");

    queryInput?.addEventListener("input", render);
    sourceFilter?.addEventListener("change", render);
    typeFilter?.addEventListener("change", render);
    refreshButton?.addEventListener("click", refresh);
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindEvents();
    refresh();
  });

  global.AHASearch = {
    collectSearchItems,
    searchItems,
    render,
    refresh
  };
})(window);
