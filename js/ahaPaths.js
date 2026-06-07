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
  let selectedPathId = "";

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
    const fallbackId = asText(step?.id || step?.key || step?.slug, uid("path_step"));

    return {
      id: fallbackId,
      title: asText(step?.title || step?.name || step?.label || step?.key || step?.slug || step?.id, `Step ${index + 1}`),
      type: asText(step?.type || step?.category, "reference"),
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
    const stepSource = asArray(path?.steps).length ? path?.steps : (asArray(path?.sequence).length ? path?.sequence : (asArray(path?.items).length ? path?.items : path?.nodes));
    const rawSteps = asArray(stepSource).map((step, index) => normalizeStep(step, index));
    const sortedSteps = rawSteps.slice().sort((a, b) => a.order - b.order).map((step, index) => ({ ...step, order: index }));

    return {
      id: asText(path?.id, uid("path")),
      title: asText(path?.title, "Uten navn"),
      type,
      category: asText(path?.category, ""),
      status: asText(path?.status, "Local"),
      description: asText(path?.description || path?.summary, ""),
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

  async function persistPath(path) {
    if (!global.AHARepository?.savePath) return null;
    try {
      return await global.AHARepository.savePath(path);
    } catch (error) {
      return { ok: false, error };
    }
  }

  function pathActionTime(path) {
    return [
      path?.deletedAt,
      path?.deleted_at,
      path?.updatedAt,
      path?.updated_at,
      path?.createdAt,
      path?.created_at
    ].reduce((newest, value) => {
      const time = Date.parse(value || "");
      return Number.isFinite(time) && time > newest ? time : newest;
    }, 0);
  }

  function normalizeRemotePath(remote) {
    return normalizePath({
      id: remote?.id,
      title: remote?.title,
      type: remote?.type,
      description: remote?.description || remote?.summary,
      category: remote?.category,
      status: remote?.status,
      tags: remote?.tags,
      steps: asArray(remote?.steps || remote?.sequence || remote?.items || remote?.nodes).map((step, index) => normalizeStep(step, index)),
      source: remote?.source,
      meta: remote?.meta,
      createdAt: remote?.createdAt || remote?.created_at,
      updatedAt: remote?.updatedAt || remote?.updated_at,
      deletedAt: remote?.deletedAt || remote?.deleted_at
    });
  }

  function mergePaths(localPaths, remotePaths) {
    const merged = new Map();

    asArray(localPaths).map((path) => normalizePath(path)).forEach((path) => {
      merged.set(path.id, path);
    });

    asArray(remotePaths).map((path) => normalizePath(path)).forEach((incoming) => {
      const existing = merged.get(incoming.id);
      if (!existing || pathActionTime(incoming) >= pathActionTime(existing)) {
        merged.set(incoming.id, incoming);
      }
    });

    return Array.from(merged.values()).sort((a, b) => pathActionTime(b) - pathActionTime(a));
  }

  async function pushLocalToDatabase(paths) {
    try {
      const savePath = global.AHARepository?.savePath;
      if (!savePath) return null;
      return await Promise.allSettled(asArray(paths).map((path) => savePath.call(global.AHARepository, path)));
    } catch (error) {
      return { ok: false, error };
    }
  }

  async function syncFromDatabase() {
    const localPaths = loadPaths();
    if (localPaths.length) await pushLocalToDatabase(localPaths);

    let loadPathsFromRepository;
    try {
      loadPathsFromRepository = global.AHARepository?.loadPaths;
    } catch (error) {
      return { ok: false, error, fallback: "localStorage", data: localPaths };
    }
    if (!loadPathsFromRepository) {
      return { ok: false, fallback: "localStorage", data: localPaths };
    }

    let result;
    try {
      result = await loadPathsFromRepository.call(global.AHARepository);
    } catch (error) {
      return { ok: false, error, fallback: "localStorage", data: localPaths };
    }

    if (!result?.ok) return result || { ok: false };
    if (!Array.isArray(result.data)) {
      return { ...result, ok: false, fallback: "localStorage", data: localPaths };
    }

    const remotePaths = result.data.map((path) => normalizeRemotePath(path));
    const merged = mergePaths(localPaths, remotePaths);
    savePaths(merged);
    render();
    return { ...result, data: merged, merged: true };
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
    persistPath(created);
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
    persistPath(updated);
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
    persistPath(paths[index]);
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
    persistPath(paths[index]);
    return path;
  }

  function formatDate(value) {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return "Date unavailable";
    return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(time));
  }

  function pathStatusLabel(path) {
    return asText(path?.status, "Local");
  }

  function isDeletedRecord(record) {
    return Boolean(record?.deletedAt || record?.deleted_at);
  }

  function renderStepCount(count) {
    return `${count} ${count === 1 ? "step" : "steps"}`;
  }

  function renderOverviewCard(path, isSelected) {
    const category = path.category || path.type;
    return `
      <article class="aha-panel aha-path-overview-card${isSelected ? " is-selected" : ""}" data-path-card="${escapeHtml(path.id)}">
        <div class="aha-path-header">
          <div>
            <p class="aha-path-card-kicker">${escapeHtml(pathStatusLabel(path))} path</p>
            <h3>${escapeHtml(path.title)}</h3>
          </div>
          <span class="aha-path-badge">${renderStepCount(path.steps.length)}</span>
        </div>
        <p class="aha-path-summary">${escapeHtml(path.description || "No description yet.")}</p>
        <div class="aha-path-meta" aria-label="Path metadata">
          <span>${escapeHtml(category)}</span>
          <span>Updated ${escapeHtml(formatDate(path.updatedAt || path.createdAt))}</span>
        </div>
        <button type="button" class="aha-tile-btn${isSelected ? " aha-tile-btn-primary" : ""}" data-path-select-preview="${escapeHtml(path.id)}" aria-pressed="${isSelected ? "true" : "false"}">
          ${isSelected ? "Selected" : "View details"}
        </button>
      </article>`;
  }

  function renderSelectedPreview(path, availableItems, groups) {
    if (!path) {
      return `<aside class="aha-panel aha-path-preview aha-path-preview-empty" aria-label="Path preview">
        <p class="eyebrow">Path preview</p>
        <h2>Select a path</h2>
        <p>Choose a path from the overview to see sequence and metadata.</p>
      </aside>`;
    }

    const options = availableItems.map((item) => (
      `<option value="${escapeHtml(item.source)}::${escapeHtml(item.refId)}::${escapeHtml(item.type)}::${escapeHtml(item.title)}">${escapeHtml(item.title)} (${escapeHtml(item.type)})</option>`
    )).join("");
    const visibleSteps = path.steps.slice().sort((a, b) => a.order - b.order).slice(0, 5);
    const stepsHtml = visibleSteps.length
      ? visibleSteps.map((step) => `
        <li class="aha-path-step-row">
          <div>
            <strong>${escapeHtml(step.title)}</strong>
            <div class="module-meta">#${step.order + 1} · ${escapeHtml(step.type)} · ${escapeHtml(step.status)}</div>
          </div>
          <button type="button" class="aha-tile-btn" data-step-remove="${escapeHtml(path.id)}::${escapeHtml(step.id)}" aria-label="Remove ${escapeHtml(step.title)} from ${escapeHtml(path.title)}">Remove</button>
        </li>`).join("")
      : `<li class="aha-path-preview-empty-step">No steps available.</li>`;
    const remainingCount = Math.max(0, path.steps.length - visibleSteps.length);

    return `<aside class="aha-panel aha-path-preview" aria-labelledby="path-preview-title">
      <div class="aha-path-header">
        <div>
          <p class="eyebrow">Path preview</p>
          <h2 id="path-preview-title" tabindex="-1">${escapeHtml(path.title)}</h2>
        </div>
        <button type="button" class="aha-tile-btn" data-path-preview-close aria-label="Close path preview">Close</button>
      </div>
      <p>${escapeHtml(path.description || "No description yet.")}</p>
      <div class="aha-path-meta" aria-label="Selected path metadata">
        <span class="aha-path-badge">${escapeHtml(pathStatusLabel(path))}</span>
        <span class="aha-path-badge">${renderStepCount(path.steps.length)}</span>
        <span>${escapeHtml(path.category || path.type)}</span>
        <span>Created ${escapeHtml(formatDate(path.createdAt))}</span>
        <span>Updated ${escapeHtml(formatDate(path.updatedAt || path.createdAt))}</span>
      </div>
      <section aria-labelledby="path-preview-steps-title">
        <h3 id="path-preview-steps-title">Sequence</h3>
        <ol class="aha-path-steps">${stepsHtml}</ol>
        ${remainingCount ? `<p class="module-meta">${remainingCount} more ${remainingCount === 1 ? "step" : "steps"} not shown in this preview.</p>` : ""}
      </section>
      <details class="aha-path-manage">
        <summary>Manage path</summary>
        <div class="aha-path-manage-content">
          <div class="aha-path-add-row">
            <select data-path-select="${escapeHtml(path.id)}" aria-label="Choose an AHA item to add to ${escapeHtml(path.title)}">
              <option value="">Choose an insight, list, or note</option>
              ${options}
            </select>
            <button type="button" data-step-add="${escapeHtml(path.id)}">Add step</button>
          </div>
          <div class="aha-path-add-row">
            ${groups.length ? `
            <select class="gruppe-select" data-path-group-select="${escapeHtml(path.id)}" aria-label="Choose a group for ${escapeHtml(path.title)}">
              <option value="">Choose a group</option>
              ${groups.map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.title)}</option>`).join("")}
            </select>
            <button type="button" class="gruppe-knapp" data-path-add-group="${escapeHtml(path.id)}">Add path to group</button>
            <div class="statuslinje" data-path-group-status="${escapeHtml(path.id)}" aria-live="polite"></div>
            ` : `<p class="statuslinje">No groups yet. <a href="groups.html">Create a group first.</a></p>`}
          </div>
          <button type="button" class="aha-path-delete" data-path-delete="${escapeHtml(path.id)}">Delete path</button>
        </div>
      </details>
    </aside>`;
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
      .filter((list) => !list?.deletedAt && !list?.deleted_at)
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

  function renderContent() {
    const rawDataset = localStorage.getItem(PATHS_KEY);
    const datasetExists = rawDataset !== null;
    if (datasetExists) JSON.parse(rawDataset);
    const paths = loadPaths()
      .filter((path) => !isDeletedRecord(path))
      .sort((a, b) => pathActionTime(b) - pathActionTime(a));
    const groups = global.AHAGroups?.getActiveGroups ? asArray(global.AHAGroups.getActiveGroups()) : [];
    const availableItems = collectAvailablePathItems();

    const pathsCount = document.getElementById("paths-count");
    const stepsCount = document.getElementById("path-steps-count");
    const mount = document.getElementById("paths-list");

    if (pathsCount) pathsCount.textContent = String(paths.length);
    if (stepsCount) stepsCount.textContent = String(paths.reduce((sum, path) => sum + path.steps.length, 0));
    if (!mount) return;

    global.AHAModules?.updatePageHealth?.("paths", global.AHAModules.localPageHealth({
      count: paths.length,
      datasetExists
    }));

    if (!paths.length) {
      selectedPathId = "";
      mount.innerHTML = global.AHAModules.buildModuleEmptyState({
        type: "no_data",
        moduleId: "paths",
        message: "Paths will appear here when available.",
        hint: "Use Create path above when you are ready."
      });
      return;
    }

    const selected = paths.find((path) => path.id === selectedPathId) || null;
    mount.innerHTML = `<div class="aha-paths-workspace">
      <section class="aha-path-overview" aria-labelledby="paths-overview-title">
        <div class="aha-path-section-heading">
          <div>
            <p class="eyebrow">Overview</p>
            <h2 id="paths-overview-title">Your paths</h2>
          </div>
          <span>${paths.length} ${paths.length === 1 ? "path" : "paths"}</span>
        </div>
        <div class="aha-path-overview-grid">
          ${paths.map((path) => renderOverviewCard(path, path.id === selectedPathId)).join("")}
        </div>
      </section>
      ${renderSelectedPreview(selected, availableItems, groups)}
    </div>`;
  }

  function render() {
    try {
      renderContent();
    } catch {
      selectedPathId = "";
      const mount = document.getElementById("paths-list");
      if (mount) mount.innerHTML = global.AHAModules.buildModuleEmptyState({ type: "read_error", moduleId: "paths", title: "Could not read path data.", message: "Try refreshing the page." });
      global.AHAModules?.updatePageHealth?.("paths", global.AHAModules.localPageHealth({ error: true }));
    }
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

      const previewPayload = target.dataset.pathSelectPreview;
      if (previewPayload) {
        selectedPathId = previewPayload;
        render();
        document.getElementById("path-preview-title")?.focus?.();
        return;
      }

      if (target.hasAttribute("data-path-preview-close")) {
        selectedPathId = "";
        render();
        return;
      }

      const pathDelete = target.dataset.pathDelete;
      if (pathDelete) {
        deletePath(pathDelete);
        if (selectedPathId === pathDelete) selectedPathId = "";
        refresh();
        return;
      }

      const stepAdd = target.dataset.stepAdd;
      if (stepAdd) {
        const escapedStepId = global.CSS?.escape ? global.CSS.escape(stepAdd) : stepAdd.replace(/"/g, '\"');
        const select = document.querySelector(`[data-path-select="${escapedStepId}"]`);
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
        const card = target.closest(".aha-path-preview") || target.closest("article");
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
    syncFromDatabase,
    collectAvailablePathItems,
    selectPath(id) {
      selectedPathId = asText(id, "");
      render();
    },
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
