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
    groups: "aha_groups_v1"
  };

  let allItems = [];

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
      text: asText(input?.text, ""),
      tags: normalizeTags(input?.tags),
      createdAt: input?.createdAt || "",
      updatedAt: input?.updatedAt || "",
      last_reanalyzed_at: input?.last_reanalyzed_at || "",
      href: asText(input?.href, "index.html"),
      meta: input?.meta && typeof input.meta === "object" && !Array.isArray(input.meta) ? input.meta : {}
    };
  }

  function loadByKey(key, fallback) {
    return safeParse(localStorage.getItem(key) || JSON.stringify(fallback), fallback);
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

    asArray(loadByKey(STORAGE_KEYS.insta, [])).filter((post) => !post?.deleted_at).forEach((post) => {
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

    asArray(loadByKey(STORAGE_KEYS.paths, [])).filter((path) => !path?.deletedAt).forEach((path) => {
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

    asArray(loadByKey(STORAGE_KEYS.articles, [])).filter((article) => !article?.deletedAt).forEach((article) => {
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
