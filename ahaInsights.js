// ahaInsights.js
// Fase 3A: Innsiktsvisning for eksisterende chamber/source events.
// Browser-script uten build step / uten ES modules.

(function (global) {
  "use strict";

  const CHAMBER_KEY = "aha_insight_chamber_v1";
  const SOURCE_EVENTS_KEY = "aha_source_events_v1";

  function safeParse(raw, fallback) {
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function readDateValue(item) {
    return item?.created_at || item?.createdAt || item?.updated_at || item?.updatedAt || null;
  }

  function dateTs(value) {
    const t = Date.parse(value || "");
    return Number.isFinite(t) ? t : 0;
  }

  function loadChamber() {
    const fallback = { insights: [] };
    const parsed = safeParse(global.localStorage?.getItem(CHAMBER_KEY), fallback);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  }

  function loadSourceEvents() {
    const parsed = safeParse(global.localStorage?.getItem(SOURCE_EVENTS_KEY), []);
    return Array.isArray(parsed) ? parsed : [];
  }

  function getInsights() {
    const chamber = loadChamber();
    const insights = toArray(chamber?.insights).slice();
    insights.sort((a, b) => dateTs(readDateValue(b)) - dateTs(readDateValue(a)));
    return insights;
  }

  function text(value) {
    return String(value || "").trim();
  }

  function preview(value, maxLen) {
    const raw = text(value).replace(/\s+/g, " ");
    if (!raw) return "";
    return raw.length > maxLen ? `${raw.slice(0, maxLen - 1)}…` : raw;
  }

  function collectTerms(insight) {
    const terms = [];
    [insight?.terms, insight?.tokens, insight?.keywords].forEach((candidate) => {
      if (Array.isArray(candidate)) {
        candidate.forEach((entry) => {
          const v = text(entry);
          if (v) terms.push(v);
        });
      } else if (typeof candidate === "string") {
        candidate.split(",").forEach((entry) => {
          const v = text(entry);
          if (v) terms.push(v);
        });
      }
    });
    return Array.from(new Set(terms.map((term) => term.toLowerCase()))).map((lower) => {
      const original = terms.find((t) => t.toLowerCase() === lower);
      return original || lower;
    });
  }

  function normalizeForDisplay(insight) {
    const fallbackSummary = "Ingen oppsummering tilgjengelig ennå.";
    const normalizedBase = global.AHAContracts?.normalizeBaseItem
      ? global.AHAContracts.normalizeBaseItem(insight || {}, { type: "insight", source: "aha" })
      : null;

    const title = text(insight?.title || insight?.heading || insight?.label || normalizedBase?.title || "Innsikt");
    const summary = text(insight?.summary || insight?.text || insight?.content || insight?.claim || insight?.description || "") || fallbackSummary;
    const topic = text(insight?.topic || insight?.emne || insight?.category || "");
    const confidence = insight?.confidence ?? insight?.score;

    return {
      raw: insight,
      title,
      summary,
      createdAt: readDateValue(insight),
      sourceEventId: text(insight?.source_event_id || ""),
      terms: collectTerms(insight),
      topic,
      confidence
    };
  }

  function matchSourceEvent(indexById, sourceEventId) {
    if (!sourceEventId) return null;
    return indexById.get(sourceEventId) || null;
  }

  function fmtDate(value) {
    if (!value) return "Ukjent tidspunkt";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return "Ukjent tidspunkt";
    return dt.toLocaleString("nb-NO");
  }

  function buildState() {
    const chamber = loadChamber();
    const sourceEvents = loadSourceEvents();
    const sourceIndex = new Map(sourceEvents.map((event) => [String(event?.id || ""), event]));
    const items = getInsights().map((insight) => {
      const display = normalizeForDisplay(insight);
      const source = matchSourceEvent(sourceIndex, display.sourceEventId);
      return { ...display, source };
    });

    return { chamber, sourceEvents, items };
  }

  function sourceSearchBlob(item) {
    return [
      item.title,
      item.summary,
      item.terms.join(" ")
    ].join(" ").toLowerCase();
  }

  function applyFilter(items, query, filter) {
    const q = text(query).toLowerCase();
    return items.filter((item) => {
      if (q && !sourceSearchBlob(item).includes(q)) return false;
      if (filter === "with-source") return Boolean(item.source);
      if (filter === "without-source") return !item.source;
      if (filter === "with-terms") return item.terms.length > 0;
      if (filter === "topic-suggestions") return Boolean(item.raw?.is_topic_suggestion || item.raw?.kind === "emne_suggestion");
      if (filter === "merge-suggestions") return Boolean(item.raw?.is_merge_suggestion || item.raw?.kind === "merge_suggestion");
      return true;
    });
  }

  function render() {
    const root = document.getElementById("aha-insights-root");
    if (!root) return;

    const state = buildState();
    const searchInput = document.getElementById("insights-search");
    const filterSelect = document.getElementById("insights-filter");
    const query = searchInput?.value || "";
    const filter = filterSelect?.value || "all";
    const filtered = applyFilter(state.items, query, filter);

    const stats = {
      insights: state.items.length,
      sourceEvents: state.sourceEvents.length,
      topicSuggestions: toArray(state.chamber?.emne_suggestions).length,
      mergeSuggestions: toArray(state.chamber?.merge_suggestions).length
    };

    const statsNode = document.getElementById("insights-stats");
    if (statsNode) {
      statsNode.innerHTML = `
        <div class="insights-stat"><strong>${stats.insights}</strong><span>Innsikter</span></div>
        <div class="insights-stat"><strong>${stats.sourceEvents}</strong><span>Source events</span></div>
        <div class="insights-stat"><strong>${stats.topicSuggestions}</strong><span>Emneforslag</span></div>
        <div class="insights-stat"><strong>${stats.mergeSuggestions}</strong><span>Merge suggestions</span></div>
      `;
    }

    root.innerHTML = filtered.map((item) => {
      const source = item.source;
      const sourceMarkup = source
        ? `<div class="insights-source"><span class="badge">${text(source.source_type || "source")}</span><span class="badge">${text(source.source_app || "aha")}</span><p>${preview(source.text || source.title || "", 140) || "Ingen preview tilgjengelig."}</p><small>${fmtDate(source.created_at)}</small></div>`
        : `<p class="insights-empty-source">Ingen kilde koblet ennå</p>`;

      const sourceLink = source
        ? `<a class="aha-ghost-button" href="chat.html" title="Åpne chat og finn kilde-event">Åpne kilde</a>`
        : "";

      return `
        <article class="insight-card insight-grid-card">
          <h3 class="insight-card-title">${item.title}</h3>
          <p class="insight-card-summary">${item.summary}</p>
          <div class="insights-meta-row">
            <span class="insight-chip">${fmtDate(item.createdAt)}</span>
            ${item.topic ? `<span class="insight-chip">Emne: ${item.topic}</span>` : ""}
            ${item.confidence !== undefined && item.confidence !== null ? `<span class="insight-chip">Score: ${item.confidence}</span>` : ""}
          </div>
          ${item.terms.length ? `<div class="insight-layer-chips">${item.terms.map((term) => `<span class="insight-chip">${term}</span>`).join("")}</div>` : ""}
          ${sourceMarkup}
          ${sourceLink}
        </article>
      `;
    }).join("") || `<p class="empty-state">Ingen innsikter matcher søk/filter akkurat nå.</p>`;

    const meta = document.getElementById("insights-meta");
    if (meta) {
      const lists = [
        ["emne_suggestions", "Emneforslag"],
        ["merge_suggestions", "Merge suggestions"],
        ["merge_dismissals", "Merge dismissals"],
        ["patterns", "Patterns"],
        ["meta_insights", "Meta insights"]
      ];

      meta.innerHTML = lists.map(([key, label]) => {
        const values = toArray(state.chamber?.[key]);
        const entries = values.slice(0, 5).map((entry) => `<li>${preview(JSON.stringify(entry), 120)}</li>`).join("");
        return `<section class="meta-section"><p class="meta-section-label">${label} <span class="meta-count">(${values.length})</span></p>${entries ? `<ul class="meta-section-list">${entries}</ul>` : `<p class="meta-empty">Ingen data ennå.</p>`}</section>`;
      }).join("");
    }
  }

  function refresh() {
    render();
  }

  global.AHAInsights = {
    loadChamber,
    loadSourceEvents,
    getInsights,
    render,
    refresh
  };

  document.addEventListener("DOMContentLoaded", function () {
    const refreshBtn = document.getElementById("insights-refresh");
    const searchInput = document.getElementById("insights-search");
    const filterSelect = document.getElementById("insights-filter");

    refreshBtn?.addEventListener("click", refresh);
    searchInput?.addEventListener("input", render);
    filterSelect?.addEventListener("change", render);

    render();
  });
})(window);
