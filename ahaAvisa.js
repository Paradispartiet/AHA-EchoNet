// ahaAvisa.js
// Fase 3E: første fungerende AHAavisa-modul (localStorage-first).

(function (global) {
  "use strict";

  const ARTICLES_KEY = "aha_articles_v1";
  const INSIGHTS_KEY = "aha_insight_chamber_v1";
  const LISTS_KEY = "aha_lists_v1";
  const PATHS_KEY = "aha_paths_v1";
  const NOTES_KEY = "aha_notes_v1";

  const ALLOWED_SECTIONS = ["nyheter", "kultur", "politikk", "sport", "teknologi", "filosofi", "historygo", "aha", "debatt", "notater"];
  const ALLOWED_STATUS = ["draft", "ready", "published"];
  const ACTIVE_STATUS = ["draft", "ready"];

  function safeParse(raw, fallback) {
    try {
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asText(value, fallback) { const text = String(value ?? "").trim(); return text || fallback; }
  function uid(prefix) { return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`; }
  function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeSection(section) {
    const normalized = asText(section, "notater").toLowerCase();
    return ALLOWED_SECTIONS.includes(normalized) ? normalized : "notater";
  }

  function normalizeStatus(status) {
    const normalized = asText(status, "draft").toLowerCase();
    return ALLOWED_STATUS.includes(normalized) ? normalized : "draft";
  }

  function normalizeReference(input) {
    const src = safeObject(input);
    const refId = asText(src.refId || src.ref_id, "");
    const source = asText(src.source, "");
    const now = new Date().toISOString();

    return {
      id: asText(src.id, uid("article_ref")),
      title: asText(src.title, "Referanse"),
      type: asText(src.type, "reference"),
      source,
      refId,
      addedAt: src.addedAt || src.added_at || now,
      meta: safeObject(src.meta)
    };
  }

  function normalizeArticle(input) {
    const src = safeObject(input);
    const now = new Date().toISOString();
    const tags = global.AHAContracts?.normalizeTags
      ? global.AHAContracts.normalizeTags(src.tags)
      : asArray(src.tags).map((tag) => asText(tag, "")).filter(Boolean);

    return {
      id: asText(src.id, uid("article")),
      title: asText(src.title, "Uten tittel"),
      section: normalizeSection(src.section),
      status: normalizeStatus(src.status),
      summary: asText(src.summary, ""),
      body: asText(src.body, ""),
      createdAt: src.createdAt || src.created_at || now,
      updatedAt: src.updatedAt || src.updated_at || src.createdAt || src.created_at || now,
      tags,
      references: asArray(src.references).map((ref) => normalizeReference(ref)).filter((ref) => ref.source && ref.refId),
      source: asText(src.source, "aha_avisa"),
      meta: safeObject(src.meta),
      deletedAt: src.deletedAt || src.deleted_at || ""
    };
  }

  function loadArticles() {
    return asArray(safeParse(localStorage.getItem(ARTICLES_KEY) || "[]", [])).map((a) => normalizeArticle(a));
  }

  function saveArticles(articles) {
    localStorage.setItem(ARTICLES_KEY, JSON.stringify(asArray(articles)));
    return asArray(articles);
  }

  function createArticle(input) {
    const title = asText(input?.title, "");
    if (!title) return null;

    const now = new Date().toISOString();
    const articles = loadArticles();
    const article = normalizeArticle({
      id: uid("article"),
      title,
      section: input?.section,
      status: "draft",
      summary: asText(input?.summary, ""),
      body: "",
      createdAt: now,
      updatedAt: now,
      tags: input?.tags,
      references: [],
      source: "aha_avisa",
      meta: { createdBy: "avisa_ui" },
      deletedAt: ""
    });

    articles.unshift(article);
    saveArticles(articles);
    return article;
  }

  function updateArticle(id, changes) {
    const articles = loadArticles();
    const index = articles.findIndex((article) => article.id === id);
    if (index < 0) return null;

    const current = articles[index];
    const next = normalizeArticle({
      ...current,
      ...safeObject(changes),
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
      references: current.references,
      source: current.source || "aha_avisa"
    });

    if (!ACTIVE_STATUS.includes(next.status) && next.status !== "published") next.status = "draft";
    articles[index] = next;
    saveArticles(articles);
    return next;
  }

  function deleteArticle(id) {
    return updateArticle(id, { deletedAt: new Date().toISOString() });
  }

  function addReferenceToArticle(articleId, referenceInput) {
    const articles = loadArticles();
    const index = articles.findIndex((article) => article.id === articleId && !article.deletedAt);
    if (index < 0) return null;

    const article = articles[index];
    const ref = normalizeReference({ ...safeObject(referenceInput), id: uid("article_ref") });
    if (!ref.source || !ref.refId) return null;

    const duplicate = article.references.some((item) => item.source === ref.source && item.refId === ref.refId);
    if (duplicate) return article;

    article.references.push(ref);
    article.updatedAt = new Date().toISOString();
    articles[index] = normalizeArticle(article);
    saveArticles(articles);
    return ref;
  }

  function removeReferenceFromArticle(articleId, referenceId) {
    const articles = loadArticles();
    const index = articles.findIndex((article) => article.id === articleId && !article.deletedAt);
    if (index < 0) return null;

    const article = articles[index];
    const nextRefs = article.references.filter((ref) => ref.id !== referenceId);
    if (nextRefs.length === article.references.length) return null;

    article.references = nextRefs;
    article.updatedAt = new Date().toISOString();
    articles[index] = normalizeArticle(article);
    saveArticles(articles);
    return article;
  }

  function collectAvailableArticleSources() {
    const out = [];
    const chamber = safeParse(localStorage.getItem(INSIGHTS_KEY) || "{}", { insights: [] });
    asArray(chamber?.insights).forEach((insight, index) => {
      out.push({
        id: `insight_${asText(insight?.id, `insight_idx_${index}`)}`,
        title: asText(insight?.title || insight?.heading || insight?.label || insight?.summary || insight?.text, "Innsikt"),
        type: "insight",
        source: "aha_insights",
        refId: asText(insight?.id, `insight_idx_${index}`),
        meta: { index }
      });
    });

    asArray(safeParse(localStorage.getItem(LISTS_KEY) || "[]", []))
      .filter((list) => !list?.deletedAt)
      .forEach((list) => {
        const refId = asText(list?.id, "");
        if (!refId) return;
        out.push({ id: `list_${refId}`, title: asText(list?.title, "Liste"), type: "list", source: "aha_lists", refId, meta: {} });
      });

    asArray(safeParse(localStorage.getItem(PATHS_KEY) || "[]", []))
      .filter((path) => !path?.deletedAt)
      .forEach((path) => {
        const refId = asText(path?.id, "");
        if (!refId) return;
        out.push({ id: `path_${refId}`, title: asText(path?.title, "Sti"), type: "path", source: "aha_paths", refId, meta: {} });
      });

    asArray(safeParse(localStorage.getItem(NOTES_KEY) || "[]", []))
      .filter((note) => !note?.deleted_at)
      .forEach((note) => {
        const refId = asText(note?.id, "");
        if (!refId) return;
        out.push({ id: `note_${refId}`, title: asText(note?.title, "Notat"), type: "note", source: "aha_notes", refId, meta: {} });
      });

    return out;
  }

  function render() {
    const mount = document.getElementById("avisa-articles");
    const draftCountEl = document.getElementById("avisa-draft-count");
    const readyCountEl = document.getElementById("avisa-ready-count");
    const refsCountEl = document.getElementById("avisa-refs-count");

    const articles = loadArticles().filter((article) => !article.deletedAt);
    const availableRefs = collectAvailableArticleSources();
    const draftCount = articles.filter((a) => a.status === "draft").length;
    const readyCount = articles.filter((a) => a.status === "ready").length;
    const refsCount = articles.reduce((sum, a) => sum + a.references.length, 0);

    if (draftCountEl) draftCountEl.textContent = String(draftCount);
    if (readyCountEl) readyCountEl.textContent = String(readyCount);
    if (refsCountEl) refsCountEl.textContent = String(refsCount);

    if (!mount) return;
    if (!articles.length) {
      mount.innerHTML = '<article class="aha-panel"><p>Ingen artikkelutkast ennå. Opprett et utkast over.</p></article>';
      return;
    }

    const options = availableRefs.map((ref) => (
      `<option value="${escapeHtml(`${ref.source}::${ref.refId}`)}">${escapeHtml(ref.title)} (${escapeHtml(ref.type)})</option>`
    )).join("");

    mount.innerHTML = articles.map((article) => {
      const tags = asArray(article.tags).map((tag) => `<span class="avisa-badge">${escapeHtml(tag)}</span>`).join("");
      const refs = article.references.length
        ? article.references.map((ref) => `
          <li>
            <div>
              <strong>${escapeHtml(ref.title)}</strong>
              <div class="module-meta">${escapeHtml(ref.type)} · ${escapeHtml(ref.source)} · ref: ${escapeHtml(ref.refId)}</div>
            </div>
            <button type="button" data-avisa-remove-ref="${escapeHtml(article.id)}::${escapeHtml(ref.id)}">Fjern</button>
          </li>
        `).join("")
        : "<li>Ingen referanser ennå.</li>";

      return `
        <article class="aha-panel avisa-article" data-avisa-article-id="${escapeHtml(article.id)}">
          <header class="avisa-header-row">
            <h3>${escapeHtml(article.title)}</h3>
            <span class="avisa-badge avisa-status">${escapeHtml(article.status)}</span>
          </header>
          <p class="module-meta">Seksjon: ${escapeHtml(article.section)} · Opprettet: ${escapeHtml(article.createdAt)} · Oppdatert: ${escapeHtml(article.updatedAt)}</p>
          <p>${escapeHtml(article.summary || "Ingen ingress ennå.")}</p>
          <div class="avisa-tags">${tags || "<span class='module-meta'>Ingen tags.</span>"}</div>
          <label>Brødtekst
            <textarea data-avisa-body="${escapeHtml(article.id)}">${escapeHtml(article.body)}</textarea>
          </label>
          <div class="aha-tile-actions">
            <button type="button" data-avisa-save-body="${escapeHtml(article.id)}">Lagre tekst</button>
            <button type="button" data-avisa-set-ready="${escapeHtml(article.id)}">Marker klar</button>
            <button type="button" data-avisa-set-draft="${escapeHtml(article.id)}">Sett tilbake til utkast</button>
            <button type="button" data-avisa-delete="${escapeHtml(article.id)}">Slett utkast</button>
          </div>
          <section>
            <h4>Referanser</h4>
            <ul class="avisa-ref-list">${refs}</ul>
            <div class="avisa-ref-add">
              <select data-avisa-add-select="${escapeHtml(article.id)}">
                <option value="">Velg objekt</option>
                ${options}
              </select>
              <button type="button" data-avisa-add-ref="${escapeHtml(article.id)}">Legg til referanse</button>
            </div>
          </section>
        </article>
      `;
    }).join("");
  }

  function refresh() { render(); }

  function bindEvents() {
    const createBtn = document.getElementById("avisa-create-btn");
    const refreshBtn = document.getElementById("avisa-refresh-btn");

    if (createBtn) {
      createBtn.addEventListener("click", function () {
        const title = document.getElementById("avisa-title")?.value || "";
        const section = document.getElementById("avisa-section")?.value || "notater";
        const summary = document.getElementById("avisa-summary")?.value || "";
        const tags = document.getElementById("avisa-tags")?.value || "";
        createArticle({ title, section, summary, tags });
        render();
      });
    }

    if (refreshBtn) refreshBtn.addEventListener("click", refresh);

    document.addEventListener("click", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const saveBodyId = target.getAttribute("data-avisa-save-body");
      if (saveBodyId) {
        const body = document.querySelector(`[data-avisa-body="${CSS.escape(saveBodyId)}"]`)?.value || "";
        updateArticle(saveBodyId, { body });
        render();
        return;
      }

      const readyId = target.getAttribute("data-avisa-set-ready");
      if (readyId) { updateArticle(readyId, { status: "ready" }); render(); return; }

      const draftId = target.getAttribute("data-avisa-set-draft");
      if (draftId) { updateArticle(draftId, { status: "draft" }); render(); return; }

      const deleteId = target.getAttribute("data-avisa-delete");
      if (deleteId) { deleteArticle(deleteId); render(); return; }

      const removeRef = target.getAttribute("data-avisa-remove-ref");
      if (removeRef) {
        const [articleId, refId] = removeRef.split("::");
        removeReferenceFromArticle(articleId, refId);
        render();
        return;
      }

      const addRefArticle = target.getAttribute("data-avisa-add-ref");
      if (addRefArticle) {
        const select = document.querySelector(`[data-avisa-add-select="${CSS.escape(addRefArticle)}"]`);
        const value = select?.value || "";
        if (!value.includes("::")) return;
        const [source, refId] = value.split("::");
        const available = collectAvailableArticleSources();
        const match = available.find((item) => item.source === source && item.refId === refId);
        if (!match) return;
        addReferenceToArticle(addRefArticle, match);
        render();
      }
    });
  }

  global.AHAAvisa = {
    loadArticles,
    saveArticles,
    createArticle,
    updateArticle,
    deleteArticle,
    addReferenceToArticle,
    removeReferenceFromArticle,
    collectAvailableArticleSources,
    render,
    refresh
  };

  document.addEventListener("DOMContentLoaded", function () {
    bindEvents();
    render();
  });
})(window);
