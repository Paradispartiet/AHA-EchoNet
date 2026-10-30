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

  function projectionMemberMatchesSavedList(item, list) {
    if (item?.source !== "aha_projection_v2") return false;
    const parent = list?.meta || {};
    const member = item?.meta || {};
    const sourceHash = text(parent.source_sha256).toLowerCase();
    if (parent.createdBy !== "aha_projection_materializer_v2" || !/^[a-f0-9]{64}$/.test(sourceHash)) return false;
    if (member.inline !== true || member.immutable !== true || member?.snapshot?.source !== "aha_semantic_v2") return false;
    if (text(member?.snapshot?.id) !== text(item.refId || item.ref_id) || !text(member?.snapshot?.title)) return false;
    if (!arr(parent.member_ref_ids).map(text).includes(text(item.refId || item.ref_id))) return false;
    return ["projection_id", "projection_artifact_id", "analysis_id", "analysis_run_id", "source_id", "source_sha256"]
      .every((key) => text(parent[key]) && text(parent[key]) === text(member[key]));
  }

  function createPathFromList(listId, titleArg) {
    if (!global.AHALists?.loadLists || !global.AHAPaths?.createPath || !global.AHAPaths?.addStepToPath || !global.AHAPaths?.validatePathStepReference) {
      return { ok: false, reason: "organization_api_unavailable" };
    }
    const list = activeLists().find((item) => text(item.id) === text(listId));
    if (!list) return { ok: false, reason: "list_not_found" };

    // Promote only existing AHA objects that Paths actually supports. Never
    // invent steps from summaries or silently import deleted source objects.
    const eligible = [];
    const seen = new Set();
    let skipped = 0;
    let invalidProjectionMembers = 0;
    arr(list.items).forEach((item) => {
      const key = text(item?.source) + "::" + text(item?.refId || item?.ref_id);
      if (!["aha_insights", "aha_notes", "aha_projection_v2"].includes(item?.source) || !text(item?.refId || item?.ref_id)) {
        skipped += 1;
        return;
      }
      if (seen.has(key)) return;
      seen.add(key);
      if (item.source === "aha_projection_v2" && !projectionMemberMatchesSavedList(item, list)) {
        skipped += 1;
        invalidProjectionMembers += 1;
        return;
      }
      const checked = global.AHAPaths.validatePathStepReference(item);
      if (!checked?.ok) {
        skipped += 1;
        if (item.source === "aha_projection_v2") invalidProjectionMembers += 1;
        return;
      }
      eligible.push({ ...checked.item, narrative: text(item?.membership_reason) });
    });
    // A materialized AI List must not silently lose its source-bound members.
    // Validate the full promotion BEFORE creating any local Path record.
    if (invalidProjectionMembers > 0) return { ok: false, reason: "projection_member_invalid", skipped };
    if (list?.meta?.createdBy === "aha_projection_materializer_v2" && !eligible.length) {
      return { ok: false, reason: "projection_members_unavailable", skipped };
    }

    const path = global.AHAPaths.createPath({
      title: text(titleArg) || `${list.title} – kunnskapssti`,
      type: "learning",
      mode: "learning",
      description: list.description ? `Videre arbeid fra samlingen «${list.title}». ${list.description}` : `Videre arbeid fra samlingen «${list.title}».`,
      goal: "Undersøk det lagrede materialet og hva som kan konkluderes."
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
    let lastPath = added.path;
    let promoted = 0;
    for (const item of eligible) {
      const result = global.AHAPaths.addStepToPath(path.id, {
        source: item.source, refId: item.refId, type: item.type, title: item.title,
        narrative: item.narrative,
        // Projection steps require the validated immutable inline snapshot on
        // both the first validation and the final AHAPaths.addStepToPath call.
        ...(item.source === "aha_projection_v2" ? { meta: item.meta } : {})
      });
      if (result?.ok) { promoted += 1; lastPath = result.path; }
      else skipped += 1;
    }
    global.AHAPaths.refresh?.();
    return { ok: true, path: lastPath, step: added.step, promoted, skipped };
  }

  // Explicitly turn a curated concept list into the first step of a real
  // local knowledge path. No automatic sharing or new storage model.
  function createPathFromConceptList(listId, titleArg) {
    if (!global.AHALists?.loadConceptLists || !global.AHAPaths?.createPath || !global.AHAPaths?.addStepToPath) {
      return { ok: false, reason: "organization_api_unavailable" };
    }
    const list = arr(global.AHALists.loadConceptLists()).find((item) =>
      text(item?.id) === text(listId) && !item.deletedAt && !item.deleted_at && !item.archived);
    if (!list) return { ok: false, reason: "concept_list_not_found" };
    const path = global.AHAPaths.createPath({
      title: text(titleArg) || `${list.title} – kunnskapssti`,
      type: "learning", mode: "learning",
      description: list.description || `Utforsk begrepene og koblingene i «${list.title}».`,
      goal: `Forstå begrepene og sammenhengene i «${list.title}».`,
      learningOutcome: "Kunne forklare sentrale begreper og hvordan de henger sammen."
    });
    if (!path) return { ok: false, reason: "path_create_failed" };
    const added = global.AHAPaths.addStepToPath(path.id, {
      source: "aha_concept_lists", refId: list.id,
      type: "concept_list", title: list.title,
      narrative: `Start med begrepslisten «${list.title}». Undersøk forklaringene og relasjonene.`,
      learningOutcome: "Kunne forklare hvorfor begrepene hører sammen.",
      meta: { organization_flow: "concept_list_to_path" }
    });
    if (!added?.ok) {
      global.AHAPaths.deletePath?.(path.id);
      return { ok: false, reason: added?.reason || "concept_step_failed" };
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
        if (status) status.innerHTML = result.ok
          ? `Sti med ${result.promoted + 1} steg opprettet${result.skipped ? `; ${result.skipped} utilgjengelige/ikke-støttede objekter ble ikke tatt med` : ""}. <a href="paths.html#path-${encodeURIComponent(result.path.id)}">Åpne stien</a>.`
          : ["projection_member_invalid", "projection_members_unavailable"].includes(result.reason)
            ? "AI-listens kildebundne innsikter kunne ikke bekreftes. Ingen sti ble opprettet; listen er bevart."
            : "Kunne ikke opprette stien.";
        return;
      }

      const conceptId = target.getAttribute("data-org-concept-to-path");
      if (conceptId) {
        const host = target.closest(".aha-concept-list-actions");
        const status = host?.querySelector(".aha-org-flow-status");
        const result = createPathFromConceptList(conceptId);
        if (status) status.innerHTML = result.ok ? `Kunnskapsstien er opprettet. <a href="paths.html#path-${encodeURIComponent(result.path.id)}">Åpne stien</a>.` : "Kunne ikke opprette stien.";
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
    createPathFromConceptList,
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