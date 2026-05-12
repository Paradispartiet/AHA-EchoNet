// ahaPaths.js
// Fase 3D: første fungerende AHA-stier modul (localStorage-first).

(function (global) {
  "use strict";

  const PATHS_KEY = "aha_paths_v1";
  const INSIGHTS_KEY = "aha_insight_chamber_v1";
  const LISTS_KEY = "aha_lists_v1";
  const NOTES_KEY = "aha_notes_v1";

  const ALLOWED_PATH_TYPES = ["learning", "process", "project", "habit", "reading", "historygo", "publishing"];
  const ALLOWED_STEP_STATUS = ["planned", "active", "done", "skipped"];

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

  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function loadRawByKey(key, fallback) {
    return safeParse(localStorage.getItem(key) || JSON.stringify(fallback), fallback);
  }

  function normalizeStep(step, index) {
    const now = new Date().toISOString();
    const status = ALLOWED_STEP_STATUS.includes(step?.status) ? step.status : "planned";

    return {
      id: asText(step?.id, uid("path_step")),
      title: asText(step?.title, "Steg"),
      type: asText(step?.type, "reference"),
      source: asText(step?.source, "aha"),
      refId: asText(step?.refId || step?.ref_id, ""),
      order: Number.isFinite(Number(step?.order)) ? Number(step.order) : index,
      status,
      addedAt: step?.addedAt || step?.added_at || now,
      meta: step && typeof step.meta === "object" && !Array.isArray(step.meta) ? step.meta : {}
    };
  }

  function normalizePath(path) {
    const now = new Date().toISOString();
    const type = ALLOWED_PATH_TYPES.includes(path?.type) ? path.type : "learning";
    const tags = global.AHAContracts?.normalizeTags ? global.AHAContracts.normalizeTags(path?.tags) : asArray(path?.tags);
    const rawSteps = asArray(path?.steps).map((step, index) => normalizeStep(step, index));
    const sortedSteps = rawSteps.slice().sort((a, b) => a.order - b.order).map((step, index) => ({ ...step, order: index }));

    return {
      id: asText(path?.id, uid("path")),
      title: asText(path?.title, "Uten navn"),
      type,
      description: asText(path?.description, ""),
      createdAt: path?.createdAt || path?.created_at || now,
      updatedAt: path?.updatedAt || path?.updated_at || now,
      tags,
      steps: sortedSteps,
      source: asText(path?.source, "aha_paths"),
      meta: path && typeof path.meta === "object" && !Array.isArray(path.meta) ? path.meta : {},
      deletedAt: path?.deletedAt || path?.deleted_at || ""
    };
  }

  function loadPaths() {
    return asArray(loadRawByKey(PATHS_KEY, [])).map((path) => normalizePath(path));
  }

  function savePaths(paths) {
    localStorage.setItem(PATHS_KEY, JSON.stringify(asArray(paths)));
    return asArray(paths);
  }

  function createPath(input) {
    const title = asText(input?.title, "");
    if (!title) return null;

    const now = new Date().toISOString();
    const paths = loadPaths();
    const created = normalizePath({
      id: uid("path"),
      title,
      type: input?.type,
      description: asText(input?.description, ""),
      createdAt: now,
      updatedAt: now,
      tags: input?.tags,
      steps: [],
      source: "aha_paths",
      meta: { createdBy: "paths_ui" }
    });

    paths.unshift(created);
    savePaths(paths);
    return created;
  }

  function updatePath(id, changes) {
    const paths = loadPaths();
    const index = paths.findIndex((path) => path.id === id);
    if (index < 0) return null;

    const current = paths[index];
    const updated = normalizePath({
      ...current,
      ...changes,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
      steps: changes?.steps !== undefined ? changes.steps : current.steps
    });

    paths[index] = updated;
    savePaths(paths);
    return updated;
  }

  function deletePath(id) {
    return updatePath(id, { deletedAt: new Date().toISOString() });
  }

  function addStepToPath(pathId, stepInput) {
    const paths = loadPaths();
    const index = paths.findIndex((path) => path.id === pathId && !path.deletedAt);
    if (index < 0) return null;

    const path = paths[index];
    const source = asText(stepInput?.source, "");
    const refId = asText(stepInput?.refId || stepInput?.ref_id, "");
    if (!source || !refId) return null;

    const duplicate = path.steps.some((step) => step.source === source && step.refId === refId);
    if (duplicate) return path;

    const step = normalizeStep({
      id: uid("path_step"),
      title: stepInput?.title,
      type: stepInput?.type,
      source,
      refId,
      order: path.steps.length,
      status: "planned",
      addedAt: new Date().toISOString(),
      meta: stepInput?.meta || {}
    }, path.steps.length);

    path.steps.push(step);
    path.updatedAt = new Date().toISOString();
    paths[index] = normalizePath(path);
    savePaths(paths);
    return step;
  }

  function removeStepFromPath(pathId, stepId) {
    const paths = loadPaths();
    const index = paths.findIndex((path) => path.id === pathId && !path.deletedAt);
    if (index < 0) return null;

    const path = paths[index];
    const nextSteps = path.steps.filter((step) => step.id !== stepId);
    if (nextSteps.length === path.steps.length) return null;

    path.steps = nextSteps.map((step, order) => ({ ...step, order }));
    path.updatedAt = new Date().toISOString();
    paths[index] = normalizePath(path);
    savePaths(paths);
    return path;
  }

  function collectAvailablePathItems() {
    const out = [];

    const chamber = loadRawByKey(INSIGHTS_KEY, { insights: [] });
    asArray(chamber?.insights).forEach((insight, index) => {
      const refId = asText(insight?.id, `insight_idx_${index}`);
      out.push({
        id: `insight_${refId}`,
        title: asText(insight?.title || insight?.heading || insight?.label || insight?.summary || insight?.text, "Innsikt"),
        type: "insight",
        source: "aha_insights",
        refId,
        meta: { index }
      });
    });

    asArray(loadRawByKey(LISTS_KEY, []))
      .filter((list) => !list?.deletedAt)
      .forEach((list) => {
        const refId = asText(list?.id, "");
        if (!refId) return;
        out.push({
          id: `list_${refId}`,
          title: asText(list?.title, "Liste"),
          type: "list",
          source: "aha_lists",
          refId,
          meta: {}
        });
      });

    asArray(loadRawByKey(NOTES_KEY, []))
      .filter((note) => !note?.deleted_at)
      .forEach((note) => {
        const refId = asText(note?.id, "");
        if (!refId) return;
        out.push({
          id: `note_${refId}`,
          title: asText(note?.title, "Notat"),
          type: "note",
          source: "aha_notes",
          refId,
          meta: {}
        });
      });

    return out;
  }

  function render() {
    const paths = loadPaths().filter((path) => !path.deletedAt);
    const groups = global.AHAGroups?.getActiveGroups ? asArray(global.AHAGroups.getActiveGroups()) : [];
    const availableItems = collectAvailablePathItems();

    const pathsCount = document.getElementById("paths-count");
    const stepsCount = document.getElementById("path-steps-count");
    const mount = document.getElementById("paths-list");

    if (pathsCount) pathsCount.textContent = String(paths.length);
    if (stepsCount) stepsCount.textContent = String(paths.reduce((sum, path) => sum + path.steps.length, 0));
    if (!mount) return;

    if (!paths.length) {
      mount.innerHTML = '<article class="aha-panel"><p>Ingen stier ennå. Lag din første sti over.</p></article>';
      return;
    }

    mount.innerHTML = paths.map((path) => {
      const tagsHtml = path.tags.map((tag) => `<span class="aha-path-badge">${escapeHtml(tag)}</span>`).join("");
      const options = availableItems.map((item) => (
        `<option value="${escapeHtml(item.source)}::${escapeHtml(item.refId)}::${escapeHtml(item.type)}::${escapeHtml(item.title)}">${escapeHtml(item.title)} (${escapeHtml(item.type)})</option>`
      )).join("");

      const stepsHtml = path.steps.length
        ? path.steps.slice().sort((a, b) => a.order - b.order).map((step) => `
          <li class="aha-path-step-row">
            <div>
              <strong>${escapeHtml(step.title)}</strong>
              <div class="module-meta">#${step.order + 1} · ${escapeHtml(step.type)} · ${escapeHtml(step.source)} · ref: ${escapeHtml(step.refId)} · ${escapeHtml(step.status)}</div>
            </div>
            <button type="button" data-step-remove="${escapeHtml(path.id)}::${escapeHtml(step.id)}">Fjern</button>
          </li>
        `).join("")
        : "<li>Ingen steg i stien ennå.</li>";

      return `
        <article class="aha-panel aha-path-card">
          <div class="aha-path-header">
            <h3>${escapeHtml(path.title)}</h3>
            <button type="button" data-path-delete="${escapeHtml(path.id)}">Slett sti</button>
          </div>
          <p>${escapeHtml(path.description || "Ingen beskrivelse")}</p>
          <div class="aha-path-meta">
            <span class="aha-path-badge">Type: ${escapeHtml(path.type)}</span>
            <span class="aha-path-badge">Steg: ${path.steps.length}</span>
            <span class="aha-path-badge">Opprettet: ${escapeHtml(path.createdAt)}</span>
            <span class="aha-path-badge">Oppdatert: ${escapeHtml(path.updatedAt)}</span>
            ${tagsHtml}
          </div>
          <div class="aha-path-add-row">
            <select data-path-select="${escapeHtml(path.id)}">
              <option value="">Velg innsikt, liste eller notat</option>
              ${options}
            </select>
            <button type="button" data-step-add="${escapeHtml(path.id)}">Legg til steg</button>
          </div>
          <div class="aha-path-add-row">
            ${groups.length ? `
            <select class="gruppe-select" data-path-group-select="${escapeHtml(path.id)}">
              <option value="">Velg gruppe</option>
              ${groups.map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.title)}</option>`).join("")}
            </select>
            <button type="button" class="gruppe-knapp" data-path-add-group="${escapeHtml(path.id)}">Legg sti i gruppe</button>
            <div class="statuslinje" data-path-group-status="${escapeHtml(path.id)}"></div>
            ` : `<p class="statuslinje">Ingen grupper ennå. <a href="groups.html">Lag en gruppe først.</a></p>`}
          </div>
          <ul class="aha-path-steps">${stepsHtml}</ul>
        </article>
      `;
    }).join("");
  }

  function refresh() {
    render();
  }

  function bind() {
    document.getElementById("paths-refresh")?.addEventListener("click", refresh);

    document.getElementById("path-create-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const title = document.getElementById("path-title")?.value || "";
      const type = document.getElementById("path-type")?.value || "learning";
      const description = document.getElementById("path-description")?.value || "";
      const tags = document.getElementById("path-tags")?.value || "";
      const created = createPath({ title, type, description, tags });
      if (!created) return;
      event.target.reset();
      refresh();
    });

    document.getElementById("paths-list")?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const pathDelete = target.dataset.pathDelete;
      if (pathDelete) {
        deletePath(pathDelete);
        refresh();
        return;
      }

      const stepAdd = target.dataset.stepAdd;
      if (stepAdd) {
        const select = document.querySelector(`[data-path-select="${CSS.escape(stepAdd)}"]`);
        if (!(select instanceof HTMLSelectElement) || !select.value) return;
        const [source, refId, type, title] = select.value.split("::");
        if (!source || !refId) return;
        addStepToPath(stepAdd, { source, refId, type, title });
        refresh();
        return;
      }

      const stepRemove = target.dataset.stepRemove;
      const addGroupPath = target.dataset.pathAddGroup;
      if (addGroupPath) {
        const card = target.closest(".aha-path-card") || target.closest("article");
        const groupSelect = card?.querySelector("[data-path-group-select]");
        const groupStatus = card?.querySelector("[data-path-group-status]");
        if (!(groupSelect instanceof HTMLSelectElement) || !(groupStatus instanceof HTMLElement)) return;
        if (!groupSelect.value) { groupStatus.textContent = "Velg en gruppe først"; return; }
        const currentPath = loadPaths().find((path) => path.id === addGroupPath && !path.deletedAt);
        if (!currentPath || !global.AHAGroups?.addReferenceToGroupByObject) return;
        const result = global.AHAGroups.addReferenceToGroupByObject(groupSelect.value, {
          title: currentPath.title,
          type: "path",
          source: "aha_paths",
          refId: currentPath.id
        });
        groupStatus.textContent = result?.references ? "Finnes allerede i gruppen" : (result ? "Lagt i gruppe" : "Kunne ikke legge til i gruppe.");
        return;
      }
      if (!stepRemove) return;
      const [pathId, stepId] = stepRemove.split("::");
      if (!pathId || !stepId) return;
      removeStepFromPath(pathId, stepId);
      refresh();
    });
  }

  global.AHAPaths = {
    loadPaths,
    savePaths,
    createPath,
    updatePath,
    deletePath,
    addStepToPath,
    removeStepFromPath,
    collectAvailablePathItems,
    render,
    refresh
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      bind();
      render();
    });
  } else {
    bind();
    render();
  }
})(window);
