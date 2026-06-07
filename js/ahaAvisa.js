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
  const ALLOWED_STATUS = ["draft", "review", "ready", "published_local"];
  const ALLOWED_PUBLICATION_LAYERS = ["personal", "group", "public_candidate"];
  const SECTION_FILTERS = ["alle", "aha", "grupper", "historygo", "kultur", "annet"];
  const LAYER_FILTERS = ["all", "personal", "group", "public_candidate"];
  let currentSectionFilter = "alle";
  let currentLayerFilter = "all";

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
  function isDeletedRecord(record) { return Boolean(record?.deletedAt || record?.deleted_at); }

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

  function inferPublicationLayer(src) {
    const explicit = asText(src?.publicationLayer || src?.publication_layer, "").toLowerCase();
    if (ALLOWED_PUBLICATION_LAYERS.includes(explicit)) return explicit;

    const groupId = asText(src?.meta?.createdFromGroupId, "");
    const hasGroupRef = asArray(src?.references).some((ref) => asText(ref?.source, "") === "aha_groups");
    if (groupId || hasGroupRef) return "group";
    return "personal";
  }

  function formatDateLabel(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("no-NO");
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
      publicationLayer: inferPublicationLayer(src),
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

  async function persistArticle(article) {
    if (!global.AHARepository?.saveArticle) return null;
    try {
      return await global.AHARepository.saveArticle(article);
    } catch (error) {
      return { ok: false, error };
    }
  }

  function articleActionTime(article) {
    return [
      article?.deletedAt,
      article?.deleted_at,
      article?.updatedAt,
      article?.updated_at,
      article?.createdAt,
      article?.created_at
    ].reduce((latest, value) => {
      const time = Date.parse(value || "");
      return Number.isFinite(time) && time > latest ? time : latest;
    }, 0);
  }

  function normalizeRemoteArticle(remote) {
    const src = safeObject(remote);
    return normalizeArticle({
      id: src.id,
      title: src.title,
      section: src.section,
      status: src.status,
      summary: src.summary,
      body: src.body,
      tags: src.tags,
      references: asArray(src.references).map((ref) => normalizeReference(ref)),
      source: src.source,
      publicationLayer: src.publicationLayer || src.publication_layer,
      meta: src.meta,
      createdAt: src.createdAt || src.created_at,
      updatedAt: src.updatedAt || src.updated_at,
      deletedAt: src.deletedAt || src.deleted_at
    });
  }

  function mergeArticles(localArticles, remoteArticles) {
    const merged = new Map();
    asArray(localArticles).map((article) => normalizeArticle(article)).forEach((article) => {
      merged.set(article.id, article);
    });

    asArray(remoteArticles).map((article) => normalizeArticle(article)).forEach((incoming) => {
      const existing = merged.get(incoming.id);
      if (!existing || articleActionTime(incoming) >= articleActionTime(existing)) {
        merged.set(incoming.id, incoming);
      }
    });

    return Array.from(merged.values()).sort((a, b) => articleActionTime(b) - articleActionTime(a));
  }

  async function pushLocalToDatabase(articles) {
    let saveArticle = null;
    try {
      saveArticle = global.AHARepository?.saveArticle;
    } catch {
      return null;
    }
    if (typeof saveArticle !== "function") return null;

    return Promise.allSettled(asArray(articles).map((article) => {
      try {
        return saveArticle.call(global.AHARepository, article);
      } catch (error) {
        return Promise.reject(error);
      }
    }));
  }

  async function syncFromDatabase() {
    const localArticles = loadArticles();
    if (localArticles.length) await pushLocalToDatabase(localArticles);

    let loadArticlesFromRepository = null;
    try {
      loadArticlesFromRepository = global.AHARepository?.loadArticles;
    } catch (error) {
      return { ok: false, fallback: "localStorage", data: localArticles, error };
    }
    if (typeof loadArticlesFromRepository !== "function") {
      return { ok: false, fallback: "localStorage", data: localArticles };
    }

    let result;
    try {
      result = await loadArticlesFromRepository.call(global.AHARepository);
    } catch (error) {
      return { ok: false, fallback: "localStorage", data: localArticles, error };
    }

    if (!result?.ok) return result || { ok: false, fallback: "localStorage", data: localArticles };
    if (!Array.isArray(result.data)) {
      return { ...result, ok: false, fallback: "localStorage", data: localArticles };
    }

    const remoteArticles = result.data.map((article) => normalizeRemoteArticle(article));
    const merged = mergeArticles(localArticles, remoteArticles);
    saveArticles(merged);
    render();
    return { ...result, data: merged, merged: true };
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
    persistArticle(article);
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

    if (!ALLOWED_STATUS.includes(next.status)) next.status = "draft";
    articles[index] = next;
    saveArticles(articles);
    persistArticle(next);
    return next;
  }

  function deleteArticle(id) {
    return updateArticle(id, { deletedAt: new Date().toISOString() });
  }

  function setArticleStatus(articleId, status) {
    const normalizedStatus = normalizeStatus(status);
    if (!ALLOWED_STATUS.includes(normalizedStatus)) return null;
    return updateArticle(articleId, { status: normalizedStatus });
  }

  function setArticlePublicationLayer(articleId, layer) {
    const normalizedLayer = asText(layer, "").toLowerCase();
    if (!ALLOWED_PUBLICATION_LAYERS.includes(normalizedLayer)) return null;
    const articles = loadArticles();
    const index = articles.findIndex((article) => article.id === articleId);
    if (index < 0) return null;
    const current = articles[index];
    const updated = normalizeArticle({
      ...current,
      publicationLayer: normalizedLayer,
      updatedAt: new Date().toISOString(),
      references: current.references
    });
    articles[index] = updated;
    saveArticles(articles);
    persistArticle(updated);
    return updated;
  }

  function getSectionBucket(section) {
    const normalized = asText(section, "annet").toLowerCase();
    if (["aha", "grupper", "historygo", "kultur"].includes(normalized)) return normalized;
    return "annet";
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
    persistArticle(articles[index]);
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
    persistArticle(articles[index]);
    return article;
  }

  function collectAvailableArticleSources() {
    const out = [];
    const chamber = safeParse(localStorage.getItem(INSIGHTS_KEY) || "{}", { insights: [] });
    asArray(chamber?.insights).filter((insight) => !isDeletedRecord(insight)).forEach((insight, index) => {
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
      .filter((list) => !isDeletedRecord(list))
      .forEach((list) => {
        const refId = asText(list?.id, "");
        if (!refId) return;
        out.push({ id: `list_${refId}`, title: asText(list?.title, "Liste"), type: "list", source: "aha_lists", refId, meta: {} });
      });

    asArray(safeParse(localStorage.getItem(PATHS_KEY) || "[]", []))
      .filter((path) => !isDeletedRecord(path))
      .forEach((path) => {
        const refId = asText(path?.id, "");
        if (!refId) return;
        out.push({ id: `path_${refId}`, title: asText(path?.title, "Sti"), type: "path", source: "aha_paths", refId, meta: {} });
      });

    asArray(safeParse(localStorage.getItem(NOTES_KEY) || "[]", []))
      .filter((note) => !isDeletedRecord(note))
      .forEach((note) => {
        const refId = asText(note?.id, "");
        if (!refId) return;
        out.push({ id: `note_${refId}`, title: asText(note?.title, "Notat"), type: "note", source: "aha_notes", refId, meta: {} });
      });

    return out;
  }

  function renderContent() {
    const rawDataset = localStorage.getItem(ARTICLES_KEY);
    const datasetExists = rawDataset !== null;
    if (datasetExists) JSON.parse(rawDataset);
    const mount = document.getElementById("avisa-articles");
    const draftCountEl = document.getElementById("avisa-draft-count");
    const reviewCountEl = document.getElementById("avisa-review-count");
    const readyCountEl = document.getElementById("avisa-ready-count");
    const publishedCountEl = document.getElementById("avisa-published-count");
    const sectionsCountEl = document.getElementById("avisa-sections-count");
    const lastUpdatedEl = document.getElementById("avisa-last-updated");
    const privacyWarningEl = document.getElementById("avisa-privacy-warning");
    const personalCountEl = document.getElementById("avisa-personal-count");
    const groupCountEl = document.getElementById("avisa-group-count");
    const publicCandidateCountEl = document.getElementById("avisa-public-candidate-count");

    const articles = loadArticles().filter((article) => !article.deletedAt);
    const groups = global.AHAGroups?.getActiveGroups ? asArray(global.AHAGroups.getActiveGroups()) : [];
    const availableRefs = collectAvailableArticleSources();
    const draftCount = articles.filter((a) => a.status === "draft").length;
    const reviewCount = articles.filter((a) => a.status === "review").length;
    const readyCount = articles.filter((a) => a.status === "ready").length;
    const publishedCount = articles.filter((a) => a.status === "published_local").length;
    const sectionCount = new Set(articles.map((a) => asText(a.section, "notater"))).size;
    const personalCount = articles.filter((a) => a.publicationLayer === "personal").length;
    const groupCount = articles.filter((a) => a.publicationLayer === "group").length;
    const publicCandidateCount = articles.filter((a) => a.publicationLayer === "public_candidate").length;
    const latestUpdatedAt = articles.map((a) => Date.parse(a.updatedAt || "")).filter((v) => Number.isFinite(v)).sort((a, b) => b - a)[0];

    if (draftCountEl) draftCountEl.textContent = String(draftCount);
    if (reviewCountEl) reviewCountEl.textContent = String(reviewCount);
    if (readyCountEl) readyCountEl.textContent = String(readyCount);
    if (publishedCountEl) publishedCountEl.textContent = String(publishedCount);
    if (sectionsCountEl) sectionsCountEl.textContent = String(sectionCount);
    if (personalCountEl) personalCountEl.textContent = String(personalCount);
    if (groupCountEl) groupCountEl.textContent = String(groupCount);
    if (publicCandidateCountEl) publicCandidateCountEl.textContent = String(publicCandidateCount);
    if (lastUpdatedEl) lastUpdatedEl.textContent = latestUpdatedAt ? formatDateLabel(new Date(latestUpdatedAt).toISOString()) : "-";
    global.AHAModules?.updatePageHealth?.("avisa", global.AHAModules.localPageHealth({
      count: articles.length,
      datasetExists
    }));

    const publicPublishingAllowed = global.AHAPrivacy?.loadSettings?.().allowPublicPublishing === true;
    if (privacyWarningEl) {
      privacyWarningEl.hidden = false;
      privacyWarningEl.textContent = publicPublishingAllowed
        ? "Offentlig kandidat betyr at artikkelen kan vurderes senere for offentlig AHAavisa/Paradisavisa-format. Ingenting publiseres nå."
        : "Offentlig publisering er ikke samtykket til. Kandidatmerking er bare lokal.";
    }

    if (!mount) return;
    if (!articles.length) {
      mount.innerHTML = `<article class="aha-panel aha-module-state aha-module-empty"><p>${datasetExists ? "No AHAavisa notes yet." : "No module data found."}</p></article>`;
      return;
    }

    const options = availableRefs.map((ref) => (
      `<option value="${escapeHtml(`${ref.source}::${ref.refId}`)}">${escapeHtml(ref.title)} (${escapeHtml(ref.type)})</option>`
    )).join("");

    const filteredArticles = articles.filter((article) => (
      (currentSectionFilter === "alle" || getSectionBucket(article.section) === currentSectionFilter)
      && (currentLayerFilter === "all" || article.publicationLayer === currentLayerFilter)
    ));

    mount.innerHTML = filteredArticles.map((article) => {
      const groupMetaId = asText(article?.meta?.createdFromGroupId, "");
      const groupMetaTitle = asText(article?.meta?.createdFromGroupTitle, "");
      const hasGroupRef = article.references.some((ref) => ref.source === "aha_groups");
      const hasGroupDraft = Boolean(groupMetaId || hasGroupRef);
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
            <span class="avisa-badge avisa-status status-badge status-${escapeHtml(article.status)}">${escapeHtml(article.status)}</span>
            <span class="avisa-badge avisa-layer-badge">${article.publicationLayer === "group" ? "Gruppe" : (article.publicationLayer === "public_candidate" ? "Offentlig kandidat" : "Personlig")}</span>
          </header>
          ${hasGroupDraft ? `<p class="group-draft-badge">Gruppeutkast${groupMetaTitle ? ` · ${escapeHtml(groupMetaTitle)}` : ""}${groupMetaId ? ` · <a href="groups.html#group=${escapeHtml(groupMetaId)}">åpne gruppe</a>` : ""}</p>` : ""}
          ${article.publicationLayer === "public_candidate" ? `<p class="module-meta">${publicPublishingAllowed ? "Offentlig kandidat betyr at artikkelen kan vurderes senere for offentlig AHAavisa/Paradisavisa-format. Ingenting publiseres nå." : "Offentlig publisering er ikke samtykket til. Kandidatmerking er bare lokal."}</p>` : ""}
          <p class="module-meta">Seksjon: ${escapeHtml(article.section)} · Opprettet: ${escapeHtml(article.createdAt)} · Oppdatert: ${escapeHtml(article.updatedAt)}</p>
          <p>${escapeHtml(article.summary || "Ingen ingress ennå.")}</p>
          <div class="avisa-tags">${tags || "<span class='module-meta'>Ingen tags.</span>"}</div>
          <label>Brødtekst
            <textarea data-avisa-body="${escapeHtml(article.id)}">${escapeHtml(article.body)}</textarea>
          </label>
          <div class="aha-tile-actions status-actions">
            <button type="button" data-avisa-save-body="${escapeHtml(article.id)}">Lagre tekst</button>
            <button type="button" data-avisa-status-review="${escapeHtml(article.id)}">Send til review</button>
            <button type="button" data-avisa-status-ready="${escapeHtml(article.id)}">Marker ready</button>
            <button type="button" data-avisa-status-published="${escapeHtml(article.id)}">Publiser lokalt</button>
            <button type="button" data-avisa-status-draft="${escapeHtml(article.id)}">Tilbake til draft</button>
            <button type="button" data-avisa-layer-personal="${escapeHtml(article.id)}">Sett som personlig</button>
            <button type="button" data-avisa-layer-group="${escapeHtml(article.id)}">Sett som gruppeavis</button>
            <button type="button" data-avisa-layer-public-candidate="${escapeHtml(article.id)}">Marker som offentlig kandidat</button>
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
            <div class="avisa-ref-add">
              ${groups.length ? `
              <select class="gruppe-select" data-avisa-group-select="${escapeHtml(article.id)}">
                <option value="">Velg gruppe</option>
                ${groups.map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.title)}</option>`).join("")}
              </select>
              <button type="button" class="gruppe-knapp" data-avisa-add-group="${escapeHtml(article.id)}">Legg artikkel i gruppe</button>
              <div class="statuslinje" data-avisa-group-status="${escapeHtml(article.id)}"></div>
              ` : `<p class="statuslinje">Ingen grupper ennå. <a href="groups.html">Lag en gruppe først.</a></p>`}
            </div>
          </section>
        </article>
      `;
    }).join("") || '<article class="aha-panel aha-module-state aha-module-empty"><p>No notes match the selected filters.</p></article>';
  }

  function render() {
    try {
      renderContent();
    } catch {
      const mount = document.getElementById("avisa-articles");
      if (mount) mount.innerHTML = '<article class="aha-panel aha-module-state aha-module-error" role="alert"><p>Could not read module data.</p></article>';
      global.AHAModules?.updatePageHealth?.("avisa", global.AHAModules.localPageHealth({ error: true }));
    }
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

      const reviewId = target.getAttribute("data-avisa-status-review");
      if (reviewId) { setArticleStatus(reviewId, "review"); render(); return; }
      const readyId = target.getAttribute("data-avisa-status-ready");
      if (readyId) { setArticleStatus(readyId, "ready"); render(); return; }
      const publishedId = target.getAttribute("data-avisa-status-published");
      if (publishedId) { setArticleStatus(publishedId, "published_local"); render(); return; }
      const draftId = target.getAttribute("data-avisa-status-draft");
      if (draftId) { setArticleStatus(draftId, "draft"); render(); return; }

      const deleteId = target.getAttribute("data-avisa-delete");
      if (deleteId) { deleteArticle(deleteId); render(); return; }

      const personalLayerId = target.getAttribute("data-avisa-layer-personal");
      if (personalLayerId) { setArticlePublicationLayer(personalLayerId, "personal"); render(); return; }
      const groupLayerId = target.getAttribute("data-avisa-layer-group");
      if (groupLayerId) { setArticlePublicationLayer(groupLayerId, "group"); render(); return; }
      const candidateLayerId = target.getAttribute("data-avisa-layer-public-candidate");
      if (candidateLayerId) { setArticlePublicationLayer(candidateLayerId, "public_candidate"); render(); return; }

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
      const addGroupArticle = target.getAttribute("data-avisa-add-group");
      if (addGroupArticle) {
        const card = target.closest(".avisa-article-card") || target.closest("article");
        const groupSelect = card?.querySelector("[data-avisa-group-select]");
        const groupStatus = card?.querySelector("[data-avisa-group-status]");
        if (!(groupSelect instanceof HTMLSelectElement) || !(groupStatus instanceof HTMLElement)) return;
        if (!groupSelect.value) { groupStatus.textContent = "Velg en gruppe først"; return; }
        const article = loadArticles().find((item) => item.id === addGroupArticle && !item.deletedAt);
        if (!article || !global.AHAGroups?.addReferenceToGroupByObject) return;
        const result = global.AHAGroups.addReferenceToGroupByObject(groupSelect.value, {
          title: article.title,
          type: "article",
          source: "aha_avisa",
          refId: article.id
        });
        groupStatus.textContent = result?.references ? "Finnes allerede i gruppen" : (result ? "Lagt i gruppe" : "Kunne ikke legge til i gruppe.");
      }

      const filter = target.getAttribute("data-section-filter");
      if (filter && SECTION_FILTERS.includes(filter)) {
        currentSectionFilter = filter;
        document.querySelectorAll("[data-section-filter]").forEach((button) => button.classList.toggle("is-active", button.getAttribute("data-section-filter") === filter));
        render();
      }

      const layerFilter = target.getAttribute("data-layer-filter");
      if (layerFilter && LAYER_FILTERS.includes(layerFilter)) {
        currentLayerFilter = layerFilter;
        document.querySelectorAll("[data-layer-filter]").forEach((button) => button.classList.toggle("is-active", button.getAttribute("data-layer-filter") === layerFilter));
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
    setArticleStatus,
    setArticlePublicationLayer,
    collectAvailableArticleSources,
    syncFromDatabase,
    render,
    refresh
  };

  document.addEventListener("DOMContentLoaded", function () {
    bindEvents();
    render();
  });
})(window);
