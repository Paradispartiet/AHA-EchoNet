// ahaSourcesAudit.js
// Read-only audit view for AHA source events and ingest/insight links.

(function (global) {
  "use strict";

  const SOURCE_KEY = "aha_source_events_v1";
  const CHAMBER_KEY = "aha_insight_chamber_v1";
  const FILTERS = ["all", "chat", "notes", "feed", "gallery", "insta", "historygo", "imported", "local-only", "without-insight", "empty-text"];

  function safeParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  }
  function safeArray(value) { return Array.isArray(value) ? value : []; }
  function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function textOf(value) { return String(value || "").trim(); }
  function loadSourceEvents() { return safeArray(safeParse(global.localStorage?.getItem(SOURCE_KEY), [])); }
  function loadInsightChamber() { return safeObject(safeParse(global.localStorage?.getItem(CHAMBER_KEY), { insights: [] })); }

  function insightList(chamber) {
    if (Array.isArray(chamber?.insights)) return chamber.insights;
    if (Array.isArray(chamber?.signals)) return chamber.signals;
    return [];
  }

  function getInsightSourceEventId(insight) {
    return textOf(insight?.source_event_id || insight?.meta?.source_event_id || insight?.sourceEventId || insight?.source_event?.id);
  }
  function getInsightTime(insight) {
    return textOf(insight?.created_at || insight?.createdAt || insight?.timestamp || insight?.updated_at || insight?.meta?.created_at);
  }
  function insightSummary(insight) {
    return textOf(insight?.summary || insight?.text || insight?.message || insight?.title || insight?.content).slice(0, 180);
  }
  function matchesApp(event, filter) {
    const app = textOf(event.source_app).toLowerCase();
    const type = textOf(event.source_type).toLowerCase();
    if (filter === "historygo") return app.includes("history") || type.includes("history");
    return app.includes(filter) || type.includes(filter);
  }
  function metaSummary(meta) {
    const obj = safeObject(meta);
    const keys = Object.keys(obj).slice(0, 6);
    return keys.length ? keys.map((key) => `${key}: ${typeof obj[key] === "object" ? "…" : String(obj[key]).slice(0, 40)}`).join(" · ") : "Ingen meta";
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
  }

  function collectAuditReport() {
    const rawEvents = loadSourceEvents();
    const chamber = loadInsightChamber();
    const insights = insightList(chamber);
    const insightBySource = new Map();
    const insightsWithoutSourceEventId = [];

    insights.forEach((insight, index) => {
      const sourceId = getInsightSourceEventId(insight);
      const item = { id: textOf(insight?.id) || `insight_${index}`, source_event_id: sourceId, source_type: textOf(insight?.source_type), source_app: textOf(insight?.source_app || insight?.import_source), import_source: textOf(insight?.import_source), summary: insightSummary(insight), created_at: getInsightTime(insight), raw: insight };
      if (sourceId) {
        if (!insightBySource.has(sourceId)) insightBySource.set(sourceId, []);
        insightBySource.get(sourceId).push(item);
      } else {
        insightsWithoutSourceEventId.push(item);
      }
    });

    const events = rawEvents.map((event) => {
      const text = textOf(event?.text);
      const title = textOf(event?.title);
      const explicitLinks = insightBySource.get(textOf(event?.id)) || [];
      const fallbackLinks = insightsWithoutSourceEventId.filter((insight) => {
        const sameType = insight.source_type && insight.source_type === textOf(event?.source_type || "unknown");
        const sameApp = insight.source_app && insight.source_app === textOf(event?.source_app || "unknown");
        const sameImportSource = insight.import_source && insight.import_source === textOf(event?.source_app || "unknown");
        return sameType && (sameApp || sameImportSource);
      });
      const linkedInsights = explicitLinks.concat(fallbackLinks);
      return {
        id: textOf(event?.id), source_type: textOf(event?.source_type || "unknown"), source_app: textOf(event?.source_app || "unknown"), content_type: textOf(event?.content_type || "text"), title,
        text_length: text.length, user_created: event?.user_created !== false, imported: event?.imported === true, local_only: event?.local_only === true || event?.meta?.local_only === true,
        created_at: textOf(event?.created_at), tags: safeArray(event?.tags), meta: safeObject(event?.meta), has_text: Boolean(text), has_title: Boolean(title), is_empty_text_candidate: !text,
        linked_insights: linkedInsights, has_insight: linkedInsights.length > 0, preview: title || text.slice(0, 120) || "(tom tekst)"
      };
    });

    const countBy = (field) => events.reduce((acc, item) => { const key = item[field] || "unknown"; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
    const latest = (values) => values.filter(Boolean).sort().slice(-1)[0] || "";
    return {
      events, insights, insightsWithoutSourceEventId,
      summary: {
        totalSourceEvents: events.length, perSourceApp: countBy("source_app"), perSourceType: countBy("source_type"), localOnlyCount: events.filter((e) => e.local_only).length,
        importedCount: events.filter((e) => e.imported).length, emptyTextCandidateCount: events.filter((e) => e.is_empty_text_candidate).length,
        sourceEventsWithInsight: events.filter((e) => e.has_insight).length, sourceEventsWithoutInsight: events.filter((e) => !e.has_insight).length,
        insightCount: insights.length, insightsWithSourceEventId: insights.length - insightsWithoutSourceEventId.length, latestSourceEventAt: latest(events.map((e) => e.created_at)), latestInsightAt: latest(insights.map(getInsightTime))
      }
    };
  }

  function filterAuditReport(report, filters) {
    const active = typeof filters === "string" ? filters : (filters?.filter || "all");
    const events = report.events.filter((event) => active === "all" ||
      (["chat", "notes", "feed", "gallery", "insta", "historygo"].includes(active) && matchesApp(event, active)) ||
      (active === "imported" && event.imported) || (active === "local-only" && event.local_only) ||
      (active === "without-insight" && !event.has_insight) || (active === "empty-text" && event.is_empty_text_candidate));
    return Object.assign({}, report, { events, activeFilter: active });
  }

  function el(id) { return global.document?.getElementById(id); }
  function renderSummary(report) { const m = el("sources-summary"); if (!m) return; const s = report.summary; m.innerHTML = `<div class="aha-audit-cards">${[["Source events",s.totalSourceEvents],["Local-only",s.localOnlyCount],["Imported",s.importedCount],["Empty text",s.emptyTextCandidateCount],["Med insight",s.sourceEventsWithInsight],["Uten insight",s.sourceEventsWithoutInsight],["Insights",s.insightCount],["Insights m/source id",s.insightsWithSourceEventId]].map(([k,v])=>`<article class="aha-audit-card"><strong>${escapeHtml(v)}</strong><span>${escapeHtml(k)}</span></article>`).join("")}</div><p><strong>Per app:</strong> ${escapeHtml(JSON.stringify(s.perSourceApp))}</p><p><strong>Per type:</strong> ${escapeHtml(JSON.stringify(s.perSourceType))}</p><p><strong>Siste source:</strong> ${escapeHtml(s.latestSourceEventAt || "ukjent")} · <strong>Siste insight:</strong> ${escapeHtml(s.latestInsightAt || "ukjent")}</p>`; }
  function renderFilters(report) { const m = el("sources-filters"); if (!m) return; const active = report.activeFilter || "all"; m.innerHTML = FILTERS.map((f) => `<button type="button" class="aha-filter-chip ${f === active ? "is-active" : ""}" data-filter="${escapeHtml(f)}">${escapeHtml(f.replace("-", " "))}</button>`).join(""); m.querySelectorAll?.("[data-filter]").forEach((btn) => btn.addEventListener("click", () => render(btn.getAttribute("data-filter")))); }
  function renderSourceEvents(report) { const m = el("sources-events"); if (!m) return; m.innerHTML = report.events.map((e) => `<article class="aha-source-event"><header><div><p class="eyebrow">${escapeHtml(e.source_app)} · ${escapeHtml(e.source_type)}</p><h3>${escapeHtml(e.preview)}</h3><p>${escapeHtml(e.created_at || "ukjent tid")}</p></div><span class="aha-status-pill ${e.has_insight ? "" : "is-muted"}">${e.has_insight ? "Har insight" : "Ingen insight funnet"}</span></header><p>${e.imported ? '<span class="aha-pill">imported</span>' : ''}${e.local_only ? '<span class="aha-pill">local-only</span>' : ''}${e.user_created ? '<span class="aha-pill">user-created</span>' : ''}<span class="aha-pill">${escapeHtml(e.text_length)} tegn</span></p><p class="aha-meta-summary">${escapeHtml(metaSummary(e.meta))}</p><details><summary>Detaljer</summary><pre>${escapeHtml(JSON.stringify({ id: e.id, tags: e.tags, meta: e.meta, linked_insights: e.linked_insights.map((i) => ({ id: i.id, summary: i.summary })) }, null, 2))}</pre></details></article>`).join("") || '<p class="aha-empty-state">Ingen source events matcher filteret.</p>'; }
  function renderInsightLinks(report) { const m = el("sources-insight-links"); if (!m) return; const linked = report.events.filter((e) => e.has_insight); const without = report.events.filter((e) => !e.has_insight); m.innerHTML = `<h2>Koblede source events</h2><p>${linked.length} source events har minst én insight-kobling.</p><h2>Uten insight</h2><p>${without.length} source events har ingen funnet kobling.</p><h2>Insights uten source_event_id</h2><p>${report.insightsWithoutSourceEventId.length} insights mangler eksplisitt source_event_id.</p>`; }
  function render(filter) { const report = filterAuditReport(collectAuditReport(), filter || global.__ahaSourcesAuditFilter || "all"); global.__ahaSourcesAuditFilter = report.activeFilter; renderSummary(report); renderFilters(report); renderSourceEvents(report); renderInsightLinks(report); return report; }

  global.AHASourcesAudit = { loadSourceEvents, loadInsightChamber, collectAuditReport, filterAuditReport, render };
  if (global.document?.addEventListener) {
    global.document.addEventListener("DOMContentLoaded", () => render());
    ["aha:source-event-added", "aha:ingested", "aha:source-only", "aha:emne-suggested", "aha:embedding-stored", "aha:merge-suggested"].forEach((name) => global.addEventListener?.(name, () => render()));
  }
})(window);
