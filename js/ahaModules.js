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
      status: "active",
      href: "music.html",
      description: "Spotify-import, normalisert musikkmetadata og personlig AHA Music-bibliotek.",
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
      id: "training",
      title: "Training",
      type: "system",
      status: "active",
      href: "training.html",
      description: "Korpus og treningseksempler for senere personlig modelltilpasning.",
      phase: 2
    },
    {
      id: "personal-ai",
      title: "Personal AI",
      type: "system",
      status: "active",
      href: "personal-ai.html",
      description: "Kontrollpanel for AHA sin personlige AI-sløyfe.",
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
    training: "⚙",
    "personal-ai": "✧",
    privacy: "⚑"
  };

  const MODULE_HEALTH_STATUSES = new Set(["ready", "warning", "blocked", "empty", "missing", "unknown"]);
  const MODULE_EMPTY_STATE_TYPES = new Set(["no_data", "missing_source", "not_configured", "filtered_empty", "read_error", "unknown"]);
  const MODULE_EMPTY_STATE_COPY = {
    no_data: {
      default: { title: "Nothing here yet.", message: "Items will appear here when available." },
      lists: { title: "No lists yet.", message: "Lists will appear here when available." },
      paths: { title: "No paths yet.", message: "Paths will appear here when available." },
      groups: { title: "No groups yet.", message: "Create or sync groups to organize related AHA material." },
      avisa: { title: "No AHAavisa notes yet.", message: "Create or sync notes to collect drafts and published AHA material." },
      music: { title: "No imported music yet.", message: "Connect Spotify and import playlists to build your AHA Music library." }
    },
    missing_source: { title: "Module data not found.", message: "This module has no available local data source." },
    not_configured: { title: "Module not configured.", message: "This module needs a configured data source before items can appear." },
    filtered_empty: { title: "No matching items.", message: "Try changing the filter or search." },
    read_error: { title: "Could not read module data.", message: "Try again later or view diagnostics." },
    unknown: { title: "Nothing to show.", message: "No module data is available." }
  };
  const PREFERRED_ORDER = ["chat", "insights", "music", "historygo", "gallery", "notes", "feed", "avisa", "profile", "search", "training", "personal-ai", "privacy"];

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sanitizeEmptyStateReason(reason) {
    const firstLine = String(reason || "").split(/\r?\n/, 1)[0].trim();
    if (!firstLine) return "";
    return firstLine.replace(/^Error:\s*/i, "").slice(0, 160);
  }

  function buildModuleEmptyState({ type = "unknown", moduleId = "", title = "", message = "", hint = "", reason = "" } = {}) {
    const normalizedType = MODULE_EMPTY_STATE_TYPES.has(type) ? type : "unknown";
    const typeCopy = MODULE_EMPTY_STATE_COPY[normalizedType] || MODULE_EMPTY_STATE_COPY.unknown;
    const copy = normalizedType === "no_data"
      ? (typeCopy[moduleId] || typeCopy.default)
      : typeCopy;
    const safeReason = sanitizeEmptyStateReason(reason);
    const stateClass = normalizedType === "read_error" ? "aha-module-error" : "aha-module-empty";
    const role = normalizedType === "read_error" ? "alert" : "status";

    return `<article class="aha-panel aha-module-state ${stateClass}" data-empty-state="${escapeHtml(normalizedType)}" role="${role}">
      <h2 class="aha-module-state-title">${escapeHtml(title || copy.title)}</h2>
      <p class="aha-module-state-message">${escapeHtml(message || copy.message)}</p>
      ${hint ? `<p class="aha-module-state-hint">${escapeHtml(hint)}</p>` : ""}
      ${safeReason ? `<p class="aha-module-state-reason"><strong>Reason:</strong> ${escapeHtml(safeReason)}</p>` : ""}
    </article>`;
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
    emptyStateTypes: [...MODULE_EMPTY_STATE_TYPES],
    buildModuleEmptyState,
    localPageHealth,
    updatePageHealth,
    renderMenu
  };
})();
