// AHA Organization Flow
// Connects existing canonical modules as one user journey: Samle → Ordne → Se koblinger.
// Uses AHALists/AHAPaths APIs only; Mindmap remains derived read-only presentation.
(function (global) {
  "use strict";

  const doc = global.document;
  const LISTABLE_SOURCES = new Set(["aha_insights", "aha_notes", "aha_feed", "aha_gallery", "aha_insta"]);
  const text = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const arr = (value) => Array.isArray(value) ? value : [];
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);

  function activeLists() {
    try {
      return arr(global.AHALists?.loadLists?.()).filter((list) => list && !list.deletedAt && !list.deleted_at);
    } catch {
      return [];
    }
  }

  function searchItemById(itemId) {
    try {
      return arr(global.AHASearch?.collectSearchItems?.()).find((item) => text(item?.id) === text(itemId)) || null;
    } catch {
      return null;
    }
  }

  function addLibraryItemToList(itemId, listId) {
    const item = searchItemById(itemId);
    if (!item) return { ok: false, reason: "item_not_found" };
    if (!LISTABLE_SOURCES.has(text(item.source))) return { ok: false, reason: "unsupported_source" };
    if (!global.AHALists?.addItemToList) return { ok: false, reason: "lists_unavailable" };
    return global.AHALists.addItemToList(listId, {
      source: item.source,
      refId: item.refId,
      type: item.type,
      title: item.title
    });
  }

  function createPathFromList(listId, titleArg) {
    if (!global.AHALists?.loadLists || !global.AHAPaths?.createPath || !global.AHAPaths?.addStepToPath) {
      return { ok: false, reason: "organization_api_unavailable" };
    }
    const list = activeLists().find((item) => text(item.id) === text(listId));
    if (!list) return { ok: false, reason: "list_not_found" };
    const pathTitle = text(titleArg) || `${list.title} – sti`;
    const path = global.AHAPaths.createPath({
      title: pathTitle,
      type: "learning",
      description: list.description ? `Ordnet videre fra listen «${list.title}». ${list.description}` : `Ordnet videre fra listen «${list.title}».`,
      tags: list.tags || []
    });
    if (!path) return { ok: false, reason: "path_create_failed" };
    const added = global.AHAPaths.addStepToPath(path.id, {
      source: "aha_lists",
      refId: list.id,
      type: "list",
      title: list.title,
      meta: { organization_flow: "list_to_path" }
    });
    if (!added?.ok) {
      global.AHAPaths.deletePath?.(path.id);
      return { ok: false, reason: added?.reason || "list_step_failed" };
    }
    global.AHAPaths.refresh?.();
    return { ok: true, path: added.path || path, step: added.step };
  }

  function movePathStep(pathId, stepId, delta) {
    if (!global.AHAPaths?.loadPaths || !global.AHAPaths?.updatePath) return { ok: false, reason: "paths_unavailable" };
    const path = arr(global.AHAPaths.loadPaths()).find((item) => text(item.id) === text(pathId) && !item.deletedAt && !item.deleted_at);
    if (!path) return { ok: false, reason: "path_not_found" };
    const steps = arr(path.steps).slice().sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    const index = steps.findIndex((step) => text(step.id) === text(stepId));
    if (index < 0) return { ok: false, reason: "step_not_found" };
    const nextIndex = Math.max(0, Math.min(steps.length - 1, index + Number(delta || 0)));
    if (nextIndex === index) return { ok: true, noChange: true, path };
    const [moved] = steps.splice(index, 1);
    steps.splice(nextIndex, 0, moved);
    const normalized = steps.map((step, order) => ({ ...step, order }));
    const updated = global.AHAPaths.updatePath(path.id, { steps: normalized });
    global.AHAPaths.refresh?.();
    return updated ? { ok: true, path: updated } : { ok: false, reason: "update_failed" };
  }

  function installStyles() {
    if (!doc?.head || doc.getElementById("aha-organization-flow-styles")) return;
    const style = doc.createElement("style");
    style.id = "aha-organization-flow-styles";
    style.textContent = `
      .aha-org-flow-actions{display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin-top:10px}
      .aha-org-flow-actions select{max-width:220px;min-height:34px}
      .aha-org-flow-status{font-size:.76rem;opacity:.72}
      .aha-org-flow-path-controls{display:inline-flex;gap:5px;margin-left:auto}
      .aha-org-flow-path-controls button{min-width:34px}
      .aha-org-flow-journey{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .aha-org-flow-journey a,.aha-org-flow-journey span{display:block;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px;text-decoration:none;color:inherit}
      .aha-org-flow-journey strong{display:block;margin-bottom:3px}.aha-org-flow-journey small{opacity:.7}
      @media(max-width:700px){.aha-org-flow-journey{grid-template-columns:1fr}.aha-org-flow-actions select{max-width:100%;flex:1 1 170px}}
    `;
    doc.head.appendChild(style);
  }

  function decorateLibrary() {
    if (!doc || !global.AHALists) return 0;
    installStyles();
    const lists = activeLists();
    let count = 0;
    doc.querySelectorAll?.("[data-library-item-id]")?.forEach?.((card) => {
      if (card.querySelector("[data-org-library-list]")) return;
      const item = searchItemById(card.getAttribute("data-library-item-id"));
      if (!item || !LISTABLE_SOURCES.has(text(item.source))) return;
      const actions = card.querySelector(".aha-search-actions") || card;
      const wrapper = doc.createElement("div");
      wrapper.className = "aha-org-flow-actions";
      wrapper.setAttribute("data-org-library-list", item.id);
      wrapper.innerHTML = lists.length
        ? `<select aria-label="Velg liste">${lists.map((list) => `<option value="${esc(list.id)}">${esc(list.title)}</option>`).join("")}</select><button type="button" data-org-add-library-to-list="${esc(item.id)}">Legg i liste</button><span class="aha-org-flow-status" aria-live="polite"></span>`
        : `<a class="aha-search-link" href="lists.html#lists-create">Lag en liste for å samle dette</a>`;
      actions.insertAdjacentElement("afterend", wrapper);
      count += 1;
    });
    return count;
  }

  function decorateLists() {
    if (!doc || !global.AHALists || !global.AHAPaths) return 0;
    installStyles();
    let count = 0;
    doc.querySelectorAll?.(".aha-list-preview")?.forEach?.((preview) => {
      if (preview.querySelector("[data-org-list-to-path]")) return;
      const selector = preview.querySelector("[data-list-select]");
      const listId = selector?.getAttribute("data-list-select") || "";
      if (!listId) return;
      const header = preview.querySelector(".aha-list-header") || preview.querySelector("h2")?.parentElement || preview;
      const box = doc.createElement("div");
      box.className = "aha-org-flow-actions";
      box.innerHTML = `<button type="button" data-org-list-to-path="${esc(listId)}">Ordne som sti</button><a class="aha-tile-btn" href="mindmap.html">Se koblinger</a><span class="aha-org-flow-status" aria-live="polite"></span>`;
      header.insertAdjacentElement("afterend", box);
      count += 1;
    });
    return count;
  }

  function decoratePaths() {
    if (!doc || !global.AHAPaths) return 0;
    installStyles();
    let count = 0;
    doc.querySelectorAll?.(".aha-path-step-row")?.forEach?.((row) => {
      if (row.querySelector(".aha-org-flow-path-controls")) return;
      const remove = row.querySelector("[data-step-remove]");
      const payload = remove?.getAttribute("data-step-remove") || "";
      const [pathId, stepId] = payload.split("::");
      if (!pathId || !stepId) return;
      const controls = doc.createElement("span");
      controls.className = "aha-org-flow-path-controls";
      controls.innerHTML = `<button type="button" data-org-move-step="${esc(pathId)}::${esc(stepId)}::-1" aria-label="Flytt opp">↑</button><button type="button" data-org-move-step="${esc(pathId)}::${esc(stepId)}::1" aria-label="Flytt ned">↓</button>`;
      remove.insertAdjacentElement("beforebegin", controls);
      count += 1;
    });
    const preview = doc.querySelector?.(".aha-path-preview");
    if (preview && !preview.querySelector("[data-org-path-mindmap]")) {
      const link = doc.createElement("a");
      link.className = "aha-tile-btn";
      link.href = "mindmap.html";
      link.setAttribute("data-org-path-mindmap", "true");
      link.textContent = "Se koblinger i Tankekart";
      preview.querySelector(".aha-path-meta")?.insertAdjacentElement("afterend", link);
    }
    return count;
  }

  function decorateMindmap() {
    const main = doc?.querySelector?.("main");
    if (!main || main.querySelector("[data-org-flow-journey]")) return false;
    installStyles();
    const shell = main.querySelector(".aha-module-shell");
    if (!shell) return false;
    const section = doc.createElement("section");
    section.className = "aha-panel";
    section.setAttribute("data-org-flow-journey", "true");
    section.innerHTML = `<p class="eyebrow">Samle → Ordne → Se koblinger</p><div class="aha-org-flow-journey"><a href="lists.html"><strong>1. Samle</strong><small>Bygg lister av eksisterende materiale.</small></a><a href="paths.html"><strong>2. Ordne</strong><small>Sett lister, innsikter og notater i rekkefølge.</small></a><span><strong>3. Se koblinger</strong><small>Tankekart viser eksisterende referanser read-only og blir ikke canonical sannhet.</small></span></div>`;
    shell.insertAdjacentElement("afterend", section);
    return true;
  }

  function refreshDecorations() {
    decorateLibrary();
    decorateLists();
    decoratePaths();
    decorateMindmap();
  }

  function bind() {
    if (!doc || doc.body?.dataset?.ahaOrganizationFlowBound === "true") return;
    if (doc.body) doc.body.dataset.ahaOrganizationFlowBound = "true";
    doc.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof global.HTMLElement)) return;

      const libraryId = target.getAttribute("data-org-add-library-to-list");
      if (libraryId) {
        const wrapper = target.closest("[data-org-library-list]");
        const listId = wrapper?.querySelector("select")?.value || "";
        const status = wrapper?.querySelector(".aha-org-flow-status");
        const result = addLibraryItemToList(libraryId, listId);
        if (status) status.textContent = result?.ok ? "Lagt i listen." : result?.reason === "duplicate" ? "Finnes allerede i listen." : "Kunne ikke legge til.";
        return;
      }

      const listId = target.getAttribute("data-org-list-to-path");
      if (listId) {
        const host = target.closest(".aha-org-flow-actions");
        const status = host?.querySelector(".aha-org-flow-status");
        const result = createPathFromList(listId);
        if (status) status.innerHTML = result.ok ? `Stien er opprettet. <a href="paths.html">Åpne stien</a>.` : "Kunne ikke opprette stien.";
        return;
      }

      const move = target.getAttribute("data-org-move-step");
      if (move) {
        const [pathId, stepId, delta] = move.split("::");
        movePathStep(pathId, stepId, Number(delta));
        return;
      }
    });

    if (typeof global.MutationObserver === "function") {
      ["search-library-recent", "search-library-related", "lists-list", "paths-list"].forEach((id) => {
        const host = doc.getElementById(id);
        if (!host) return;
        const observer = new global.MutationObserver(refreshDecorations);
        observer.observe(host, { childList: true, subtree: true });
      });
    }
    refreshDecorations();
  }

  const api = {
    LISTABLE_SOURCES: [...LISTABLE_SOURCES],
    activeLists,
    searchItemById,
    addLibraryItemToList,
    createPathFromList,
    movePathStep,
    decorateLibrary,
    decorateLists,
    decoratePaths,
    decorateMindmap,
    refreshDecorations,
    bind
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AHAOrganizationFlow = api;
  if (doc) doc.readyState === "loading" ? doc.addEventListener("DOMContentLoaded", bind) : bind();
})(typeof window !== "undefined" ? window : globalThis);