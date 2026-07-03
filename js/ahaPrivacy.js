// ahaPrivacy.js
// Fase 3H: første fungerende AHA Personvern / Kontroll-modul (localStorage-first).

(function (global) {
  "use strict";

  const SETTINGS_KEY = "aha_privacy_settings_v1";

  const DEFAULT_SETTINGS = {
    id: "aha_privacy_settings",
    localOnly: true,
    allowCollectiveLearning: false,
    allowPublicPublishing: false,
    allowSocialSharing: false,
    allowHistoryGoImport: true,
    allowAnalytics: false,
    updatedAt: "",
    meta: {}
  };
  const PRIVACY_CHECKBOX_KEYS = Object.freeze([
    "localOnly",
    "allowCollectiveLearning",
    "allowPublicPublishing",
    "allowSocialSharing",
    "allowHistoryGoImport",
    "allowAnalytics"
  ]);

  const STORAGE_DEFINITIONS = [
    { key: "aha_insight_chamber_v1", label: "AHA innsiktskammer", kind: "object", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_source_events_v1", label: "AHA source events", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_notes_v1", label: "AHA Notes", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_gallery_v1", label: "AHA Gallery", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_feed_posts_v1", label: "AHA Feed", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_insta_posts_v1", label: "AHA Insta", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_insta_stories_v1", label: "AHA Insta Stories", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_insta_import_sessions_v1", label: "AHA Insta importøkter", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_insta_import_preview_v1", label: "AHA Insta import-preview", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_insta_profile_v1", label: "AHA Insta profil", kind: "object", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_insta_likes_v1", label: "AHA Insta lokale likes", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_insta_comments_v1", label: "AHA Insta lokale kommentarer", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_insta_follows_v1", label: "AHA Insta lokale følgerelasjoner", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_lists_v1", label: "AHA Lister", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_paths_v1", label: "AHA Stier", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_articles_v1", label: "AHAavisa artikler", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_groups_v1", label: "AHA Grupper / Sirkler", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: SETTINGS_KEY, label: "Personverninnstillinger", kind: "object", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_import_payload_v1", label: "History Go importpayload", kind: "object", isAHA: false, isHistoryGo: true, canClear: false },
    { key: "hg_unlocks_v1", label: "History Go unlocks", kind: "object", isAHA: false, isHistoryGo: true, canClear: false },
    { key: "visited_places", label: "History Go besøkte steder", kind: "array", isAHA: false, isHistoryGo: true, canClear: false },
    { key: "people_collected", label: "History Go personer samlet", kind: "array", isAHA: false, isHistoryGo: true, canClear: false },
    { key: "historygo_progress", label: "History Go progresjon", kind: "object", isAHA: false, isHistoryGo: true, canClear: false }
  ];

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeParse(raw, fallback) {
    if (!raw) return fallback;
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

  function asBool(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
  }

  function normalizeSettings(input) {
    const now = new Date().toISOString();
    const raw = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    return {
      id: "aha_privacy_settings",
      localOnly: asBool(raw.localOnly, DEFAULT_SETTINGS.localOnly),
      allowCollectiveLearning: asBool(raw.allowCollectiveLearning, DEFAULT_SETTINGS.allowCollectiveLearning),
      allowPublicPublishing: asBool(raw.allowPublicPublishing, DEFAULT_SETTINGS.allowPublicPublishing),
      allowSocialSharing: asBool(raw.allowSocialSharing, DEFAULT_SETTINGS.allowSocialSharing),
      allowHistoryGoImport: asBool(raw.allowHistoryGoImport, DEFAULT_SETTINGS.allowHistoryGoImport),
      allowAnalytics: asBool(raw.allowAnalytics, DEFAULT_SETTINGS.allowAnalytics),
      updatedAt: raw.updatedAt || raw.updated_at || now,
      meta: raw.meta && typeof raw.meta === "object" && !Array.isArray(raw.meta) ? raw.meta : {}
    };
  }

  function loadSettings() {
    return normalizeSettings(safeParse(localStorage.getItem(SETTINGS_KEY), DEFAULT_SETTINGS));
  }

  function saveSettings(input) {
    const settings = normalizeSettings({
      ...loadSettings(),
      ...(input || {}),
      updatedAt: new Date().toISOString()
    });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return settings;
  }

  function hasDeletionMarker(item) {
    return Boolean(item && typeof item === "object" && (item.deleted_at || item.deletedAt));
  }

  function analyzeStorageValue(def, parsed) {
    const empty = {
      itemCount: 0,
      activeCount: 0,
      deletedCount: 0,
      archivedCount: 0,
      importedCount: 0,
      localOnlyCount: 0,
      externalPublishedCount: 0,
      echonetSharedCount: 0,
      syncEnabledCount: 0,
      hasPreviewData: false,
      hasImportData: false
    };

    if (!Array.isArray(parsed)) {
      if (!parsed || typeof parsed !== "object") return empty;
      return {
        ...empty,
        itemCount: 1,
        activeCount: hasDeletionMarker(parsed) ? 0 : 1,
        deletedCount: hasDeletionMarker(parsed) ? 1 : 0,
        archivedCount: parsed.archived === true ? 1 : 0,
        importedCount: parsed.imported === true ? 1 : 0,
        localOnlyCount: parsed.local_only === true ? 1 : 0,
        externalPublishedCount: parsed.published_external === true ? 1 : 0,
        echonetSharedCount: parsed.echonet_shared === true ? 1 : 0,
        syncEnabledCount: parsed.sync_enabled === true ? 1 : 0,
        hasPreviewData: Boolean(def.key.includes("preview") || parsed.preview || parsed.previewData || parsed.preview_data),
        hasImportData: Boolean(def.key.includes("import") || parsed.imported === true || parsed.import_session_id || parsed.importSessionId)
      };
    }

    return parsed.reduce((summary, item) => {
      const isObject = item && typeof item === "object";
      const deleted = hasDeletionMarker(item);
      summary.itemCount += 1;
      if (!deleted) summary.activeCount += 1;
      if (deleted) summary.deletedCount += 1;
      if (isObject && item.archived === true) summary.archivedCount += 1;
      if (isObject && item.imported === true) summary.importedCount += 1;
      if (isObject && item.local_only === true) summary.localOnlyCount += 1;
      if (isObject && item.published_external === true) summary.externalPublishedCount += 1;
      if (isObject && item.echonet_shared === true) summary.echonetSharedCount += 1;
      if (isObject && item.sync_enabled === true) summary.syncEnabledCount += 1;
      if (isObject && (item.preview || item.previewData || item.preview_data)) summary.hasPreviewData = true;
      if (isObject && (item.imported === true || item.import_session_id || item.importSessionId)) summary.hasImportData = true;
      return summary;
    }, {
      ...empty,
      hasPreviewData: def.key.includes("preview"),
      hasImportData: def.key.includes("import")
    });
  }

  function collectStorageReport() {
    return STORAGE_DEFINITIONS.map((def) => {
      const raw = localStorage.getItem(def.key);
      const parsed = safeParse(raw, null);
      const analysis = analyzeStorageValue(def, parsed);
      return {
        key: def.key,
        label: def.label,
        exists: raw !== null,
        bytes: raw ? raw.length : 0,
        itemCount: analysis.itemCount,
        kind: def.kind,
        isHistoryGo: def.isHistoryGo,
        isAHA: def.isAHA,
        canClear: def.canClear,
        activeCount: analysis.activeCount,
        deletedCount: analysis.deletedCount,
        archivedCount: analysis.archivedCount,
        importedCount: analysis.importedCount,
        localOnlyCount: analysis.localOnlyCount,
        externalPublishedCount: analysis.externalPublishedCount,
        echonetSharedCount: analysis.echonetSharedCount,
        syncEnabledCount: analysis.syncEnabledCount,
        hasPreviewData: analysis.hasPreviewData,
        hasImportData: analysis.hasImportData
      };
    });
  }

  function exportAllData() {
    const data = {};
    STORAGE_DEFINITIONS.filter((def) => def.isAHA).forEach((def) => {
      const raw = localStorage.getItem(def.key);
      data[def.key] = safeParse(raw, raw);
    });

    const payload = {
      meta: {
        exportedAt: new Date().toISOString(),
        app: "AHA-EchoNet",
        version: 1
      },
      data,
      privacyReport: collectStorageReport()
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aha-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return payload;
  }

  function clearStorageKey(key, confirmation) {
    const def = STORAGE_DEFINITIONS.find((entry) => entry.key === key);
    if (!def || !def.canClear) return { ok: false, reason: "not_allowed" };
    if (confirmation !== "SLETT") return { ok: false, reason: "missing_confirmation" };
    localStorage.removeItem(key);
    return { ok: true, key };
  }

  function renderStatus(settings) {
    const target = document.getElementById("privacy-status");
    if (!target) return;

    const entries = [
      ["Lokal modus", settings.localOnly],
      ["Kollektiv læring", settings.allowCollectiveLearning],
      ["Offentlig publisering", settings.allowPublicPublishing],
      ["Sosial deling", settings.allowSocialSharing],
      ["History Go-import", settings.allowHistoryGoImport],
      ["Analytics", settings.allowAnalytics]
    ];

    target.innerHTML = entries.map(([label, value]) => `
      <article class="privacy-status-card">
        <strong>${escapeHtml(label)}</strong>
        <span class="privacy-pill ${value ? "is-on" : "is-off"}">${value ? "På" : "Av"}</span>
      </article>
    `).join("");
  }

  function renderConsent(settings) {
    const form = document.getElementById("privacy-settings-form");
    if (!form) return;

    PRIVACY_CHECKBOX_KEYS.forEach((key) => {
      const input = form.querySelector(`[name="${key}"]`);
      if (input instanceof HTMLInputElement) input.checked = Boolean(settings[key]);
    });

    const updated = document.getElementById("privacy-updated-at");
    if (updated) updated.textContent = settings.updatedAt ? `Sist oppdatert: ${settings.updatedAt}` : "Ikke lagret ennå";
  }

  function sumReport(report, field) {
    return report.reduce((sum, item) => sum + (Number(item[field]) || 0), 0);
  }

  function renderReportSummary(report) {
    const target = document.getElementById("privacy-storage-summary");
    if (!target) return;
    const ahaKeys = report.filter((item) => item.isAHA && item.exists).length;
    const historyGoKeys = report.filter((item) => item.isHistoryGo && item.exists).length;
    const rows = [
      ["AHA-nøkler", ahaKeys],
      ["History Go-nøkler", historyGoKeys],
      ["Bytes", sumReport(report, "bytes")],
      ["Aktive objekter", sumReport(report, "activeCount")],
      ["Tombstoned/slettet", sumReport(report, "deletedCount")],
      ["Local-only", sumReport(report, "localOnlyCount")],
      ["Importert", sumReport(report, "importedCount")],
      ["Sync aktivert", sumReport(report, "syncEnabledCount")],
      ["EchoNet-delt", sumReport(report, "echonetSharedCount")],
      ["Ekstern-publisert", sumReport(report, "externalPublishedCount")]
    ];
    target.innerHTML = rows.map(([label, value]) => `
      <article class="privacy-summary-card">
        <strong>${escapeHtml(String(value))}</strong>
        <span>${escapeHtml(label)}</span>
      </article>
    `).join("");
  }

  function renderReport(report) {
    const target = document.getElementById("privacy-storage-report");
    if (!target) return;

    target.innerHTML = report.map((item) => `
      <article class="privacy-storage-card">
        <div>
          <h3>${escapeHtml(item.label)}</h3>
          <p class="privacy-key">${escapeHtml(item.key)}</p>
          <div class="privacy-storage-meta">
            <span class="privacy-pill ${item.exists ? "is-on" : "is-off"}">${item.exists ? "Finnes" : "Finnes ikke"}</span>
            <span class="privacy-pill">${item.isHistoryGo ? "History Go" : "AHA"}</span>
            <span class="privacy-pill">${escapeHtml(item.kind)}</span>
          </div>
          <p class="privacy-small">Objekter: ${escapeHtml(String(item.itemCount))} · Aktive: ${escapeHtml(String(item.activeCount))} · Bytes: ${escapeHtml(String(item.bytes))}</p>
          <p class="privacy-small">Slettet/tombstoned: ${escapeHtml(String(item.deletedCount))} · Arkivert: ${escapeHtml(String(item.archivedCount))} · Importert: ${escapeHtml(String(item.importedCount))} · Local-only: ${escapeHtml(String(item.localOnlyCount))}</p>
          <p class="privacy-small">Ekstern publisering: ${escapeHtml(String(item.externalPublishedCount))} · EchoNet: ${escapeHtml(String(item.echonetSharedCount))} · Sync: ${escapeHtml(String(item.syncEnabledCount))}</p>
        </div>
        <div class="privacy-clear-row">
          ${item.canClear
            ? `<input data-clear-confirm="${escapeHtml(item.key)}" type="text" placeholder="Skriv SLETT" />
               <button type="button" data-clear-key="${escapeHtml(item.key)}" ${item.exists ? "" : "disabled"}>Slett lokal data</button>`
            : `<span class="privacy-small">Kan ikke slettes her</span>`}
        </div>
      </article>
    `).join("");
  }

  function render() {
    const settings = loadSettings();
    const report = collectStorageReport();
    renderStatus(settings);
    renderConsent(settings);
    renderReportSummary(report);
    renderReport(report);
  }

  function refresh() {
    render();
  }

  function bindEvents() {
    document.getElementById("privacy-refresh")?.addEventListener("click", refresh);
    document.getElementById("privacy-export")?.addEventListener("click", exportAllData);

    document.getElementById("privacy-settings-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const next = Object.fromEntries(PRIVACY_CHECKBOX_KEYS.map((key) => [key, false]));
      form.querySelectorAll('input[type="checkbox"][name]').forEach((input) => {
        if (!(input instanceof HTMLInputElement)) return;
        if (!Object.prototype.hasOwnProperty.call(next, input.name)) return;
        next[input.name] = Boolean(input.checked);
      });
      saveSettings(next);
      refresh();
    });

    document.getElementById("privacy-storage-report")?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const key = target.dataset.clearKey;
      if (!key) return;
      const card = target.closest(".privacy-storage-card");
      const input = card?.querySelector("[data-clear-confirm]");
      const confirmation = input instanceof HTMLInputElement ? input.value : "";
      const result = clearStorageKey(key, confirmation);
      const message = document.getElementById("privacy-action-message");
      if (message) {
        if (result.ok) message.textContent = `${key} ble slettet lokalt.`;
        else if (result.reason === "missing_confirmation") message.textContent = "Skriv SLETT før sletting.";
        else message.textContent = "Denne nøkkelen kan ikke slettes her.";
      }
      refresh();
    });
  }

  global.AHAPrivacy = {
    loadSettings,
    saveSettings,
    collectStorageReport,
    analyzeStorageValue,
    exportAllData,
    clearStorageKey,
    render,
    refresh
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function onReady() {
      bindEvents();
      render();
    });
  } else {
    bindEvents();
    render();
  }
})(window);
