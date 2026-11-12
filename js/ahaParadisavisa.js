/* AHA Paradisavisa V1: lokal leselogg og eksplisitte relasjoner, ingen nettverk. */
(function (global) {
  "use strict";
  const KEY = "aha_paradisavisa_library_v1";
  const OWNER_KEY = "aha_paradisavisa_cloud_owner_v1";
  // The original localStorage key predates accounts. Once its contents have
  // been backed up to an Aha account, do not display or modify them unless
  // that same account has been verified by Supabase for this page session.
  let verifiedLocalOwner = false;
  function hasLocalOwner() {
    try { return Boolean(localStorage.getItem(OWNER_KEY)); }
    catch { return true; } // Fail closed if storage is unreadable.
  }
  function localAccessAllowed() { return !hasLocalOwner() || verifiedLocalOwner; }
  function setOwnerAccess(allowed) {
    verifiedLocalOwner = allowed === true;
    if ($("aha-avisa-results")) render();
  }
  const ARTICLE_ORIGIN = "https://paradispartiet.github.io";
  const LISTS = "aha_lists_v1";
  const PATHS = "aha_paths_v1";
  const $ = (id) => document.getElementById(id);
  const isoNow = () => new Date().toISOString();
  const allowedPath = (id) => /^\/Paradisavisa\/(?:artikler|posts)\/[^?#]+\.html$/i.test(id || "");
  const arr = (value) => Array.isArray(value) ? value : [];
  const words = (value) => String(value ?? "").trim();
  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
    catch { return fallback; }
  }
  function saveJson(key, value) {
    if (key === KEY && !localAccessAllowed()) {
      feedback("Det lokale biblioteket er knyttet til en annen eller ikke-verifisert Aha-konto.");
      return false;
    }
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { feedback("Kunne ikke lagre. Kontroller nettleserens lokale lagring."); return false; }
  }
  function load() {
    if (!localAccessAllowed()) return { version: 1, trackingEnabled: false, articles: [] };
    const raw = loadJson(KEY, null);
    const articles = arr(raw?.articles).filter((article) => {
      if (!allowedPath(article?.id)) return false;
      try {
        const parsed = new URL(article.url);
        return parsed.origin === ARTICLE_ORIGIN && parsed.pathname === article.id;
      } catch { return false; }
    });
    return { version: 1, trackingEnabled: raw?.trackingEnabled === true, articles };
  }
  function feedback(message) { if ($("aha-avisa-feedback")) $("aha-avisa-feedback").textContent = message; }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(label, action, pressed) {
    const b = el("button", "", label);
    b.type = "button";
    if (pressed !== undefined) b.setAttribute("aria-pressed", String(Boolean(pressed)));
    b.addEventListener("click", action);
    return b;
  }
  function select(placeholder, options) {
    const node = el("select");
    node.setAttribute("aria-label", placeholder);
    node.appendChild(new Option(placeholder, ""));
    options.forEach((item) => node.appendChild(new Option(words(item.title), item.id)));
    return node;
  }
  function update(id, patch) {
    const data = load();
    const index = data.articles.findIndex((a) => a.id === id);
    if (index < 0) return;
    const next = { ...data.articles[index], ...patch };
    if (!next.savedAt && !next.readAt && !next.openedAt) data.articles.splice(index, 1);
    else data.articles[index] = next;
    if (saveJson(KEY, data)) render();
  }
  function clearHistory() {
    const data = load();
    if (!global.confirm("Slette åpne- og lesehistorikken? Lagrede artikler, tags og egne samlinger/stier beholdes.")) return;
    data.articles = data.articles.map((a) => ({ ...a, readAt: null, openedAt: null, openCount: 0 })).filter((a) => a.savedAt);
    if (saveJson(KEY, data)) { feedback("Lesehistorikken er slettet. Lagrede artikler er beholdt."); render(); }
  }
  function activeItems(key) {
    return arr(loadJson(key, [])).filter((item) => item && !item.deletedAt && !item.deleted_at && item.archived !== true && words(item.id));
  }
  function addToStructure(article, key, structureId) {
    if (!structureId) return feedback("Velg en eksisterende samling eller kunnskapssti.");
    const all = loadJson(key, []);
    if (!Array.isArray(all)) return feedback("Lagringsformatet er ugyldig. Ingenting ble endret.");
    const target = all.find((item) => item.id === structureId && !item.deletedAt && !item.deleted_at && item.archived !== true);
    if (!target) return feedback("Samlingen eller stien finnes ikke lenger.");
    const isPath = key === PATHS;
    const field = isPath ? "steps" : "items";
    const entries = arr(target[field]);
    if (entries.some((item) => item?.source === "paradisavisa" && item?.refId === article.id)) return feedback("Artikkelen finnes allerede her.");
    const now = isoNow();
    const entry = { id: "paradisavisa_ref_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
      title: words(article.title), type: "article", source: "paradisavisa", refId: article.id,
      addedAt: now, meta: { local_only: true, createdBy: "aha_paradisavisa_library_v1" } };
    if (isPath) {
      entry.order = entries.length;
      entry.status = "planned";
      entry.narrative = "";
      entry.learningOutcome = "";
    }
    target[field] = [...entries, entry];
    target.updatedAt = now;
    if (saveJson(key, all)) feedback(isPath ? "Artikkelen er lagt i stien. Den er nå også en kobling i Tankekart." : "Artikkelen er lagt i samlingen. Den er nå også en kobling i Tankekart.");
  }
  function articleStamp(article) {
    return words(article.readAt || article.savedAt || article.openedAt || article.publishedAt);
  }
  function formatDate(iso) {
    const date = new Date(iso || "");
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString("nb-NO", { year: "numeric", month: "short", day: "numeric" }) : "Ukjent";
  }
  function entryCard(article, lists, paths) {
    const card = el("article", "aha-avisa-entry");
    const meta = el("p", "aha-avisa-meta",
      [words(article.category || "Ukjent tema"), article.publishedAt ? "Publisert " + formatDate(article.publishedAt) : "",
       article.readAt ? "Lest " + formatDate(article.readAt) : "", article.savedAt ? "Lagret " + formatDate(article.savedAt) : ""].filter(Boolean).join(" · "));
    card.appendChild(meta);
    card.appendChild(el("h3", "", words(article.title) || "Uten tittel"));
    const desc = el("p", "", words(article.summary || article.excerpt).slice(0, 240));
    card.appendChild(desc);
    const tags = arr(article.tags).filter((tag) => typeof tag === "string");
    if (tags.length) card.appendChild(el("p", "aha-avisa-meta", "Merket: " + tags.join(", ")));
    const actions = el("div", "aha-avisa-entry-actions");
    const link = el("a", "", "Les artikkelen");
    link.href = new URL(article.id, ARTICLE_ORIGIN).href;
    actions.appendChild(link);
    actions.appendChild(button(article.savedAt ? "Fjern lagring" : "Lagre", () => {
      update(article.id, { savedAt: article.savedAt ? null : isoNow() });
    }, Boolean(article.savedAt)));
    actions.appendChild(button(article.readAt ? "Marker ulest" : "Merk som lest", () => {
      update(article.id, { readAt: article.readAt ? null : isoNow() });
    }, Boolean(article.readAt)));
    card.appendChild(actions);
    const tagForm = el("form");
    const tagLabel = el("label", "", "Egne temaord (kommaseparert)");
    const tagInput = el("input");
    tagInput.type = "text";
    tagInput.maxLength = 400;
    tagInput.value = tags.join(", ");
    tagLabel.appendChild(tagInput);
    tagForm.appendChild(tagLabel);
    const saveTags = el("button", "", "Lagre temaord");
    saveTags.type = "submit";
    tagForm.appendChild(saveTags);
    tagForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const next = [...new Set(tagInput.value.split(",").map((t) => t.trim().slice(0, 50)).filter(Boolean))].slice(0, 12);
      update(article.id, { tags: next });
      feedback("Temaordene er lagret lokalt.");
    });
    card.appendChild(tagForm);
    const relations = el("div", "aha-avisa-entry-actions");
    const listSelect = select("Velg samling", lists);
    const pathSelect = select("Velg kunnskapssti", paths);
    const addList = button("Legg i samling", () => addToStructure(article, LISTS, listSelect.value));
    const addPath = button("Legg i sti", () => addToStructure(article, PATHS, pathSelect.value));
    relations.append(listSelect, addList, pathSelect, addPath);
    card.appendChild(relations);
    if (!lists.length || !paths.length) card.appendChild(el("p", "aha-avisa-note", "Du kan lage samlinger og stier via lenkene øverst."));
    return card;
  }
  function populateCategories(data) {
    const target = $("aha-avisa-category");
    if (!target) return;
    const last = target.value;
    const categories = new Set();
    data.articles.forEach((a) => {
      if (words(a.category)) categories.add(words(a.category));
      arr(a.tags).forEach((tag) => { if (words(tag)) categories.add(words(tag)); });
    });
    target.replaceChildren(new Option("Alle temaer", "all"));
    [...categories].sort((a, b) => a.localeCompare(b, "nb")).forEach((label) => target.appendChild(new Option(label, label)));
    target.value = [...target.options].some((option) => option.value === last) ? last : "all";
  }
  function filtered(articles) {
    const scope = $("aha-avisa-scope").value;
    const category = $("aha-avisa-category").value;
    const period = Number($("aha-avisa-period").value);
    const query = words($("aha-avisa-query").value).toLocaleLowerCase("nb");
    const result = articles.filter((a) => {
      if (scope === "saved" && !a.savedAt) return false;
      if (scope === "read" && !a.readAt) return false;
      if (category !== "all" && a.category !== category && !arr(a.tags).includes(category)) return false;
      if (period && (Date.now() - new Date(articleStamp(a)).getTime()) > period * 86400000) return false;
      const haystack = [a.title, a.summary, a.excerpt, a.category, ...arr(a.tags)].join(" ").toLocaleLowerCase("nb");
      return !query || haystack.includes(query);
    });
    const sort = $("aha-avisa-sort").value;
    const byDate = (key) => (a, b) => String(b[key] || "").localeCompare(String(a[key] || ""));
    result.sort(sort === "title" ? (a, b) => String(a.title).localeCompare(String(b.title), "nb")
      : sort === "category" ? (a, b) => String(a.category).localeCompare(String(b.category), "nb") || byDate("publishedAt")(a, b)
      : sort === "published" ? byDate("publishedAt") : (a, b) => articleStamp(b).localeCompare(articleStamp(a)));
    return result;
  }
  function render() {
    const locked = !localAccessAllowed();
    const ownerNotice = $("aha-avisa-owner-notice");
    if (ownerNotice) {
      ownerNotice.hidden = !locked;
      ownerNotice.textContent = locked
        ? "Dette lokale lesebiblioteket er koblet til en Aha-konto. Logg inn med samme konto for å vise og endre lokale artikler. Skyhandlinger er ikke aktivert automatisk."
        : "";
    }
    ["aha-avisa-tracking", "aha-avisa-clear-history", "aha-avisa-export", "aha-avisa-import",
      "aha-avisa-query", "aha-avisa-scope", "aha-avisa-category", "aha-avisa-period", "aha-avisa-sort"
    ].forEach((id) => { const control = $(id); if (control) control.disabled = locked; });
    const data = load();
    const tracking = $("aha-avisa-tracking");
    const sameOrigin = location.origin === ARTICLE_ORIGIN;
    tracking.disabled = locked || !sameOrigin;
    tracking.textContent = !sameOrigin ? "Lesehistorikk styres i Paradisavisa" : (data.trackingEnabled ? "Slå av lesehistorikk" : "Aktiver lesehistorikk");
    tracking.setAttribute("aria-pressed", String(data.trackingEnabled));
    const stats = $("aha-avisa-stats");
    stats.replaceChildren();
    [
      [data.articles.filter((a) => a.readAt).length, "Leste artikler"],
      [data.articles.filter((a) => a.savedAt).length, "Lagrede artikler"],
      [new Set(data.articles.map((a) => a.category).filter(Boolean)).size, "Hovedtemaer"]
    ].forEach(([n, label]) => stats.appendChild(el("span", "", n + " " + label)));
    populateCategories(data);
    const selected = filtered(data.articles);
    $("aha-avisa-results-count").textContent = selected.length + " artikler i dette utvalget";
    const target = $("aha-avisa-results");
    target.replaceChildren();
    const lists = activeItems(LISTS), paths = activeItems(PATHS);
    if (!selected.length) {
      target.appendChild(el("p", "aha-avisa-note",
        data.articles.length ? "Ingen artikler matcher filtrene." : "Ingen artikler er registrert ennå. Åpne en artikkel i Paradisavisa, og velg «Lagre i Aha» eller aktiver lesehistorikk."));
    } else selected.forEach((a) => target.appendChild(entryCard(a, lists, paths)));
  }
  function importData(payload) {
    // Import changes only articles. Never import the file's tracking consent.
    if (!payload || payload.version !== 1 || !Array.isArray(payload.articles) || payload.articles.length > 5000) {
      return { ok: false, reason: "invalid_format" };
    }
    const data = load(), byId = new Map(data.articles.map((a) => [a.id, a]));
    let added = 0, updated = 0, rejected = 0;
    for (const row of payload.articles) {
      const id = words(row?.id), rawUrl = words(row?.url);
      let parsed;
      try { parsed = new URL(rawUrl); } catch { rejected++; continue; }
      if (!allowedPath(id) || parsed.origin !== ARTICLE_ORIGIN || parsed.pathname !== id) {
        rejected++; continue;
      }
      const safeDate = (v) => {
        const value = words(v).slice(0, 35);
        return value && Number.isFinite(Date.parse(value)) ? value : null;
      };
      const tags = [...new Set(arr(row.tags).filter((v) => typeof v === "string").map((v) => v.trim().slice(0, 50)).filter(Boolean))].slice(0, 12);
      const safe = {
        id, url: ARTICLE_ORIGIN + id, source: "paradisavisa", local_only: true,
        title: words(row.title).slice(0, 250), summary: words(row.summary).slice(0, 700),
        excerpt: words(row.excerpt).slice(0, 1100), category: words(row.category).slice(0, 80),
        publishedAt: safeDate(row.publishedAt), openedAt: safeDate(row.openedAt),
        readAt: safeDate(row.readAt), savedAt: safeDate(row.savedAt),
        openCount: Math.max(0, Math.min(100000, Math.floor(Number(row.openCount) || 0))),
        tags
      };
      if (!safe.title || !(safe.savedAt || safe.readAt || safe.openedAt)) { rejected++; continue; }
      const existing = byId.get(id);
      if (existing) {
        byId.set(id, {
          ...safe, ...existing, id, url: safe.url, source: "paradisavisa", local_only: true,
          savedAt: existing.savedAt || safe.savedAt, readAt: existing.readAt || safe.readAt,
          openedAt: existing.openedAt || safe.openedAt,
          openCount: Math.max(safe.openCount, Number(existing.openCount) || 0),
          tags: [...new Set([...tags, ...arr(existing.tags)])].slice(0, 12)
        });
        updated++;
      } else { byId.set(id, safe); added++; }
    }
    if (!added && !updated) return { ok: false, reason: "no_valid_articles", rejected };
    // Do not silently drop older local saves when combining a large import
    // with an existing library. The user must explicitly reconcile volumes.
    if (byId.size > 5000) return { ok: false, reason: "too_many_articles", rejected };
    data.articles = [...byId.values()];
    if (!saveJson(KEY, data)) return { ok: false, reason: "storage_failed" };
    return { ok: true, added, updated, rejected };
  }
  async function importFile(file) {
    if (!file) return;
    if (file.size > 2_000_000) return feedback("Filen er for stor (maks 2 MB).");
    try {
      const result = importData(JSON.parse(await file.text()));
      feedback(result.ok
        ? "Importert: " + result.added + " nye, " + result.updated + " eksisterende artikler. " + result.rejected + " avvist. Lesehistorikk-samtykke er uendret."
        : result.reason === "too_many_articles"
          ? "Import avvist: samlet bibliotek ville overstige 5000 artikler. Ingen eksisterende artikler er fjernet."
          : "Import avvist. JSON-filen må inneholde et gyldig Paradisavisa-bibliotek.");
      render();
    } catch {
      feedback("Ugyldig JSON-fil. Ingenting ble importert.");
    }
  }
  function exportData() {
    const data = load();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = el("a"); link.href = url; link.download = "aha-paradisavisa-bibliotek.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    feedback("Bibliotekdata er eksportert til en lokal fil.");
  }
  function init() {
    if (!$("aha-avisa-results")) return;
    ["aha-avisa-query", "aha-avisa-scope", "aha-avisa-category", "aha-avisa-period", "aha-avisa-sort"].forEach((id) => {
      $(id).addEventListener(id === "aha-avisa-query" ? "input" : "change", render);
    });
    $("aha-avisa-tracking").addEventListener("click", () => {
      if (location.origin !== ARTICLE_ORIGIN) return feedback("Åpne Paradisavisa for å styre lesehistorikken der. Bruk eksport/import mellom ulike domener.");
      const state = load(); state.trackingEnabled = !state.trackingEnabled;
      if (saveJson(KEY, state)) { feedback(state.trackingEnabled ? "Frivillig lesehistorikk er aktivert." : "Automatisk lesehistorikk er av."); render(); }
    });
    $("aha-avisa-clear-history").addEventListener("click", clearHistory);
    $("aha-avisa-export").addEventListener("click", exportData);
    $("aha-avisa-import").addEventListener("change", (event) => { importFile(event.target.files?.[0]); event.target.value = ""; });
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  global.AHAParadisavisa = Object.freeze({ load, filtered, importData, setOwnerAccess, localAccessAllowed });
})(window);