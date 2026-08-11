// AHA Search / Library Experience – read-only browse layer over the canonical AHASearch index.
// No new index or storage. Everything comes from AHASearch.collectSearchItems().
(function (global) {
  "use strict";

  const doc = global.document;
  let activeGroup = "all";

  const GROUPS = [
    { id: "thoughts", label: "Tanker og innsikter", description: "Notater, innsikter, feed og spor fra egne analyser." },
    { id: "collections", label: "Lister og stier", description: "Samlinger, lister, grupper og læringsstier du har bygget." },
    { id: "media", label: "Media og publisert", description: "Galleri, Insta, artikler og lokal musikkmetadata." },
    { id: "knowledge", label: "Kunnskapsarbeid", description: "Intake, kuratering, kunnskapskart, grafinnsikter og godkjent Training-materiale." },
    { id: "personal_ai", label: "Personal AI", description: "Lokale svar-evalueringer og auditspor fra Personal AI." }
  ];

  function arr(value) { return Array.isArray(value) ? value : []; }
  function text(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function truncate(value, max = 180) {
    const clean = text(value);
    return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
  }
  function timestamp(item) {
    const value = item?.last_reanalyzed_at || item?.updatedAt || item?.createdAt || "";
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function libraryGroupFor(item) {
    const source = text(item?.source).toLowerCase();
    const type = text(item?.type).toLowerCase();
    const hay = `${source} ${type}`;
    if (/aha_(notes|insights|feed|source_events)|\b(note|insight|feed_post|source_event|note_reanalysis)\b/.test(hay)) return "thoughts";
    if (/aha_(lists|paths|groups)|\b(list|path|group)\b/.test(hay)) return "collections";
    if (/aha_(gallery|insta|articles|music)|\b(gallery|insta|article|music|track|artist|album|playlist)\b/.test(hay)) return "media";
    if (/aha_(data_intake|knowledge_|training_)|\b(intake|curation|knowledge_map|graph_intelligence|training_corpus|training_example)\b/.test(hay)) return "knowledge";
    if (/aha_personal_|personal_ai|answer_evaluation/.test(hay)) return "personal_ai";
    return "other";
  }

  function sourceLabel(item) {
    const group = libraryGroupFor(item);
    const source = text(item?.source);
    const type = text(item?.type);
    const exact = {
      aha_notes: "Notater",
      aha_insights: "Innsikter",
      aha_feed: "Feed",
      aha_source_events: "Analysespor",
      aha_lists: "Lister",
      aha_paths: "Stier",
      aha_groups: "Grupper",
      aha_gallery: "Galleri",
      aha_insta: "Insta",
      aha_articles: "AHAavisa",
      aha_music_library: "Musikkbibliotek",
      aha_data_intake: "Data Intake",
      aha_knowledge_curation: "Kuratering",
      aha_knowledge_map: "Kunnskapskart",
      aha_knowledge_graph_intelligence: "Sammenhenger og forslag",
      aha_training_corpus: "Godkjent kunnskapsgrunnlag",
      aha_training_examples: "Godkjente eksempler",
      aha_personal_answer_evaluations: "Svar-evalueringer"
    };
    if (exact[source]) return exact[source];
    if (group === "personal_ai") return "Personal AI";
    if (group === "knowledge") return "Kunnskapsarbeid";
    if (group === "media" && /music/.test(`${source} ${type}`)) return "Musikk";
    return source.replace(/^aha_/, "").replaceAll("_", " ") || "AHA";
  }

  function typeLabel(item) {
    const type = text(item?.type);
    const labels = {
      insight: "Innsikt",
      note: "Notat",
      feed_post: "Feed-post",
      gallery_item: "Galleriobjekt",
      insta_post: "Insta-post",
      list: "Liste",
      path: "Sti",
      group: "Gruppe",
      article: "Artikkel",
      source_event: "Analysespor",
      note_reanalysis: "Reanalyse",
      training_corpus_item: "Kunnskapsgrunnlag",
      training_example: "Eksempel",
      knowledge_curation_item: "Kuratering",
      personal_answer_evaluation: "Svar-evaluering"
    };
    return labels[type] || type.replaceAll("_", " ") || "AHA-objekt";
  }

  function buildLibraryModel(itemsArg) {
    const items = arr(itemsArg)
      .filter((item) => item && item.local_only === true && item.read_only === true)
      .slice()
      .sort((a, b) => timestamp(b) - timestamp(a));
    const groups = GROUPS.map((group) => {
      const matches = items.filter((item) => libraryGroupFor(item) === group.id);
      return { ...group, count: matches.length, items: matches };
    });
    const other = items.filter((item) => libraryGroupFor(item) === "other");
    if (other.length) groups.push({ id: "other", label: "Andre AHA-objekter", description: "Lokale AHA-objekter som ikke passer i hovedgruppene ennå.", count: other.length, items: other });
    return { total: items.length, groups, recent: items.slice(0, 8), items };
  }

  function itemCard(item) {
    const snippet = truncate(item?.text || "Ingen tekst tilgjengelig.", 180);
    const date = text(item?.last_reanalyzed_at || item?.updatedAt || item?.createdAt);
    return `<article class="aha-search-card">
      <header class="aha-search-card-head">
        <h3>${esc(item?.title || "Uten tittel")}</h3>
        <div class="aha-search-meta">${esc(typeLabel(item))} · ${esc(sourceLabel(item))}</div>
      </header>
      <p>${esc(snippet)}</p>
      ${date ? `<div class="aha-search-meta">Sist oppdatert: ${esc(date)}</div>` : ""}
      <div class="aha-search-actions"><a class="aha-search-link" href="${esc(item?.href || "index.html")}">Åpne</a></div>
    </article>`;
  }

  function renderGroups(model) {
    const host = doc?.getElementById?.("search-library-groups");
    if (!host) return;
    const allActive = activeGroup === "all";
    host.innerHTML = `<article class="aha-panel">
      <h3>Hele biblioteket</h3>
      <p>${model.total} lokale, søkbare AHA-objekter.</p>
      <button type="button" class="aha-tile-btn${allActive ? " aha-tile-btn-primary" : ""}" data-library-group="all">Vis alt</button>
    </article>${model.groups.map((group) => `<article class="aha-panel">
      <h3>${esc(group.label)}</h3>
      <p><strong>${group.count}</strong> · ${esc(group.description)}</p>
      <button type="button" class="aha-tile-btn${activeGroup === group.id ? " aha-tile-btn-primary" : ""}" data-library-group="${esc(group.id)}">Vis</button>
    </article>`).join("")}`;
  }

  function renderRecent(model) {
    const host = doc?.getElementById?.("search-library-recent");
    const title = doc?.getElementById?.("search-library-recent-title");
    if (!host) return;
    const selected = activeGroup === "all"
      ? model.recent
      : (model.groups.find((group) => group.id === activeGroup)?.items || []).slice(0, 12);
    if (title) title.textContent = activeGroup === "all"
      ? "Nylig lagret eller oppdatert"
      : model.groups.find((group) => group.id === activeGroup)?.label || "Bibliotek";
    host.innerHTML = selected.length
      ? selected.map(itemCard).join("")
      : '<article class="aha-search-card"><p>Ingen objekter i denne delen av biblioteket ennå.</p></article>';
  }

  function hasActiveSearch() {
    const query = text(doc?.getElementById?.("search-query")?.value);
    const source = text(doc?.getElementById?.("search-source-filter")?.value);
    const type = text(doc?.getElementById?.("search-type-filter")?.value);
    return Boolean(query || source || type);
  }

  function updateSearchResultsVisibility() {
    const panel = doc?.getElementById?.("search-results-panel");
    if (panel) panel.hidden = !hasActiveSearch();
  }

  function render() {
    const items = global.AHASearch?.collectSearchItems?.() || [];
    const model = buildLibraryModel(items);
    renderGroups(model);
    renderRecent(model);
    updateSearchResultsVisibility();
    const status = doc?.getElementById?.("search-library-status");
    if (status) status.textContent = `${model.total} lokale objekter er tilgjengelige i biblioteket. Biblioteket er en read-only visning av den samme indeksen som Søk bruker.`;
    return model;
  }

  function bind() {
    doc?.addEventListener?.("click", (event) => {
      const target = event.target;
      if (!(target instanceof global.HTMLElement)) return;
      const group = target.getAttribute("data-library-group");
      if (!group) return;
      activeGroup = group;
      render();
    });
    doc?.getElementById?.("search-refresh")?.addEventListener?.("click", () => render());
    doc?.getElementById?.("search-query")?.addEventListener?.("input", updateSearchResultsVisibility);
    doc?.getElementById?.("search-source-filter")?.addEventListener?.("change", updateSearchResultsVisibility);
    doc?.getElementById?.("search-type-filter")?.addEventListener?.("change", updateSearchResultsVisibility);
  }

  function init() { bind(); render(); }

  const api = { GROUPS, libraryGroupFor, sourceLabel, typeLabel, buildLibraryModel, hasActiveSearch, updateSearchResultsVisibility, render };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AHASearchLibraryExperience = api;
  if (doc) doc.readyState === "loading" ? doc.addEventListener("DOMContentLoaded", init) : init();
})(typeof window !== "undefined" ? window : globalThis);
