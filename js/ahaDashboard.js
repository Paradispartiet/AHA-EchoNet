// ahaDashboard.js

(function () {
  "use strict";

  let lastState = null;

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

  function inspectSyncHubLocalStorageItem(key) {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { count: 0, state: "Tom", ok: true };

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { count: countActive(parsed), state: "Lest", ok: true };
    }

    if (parsed && typeof parsed === "object") {
      return { count: Object.keys(parsed).length, state: "Lest", ok: true };
    }

    return { count: 1, state: "Lest", ok: true };
  }

  function renderSyncHubStatus() {
    const mount = $("aha-sync-hub-status");
    if (!mount) {
      console.warn("AHADashboard: aha-sync-hub-status mount mangler");
      return;
    }

    const sources = [
      { label: "Lists", key: "aha_lists_v1" },
      { label: "Paths", key: "aha_paths_v1" },
      { label: "Groups", key: "aha_groups_v1" },
      { label: "AHAavisa", key: "aha_articles_v1" }
    ];

    try {
      if (!window.localStorage) throw new Error("localStorage er ikke tilgjengelig");

      const rows = sources.map((source) => {
        try {
          return { ...source, ...inspectSyncHubLocalStorageItem(source.key) };
        } catch (error) {
          console.warn(`AHADashboard: kunne ikke lese ${source.key}`, error);
          return { ...source, count: "–", state: "Uleselig", ok: false };
        }
      });
      const allReadable = rows.every((row) => row.ok);
      const statusLabel = allReadable ? "sync-ready" : "status-feil";

      mount.innerHTML = `
        <section class="aha-status-card" aria-label="AHA Sync Hub status">
          <p class="eyebrow">AHA Sync Hub</p>
          <h3>Status only</h3>
          <p>Read-only localStorage-inspeksjon. Ingen sync, knapper eller databasekall.</p>
          <div class="aha-stats">
            ${rows.map((row) => `
              <div class="aha-stat">
                <strong>${row.count}</strong>
                <span>${row.label} · ${row.state}</span>
              </div>
            `).join("")}
          </div>
          <small class="aha-status-updated">${statusLabel} · Oppdatert ${formatTime()}</small>
        </section>
      `;
    } catch (error) {
      console.warn("AHADashboard: AHA Sync Hub status kunne ikke leses", error);
      mount.innerHTML = `
        <section class="aha-status-card" aria-label="AHA Sync Hub status">
          <p class="eyebrow">AHA Sync Hub</p>
          <h3>Status only</h3>
          <p>Read-only status er utilgjengelig fordi localStorage ikke kan leses.</p>
          <small class="aha-status-updated">status-feil · Dashboardet fortsetter uten sync.</small>
        </section>
      `;
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
