// AHA Local Insight Home Dashboard V1
(function (global) {
  "use strict";
  const $ = (id) => global.document?.getElementById(id);
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const safe = (items) => Array.isArray(items) ? items : [];
  const first = (items) => safe(items)[0] || {};
  const list = (items, render) => safe(items).map(render).join("");
  function set(id, html) { const node = $(id); if (node) node.innerHTML = html; }
  function short(value, max = 110) { const t = String(value == null ? "" : value).replace(/\s+/g, " ").trim(); return t.length > max ? `${t.slice(0, max - 1).trim()}…` : t; }
  function statusText(status) { return ({ needs_review: "Trenger vurdering", strong: "Sterk", active: "Aktiv", starting: "Starter", empty: "Tom", unavailable: "Ikke klar", not_configured: "Ikke satt opp" })[status] || status || "Starter"; }
  function renderHero(payload) {
    const a = first(payload.nextActions);
    set("aha-local-home-hero", `<div><p class="eyebrow">AHA Home</p><h2>${esc(payload.headline || "AHA er klar")}</h2><p>${esc(short(payload.summary || "Home er klart, men AHA har ikke noe nytt materiale ennå. Start i Chat eller legg inn tekst i Data Intake.", 180))}</p></div><div class="aha-home-hero-actions"><a class="aha-tile-btn aha-tile-btn-primary" href="${esc(a.href || "chat.html")}">${esc(a.label || "Åpne Chat")}</a><a class="aha-tile-btn" href="chat.html">Åpne Chat</a><a class="aha-tile-btn" href="knowledge-workbench.html">Åpne Workbench</a></div>`);
  }
  function renderPriorityStrip(payload) {
    const c = payload.counts || {};
    const chips = [
      ["Intake review", c.intakeReview || 0], ["Curation review", c.curationReview || 0], ["Graph insights", c.graphInsights || 0], ["Training ready", c.trainingReady || 0], ["Workflow score", c.workflowScore ? `${c.workflowScore}/100` : "ikke testet"]
    ];
    set("aha-local-home-priority-strip", list(chips, ([label, value]) => `<span class="aha-home-status-chip"><strong>${esc(value)}</strong>${esc(label)}</span>`));
  }
  function renderNextAction(payload) {
    const a = first(payload.nextActions);
    set("aha-local-home-next-action", `<p class="eyebrow">Neste steg</p><h3>${esc(a.label || "Åpne Chat")}</h3><p>${esc(short(a.description || "Bruk AHA med dagens lokale innsiktsgrunnlag.", 140))}</p><span class="aha-home-next-chip">Hvorfor dette? Høyest prioritet akkurat nå.</span>`);
  }
  function renderHighlights(payload) {
    const items = safe(payload.highlights).slice(0, 5);
    set("aha-local-home-highlights", `<p class="eyebrow">Viktig akkurat nå</p><h3>Highlights</h3><div class="aha-local-card-grid aha-home-highlight-list">${list(items, (h) => `<article class="aha-local-card aha-home-highlight"><strong>${esc(short(h.title, 54))}</strong><p>${esc(short(h.summary, 96))}</p><div class="aha-home-card-foot"><span class="aha-home-source-chip">${esc(h.source || "AHA")}</span>${h.href ? `<a href="${esc(h.href)}">${esc(h.actionLabel || "Åpne")}</a>` : ""}</div></article>`)}</div>`);
  }
  function renderActiveWork(payload) {
    const rows = safe(payload.pendingWork).slice(0, 5);
    const empty = rows.every((w) => !(Number(w.count) > 0) && !w.status);
    set("aha-local-home-active-work", `<p class="eyebrow">Aktivt arbeid</p><h3>Kø</h3>${empty ? `<p>Alt er ryddig akkurat nå. Start med Chat eller skann kilder.</p>` : `<div class="aha-home-work-queue">${list(rows, (w) => `<a class="aha-home-work-chip" href="${esc(w.href)}"><strong>${esc(w.count || w.status || 0)}</strong><span>${esc(w.label)}</span></a>`)}</div>`}`);
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
  function render(payload) { if (!payload) return; renderHero(payload); renderPriorityStrip(payload); renderNextAction(payload); renderHighlights(payload); renderActiveWork(payload); renderProjectsConcepts(payload); renderRecentActivity(payload); renderModuleTiles(payload); renderTechnicalDetails(payload); bindActions(); }
  function bindActions() { const btn = $("aha-local-home-refresh"); if (btn && !btn.dataset.bound) { btn.dataset.bound = "true"; btn.addEventListener("click", () => render(global.AHALocalInsightHome?.refreshHome?.({ save: true }))); } }
  function init() { const payload = global.AHALocalInsightHome?.refreshHome?.({ save: true }); render(payload); }
  global.AHALocalInsightHomeDashboard = { init, render, renderHero, renderPriorityStrip, renderNextAction, renderHighlights, renderActiveWork, renderProjectsConcepts, renderRecentActivity, renderModuleTiles, renderTechnicalDetails, bindActions };
  if (global.document) global.document.addEventListener("DOMContentLoaded", init);
})(typeof window !== "undefined" ? window : globalThis);
