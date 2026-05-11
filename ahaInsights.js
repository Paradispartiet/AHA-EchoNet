// ahaInsights.js
// Leser eksisterende innsiktskammer + source events og viser innsikter i insights.html.

(function (global) {
  "use strict";

  const CHAMBER_KEY = "aha_insight_chamber_v1";
  const EVENTS_KEY = "aha_source_events_v1";

  function safeParse(raw, fallback) {
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

  function asText(value, fallback) {
    const text = String(value || "").trim();
    return text || fallback;
  }

  function ts(item) {
    const raw = item?.created_at || item?.createdAt || item?.updated_at || item?.updatedAt || "";
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : 0;
  }

  function loadChamber() {
    const raw = localStorage.getItem(CHAMBER_KEY);
    const parsed = safeParse(raw || "{}", { insights: [] });
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { insights: [] };
    if (!Array.isArray(parsed.insights)) parsed.insights = [];
    return parsed;
  }

  function loadSourceEvents() {
    const raw = localStorage.getItem(EVENTS_KEY);
    const parsed = safeParse(raw || "[]", []);
    return Array.isArray(parsed) ? parsed : [];
  }

  function getInsights() {
    const chamber = loadChamber();
    const items = asArray(chamber?.insights).slice();
    items.sort((a, b) => ts(b) - ts(a));
    return items;
  }

  function normalizeInsightForView(insight) {
    const base = global.AHAContracts?.normalizeBaseItem
      ? global.AHAContracts.normalizeBaseItem(insight, { type: "insight", source: "aha" })
      : null;

    return {
      raw: insight,
      title: asText(insight?.title || insight?.heading || insight?.label || base?.title, "Innsikt"),
      summary: asText(insight?.summary || insight?.text || insight?.content || insight?.claim, "Ingen oppsummering ennå."),
      date: asText(insight?.created_at || insight?.createdAt || insight?.updated_at || insight?.updatedAt, "Ukjent tidspunkt"),
      sourceEventId: asText(insight?.source_event_id, ""),
      terms: asArray(insight?.terms).concat(asArray(insight?.tokens), asArray(insight?.keywords)).filter(Boolean),
      topic: asText(insight?.topic || insight?.emne || insight?.category, ""),
      confidence: insight?.confidence ?? insight?.score ?? null
    };
  }

  function eventPreview(event) {
    const text = asText(event?.text || event?.title, "");
    return text.length > 140 ? `${text.slice(0, 137)}…` : text;
  }

  function findSourceById(sourceEvents, id) {
    if (!id) return null;
    return sourceEvents.find((ev) => String(ev?.id || "") === String(id)) || null;
  }

  function countArray(data) {
    return Array.isArray(data) ? data.length : 0;
  }

  function createInsightCard(view, sourceEvent) {
    const card = document.createElement("article");
    card.className = "insight-card insight-archive-card";

    const terms = view.terms.slice(0, 8).map((t) => `<span class="insight-chip">${String(t)}</span>`).join("");
    const sourceHtml = sourceEvent
      ? `<div class="insight-source"><strong>Kilde:</strong> ${asText(sourceEvent.source_type, "ukjent")} · ${asText(sourceEvent.source_app, "ukjent")}</div>
         <div class="insight-source-preview">${eventPreview(sourceEvent)}</div>
         <div class="insight-source-time">${asText(sourceEvent.created_at, "Ukjent tidspunkt")}</div>
         <a class="aha-tile-btn" href="#source-${asText(sourceEvent.id, "")}">Åpne kilde</a>`
      : `<div class="insight-source-missing">Ingen kilde koblet ennå</div>`;

    card.innerHTML = `
      <header class="insight-card-head">
        <h3>${view.title}</h3>
        <span class="insight-chip">${view.date}</span>
      </header>
      <p class="insight-card-summary">${view.summary}</p>
      <div class="insight-meta-row">
        ${view.topic ? `<span class="insight-chip">Emne: ${view.topic}</span>` : ""}
        ${view.confidence !== null ? `<span class="insight-chip">Score: ${Number(view.confidence).toFixed(2)}</span>` : ""}
        ${view.sourceEventId ? `<span class="insight-chip">Kilde-ID: ${view.sourceEventId}</span>` : ""}
      </div>
      ${terms ? `<div class="insight-layer-chips">${terms}</div>` : ""}
      <section class="insight-source-block">${sourceHtml}</section>
    `;

    return card;
  }

  function applyFilters(insights, eventsById, query, filter) {
    const q = String(query || "").toLowerCase().trim();
    return insights.filter((ins) => {
      const view = normalizeInsightForView(ins);
      const sourceEvent = findSourceById(eventsById, view.sourceEventId);
      const haystack = [
        view.title,
        view.summary,
        view.terms.join(" ")
      ].join(" ").toLowerCase();
      const searchMatch = !q || haystack.includes(q);
      if (!searchMatch) return false;

      if (filter === "with_source") return Boolean(sourceEvent);
      if (filter === "without_source") return !sourceEvent;
      if (filter === "with_terms") return view.terms.length > 0;
      if (filter === "emne") return Boolean(ins?.emne_suggestions || ins?.topic_suggestions);
      if (filter === "merge") return Boolean(ins?.merge_suggestions);
      return true;
    });
  }

  function renderMeta(chamber) {
    const target = document.getElementById("insights-meta");
    if (!target) return;
    const emne = asArray(chamber?.emne_suggestions);
    const merge = asArray(chamber?.merge_suggestions);
    const dismiss = asArray(chamber?.merge_dismissals);
    const patterns = asArray(chamber?.patterns);
    const metaInsights = asArray(chamber?.meta_insights);

    const list = (items, mapper) => items.slice(0, 5).map(mapper).join("");

    target.innerHTML = `
      <h2>Meta / forslag</h2>
      <div class="insight-meta-row">
        <span class="insight-chip">Emneforslag: ${emne.length}</span>
        <span class="insight-chip">Merge suggestions: ${merge.length}</span>
        <span class="insight-chip">Merge dismissals: ${dismiss.length}</span>
        <span class="insight-chip">Patterns: ${patterns.length}</span>
        <span class="insight-chip">Meta insights: ${metaInsights.length}</span>
      </div>
      <div class="meta-columns">
        <div><h4>Emneforslag</h4><ul>${list(emne, (x) => `<li>${asText(x?.label || x?.title || x?.emne_id, "Forslag")}</li>`) || "<li>Ingen ennå</li>"}</ul></div>
        <div><h4>Merge suggestions</h4><ul>${list(merge, (x) => `<li>${asText(x?.reason || x?.description || x?.id, "Forslag")}</li>`) || "<li>Ingen ennå</li>"}</ul></div>
        <div><h4>Patterns / Meta</h4><ul>${list(patterns.concat(metaInsights), (x) => `<li>${asText(x?.description || x?.title || x?.id, "Meta")}</li>`) || "<li>Ingen ennå</li>"}</ul></div>
      </div>
    `;
  }

  function render() {
    const chamber = loadChamber();
    const sourceEvents = loadSourceEvents();
    const insights = getInsights();

    const search = document.getElementById("insights-search")?.value || "";
    const filter = document.getElementById("insights-filter")?.value || "all";
    const listEl = document.getElementById("insights-list");

    const filtered = applyFilters(insights, sourceEvents, search, filter);

    const stats = document.getElementById("insights-stats");
    if (stats) {
      stats.innerHTML = `
        <span class="insight-chip">Innsikter: ${insights.length}</span>
        <span class="insight-chip">Source events: ${sourceEvents.length}</span>
        <span class="insight-chip">Emneforslag: ${countArray(chamber?.emne_suggestions)}</span>
        <span class="insight-chip">Merge suggestions: ${countArray(chamber?.merge_suggestions)}</span>
      `;
    }

    if (listEl) {
      listEl.innerHTML = "";
      if (!filtered.length) {
        listEl.innerHTML = '<article class="insight-card"><p class="insight-card-summary">Ingen innsikter matcher søk/filter ennå.</p></article>';
      } else {
        filtered.forEach((ins) => {
          const view = normalizeInsightForView(ins);
          const sourceEvent = findSourceById(sourceEvents, view.sourceEventId);
          listEl.appendChild(createInsightCard(view, sourceEvent));
        });
      }
    }

    renderMeta(chamber);
  }

  function refresh() {
    render();
  }

  function attach() {
    const refreshBtn = document.getElementById("insights-refresh");
    const search = document.getElementById("insights-search");
    const filter = document.getElementById("insights-filter");

    if (refreshBtn) refreshBtn.addEventListener("click", refresh);
    if (search) search.addEventListener("input", render);
    if (filter) filter.addEventListener("change", render);

    render();
  }

  global.AHAInsights = {
    loadChamber,
    loadSourceEvents,
    getInsights,
    render,
    refresh
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attach);
  } else {
    attach();
  }
})(window);
