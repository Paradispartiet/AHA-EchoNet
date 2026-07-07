// AHA Local Insight Home Dashboard V1
(function (global) {
  "use strict";
  const $ = (id) => global.document?.getElementById(id);
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const safe = (items) => Array.isArray(items) ? items : [];
  const first = (items) => safe(items).find((item) => item && typeof item === "object") || {};
  const list = (items, render) => safe(items).map(render).filter(Boolean).join("");
  const hasText = (value) => String(value == null ? "" : value).trim().length > 0;
  const hasRenderable = (...values) => values.some(hasText);
  function set(id, html) { const node = $(id); if (node) node.innerHTML = html; }
  function short(value, max = 110) { const t = String(value == null ? "" : value).replace(/\s+/g, " ").trim(); return t.length > max ? `${t.slice(0, max - 1).trim()}…` : t; }
  function statusText(status) { return ({ needs_review: "Trenger vurdering", strong: "Sterk", active: "Aktiv", starting: "Starter", empty: "Tom", unavailable: "Ikke klar", not_configured: "Ikke satt opp" })[status] || status || "Starter"; }
  function renderHero(payload) {
    const a = first(payload.nextActions);
    const summary = payload.summary || "Home er klart, men AHA har ikke noe nytt materiale ennå.";
    set("aha-local-home-hero", `<div class="aha-home-hero-copy"><p class="eyebrow">AHA Home</p><h2>${esc(payload.headline || "AHA er klar")}</h2><p>${esc(short(summary, 180))}</p></div><div class="aha-home-hero-actions"><a class="aha-tile-btn aha-tile-btn-primary" href="${esc(a.href || "chat.html")}">${esc(a.label || "Åpne Chat")}</a><a class="aha-tile-btn" href="chat.html">Åpne Chat</a><a class="aha-tile-btn" href="knowledge-workbench.html">Åpne Workbench</a></div>`);
  }
  function renderPriorityStrip(payload) {
    const c = payload.counts || {};
    const chips = [
      ["Intake review", c.intakeReview || 0], ["Curation review", c.curationReview || 0], ["Graph insights", c.graphInsights || 0], ["Training ready", c.trainingReady || 0], ["Workflow score", c.workflowScore ? `${c.workflowScore}/100` : "ikke testet"]
    ];
    set("aha-local-home-priority-strip", list(chips, ([label, value]) => `<span class="aha-home-status-chip"><strong>${esc(value)}</strong>${esc(label)}</span>`));
  }

  function renderDailyLoop() {
    let loop = null;

    try {
      loop =
        global.AHADailyOperatingLoop?.refreshDailyLoop?.({ save: true, lightweight: true }) ||
        global.AHADailyOperatingLoop?.loadDailyLoopStatus?.();
    } catch (err) {
      console.warn("AHA Daily Loop kunne ikke renderes", err);
    }
    if (!loop) { set("aha-local-home-daily-loop", `<p class="eyebrow">Dagens AHA-løype</p><h3>Ikke klar ennå</h3><p>Daily Operating Loop lastes når modulen er tilgjengelig.</p>`); return; }
    const action = loop.nextBestAction || {};
    const queue = safe(loop.actionQueue).slice(0, 3);
    const prompts = safe(loop.suggestedPrompts).slice(0, 3);
    set("aha-local-home-daily-loop", `<p class="eyebrow">Dagens AHA-løype</p><h3>${esc(short(loop.currentFocus || action.label || "Neste beste handling", 72))}</h3><p>${esc(loop.changedSinceLastRun?.summary || "Ingen endringer siden sist.")}</p><div class="aha-home-status-chip"><strong>${esc(action.label || "Åpne Chat")}</strong>${esc(short(action.description || "Start dagens AHA-arbeid.", 96))}</div><div class="aha-home-work-queue">${list(queue, (a) => `<a class="aha-home-work-chip" href="${esc(a.href || "chat.html")}"><strong>${esc(a.priority || "•")}</strong><span>${esc(short(a.label, 38))}</span></a>`)}</div><div class="aha-home-tag-list">${list(prompts, (p) => `<a class="aha-home-tag" href="${esc(p.href || "chat.html")}" title="${esc(p.prompt)}">${esc(short(p.label, 32))}</a>`)}</div><div class="aha-tile-actions"><a class="aha-tile-btn aha-tile-btn-primary" href="chat.html">Åpne Chat</a><a class="aha-tile-btn" href="knowledge-workbench.html">Åpne Workbench</a><button id="aha-daily-loop-refresh" class="aha-tile-btn" type="button">Oppdater dagens løype</button></div>`);
    const btn = $("aha-daily-loop-refresh"); if (btn) btn.addEventListener("click", () => renderDailyLoop());
  }

  function renderNextAction(payload) {
    const a = first(payload.nextActions);
    set("aha-local-home-next-action", `<p class="eyebrow">Neste steg</p><h3>${esc(a.label || "Åpne Chat")}</h3><p>${esc(short(a.description || "Bruk AHA med dagens lokale innsiktsgrunnlag.", 140))}</p><span class="aha-home-next-chip">Hvorfor dette? Høyest prioritet akkurat nå.</span>`);
  }
  function renderHighlights(payload) {
    const items = safe(payload.highlights).filter((h) => hasRenderable(h?.title, h?.summary, h?.source)).slice(0, 5);
    const content = items.length
      ? `<div class="aha-local-card-grid aha-home-highlight-list">${list(items, (h) => `<article class="aha-local-card aha-home-highlight"><strong>${esc(short(h.title || "Teknisk funn", 54))}</strong>${hasText(h.summary) ? `<p>${esc(short(h.summary, 96))}</p>` : ""}<div class="aha-home-card-foot"><span class="aha-home-source-chip">${esc(h.source || "AHA")}</span>${h.href ? `<a href="${esc(h.href)}">${esc(h.actionLabel || "Åpne")}</a>` : ""}</div></article>`)}</div>`
      : `<p class="aha-home-empty-state">Ingen tekniske funn ennå.</p>`;
    set("aha-local-home-highlights", `<p class="eyebrow">Viktig akkurat nå</p><h3>Highlights</h3>${content}`);
  }
  function renderActiveWork(payload) {
    const rows = safe(payload.pendingWork).filter((w) => hasRenderable(w?.label) && (Number(w?.count) > 0 || hasText(w?.status))).slice(0, 5);
    const visibleRows = rows.filter((w) => Number(w.count) > 0 || !["0", "empty", "tom"].includes(String(w.status || "").toLowerCase()));
    set("aha-local-home-active-work", `<p class="eyebrow">Aktivt arbeid</p><h3>Kø</h3>${visibleRows.length ? `<div class="aha-home-work-queue">${list(visibleRows, (w) => `<a class="aha-home-work-chip" href="${esc(w.href || "knowledge-workbench.html")}"><strong>${esc(w.count || w.status)}</strong><span>${esc(w.label)}</span></a>`)}</div>` : `<p class="aha-home-empty-state">Home er klart, men AHA har ikke noe nytt materiale ennå.</p>`}`);
  }
  function renderProjectsConcepts(payload) {
    const c = payload.counts || {}; const projects = safe(payload.activeProjects).slice(0, 3);
    set("aha-local-home-projects", `<p class="eyebrow">Prosjekter og begreper</p><h3>Kunnskapskart</h3><div class="aha-home-tag-row"><span>Prosjekter: <strong>${esc(c.activeProjects || projects.length || 0)}</strong></span><span>Begreper: <strong>${esc(c.topConcepts || 0)}</strong></span><span>Svake felt: <strong>${esc(c.underExplained || 0)}</strong></span></div><div class="aha-home-tag-list">${list(projects, (p) => `<span class="aha-home-tag">${esc(short(p.title, 32))} · ${esc(p.count || p.score || 0)} noder</span>`) || `<span class="aha-home-tag">Kunnskapskartet er ikke bygget ennå.</span>`}</div>`);
  }
  function renderRecentActivity(payload) {
    const rows = safe(payload.recentActivity).slice(0, 5);
    set("aha-local-home-recent", `<p class="eyebrow">Siste aktivitet</p><h3>Lokale spor</h3><ul class="aha-activity-list aha-home-recent-list">${list(rows, (a) => `<li><a href="${esc(a.href)}"><strong>${esc(a.label)}</strong><span>${esc(short(a.title, 70))}</span>${a.timestamp ? `<small>${esc(a.timestamp)}</small>` : ""}</a></li>`) || `<li><span>Ingen ny aktivitet ennå.</span></li>`}</ul>`);
  }
  function renderModuleTiles(payload) {
    set("aha-local-home-module-tiles", `<p class="eyebrow">Hvor går jeg videre?</p><h3>Moduler</h3><div class="aha-local-module-grid aha-home-module-compact-grid">${list(payload.moduleTiles, (t) => `<a class="aha-local-module-tile aha-home-module-compact-tile" href="${esc(t.href)}"><span class="aha-home-module-top"><strong>${esc(t.title)}</strong><small>${esc(statusText(t.status))}</small></span><span>${esc(first(t.metrics) || "Klar")}</span><em>Åpne</em></a>`)}</div>`); }
  function renderTechnicalDetails(payload) {
    set("aha-local-home-technical-content", `<p>Home lagrer kun lokal status-snapshot og kjører ingen godkjenning, training, sync eller import ved lasting.</p><pre>${esc(JSON.stringify({ generatedAt: payload.generatedAt, version: payload.version, status: payload.status, counts: payload.counts, warnings: payload.warnings || [] }, null, 2))}</pre>`);
  }
  function render(payload) { if (!payload) payload = { status: "empty", headline: "AHA er klar for første lokale innsikt.", summary: "Home er klart, men AHA har ikke noe nytt materiale ennå.", counts: {}, nextActions: [{ label: "Åpne Chat", href: "chat.html" }], highlights: [], pendingWork: [], activeProjects: [], recentActivity: [], moduleTiles: [], warnings: [] }; renderHero(payload); renderPriorityStrip(payload); renderDailyLoop(); renderNextAction(payload); renderHighlights(payload); renderActiveWork(payload); renderProjectsConcepts(payload); renderRecentActivity(payload); renderModuleTiles(payload); renderTechnicalDetails(payload); bindActions(); }
  function bindActions() { const btn = $("aha-local-home-refresh"); if (btn && !btn.dataset.bound) { btn.dataset.bound = "true"; btn.addEventListener("click", () => render(global.AHALocalInsightHome?.refreshHome?.({ save: true }))); } }
  function init() { const payload = global.AHALocalInsightHome?.refreshHome?.({ save: true }) || null; render(payload); }
  global.AHALocalInsightHomeDashboard = { init, render, renderHero, renderPriorityStrip, renderNextAction, renderHighlights, renderActiveWork, renderProjectsConcepts, renderRecentActivity, renderModuleTiles, renderDailyLoop, renderTechnicalDetails, bindActions };
  if (global.document) global.document.addEventListener("DOMContentLoaded", init);
})(typeof window !== "undefined" ? window : globalThis);
