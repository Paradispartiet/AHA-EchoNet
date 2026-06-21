// ahaDashboard.js

(function () {
  "use strict";

  let lastState = null;
  let isSyncHubPrepOpen = false;
  let isAhaManualSyncConfirmationModalOpen = false;
  let selectedPreviewTarget = "not_configured";
  let lastAhaManualSyncResult = null;
  let ahaManualSyncHistoryState = { status: "idle", entries: [], reason: null };
  let selectedAhaManualSyncHistoryRunId = null;

  const AHA_AUTH_RETURN_TO_KEY = "aha_auth_return_to_v1";
  const HISTORY_GO_PROFILE_URL = "https://paradispartiet.github.io/History-Go/profile.html";
  function hasHistoryGoPayload() {
    return Boolean(String(localStorage.getItem("aha_import_payload_v1") || "").trim());
  }

  function persistAuthReturnTargetFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") !== "historygo") return;

    try {
      localStorage.setItem(AHA_AUTH_RETURN_TO_KEY, HISTORY_GO_PROFILE_URL);
    } catch {}
  }

  function isHistoryGoLoginReturnRequest() {
    const params = new URLSearchParams(window.location.search);
    return params.get("source") === "historygo";
  }

  function clearAuthReturnTarget() {
    try {
      localStorage.removeItem(AHA_AUTH_RETURN_TO_KEY);
    } catch {}
  }

  function redirectBackToHistoryGoProfile() {
    clearAuthReturnTarget();
    window.location.replace(HISTORY_GO_PROFILE_URL);
  }

  function countActive(items) {
    return items.filter((item) => !item?.deleted_at).length;
  }

  function localStats() {
    const imports = readArray("aha_imports_v1").length;
    return {
      source_events: readArray("aha_source_events_v1").length,
      notes: countActive(readArray("aha_notes_v1")),
      gallery: countActive(readArray("aha_gallery_v1")),
      feed: countActive(readArray("aha_feed_posts_v1")),
      insta: countActive(readArray("aha_insta_posts_v1")),
      imports: imports + (hasHistoryGoPayload() ? 1 : 0)
    };
  }

  async function databaseStats() {
    try {
      if (!window.AHARepository?.loadDashboardCounts) return { ok: false, fallback: "missing_repository" };
      return await window.AHARepository.loadDashboardCounts();
    } catch (error) {
      console.warn("AHADashboard: databaseStats feilet", error);
      return { ok: false, fallback: "error", error };
    }
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  function setClassState(el, state) {
    if (!el) return;
    el.classList.remove("is-loading", "is-signed-in", "is-signed-out", "is-missing-profile");
    if (state) el.classList.add(state);
  }

  function formatTime(date = new Date()) {
    return date.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" });
  }

  function shortId(id) {
    const s = String(id || "").trim();
    if (!s) return "Ikke innlogget";
    return `${s.slice(0, 8)}…${s.slice(-4)}`;
  }

  function cleanName(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function initials(value) {
    const name = cleanName(value);
    if (!name) return "A";
    const parts = name.split(" ").filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || "A"}${parts[parts.length - 1][0] || "H"}`.toUpperCase();
  }

  function statValue(stats, key) {
    const value = Number(stats?.[key] || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function resolveModuleLabel(stats, key, singular, plural) {
    const value = statValue(stats, key);
    return `${value} ${value === 1 ? singular : plural}`;
  }

  function localDataSourceLabel(dbResult) {
    if (dbResult?.ok && dbResult.counts) return "Supabase";
    return "localStorage";
  }

  async function loadAuthState() {
    let user = null;
    try {
      user = await window.AHAAuth?.getUser?.();
    } catch (error) {
      console.warn("AHADashboard: kunne ikke hente innlogget bruker", error);
      return {
        user: null,
        profile: null,
        profileResult: { ok: false, reason: "auth_error", error }
      };
    }

    let profileResult = null;
    if (user?.id && window.AHAAuth?.loadProfile) {
      try {
        profileResult = await window.AHAAuth.loadProfile(user);
        if (profileResult?.reason === "missing_profile" && window.AHAAuth?.ensureProfile) {
          const ensured = await window.AHAAuth.ensureProfile();
          if (!ensured?.ok) console.warn("AHADashboard: kunne ikke opprette AHA-profil automatisk", ensured?.error || ensured?.reason || ensured);
          profileResult = await window.AHAAuth.loadProfile(user);
        }
      } catch (error) {
        console.warn("AHADashboard: kunne ikke laste AHA-profil", error);
        profileResult = { ok: false, reason: "profile_error", error };
      }
    }

    return {
      user: user || null,
      profile: profileResult?.ok ? profileResult.data : null,
      profileResult
    };
  }


  function renderModules(moduleHealth) {
    window.AHAModules?.renderMenu?.({ healthByModule: moduleHealth });
  }

  function renderProfileStats(stats, sourceLabel) {
    const historyGo = hasHistoryGoPayload() || statValue(stats, "imports") > 0;
    const mount = $("aha-profile-stats");
    if (!mount) return;

    const rows = [
      [statValue(stats, "imports"), "History Go-data"],
      [statValue(stats, "source_events"), "Innsikter"],
      [statValue(stats, "notes"), "Notater"],
      [statValue(stats, "gallery"), "Galleri"],
      [historyGo ? "Koblet til" : "Ikke koblet", "History Go"],
      [historyGo ? formatTime() : "Ingen import", "Sist importert"]
    ];

    mount.innerHTML = rows.map(([value, label]) => `
      <div class="aha-mini-stat">
        <strong>${value}</strong>
        <span>${label}</span>
      </div>
    `).join("");

    setText("aha-status-updated", `Oppdatert ${formatTime()} · ${sourceLabel}`);
  }

  function bindHistoryGoHomeTile() {
    // History Go uses the real link and button rendered in the module card.
  }

  function renderStatCards(stats, sourceLabel, authState, moduleHealth = {}) {
    const mount = $("aha-dashboard-stats");
    if (!mount) return;

    const profileReady = Boolean(authState.user && authState.profile?.display_name);
    const profileStatus = !authState.user ? "Not signed in" : profileReady ? "Profile ready" : "Profile name missing";
    const historyGoReady = hasHistoryGoPayload() || statValue(stats, "imports") > 0;
    const totalItems = ["source_events", "notes", "gallery", "feed", "insta"]
      .reduce((total, key) => total + statValue(stats, key), 0);
    const profileBlocked = Boolean(authState.user && !profileReady);
    const blockedModules = Object.entries(moduleHealth)
      .filter(([, health]) => health?.status === "blocked")
      .map(([moduleId]) => window.AHA_MODULES?.find((module) => module.id === moduleId)?.title || moduleId);
    const blockerCount = blockedModules.length + (profileBlocked ? 1 : 0);
    const dashboardBlocked = blockerCount > 0;
    const blockerSummary = blockedModules.length
      ? `${blockedModules.join(", ")} ${blockedModules.length === 1 ? "is" : "are"} blocked.`
      : profileBlocked
        ? "Profile setup needs attention."
        : "No active blockers.";

    mount.innerHTML = `
      <article class="aha-compact-status-card aha-compact-status-card-primary" aria-label="System health">
        <div class="aha-compact-status-header">
          <h3>System health</h3>
          <span class="aha-status-badge aha-status-badge-${dashboardBlocked ? "warning" : "ready"}">${dashboardBlocked ? "Needs review" : "Ready"}</span>
        </div>
        <strong class="aha-compact-status-primary">Dashboard is available</strong>
        <dl class="aha-compact-meta">
          <div><dt>Data source</dt><dd>${escapeHtml(sourceLabel)}</dd></div>
          <div><dt>Profile</dt><dd>${escapeHtml(profileStatus)}</dd></div>
        </dl>
      </article>
      <article class="aha-compact-status-card" aria-label="Data readiness">
        <div class="aha-compact-status-header">
          <h3>Data readiness</h3>
          <span class="aha-status-badge aha-status-badge-${totalItems > 0 ? "ready" : "neutral"}">${totalItems > 0 ? "Ready" : "Empty"}</span>
        </div>
        <strong class="aha-compact-status-primary">${totalItems} dashboard items · History Go ${historyGoReady ? "ready" : "not imported"}</strong>
        <p class="aha-compact-status-note">Module status at a glance in the app menu.</p>
      </article>
      <article class="aha-compact-status-card" aria-label="Dashboard blockers">
        <div class="aha-compact-status-header">
          <h3>Blockers</h3>
          <span class="aha-status-badge aha-status-badge-${dashboardBlocked ? "blocked" : "ready"}">${dashboardBlocked ? "Blocked" : "Ready"}</span>
        </div>
        <strong class="aha-compact-status-primary">${escapeHtml(blockerSummary)}</strong>
        <p class="aha-compact-status-note">Updated ${formatTime()}</p>
      </article>
    `;
  }

  const SYNC_HUB_DRY_RUN_SOURCES = [
    { id: "lists", name: "Lists", key: "aha_lists_v1", itemLabel: "list items" },
    { id: "paths", name: "Paths", key: "aha_paths_v1", itemLabel: "path items" },
    { id: "groups", name: "Groups", key: "aha_groups_v1", itemLabel: "group items" },
    { id: "ahaavisa", name: "AHAavisa", key: "aha_articles_v1", itemLabel: "AHAavisa articles" }
  ];

  const SYNC_HUB_ID_FIELDS = ["id", "key", "slug"];
  const SYNC_HUB_TITLE_FIELDS = ["title", "name", "label", "headline"];
  const SYNC_HUB_SAMPLE_FIELDS = ["id", "key", "slug", "title", "name", "label", "headline", "type", "category", "updatedAt", "createdAt"];
  const AHA_MANUAL_SYNC_PREVIEW_TARGETS = [
    {
      id: "not_configured",
      label: "Not configured",
      status: "not_configured",
      reason: "No write target configured. This is the safe default."
    },
    {
      id: "database_existing",
      label: "Existing database target",
      status: "configured",
      reason: "Uses the existing AHARepository write layer when all manual gates pass."
    },
    {
      id: "aha_repository_future",
      label: "AHA repository (future)",
      status: "future_only",
      reason: "Future repository target preview only."
    },
    {
      id: "database_api_future",
      label: "Database/API (future)",
      status: "unavailable",
      reason: "Future database/API target preview only; no new client is introduced."
    },
    {
      id: "custom_sync_backend_future",
      label: "Custom sync backend (future)",
      status: "future_only",
      reason: "Future backend target preview only; no sync backend is configured."
    }
  ];


  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function firstPresentField(item, fields) {
    if (!item || typeof item !== "object") return { field: null, value: undefined };
    const field = fields.find((candidate) => Object.prototype.hasOwnProperty.call(item, candidate));
    return { field: field || null, value: field ? item[field] : undefined };
  }

  function normalizeSyncHubDataset(parsed) {
    if (Array.isArray(parsed)) return { ok: true, items: parsed, structure: "array" };
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, items: [], structure: typeof parsed, error: "Dataset must be an array or object collection." };
    }

    if (Array.isArray(parsed.items)) return { ok: true, items: parsed.items, structure: "object.items" };
    if (Array.isArray(parsed.data)) return { ok: true, items: parsed.data, structure: "object.data" };

    const values = Object.values(parsed);
    const objectValues = values.filter((item) => item && typeof item === "object");
    if (values.length === 0 || objectValues.length === values.length) {
      return { ok: true, items: values, structure: "object.map" };
    }

    return { ok: false, items: [], structure: "object", error: "Dataset object must contain items/data arrays or object values." };
  }

  function validateAhaLocalSyncDataset({ datasetExists, items, structure, readError, invalidStructure }) {
    const errors = [];
    const warnings = [];

    if (readError) errors.push("Could not read or parse this localStorage dataset.");
    if (!datasetExists) warnings.push("No localStorage dataset found.");
    if (invalidStructure) errors.push(invalidStructure);
    if (datasetExists && !invalidStructure && items.length === 0) warnings.push("Dataset exists but contains no items.");

    const seenIds = new Map();
    items.forEach((item, index) => {
      const itemLabel = `Item ${index + 1}`;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push(`${itemLabel} has an invalid item structure.`);
        return;
      }

      const idField = firstPresentField(item, SYNC_HUB_ID_FIELDS);
      const rawId = idField.value;
      const id = String(rawId ?? "").trim();
      if (!idField.field) {
        errors.push(`${itemLabel} is missing id/key/slug.`);
      } else if (!id) {
        errors.push(`${itemLabel} has an empty ${idField.field}.`);
      } else if (seenIds.has(id)) {
        errors.push(`Duplicate id "${id}" found in ${itemLabel} and item ${seenIds.get(id) + 1}.`);
      } else {
        seenIds.set(id, index);
      }

      const titleField = firstPresentField(item, SYNC_HUB_TITLE_FIELDS);
      const title = String(titleField.value ?? "").trim();
      if (!titleField.field) {
        warnings.push(`${itemLabel} is missing title/name/label/headline.`);
      } else if (!title) {
        warnings.push(`${itemLabel} has an empty ${titleField.field}.`);
      }
    });

    let validationStatus = "valid";
    if (errors.length) validationStatus = "errors";
    else if (!datasetExists) validationStatus = "skipped";
    else if (warnings.length) validationStatus = "warnings";

    return { errors, warnings, validationStatus, structure: structure || "unknown" };
  }

  function createSyncHubDryRunResult(source, count, status, actionPreview, warnings = [], validation = null) {
    const normalizedValidation = validation || validateAhaLocalSyncDataset({
      datasetExists: status !== "missing",
      items: [],
      readError: status === "error",
      invalidStructure: status === "error" ? "Dataset could not be inspected." : null
    });

    const mergedWarnings = [...new Set([...(warnings || []), ...normalizedValidation.warnings])];
    return {
      id: source.id,
      name: source.name,
      key: source.key,
      count,
      status,
      state: status,
      ok: status !== "error" && normalizedValidation.validationStatus !== "errors",
      actionPreview,
      warnings: mergedWarnings,
      errors: normalizedValidation.errors,
      validationStatus: normalizedValidation.validationStatus,
      validationStructure: normalizedValidation.structure
    };
  }

  function inspectSyncHubLocalStorageItem(source) {
    const raw = window.localStorage.getItem(source.key);
    if (raw === null) {
      const validation = validateAhaLocalSyncDataset({ datasetExists: false, items: [], structure: "missing" });
      return createSyncHubDryRunResult(source, 0, "missing", "No local data found", [], validation);
    }
    if (!String(raw).trim()) {
      const validation = validateAhaLocalSyncDataset({ datasetExists: true, items: [], structure: "empty-string" });
      return createSyncHubDryRunResult(source, 0, "empty", "Dataset exists but is empty", [], validation);
    }

    const parsed = JSON.parse(raw);
    const normalized = normalizeSyncHubDataset(parsed);
    const validation = validateAhaLocalSyncDataset({
      datasetExists: true,
      items: normalized.items,
      structure: normalized.structure,
      invalidStructure: normalized.ok ? null : normalized.error
    });

    if (!normalized.ok) {
      return createSyncHubDryRunResult(source, "–", "error", "Invalid local dataset structure", [], validation);
    }

    const count = countActive(normalized.items);
    if (count > 0) return createSyncHubDryRunResult(source, count, "ready", `Would prepare ${count} ${source.itemLabel}`, [], validation);
    return createSyncHubDryRunResult(source, 0, "empty", "Dataset exists but is empty", [], validation);
  }

  function buildAhaSyncDryRunPlan() {
    return SYNC_HUB_DRY_RUN_SOURCES.map((source) => {
      try {
        return inspectSyncHubLocalStorageItem(source);
      } catch (error) {
        console.warn(`AHADashboard: kunne ikke lese ${source.key}`, error);
        return createSyncHubDryRunResult(source, "–", "error", "Could not read localStorage", ["Could not inspect this dataset."]);
      }
    });
  }

  function moduleHealthFromCount(moduleName, count) {
    const normalizedCount = statValue({ count }, "count");
    return {
      status: normalizedCount > 0 ? "ready" : "empty",
      count: normalizedCount,
      reason: normalizedCount > 0
        ? `${moduleName} has ${normalizedCount} available local item${normalizedCount === 1 ? "" : "s"}.`
        : `${moduleName} has no available local items.`
    };
  }

  function syncHubRowToModuleHealth(row) {
    if (!row) return { status: "unknown", reason: "No module health data is available." };
    if (row.status === "error" || row.validationStatus === "errors" || row.ok === false) {
      return { status: "blocked", count: null, reason: row.errors?.[0] || row.actionPreview || "Module validation is blocked." };
    }
    if (row.status === "missing") return { status: "missing", count: null, reason: row.actionPreview || "No local dataset was found." };
    if (row.status === "empty") return { status: "empty", count: 0, reason: row.actionPreview || "The local dataset is empty." };
    if (row.validationStatus === "warnings" || row.warnings?.length) {
      return { status: "warning", count: row.count, reason: row.warnings?.[0] || "Module data has validation warnings." };
    }
    if (row.status === "ready") return { status: "ready", count: row.count, reason: row.actionPreview || "Module data is ready." };
    return { status: "unknown", count: row.count, reason: row.actionPreview || "Module health could not be determined." };
  }

  function buildModuleHealth(stats, authState) {
    const health = {};
    const countedModules = {
      chat: ["Chat", "source_events"],
      notes: ["Notes", "notes"],
      gallery: ["Gallery", "gallery"],
      feed: ["Feed", "feed"],
      insta: ["AHA Insta", "insta"],
      historygo: ["History Go", "imports"]
    };

    Object.entries(countedModules).forEach(([moduleId, [moduleName, statKey]]) => {
      health[moduleId] = moduleHealthFromCount(moduleName, statValue(stats, statKey));
    });

    health.profile = authState?.user
      ? authState.profile?.display_name
        ? { status: "ready", reason: "Profile is signed in and has a display name." }
        : { status: "warning", reason: "Profile is signed in but needs a display name." }
      : { status: "missing", reason: "No signed-in profile is available." };

    const moduleIdBySyncSource = { lists: "lists", paths: "paths", groups: "groups", ahaavisa: "avisa" };
    buildAhaSyncDryRunPlan().forEach((row) => {
      health[moduleIdBySyncSource[row.id]] = syncHubRowToModuleHealth(row);
    });

    (window.AHA_MODULES || []).forEach((module) => {
      if (!health[module.id]) {
        health[module.id] = {
          status: "unknown",
          reason: module.status === "shell"
            ? "This module is listed as a shell and has no Home health source."
            : "No read-only Home health source is available for this module."
        };
      }
    });

    return health;
  }

  function readSyncHubPreviewDataset(source) {
    const raw = window.localStorage.getItem(source.key);
    if (raw === null) return { datasetExists: false, items: [], structure: "missing" };
    if (!String(raw).trim()) return { datasetExists: true, items: [], structure: "empty-string" };

    const normalized = normalizeSyncHubDataset(JSON.parse(raw));
    return {
      datasetExists: true,
      items: normalized.ok ? normalized.items : [],
      structure: normalized.structure,
      invalidStructure: normalized.ok ? null : normalized.error
    };
  }

  function truncateSyncHubPreviewValue(value) {
    const text = String(value ?? "").trim();
    if (text.length <= 120) return text;
    return `${text.slice(0, 117)}…`;
  }

  function simplifySyncHubPreviewItem(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return {};

    return SYNC_HUB_SAMPLE_FIELDS.reduce((sample, field) => {
      if (!Object.prototype.hasOwnProperty.call(item, field)) return sample;
      const value = item[field];
      if (value === undefined || value === null || typeof value === "object" || typeof value === "function") return sample;
      const text = truncateSyncHubPreviewValue(value);
      if (text) sample[field] = text;
      return sample;
    }, {});
  }

  function formatAhaSyncPayloadShape(source) {
    return `{ module: '${source.id}', items: [...] }`;
  }

  function resolveAhaSyncPayloadPreviewDecision(row, itemCount) {
    if (row.errors?.length || row.validationStatus === "errors" || row.status === "error") {
      return { included: false, reason: "Excluded because validation has errors." };
    }
    if (row.status === "missing" || row.validationStatus === "skipped") {
      return { included: false, reason: "Excluded because no local dataset was found." };
    }
    if (row.status === "empty" || itemCount === 0) {
      return { included: false, reason: "Excluded because the dataset is empty." };
    }
    if (row.warnings?.length || row.validationStatus === "warnings") {
      return { included: true, reason: "Included with validation warnings." };
    }
    return { included: true, reason: "Included because validation is ready." };
  }

  function createAhaSyncPayloadPreviewModule(source, row, dataset) {
    const activeItems = dataset.items.filter((item) => !item?.deleted_at);
    const itemCount = activeItems.length;
    const decision = resolveAhaSyncPayloadPreviewDecision(row, itemCount);

    return {
      id: source.id,
      name: source.name,
      included: decision.included,
      reason: decision.reason,
      itemCount,
      sampleItems: decision.included ? activeItems.slice(0, 3).map(simplifySyncHubPreviewItem) : [],
      items: decision.included ? activeItems.slice() : [],
      payloadShape: formatAhaSyncPayloadShape(source),
      warnings: row.warnings || [],
      errors: row.errors || [],
      validationStatus: row.validationStatus || "unknown"
    };
  }

  function buildAhaSyncPayloadPreview(plan = buildAhaSyncDryRunPlan()) {
    const planById = new Map(plan.map((row) => [row.id, row]));
    const modules = SYNC_HUB_DRY_RUN_SOURCES.map((source) => {
      try {
        const dataset = readSyncHubPreviewDataset(source);
        const row = planById.get(source.id) || inspectSyncHubLocalStorageItem(source);
        return createAhaSyncPayloadPreviewModule(source, row, dataset);
      } catch (error) {
        console.warn(`AHADashboard: kunne ikke bygge payload preview for ${source.key}`, error);
        const row = planById.get(source.id) || createSyncHubDryRunResult(source, "–", "error", "Could not read localStorage", ["Could not inspect this dataset."]);
        return createAhaSyncPayloadPreviewModule(source, row, { items: [] });
      }
    });

    const modulesIncluded = modules.filter((module) => module.included).length;
    const modulesExcluded = modules.length - modulesIncluded;
    const totalPreviewItems = modules.reduce((sum, module) => sum + (module.included ? module.itemCount : 0), 0);

    return { modules, modulesIncluded, modulesExcluded, totalPreviewItems };
  }

  function summarizeSyncHubValidation(plan) {
    const totalModules = plan.length;
    const modulesReady = plan.filter((row) => row.validationStatus === "valid").length;
    const modulesWithWarnings = plan.filter((row) => row.validationStatus === "warnings").length;
    const modulesWithErrors = plan.filter((row) => row.validationStatus === "errors").length;
    const warningCount = plan.reduce((count, row) => count + (row.warnings?.length || 0), 0);
    const errorCount = plan.reduce((count, row) => count + (row.errors?.length || 0), 0);
    return { totalModules, modulesReady, modulesWithWarnings, modulesWithErrors, warningCount, errorCount };
  }

  function formatSyncHubValidationSummary(plan) {
    const summary = summarizeSyncHubValidation(plan);
    const warningLabel = summary.modulesWithWarnings === 1 ? "warning" : "warnings";
    const errorLabel = summary.modulesWithErrors === 1 ? "error" : "errors";
    return `${summary.totalModules} modules inspected · ${summary.modulesReady} ready · ${summary.modulesWithWarnings} ${warningLabel} · ${summary.modulesWithErrors} ${errorLabel}`;
  }

  function createAhaSyncChecklistItem(label, status, reason) {
    return { label, status, reason };
  }

  function summarizeAhaSyncOperatorChecklist(items) {
    return items.reduce((summary, item) => {
      if (Object.prototype.hasOwnProperty.call(summary, item.status)) summary[item.status] += 1;
      return summary;
    }, { passed: 0, warning: 0, blocked: 0 });
  }

  function formatAhaSyncOperatorChecklistSummary(summary) {
    return `${summary.passed} passed · ${summary.warning} warning · ${summary.blocked} blocked`;
  }

  function buildAhaSyncOperatorChecklist(plan, payloadPreview) {
    const safePlan = Array.isArray(plan) ? plan : [];
    const safeModules = Array.isArray(payloadPreview?.modules) ? payloadPreview.modules : [];
    const validationErrors = safePlan.reduce((count, row) => count + (row.errors?.length || 0), 0);
    const inspectionErrors = safePlan.filter((row) => row.status === "error" || row.validationStatus === "errors" || row.ok === false).length;
    const modulesWithWarnings = safePlan.filter((row) => ["warnings", "skipped"].includes(row.validationStatus) || (row.warnings?.length || 0) > 0).length;
    const readinessBlocked = inspectionErrors > 0 || validationErrors > 0;
    const previewGenerated = Boolean(payloadPreview && safeModules.length === SYNC_HUB_DRY_RUN_SOURCES.length);
    const modulesIncluded = Number(payloadPreview?.modulesIncluded || 0);
    const invalidIncludedModules = safeModules.filter((modulePreview) => {
      if (!modulePreview.included) return false;
      return modulePreview.errors?.length || modulePreview.validationStatus === "errors" || modulePreview.itemCount === 0;
    });

    const items = [
      createAhaSyncChecklistItem(
        "Local datasets inspected",
        safePlan.length === SYNC_HUB_DRY_RUN_SOURCES.length && inspectionErrors === 0 ? "passed" : "blocked",
        inspectionErrors
          ? `${inspectionErrors} module inspection blocked; Sync Hub stayed read-only.`
          : `${safePlan.length} local datasets inspected from the existing dry-run plan.`
      ),
      createAhaSyncChecklistItem(
        "No validation errors",
        validationErrors || readinessBlocked ? "blocked" : "passed",
        validationErrors
          ? `${validationErrors} validation error${validationErrors === 1 ? "" : "s"} found; readiness remains blocked.`
          : "Validation has no errors in the current dry-run plan."
      ),
      createAhaSyncChecklistItem(
        "Warnings reviewed",
        modulesWithWarnings ? "warning" : "passed",
        modulesWithWarnings
          ? `${modulesWithWarnings} module${modulesWithWarnings === 1 ? " has" : "s have"} warnings or skipped local data to review before any future sync.`
          : "No validation warnings are present in the current dry-run plan."
      ),
      createAhaSyncChecklistItem(
        "Payload preview generated",
        !previewGenerated || (modulesIncluded === 0 && readinessBlocked) ? "blocked" : modulesIncluded === 0 ? "warning" : "passed",
        !previewGenerated
          ? "Payload preview could not be generated for all configured modules."
          : modulesIncluded === 0
            ? "Payload preview exists, but no modules are currently included."
            : `${modulesIncluded} module${modulesIncluded === 1 ? " is" : "s are"} included in the read-only payload preview.`
      ),
      createAhaSyncChecklistItem(
        "Only eligible modules included",
        invalidIncludedModules.length ? "blocked" : "passed",
        invalidIncludedModules.length
          ? `${invalidIncludedModules.length} included module${invalidIncludedModules.length === 1 ? " has" : "s have"} blocking validation or empty payload state.`
          : "Payload preview excludes missing, empty, and validation-error modules."
      ),
      createAhaSyncChecklistItem(
        "Dashboard write boundary preserved",
        "passed",
        "Dashboard prepares gated payload data only; writes are delegated to the manual sync adapter."
      ),
      createAhaSyncChecklistItem(
        "Manual sync remains gated",
        "passed",
        "No sync runs during page load, panel open, target selection, or modal open."
      ),
      createAhaSyncChecklistItem(
        "Explicit confirmation required",
        "passed",
        "Only the Confirm sync action in the modal can call the adapter execution path."
      )
    ];

    return {
      items,
      summary: summarizeAhaSyncOperatorChecklist(items),
      readiness: readinessBlocked ? "blocked" : modulesWithWarnings || modulesIncluded === 0 ? "warning" : "passed"
    };
  }

  function renderSyncHubValidationMessages(row, type) {
    const messages = type === "errors" ? row.errors : row.warnings;
    if (!messages.length) return `<p class="aha-sync-validation-empty">No ${type}.</p>`;
    return `<ul class="aha-sync-validation-list aha-sync-validation-list-${type}">${messages.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul>`;
  }

  function renderAhaSyncPayloadSampleItems(modulePreview) {
    if (!modulePreview.included) return "";
    if (!modulePreview.sampleItems.length) return `<p class="aha-sync-validation-empty">No sample items.</p>`;

    return `
      <ul class="aha-sync-payload-samples" aria-label="${escapeHtml(modulePreview.name)} sample items">
        ${modulePreview.sampleItems.map((item) => `<li><code>${escapeHtml(JSON.stringify(item))}</code></li>`).join("")}
      </ul>
    `;
  }

  function renderAhaSyncPayloadPreviewMessages(modulePreview) {
    if (!modulePreview.warnings.length && !modulePreview.errors.length) {
      return `<p class="aha-sync-validation-empty">No validation warnings or errors.</p>`;
    }

    return `
      <div class="aha-sync-validation-columns">
        <div>
          <strong>Warnings</strong>
          ${renderSyncHubValidationMessages(modulePreview, "warnings")}
        </div>
        <div>
          <strong>Errors</strong>
          ${renderSyncHubValidationMessages(modulePreview, "errors")}
        </div>
      </div>
    `;
  }

  function renderAhaSyncPayloadPreview(preview) {
    return `
      <div class="aha-sync-payload-preview" aria-label="AHA Sync Hub payload preview">
        <div class="aha-sync-prep-heading">
          <h4>Payload preview</h4>
          <p class="aha-sync-prep-notice">Preview only. No payload is sent and no data is written.</p>
          <p class="aha-sync-validation-summary">${escapeHtml(preview.modulesIncluded)} modules included · ${escapeHtml(preview.modulesExcluded)} excluded · ${escapeHtml(preview.totalPreviewItems)} preview items</p>
        </div>
        <div class="aha-sync-prep-list">
          ${preview.modules.map((modulePreview) => `
            <div class="aha-sync-prep-row aha-sync-payload-row aha-sync-payload-${modulePreview.included ? "included" : "excluded"}">
              <strong>${escapeHtml(modulePreview.name)} <small>${escapeHtml(modulePreview.id)}</small></strong>
              <span>${modulePreview.included ? "included" : "excluded"}</span>
              <small>${escapeHtml(modulePreview.validationStatus)}</small>
              <p>${escapeHtml(modulePreview.reason)}</p>
              <p><strong>itemCount:</strong> ${escapeHtml(modulePreview.itemCount)}</p>
              <p><strong>payloadShape:</strong> <code>${escapeHtml(modulePreview.payloadShape)}</code></p>
              <div class="aha-sync-validation-block" aria-label="${escapeHtml(modulePreview.name)} payload preview details">
                <h5>Sample items</h5>
                ${renderAhaSyncPayloadSampleItems(modulePreview)}
                <h5>Validation notes</h5>
                ${renderAhaSyncPayloadPreviewMessages(modulePreview)}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderAhaSyncStatusList(items, emptyLabel) {
    if (!items.length) return `<p class="aha-sync-validation-empty">${escapeHtml(emptyLabel)}</p>`;
    return `<ul class="aha-sync-manual-reasons">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  }


  function getAhaManualSyncPreviewTarget(id = selectedPreviewTarget) {
    const target = AHA_MANUAL_SYNC_PREVIEW_TARGETS.find((candidate) => candidate.id === id);
    return target || AHA_MANUAL_SYNC_PREVIEW_TARGETS[0];
  }

  function getAhaManualSyncPreviewTargetAuditStatus(target = getAhaManualSyncPreviewTarget()) {
    if (target.id === "not_configured") return "not_configured";
    if (target.id !== "database_existing") return "future_only";
    const validation = window.AHAManualSyncAdapter?.validateAhaManualSyncTarget
      ? window.AHAManualSyncAdapter.validateAhaManualSyncTarget({ id: "database_existing", status: "configured" })
      : { ok: false };
    return validation.ok ? "configured" : "not_configured";
  }

  function getAhaManualSyncPreviewTargetGateReason(target = getAhaManualSyncPreviewTarget()) {
    const status = getAhaManualSyncPreviewTargetAuditStatus(target);
    if (target.id === "not_configured") return "No write target configured.";
    if (target.id === "database_existing" && status === "configured") return "Existing database target is configured.";
    if (target.id === "database_existing") return "Existing database target is unavailable or missing approved write methods.";
    return "Selected target is preview-only and not connected.";
  }

  const AHA_MANUAL_SYNC_NEXT_REQUIRED_STEPS = Object.freeze([
    "keep sync manual and explicitly confirmed for each run",
    "add an AHA manual sync audit log writer if durable audit history is required",
    "add a manual sync result history panel after audit/result persistence exists"
  ]);

  const AHA_MANUAL_SYNC_STATE_MACHINE_FALLBACK_STATUS = Object.freeze({
    currentState: "blocked",
    previousState: "not_started",
    reason: "Manual sync is gated and requires explicit confirmation.",
    canExecute: false,
    canWrite: false,
    isStub: true,
    writeStatus: "manual_gated_existing_database_target",
    states: ["not_started", "blocked", "confirmed", "running", "partial_success", "success", "failed", "rolled_back"],
    allowedPreviewTransitions: {
      not_started: ["blocked"],
      blocked: ["not_started"],
      confirmed: ["blocked"],
      running: ["failed"],
      failed: ["rolled_back"]
    },
    disabledExecutionStates: ["confirmed", "running", "partial_success", "success"]
  });

  function getAhaManualSyncStateMachinePreviewStatus() {
    const api = window.AHAManualSyncStateMachine;
    if (api?.getAhaManualSyncStateMachineStatus) {
      try {
        return api.getAhaManualSyncStateMachineStatus();
      } catch (error) {
        console.warn("AHADashboard: kunne ikke lese manual sync state machine status", error);
      }
    }

    return AHA_MANUAL_SYNC_STATE_MACHINE_FALLBACK_STATUS;
  }

  function getAhaManualSyncAdapterPreviewStatus() {
    const api = window.AHAManualSyncAdapter;
    if (api?.getAhaManualSyncAdapterStatus) {
      try {
        return api.getAhaManualSyncAdapterStatus();
      } catch (error) {
        console.warn("AHADashboard: kunne ikke lese manual sync adapter status", error);
      }
    }

    return {
      adapterStatus: "manual_gated_existing_database_target",
      canPrepare: true,
      canExecute: false,
      canWrite: false,
      isStub: true,
      reason: "Manual sync is gated and requires explicit confirmation.",
      writeStatus: "manual_gated_existing_database_target",
      stateMachineStatus: getAhaManualSyncStateMachinePreviewStatus()
    };
  }

  function renderAhaManualSyncStateMachinePreview(status = getAhaManualSyncStateMachinePreviewStatus()) {
    const transitions = Object.entries(status.allowedPreviewTransitions || {})
      .map(([from, to]) => `${from} -> ${Array.isArray(to) ? to.join(", ") : to}`);

    return `
      <div class="aha-sync-state-machine-preview" aria-label="AHA manual sync execution state machine preview">
        <div class="aha-sync-prep-heading">
          <h4>Execution state machine</h4>
          <p class="aha-sync-prep-notice">State machine supports the gated manual flow only; no transition runs without explicit confirmation.</p>
          <p class="aha-sync-validation-summary">currentState: ${escapeHtml(status.currentState)} · previousState: ${escapeHtml(status.previousState)} · writeStatus: ${escapeHtml(status.writeStatus)}</p>
        </div>
        <div class="aha-sync-validation-block">
          <p><strong>currentState:</strong> ${escapeHtml(status.currentState)}</p>
          <p><strong>previousState:</strong> ${escapeHtml(status.previousState)}</p>
          <p><strong>canExecute:</strong> ${escapeHtml(status.canExecute)}</p>
          <p><strong>canWrite:</strong> ${escapeHtml(status.canWrite)}</p>
          <p><strong>writeStatus:</strong> ${escapeHtml(status.writeStatus)}</p>
          <p><strong>reason:</strong> ${escapeHtml(status.reason)}</p>
          <p><strong>allowed preview states:</strong> ${escapeHtml((status.states || []).join(", "))}</p>
          <p><strong>disabled execution states:</strong> ${escapeHtml((status.disabledExecutionStates || []).join(", "))}</p>
        </div>
        <div class="aha-sync-validation-block">
          <h5>Allowed transition preview</h5>
          ${renderAhaSyncStatusList(transitions, "No preview transitions are available.")}
        </div>
      </div>
    `;
  }

  function renderAhaManualSyncTargetSelectorPreview() {
    const activeTarget = getAhaManualSyncPreviewTarget();

    return `
      <div class="aha-sync-target-preview" aria-label="AHA manual sync target selector preview">
        <div class="aha-sync-prep-heading">
          <h4>Target selector</h4>
          <p class="aha-sync-prep-notice">Manual target selection only. No data is written until Confirm sync is clicked.</p>
          <p class="aha-sync-validation-summary">selectedPreviewTarget: ${escapeHtml(activeTarget.id)} · targetStatus: ${escapeHtml(getAhaManualSyncPreviewTargetAuditStatus(activeTarget))} · writeStatus: manual_gated_existing_database_target</p>
        </div>
        <label class="aha-sync-target-select-label" for="aha-sync-target-preview-select">Manual write target</label>
        <select id="aha-sync-target-preview-select" class="aha-sync-target-select" aria-describedby="aha-sync-target-preview-note">
          ${AHA_MANUAL_SYNC_PREVIEW_TARGETS.map((target) => `<option value="${escapeHtml(target.id)}"${target.id === activeTarget.id ? " selected" : ""}>${escapeHtml(target.label)}</option>`).join("")}
        </select>
        <p id="aha-sync-target-preview-note" class="aha-sync-prep-notice">Changing this selector only updates the gated target state. It does not run sync, write payloads, or bypass the adapter.</p>
        <div class="aha-sync-prep-list">
          ${AHA_MANUAL_SYNC_PREVIEW_TARGETS.map((target) => {
            const isSelected = target.id === activeTarget.id;
            const rowStatus = isSelected && target.id !== "not_configured" ? "selected_preview" : target.status;
            const reason = isSelected && target.id !== "not_configured"
              ? `${target.reason} Selected, but writes still require all gates and explicit confirmation.`
              : target.reason;
            return `
              <div class="aha-sync-prep-row aha-sync-target-row aha-sync-target-${escapeHtml(rowStatus)}">
                <strong>${escapeHtml(target.label)}</strong>
                <span>${isSelected ? "selected" : "available"}</span>
                <small>${escapeHtml(rowStatus)}</small>
                <p>${escapeHtml(reason)}</p>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  function renderAhaSyncOperatorChecklist(checklist) {
    return `
      <div class="aha-sync-operator-checklist" aria-label="AHA Sync Hub operator checklist">
        <div class="aha-sync-prep-heading">
          <h4>Operator checklist</h4>
          <p class="aha-sync-prep-notice">Pre-flight checklist only. Sync is not available yet.</p>
          <p class="aha-sync-unavailable-notice">Sync is not available yet.</p>
          <p class="aha-sync-validation-summary">${escapeHtml(formatAhaSyncOperatorChecklistSummary(checklist.summary))}</p>
          <p class="aha-sync-validation-status aha-sync-validation-status-${escapeHtml(checklist.readiness)}">readiness gate: ${escapeHtml(checklist.readiness)}</p>
        </div>
        <div class="aha-sync-prep-list">
          ${checklist.items.map((item) => `
            <div class="aha-sync-prep-row aha-sync-checklist-row aha-sync-checklist-${escapeHtml(item.status)}">
              <strong>${escapeHtml(item.label)}</strong>
              <small>${escapeHtml(item.status)}</small>
              <p>${escapeHtml(item.reason)}</p>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }


  function padAhaSyncPreviewDatePart(value) {
    return String(value).padStart(2, "0");
  }

  function createAhaManualSyncPreviewRunId(now = new Date()) {
    const datePart = `${now.getFullYear()}${padAhaSyncPreviewDatePart(now.getMonth() + 1)}${padAhaSyncPreviewDatePart(now.getDate())}`;
    const timePart = `${padAhaSyncPreviewDatePart(now.getHours())}${padAhaSyncPreviewDatePart(now.getMinutes())}${padAhaSyncPreviewDatePart(now.getSeconds())}`;
    return `aha-sync-preview-${datePart}-${timePart}`;
  }

  function collectAhaManualSyncAuditMessages(plan, payloadPreview, checklist, type) {
    const planMessages = (Array.isArray(plan) ? plan : []).flatMap((row) => (row?.[type] || []).map((message) => `${row.name}: ${message}`));
    const payloadMessages = (payloadPreview?.modules || []).flatMap((modulePreview) => (modulePreview?.[type] || []).map((message) => `${modulePreview.name}: ${message}`));
    const checklistMessages = (checklist?.items || [])
      .filter((item) => type === "errors" ? item.status === "blocked" : item.status === "warning")
      .map((item) => `${item.label}: ${item.reason}`);
    const readinessMessages = [];
    if (checklist?.readiness === "blocked" && type === "errors") readinessMessages.push("Readiness gate is blocked.");
    if (checklist?.readiness === "warning" && type === "warnings") readinessMessages.push("Readiness gate has warnings.");
    if ((payloadPreview?.modulesIncluded || 0) === 0 && type === "warnings") readinessMessages.push("Payload preview includes no modules.");

    return [...new Set([...planMessages, ...payloadMessages, ...checklistMessages, ...readinessMessages])];
  }

  function buildAhaManualSyncAuditLogPreview(plan, payloadPreview, checklist, previewTarget = getAhaManualSyncPreviewTarget()) {
    try {
      const generatedAt = new Date();
      const safePlan = Array.isArray(plan) ? plan : buildAhaSyncDryRunPlan();
      const safePayloadPreview = payloadPreview || buildAhaSyncPayloadPreview(safePlan);
      const safeChecklist = checklist || buildAhaSyncOperatorChecklist(safePlan, safePayloadPreview);
      const validationSummary = summarizeSyncHubValidation(safePlan);
      const includedModules = (safePayloadPreview.modules || []).filter((modulePreview) => modulePreview.included).map((modulePreview) => modulePreview.id);
      const excludedModules = (safePayloadPreview.modules || []).filter((modulePreview) => !modulePreview.included).map((modulePreview) => modulePreview.id);
      const itemCounts = (safePayloadPreview.modules || []).reduce((counts, modulePreview) => {
        counts[modulePreview.id] = modulePreview.itemCount;
        return counts;
      }, {});
      const readinessStatus = safeChecklist.readiness === "passed" ? "ready" : safeChecklist.readiness;
      const warnings = collectAhaManualSyncAuditMessages(safePlan, safePayloadPreview, safeChecklist, "warnings");
      const errors = collectAhaManualSyncAuditMessages(safePlan, safePayloadPreview, safeChecklist, "errors");
      const safePreviewTarget = getAhaManualSyncPreviewTarget(previewTarget?.id);
      const targetStatus = getAhaManualSyncPreviewTargetAuditStatus(safePreviewTarget);

      return {
        ok: true,
        runId: createAhaManualSyncPreviewRunId(generatedAt),
        timestamp: generatedAt.toISOString(),
        timestampLabel: `${generatedAt.toLocaleString("no-NO")} (preview-generated, not written to audit log)`,
        trigger: "manual_preview",
        status: "preview_only",
        target: safePreviewTarget.id,
        targetStatus,
        includedModules,
        excludedModules,
        itemCounts,
        totalPreviewItems: Number(safePayloadPreview.totalPreviewItems || 0),
        readinessStatus,
        validationSummary,
        checklistSummary: safeChecklist.summary || { passed: 0, warning: 0, blocked: 0 },
        payloadPreviewSummary: {
          modulesIncluded: Number(safePayloadPreview.modulesIncluded || 0),
          modulesExcluded: Number(safePayloadPreview.modulesExcluded || 0),
          totalPreviewItems: Number(safePayloadPreview.totalPreviewItems || 0)
        },
        warnings,
        errors,
        rollbackStatus: "not_available_preview_only",
        writeStatus: "disabled_preview_only"
      };
    } catch (error) {
      console.warn("AHADashboard: kunne ikke bygge audit log preview", error);
      const generatedAt = new Date();
      return {
        ok: false,
        runId: createAhaManualSyncPreviewRunId(generatedAt),
        timestamp: generatedAt.toISOString(),
        timestampLabel: `${generatedAt.toLocaleString("no-NO")} (preview-generated, not written to audit log)`,
        trigger: "manual_preview",
        status: "preview_only",
        target: getAhaManualSyncPreviewTarget().id,
        targetStatus: getAhaManualSyncPreviewTargetAuditStatus(),
        includedModules: [],
        excludedModules: [],
        itemCounts: {},
        totalPreviewItems: 0,
        readinessStatus: "blocked",
        validationSummary: { totalModules: 0, modulesReady: 0, modulesWithWarnings: 0, modulesWithErrors: 1, warningCount: 0, errorCount: 1 },
        checklistSummary: { passed: 0, warning: 0, blocked: 1 },
        payloadPreviewSummary: { modulesIncluded: 0, modulesExcluded: 0, totalPreviewItems: 0 },
        warnings: [],
        errors: ["Audit log preview could not be built. No sync or audit write was attempted."],
        rollbackStatus: "not_available_preview_only",
        writeStatus: "disabled_preview_only"
      };
    }
  }

  function renderAhaManualSyncAuditModuleList(modules, emptyLabel) {
    if (!modules.length) return `<span>${escapeHtml(emptyLabel)}</span>`;
    return modules.map((moduleId) => `<span>${escapeHtml(moduleId)}</span>`).join("");
  }

  function renderAhaManualSyncAuditItemCounts(itemCounts) {
    const entries = Object.entries(itemCounts || {});
    if (!entries.length) return `<p class="aha-sync-validation-empty">No module item counts.</p>`;
    return `
      <div class="aha-sync-audit-counts">
        ${entries.map(([moduleId, count]) => `<span><strong>${escapeHtml(moduleId)}</strong>: ${escapeHtml(count)}</span>`).join("")}
      </div>
    `;
  }

  function renderAhaManualSyncAuditLogPreview(auditPreview) {
    return `
      <div class="aha-sync-audit-preview" aria-label="AHA manual sync audit log preview">
        <div class="aha-sync-prep-heading">
          <h4>Audit log preview</h4>
          <p class="aha-sync-prep-notice">Preview only. No audit log is written, no sync is performed, and no target is connected.</p>
          <p class="aha-sync-validation-summary">${escapeHtml(auditPreview.status)} · target: ${escapeHtml(auditPreview.target)} · targetStatus: ${escapeHtml(auditPreview.targetStatus)} · writeStatus: ${escapeHtml(auditPreview.writeStatus)}</p>
        </div>
        <div class="aha-sync-validation-block">
          <h5>Preview record</h5>
          <p><strong>runId:</strong> <code>${escapeHtml(auditPreview.runId)}</code></p>
          <p><strong>timestamp:</strong> ${escapeHtml(auditPreview.timestampLabel)}</p>
          <p><strong>trigger:</strong> ${escapeHtml(auditPreview.trigger)}</p>
          <p><strong>status:</strong> ${escapeHtml(auditPreview.status)}</p>
          <p><strong>target:</strong> ${escapeHtml(auditPreview.target)}</p>
          <p><strong>targetStatus:</strong> ${escapeHtml(auditPreview.targetStatus)}</p>
          <p><strong>readiness:</strong> ${escapeHtml(auditPreview.readinessStatus)}</p>
          <p><strong>rollbackStatus:</strong> ${escapeHtml(auditPreview.rollbackStatus)}</p>
          <p><strong>writeStatus:</strong> ${escapeHtml(auditPreview.writeStatus)}</p>
        </div>
        <div class="aha-sync-validation-columns">
          <div>
            <h5>Included modules</h5>
            <div class="aha-sync-audit-chip-list">${renderAhaManualSyncAuditModuleList(auditPreview.includedModules, "None included.")}</div>
          </div>
          <div>
            <h5>Excluded modules</h5>
            <div class="aha-sync-audit-chip-list">${renderAhaManualSyncAuditModuleList(auditPreview.excludedModules, "None excluded.")}</div>
          </div>
        </div>
        <div class="aha-sync-validation-block">
          <h5>Item counts</h5>
          ${renderAhaManualSyncAuditItemCounts(auditPreview.itemCounts)}
          <p><strong>totalPreviewItems:</strong> ${escapeHtml(auditPreview.totalPreviewItems)}</p>
        </div>
        <div class="aha-sync-validation-block">
          <h5>Summaries</h5>
          <p><strong>validationSummary:</strong> ${escapeHtml(auditPreview.validationSummary.modulesReady)} ready · ${escapeHtml(auditPreview.validationSummary.warningCount)} warnings · ${escapeHtml(auditPreview.validationSummary.errorCount)} errors</p>
          <p><strong>checklistSummary:</strong> ${escapeHtml(auditPreview.checklistSummary.passed)} passed · ${escapeHtml(auditPreview.checklistSummary.warning)} warning · ${escapeHtml(auditPreview.checklistSummary.blocked)} blocked</p>
          <p><strong>payloadPreviewSummary:</strong> ${escapeHtml(auditPreview.payloadPreviewSummary.modulesIncluded)} included · ${escapeHtml(auditPreview.payloadPreviewSummary.modulesExcluded)} excluded · ${escapeHtml(auditPreview.payloadPreviewSummary.totalPreviewItems)} preview items</p>
        </div>
        <div class="aha-sync-validation-columns">
          <div>
            <h5>Warnings</h5>
            ${renderAhaSyncStatusList(auditPreview.warnings, "No audit preview warnings.")}
          </div>
          <div>
            <h5>Errors</h5>
            ${renderAhaSyncStatusList(auditPreview.errors, "No audit preview errors.")}
          </div>
        </div>
      </div>
    `;
  }

  function renderAhaManualSyncAuditLogPreviewSummary(auditPreview) {
    return `
      <div class="aha-sync-confirmation-section aha-sync-audit-preview-summary">
        <h5>E. Audit log preview</h5>
        <p class="aha-sync-prep-notice">Preview only. No audit log is written, no sync is performed, and no target is connected.</p>
        <p><strong>runId:</strong> <code>${escapeHtml(auditPreview.runId)}</code></p>
        <p><strong>timestamp:</strong> ${escapeHtml(auditPreview.timestampLabel)}</p>
        <p><strong>target:</strong> ${escapeHtml(auditPreview.target)} · <strong>targetStatus:</strong> ${escapeHtml(auditPreview.targetStatus)} · <strong>status:</strong> ${escapeHtml(auditPreview.status)}</p>
        <p><strong>included/excluded:</strong> ${escapeHtml(auditPreview.includedModules.length)} / ${escapeHtml(auditPreview.excludedModules.length)} modules · <strong>totalPreviewItems:</strong> ${escapeHtml(auditPreview.totalPreviewItems)}</p>
        <div class="aha-sync-validation-columns">
          <div>
            <strong>Included</strong>
            <div class="aha-sync-audit-chip-list">${renderAhaManualSyncAuditModuleList(auditPreview.includedModules, "None included.")}</div>
          </div>
          <div>
            <strong>Excluded</strong>
            <div class="aha-sync-audit-chip-list">${renderAhaManualSyncAuditModuleList(auditPreview.excludedModules, "None excluded.")}</div>
          </div>
        </div>
        <p><strong>writeStatus:</strong> ${escapeHtml(auditPreview.writeStatus)}</p>
      </div>
    `;
  }

  function uniqueAhaSyncMessages(items) {
    return [...new Set((items || []).filter(Boolean))];
  }

  function buildAhaManualSyncRunSummaryPreview(plan, payloadPreview, checklist, auditPreview = null, previewTarget = getAhaManualSyncPreviewTarget()) {
    try {
      const safePlan = Array.isArray(plan) ? plan : buildAhaSyncDryRunPlan();
      const safePayloadPreview = payloadPreview || buildAhaSyncPayloadPreview(safePlan);
      const safeChecklist = checklist || buildAhaSyncOperatorChecklist(safePlan, safePayloadPreview);
      const safePreviewTarget = getAhaManualSyncPreviewTarget(previewTarget?.id);
      const safeAuditPreview = auditPreview || buildAhaManualSyncAuditLogPreview(safePlan, safePayloadPreview, safeChecklist, safePreviewTarget);
      const validationSummary = summarizeSyncHubValidation(safePlan);
      const checklistSummary = safeChecklist.summary || { passed: 0, warning: 0, blocked: 0 };
      const adapterStatus = getAhaManualSyncAdapterPreviewStatus();
      const stateMachineStatus = getAhaManualSyncStateMachinePreviewStatus();
      const readinessStatus = safeChecklist.readiness === "passed" ? "ready" : safeChecklist.readiness;
      const targetStatus = getAhaManualSyncPreviewTargetAuditStatus(safePreviewTarget);
      const includedModules = (safePayloadPreview.modules || []).filter((modulePreview) => modulePreview.included).map((modulePreview) => modulePreview.id);
      const excludedModules = (safePayloadPreview.modules || []).filter((modulePreview) => !modulePreview.included).map((modulePreview) => modulePreview.id);

      const blockers = [];
      const warnings = [];

      if (readinessStatus === "blocked") blockers.push("Readiness gate is blocked.");
      if (readinessStatus === "warning") blockers.push("Readiness gate has warnings that must be reviewed.");
      if (validationSummary.errorCount > 0) blockers.push(`${validationSummary.errorCount} validation error${validationSummary.errorCount === 1 ? "" : "s"} found.`);
      if (checklistSummary.blocked > 0) blockers.push(`${checklistSummary.blocked} blocked checklist item${checklistSummary.blocked === 1 ? "" : "s"}.`);
      if (targetStatus === "not_configured") blockers.push("No target is connected.");
      if (adapterStatus.canExecute !== true) blockers.push("Adapter cannot execute with the current target/write layer.");
      if (stateMachineStatus.canExecute !== true) blockers.push("State machine cannot execute with the current gates.");
      if (Number(safePayloadPreview.modulesIncluded || 0) === 0) blockers.push("Payload preview has 0 included modules.");

      if (readinessStatus === "warning") warnings.push("Readiness gate has warnings.");
      if (validationSummary.warningCount > 0) warnings.push(`${validationSummary.warningCount} validation warning${validationSummary.warningCount === 1 ? "" : "s"} found.`);
      if (checklistSummary.warning > 0) warnings.push(`${checklistSummary.warning} checklist warning${checklistSummary.warning === 1 ? "" : "s"}.`);
      if (targetStatus === "future_only") warnings.push("Selected target is preview-only and still not connected.");
      (safeAuditPreview.warnings || []).forEach((message) => warnings.push(message));
      (safePayloadPreview.modules || []).forEach((modulePreview) => {
        (modulePreview.warnings || []).forEach((message) => warnings.push(`${modulePreview.name}: ${message}`));
      });

      const summaryStatus = blockers.length ? "blocked" : "ready";

      return {
        ok: true,
        summaryStatus,
        previewRunId: safeAuditPreview.runId || createAhaManualSyncPreviewRunId(new Date()),
        timestamp: safeAuditPreview.timestamp || new Date().toISOString(),
        timestampLabel: safeAuditPreview.timestampLabel || "preview-generated, not written",
        selectedPreviewTarget: safePreviewTarget.id,
        targetStatus,
        adapterStatus: adapterStatus.adapterStatus || "manual_gated_existing_database_target",
        adapterWriteStatus: adapterStatus.writeStatus || "manual_gated_existing_database_target",
        stateMachineState: stateMachineStatus.currentState || "blocked",
        stateMachineWriteStatus: stateMachineStatus.writeStatus || "manual_gated_existing_database_target",
        canExecute: blockers.length === 0,
        canWrite: blockers.length === 0,
        includedModules,
        excludedModules,
        totalPreviewItems: Number(safePayloadPreview.totalPreviewItems || 0),
        validation: {
          validCount: validationSummary.modulesReady,
          warningCount: validationSummary.warningCount,
          errorCount: validationSummary.errorCount
        },
        readinessStatus,
        checklist: {
          passedCount: checklistSummary.passed || 0,
          warningCount: checklistSummary.warning || 0,
          blockedCount: checklistSummary.blocked || 0
        },
        audit: {
          auditStatus: safeAuditPreview.status || "preview_only",
          writeStatus: safeAuditPreview.writeStatus || "disabled_preview_only",
          rollbackStatus: safeAuditPreview.rollbackStatus || "not_available_preview_only"
        },
        blockers: uniqueAhaSyncMessages(blockers),
        warnings: uniqueAhaSyncMessages(warnings),
        nextRequiredSteps: AHA_MANUAL_SYNC_NEXT_REQUIRED_STEPS.slice()
      };
    } catch (error) {
      console.warn("AHADashboard: kunne ikke bygge run summary preview", error);
      return {
        ok: false,
        summaryStatus: "blocked",
        previewRunId: createAhaManualSyncPreviewRunId(new Date()),
        timestamp: new Date().toISOString(),
        timestampLabel: "preview-generated, not written",
        selectedPreviewTarget: getAhaManualSyncPreviewTarget().id,
        targetStatus: getAhaManualSyncPreviewTargetAuditStatus(),
        adapterStatus: "manual_gated_existing_database_target",
        adapterWriteStatus: "manual_gated_existing_database_target",
        stateMachineState: "blocked",
        stateMachineWriteStatus: "manual_gated_existing_database_target",
        canExecute: false,
        canWrite: false,
        includedModules: [],
        excludedModules: [],
        totalPreviewItems: 0,
        validation: { validCount: 0, warningCount: 0, errorCount: 1 },
        readinessStatus: "blocked",
        checklist: { passedCount: 0, warningCount: 0, blockedCount: 1 },
        audit: { auditStatus: "preview_only", writeStatus: "disabled_preview_only", rollbackStatus: "not_available_preview_only" },
        blockers: ["Run summary preview could not be built. Manual sync remains disabled."],
        warnings: [],
        nextRequiredSteps: AHA_MANUAL_SYNC_NEXT_REQUIRED_STEPS.slice()
      };
    }
  }


  function buildAhaManualSyncDryRunHarnessPreview(plan, payloadPreview, checklist, auditPreview, runSummaryPreview, previewTarget = getAhaManualSyncPreviewTarget()) {
    const adapterApi = window.AHAManualSyncAdapter;
    const validationSummary = summarizeSyncHubValidation(Array.isArray(plan) ? plan : []);
    const stateMachineStatus = getAhaManualSyncStateMachinePreviewStatus();
    const targetStatus = getAhaManualSyncPreviewTargetAuditStatus(previewTarget);
    const input = {
      target: { id: previewTarget.id, status: targetStatus },
      payloadPreview,
      validation: {
        status: validationSummary.errorCount > 0 ? "invalid" : "valid_preview",
        validCount: validationSummary.modulesReady,
        warningCount: validationSummary.warningCount,
        errorCount: validationSummary.errorCount
      },
      readiness: { status: runSummaryPreview?.readinessStatus || checklist?.readiness || "blocked" },
      checklist,
      auditPreview,
      adapterStatus: getAhaManualSyncAdapterPreviewStatus(),
      stateMachineStatus
    };

    if (adapterApi?.runAhaManualSyncTargetDryRun) {
      try {
        return adapterApi.runAhaManualSyncTargetDryRun(input);
      } catch (error) {
        console.warn("AHADashboard: kunne ikke bygge target adapter dry-run", error);
      }
    }

    return {
      ok: false,
      mode: "dry_run",
      status: "blocked",
      target: previewTarget.id,
      targetStatus,
      canExecute: false,
      canWrite: false,
      wouldExecute: false,
      wouldWrite: false,
      includedModules: runSummaryPreview?.includedModules || [],
      excludedModules: runSummaryPreview?.excludedModules || [],
      itemCounts: {},
      totalItems: Number(runSummaryPreview?.totalPreviewItems || 0),
      validationSummary: input.validation,
      readinessStatus: input.readiness.status,
      checklistSummary: runSummaryPreview?.checklist || { passedCount: 0, warningCount: 0, blockedCount: 1 },
      auditPreviewSummary: runSummaryPreview?.audit || { auditStatus: "preview_only", writeStatus: "disabled_preview_only", rollbackStatus: "not_available_preview_only" },
      stateMachineState: stateMachineStatus.currentState || "blocked",
      blockers: uniqueAhaSyncMessages([getAhaManualSyncPreviewTargetGateReason(previewTarget), "Adapter dry-run harness is unavailable in dashboard runtime; execution remains disabled.", ...(runSummaryPreview?.blockers || [])]),
      warnings: runSummaryPreview?.warnings || [],
      errors: [],
      message: "Target adapter dry-run is blocked. No execution or write is available.",
      writeStatus: "disabled_dry_run_only",
      rollbackStatus: "not_available_dry_run_only"
    };
  }

  function renderAhaManualSyncTargetDryRunHarness(dryRun) {
    return `
      <div class="aha-sync-target-dry-run" aria-label="AHA manual sync target adapter dry-run">
        <div class="aha-sync-prep-heading">
          <h4>Target adapter dry-run</h4>
          <p class="aha-sync-prep-notice">Dry-run only. No data is written until explicit confirmation.</p>
          <p class="aha-sync-validation-summary">status: ${escapeHtml(dryRun.status)} · target: ${escapeHtml(dryRun.target)} · writeStatus: ${escapeHtml(dryRun.writeStatus)}</p>
        </div>
        <div class="aha-sync-run-summary-grid">
          <p><strong>targetStatus:</strong> ${escapeHtml(dryRun.targetStatus)}</p>
          <p><strong>canExecute:</strong> ${escapeHtml(dryRun.canExecute)}</p>
          <p><strong>canWrite:</strong> ${escapeHtml(dryRun.canWrite)}</p>
          <p><strong>wouldExecute:</strong> ${escapeHtml(dryRun.wouldExecute)}</p>
          <p><strong>wouldWrite:</strong> ${escapeHtml(dryRun.wouldWrite)}</p>
          <p><strong>totalItems:</strong> ${escapeHtml(dryRun.totalItems)}</p>
          <p><strong>stateMachineState:</strong> ${escapeHtml(dryRun.stateMachineState)}</p>
          <p><strong>rollbackStatus:</strong> ${escapeHtml(dryRun.rollbackStatus)}</p>
        </div>
        <div class="aha-sync-validation-columns">
          <div>
            <h5>Included modules</h5>
            <div class="aha-sync-run-summary-chip-list">${renderAhaManualSyncRunSummaryModules(dryRun.includedModules || [], "None included.")}</div>
          </div>
          <div>
            <h5>Excluded modules</h5>
            <div class="aha-sync-run-summary-chip-list">${renderAhaManualSyncRunSummaryModules(dryRun.excludedModules || [], "None excluded.")}</div>
          </div>
        </div>
        <div class="aha-sync-validation-columns">
          <div>
            <h5>Blockers</h5>
            ${renderAhaSyncStatusList(dryRun.blockers || [], "No blockers in this dry-run preview.")}
          </div>
          <div>
            <h5>Warnings</h5>
            ${renderAhaSyncStatusList(dryRun.warnings || [], "No warnings in this dry-run preview.")}
          </div>
        </div>
      </div>
    `;
  }

  function renderAhaManualSyncConfirmationDryRunStatus(dryRun) {
    return `
      <div class="aha-sync-confirmation-section aha-sync-target-dry-run-confirmation">
        <h5>Target adapter dry-run</h5>
        <p class="aha-sync-prep-notice">Dry-run only. No data is written unless Confirm sync is enabled and clicked.</p>
        <p><strong>status:</strong> ${escapeHtml(dryRun.status)} · <strong>target:</strong> ${escapeHtml(dryRun.target)} · <strong>writeStatus:</strong> ${escapeHtml(dryRun.writeStatus)}</p>
        <p><strong>canExecute:</strong> ${escapeHtml(dryRun.canExecute)} · <strong>canWrite:</strong> ${escapeHtml(dryRun.canWrite)}</p>
      </div>
    `;
  }

  function renderAhaManualSyncRunSummaryModules(modules, emptyLabel) {
    if (!modules.length) return `<span>${escapeHtml(emptyLabel)}</span>`;
    return modules.map((moduleId) => `<span>${escapeHtml(moduleId)}</span>`).join("");
  }

  function renderAhaManualSyncRunSummaryPreview(summary) {
    return `
      <div class="aha-sync-run-summary-preview" aria-label="AHA manual sync run summary preview">
        <div class="aha-sync-prep-heading">
          <h4>Run summary preview</h4>
          <p class="aha-sync-prep-notice">Preview only. No run is executed until explicit confirmation.</p>
          <p class="aha-sync-unavailable-notice">Manual sync remains gated. Confirm sync is enabled only when readiness, validation, checklist, target, adapter, and state machine gates pass.</p>
          <p class="aha-sync-validation-summary">summaryStatus: ${escapeHtml(summary.summaryStatus)} · previewRunId: ${escapeHtml(summary.previewRunId)}</p>
        </div>
        <div class="aha-sync-run-summary-grid">
          <p><strong>selectedPreviewTarget:</strong> ${escapeHtml(summary.selectedPreviewTarget)}</p>
          <p><strong>targetStatus:</strong> ${escapeHtml(summary.targetStatus)}</p>
          <p><strong>adapterStatus:</strong> ${escapeHtml(summary.adapterStatus)}</p>
          <p><strong>stateMachineState:</strong> ${escapeHtml(summary.stateMachineState)}</p>
          <p><strong>canExecute:</strong> ${escapeHtml(summary.canExecute)}</p>
          <p><strong>canWrite:</strong> ${escapeHtml(summary.canWrite)}</p>
          <p><strong>totalPreviewItems:</strong> ${escapeHtml(summary.totalPreviewItems)}</p>
          <p><strong>readinessStatus:</strong> ${escapeHtml(summary.readinessStatus)}</p>
          <p><strong>validation:</strong> ${escapeHtml(summary.validation.validCount)} valid · ${escapeHtml(summary.validation.warningCount)} warnings · ${escapeHtml(summary.validation.errorCount)} errors</p>
          <p><strong>checklist:</strong> ${escapeHtml(summary.checklist.passedCount)} passed · ${escapeHtml(summary.checklist.warningCount)} warning · ${escapeHtml(summary.checklist.blockedCount)} blocked</p>
          <p><strong>audit/write/rollback:</strong> ${escapeHtml(summary.audit.auditStatus)} · ${escapeHtml(summary.audit.writeStatus)} · ${escapeHtml(summary.audit.rollbackStatus)}</p>
        </div>
        <div class="aha-sync-validation-columns">
          <div>
            <h5>Included modules</h5>
            <div class="aha-sync-run-summary-chip-list">${renderAhaManualSyncRunSummaryModules(summary.includedModules, "None included.")}</div>
          </div>
          <div>
            <h5>Excluded modules</h5>
            <div class="aha-sync-run-summary-chip-list">${renderAhaManualSyncRunSummaryModules(summary.excludedModules, "None excluded.")}</div>
          </div>
        </div>
        <div class="aha-sync-validation-columns">
          <div>
            <h5>Blockers</h5>
            ${renderAhaSyncStatusList(summary.blockers, "No blockers in this preview.")}
          </div>
          <div>
            <h5>Warnings</h5>
            ${renderAhaSyncStatusList(summary.warnings, "No warnings in this preview.")}
          </div>
        </div>
        <div class="aha-sync-validation-block">
          <h5>Next required steps</h5>
          ${renderAhaSyncStatusList(summary.nextRequiredSteps, "No next steps.")}
        </div>
      </div>
    `;
  }

  function renderAhaManualSyncConfirmationRunSummary(summary) {
    const topBlockers = summary.blockers.slice(0, 3);
    const nextStep = summary.nextRequiredSteps[0] ? [summary.nextRequiredSteps[0]] : [];

    return `
      <div class="aha-sync-confirmation-section aha-sync-run-summary-confirmation">
        <h5>Run summary preview</h5>
        <p class="aha-sync-prep-notice">Preview only. No data is written unless Confirm sync is enabled and clicked.</p>
        <p><strong>summaryStatus:</strong> ${escapeHtml(summary.summaryStatus)} · <strong>target:</strong> ${escapeHtml(summary.selectedPreviewTarget)} · <strong>totalPreviewItems:</strong> ${escapeHtml(summary.totalPreviewItems)}</p>
        <p><strong>canExecute:</strong> ${escapeHtml(summary.canExecute)} · <strong>canWrite:</strong> ${escapeHtml(summary.canWrite)}</p>
        <strong>Key blockers</strong>
        ${renderAhaSyncStatusList(topBlockers, "No blockers in this preview.")}
        <strong>Next required step</strong>
        ${renderAhaSyncStatusList(nextStep, "No next step.")}
      </div>
    `;
  }

  function buildAhaManualSyncGate(plan, payloadPreview, checklist, previewTarget = getAhaManualSyncPreviewTarget()) {
    const summary = summarizeSyncHubValidation(plan);
    const modulesIncluded = Number(payloadPreview?.modulesIncluded || 0);
    const blockedChecklistItems = (checklist.items || []).filter((item) => item.status === "blocked");
    const warningChecklistItems = (checklist.items || []).filter((item) => item.status === "warning");
    const adapterStatus = getAhaManualSyncAdapterPreviewStatus();
    const stateMachineStatus = getAhaManualSyncStateMachinePreviewStatus();
    const targetStatus = getAhaManualSyncPreviewTargetAuditStatus(previewTarget);
    const gateReasons = [];

    if (targetStatus !== "configured") gateReasons.push(getAhaManualSyncPreviewTargetGateReason(previewTarget));
    if (checklist.readiness !== "passed") gateReasons.push(checklist.readiness === "blocked" ? "Readiness gate is blocked." : "Readiness gate has warnings that must be reviewed.");
    if (summary.errorCount > 0) gateReasons.push(`${summary.errorCount} validation error${summary.errorCount === 1 ? "" : "s"} found.`);
    if (modulesIncluded === 0) gateReasons.push("Payload preview includes no modules.");
    if (blockedChecklistItems.length > 0) blockedChecklistItems.forEach((item) => gateReasons.push(`${item.label}: ${item.reason}`));
    if (adapterStatus.canExecute !== true) gateReasons.push("Adapter canExecute is false for the current target.");
    if (stateMachineStatus.canExecute !== true) gateReasons.push("State machine canExecute is false for the current gates.");
    warningChecklistItems.forEach((item) => gateReasons.push(`${item.label}: ${item.reason}`));

    return [...new Set(gateReasons)];
  }

  function canConfirmAhaManualSync(plan, payloadPreview, checklist, previewTarget = getAhaManualSyncPreviewTarget()) {
    return buildAhaManualSyncGate(plan, payloadPreview, checklist, previewTarget).length === 0;
  }

  function renderAhaManualSyncResult(result = lastAhaManualSyncResult) {
    if (!result) return "";
    const status = result.status || "blocked";
    const reason = result.reason || result.error || "No result details.";
    const auditStatus = result.auditStatus || result.auditResult?.status || "not_configured";
    const auditId = result.auditId || result.auditResult?.auditId || "";
    const auditErrors = Array.isArray(result.auditResult?.errors) ? result.auditResult.errors : [];
    const auditLabel = auditStatus === "success"
      ? "Audit log written"
      : auditStatus === "not_configured"
        ? "Audit log not configured"
        : `Audit log ${auditStatus}`;
    return `
      <div class="aha-sync-validation-block aha-sync-result aha-sync-result-${escapeHtml(status)}" aria-live="polite">
        <h5>Last run</h5>
        <p><strong>status:</strong> ${escapeHtml(status)}</p>
        <p>${escapeHtml(reason)}</p>
        <p><strong>auditStatus:</strong> ${escapeHtml(auditStatus)} · ${escapeHtml(auditLabel)}${auditId ? ` · <strong>auditId:</strong> ${escapeHtml(auditId)}` : ""}</p>
        ${auditErrors.length ? `<p><strong>audit error:</strong> ${escapeHtml(auditErrors.join("; "))}</p>` : ""}
      </div>
    `;
  }

  function renderAhaManualSyncGate(plan, payloadPreview, checklist) {
    const activeTarget = getAhaManualSyncPreviewTarget();
    const gateReasons = buildAhaManualSyncGate(plan, payloadPreview, checklist, activeTarget);
    const canConfirm = gateReasons.length === 0;
    const primaryReason = gateReasons[0] || "All gates passed. Open the modal and explicitly confirm one manual sync run.";

    return `
      <div class="aha-sync-manual-gate" aria-label="AHA Sync Hub manual sync gate">
        <div class="aha-sync-prep-heading">
          <p class="eyebrow">Manual sync</p>
          <h4>Manual sync</h4>
          <p class="aha-sync-unavailable-notice">Manual sync is gated; no auto-sync exists.</p>
        </div>
        <div class="aha-sync-manual-actions">
          <button type="button" class="aha-sync-manual-button" disabled aria-disabled="true" aria-describedby="aha-sync-manual-disabled-reason">Manual sync</button>
          <button id="aha-sync-confirmation-preview" type="button" class="aha-sync-confirmation-preview-button" aria-haspopup="dialog">Prepare sync</button>
        </div>
        <div id="aha-sync-manual-disabled-reason" class="aha-sync-validation-block">
          <h5>Gate status</h5>
          <p class="aha-sync-validation-status aha-sync-validation-status-${canConfirm ? "passed" : "blocked"}">${escapeHtml(primaryReason)}</p>
          <ul class="aha-sync-manual-reasons">
            ${gateReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
          </ul>
        </div>
        ${renderAhaManualSyncResult()}
      </div>
    `;
  }


  function buildAhaManualSyncConfirmationModel(plan, payloadPreview, checklist) {
    try {
      const safePlan = Array.isArray(plan) ? plan : buildAhaSyncDryRunPlan();
      const safePayloadPreview = payloadPreview || buildAhaSyncPayloadPreview(safePlan);
      const safeChecklist = checklist || buildAhaSyncOperatorChecklist(safePlan, safePayloadPreview);
      const validationSummary = summarizeSyncHubValidation(safePlan);
      const previewTarget = getAhaManualSyncPreviewTarget();
      const gateReasons = buildAhaManualSyncGate(safePlan, safePayloadPreview, safeChecklist, previewTarget);
      const blockedChecklistItems = (safeChecklist.items || []).filter((item) => item.status === "blocked");
      const warningChecklistItems = (safeChecklist.items || []).filter((item) => item.status === "warning");
      const includedModules = (safePayloadPreview.modules || []).filter((modulePreview) => modulePreview.included);
      const excludedModules = (safePayloadPreview.modules || []).filter((modulePreview) => !modulePreview.included);
      const validationErrorMessages = safePlan.flatMap((row) => (row.errors || []).map((message) => `${row.name}: ${message}`));
      const readinessStatus = safeChecklist.readiness === "passed" ? "ready" : safeChecklist.readiness;

      return {
        ok: true,
        readinessStatus,
        gateReasons,
        previewTarget,
        targetStatus: getAhaManualSyncPreviewTargetAuditStatus(previewTarget),
        writeStatus: getAhaManualSyncPreviewTargetAuditStatus(previewTarget) === "configured" ? "manual_gated_existing_database_target" : "blocked",
        canConfirm: gateReasons.length === 0,
        validationSummary,
        validationErrorMessages,
        payloadPreview: safePayloadPreview,
        includedModules,
        excludedModules,
        checklist: safeChecklist,
        blockedChecklistItems,
        warningChecklistItems
      };
    } catch (error) {
      console.warn("AHADashboard: kunne ikke bygge confirmation modal preview", error);
      return {
        ok: false,
        readinessStatus: "blocked",
        gateReasons: ["Confirmation preview could not be built. Sync remains blocked and disabled."],
        previewTarget: getAhaManualSyncPreviewTarget(),
        targetStatus: getAhaManualSyncPreviewTargetAuditStatus(),
        writeStatus: "blocked",
        canConfirm: false,
        validationSummary: { totalModules: 0, modulesReady: 0, modulesWithWarnings: 0, modulesWithErrors: 1, warningCount: 0, errorCount: 1 },
        validationErrorMessages: ["Could not build validation summary for confirmation preview."],
        payloadPreview: { modules: [], modulesIncluded: 0, modulesExcluded: 0, totalPreviewItems: 0 },
        includedModules: [],
        excludedModules: [],
        checklist: { items: [], summary: { passed: 0, warning: 0, blocked: 1 }, readiness: "blocked" },
        blockedChecklistItems: [{ label: "Confirmation preview", reason: "Could not build modal data safely." }],
        warningChecklistItems: []
      };
    }
  }

  function renderAhaManualSyncConfirmationPayloadModules(modules, emptyLabel) {
    if (!modules.length) return `<p class="aha-sync-validation-empty">${escapeHtml(emptyLabel)}</p>`;

    return `
      <div class="aha-sync-confirmation-module-list">
        ${modules.map((modulePreview) => `
          <div class="aha-sync-prep-row aha-sync-payload-${modulePreview.included ? "included" : "excluded"}">
            <strong>${escapeHtml(modulePreview.name)}</strong>
            <span>${escapeHtml(modulePreview.itemCount)} items</span>
            <small>${modulePreview.included ? "included" : "excluded"}</small>
            <p>${escapeHtml(modulePreview.reason)}</p>
            ${modulePreview.included ? `
              <div class="aha-sync-validation-block">
                <h5>Sample items</h5>
                ${renderAhaSyncPayloadSampleItems(modulePreview)}
              </div>
            ` : ""}
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderAhaManualSyncConfirmationModal(plan, payloadPreview, checklist, auditPreview = null, runSummaryPreview = null, dryRunPreview = null) {
    if (!isAhaManualSyncConfirmationModalOpen) return "";

    const model = buildAhaManualSyncConfirmationModel(plan, payloadPreview, checklist);
    const safeAuditPreview = auditPreview || buildAhaManualSyncAuditLogPreview(plan, payloadPreview, checklist);
    const safeRunSummaryPreview = runSummaryPreview || buildAhaManualSyncRunSummaryPreview(plan, payloadPreview, checklist, safeAuditPreview);
    const safeDryRunPreview = dryRunPreview || buildAhaManualSyncDryRunHarnessPreview(plan, payloadPreview, checklist, safeAuditPreview, safeRunSummaryPreview, model.previewTarget);
    const stateMachineStatus = getAhaManualSyncStateMachinePreviewStatus();
    const validationSummary = model.validationSummary;
    const checklistSummary = model.checklist.summary || { passed: 0, warning: 0, blocked: 0 };
    const blockedChecklistLabels = model.blockedChecklistItems.map((item) => `${item.label}: ${item.reason}`);
    const manualRequirements = [
      "operator must review readiness",
      "operator must review validation warnings/errors",
      "operator must review payload summary",
      "operator must confirm this one sync run",
      "write target must be configured",
      "adapter and state machine gates must allow execution",
      "audit status is surfaced in the result"
    ];

    return `
      <div class="aha-sync-confirmation-backdrop" role="presentation">
        <div class="aha-sync-confirmation-modal" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="aha-sync-confirmation-title" aria-describedby="aha-sync-confirmation-description">
          <div class="aha-sync-confirmation-header">
            <div>
              <p class="eyebrow">AHA manual sync confirmation</p>
              <h4 id="aha-sync-confirmation-title">Confirm manual sync</h4>
              <p id="aha-sync-confirmation-description" class="aha-sync-prep-notice">Manual sync is gated and runs only if you click Confirm sync for this one run.</p>
            </div>
            <button type="button" class="aha-sync-confirmation-close" data-aha-sync-confirmation-close="true" aria-label="Close confirmation preview">Close</button>
          </div>

          <div class="aha-sync-confirmation-section">
            <h5>A. Sync readiness</h5>
            <p class="aha-sync-validation-status aha-sync-validation-status-${escapeHtml(model.readinessStatus === "ready" ? "passed" : model.readinessStatus)}">readiness status: ${escapeHtml(model.readinessStatus)}</p>
            <p class="aha-sync-validation-summary">blocked/warning/ready-status: ${escapeHtml(model.readinessStatus)}</p>
            ${renderAhaSyncStatusList(model.gateReasons, "No gate reasons.")}
          </div>

          <div class="aha-sync-confirmation-section">
            <h5>B. Validation summary</h5>
            <p>${escapeHtml(validationSummary.modulesReady)} modules valid · ${escapeHtml(validationSummary.warningCount)} warnings · ${escapeHtml(validationSummary.errorCount)} errors</p>
            ${validationSummary.errorCount > 0 ? `<p class="aha-sync-validation-status aha-sync-validation-status-blocked">Validation errors found. Confirm sync stays disabled.</p>` : `<p class="aha-sync-validation-status aha-sync-validation-status-passed">No validation errors in the current preview.</p>`}
            ${renderAhaSyncStatusList(model.validationErrorMessages, "No validation error details.")}
          </div>

          <div class="aha-sync-confirmation-section">
            <h5>C. Payload summary</h5>
            <p class="aha-sync-validation-summary">${escapeHtml(model.payloadPreview.modulesIncluded)} included modules · ${escapeHtml(model.payloadPreview.modulesExcluded)} excluded modules · ${escapeHtml(model.payloadPreview.totalPreviewItems)} total preview items</p>
            <strong>Included modules</strong>
            ${renderAhaManualSyncConfirmationPayloadModules(model.includedModules, "No included modules.")}
            <strong>Excluded modules</strong>
            ${renderAhaManualSyncConfirmationPayloadModules(model.excludedModules, "No excluded modules.")}
          </div>

          <div class="aha-sync-confirmation-section">
            <h5>D. Operator checklist</h5>
            <p>${escapeHtml(checklistSummary.passed)} passed · ${escapeHtml(checklistSummary.warning)} warning · ${escapeHtml(checklistSummary.blocked)} blocked</p>
            <strong>Blocked items</strong>
            ${renderAhaSyncStatusList(blockedChecklistLabels, "No blocked checklist items.")}
          </div>

          ${renderAhaManualSyncAuditLogPreviewSummary(safeAuditPreview)}

          <div class="aha-sync-confirmation-section">
            <h5>F. Target preview</h5>
            <p class="aha-sync-prep-notice">Target status is evaluated by the adapter. No data is written until explicit confirmation.</p>
            <p><strong>target:</strong> ${escapeHtml(model.previewTarget.id)} · <strong>targetStatus:</strong> ${escapeHtml(model.targetStatus)} · <strong>writeStatus:</strong> ${escapeHtml(model.writeStatus)}</p>
          </div>

          <div class="aha-sync-confirmation-section">
            <h5>G. Execution state machine</h5>
            <p class="aha-sync-prep-notice">Gated flow: blocked → confirmed → running → success/failed. Running requires explicit confirmation.</p>
            <p><strong>currentState:</strong> ${escapeHtml(stateMachineStatus.currentState)} · <strong>canExecute:</strong> ${escapeHtml(stateMachineStatus.canExecute)} · <strong>writeStatus:</strong> ${escapeHtml(stateMachineStatus.writeStatus)}</p>
          </div>

          ${renderAhaManualSyncConfirmationRunSummary(safeRunSummaryPreview)}
          ${renderAhaManualSyncConfirmationDryRunStatus(safeDryRunPreview)}

          <div class="aha-sync-confirmation-section">
            <h5>H. Manual confirmation requirements</h5>
            <ul class="aha-sync-manual-requirements">
              ${manualRequirements.map((requirement) => `<li>${escapeHtml(requirement)}</li>`).join("")}
            </ul>
          </div>

          <div class="aha-sync-confirmation-actions">
            <button type="button" class="aha-sync-confirmation-preview-button" data-aha-sync-confirmation-close="true">Cancel</button>
            <button type="button" class="aha-sync-confirmation-preview-button" data-aha-sync-confirmation-close="true">Close</button>
            <button id="aha-sync-confirm-run" type="button" class="aha-sync-manual-button"${model.canConfirm ? "" : " disabled aria-disabled=\"true\""} title="Confirm one gated manual sync run">Confirm sync</button>
            <p class="aha-sync-prep-notice">${model.canConfirm ? "Enabled because all gates passed. No sync has run yet." : "Disabled until all gates pass."}</p>
          </div>
        </div>
      </div>
    `;
  }

  function getAhaManualSyncHistoryHelpers() {
    return window.AHAManualSyncHistory || null;
  }

  async function loadAhaManualSyncHistoryPreview() {
    const loader = window.AHAManualSyncAdapter?.loadAhaManualSyncHistory;
    const sanitizer = getAhaManualSyncHistoryHelpers()?.sanitizeAhaManualSyncHistoryDetails;
    if (typeof loader !== "function" || typeof sanitizer !== "function") {
      ahaManualSyncHistoryState = { status: "not_configured", entries: [], reason: "History reader is not configured." };
      return ahaManualSyncHistoryState;
    }

    ahaManualSyncHistoryState = { ...ahaManualSyncHistoryState, status: "loading", reason: null };
    const result = await loader({ limit: 20 });
    if (!result?.ok) {
      ahaManualSyncHistoryState = { status: result?.status || "unavailable", entries: [], reason: result?.reason || "History is unavailable." };
      return ahaManualSyncHistoryState;
    }

    ahaManualSyncHistoryState = {
      status: "loaded",
      entries: (result.entries || []).map((entry) => sanitizer(entry)),
      reason: null
    };
    return ahaManualSyncHistoryState;
  }

  function getAhaManualSyncRetryPreview(run) {
    const builder = getAhaManualSyncHistoryHelpers()?.buildAhaManualSyncRetryEligibilityPreview;
    return typeof builder === "function" ? builder(run) : null;
  }

  function renderAhaManualSyncHistoryList() {
    const state = ahaManualSyncHistoryState;
    if (state.status === "loading" || state.status === "idle") return '<p class="aha-sync-history-empty">Loading sync history …</p>';
    if (state.status !== "loaded") return '<div class="aha-compact-state aha-compact-state-error" role="status"><strong>Could not read sync history.</strong><span>View diagnostics for technical details.</span></div>';
    if (!state.entries.length) return '<p class="aha-sync-history-empty">No manual sync runs yet.</p>';

    return `
      <ol class="aha-sync-history-list">
        ${state.entries.map((run) => {
          const preview = getAhaManualSyncRetryPreview(run);
          const badge = preview?.status === "eligible_preview"
            ? "Retry eligible preview"
            : preview?.status === "not_eligible"
              ? "Retry not applicable"
              : "Retry blocked";
          const badgeStatus = preview?.status || "unknown";
          return `
            <li class="aha-sync-history-row">
              <div>
                <strong>${escapeHtml(formatAhaStatusLabel(run.resultStatus))}</strong>
                <span>${escapeHtml(run.target || "Missing target")} · ${escapeHtml(run.totalItems)} items</span>
                <small>${escapeHtml(run.timestamp || "Unknown time")} · <code>${escapeHtml(run.runId || "missing runId")}</code></small>
              </div>
              <div class="aha-sync-history-actions">
                <span class="aha-sync-retry-badge aha-sync-retry-${escapeHtml(badgeStatus)}">${escapeHtml(badge)}</span>
                <button type="button" class="aha-sync-history-details-button" data-aha-sync-history-run-id="${escapeHtml(run.runId)}">View details</button>
              </div>
            </li>
          `;
        }).join("")}
      </ol>
    `;
  }

  function renderAhaManualSyncHistoryDetailsDrawer() {
    const run = ahaManualSyncHistoryState.entries.find((entry) => entry.runId === selectedAhaManualSyncHistoryRunId);
    if (!run) return "";
    const preview = getAhaManualSyncRetryPreview(run);
    if (!preview) return "";
    const renderList = (items, emptyLabel) => items?.length
      ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : `<p class="aha-sync-validation-empty">${escapeHtml(emptyLabel)}</p>`;
    const itemCounts = Object.entries(preview.itemCounts || {});

    return `
      <aside id="aha-sync-history-drawer" class="aha-sync-history-drawer" role="region" aria-labelledby="aha-sync-history-details-title" aria-describedby="aha-sync-history-details-description" tabindex="-1">
        <div class="aha-sync-history-drawer-header">
          <div>
            <p class="eyebrow">Manual sync history</p>
            <h5 id="aha-sync-history-details-title">Sync run details</h5>
            <p id="aha-sync-history-details-description" class="aha-sync-prep-notice">Read-only summary. Payload and credentials are not shown.</p>
          </div>
          <button id="aha-sync-history-details-close" type="button" class="aha-sync-history-details-button" aria-label="Close sync run details">Close</button>
        </div>
        <dl class="aha-sync-history-details-grid">
          <div><dt>runId</dt><dd><code>${escapeHtml(run.runId || "missing")}</code></dd></div>
          <div><dt>Result</dt><dd>${escapeHtml(run.resultStatus)}</dd></div>
          <div><dt>Target</dt><dd>${escapeHtml(run.target || "missing")} · ${escapeHtml(run.targetStatus)}</dd></div>
          <div><dt>Items</dt><dd>${escapeHtml(run.totalItems)}</dd></div>
        </dl>
        <section class="aha-sync-retry-preview" aria-label="Retry eligibility">
          <h5>Retry eligibility</h5>
          <p class="aha-sync-prep-notice">Read-only eligibility preview. Retry is not available.</p>
          <dl class="aha-sync-history-details-grid">
            <div><dt>retryEligible</dt><dd>${escapeHtml(preview.retryEligible)}</dd></div>
            <div><dt>status</dt><dd>${escapeHtml(preview.status)}</dd></div>
            <div><dt>retryMode</dt><dd>${escapeHtml(preview.retryMode)}</dd></div>
            <div><dt>Original target</dt><dd>${escapeHtml(preview.target || "missing")} · ${escapeHtml(preview.targetStatus)}</dd></div>
          </dl>
          <p><strong>Reason:</strong> ${escapeHtml(preview.reason)}</p>
          <div class="aha-sync-validation-columns">
            <div><strong>Blockers</strong>${renderList(preview.blockers, "No active blockers.")}</div>
            <div><strong>Warnings</strong>${renderList(preview.warnings, "No warnings.")}</div>
          </div>
          <div><strong>Modules</strong>${renderList(preview.modules, "No module data found.")}</div>
          <div>
            <strong>Item counts</strong>
            ${itemCounts.length ? `<div class="aha-sync-audit-counts">${itemCounts.map(([moduleId, count]) => `<span><strong>${escapeHtml(moduleId)}</strong>: ${escapeHtml(count)}</span>`).join("")}</div>` : '<p class="aha-sync-validation-empty">No module data found.</p>'}
          </div>
          <div><strong>Required before retry</strong>${renderList(preview.requiredBeforeRetry, "No action required.")}</div>
        </section>
      </aside>
    `;
  }

  function renderAhaManualSyncHistoryPanel() {
    return `
      <section class="aha-sync-history-panel" aria-label="Manual sync history">
        <div class="aha-sync-prep-heading">
          <h4>Manual sync history</h4>
          <p class="aha-sync-prep-notice">Latest manual sync runs. Read-only.</p>
        </div>
        ${renderAhaManualSyncHistoryList()}
        ${renderAhaManualSyncHistoryDetailsDrawer()}
      </section>
    `;
  }

  function focusAhaManualSyncHistoryButton(runId) {
    [...document.querySelectorAll("[data-aha-sync-history-run-id]")]
      .find((button) => button.dataset.ahaSyncHistoryRunId === runId)?.focus();
  }

  function bindAhaManualSyncHistoryPreview() {
    document.querySelectorAll("[data-aha-sync-history-run-id]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedAhaManualSyncHistoryRunId = button.dataset.ahaSyncHistoryRunId || null;
        renderSyncHubStatus();
        $("aha-sync-history-drawer")?.focus();
      });
    });
    $("aha-sync-history-details-close")?.addEventListener("click", () => {
      const runId = selectedAhaManualSyncHistoryRunId;
      selectedAhaManualSyncHistoryRunId = null;
      renderSyncHubStatus();
      focusAhaManualSyncHistoryButton(runId);
    });
  }

  function renderSyncHubPrepPanel(plan) {
    if (!isSyncHubPrepOpen) return "";

    const payloadPreview = buildAhaSyncPayloadPreview(plan);
    const operatorChecklist = buildAhaSyncOperatorChecklist(plan, payloadPreview);
    const previewTarget = getAhaManualSyncPreviewTarget();
    const auditPreview = buildAhaManualSyncAuditLogPreview(plan, payloadPreview, operatorChecklist, previewTarget);
    const runSummaryPreview = buildAhaManualSyncRunSummaryPreview(plan, payloadPreview, operatorChecklist, auditPreview, previewTarget);
    const dryRunPreview = buildAhaManualSyncDryRunHarnessPreview(plan, payloadPreview, operatorChecklist, auditPreview, runSummaryPreview, previewTarget);

    return `
      <div class="aha-sync-prep-panel" id="aha-sync-prep-panel" role="region" aria-label="AHA Sync Hub forberedelse">
        <div class="aha-sync-prep-heading">
          <h4>Dry-run sync plan</h4>
          <p class="aha-sync-prep-notice">Preview only. No data is written and no sync is performed.</p>
          <p class="aha-sync-validation-summary">${escapeHtml(formatSyncHubValidationSummary(plan))}</p>
        </div>
        <div class="aha-sync-prep-list" aria-label="localStorage dry-run sync plan">
          ${plan.map((row) => `
            <div class="aha-sync-prep-row aha-sync-prep-row-${escapeHtml(row.status)} aha-sync-validation-${escapeHtml(row.validationStatus)}">
              <strong>${escapeHtml(row.name)}</strong>
              <span>${escapeHtml(row.count)} items</span>
              <small>${escapeHtml(row.status)}</small>
              <p>${escapeHtml(row.actionPreview)}</p>
              <div class="aha-sync-validation-block" aria-label="${escapeHtml(row.name)} validation">
                <h5>Validation</h5>
                <p class="aha-sync-prep-notice">Read-only validation. No data is changed.</p>
                <p class="aha-sync-validation-status aha-sync-validation-status-${escapeHtml(row.validationStatus)}">validationStatus: ${escapeHtml(row.validationStatus)}</p>
                <div class="aha-sync-validation-columns">
                  <div>
                    <strong>Warnings</strong>
                    ${renderSyncHubValidationMessages(row, "warnings")}
                  </div>
                  <div>
                    <strong>Errors</strong>
                    ${renderSyncHubValidationMessages(row, "errors")}
                  </div>
                </div>
              </div>
            </div>
          `).join("")}
        </div>
        ${renderAhaSyncPayloadPreview(payloadPreview)}
        ${renderAhaManualSyncTargetSelectorPreview()}
        ${renderAhaManualSyncStateMachinePreview()}
        ${renderAhaManualSyncTargetDryRunHarness(dryRunPreview)}
        ${renderAhaSyncOperatorChecklist(operatorChecklist)}
        ${renderAhaManualSyncAuditLogPreview(auditPreview)}
        ${renderAhaManualSyncRunSummaryPreview(runSummaryPreview)}
        ${renderAhaManualSyncGate(plan, payloadPreview, operatorChecklist)}
        ${renderAhaManualSyncConfirmationModal(plan, payloadPreview, operatorChecklist, auditPreview, runSummaryPreview, dryRunPreview)}
      </div>
    `;
  }

  function bindAhaManualSyncConfirmationModal() {
    const previewButton = $("aha-sync-confirmation-preview");
    if (previewButton) {
      previewButton.addEventListener("click", () => {
        isAhaManualSyncConfirmationModalOpen = true;
        isSyncHubPrepOpen = true;
        renderSyncHubStatus();
        $("aha-sync-confirmation-title")?.closest("[role=dialog]")?.focus();
      });
    }

    document.querySelectorAll("[data-aha-sync-confirmation-close='true']").forEach((button) => {
      button.addEventListener("click", () => {
        isAhaManualSyncConfirmationModalOpen = false;
        renderSyncHubStatus();
        $("aha-sync-confirmation-preview")?.focus();
      });
    });

    const confirmButton = $("aha-sync-confirm-run");
    if (confirmButton) {
      confirmButton.addEventListener("click", async () => {
        const plan = buildAhaSyncDryRunPlan();
        const payloadPreview = buildAhaSyncPayloadPreview(plan);
        const operatorChecklist = buildAhaSyncOperatorChecklist(plan, payloadPreview);
        const previewTarget = getAhaManualSyncPreviewTarget();
        if (!canConfirmAhaManualSync(plan, payloadPreview, operatorChecklist, previewTarget)) return;
        try {
          const adapter = window.AHAManualSyncAdapter;
          if (!adapter?.executeAhaManualSyncRun) throw new Error("AHA manual sync adapter is unavailable.");
          lastAhaManualSyncResult = await adapter.executeAhaManualSyncRun({
            target: { id: previewTarget.id, status: getAhaManualSyncPreviewTargetAuditStatus(previewTarget) },
            payloadPreview,
            validation: summarizeSyncHubValidation(plan),
            readiness: { status: operatorChecklist.readiness === "passed" ? "ready" : operatorChecklist.readiness },
            checklist: operatorChecklist,
            auditPreview: buildAhaManualSyncAuditLogPreview(plan, payloadPreview, operatorChecklist, previewTarget),
            confirmationToken: `manual-confirm-${Date.now()}`,
            explicitConfirmation: true
          });
        } catch (error) {
          lastAhaManualSyncResult = { ok: false, status: "failed", reason: error?.message || String(error) };
        }
        isAhaManualSyncConfirmationModalOpen = false;
        renderSyncHubStatus();
      });
    }
  }

  function bindAhaManualSyncTargetSelectorPreview() {
    const selector = $("aha-sync-target-preview-select");
    if (!selector) return;
    selector.addEventListener("change", (event) => {
      selectedPreviewTarget = getAhaManualSyncPreviewTarget(event.target.value).id;
      renderSyncHubStatus();
    });
  }

  function bindSyncHubPrepToggle() {
    const button = $("aha-sync-hub-prep-toggle");
    if (button) {
      button.addEventListener("click", () => {
        isSyncHubPrepOpen = !isSyncHubPrepOpen;
        if (!isSyncHubPrepOpen) isAhaManualSyncConfirmationModalOpen = false;
        renderSyncHubStatus();
        $("aha-sync-hub-prep-toggle")?.focus();
      });
    }
    bindAhaManualSyncConfirmationModal();
    bindAhaManualSyncTargetSelectorPreview();
  }

  function getAhaManualSyncLastRun() {
    if (lastAhaManualSyncResult) {
      return {
        status: lastAhaManualSyncResult.status || "unknown",
        target: lastAhaManualSyncResult.target || getAhaManualSyncPreviewTarget().id,
        timestamp: lastAhaManualSyncResult.timestamp || null,
        auditStatus: lastAhaManualSyncResult.auditStatus || lastAhaManualSyncResult.auditResult?.status || null,
        reason: lastAhaManualSyncResult.reason || lastAhaManualSyncResult.error || null
      };
    }
    const latestHistoryRun = ahaManualSyncHistoryState.entries?.[0] || null;
    if (!latestHistoryRun) return null;
    return {
      ...latestHistoryRun,
      status: latestHistoryRun.status || latestHistoryRun.resultStatus || "unknown",
      auditStatus: latestHistoryRun.auditStatus || latestHistoryRun.audit?.status || null,
      reason: latestHistoryRun.reason || latestHistoryRun.error || null
    };
  }

  function formatAhaStatusLabel(status) {
    const normalized = String(status || "unknown").trim().toLowerCase();
    const labels = {
      ready: "Ready",
      passed: "Ready",
      needs_review: "Needs review",
      blocked: "Blocked",
      warning: "Warning",
      warnings: "Warning",
      missing: "Missing",
      not_configured: "Missing",
      empty: "Empty",
      success: "Success",
      partial_success: "Warning",
      failed: "Failed",
      write_failed: "Failed",
      audit_failed: "Failed",
      unknown: "Unknown"
    };
    return labels[normalized] || "Unknown";
  }

  function isCriticalAhaManualSyncStatus(status) {
    return ["failed", "partial_success", "blocked", "write_failed", "audit_failed"].includes(String(status || "").toLowerCase());
  }

  function renderAhaSyncCompactBlockers(blockers, lastRun) {
    const critical = uniqueAhaSyncMessages([
      ...(blockers || []),
      ...(isCriticalAhaManualSyncStatus(lastRun?.status)
        ? [`${formatAhaStatusLabel(lastRun.status)} last run.`]
        : []),
      ...(String(lastRun?.auditStatus || "").toLowerCase() === "failed" ? ["Last manual sync audit failed."] : [])
    ]);

    if (!critical.length) return '<p class="aha-compact-empty">No active blockers.</p>';
    return `
      <div class="aha-compact-alert" role="alert" aria-label="Active Sync Hub blockers">
        <strong>${critical.length} active blocker${critical.length === 1 ? "" : "s"}</strong>
        <ul>${critical.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul>
      </div>
    `;
  }

  function formatAhaSyncPreviewValue(value) {
    if (typeof value === "boolean") return value ? "true" : "false";
    return String(value ?? "");
  }

  function renderAhaManualSyncDryRunTargetPreview() {
    const adapter = window.AHAManualSyncDryRunTargetAdapter;
    if (typeof adapter?.createManualSyncDryRunPlan !== "function") {
      return `
        <section class="aha-sync-target-preview" aria-label="Per-module result preview">
          <div class="aha-sync-target-preview-heading">
            <div>
              <p class="eyebrow">Dry-run target preview</p>
              <h4>Per-module result preview</h4>
            </div>
            <span class="aha-sync-hub-badge is-blocked">Execution blocked</span>
          </div>
          <p class="aha-sync-target-preview-decision"><strong>Preview only</strong> · No write</p>
          <p class="aha-sync-hub-notice"><strong>Per-module preview unavailable: dry-run adapter not loaded</strong></p>
          <p class="aha-sync-hub-footer">Dry-run target adapter not loaded</p>
        </section>
      `;
    }

    let plan;
    try {
      plan = adapter.createManualSyncDryRunPlan();
    } catch {
      return `
        <section class="aha-sync-target-preview" aria-label="Per-module result preview">
          <div class="aha-sync-target-preview-heading">
            <div>
              <p class="eyebrow">Dry-run target preview</p>
              <h4>Per-module result preview</h4>
            </div>
            <span class="aha-sync-hub-badge is-blocked">Execution blocked</span>
          </div>
          <p class="aha-sync-target-preview-decision"><strong>Preview only</strong> · No write</p>
          <p class="aha-sync-hub-notice"><strong>Per-module preview unavailable</strong></p>
          <p class="aha-sync-hub-footer">Dry-run preview unavailable</p>
        </section>
      `;
    }

    const targets = Array.isArray(plan?.targets) ? plan.targets : [];
    const blockers = Array.isArray(plan?.blockers) ? plan.blockers : [];
    const plannedTargetIds = Array.isArray(plan?.wouldRun) ? plan.wouldRun : [];
    const resultRows = targets.map((target) => {
      const wouldRun = plannedTargetIds.includes(target.targetId) && plan?.executionAllowed === true;
      const wouldWrite = wouldRun && plan?.wouldWrite === true;
      let previewStatus = "preview_only";
      let resultPreview = "Preview only; no execution or write is available.";

      if (target.runtimeLoaded !== true) {
        previewStatus = "runtime_missing";
        resultPreview = "Runtime not loaded; execution remains blocked.";
      } else if (target.syncFunctionAvailable !== true) {
        previewStatus = "sync_function_missing";
        resultPreview = "Sync function unavailable; execution remains blocked.";
      } else if (target.blocked === true || target.executionAllowed !== true) {
        previewStatus = "blocked_no_execution";
        resultPreview = "Runtime inspected; manual execution remains NO-GO.";
      } else {
        previewStatus = "ready_for_future_activation";
        resultPreview = "Preview evidence only; a separate activation decision is still required.";
      }

      return `
        <li class="aha-sync-hub-row">
          <div class="aha-sync-hub-row-heading">
            <strong>${escapeHtml(target.label || target.targetId || "Unknown target")}</strong>
            <span class="aha-sync-hub-badge is-blocked">${escapeHtml(previewStatus)}</span>
          </div>
          <dl class="aha-sync-hub-meta">
            <div><dt>module/label</dt><dd>${escapeHtml(target.label || "Unknown target")}</dd></div>
            <div><dt>targetId</dt><dd><code>${escapeHtml(target.targetId || "")}</code></dd></div>
            <div><dt>previewStatus</dt><dd><code>${escapeHtml(previewStatus)}</code></dd></div>
            <div><dt>localActive</dt><dd>${escapeHtml(formatAhaSyncPreviewValue(target.localActive))}</dd></div>
            <div><dt>localTombstones</dt><dd>${escapeHtml(formatAhaSyncPreviewValue(target.localTombstones))}</dd></div>
            <div><dt>localTotal</dt><dd>${escapeHtml(formatAhaSyncPreviewValue(target.localTotal))}</dd></div>
            <div><dt>runtimeLoaded</dt><dd>${escapeHtml(formatAhaSyncPreviewValue(target.runtimeLoaded))}</dd></div>
            <div><dt>syncFunctionAvailable</dt><dd>${escapeHtml(formatAhaSyncPreviewValue(target.syncFunctionAvailable))}</dd></div>
            <div><dt>executionAllowed</dt><dd>${escapeHtml(formatAhaSyncPreviewValue(target.executionAllowed))}</dd></div>
            <div><dt>dryRunOnly</dt><dd>${escapeHtml(formatAhaSyncPreviewValue(target.dryRunOnly))}</dd></div>
            <div><dt>blocked</dt><dd>${escapeHtml(formatAhaSyncPreviewValue(target.blocked))}</dd></div>
            <div><dt>wouldRun</dt><dd>${escapeHtml(formatAhaSyncPreviewValue(wouldRun))}</dd></div>
            <div><dt>wouldWrite</dt><dd>${escapeHtml(formatAhaSyncPreviewValue(wouldWrite))}</dd></div>
            <div><dt>resultPreview</dt><dd>${escapeHtml(resultPreview)}</dd></div>
          </dl>
        </li>
      `;
    }).join("");
    const blockedTargetCount = targets.filter((target) => target.blocked === true || target.executionAllowed !== true).length;

    return `
      <section class="aha-sync-target-preview" aria-label="Per-module result preview">
        <div class="aha-sync-target-preview-heading">
          <div>
            <p class="eyebrow">Dry-run target preview</p>
            <h4>Per-module result preview</h4>
          </div>
          <span class="aha-sync-hub-badge is-blocked">Execution blocked</span>
        </div>
        <p class="aha-sync-target-preview-decision"><strong>Preview only</strong> · No write · <strong>Manual sync is NO-GO</strong> · Auto-sync permanently forbidden</p>
        <dl class="aha-sync-target-preview-plan">
          <div><dt>mode</dt><dd><code>${escapeHtml(formatAhaSyncPreviewValue(plan?.mode))}</code></dd></div>
          <div><dt>executionAllowed</dt><dd>${escapeHtml(formatAhaSyncPreviewValue(plan?.executionAllowed))}</dd></div>
          <div><dt>autoSync</dt><dd>${escapeHtml(formatAhaSyncPreviewValue(plan?.autoSync))}</dd></div>
          <div><dt>blocked</dt><dd>${escapeHtml(formatAhaSyncPreviewValue(plan?.blocked))}</dd></div>
          <div><dt>wouldWrite</dt><dd>${escapeHtml(formatAhaSyncPreviewValue(plan?.wouldWrite))}</dd></div>
          <div><dt>wouldRun</dt><dd>${plannedTargetIds.length}</dd></div>
          <div><dt>target count</dt><dd>${targets.length}</dd></div>
          <div><dt>blocked target count</dt><dd>${blockedTargetCount}</dd></div>
          <div><dt>reason</dt><dd><code>${escapeHtml(formatAhaSyncPreviewValue(plan?.reason))}</code></dd></div>
          <div><dt>blockers</dt><dd>${escapeHtml(blockers.join(", ") || "none")}</dd></div>
          <div><dt>targets</dt><dd>${targets.length}</dd></div>
        </dl>
        ${resultRows
          ? `<ul class="aha-sync-hub-list" aria-label="Per-module dry-run results">${resultRows}</ul>`
          : '<p class="aha-sync-hub-notice"><strong>No dry-run targets available</strong></p>'}
      </section>
    `;
  }

  function renderAhaSyncChannelsStatus() {
    const mount = $("aha-sync-hub-status");
    if (!mount) return false;

    const channels = Array.isArray(window.AHA_SYNC_CHANNELS)
      ? window.AHA_SYNC_CHANNELS
      : [];
    if (!channels.length) return false;

    const rows = channels.map((channel) => {
      const inputTypes = Array.isArray(channel?.inputTypes) ? channel.inputTypes : [];
      const inputTypeLabels = inputTypes
        .map((inputType) => String(inputType || "").trim())
        .filter(Boolean);
      return `
        <li class="aha-sync-hub-row" data-channel-id="${escapeHtml(channel?.id)}">
          <div class="aha-sync-hub-row-heading">
            <strong>${escapeHtml(channel?.name)}</strong>
          </div>
          <p>${escapeHtml(channel?.purpose)}</p>
          <p><strong>Input types:</strong> ${escapeHtml(inputTypeLabels.join(", ") || "Ingen registrert")}</p>
          <p><strong>Sync-betydning:</strong> ${escapeHtml(channel?.syncMeaning)}</p>
        </li>
      `;
    }).join("");

    mount.className = "aha-sync-hub-status";
    mount.setAttribute("aria-label", "AHA Sync Hub status");
    const routerStatus = window.AHASyncChannelRouter
      ? '<p class="aha-sync-hub-notice"><strong>Channel router: klar for read-only kandidatrouting</strong></p>'
      : "";

    mount.innerHTML = `
      <p class="eyebrow">Sync Hub</p>
      <h3>AHA Sync Hub</h3>
      <p class="aha-panel-subtitle">Samtale- og innsiktskanaler</p>
      ${routerStatus}
      <ul class="aha-sync-hub-list">${rows}</ul>
      <p class="aha-sync-hub-footer">Read-only kanalregister. Ingen backend, ekte sync eller lagring kjøres her. Modul ikke lastet på Home.</p>
    `;
    return true;
  }

  function renderAhaSyncHubStatus() {
    const mount = $("aha-sync-hub-status");
    if (!mount) return;

    if (renderAhaSyncChannelsStatus()) return;

    const projects = Array.isArray(window.AHA_SYNC_HUB_PROJECTS)
      ? window.AHA_SYNC_HUB_PROJECTS
      : [];
    const rows = projects.map((project) => {
      const status = String(project?.status || "").trim();
      const role = String(project?.role || "").trim();
      const source = String(project?.source || "").trim();
      const note = String(project?.note || "").trim();
      const next = String(project?.next || "").trim();
      return `
        <li class="aha-sync-hub-row" data-project-id="${escapeHtml(project?.id)}">
          <div class="aha-sync-hub-row-heading">
            <strong>${escapeHtml(project?.name)}</strong>
            ${status ? `<span class="aha-sync-hub-badge is-planned">${escapeHtml(status)}</span>` : ""}
          </div>
          ${role ? `<p><strong>Rolle:</strong> ${escapeHtml(role)}</p>` : ""}
          ${source ? `<p><strong>Kilde:</strong> ${escapeHtml(source)}</p>` : ""}
          ${note ? `<p>${escapeHtml(note)}</p>` : ""}
          ${next ? `<p><strong>Neste:</strong> ${escapeHtml(next)}</p>` : ""}
        </li>
      `;
    }).join("");

    mount.className = "aha-sync-hub-status";
    mount.setAttribute("aria-label", "AHA Sync Hub status");
    mount.innerHTML = `
      <p class="eyebrow">Sync Hub</p>
      <h3>AHA Sync Hub</h3>
      <p class="aha-panel-subtitle">Legacy utviklingspreview</p>
      ${rows
        ? `<ul class="aha-sync-hub-list">${rows}</ul>`
        : '<p class="aha-sync-hub-notice"><strong>Ingen Sync Hub-kanaler eller legacy-prosjekter registrert ennå.</strong></p>'}
      <p class="aha-sync-hub-footer">Read-only legacy-preview. Videre arbeid skal bygge på AHA_SYNC_CHANNELS, ikke prosjektoversikten.</p>
    `;
  }

  function renderSyncHubStatus() {
    const mount = $("aha-sync-hub-status");
    if (!mount) return;

    if (renderAhaSyncChannelsStatus()) return;

    if (typeof window.AHASyncHub?.inspectAll !== "function") {
      renderAhaSyncHubStatus();
      mount.insertAdjacentHTML("beforeend", `
        <p class="aha-panel-subtitle">Read-only oversikt. Ingen sync kjøres automatisk.</p>
        <p class="aha-sync-hub-notice"><strong>Sync Hub-adapter ikke lastet</strong></p>
        <p class="aha-sync-hub-notice"><strong>Ingen sync kjøres her ennå.</strong></p>
        <p class="aha-sync-hub-footer">Manuell sync kommer senere.</p>
      `);
      return;
    }

    const inspection = window.AHASyncHub.inspectAll();
    renderAhaSyncHubStatus();
    mount.insertAdjacentHTML("beforeend", `
      <p class="aha-panel-subtitle">AHA Sync-status · Read-only oversikt. Ingen sync kjøres automatisk.</p>
      ${renderAhaManualSyncDryRunTargetPreview()}
      <p class="aha-sync-hub-notice"><strong>Ingen sync kjøres her ennå.</strong></p>
      <p class="aha-sync-hub-footer">Manuell sync kommer senere. ${inspection?.modules?.length || 0} modulstatuser er kun preview.</p>
    `);
  }

  function renderIdentity(authState) {
    const user = authState.user;
    const profile = authState.profile;
    const displayName = cleanName(profile?.display_name || "");
    const signedIn = Boolean(user?.id);
    const missingProfile = signedIn && !displayName;
    const profileTitle = displayName || (signedIn ? "Opprett AHA-profil" : "Din AHA-profil");
    const avatarText = initials(displayName || user?.email || "AHA");
    const statusText = !signedIn ? "Ikke innlogget" : missingProfile ? "Mangler profilnavn" : "Innlogget";
    const statusClass = !signedIn ? "is-signed-out" : missingProfile ? "is-missing-profile" : "is-signed-in";

    setText("aha-profile-name", profileTitle);
    setText("aha-profile-subtitle", signedIn
      ? "Din personlige innsiktsmotor"
      : "Logg inn for å gjøre AHA personlig.");
    setText("aha-profile-connection", signedIn
      ? hasHistoryGoPayload() ? "Logget inn · History Go koblet til" : "Logget inn · Klar for History Go-import"
      : "Ikke logget inn · Koble til for å bygge innsikt");
    setText("aha-profile-id", signedIn ? shortId(user.id) : "Ikke innlogget");
    setText("aha-profile-avatar", avatarText);
    setText("aha-header-status", statusText);
    setText("aha-auth-status", statusText);

    setClassState($("aha-header-status"), statusClass);
    setClassState($("aha-auth-status"), statusClass);

    const form = $("aha-auth-form");
    const signOut = $("aha-auth-signout");
    const loginModal = $("aha-login-modal");
    const loginOpen = $("aha-open-login-modal");
    const profileNameModal = $("aha-profile-name-modal");
    const profileNameForm = $("aha-profile-name-form");
    const nameInput = $("aha-profile-name-input");

    form?.classList.toggle("is-hidden", signedIn);
    signOut?.classList.toggle("is-hidden", !signedIn);
    loginOpen?.classList.toggle("is-hidden", signedIn);
    if (signedIn) {
      loginModal?.classList.add("is-hidden");
      loginModal?.setAttribute("aria-hidden", "true");
    }
    profileNameForm?.classList.toggle("is-hidden", !missingProfile);
    if (signedIn && missingProfile) {
      profileNameModal?.classList.remove("is-hidden");
      profileNameModal?.setAttribute("aria-hidden", "false");
    } else {
      profileNameModal?.classList.add("is-hidden");
      profileNameModal?.setAttribute("aria-hidden", "true");
    }

    if (nameInput && displayName) nameInput.value = displayName;
  }

  function renderInsightsActivity(stats) {
    const sourceEvents = statValue(stats, "source_events");
    const imports = statValue(stats, "imports");
    if (sourceEvents > 0) {
      setText("aha-latest-insight", `Du har ${sourceEvents} ${sourceEvents === 1 ? "innsikt" : "innsikter"} tilgjengelig.`);
      setText("aha-insight-empty-hint", "Åpne chat eller innsikter for å bygge videre.");
      return;
    }
    if (imports > 0) {
      setText("aha-latest-insight", "Import fullført. Klar for første innsiktssamtale.");
      setText("aha-insight-empty-hint", "Snakk med AHA for å tolke det du har samlet.");
      return;
    }
    setText("aha-latest-insight", "Ingen importerte innsikter ennå");
    setText("aha-insight-empty-hint", "Importer fra History Go eller start en samtale med AHA.");
  }


  function bindHistoryGoImportTrigger() {
    const importButton = $("btn-import-hg");
    if (!importButton || importButton.dataset.ahaDashboardBound === "true") return;
    importButton.dataset.ahaDashboardBound = "true";
    importButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof window.AHAHistoryGoImport?.importHistoryGoDataFromSharedStorage !== "function") {
        console.warn("AHADashboard: importfunksjon for History Go mangler");
        return;
      }

      try {
        window.AHAHistoryGoImport.importHistoryGoDataFromSharedStorage();
      } catch (error) {
        console.warn("AHADashboard: History Go-import feilet", error);
      }
    });
  }

  function bindImportButtons() {
    const importButtons = ["btn-import-hg-primary", "btn-import-hg-secondary"];
    importButtons.forEach((id) => {
      const button = $(id);
      if (!button || button.dataset.ahaDashboardBound === "true") return;
      button.dataset.ahaDashboardBound = "true";
      button.addEventListener("click", () => {
        const importTrigger = $("btn-import-hg");
        if (importTrigger) importTrigger.click();
      });
    });
  }

  async function renderDashboard() {
    try {
      const authState = await loadAuthState();
      if (authState.user?.id && isHistoryGoLoginReturnRequest()) {
        redirectBackToHistoryGoProfile();
        return;
      }

      const local = localStats();
      let dbResult = { ok: false, fallback: "not_loaded" };
      let stats = local;

      if (authState.user?.id) {
        dbResult = await databaseStats();
        if (dbResult?.ok && dbResult.counts) stats = { ...local, ...dbResult.counts };
      }

      const sourceLabel = localDataSourceLabel(dbResult);
      await loadAhaManualSyncHistoryPreview();
      const moduleHealth = buildModuleHealth(stats, authState);
      lastState = { authState, stats, sourceLabel, moduleHealth };

      renderModules(moduleHealth);
      bindHistoryGoHomeTile();
      bindHistoryGoImportTrigger();
      bindImportButtons();
      renderIdentity(authState);
      renderProfileStats(stats, sourceLabel);
      renderStatCards(stats, sourceLabel, authState, moduleHealth);
      renderSyncHubStatus();
      renderInsightsActivity(stats);
    } catch (error) {
      console.warn("AHADashboard: renderDashboard feilet", error);
      const authState = { user: null, profile: null, profileResult: { ok: false, reason: "render_error", error } };
      const stats = localStats();
      const moduleHealth = buildModuleHealth(stats, authState);
      lastState = { authState, stats, sourceLabel: "localStorage", moduleHealth, error };
      renderModules(moduleHealth);
      bindHistoryGoHomeTile();
      bindHistoryGoImportTrigger();
      bindImportButtons();
      renderIdentity(authState);
      renderProfileStats(stats, "localStorage");
      renderStatCards(stats, "localStorage", authState, moduleHealth);
      renderSyncHubStatus();
      renderInsightsActivity(stats);
      setText("aha-auth-output", "Dashboardet bruker localStorage fordi en innlastingsfeil oppstod.");
    }
  }

  async function saveProfileName(event) {
    event.preventDefault();
    const input = $("aha-profile-name-input");
    const output = $("aha-profile-name-output");
    const name = cleanName(input?.value || "");

    if (!name) {
      if (output) output.textContent = "Skriv inn et navn først.";
      return;
    }

    if (!window.AHAAuth?.saveProfileName) {
      if (output) output.textContent = "AHA-profillagring er ikke klar.";
      return;
    }

    if (output) output.textContent = "Lagrer AHA-profil …";
    const result = await window.AHAAuth.saveProfileName(name);
    if (!result?.ok) {
      if (output) output.textContent = `Kunne ikke lagre profil: ${result?.error?.message || result?.reason || "ukjent feil"}`;
      return;
    }

    if (output) output.textContent = "AHA-profil lagret.";
    await window.AHAAuth.renderAuthStatus?.();
    await renderDashboard();
  }

  function bindProfileNameForm() {
    const form = $("aha-profile-name-form");
    if (!form || form.dataset.ahaDashboardBound === "true") return;
    form.dataset.ahaDashboardBound = "true";
    form.addEventListener("submit", saveProfileName);
  }

  function shouldOpenLoginFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const hash = String(window.location.hash || "").replace(/^#/, "").toLowerCase();
    return (
      params.get("auth") === "login" ||
      params.get("login") === "1" ||
      hash === "login" ||
      hash === "aha-login"
    );
  }

  function bindLoginModal() {
    const modal = $("aha-login-modal");
    const openButton = $("aha-open-login-modal");
    const closeButton = $("aha-close-login-modal");
    const backdrop = $("aha-login-modal-backdrop");
    if (!modal || !openButton || !closeButton || !backdrop || modal.dataset.ahaDashboardBound === "true") return;
    modal.dataset.ahaDashboardBound = "true";

    const closeModal = () => {
      modal.classList.add("is-hidden");
      modal.setAttribute("aria-hidden", "true");
    };
    const openModal = () => {
      modal.classList.remove("is-hidden");
      modal.setAttribute("aria-hidden", "false");
    };

    openButton.addEventListener("click", openModal);
    closeButton.addEventListener("click", closeModal);
    backdrop.addEventListener("click", closeModal);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });

    if (shouldOpenLoginFromUrl()) {
      openModal();
    }
  }

  function bindProfileNameModal() {
    const modal = $("aha-profile-name-modal");
    const closeButton = $("aha-close-profile-name-modal");
    const backdrop = $("aha-profile-name-modal-backdrop");
    if (!modal || !closeButton || !backdrop || modal.dataset.ahaDashboardBound === "true") return;
    modal.dataset.ahaDashboardBound = "true";

    const closeModal = () => {
      modal.classList.add("is-hidden");
      modal.setAttribute("aria-hidden", "true");
    };

    closeButton.addEventListener("click", closeModal);
    backdrop.addEventListener("click", closeModal);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });
  }

  function bindDashboardKeyboardShortcuts() {
    if (document.documentElement.dataset.ahaDashboardKeyboardBound === "true") return;
    document.documentElement.dataset.ahaDashboardKeyboardBound = "true";
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (isAhaManualSyncConfirmationModalOpen) {
        isAhaManualSyncConfirmationModalOpen = false;
        renderSyncHubStatus();
        $("aha-sync-confirmation-preview")?.focus();
        return;
      }
      if (selectedAhaManualSyncHistoryRunId) {
        const runId = selectedAhaManualSyncHistoryRunId;
        selectedAhaManualSyncHistoryRunId = null;
        renderSyncHubStatus();
        focusAhaManualSyncHistoryButton(runId);
      }
    });
  }

  function bind() {
    persistAuthReturnTargetFromUrl();
    // Mount the static module registry before auth/database diagnostics can delay
    // the richer dashboard refresh. renderDashboard replaces these badges with
    // live health data when its asynchronous work completes.
    renderModules({});
    bindProfileNameForm();
    bindLoginModal();
    bindProfileNameModal();
    bindDashboardKeyboardShortcuts();
    renderSyncHubStatus();
    renderDashboard();
    window.addEventListener("aha:source-event-added", renderDashboard);
    window.addEventListener("aha:historygo-imported", renderDashboard);
    window.addEventListener("aha:auth-ready", renderDashboard);
    window.addEventListener("storage", (event) => {
      if (!event.key || event.key.startsWith("aha_") || event.key === "aha_import_payload_v1") renderDashboard();
    });
  }

  window.AHADashboard = {
    localStats,
    databaseStats,
    renderStats: renderDashboard,
    renderDashboard,
    getLastState: () => lastState,
    saveProfileName,
    loadAhaManualSyncHistoryPreview,
    getAhaManualSyncHistoryState: () => ahaManualSyncHistoryState
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
