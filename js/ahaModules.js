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
      description: "Local-only profil/statusflate for lokale AHA-tellinger, siste aktivitet, personvern, Meta-profil og History Go importstatus. Ingen sosial profil, innlogging, backend, sync eller EchoNet.",
      phase: 1
    },
    {
      id: "chat",
      title: "AHA Chat",
      type: "core",
      status: "active",
      href: "chat.html",
      description: "AHA Chat bruker eksisterende AHAIngest/source-event-flyt for refleksjon og innsikt. Ingen ny parallell motor.",
      phase: 1
    },

    {
      id: "knowledge-workbench",
      title: "Knowledge Workbench",
      type: "system",
      status: "active",
      href: "knowledge-workbench.html",
      description: "Local-only kontrollflate for Data Intake, Curation, Knowledge Map, Graph Intelligence og Training. Viser manuelle neste steg; ingen auto-approval, backend, sync eller EchoNet.",
      phase: 2
    },
    {
      id: "data-intake",
      title: "Data Intake",
      type: "system",
      status: "active",
      href: "intake.html",
      description: "Local-only kandidat-/inntakskø før review og samtykke. Materiale blir ikke Training Corpus, sync, EchoNet eller History Go write-back automatisk.",
      phase: 2
    },
    {
      id: "knowledge-curation",
      title: "Knowledge Curation",
      type: "system",
      status: "active",
      href: "curation.html",
      description: "Local-only kurateringslag som grupperer, dedupliserer og prioriterer kandidater før eksplisitt manuell eksport til raw/needs-review Training.",
      phase: 2
    },
    {
      id: "knowledge-map",
      title: "Knowledge Map",
      type: "system",
      status: "active",
      href: "knowledge-map.html",
      description: "Avledet local-only graf over kuratert AHA-materiale. Ikke canonical sannhet, ikke graph-database, ingen kilde-mutasjon.",
      phase: 2
    },
    {
      id: "knowledge-graph-intelligence",
      title: "Graph Intelligence",
      type: "system",
      status: "active",
      href: "knowledge-map.html#graph-intelligence",
      description: "Local-only suggestion layer for koblinger, hull og neste review-steg i Knowledge Map. Forslag auto-appliseres ikke.",
      phase: 2
    },
    {
      id: "personal-ai",
      title: "Personal AI",
      type: "system",
      status: "active",
      href: "personal-ai.html",
      description: "Local-only kontroll-, readiness-, retrieval-, preview-, evaluation- og auditflate basert på godkjent lokalt materiale. Ingen modelltrening, API-kall, backend, sync eller EchoNet.",
      phase: 1
    },
    {
      id: "training",
      title: "Training",
      type: "system",
      status: "active",
      href: "training.html",
      description: "Local-only review corpus og training examples for retrieval, review og eventuell lokal JSONL-eksport. Trener ikke modell, starter ikke fine-tuning og laster ikke opp data.",
      phase: 2
    },
    {
      id: "insights",
      title: "Meta Insights",
      type: "knowledge",
      status: "active",
      href: "insights.html",
      description: "Read-only visning av AHA insight chamber og source-event-sporbarhet. Videre skriving skal gå via eksisterende AHAIngest/motor.",
      phase: 1
    },
    {
      id: "sources",
      title: "Sources",
      type: "system",
      status: "active",
      href: "sources.html",
      description: "Local-only read-only audit over AHA source events og insight-koblinger. Ingen repair, import, backend, sync eller EchoNet.",
      phase: 2
    },
    {
      id: "sync-hub",
      title: "Sync Hub",
      type: "integration",
      status: "planned",
      href: "index.html#aha-sync-hub-status",
      description: "Planlagt local-only oversikt for sync-kandidater, dry-run og manuell review. Planned/no-op. Ingen auto-sync, backend, EchoNet, ekstern deling eller History Go write-back.",
      phase: 2
    },
    {
      id: "lists",
      title: "Lists",
      type: "knowledge",
      status: "active",
      href: "lists.html",
      description: "Local-only referansesamlinger til eksisterende AHA-objekter. Ikke egen kunnskapsmotor, sosial deling eller backend-sync.",
      phase: 1
    },
    {
      id: "paths",
      title: "Paths",
      type: "knowledge",
      status: "active",
      href: "paths.html",
      description: "Local-only sekvenser/stier som organiserer eksisterende AHA-objekter. Ikke autoplanlegging, læringsmotor, sync eller sosial deling.",
      phase: 1
    },
    {
      id: "mindmap",
      title: "Tankekart",
      type: "knowledge",
      status: "active",
      href: "mindmap.html",
      description: "Read-only lokal graf over eksisterende AHA-objekter og referanser. Ingen writes, backend, sync, EchoNet eller graph-database.",
      phase: 1
    },
    {
      id: "historygo",
      title: "History Go",
      type: "historygo",
      status: "active",
      href: "historygo.html",
      description: "Manuell local-only importbro fra History Go til AHA source events/insights. AHA skriver ikke tilbake til History Go uten eksplisitt dev/test-flagg.",
      phase: 1
    },
    {
      id: "gallery",
      title: "Galleri",
      type: "personal",
      status: "active",
      href: "gallery.html",
      description: "Local-only galleri for personlige visuelle objekter og tekstlig AHAIngest-sporbarhet. Ingen filopplasting, bildeanalyse, sync eller EchoNet-deling.",
      phase: 1
    },
    {
      id: "notes",
      title: "Notes",
      type: "personal",
      status: "active",
      href: "notes.html",
      description: "Local-only notater og tekster med eksplisitt AHAIngest-flyt. Beskyttes mot tom tekst og duplisert reanalyse.",
      phase: 1
    },
    {
      id: "insta",
      title: "AHA Insta",
      type: "personal",
      status: "active",
      href: "insta.html",
      description: "Local-only Instagram-lignende personlig medieflate med poster/stories/import-preview. Ingen ekstern publisering, konto-linking, backend, sync eller EchoNet.",
      phase: 1
    },
    {
      id: "feed",
      title: "Feed",
      type: "social",
      status: "active",
      href: "feed.html",
      description: "Local-only postflyt for korte refleksjoner med AHAIngest-sporbarhet. Ingen sosial publisering, sync, backend eller EchoNet.",
      phase: 1
    },
    {
      id: "meet",
      title: "Meet",
      type: "social",
      status: "shell",
      href: "meet.html",
      description: "Shell for local-only personlig møtearkiv/refleksjon. Ingen runtime-lagring, invitasjoner, kalender, backend, sync, EchoNet eller History Go write-back.",
      phase: 2
    },
    {
      id: "music",
      title: "AHA Music",
      type: "personal",
      status: "active",
      href: "music.html",
      description: "Metadata-only AHA Music-bibliotek med Spotify-import, normalisert musikkmetadata og lokal History Go-bridge uten write-back. Ingen lydlagring, avspilling, AI-klassifisering, backend, sync eller EchoNet.",
      phase: 2
    },
    {
      id: "avisa",
      title: "AHAavisa",
      type: "publishing",
      status: "active",
      href: "avisa.html",
      description: "Local-only artikkel- og skriveflate med lokale publiseringsmarkeringer. Ingen ekstern publisering, backend, sync eller EchoNet.",
      phase: 2
    },
    {
      id: "groups",
      title: "Groups",
      type: "social",
      status: "active",
      href: "groups.html",
      description: "Local-only grupperom for lokale medlemmer/roller og referanser til AHA-objekter. Ingen invitasjoner, ekstern deling, backend, sync eller EchoNet.",
      phase: 2
    },
    {
      id: "search",
      title: "Søk",
      type: "system",
      status: "active",
      href: "search.html",
      description: "Read-only eksplisitt local-only søk i modne AHA-lag. Ingen blind lokal lagringsindeksering, tokenindeksering, writes, backend, Sync Hub eller EchoNet.",
      phase: 2
    },
    {
      id: "privacy",
      title: "Personvern",
      type: "system",
      status: "active",
      href: "privacy.html",
      description: "Local-only personvernrapport, samtykke og safe export for eksplisitte AHA-lag. Tokens, OAuth/PKCE/API-nøkler og hemmeligheter eksporteres ikke.",
      phase: 1
    }
  ];

  const MODULE_ICONS = {
    profile: "◌",
    chat: "✦",
    insights: "◎",
    sources: "⇥",
    lists: "☰",
    paths: "↠",
    mindmap: "⎔",
    historygo: "⌁",
    gallery: "▧",
    notes: "✎",
    insta: "◉",
    feed: "#",
    meet: "⟡",
    "data-intake": "⇥",
    "knowledge-curation": "◇",
    "knowledge-map": "🕸",
    "sync-hub": "⇄",
    music: "♫",
    avisa: "📰",
    groups: "◍",
    search: "⌕",
    training: "⚙",
    "personal-ai": "✧",
    privacy: "⚑"
  };

  const MODULE_TYPE_LABELS = {
    personal: "Personlig",
    core: "Kjerne",
    system: "System",
    knowledge: "Kunnskap",
    integration: "Integrasjon",
    historygo: "History Go",
    social: "Sosialt",
    publishing: "Publisering"
  };

  const MODULE_HEALTH_STATUSES = new Set(["ready", "warning", "blocked", "empty", "missing", "unknown"]);
  const MODULE_EMPTY_STATE_TYPES = new Set(["no_data", "missing_source", "not_configured", "filtered_empty", "read_error", "unknown"]);
  const MODULE_EMPTY_STATE_COPY = {
    no_data: {
      default: { title: "Nothing here yet.", message: "Items will appear here when available." },
      lists: { title: "No lists yet.", message: "Lists will appear here when available." },
      paths: { title: "No paths yet.", message: "Paths will appear here when available." },
      groups: { title: "No groups yet.", message: "Local groups will appear here when created." },
      avisa: { title: "No AHAavisa notes yet.", message: "Local drafts and article notes will appear here when created." },
      music: { title: "No imported music metadata yet.", message: "Metadata-only music items will appear here after a local import." }
    },
    missing_source: { title: "Module data not found.", message: "This module has no available local data source." },
    not_configured: { title: "Module not configured.", message: "This module needs a configured data source before items can appear." },
    filtered_empty: { title: "No matching items.", message: "Try changing the filter or search." },
    read_error: { title: "Could not read module data.", message: "Try again later or view diagnostics." },
    unknown: { title: "Nothing to show.", message: "No module data is available." }
  };
  const PREFERRED_ORDER = [
    "chat",
    "profile",
    "notes",
    "feed",
    "gallery",
    "insta",
    "insights",
    "sources",
    "lists",
    "paths",
    "mindmap",
    "search",
    "historygo",
    "music",
    "knowledge-workbench",
    "data-intake",
    "knowledge-curation",
    "knowledge-map",
    "knowledge-graph-intelligence",
    "training",
    "personal-ai",
    "privacy",
    "avisa",
    "groups",
    "meet",
    "sync-hub"
  ];

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

  function moduleTypeLabel(type) {
    return MODULE_TYPE_LABELS[type] || "Modul";
  }

  function renderModuleTypeTag(module) {
    const type = String(module?.type || "");
    const label = moduleTypeLabel(type);
    return `<span class="aha-module-type-tag" data-module-type="${escapeHtml(type)}">${escapeHtml(label)}</span>`;
  }

  function renderMenu({ healthByModule = {}, mountId = "aha-modules-grid" } = {}) {
    const grid = document.getElementById(mountId);
    if (!grid) return;

    grid.innerHTML = orderedModules().map((module) => {
      const isPriority = ["chat", "personal-ai", "training"].includes(module.id);
      const tileClass = `aha-tile${isPriority ? " aha-tile-priority" : ""}`;
      const icon = MODULE_ICONS[module.id] || "◌";
      const badge = renderHealthBadge(module, healthByModule[module.id]);
      const typeTag = renderModuleTypeTag(module);
      const description = module.description
        ? `<p class="aha-module-summary">${escapeHtml(module.description)}</p>`
        : "";
      const cardInner = `
        <span class="aha-module-menu-heading">
          <span class="aha-tile-icon" aria-hidden="true">${icon}</span>
          <strong>${escapeHtml(module.title)}</strong>
        </span>
        ${description}
        <span class="aha-module-tags">
          ${typeTag}
          ${badge}
        </span>
      `;

      if (module.id === "historygo") {
        return `<article class="${tileClass} aha-home-tile" id="aha-historygo-home" data-module="imports" data-module-type="${escapeHtml(module.type || "")}" aria-labelledby="aha-historygo-title">${cardInner.replace(`<strong>${escapeHtml(module.title)}</strong>`, `<strong id="aha-historygo-title">${escapeHtml(module.title)}</strong>`)}
          <div class="aha-tile-actions">
            <a class="aha-tile-btn aha-tile-btn-primary" href="/History-Go/">Åpne History Go</a>
            <button class="aha-tile-btn aha-tile-btn-secondary" id="btn-import-hg" type="button">Importer data</button>
          </div>
        </article>`;
      }

      return `<a class="${tileClass}" href="${escapeHtml(module.href)}" data-module="${escapeHtml(module.id)}" data-module-type="${escapeHtml(module.type || "")}">${cardInner}</a>`;
    }).join("");
  }

  window.AHA_MODULES = AHA_MODULES;
  window.AHAModules = {
    modules: AHA_MODULES,
    icons: MODULE_ICONS,
    typeLabels: MODULE_TYPE_LABELS,
    moduleTypeLabel,
    healthStatuses: [...MODULE_HEALTH_STATUSES],
    normalizeModuleHealth,
    emptyStateTypes: [...MODULE_EMPTY_STATE_TYPES],
    buildModuleEmptyState,
    localPageHealth,
    updatePageHealth,
    renderMenu
  };
})();
