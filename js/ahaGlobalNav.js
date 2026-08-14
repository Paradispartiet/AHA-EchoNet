// ahaGlobalNav.js
// Felles produktnavigasjon for AHA. Hovednivået viser brukerens viktigste
// destinasjoner. Rå moduler og driftsverktøy ligger ett nivå dypere.
// Footeren leser eksisterende lokal profil- og Daily Loop-status. Ingen sync
// eller backend-kall, og ingen ny datamodell.

(function (global) {
  "use strict";

  const PRIMARY_NAV = Object.freeze([
    { id: "home", label: "Start", href: "index.html", files: ["index.html"] },
    { id: "chat", label: "Chat", href: "chat.html", files: ["chat.html"] },
    { id: "library", label: "Bibliotek", href: "search.html", files: ["search.html"] },
    { id: "personal-ai", label: "Personal AI", href: "personal-ai.html", files: ["personal-ai.html"] },
    { id: "profile", label: "Mitt AHA", href: "profile.html", files: ["profile.html"] }
  ]);

  const PRODUCT_GROUPS = Object.freeze([
    {
      id: "work",
      label: "Arbeid med AHA",
      description: "Forstå, bearbeid og bygg videre på det AHA finner.",
      items: [
        { moduleId: "insights", hint: "Se innsiktene AHA har bygget" },
        { moduleId: "knowledge-workbench", hint: "Arbeid videre med kunnskapsmaterialet" }
      ]
    },
    {
      id: "organize",
      label: "Organiser",
      description: "Samle tanker og kunnskap i strukturer du kan finne igjen.",
      items: [
        { moduleId: "lists", label: "Begrepslister", hint: "Samle relaterte ord og begreper" },
        { moduleId: "paths", label: "Kunnskapsstier", hint: "Følg fortellinger og læringstrinn" },
        { moduleId: "mindmap", label: "Tankekart", hint: "Utforsk ideer som grener og undergrener" }
      ]
    },
    {
      id: "create",
      label: "Skriv og samle",
      description: "Dine egne tekster, medier og utkast.",
      items: [
        { moduleId: "notes", label: "Notater", hint: "Skriv og analyser egne notater" },
        { moduleId: "gallery", label: "Galleri", hint: "Samle visuelt materiale" },
        { moduleId: "insta", label: "AHA Insta", hint: "Personlig mediearkiv" },
        { moduleId: "music", label: "AHA Music", hint: "Musikkmetadata og oppdagelser" },
        { moduleId: "feed", label: "Feed", hint: "Korte refleksjoner" },
        { moduleId: "avisa", label: "AHAavisa", hint: "Lengre tekster og utkast" }
      ]
    },
    {
      id: "control",
      label: "Konto og kontroll",
      description: "Profil, personvern og koblinger du selv styrer.",
      items: [
        { moduleId: "profile", label: "Mitt AHA", hint: "Din personlige oversikt" },
        { moduleId: "privacy", label: "Personvern", hint: "Backup, samtykke og lokal kontroll" },
        { moduleId: "historygo", label: "History Go", hint: "Se og styr AHA-importen" }
      ]
    }
  ]);

  const ADVANCED_ITEMS = Object.freeze([
    { moduleId: "sources", label: "Kilder" },
    { moduleId: "data-intake", label: "Data Intake" },
    { moduleId: "knowledge-curation", label: "Knowledge Curation" },
    { moduleId: "knowledge-map", label: "Knowledge Map" },
    { moduleId: "knowledge-graph-intelligence", label: "Graph Intelligence" },
    { moduleId: "training", label: "Training" },
    { moduleId: "groups", label: "Groups" },
    { moduleId: "meet", label: "Meet" },
    { moduleId: "sync-hub", label: "Sync Hub" }
  ]);

  const DAILY_LOOP_STORAGE_KEY = "aha_daily_operating_loop_v1";
  const PENDING_CHAT_PROMPT_KEY = "aha_pending_chat_prompt_v1";

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function shortText(value, max = 120) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
  }

  function readLocalStorage(key) {
    try { return global.localStorage?.getItem(key) || null; } catch { return null; }
  }

  function parseJson(value, fallback = null) {
    try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
  }

  function profileState(detail = null) {
    const profileId = String(detail?.user?.id || readLocalStorage("aha_profile_id") || "").trim();
    const displayName = String(detail?.profile?.display_name || readLocalStorage("aha_profile_name") || "").trim();
    return {
      signedIn: Boolean(profileId),
      label: profileId ? (displayName || "Min profil") : "Logg inn",
      initial: (displayName || "A").charAt(0).toUpperCase() || "A"
    };
  }

  function loadDailyLoopStatus() {
    try {
      return global.AHADailyOperatingLoop?.buildDailyLoopStatus?.({ save: false, lightweight: true })
        || global.AHADailyOperatingLoop?.loadDailyLoopStatus?.()
        || parseJson(readLocalStorage(DAILY_LOOP_STORAGE_KEY), null);
    } catch {
      return parseJson(readLocalStorage(DAILY_LOOP_STORAGE_KEY), null);
    }
  }

  function dailyLoopContentMarkup(loop) {
    if (!loop) {
      return `<div class="aha-global-daily-empty">
        <strong>AHA gjør dagens løype klar</strong>
        <p>Du kan starte i Chat mens AHA samler neste steg.</p>
        <a class="aha-global-daily-primary" href="chat.html">Åpne Chat</a>
      </div>`;
    }

    const action = loop.nextBestAction || {};
    const queue = Array.isArray(loop.actionQueue) ? loop.actionQueue.slice(0, 4) : [];
    const prompts = Array.isArray(loop.suggestedPrompts) ? loop.suggestedPrompts.slice(0, 3) : [];
    const queueMarkup = queue.map((item) => `<a class="aha-global-daily-queue-item" href="${escapeHtml(item.href || "chat.html")}">
      <span>${escapeHtml(item.label || "Neste steg")}</span><span aria-hidden="true">→</span>
    </a>`).join("");
    const promptMarkup = prompts.map((item) => `<a class="aha-global-daily-prompt" href="chat.html" data-aha-daily-prompt="${escapeHtml(item.prompt || "")}">${escapeHtml(item.label || "Spør AHA")}</a>`).join("");

    return `<div class="aha-global-daily-summary">
      <p class="aha-global-daily-day">${escapeHtml(loop.dayLabel || "I dag")}</p>
      <h3>${escapeHtml(shortText(loop.currentFocus || action.label || "Neste beste handling", 90))}</h3>
      <p>${escapeHtml(loop.changedSinceLastRun?.summary || "Ingen tydelige endringer siden sist.")}</p>
    </div>
    <section class="aha-global-daily-next" aria-label="Neste beste handling">
      <span>Neste beste handling</span>
      <strong>${escapeHtml(action.label || "Åpne Chat")}</strong>
      <p>${escapeHtml(shortText(action.description || "Bruk AHA med dagens status.", 150))}</p>
      <a class="aha-global-daily-primary" href="${escapeHtml(action.href || "chat.html")}">Fortsett</a>
    </section>
    ${queueMarkup ? `<nav class="aha-global-daily-queue" aria-label="Dagens handlinger">${queueMarkup}</nav>` : ""}
    ${promptMarkup ? `<div class="aha-global-daily-prompts" aria-label="Forslag til Chat">${promptMarkup}</div>` : ""}`;
  }

  function renderDailyLoopContent() {
    const content = global.document.getElementById("aha-global-daily-content");
    if (!content) return false;
    content.innerHTML = dailyLoopContentMarkup(loadDailyLoopStatus());
    bindDailyPromptLinks(content);
    return true;
  }

  function loadDailyLoopModule() {
    if (!global.document?.head) return false;
    if (global.AHADailyOperatingLoop) return renderDailyLoopContent();
    const existing = global.document.querySelector('script[data-aha-daily-loop="true"], script[src$="/ahaDailyOperatingLoop.js"], script[src="js/ahaDailyOperatingLoop.js"]');
    if (existing) {
      existing.addEventListener?.("load", renderDailyLoopContent, { once: true });
      return true;
    }
    const script = global.document.createElement("script");
    script.src = "js/ahaDailyOperatingLoop.js";
    script.async = false;
    script.dataset.ahaDailyLoop = "true";
    script.addEventListener("load", renderDailyLoopContent, { once: true });
    global.document.head.appendChild(script);
    return true;
  }

  function bindDailyPromptLinks(root) {
    root.querySelectorAll("[data-aha-daily-prompt]").forEach((link) => {
      link.addEventListener("click", (event) => {
        const prompt = String(link.dataset.ahaDailyPrompt || "").trim();
        if (!prompt) return;
        const input = global.document.getElementById("msg");
        if (input) {
          event.preventDefault();
          input.value = prompt;
          if (typeof global.Event === "function") input.dispatchEvent(new global.Event("input", { bubbles: true }));
          closeDailySheet();
          input.focus();
          return;
        }
        try {
          global.localStorage?.setItem(PENDING_CHAT_PROMPT_KEY, JSON.stringify({
            type: "daily_loop",
            prompt,
            createdAt: new Date().toISOString()
          }));
        } catch {}
      });
    });
  }

  function closeDailySheet({ restoreFocus = true } = {}) {
    const sheet = global.document.getElementById("aha-global-daily-sheet");
    const toggle = global.document.getElementById("aha-global-footer-daily-toggle");
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    toggle?.setAttribute("aria-expanded", "false");
    global.document.body?.classList.remove("aha-global-daily-open");
    if (restoreFocus) toggle?.focus();
  }

  function openDailySheet() {
    const sheet = global.document.getElementById("aha-global-daily-sheet");
    const toggle = global.document.getElementById("aha-global-footer-daily-toggle");
    if (!sheet || !toggle) return;
    renderDailyLoopContent();
    sheet.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    global.document.body?.classList.add("aha-global-daily-open");
    sheet.querySelector(".aha-global-daily-close")?.focus();
  }

  function updateFooterProfile(detail = null) {
    const state = profileState(detail);
    const action = global.document.getElementById("aha-global-footer-profile");
    if (!action) return;
    action.dataset.signedIn = state.signedIn ? "true" : "false";
    action.setAttribute("aria-label", state.signedIn ? `Åpne ${state.label}` : "Logg inn i AHA");
    const mark = action.querySelector(".aha-global-footer-profile-mark");
    const label = action.querySelector(".aha-global-footer-profile-label");
    if (mark) mark.textContent = state.initial;
    if (label) label.textContent = state.label;
  }

  function renderGlobalFooter(activeFile) {
    if (!global.document?.body) return false;
    global.document.getElementById("aha-global-footer")?.remove();
    global.document.getElementById("aha-global-daily-sheet")?.remove();
    global.document.body.insertAdjacentHTML("beforeend", `<footer class="aha-global-footer" id="aha-global-footer" aria-label="AHA hurtigfelt">
      <div class="aha-global-footer-inner">
        <button type="button" class="aha-global-footer-action aha-global-footer-profile" id="aha-global-footer-profile" aria-label="Logg inn i AHA">
          <span class="aha-global-footer-profile-mark" aria-hidden="true">A</span>
          <span class="aha-global-footer-copy"><span class="aha-global-footer-profile-label">Logg inn</span><small>Profil</small></span>
        </button>
        <button type="button" class="aha-global-footer-action aha-global-footer-daily-toggle" id="aha-global-footer-daily-toggle" aria-haspopup="dialog" aria-expanded="false" aria-controls="aha-global-daily-sheet">
          <span class="aha-global-footer-daily-mark" aria-hidden="true">↑</span>
          <span class="aha-global-footer-copy"><span>Dagens</span><small>AHA-løype</small></span>
        </button>
      </div>
    </footer>
    <section class="aha-global-daily-sheet" id="aha-global-daily-sheet" hidden>
      <button type="button" class="aha-global-daily-backdrop" data-aha-global-daily-close tabindex="-1" aria-label="Lukk dagens AHA-løype"></button>
      <div class="aha-global-daily-panel" role="dialog" aria-modal="true" aria-labelledby="aha-global-daily-title">
        <header class="aha-global-daily-header">
          <div><p>Dagens AHA-løype</p><h2 id="aha-global-daily-title">Dette er viktigst nå</h2></div>
          <button type="button" class="aha-global-daily-close" data-aha-global-daily-close aria-label="Lukk dagens AHA-løype">&times;</button>
        </header>
        <div class="aha-global-daily-content" id="aha-global-daily-content">${dailyLoopContentMarkup(loadDailyLoopStatus())}</div>
      </div>
    </section>`);

    updateFooterProfile();
    const footer = global.document.getElementById("aha-global-footer");
    const sheet = global.document.getElementById("aha-global-daily-sheet");
    const profile = global.document.getElementById("aha-global-footer-profile");
    const dailyToggle = global.document.getElementById("aha-global-footer-daily-toggle");

    profile?.addEventListener("click", () => {
      const signedIn = profile.dataset.signedIn === "true";
      if (signedIn) {
        global.location.href = "profile.html";
        return;
      }
      const localLogin = activeFile === "index.html" ? global.document.getElementById("aha-open-login-modal") : null;
      if (localLogin) localLogin.click();
      else global.location.href = "index.html#login";
    });
    dailyToggle?.addEventListener("click", () => sheet?.hidden ? openDailySheet() : closeDailySheet());
    sheet?.querySelectorAll("[data-aha-global-daily-close]").forEach((item) => item.addEventListener("click", () => closeDailySheet()));
    sheet?.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDailySheet(); });
    bindDailyPromptLinks(global.document.getElementById("aha-global-daily-content"));
    global.addEventListener?.("aha:auth-ready", (event) => updateFooterProfile(event.detail));
    loadDailyLoopModule();
    return Boolean(footer && sheet);
  }

  function currentFile() {
    const path = String(global.location?.pathname || "");
    const last = path.split("/").pop() || "";
    return last === "" ? "index.html" : last;
  }

  function moduleFile(href) {
    return String(href || "").split("#")[0].split("/").pop();
  }

  function statusTag(status) {
    if (status === "planned") return '<span class="aha-global-nav-item-tag">Planlagt</span>';
    if (status === "shell") return '<span class="aha-global-nav-item-tag">Forhåndsvisning</span>';
    return "";
  }

  function isTechnicalEyebrow(value) {
    const text = String(value ?? "").trim();
    return /^AHA\s+Modul$/i.test(text)
      || /^AHA\s+System\b/i.test(text)
      || /(?:^|\s)Fase\s+\d+[A-Z]?\b/i.test(text);
  }

  function loadHomeContinueExperience() {
    if (!global.document?.head) return false;
    if (global.AHAHomeContinueExperience?.refresh) {
      global.AHAHomeContinueExperience.refresh();
      return true;
    }
    if (global.document.querySelector('script[data-aha-home-continue="true"]')) return true;
    const script = global.document.createElement("script");
    script.src = "js/ahaHomeContinueExperience.js";
    script.async = false;
    script.dataset.ahaHomeContinue = "true";
    global.document.head.appendChild(script);
    return true;
  }

  function loadInsightAvailabilityBridge() {
    if (!global.document?.head) return false;
    if (global.AHAInsightAvailabilityBridge?.reconcile) {
      global.AHAInsightAvailabilityBridge.reconcile();
      return true;
    }
    if (global.document.querySelector('script[data-aha-insight-availability="true"]')) return true;
    const script = global.document.createElement("script");
    script.src = "js/ahaInsightAvailabilityBridge.js";
    script.async = false;
    script.dataset.ahaInsightAvailability = "true";
    global.document.head.appendChild(script);
    return true;
  }

  function loadInsightQualityFeedback() {
    if (!global.document?.head) return false;
    if (global.AHAInsightQualityFeedback?.init) {
      global.AHAInsightQualityFeedback.init();
      loadInsightAvailabilityBridge();
      return true;
    }
    if (global.document.querySelector('script[data-aha-insight-quality="true"]')) return true;
    const script = global.document.createElement("script");
    script.src = "js/ahaInsightQualityFeedback.js";
    script.async = false;
    script.dataset.ahaInsightQuality = "true";
    script.addEventListener("load", loadInsightAvailabilityBridge, { once: true });
    global.document.head.appendChild(script);
    return true;
  }

  function primaryMarkup(activeFile) {
    return PRIMARY_NAV.map((item) => {
      const active = item.files.includes(activeFile);
      return `<a class="aha-global-nav-primary-link${active ? " is-active" : ""}" href="${escapeHtml(item.href)}" data-primary="${escapeHtml(item.id)}"${active ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}</a>`;
    }).join("");
  }

  function menuItemMarkup(item, modulesById, icons, activeFile) {
    const module = modulesById.get(item.moduleId);
    if (!module) return "";
    const active = moduleFile(module.href) === activeFile;
    const icon = icons[module.id] || "◌";
    const label = item.label || module.title;
    return `<a class="aha-global-nav-item${active ? " is-active" : ""}" href="${escapeHtml(module.href)}" data-module="${escapeHtml(module.id)}"${active ? ' aria-current="page"' : ""}>
      <span class="aha-global-nav-item-icon" aria-hidden="true">${icon}</span>
      <span class="aha-global-nav-item-copy">
        <strong>${escapeHtml(label)}</strong>
        ${item.hint ? `<small>${escapeHtml(item.hint)}</small>` : ""}
      </span>
      ${statusTag(module.status)}
    </a>`;
  }

  function productGroupMarkup(group, modulesById, icons, activeFile) {
    const items = group.items.map((item) => menuItemMarkup(item, modulesById, icons, activeFile)).filter(Boolean).join("");
    if (!items) return "";
    return `<section class="aha-global-nav-group" data-product-group="${escapeHtml(group.id)}">
      <div class="aha-global-nav-group-head">
        <h3>${escapeHtml(group.label)}</h3>
        <p>${escapeHtml(group.description)}</p>
      </div>
      <div class="aha-global-nav-group-items">${items}</div>
    </section>`;
  }

  function advancedMarkup(modulesById, icons, activeFile) {
    const items = ADVANCED_ITEMS.map((item) => menuItemMarkup(item, modulesById, icons, activeFile)).filter(Boolean).join("");
    return `<details class="aha-global-nav-advanced">
      <summary>Avanserte verktøy</summary>
      <p>For kontroll, review og teknisk arbeid. Disse er ikke del av den vanlige AHA-løypen.</p>
      <div class="aha-global-nav-group-items">${items}</div>
      <a class="aha-global-nav-tools-link" href="modules.html">Se alle verktøy og moduler</a>
    </details>`;
  }

  function applyProductShellCleanup(activeFile) {
    const body = global.document.body;
    if (!body) return;
    const route = activeFile.replace(/\.html$/i, "").replace(/[^a-z0-9-]/gi, "-") || "index";
    body.classList.add("aha-product-shell", `aha-route-${route}`);

    global.document.querySelectorAll(".aha-module-shell .eyebrow").forEach((eyebrow) => {
      if (!isTechnicalEyebrow(eyebrow.textContent)) return;
      eyebrow.classList.add("aha-technical-eyebrow");
      eyebrow.setAttribute("aria-hidden", "true");
    });

    if (activeFile === "index.html") {
      global.document.querySelector(".aha-modules-panel")?.setAttribute("hidden", "");
      global.document.querySelector(".aha-fixed-header")?.classList.add("aha-home-header-simplified");
      loadHomeContinueExperience();
    }

    if (activeFile === "chat.html" || activeFile === "insights.html") {
      loadInsightQualityFeedback();
    }

    if (activeFile === "profile.html") {
      global.document.getElementById("aha-modules-grid")?.closest("section")?.setAttribute("hidden", "");
    }

    global.document.querySelectorAll('.aha-module-actions a[href="index.html"], .aha-modules-page-header a[href="index.html"]').forEach((link) => {
      link.classList.add("aha-redundant-home-link");
      link.setAttribute("aria-hidden", "true");
      link.setAttribute("tabindex", "-1");
    });
    if (activeFile === "chat.html") global.document.querySelector(".chat-header")?.classList.add("aha-chat-header-simplified");
  }

  function render(mountId = "aha-global-nav") {
    const mount = global.document.getElementById(mountId);
    if (!mount) return;

    const modules = Array.isArray(global.AHA_MODULES) ? global.AHA_MODULES : [];
    const icons = global.AHAModules?.icons || {};
    const modulesById = new Map(modules.map((module) => [module.id, module]));
    const activeFile = currentFile();
    const groupsMarkup = PRODUCT_GROUPS.map((group) => productGroupMarkup(group, modulesById, icons, activeFile)).join("");

    global.document.getElementById("aha-global-nav-overlay")?.remove();

    mount.innerHTML = `<header class="aha-global-nav" data-aha-global-nav>
      <div class="aha-global-nav-bar">
        <a class="aha-global-nav-brand" href="index.html" aria-label="AHA Start">
          <span class="aha-global-nav-brand-mark" aria-hidden="true">A</span>
          <span class="aha-global-nav-brand-label">AHA</span>
        </a>
        <nav class="aha-global-nav-primary" aria-label="Hovednavigasjon">${primaryMarkup(activeFile)}</nav>
        <button type="button" class="aha-global-nav-toggle" id="aha-global-nav-toggle" aria-haspopup="dialog" aria-expanded="false" aria-controls="aha-global-nav-overlay">
          <span>Mer</span><span class="aha-global-nav-toggle-icon" aria-hidden="true">☰</span>
        </button>
      </div>
      <div class="aha-global-nav-overlay" id="aha-global-nav-overlay" hidden>
        <div class="aha-global-nav-backdrop" data-aha-global-nav-close></div>
        <div class="aha-global-nav-panel" role="dialog" aria-modal="true" aria-label="Utforsk AHA">
          <div class="aha-global-nav-panel-header">
            <div><p class="aha-global-nav-kicker">AHA</p><h2>Utforsk AHA</h2><p>Velg det du vil gjøre — ikke hvilken intern modul som gjør jobben.</p></div>
            <button type="button" class="aha-global-nav-close" data-aha-global-nav-close aria-label="Lukk meny">&times;</button>
          </div>
          <div class="aha-global-nav-groups">${groupsMarkup}</div>
          ${advancedMarkup(modulesById, icons, activeFile)}
        </div>
      </div>
    </header>`;

    const overlay = mount.querySelector("#aha-global-nav-overlay");
    if (overlay && overlay.parentElement !== global.document.body) global.document.body.appendChild(overlay);
    applyProductShellCleanup(activeFile);
    bindEvents(mount, overlay);
    renderGlobalFooter(activeFile);
  }

  function bindEvents(mount, overlay) {
    const toggle = mount.querySelector("#aha-global-nav-toggle");
    if (!toggle || !overlay) return;

    function open() {
      overlay.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      global.document.body.classList.add("aha-global-nav-open");
      overlay.querySelector(".aha-global-nav-item, .aha-global-nav-close")?.focus();
    }

    function close() {
      overlay.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      global.document.body.classList.remove("aha-global-nav-open");
      toggle.focus();
    }

    toggle.addEventListener("click", () => overlay.hidden ? open() : close());
    overlay.querySelectorAll("[data-aha-global-nav-close]").forEach((el) => el.addEventListener("click", close));
    overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
  }

  global.AHAGlobalNav = {
    render,
    primaryNav: PRIMARY_NAV,
    productGroups: PRODUCT_GROUPS,
    advancedItems: ADVANCED_ITEMS,
    isTechnicalEyebrow,
    loadHomeContinueExperience,
    loadInsightQualityFeedback,
    loadInsightAvailabilityBridge,
    loadDailyLoopModule,
    renderDailyLoopContent,
    renderGlobalFooter,
    profileState
  };

  if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", () => render());
  else render();
})(window);
