// ahaDashboard.js

(function () {
  "use strict";

  let lastState = null;
  let isSyncHubPrepOpen = false;

  const AHA_AUTH_RETURN_TO_KEY = "aha_auth_return_to_v1";
  const HISTORY_GO_PROFILE_URL = "https://paradispartiet.github.io/History-Go/profile.html";

  const MODULE_ICONS = {
    profile: "◌",
    chat: "✦",
    insights: "◎",
    lists: "☰",
    paths: "↠",
    mindmap: "⎔",
    historygo: "⌁",
    gallery: "▧",
    notes: "✎",
    insta: "◉",
    feed: "#",
    meet: "⟡",
    music: "♫",
    avisa: "📰",
    groups: "◍",
    search: "⌕",
    privacy: "⚑"
  };

  function readArray(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

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


  function moduleStatusLine(module, stats) {
    const map = {
      chat: resolveModuleLabel(stats, "source_events", "innsikt", "innsikter"),
      notes: resolveModuleLabel(stats, "notes", "notat", "notater"),
      gallery: resolveModuleLabel(stats, "gallery", "minne", "minner"),
      feed: resolveModuleLabel(stats, "feed", "post", "poster"),
      insta: resolveModuleLabel(stats, "insta", "innlegg", "innlegg")
    };
    if (module.id === "historygo") {
      const importCount = statValue(stats, "imports");
      if (importCount > 0) return `${importCount} ${importCount === 1 ? "import" : "importer"}`;
      return hasHistoryGoPayload() ? "1 import" : "Ingen import";
    }
    if (map[module.id]) return map[module.id];
    return module.status === "active" ? "Klar" : "Kommer";
  }

  function renderModules(stats) {
    const grid = $("aha-modules-grid");
    if (!grid) return;
    const modules = Array.isArray(window.AHA_MODULES) ? window.AHA_MODULES : [];
    const preferredOrder = ["chat","insights","historygo","gallery","notes","feed","avisa","profile","search","privacy"];
    const orderedModules = [...modules].sort((a, b) => {
      const ai = preferredOrder.indexOf(a?.id);
      const bi = preferredOrder.indexOf(b?.id);
      const aRank = ai === -1 ? 999 : ai;
      const bRank = bi === -1 ? 999 : bi;
      if (aRank !== bRank) return aRank - bRank;
      return String(a?.title || "").localeCompare(String(b?.title || ""), "no");
    });
    grid.innerHTML = orderedModules.map((module) => {
      const isPriority = ["chat", "historygo"].includes(module.id);
      const tileClass = `aha-tile${isPriority ? " aha-tile-priority" : ""}`;
      const icon = MODULE_ICONS[module.id] || "◌";
      const status = moduleStatusLine(module, stats);
      const cardInner = `
        <span class="aha-tile-icon">${icon}</span>
        <strong>${module.title}</strong>
        <span>${module.description}</span>
        <small id="aha-module-${module.id}-status">${status}</small>
      `;

      if (module.id === "historygo") {
        return `<article class="${tileClass} aha-home-tile" id="aha-historygo-home" data-module="imports" role="link" tabindex="0" aria-label="Åpne History Go">${cardInner}
          <div class="aha-tile-actions">
            <a class="aha-tile-btn aha-tile-btn-primary" href="/History-Go/">Åpne History Go</a>
            <button class="aha-tile-btn aha-tile-btn-secondary" id="btn-import-hg" type="button">Importer data</button>
          </div>
        </article>`;
      }

      return `<a class="${tileClass}" href="${module.href}" data-module="${module.id}">${cardInner}</a>`;
    }).join("");
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

  function renderModuleStatus(stats) {
    setText("aha-module-chat-status", resolveModuleLabel(stats, "source_events", "innsikt", "innsikter"));
    setText("aha-module-notes-status", resolveModuleLabel(stats, "notes", "notat", "notater"));
    setText("aha-module-gallery-status", resolveModuleLabel(stats, "gallery", "minne", "minner"));
    setText("aha-module-feed-status", resolveModuleLabel(stats, "feed", "post", "poster"));
    setText("aha-module-insta-status", resolveModuleLabel(stats, "insta", "innlegg", "innlegg"));

    const importCount = statValue(stats, "imports");
    if (importCount > 0) setText("aha-module-historygo-status", `${importCount} ${importCount === 1 ? "import" : "importer"}`);
    else setText("aha-module-historygo-status", hasHistoryGoPayload() ? "1 import" : "Ingen import");
  }

  function bindHistoryGoHomeTile() {
    const tile = $("aha-historygo-home");
    if (!tile || tile.dataset.ahaDashboardBound === "true") return;
    tile.dataset.ahaDashboardBound = "true";
    tile.addEventListener("click", () => {
      window.location.href = "/History-Go/";
    });
    tile.addEventListener("keydown", (event) => {
      if (event.target !== tile) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        window.location.href = "/History-Go/";
      }
    });
  }

  function renderStatCards(stats, sourceLabel, authState) {
    const mount = $("aha-dashboard-stats");
    if (!mount) return;

    const profileStatus = !authState.user
      ? "Ikke innlogget"
      : authState.profile?.display_name
        ? "Lastet"
        : "Mangler navn";

    const rows = [
      ["Profil", profileStatus],
      ["Datakilde", sourceLabel],
      ["History Go-import", hasHistoryGoPayload() || statValue(stats, "imports") > 0 ? "Funnet" : "Ikke funnet"],
      ["Lokal lagring", "Aktiv"],
      ["Innsikter", statValue(stats, "source_events")],
      ["Notater", statValue(stats, "notes")],
      ["Galleri", statValue(stats, "gallery")],
      ["Feed", statValue(stats, "feed")],
      ["Insta", statValue(stats, "insta")],
      ["Sist oppdatert", formatTime()]
    ];

    mount.innerHTML = rows.map(([name, value], index) => `
      <div class="aha-stat${index === 1 ? " aha-stat-source" : ""}">
        <strong>${value}</strong>
        <span>${name}</span>
      </div>
    `).join("");
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
    const modulesWithWarnings = plan.filter((row) => ["warnings", "skipped"].includes(row.validationStatus)).length;
    const modulesWithErrors = plan.filter((row) => row.validationStatus === "errors").length;
    return { totalModules, modulesReady, modulesWithWarnings, modulesWithErrors };
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
        "No database connection used",
        "passed",
        "Checklist uses existing in-memory dry-run, validation, readiness, and payload preview results only."
      ),
      createAhaSyncChecklistItem(
        "No repository write enabled",
        "passed",
        "No repository save path is exposed from this Sync Hub panel."
      ),
      createAhaSyncChecklistItem(
        "Manual sync not enabled yet",
        "passed",
        "Sync is not available yet; this panel exposes no manual sync action."
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

  function buildAhaManualSyncGate(plan, payloadPreview, checklist) {
    const summary = summarizeSyncHubValidation(plan);
    const modulesIncluded = Number(payloadPreview?.modulesIncluded || 0);
    const blockedChecklistItems = (checklist.items || []).filter((item) => item.status === "blocked");
    const warningChecklistItems = (checklist.items || []).filter((item) => item.status === "warning");
    const gateReasons = [];

    if (checklist.readiness === "blocked") gateReasons.push("Readiness gate is blocked.");
    if (checklist.readiness === "warning") gateReasons.push("Readiness gate has warnings that must be reviewed.");
    if (summary.modulesWithErrors > 0) gateReasons.push(`${summary.modulesWithErrors} validation error module${summary.modulesWithErrors === 1 ? "" : "s"} found.`);
    if (summary.modulesWithWarnings > 0) gateReasons.push(`${summary.modulesWithWarnings} warning or skipped module${summary.modulesWithWarnings === 1 ? "" : "s"} must be reviewed.`);
    if (modulesIncluded === 0) gateReasons.push("Payload preview includes no modules.");
    blockedChecklistItems.forEach((item) => gateReasons.push(`${item.label}: ${item.reason}`));
    warningChecklistItems.forEach((item) => gateReasons.push(`${item.label}: ${item.reason}`));
    gateReasons.push("Manual sync is not enabled in code yet.");

    return [...new Set(gateReasons)];
  }

  function renderAhaManualSyncGate(plan, payloadPreview, checklist) {
    const gateReasons = buildAhaManualSyncGate(plan, payloadPreview, checklist);
    const primaryReason = gateReasons[0] || "Manual sync is not enabled in code yet.";

    return `
      <div class="aha-sync-manual-gate" aria-label="AHA Sync Hub manual sync gate">
        <div class="aha-sync-prep-heading">
          <p class="eyebrow">Manual sync</p>
          <h4>Manual sync control</h4>
          <p class="aha-sync-unavailable-notice">Manual sync is gated and not enabled yet.</p>
        </div>
        <button type="button" class="aha-sync-manual-button" disabled aria-disabled="true" aria-describedby="aha-sync-manual-disabled-reason">Manual sync</button>
        <div id="aha-sync-manual-disabled-reason" class="aha-sync-validation-block">
          <h5>Disabled reason</h5>
          <p class="aha-sync-validation-status aha-sync-validation-status-blocked">${escapeHtml(primaryReason)}</p>
          <ul class="aha-sync-manual-reasons">
            ${gateReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
          </ul>
        </div>
        <div class="aha-sync-validation-block">
          <h5>Before manual sync can be enabled</h5>
          <ul class="aha-sync-manual-requirements">
            <li>readiness must be ready</li>
            <li>validation errors must be zero</li>
            <li>payload preview must include at least one module</li>
            <li>operator checklist must have no blocked items</li>
            <li>explicit manual sync implementation must be added in a future PR</li>
          </ul>
        </div>
      </div>
    `;
  }

  function renderSyncHubPrepPanel(plan) {
    if (!isSyncHubPrepOpen) return "";

    const payloadPreview = buildAhaSyncPayloadPreview(plan);
    const operatorChecklist = buildAhaSyncOperatorChecklist(plan, payloadPreview);

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
        ${renderAhaSyncOperatorChecklist(operatorChecklist)}
        ${renderAhaManualSyncGate(plan, payloadPreview, operatorChecklist)}
      </div>
    `;
  }

  function bindSyncHubPrepToggle() {
    const button = $("aha-sync-hub-prep-toggle");
    if (!button) return;
    button.addEventListener("click", () => {
      isSyncHubPrepOpen = !isSyncHubPrepOpen;
      renderSyncHubStatus();
    });
  }

  function renderSyncHubStatus() {
    const mount = $("aha-sync-hub-status");
    if (!mount) {
      console.warn("AHADashboard: aha-sync-hub-status mount mangler");
      return;
    }

    try {
      if (!window.localStorage) throw new Error("localStorage er ikke tilgjengelig");

      const plan = buildAhaSyncDryRunPlan();
      const allReadable = plan.every((row) => row.ok);
      const statusLabel = allReadable ? "sync-ready" : "status-feil";
      const buttonLabel = isSyncHubPrepOpen ? "Skjul sync-forberedelse" : "Forbered sync";

      mount.innerHTML = `
        <section class="aha-status-card" aria-label="AHA Sync Hub status">
          <p class="eyebrow">AHA Sync Hub</p>
          <h3>Status only</h3>
          <p>Read-only localStorage-inspeksjon. Ingen sync eller databasekall.</p>
          <div class="aha-stats">
            ${plan.map((row) => `
              <div class="aha-stat">
                <strong>${row.count}</strong>
                <span>${row.name} · ${row.status}</span>
              </div>
            `).join("")}
          </div>
          <button id="aha-sync-hub-prep-toggle" type="button" class="aha-sync-prep-toggle" aria-expanded="${isSyncHubPrepOpen}" aria-controls="aha-sync-prep-panel">${buttonLabel}</button>
          ${renderSyncHubPrepPanel(plan)}
          <small class="aha-status-updated">${statusLabel} · Oppdatert ${formatTime()}</small>
        </section>
      `;
      bindSyncHubPrepToggle();
    } catch (error) {
      console.warn("AHADashboard: AHA Sync Hub status kunne ikke leses", error);
      const plan = SYNC_HUB_DRY_RUN_SOURCES.map((source) => createSyncHubDryRunResult(source, "–", "error", "Could not read localStorage", ["Could not inspect this dataset."]));
      const buttonLabel = isSyncHubPrepOpen ? "Skjul sync-forberedelse" : "Forbered sync";
      mount.innerHTML = `
        <section class="aha-status-card" aria-label="AHA Sync Hub status">
          <p class="eyebrow">AHA Sync Hub</p>
          <h3>Status only</h3>
          <p>Read-only status er utilgjengelig fordi localStorage ikke kan leses.</p>
          <button id="aha-sync-hub-prep-toggle" type="button" class="aha-sync-prep-toggle" aria-expanded="${isSyncHubPrepOpen}" aria-controls="aha-sync-prep-panel">${buttonLabel}</button>
          ${renderSyncHubPrepPanel(plan)}
          <small class="aha-status-updated">status-feil · Dashboardet fortsetter uten sync.</small>
        </section>
      `;
      bindSyncHubPrepToggle();
    }
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
      lastState = { authState, stats, sourceLabel };

      renderModules(stats);
      bindHistoryGoHomeTile();
      bindHistoryGoImportTrigger();
      bindImportButtons();
      renderIdentity(authState);
      renderProfileStats(stats, sourceLabel);
      renderModuleStatus(stats);
      renderStatCards(stats, sourceLabel, authState);
      renderSyncHubStatus();
      renderInsightsActivity(stats);
    } catch (error) {
      console.warn("AHADashboard: renderDashboard feilet", error);
      const authState = { user: null, profile: null, profileResult: { ok: false, reason: "render_error", error } };
      const stats = localStats();
      lastState = { authState, stats, sourceLabel: "localStorage", error };
      renderModules(stats);
      bindHistoryGoHomeTile();
      bindHistoryGoImportTrigger();
      bindImportButtons();
      renderIdentity(authState);
      renderProfileStats(stats, "localStorage");
      renderModuleStatus(stats);
      renderStatCards(stats, "localStorage", authState);
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

  function bind() {
    persistAuthReturnTargetFromUrl();
    bindProfileNameForm();
    bindLoginModal();
    bindProfileNameModal();
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
    saveProfileName
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
