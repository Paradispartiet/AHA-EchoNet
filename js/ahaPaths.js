// ahaPaths.js
// Fase 3D: første fungerende AHA-stier modul (localStorage-first).

(function (global) {
  "use strict";

  const PATHS_KEY = "aha_paths_v1";
  const INSIGHTS_KEY = "aha_insight_chamber_v1";
  const LISTS_KEY = "aha_lists_v1";
  const CONCEPT_LISTS_KEY = "aha_concept_lists_v1";
  const NOTES_KEY = "aha_notes_v1";

  const ALLOWED_PATH_TYPES = ["learning", "process", "project", "habit", "reading", "historygo", "publishing"];
  const ALLOWED_STEP_STATUS = ["planned", "active", "done", "skipped"];
  const ALLOWED_STEP_SOURCES = ["aha_insights", "aha_lists", "aha_concept_lists", "aha_notes", "aha_analysis", "aha_projection_v2"];
  const ALLOWED_PATH_MODES = ["learning", "narrative", "process"];
  let selectedPathId = "";
  const projectionReceipts = new Map();

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
      narrative: asText(step?.narrative || step?.explanation || step?.transition, ""),
      learningOutcome: asText(step?.learningOutcome || step?.learning_outcome || step?.outcome, ""),
      addedAt: step?.addedAt || step?.added_at || now,
      meta: step && typeof step.meta === "object" && !Array.isArray(step.meta) ? step.meta : {}
    };
  }

  function normalizePath(path) {
    const now = new Date().toISOString();
    const type = ALLOWED_PATH_TYPES.includes(path?.type) ? path.type : "learning";
    const inferredMode = type === "historygo" ? "narrative" : (["learning", "reading"].includes(type) ? "learning" : "process");
    const mode = ALLOWED_PATH_MODES.includes(path?.mode) ? path.mode : inferredMode;
    const tags = global.AHAContracts?.normalizeTags ? global.AHAContracts.normalizeTags(path?.tags) : asArray(path?.tags);
    const stepSource = asArray(path?.steps).length ? path?.steps : (asArray(path?.sequence).length ? path?.sequence : (asArray(path?.items).length ? path?.items : path?.nodes));
    const rawSteps = asArray(stepSource).map((step, index) => normalizeStep(step, index));
    const sortedSteps = rawSteps.slice().sort((a, b) => a.order - b.order).map((step, index) => ({ ...step, order: index }));

    return {
      id: asText(path?.id, uid("path")),
      title: asText(path?.title, "Uten navn"),
      type,
      mode,
      category: asText(path?.category, ""),
      status: asText(path?.status, "Local"),
      description: asText(path?.description || path?.summary, ""),
      goal: asText(path?.goal || path?.purpose, ""),
      learningOutcome: asText(path?.learningOutcome || path?.learning_outcome || path?.outcome, ""),
      createdAt: path?.createdAt || path?.created_at || now,
      updatedAt: path?.updatedAt || path?.updated_at || now,
      tags,
      steps: sortedSteps,
      source: asText(path?.source, "aha_paths"),
      local_only: path?.local_only !== false,
      published_external: path?.published_external === true,
      echonet_shared: path?.echonet_shared === true,
      sync_enabled: path?.sync_enabled === true,
      meta: {
        ...(path && typeof path.meta === "object" && !Array.isArray(path.meta) ? path.meta : {}),
        local_only: path?.meta?.local_only === false ? false : true,
        published_external: path?.meta?.published_external === true,
        echonet_shared: path?.meta?.echonet_shared === true,
        sync_enabled: path?.meta?.sync_enabled === true,
        automation_enabled: path?.meta?.automation_enabled === true
      },
      deletedAt: path?.deletedAt || path?.deleted_at || ""
    };
  }

  function isDatabaseSyncEnabled() {
    return global.AHA_CONFIG?.paths?.enableDatabaseSync === true;
  }

  function isUnavailableRecord(record) {
    return Boolean(record?.deletedAt || record?.deleted_at || record?.archived === true);
  }

  function loadPaths() {
    return asArray(loadRawByKey(PATHS_KEY, [])).map((path) => normalizePath(path));
  }

  function savePaths(paths) {
    localStorage.setItem(PATHS_KEY, JSON.stringify(asArray(paths)));
    return asArray(paths);
  }

  async function persistPath(path) {
    if (["aha_analysis_artifacts_v1", "aha_projection_materializer_v2"].includes(path?.meta?.createdBy)) {
      return { ok: false, fallback: "localOnly", generated_artifact_local_only: true };
    }
    if (!isDatabaseSyncEnabled()) {
      return { ok: false, fallback: "localOnly", database_sync_disabled: true };
    }
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
      mode: remote?.mode,
      goal: remote?.goal || remote?.purpose,
      learningOutcome: remote?.learningOutcome || remote?.learning_outcome || remote?.outcome,
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
    if (!isDatabaseSyncEnabled()) {
      return { ok: false, fallback: "localOnly", database_sync_disabled: true };
    }
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
    if (!isDatabaseSyncEnabled()) {
      return { ok: false, fallback: "localOnly", database_sync_disabled: true, data: localPaths };
    }
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
      mode: input?.mode,
      description: asText(input?.description, ""),
      goal: asText(input?.goal, ""),
      learningOutcome: asText(input?.learningOutcome, ""),
      createdAt: now,
      updatedAt: now,
      tags: input?.tags,
      steps: asArray(input?.steps),
      source: "aha_paths",
      local_only: true,
      published_external: false,
      echonet_shared: false,
      sync_enabled: false,
      meta: {
        ...(input && typeof input.meta === "object" && !Array.isArray(input.meta) ? input.meta : {}),
        createdBy: asText(input?.meta?.createdBy, "paths_ui"),
        local_only: true,
        published_external: false,
        echonet_shared: false,
        sync_enabled: false,
        automation_enabled: false
      }
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
    const index = paths.findIndex((path) => path.id === pathId && !isUnavailableRecord(path));
    if (index < 0) return { ok: false, reason: "path_not_found" };

    const path = paths[index];
    const validation = validatePathStepReference(stepInput);
    if (!validation.ok) return { ok: false, reason: "invalid_reference", detail: validation.reason };
    const { source, refId, title, type } = validation.item;

    const duplicate = path.steps.some((step) => step.source === source && step.refId === refId);
    if (duplicate) return { ok: false, reason: "duplicate", path };

    const step = normalizeStep({
      id: uid("path_step"),
      title,
      type,
      source,
      refId,
      order: path.steps.length,
      status: "planned",
      narrative: asText(stepInput?.narrative, ""),
      learningOutcome: asText(stepInput?.learningOutcome, ""),
      addedAt: new Date().toISOString(),
      meta: stepInput?.meta || {}
    }, path.steps.length);

    path.steps.push(step);
    path.updatedAt = new Date().toISOString();
    paths[index] = normalizePath(path);
    savePaths(paths);
    persistPath(paths[index]);
    return { ok: true, step, path: paths[index] };
  }

  function updatePathStep(pathId, stepId, changes) {
    const paths = loadPaths();
    const pathIndex = paths.findIndex((path) => path.id === pathId && !isUnavailableRecord(path));
    if (pathIndex < 0) return null;
    const stepIndex = paths[pathIndex].steps.findIndex((step) => step.id === stepId);
    if (stepIndex < 0) return null;
    const current = paths[pathIndex].steps[stepIndex];
    paths[pathIndex].steps[stepIndex] = normalizeStep({
      ...current,
      narrative: changes?.narrative !== undefined ? changes.narrative : current.narrative,
      learningOutcome: changes?.learningOutcome !== undefined ? changes.learningOutcome : current.learningOutcome,
      status: changes?.status !== undefined ? changes.status : current.status,
      id: current.id,
      order: current.order
    }, current.order);
    paths[pathIndex].updatedAt = new Date().toISOString();
    paths[pathIndex] = normalizePath(paths[pathIndex]);
    savePaths(paths);
    persistPath(paths[pathIndex]);
    return paths[pathIndex];
  }

  function removeStepFromPath(pathId, stepId) {
    const paths = loadPaths();
    const index = paths.findIndex((path) => path.id === pathId && !isUnavailableRecord(path));
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


  function renderStepCount(count) {
    return `${count} ${count === 1 ? "steg" : "steg"}`;
  }

  function renderOverviewCard(path, isSelected) {
    const category = path.category || path.type;
    return `
      <article class="aha-panel aha-path-overview-card${isSelected ? " is-selected" : ""}" data-path-card="${escapeHtml(path.id)}">
        <div class="aha-path-header">
          <div>
            <p class="aha-path-card-kicker">${escapeHtml(path.mode === "narrative" ? "Narrativ sti" : path.mode === "process" ? "Arbeidsforløp" : "Læringssti")}</p>
            <h3>${escapeHtml(path.title)}</h3>
          </div>
          <span class="aha-path-badge">${renderStepCount(path.steps.length)}</span>
        </div>
        <p class="aha-path-summary">${escapeHtml(path.description || path.goal || "Ingen innledning ennå.")}</p>
        <div class="aha-path-meta" aria-label="Path metadata">
          <span>${escapeHtml(category)}</span>
          <span>Updated ${escapeHtml(formatDate(path.updatedAt || path.createdAt))}</span>
        </div>
        <button type="button" class="aha-tile-btn${isSelected ? " aha-tile-btn-primary" : ""}" data-path-select-preview="${escapeHtml(path.id)}" aria-pressed="${isSelected ? "true" : "false"}">
          ${isSelected ? "Valgt" : "Følg stien"}
        </button>
      </article>`;
  }

  function projectionStageLabel(stage) {
    return {
      orientation: "Orientering",
      claim_evidence: "Påstand og belegg",
      tension_counterexample: "Spenning eller moteksempel",
      uncertainty: "Usikkerhet",
      synthesis_next_inquiry: "Syntese og neste undersøkelse",
      comparison: "Sammenligning",
      synthesis: "Syntese og neste spørsmål"
    }[stage] || "Undersøkelse";
  }

  function renderProjectionPathPreviews() {
    const shell = document.getElementById("v2-path-preview-shell");
    const mount = document.getElementById("v2-path-previews");
    if (!shell || !mount) return;
    const model = global.AHAProjectionRuntimeSourceV2?.build?.();
    const candidates = model?.status === "ready" && model?.validation?.valid === true
      ? asArray(model?.surfaces?.paths)
      : [];
    shell.hidden = candidates.length === 0;
    if (!candidates.length) {
      mount.replaceChildren();
      return;
    }
    mount.innerHTML = candidates.map((path) => {
      const score = Number(path?.quality?.score);
      const quality = Number.isFinite(score) ? `${Math.round(score * 100)} % kvalitetsport` : "Kvalitetsgodkjent";
      const undoAvailable = global.AHAProjectionMaterializerV2?.canUndoMaterialized?.({ artifact_type: "path", artifact_id: path.id, projection_id: model.projection_id }) === true;
      const steps = asArray(path.steps).slice().sort((a, b) => a.order - b.order).map((step) => `<li class="aha-v2-path-step">
        <span>${step.order + 1}</span><div><small>${escapeHtml(projectionStageLabel(step.meta?.stage))}</small><strong>${escapeHtml(step.title)}</strong><p>${escapeHtml(step.narrative)}</p><p class="aha-path-step-outcome"><strong>Læringspunkt:</strong> ${escapeHtml(step.learningOutcome)}</p></div>
      </li>`).join("");
      return `<article class="aha-v2-path-preview-card" data-v2-path-preview="${escapeHtml(path.id)}">
        <div class="aha-path-header"><div><p class="aha-path-card-kicker">Semantisk læringssti</p><h3>${escapeHtml(path.title)}</h3></div><span class="aha-path-badge">${renderStepCount(path.steps.length)}</span></div>
        <p>${escapeHtml(path.description)}</p>
        <p class="aha-path-goal"><strong>Mål:</strong> ${escapeHtml(path.goal)}</p>
        <ol class="aha-v2-path-steps">${steps}</ol>
        <div class="aha-path-meta"><span>${escapeHtml(quality)}</span><span>Ikke lagret</span><span>Read-only</span></div>
        <div class="aha-v2-materialize-actions">
          <button type="button" class="aha-tile-btn aha-tile-btn-primary" data-v2-path-materialize="${escapeHtml(path.id)}">Lagre som min sti</button>
          <button type="button" class="aha-tile-btn" data-v2-path-undo="${escapeHtml(path.id)}"${undoAvailable ? "" : " hidden"}>Angre lagring</button>
          <span class="module-meta" data-v2-path-materialize-status="${escapeHtml(path.id)}" aria-live="polite">Krever et eksplisitt klikk og lagres bare lokalt.</span>
        </div>
      </article>`;
    }).join("");
  }

  function renderSelectedPreview(path, availableItems, groups) {
    if (!path) {
      return `<aside class="aha-panel aha-path-preview aha-path-preview-empty" aria-label="Path preview">
        <p class="eyebrow">Kunnskapssti</p>
        <h2>Velg en sti</h2>
        <p>Velg en sti for å følge fortellingen eller læringsforløpet steg for steg.</p>
      </aside>`;
    }

    const options = availableItems.map((item) => (
      `<option value="${escapeHtml(item.source)}::${escapeHtml(item.refId)}::${escapeHtml(item.type)}::${escapeHtml(item.title)}">${escapeHtml(item.title)} (${escapeHtml(item.type)})</option>`
    )).join("");
    const visibleSteps = path.steps.slice().sort((a, b) => a.order - b.order);
    const stepsHtml = visibleSteps.length
      ? visibleSteps.map((step) => `
        <li class="aha-path-step-row">
          <span class="aha-path-step-number" aria-hidden="true">${step.order + 1}</span>
          <div class="aha-path-step-content">
            <strong>${escapeHtml(step.title)}</strong>
            <div class="module-meta">${escapeHtml(step.type)} · ${escapeHtml(step.status)}${buildAvailableStepIndex(availableItems).has(`${step.source}::${step.refId}`) ? "" : " · ikke lenger tilgjengelig"}</div>
            ${step.narrative ? `<p class="aha-path-step-narrative">${escapeHtml(step.narrative)}</p>` : `<p class="aha-path-step-narrative module-meta">Legg til hvorfor dette steget kommer her.</p>`}
            ${step.learningOutcome ? `<p class="aha-path-step-outcome"><strong>Læringspunkt:</strong> ${escapeHtml(step.learningOutcome)}</p>` : ""}
            <details class="aha-path-step-fields"><summary>Rediger forklaring</summary>
              <label>Fortelling eller overgang<textarea data-step-narrative="${escapeHtml(path.id)}::${escapeHtml(step.id)}" rows="2">${escapeHtml(step.narrative)}</textarea></label>
              <label>Læringspunkt<input data-step-outcome="${escapeHtml(path.id)}::${escapeHtml(step.id)}" value="${escapeHtml(step.learningOutcome)}" /></label>
              <button type="button" data-step-save="${escapeHtml(path.id)}::${escapeHtml(step.id)}">Lagre stegtekst</button>
            </details>
            <button type="button" class="aha-tile-btn" data-step-remove="${escapeHtml(path.id)}::${escapeHtml(step.id)}" aria-label="Fjern ${escapeHtml(step.title)} fra ${escapeHtml(path.title)}">Fjern steg</button>
          </div>
        </li>`).join("")
      : `<li class="aha-path-preview-empty-step">Ingen steg ennå. Legg til første innsikt, begrepsliste, samling eller notat.</li>`;

    return `<aside class="aha-panel aha-path-preview" aria-labelledby="path-preview-title">
      <div class="aha-path-header">
        <div>
          <p class="eyebrow">${escapeHtml(path.mode === "narrative" ? "Narrativ kunnskapssti" : path.mode === "process" ? "Arbeidsforløp" : "Læringssti")}</p>
          <h2 id="path-preview-title" tabindex="-1">${escapeHtml(path.title)}</h2>
        </div>
        <button type="button" class="aha-tile-btn" data-path-preview-close aria-label="Lukk kunnskapssti">Lukk</button>
      </div>
      <p>${escapeHtml(path.description || "Ingen innledning ennå.")}</p>
      ${path.goal ? `<p class="aha-path-goal"><strong>Mål:</strong> ${escapeHtml(path.goal)}</p>` : ""}
      ${path.learningOutcome ? `<p class="aha-path-goal aha-path-outcome"><strong>Etter stien:</strong> ${escapeHtml(path.learningOutcome)}</p>` : ""}
      <div class="aha-path-meta" aria-label="Selected path metadata">
        <span class="aha-path-badge">${escapeHtml(pathStatusLabel(path))}</span>
        <span class="aha-path-badge">${renderStepCount(path.steps.length)}</span>
        <span>${escapeHtml(path.category || path.type)}</span>
        <span>Created ${escapeHtml(formatDate(path.createdAt))}</span>
        <span>Updated ${escapeHtml(formatDate(path.updatedAt || path.createdAt))}</span>
      </div>
      <section aria-labelledby="path-preview-steps-title">
        <h3 id="path-preview-steps-title">Fortelling og læringstrinn</h3>
        <ol class="aha-path-steps aha-path-story">${stepsHtml}</ol>
      </section>
      <details class="aha-path-manage">
        <summary>Legg til neste steg</summary>
        <div class="aha-path-manage-content">
          <div class="aha-path-add-row">
            <select data-path-select="${escapeHtml(path.id)}" aria-label="Choose an AHA item to add to ${escapeHtml(path.title)}">
              <option value="">Velg innsikt, begrepsliste, samling eller notat</option>
              ${options}
            </select>
            <button type="button" data-step-add="${escapeHtml(path.id)}">Legg til steg</button>
          </div>
          <div class="aha-path-step-fields">
            <label>Hvorfor følger dette steget?<textarea data-new-step-narrative="${escapeHtml(path.id)}" rows="2" placeholder="Forklar overgangen eller fortsett fortellingen"></textarea></label>
            <label>Hva skal brukeren forstå?<input data-new-step-outcome="${escapeHtml(path.id)}" placeholder="Kort læringspunkt" /></label>
          </div>
          <div class="statuslinje" data-path-action-status="${escapeHtml(path.id)}" aria-live="polite"></div>
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
          <button type="button" class="aha-path-delete" data-path-delete="${escapeHtml(path.id)}">Slett sti</button>
        </div>
      </details>
    </aside>`;
  }

  function collectAvailablePathItems() {
    const out = [];

    const chamber = loadRawByKey(INSIGHTS_KEY, { insights: [] });
    asArray(chamber?.insights).forEach((insight, index) => {
      if (isUnavailableRecord(insight)) return;
      const refId = asText(insight?.id, "");
      if (!refId) return;
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
      .filter((list) => !isUnavailableRecord(list))
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

    asArray(loadRawByKey(CONCEPT_LISTS_KEY, []))
      .filter((list) => !isUnavailableRecord(list))
      .forEach((list) => {
        const refId = asText(list?.id, "");
        if (!refId) return;
        out.push({
          id: `concept_list_${refId}`,
          title: asText(list?.title, "Begrepsliste"),
          type: "concept_list",
          source: "aha_concept_lists",
          refId,
          meta: {}
        });
      });

    asArray(loadRawByKey(NOTES_KEY, []))
      .filter((note) => !isUnavailableRecord(note))
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

    asArray(loadRawByKey(PATHS_KEY, []))
      .filter((path) => !isUnavailableRecord(path))
      .forEach((path) => {
        asArray(path?.steps).filter((step) => ["aha_analysis", "aha_projection_v2"].includes(step?.source)).forEach((step) => {
          const refId = asText(step?.refId || step?.ref_id, "");
          if (!refId) return;
          out.push({
            id: `${step.source === "aha_projection_v2" ? "projection" : "analysis"}_${refId}`,
            title: asText(step?.title, step.source === "aha_projection_v2" ? "V2-innsikt" : "Analysesteg"),
            type: asText(step?.type, step.source === "aha_projection_v2" ? "insight" : "analysis_step"),
            source: step.source,
            refId,
            meta: step?.meta || {}
          });
        });
      });

    return out;
  }

  function buildAvailableStepIndex(items = collectAvailablePathItems()) {
    const index = new Map();
    asArray(items).forEach((item) => {
      const source = asText(item?.source, "");
      const refId = asText(item?.refId || item?.ref_id, "");
      if (source && refId) index.set(`${source}::${refId}`, item);
    });
    return index;
  }

  function validatePathStepReference(stepInput, availableItems = collectAvailablePathItems()) {
    const source = asText(stepInput?.source, "");
    const refId = asText(stepInput?.refId || stepInput?.ref_id, "");
    if (!source) return { ok: false, reason: "missing_source" };
    if (!refId) return { ok: false, reason: "missing_refId" };
    if (!ALLOWED_STEP_SOURCES.includes(source)) return { ok: false, reason: "unknown_source" };
    if (source === "aha_projection_v2") {
      const snapshot = stepInput?.meta?.snapshot;
      if (stepInput?.meta?.inline !== true
        || stepInput?.meta?.immutable !== true
        || !asText(stepInput?.meta?.projection_id, "")
        || !asText(stepInput?.meta?.projection_artifact_id, "")
        || !asText(snapshot?.id, "")
        || !asText(snapshot?.title, "")
        || snapshot?.source !== "aha_semantic_v2") return { ok: false, reason: "incomplete_projection_snapshot" };
      return { ok: true, item: stepInput };
    }
    if (source === "aha_analysis" && stepInput?.meta?.inline === true) {
      return {
        ok: true,
        item: {
          id: `analysis_${refId}`,
          title: asText(stepInput?.title, "Analysesteg"),
          type: asText(stepInput?.type, "analysis_step"),
          source,
          refId,
          meta: stepInput.meta
        }
      };
    }
    const item = buildAvailableStepIndex(availableItems).get(`${source}::${refId}`);
    if (!item) return { ok: false, reason: "unavailable_reference" };
    if (isUnavailableRecord(item)) return { ok: false, reason: "unavailable_reference" };
    if (!asText(item.title, "") || !asText(item.type, "") || !asText(item.source, "") || !asText(item.refId, "")) {
      return { ok: false, reason: "invalid_item" };
    }
    return { ok: true, item };
  }

  function renderContent() {
    const rawDataset = localStorage.getItem(PATHS_KEY);
    const datasetExists = rawDataset !== null;
    if (datasetExists) JSON.parse(rawDataset);
    const paths = loadPaths()
      .filter((path) => !isUnavailableRecord(path))
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
        title: "Ingen stier ennå.",
        message: "Lag en kunnskapssti som gjør innsikter, begrepslister, samlinger og notater til en fortelling eller læringsreise.",
        hint: "Stien er lokal og du bestemmer selv rekkefølge, forklaringer og læringsmål."
      });
      return;
    }

    const selected = paths.find((path) => path.id === selectedPathId) || null;
    mount.innerHTML = `<div class="aha-paths-workspace">
      <section class="aha-path-overview" aria-labelledby="paths-overview-title">
        <div class="aha-path-section-heading">
          <div>
            <p class="eyebrow">Oversikt</p>
            <h2 id="paths-overview-title">Dine kunnskapsstier</h2>
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
      renderProjectionPathPreviews();
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

    document.getElementById("v2-path-previews")?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const artifactId = target.dataset.v2PathMaterialize;
      const undoId = target.dataset.v2PathUndo;
      const id = artifactId || undoId;
      if (!id) return;
      const status = document.querySelector(`[data-v2-path-materialize-status="${id}"]`);
      const undoButton = document.querySelector(`[data-v2-path-undo="${id}"]`);
      if (undoId) {
        const receipt = projectionReceipts.get(id);
        const model = global.AHAProjectionRuntimeSourceV2?.build?.();
        const result = receipt
          ? global.AHAProjectionMaterializerV2?.undo?.(receipt, { user_confirmed: true })
          : global.AHAProjectionMaterializerV2?.undoMaterialized?.({ artifact_type: "path", artifact_id: id, projection_id: model?.projection_id, user_confirmed: true });
        if (result?.ok) {
          projectionReceipts.delete(id);
          if (status instanceof HTMLElement) status.textContent = "Den lokale stien ble fjernet igjen.";
          if (undoButton instanceof HTMLElement) undoButton.hidden = true;
          renderContent();
        } else if (status instanceof HTMLElement) status.textContent = "Kunne ikke angre; stien kan ha blitt endret etter lagring.";
        return;
      }
      const model = global.AHAProjectionRuntimeSourceV2?.build?.();
      const result = global.AHAProjectionMaterializerV2?.materialize?.({
        model,
        artifact_type: "path",
        artifact_id: id,
        user_confirmed: true
      });
      if (!result?.ok) {
        if (status instanceof HTMLElement) status.textContent = "Kunne ikke lagre: forslaget besto ikke den kontrollerte write-grensen.";
        return;
      }
      if (result.receipt) projectionReceipts.set(id, result.receipt);
      if (status instanceof HTMLElement) status.textContent = result.existing ? "Stien finnes allerede lokalt." : "Stien er lagret lokalt. Ingen sync ble åpnet.";
      if (undoButton instanceof HTMLElement) undoButton.hidden = !result.receipt;
      renderContent();
    });

    document.getElementById("path-create-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const title = document.getElementById("path-title")?.value || "";
      const type = document.getElementById("path-type")?.value || "learning";
      const mode = document.getElementById("path-mode")?.value || "learning";
      const description = document.getElementById("path-description")?.value || "";
      const goal = document.getElementById("path-goal")?.value || "";
      const learningOutcome = document.getElementById("path-learning-outcome")?.value || "";
      const tags = document.getElementById("path-tags")?.value || "";
      const created = createPath({ title, type, mode, description, goal, learningOutcome, tags });
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
        const status = document.querySelector(`[data-path-action-status="${escapedStepId}"]`);
        if (!(select instanceof HTMLSelectElement) || !select.value) { if (status instanceof HTMLElement) status.textContent = "Velg et objekt først"; return; }
        const [source, refId, type, title] = select.value.split("::");
        const narrative = document.querySelector(`[data-new-step-narrative="${escapedStepId}"]`)?.value || "";
        const learningOutcome = document.querySelector(`[data-new-step-outcome="${escapedStepId}"]`)?.value || "";
        const result = addStepToPath(stepAdd, { source, refId, type, title, narrative, learningOutcome });
        if (result?.ok) { refresh(); return; }
        if (status instanceof HTMLElement) {
          status.textContent = result?.reason === "duplicate" ? "Finnes allerede i stien" : "Kilden finnes ikke lenger";
        }
        return;
      }

      const stepSave = target.dataset.stepSave;
      if (stepSave) {
        const [pathId, stepId] = stepSave.split("::");
        const selectorId = global.CSS?.escape ? global.CSS.escape(stepSave) : stepSave.replace(/"/g, '\\"');
        const narrative = document.querySelector(`[data-step-narrative="${selectorId}"]`)?.value || "";
        const learningOutcome = document.querySelector(`[data-step-outcome="${selectorId}"]`)?.value || "";
        updatePathStep(pathId, stepId, { narrative, learningOutcome });
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
        const currentPath = loadPaths().find((path) => path.id === addGroupPath && !isUnavailableRecord(path));
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
    updatePathStep,
    removeStepFromPath,
    syncFromDatabase,
    collectAvailablePathItems,
    buildAvailableStepIndex,
    validatePathStepReference,
    renderProjectionPathPreviews,
    isDatabaseSyncEnabled,
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
