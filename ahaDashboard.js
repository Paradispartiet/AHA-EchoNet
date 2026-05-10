// ahaDashboard.js

(function () {
  "use strict";

  let lastState = null;

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

  function activeCount(items) {
    return readArray(items).filter((item) => !item || item.deleted_at == null).length;
  }

  function localStats() {
    const imports = readArray("aha_imports_v1").length;
    return {
      source_events: readArray("aha_source_events_v1").length,
      notes: activeCount("aha_notes_v1"),
      gallery: activeCount("aha_gallery_v1"),
      feed: activeCount("aha_feed_posts_v1"),
      insta: activeCount("aha_insta_posts_v1"),
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
    try {
      const user = await window.AHAAuth?.getUser?.();
      let profileResult = null;
      if (user?.id && window.AHAAuth?.loadProfile) {
        profileResult = await window.AHAAuth.loadProfile(user);
        if (profileResult?.reason === "missing_profile" && window.AHAAuth?.ensureProfile) {
          await window.AHAAuth.ensureProfile();
          profileResult = await window.AHAAuth.loadProfile(user);
        }
      }

      return {
        user: user || null,
        profile: profileResult?.ok ? profileResult.data : null,
        profileResult
      };
    } catch (error) {
      console.warn("AHADashboard: loadAuthState feilet", error);
      return {
        user: null,
        profile: null,
        profileResult: { ok: false, reason: "auth_error", error }
      };
    }
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
    else setText("aha-module-historygo-status", "Ingen import");
  }

  function bindHistoryGoHomeTile() {
    const tile = $("aha-historygo-home");
    if (!tile || tile.dataset.ahaDashboardBound === "true") return;
    tile.dataset.ahaDashboardBound = "true";
    tile.addEventListener("click", () => {
      window.location.href = "/History-Go/";
    });
    tile.addEventListener("keydown", (event) => {
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
    const loginCard = $("aha-login-card");
    const profileNameForm = $("aha-profile-name-form");
    const nameInput = $("aha-profile-name-input");

    form?.classList.toggle("is-hidden", signedIn);
    signOut?.classList.toggle("is-hidden", !signedIn);
    loginCard?.classList.toggle("is-hidden", signedIn);
    profileNameForm?.classList.toggle("is-hidden", !missingProfile);

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
      const local = localStats();
      let dbResult = { ok: false, fallback: "not_loaded" };
      let stats = local;

      if (authState.user?.id) {
        dbResult = await databaseStats();
        if (dbResult?.ok && dbResult.counts) stats = { ...local, ...dbResult.counts };
      }

      const sourceLabel = localDataSourceLabel(dbResult);
      lastState = { authState, stats, sourceLabel };

      renderIdentity(authState);
      renderProfileStats(stats, sourceLabel);
      renderModuleStatus(stats);
      renderStatCards(stats, sourceLabel, authState);
      renderInsightsActivity(stats);
    } catch (error) {
      console.warn("AHADashboard: renderDashboard feilet", error);
      const authState = { user: null, profile: null, profileResult: { ok: false, reason: "render_error", error } };
      const stats = localStats();
      lastState = { authState, stats, sourceLabel: "localStorage", error };
      renderIdentity(authState);
      renderProfileStats(stats, "localStorage");
      renderModuleStatus(stats);
      renderStatCards(stats, "localStorage", authState);
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

  function bind() {
    bindProfileNameForm();
    bindHistoryGoHomeTile();
    bindImportButtons();
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
