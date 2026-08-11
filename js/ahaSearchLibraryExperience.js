// AHA Search / Library Experience – browse + related-item layer over canonical AHASearch.
// No library database or parallel index. Related ranking is derived in-memory from the same search items.
(function (global) {
  "use strict";

  const doc = global.document;
  const PENDING_CHAT_KEY = "aha_pending_chat_prompt_v1";
  let activeGroup = "all";
  let currentModel = null;
  let relatedToId = "";

  const GROUPS = [
    { id: "thoughts", label: "Tanker og innsikter", description: "Notater, innsikter, feed og spor fra egne analyser." },
    { id: "collections", label: "Lister og stier", description: "Samlinger, lister, grupper og læringsstier du har bygget." },
    { id: "media", label: "Media og publisert", description: "Galleri, Insta, artikler og lokal musikkmetadata." },
    { id: "knowledge", label: "Kunnskapsarbeid", description: "Intake, kuratering, kunnskapskart, grafinnsikter og godkjent Training-materiale." },
    { id: "personal_ai", label: "Personal AI", description: "Lokale svar-evalueringer og auditspor fra Personal AI." }
  ];

  const STOPWORDS = new Set(["dette", "denne", "disse", "eller", "ikke", "og", "som", "for", "med", "til", "fra", "det", "der", "har", "jeg", "deg", "aha"]);

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
  function normalize(value) {
    return text(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  }
  function wordSet(value) {
    return new Set(normalize(value).split(/[^a-z0-9æøå]+/).filter((word) => word.length > 2 && !STOPWORDS.has(word)));
  }
  function normalizedTags(item) {
    return new Set(arr(item?.tags).map(normalize).filter(Boolean));
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
      aha_avisa: "AHAavisa",
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

  function humanizeSearchMetaText(value) {
    const raw = text(value);
    const parts = raw.split(" · ");
    if (parts.length < 2) return raw;
    const type = text(parts.shift());
    const source = text(parts.join(" · "));
    if (!type || !source) return raw;
    return `${typeLabel({ type, source })} · ${sourceLabel({ type, source })}`;
  }

  function enhanceSearchResultLabels() {
    const nodes = doc?.querySelectorAll?.("#search-results .aha-search-card-head .aha-search-meta");
    if (!nodes) return 0;
    let changed = 0;
    Array.from(nodes).forEach((node) => {
      const before = text(node?.textContent);
      const after = humanizeSearchMetaText(before);
      if (!before || before === after) return;
      node.textContent = after;
      changed += 1;
    });
    return changed;
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

  function relatedScore(seed, candidate) {
    if (!seed || !candidate || seed.id === candidate.id) return 0;
    const seedTags = normalizedTags(seed);
    const candidateTags = normalizedTags(candidate);
    let sharedTags = 0;
    seedTags.forEach((tag) => { if (candidateTags.has(tag)) sharedTags += 1; });

    const seedWords = wordSet(`${seed.title || ""} ${seed.text || ""}`);
    const candidateWords = wordSet(`${candidate.title || ""} ${candidate.text || ""}`);
    let sharedWords = 0;
    seedWords.forEach((word) => { if (candidateWords.has(word)) sharedWords += 1; });
    const union = seedWords.size + candidateWords.size - sharedWords;
    const textOverlap = union ? sharedWords / union : 0;
    const sameGroup = libraryGroupFor(seed) === libraryGroupFor(candidate) ? 0.08 : 0;
    const crossType = seed.type !== candidate.type ? 0.05 : 0;
    return (sharedTags * 0.55) + (textOverlap * 0.95) + sameGroup + crossType;
  }

  function findRelatedItems(seed, itemsArg, limit = 6) {
    return arr(itemsArg)
      .filter((item) => item && item.id !== seed?.id)
      .map((item) => ({ item, score: relatedScore(seed, item) }))
      .filter((entry) => entry.score >= 0.12)
      .sort((a, b) => b.score - a.score || timestamp(b.item) - timestamp(a.item))
      .slice(0, Math.max(1, Number(limit) || 6));
  }

  function chatPromptForItem(item) {
    const title = text(item?.title) || "dette materialet";
    const snippet = truncate(item?.text, 320);
    return `Hjelp meg å tenke videre på dette fra AHA-biblioteket: «${title}».${snippet ? `\n\nKontekst: ${snippet}` : ""}`;
  }

  function queueItemForChat(item) {
    if (!item) return { ok: false, error: "missing_item" };
    const prompt = chatPromptForItem(item);
    const payload = {
      type: "library_item_prompt",
      source: "aha_search_library",
      createdAt: new Date().toISOString(),
      prompt
    };
    try {
      global.localStorage?.setItem?.(PENDING_CHAT_KEY, JSON.stringify(payload));
    } catch {
      return { ok: false, error: "storage_unavailable" };
    }
    return { ok: true, payload };
  }

  function itemCard(item, options = {}) {
    const snippet = truncate(item?.text || "Ingen tekst tilgjengelig.", 180);
    const date = text(item?.last_reanalyzed_at || item?.updatedAt || item?.createdAt);
    const score = Number(options.relatedScore || 0);
    return `<article class="aha-search-card" data-library-item-id="${esc(item?.id || "")}">
      <header class="aha-search-card-head">
        <h3>${esc(item?.title || "Uten tittel")}</h3>
        <div class="aha-search-meta">${esc(typeLabel(item))} · ${esc(sourceLabel(item))}</div>
      </header>
      <p>${esc(snippet)}</p>
      ${date ? `<div class="aha-search-meta">Sist oppdatert: ${esc(date)}</div>` : ""}
      ${score ? `<div class="aha-search-meta">Relatert score: ${score.toFixed(2)}</div>` : ""}
      <div class="aha-search-actions">
        <a class="aha-search-link" href="${esc(item?.href || "index.html")}">Åpne</a>
        <button type="button" class="aha-search-link" data-library-related="${esc(item?.id || "")}">Finn relatert</button>
        <button type="button" class="aha-search-link" data-library-ask="${esc(item?.id || "")}">Spør AHA</button>
      </div>
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
      ? selected.map((item) => itemCard(item)).join("")
      : '<article class="aha-search-card"><p>Ingen objekter i denne delen av biblioteket ennå.</p></article>';
  }

  function renderRelated(seedId = relatedToId) {
    const panel = doc?.getElementById?.("search-library-related-panel");
    const host = doc?.getElementById?.("search-library-related");
    const title = doc?.getElementById?.("search-library-related-title");
    if (!panel || !host || !currentModel) return [];
    const seed = currentModel.items.find((item) => item.id === seedId);
    if (!seed) {
      panel.hidden = true;
      host.innerHTML = "";
      return [];
    }
    relatedToId = seed.id;
    const related = findRelatedItems(seed, currentModel.items, 6);
    panel.hidden = false;
    if (title) title.textContent = `Relatert til «${truncate(seed.title, 70)}»`;
    host.innerHTML = related.length
      ? related.map((entry) => itemCard(entry.item, { relatedScore: entry.score })).join("")
      : '<article class="aha-search-card"><p>Ingen tydelig relaterte objekter ble funnet i det lokale biblioteket.</p></article>';
    return related;
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

  function handleSearchUiChange() {
    updateSearchResultsVisibility();
    enhanceSearchResultLabels();
  }

  function render() {
    const items = global.AHASearch?.collectSearchItems?.() || [];
    const model = buildLibraryModel(items);
    currentModel = model;
    renderGroups(model);
    renderRecent(model);
    if (relatedToId) renderRelated(relatedToId);
    updateSearchResultsVisibility();
    enhanceSearchResultLabels();
    const status = doc?.getElementById?.("search-library-status");
    if (status) status.textContent = `${model.total} lokale objekter er tilgjengelige. «Finn relatert» rangerer bare eksisterende lokale søkeobjekter; det er ikke en ny database eller modell.`;
    return model;
  }

  function findItem(id) {
    return currentModel?.items?.find?.((item) => item.id === id) || null;
  }

  function bind() {
    doc?.addEventListener?.("click", (event) => {
      const target = event.target;
      if (!(target instanceof global.HTMLElement)) return;
      const group = target.getAttribute("data-library-group");
      if (group) {
        activeGroup = group;
        render();
        return;
      }
      const relatedId = target.getAttribute("data-library-related");
      if (relatedId) {
        renderRelated(relatedId);
        doc?.getElementById?.("search-library-related-panel")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
        return;
      }
      const askId = target.getAttribute("data-library-ask");
      if (askId) {
        const result = queueItemForChat(findItem(askId));
        const status = doc?.getElementById?.("search-library-status");
        if (!result.ok) {
          if (status) status.textContent = "Kunne ikke klargjøre materialet for Chat lokalt.";
          return;
        }
        global.location.href = "chat.html";
      }
    });
    doc?.getElementById?.("search-refresh")?.addEventListener?.("click", () => render());
    doc?.getElementById?.("search-query")?.addEventListener?.("input", handleSearchUiChange);
    doc?.getElementById?.("search-source-filter")?.addEventListener?.("change", handleSearchUiChange);
    doc?.getElementById?.("search-type-filter")?.addEventListener?.("change", handleSearchUiChange);
  }

  function init() { bind(); render(); }

  const api = {
    GROUPS,
    PENDING_CHAT_KEY,
    libraryGroupFor,
    sourceLabel,
    typeLabel,
    humanizeSearchMetaText,
    enhanceSearchResultLabels,
    buildLibraryModel,
    relatedScore,
    findRelatedItems,
    chatPromptForItem,
    queueItemForChat,
    hasActiveSearch,
    updateSearchResultsVisibility,
    renderRelated,
    render
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AHASearchLibraryExperience = api;
  if (doc) doc.readyState === "loading" ? doc.addEventListener("DOMContentLoaded", init) : init();
})(typeof window !== "undefined" ? window : globalThis);