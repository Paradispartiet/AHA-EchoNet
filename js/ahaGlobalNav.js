// ahaGlobalNav.js
// Felles, lesbar navigasjonstopp for alle AHA-sider. Leser kun den eksisterende
// modulkatalogen (window.AHA_MODULES) og bygger en kompakt toppbar + modulmeny.
// Ingen localStorage, ingen sync/database-kall - ren visning og navigasjon.

(function (global) {
  "use strict";

  const GROUPS = [
    { id: "core", label: "Kjerne", moduleIds: ["chat", "insights", "search"] },
    { id: "engine", label: "Kunnskapsmotor", moduleIds: ["data-intake", "knowledge-curation", "knowledge-map", "knowledge-graph-intelligence", "training", "personal-ai"] },
    { id: "collections", label: "Egne samlinger", moduleIds: ["lists", "paths", "mindmap"] },
    { id: "personal", label: "Personlig", moduleIds: ["profile", "gallery", "notes", "insta", "music", "historygo"] },
    { id: "social", label: "Sosialt og publisering", moduleIds: ["feed", "meet", "groups", "avisa"] },
    { id: "system", label: "System", moduleIds: ["sync-hub", "privacy"] }
  ];

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
    if (status === "shell") return '<span class="aha-global-nav-item-tag">Forhandsvisning</span>';
    return "";
  }

  function buildGroupMarkup(group, modulesById, icons, activeFile) {
    const items = group.moduleIds
      .map((id) => modulesById.get(id))
      .filter(Boolean)
      .map((module) => {
        const isActive = moduleFile(module.href) === activeFile;
        const icon = icons[module.id] || "◌";
        return `<a class="aha-global-nav-item${isActive ? " is-active" : ""}" href="${escapeHtml(module.href)}" data-module="${escapeHtml(module.id)}"${isActive ? ' aria-current="page"' : ""}>
          <span class="aha-global-nav-item-icon" aria-hidden="true">${icon}</span>
          <span class="aha-global-nav-item-copy">
            <strong>${escapeHtml(module.title)}</strong>
            <small>${escapeHtml(module.description)}</small>
          </span>
          ${statusTag(module.status)}
        </a>`;
      })
      .join("");

    if (!items) return "";
    return `<section class="aha-global-nav-group">
      <h3>${escapeHtml(group.label)}</h3>
      <div class="aha-global-nav-group-items">${items}</div>
    </section>`;
  }

  function render(mountId = "aha-global-nav") {
    const mount = global.document.getElementById(mountId);
    if (!mount) return;

    const modules = Array.isArray(global.AHA_MODULES) ? global.AHA_MODULES : [];
    const icons = global.AHAModules?.icons || {};
    const modulesById = new Map(modules.map((module) => [module.id, module]));
    const activeFile = currentFile();
    const activeModule = modules.find((module) => moduleFile(module.href) === activeFile);
    const currentLabel = activeModule ? activeModule.title : "AHA Home";

    const groupsMarkup = GROUPS.map((group) => buildGroupMarkup(group, modulesById, icons, activeFile)).join("");

    mount.innerHTML = `
      <header class="aha-global-nav" data-aha-global-nav>
        <div class="aha-global-nav-bar">
          <a class="aha-global-nav-brand" href="index.html" aria-label="AHA Home">
            <span class="aha-global-nav-brand-mark" aria-hidden="true">A</span>
            <span class="aha-global-nav-brand-label">AHA</span>
          </a>
          <button type="button" class="aha-global-nav-toggle" id="aha-global-nav-toggle" aria-haspopup="dialog" aria-expanded="false" aria-controls="aha-global-nav-overlay">
            <span class="aha-global-nav-toggle-icon" aria-hidden="true">&#8862;</span>
            <span>Moduler</span>
          </button>
          <span class="aha-global-nav-current" aria-hidden="true">${escapeHtml(currentLabel)}</span>
          <a class="aha-global-nav-home" href="sync.html">Sync Hub</a>
          <a class="aha-global-nav-home" href="index.html">Hjem</a>
        </div>
        <div class="aha-global-nav-overlay" id="aha-global-nav-overlay" hidden>
          <div class="aha-global-nav-backdrop" data-aha-global-nav-close></div>
          <div class="aha-global-nav-panel" role="dialog" aria-modal="true" aria-label="Alle AHA-moduler">
            <div class="aha-global-nav-panel-header">
              <h2>Alle AHA-moduler</h2>
              <button type="button" class="aha-global-nav-close" data-aha-global-nav-close aria-label="Lukk modulmeny">&times;</button>
            </div>
            <div class="aha-global-nav-groups">${groupsMarkup}</div>
          </div>
        </div>
      </header>
    `;

    bindEvents(mount);
  }

  function bindEvents(mount) {
    const toggle = mount.querySelector("#aha-global-nav-toggle");
    const overlay = mount.querySelector("#aha-global-nav-overlay");
    if (!toggle || !overlay) return;

    function open() {
      overlay.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      global.document.body.classList.add("aha-global-nav-open");
      const firstItem = overlay.querySelector(".aha-global-nav-item, .aha-global-nav-close");
      if (firstItem) firstItem.focus();
    }

    function close() {
      overlay.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      global.document.body.classList.remove("aha-global-nav-open");
      toggle.focus();
    }

    toggle.addEventListener("click", () => {
      if (overlay.hidden) open();
      else close();
    });

    mount.querySelectorAll("[data-aha-global-nav-close]").forEach((el) => {
      el.addEventListener("click", close);
    });

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
  }

  global.AHAGlobalNav = { render };

  if (global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", () => render());
  } else {
    render();
  }
})(window);
