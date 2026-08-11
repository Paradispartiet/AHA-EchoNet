// ahaGlobalNav.js
// Felles produktnavigasjon for AHA. Hovednivået viser brukerens viktigste
// destinasjoner. Rå moduler og driftsverktøy ligger ett nivå dypere.
// Ingen localStorage, sync eller backend-kall; ren visning/navigasjon.

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
        { moduleId: "lists", label: "Lister", hint: "Samle relaterte ting" },
        { moduleId: "paths", label: "Stier", hint: "Lag en rekkefølge gjennom materialet" },
        { moduleId: "mindmap", label: "Tankekart", hint: "Se koblinger visuelt" }
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

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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

  function loadInsightQualityFeedback() {
    if (!global.document?.head) return false;
    if (global.AHAInsightQualityFeedback?.init) {
      global.AHAInsightQualityFeedback.init();
      return true;
    }
    if (global.document.querySelector('script[data-aha-insight-quality="true"]')) return true;
    const script = global.document.createElement("script");
    script.src = "js/ahaInsightQualityFeedback.js";
    script.async = false;
    script.dataset.ahaInsightQuality = "true";
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
    loadInsightQualityFeedback
  };

  if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", () => render());
  else render();
})(window);
