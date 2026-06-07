// ahaModules.js

(function () {
  "use strict";

  const AHA_MODULES = [
    {
      id: "profile",
      title: "AHA Profil",
      type: "personal",
      status: "active",
      href: "profile.html",
      description: "Brukerens personlige representasjonslag: profil, innlogging, progresjon, galleri og innsikter.",
      phase: 1
    },
    {
      id: "chat",
      title: "AHA Chat",
      type: "core",
      status: "active",
      href: "chat.html",
      description: "Refleksjon, samtale og innsiktsmotor via eksisterende AHAIngest-flyt.",
      phase: 1
    },
    {
      id: "insights",
      title: "Innsikter",
      type: "knowledge",
      status: "active",
      href: "insights.html",
      description: "Samlet innsiktsarkiv med sporbarhet fra source events og meta-mønstre.",
      phase: 1
    },
    {
      id: "lists",
      title: "Lists",
      type: "knowledge",
      status: "active",
      href: "lists.html",
      description: "Favoritter, gjøremål og AI-støttede lister koblet til innsikter.",
      phase: 1
    },
    {
      id: "paths",
      title: "Paths",
      type: "knowledge",
      status: "active",
      href: "paths.html",
      description: "Læringsreiser over tid: samtale → innsikt → handling.",
      phase: 1
    },
    {
      id: "mindmap",
      title: "Tankekart",
      type: "knowledge",
      status: "active",
      href: "mindmap.html",
      description: "Visuell graf for sammenhenger mellom samtaler, innsikter og begreper.",
      phase: 1
    },
    {
      id: "historygo",
      title: "History Go",
      type: "historygo",
      status: "active",
      href: "historygo.html",
      description: "Importbro og oversikt mellom History Go og AHA uten å blande motorene.",
      phase: 1
    },
    {
      id: "gallery",
      title: "Galleri",
      type: "personal",
      status: "active",
      href: "gallery.html",
      description: "Personlig bildegalleri, minner og visuelle uttrykk som kan ingestes.",
      phase: 1
    },
    {
      id: "notes",
      title: "Notes",
      type: "personal",
      status: "active",
      href: "notes.html",
      description: "Egne notater og tekster sendt gjennom AHAIngest.",
      phase: 1
    },
    {
      id: "insta",
      title: "AHA Insta",
      type: "personal",
      status: "active",
      href: "insta.html",
      description: "Bilde- og videostrøm med personlig kontekst.",
      phase: 1
    },
    {
      id: "feed",
      title: "Feed",
      type: "social",
      status: "active",
      href: "feed.html",
      description: "Korte poster og delte refleksjoner i AHA.",
      phase: 1
    },
    {
      id: "meet",
      title: "Meet",
      type: "social",
      status: "shell",
      href: "meet.html",
      description: "Møtepunkt for samtaler, avtaler og samarbeidsflater.",
      phase: 2
    },
    {
      id: "music",
      title: "Music",
      type: "personal",
      status: "shell",
      href: "music.html",
      description: "Musikkflater, lydspor og personlig lydarkiv.",
      phase: 2
    },
    {
      id: "avisa",
      title: "AHAavisa",
      type: "publishing",
      status: "active",
      href: "avisa.html",
      description: "Kuraterte historier og personlige oppsummeringer basert på innsikter.",
      phase: 2
    },
    {
      id: "groups",
      title: "Groups",
      type: "social",
      status: "active",
      href: "groups.html",
      description: "Fellesrom for samarbeid, deling og kollektiv EchoNet-bygging.",
      phase: 2
    },
    {
      id: "search",
      title: "Søk",
      type: "system",
      status: "active",
      href: "search.html",
      description: "Tverrgående søk i samtaler, notater, galleri, feed og importerte kilder.",
      phase: 2
    },
    {
      id: "privacy",
      title: "Personvern",
      type: "system",
      status: "active",
      href: "privacy.html",
      description: "Transparens, datakontroll og samtykke for hele AHA-laget.",
      phase: 1
    }
  ];

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

  const MODULE_HEALTH_STATUSES = new Set(["ready", "warning", "blocked", "empty", "missing", "unknown"]);
  const PREFERRED_ORDER = ["chat", "insights", "historygo", "gallery", "notes", "feed", "avisa", "profile", "search", "privacy"];

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeModuleHealth(health = {}) {
    const status = MODULE_HEALTH_STATUSES.has(health.status) ? health.status : "unknown";
    const numericCount = Number(health.count);
    const hasCount = health.count !== null && health.count !== undefined && health.count !== "" && Number.isFinite(numericCount);
    const count = hasCount ? Math.max(0, Math.trunc(numericCount)) : null;
    const reason = String(health.reason || `Module health is ${status}.`).trim();
    return { status, count, reason };
  }

  function orderedModules() {
    return [...AHA_MODULES].sort((a, b) => {
      const ai = PREFERRED_ORDER.indexOf(a?.id);
      const bi = PREFERRED_ORDER.indexOf(b?.id);
      const aRank = ai === -1 ? 999 : ai;
      const bRank = bi === -1 ? 999 : bi;
      if (aRank !== bRank) return aRank - bRank;
      return String(a?.title || "").localeCompare(String(b?.title || ""), "no");
    });
  }

  function moduleHealthLabel(status) {
    const labels = { ready: "Ready", warning: "Warning", blocked: "Blocked", empty: "Empty", missing: "Missing", unknown: "Unknown" };
    return labels[status] || "Unknown";
  }

  function renderHealthBadge(module, rawHealth) {
    const health = normalizeModuleHealth(rawHealth);
    const statusLabel = moduleHealthLabel(health.status);
    const count = health.count === null ? "" : `<span class="aha-module-health-count" aria-hidden="true">${health.count}</span>`;
    const accessibleLabel = `${module.title}: ${statusLabel}${health.count === null ? "" : `, ${health.count}`}. ${health.reason}`;
    return `<span class="aha-module-health-badge aha-module-health-${health.status}" role="status" title="${escapeHtml(health.reason)}" aria-label="${escapeHtml(accessibleLabel)}">
      <span>${statusLabel}</span>${count}
    </span>`;
  }

  function updatePageHealth(moduleId, rawHealth, mountId = "aha-module-health") {
    const mount = document.getElementById(mountId);
    if (!mount) return normalizeModuleHealth(rawHealth);

    const module = AHA_MODULES.find((item) => item.id === moduleId) || { id: moduleId, title: "Module" };
    const health = normalizeModuleHealth(rawHealth);
    mount.outerHTML = renderHealthBadge(module, health).replace(
      'class="aha-module-health-badge',
      `id="${escapeHtml(mountId)}" class="aha-module-health-badge`
    );
    return health;
  }

  function localPageHealth({ count = null, datasetExists = true, error = false } = {}) {
    if (error) return { status: "blocked", count: null, reason: "Could not read module data." };
    if (!datasetExists) return { status: "missing", count: null, reason: "No module data found." };
    const numericCount = Number(count);
    if (Number.isFinite(numericCount) && numericCount <= 0) {
      return { status: "empty", count: 0, reason: "The module has no saved items yet." };
    }
    if (Number.isFinite(numericCount)) {
      return { status: "ready", count: numericCount, reason: "Module data is ready." };
    }
    return { status: "unknown", count: null, reason: "Module status unavailable." };
  }

  function renderMenu({ healthByModule = {}, mountId = "aha-modules-grid" } = {}) {
    const grid = document.getElementById(mountId);
    if (!grid) return;

    grid.innerHTML = orderedModules().map((module) => {
      const isPriority = ["chat", "historygo"].includes(module.id);
      const tileClass = `aha-tile${isPriority ? " aha-tile-priority" : ""}`;
      const icon = MODULE_ICONS[module.id] || "◌";
      const badge = renderHealthBadge(module, healthByModule[module.id]);
      const cardInner = `
        <span class="aha-module-menu-heading">
          <span class="aha-tile-icon" aria-hidden="true">${icon}</span>
          <strong>${escapeHtml(module.title)}</strong>
        </span>
        <span class="aha-module-description">${escapeHtml(module.description)}</span>
        ${badge}
      `;

      if (module.id === "historygo") {
        return `<article class="${tileClass} aha-home-tile" id="aha-historygo-home" data-module="imports" aria-labelledby="aha-historygo-title">${cardInner.replace(`<strong>${escapeHtml(module.title)}</strong>`, `<strong id="aha-historygo-title">${escapeHtml(module.title)}</strong>`)}
          <div class="aha-tile-actions">
            <a class="aha-tile-btn aha-tile-btn-primary" href="/History-Go/">Åpne History Go</a>
            <button class="aha-tile-btn aha-tile-btn-secondary" id="btn-import-hg" type="button">Importer data</button>
          </div>
        </article>`;
      }

      return `<a class="${tileClass}" href="${escapeHtml(module.href)}" data-module="${escapeHtml(module.id)}">${cardInner}</a>`;
    }).join("");
  }

  window.AHA_MODULES = AHA_MODULES;
  window.AHAModules = {
    modules: AHA_MODULES,
    healthStatuses: [...MODULE_HEALTH_STATUSES],
    normalizeModuleHealth,
    localPageHealth,
    updatePageHealth,
    renderMenu
  };
})();
