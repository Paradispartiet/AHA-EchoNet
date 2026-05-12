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

  const STORAGE_DEFINITIONS = [
    { key: "aha_insight_chamber_v1", label: "AHA innsiktskammer", kind: "object", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_source_events_v1", label: "AHA source events", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_notes_v1", label: "AHA Notes", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_gallery_v1", label: "AHA Gallery", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_feed_posts_v1", label: "AHA Feed", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_insta_posts_v1", label: "AHA Insta", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_lists_v1", label: "AHA Lister", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_paths_v1", label: "AHA Stier", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
    { key: "aha_articles_v1", label: "AHAavisa artikler", kind: "array", isAHA: true, isHistoryGo: false, canClear: true },
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

  function countItems(parsed, key) {
    if (Array.isArray(parsed)) return parsed.length;
    if (!parsed || typeof parsed !== "object") return 0;
    if (key === "aha_insight_chamber_v1") return asArray(parsed.insights).length;
    return Object.keys(parsed).length;
  }

  function collectStorageReport() {
    return STORAGE_DEFINITIONS.map((def) => {
      const raw = localStorage.getItem(def.key);
      const parsed = safeParse(raw, null);
      return {
        key: def.key,
        label: def.label,
        exists: raw !== null,
        bytes: raw ? raw.length : 0,
        itemCount: countItems(parsed, def.key),
        kind: def.kind,
        isHistoryGo: def.isHistoryGo,
        isAHA: def.isAHA,
        canClear: def.canClear
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
      data
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

    [
      "localOnly",
      "allowCollectiveLearning",
      "allowPublicPublishing",
      "allowSocialSharing",
      "allowHistoryGoImport",
      "allowAnalytics"
    ].forEach((key) => {
      const input = form.querySelector(`[name="${key}"]`);
      if (input instanceof HTMLInputElement) input.checked = Boolean(settings[key]);
    });

    const updated = document.getElementById("privacy-updated-at");
    if (updated) updated.textContent = settings.updatedAt ? `Sist oppdatert: ${settings.updatedAt}` : "Ikke lagret ennå";
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
          <p class="privacy-small">Objekter: ${escapeHtml(String(item.itemCount))} · Bytes: ${escapeHtml(String(item.bytes))}</p>
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
      const next = {};
      new FormData(form).forEach((value, key) => {
        next[key] = value === "on";
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
