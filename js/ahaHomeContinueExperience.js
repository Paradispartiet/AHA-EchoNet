// AHA Home Continue Experience
// User-facing, read-only decision layer for the Home start surface.
// Reuses existing Home/Daily Loop/Insight data and introduces no persistence.
(function (global) {
  "use strict";

  const VERSION = "aha_home_continue_experience_v1";
  const $ = (id) => global.document?.getElementById?.(id) || null;
  const safeObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const safeArray = (value) => Array.isArray(value) ? value : [];
  const num = (value) => {
    const n = Number(value || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const text = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const short = (value, max = 140) => {
    const t = text(value);
    return t.length > max ? `${t.slice(0, Math.max(0, max - 1)).trim()}…` : t;
  };
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);

  function latestInsightModel() {
    try {
      return global.AHALocalInsightHomeDashboard?.loadLatestInsightHomeModel?.() || null;
    } catch {
      return null;
    }
  }

  function homePayload() {
    try {
      return global.AHALocalInsightHome?.buildHomeInsightPayload?.({ save: false, lightweight: true }) ||
        global.AHALocalInsightHome?.loadHomePayload?.() || null;
    } catch {
      return global.AHALocalInsightHome?.loadHomePayload?.() || null;
    }
  }

  function dailyLoop() {
    try {
      return global.AHADailyOperatingLoop?.buildDailyLoopStatus?.({ save: false }) ||
        global.AHADailyOperatingLoop?.loadDailyLoopStatus?.() || null;
    } catch {
      return global.AHADailyOperatingLoop?.loadDailyLoopStatus?.() || null;
    }
  }

  function buildExperience(input = {}) {
    const home = safeObject(input.home);
    const loop = safeObject(input.loop);
    const insight = safeObject(input.latestInsight);
    const homeCounts = safeObject(home.counts);
    const loopCounts = safeObject(loop.meta?.counts || loop.counts);
    const counts = {
      intakeReview: num(loopCounts.intakeReview || homeCounts.intakeReview),
      curationReview: num(loopCounts.curationReview || homeCounts.curationReview),
      graphInsights: num(loopCounts.graphInsights || homeCounts.graphInsights),
      trainingReady: num(loopCounts.trainingReady || homeCounts.trainingReady),
      chatMessages: num(loopCounts.chatMessages || homeCounts.chatMessages),
      corpusItems: num(loopCounts.corpusItems || homeCounts.corpusItems)
    };
    const pendingReview = counts.intakeReview + counts.curationReview;
    const projects = safeArray(home.activeProjects);
    const firstProject = projects.find((project) => text(project?.title));

    const model = {
      version: VERSION,
      mode: "start_chat",
      eyebrow: "Fortsett her",
      title: "Start med det du vil tenke videre på",
      description: "Chat er den enkleste inngangen. AHA bruker det lokale grunnlaget ditt og bygger videre derfra.",
      reason: "Ingen viktigere brukeroppgave venter akkurat nå.",
      primaryAction: { label: "Åpne Chat", href: "chat.html" },
      secondaryAction: { label: "Se Bibliotek", href: "search.html" },
      context: [],
      counts,
      technicalPrimarySuppressed: false,
      localOnly: true,
      readOnly: true
    };

    if (pendingReview > 0) {
      model.mode = "review_work";
      model.title = "Fortsett kunnskapsarbeidet";
      model.description = `${pendingReview} ${pendingReview === 1 ? "ting venter" : "ting venter"} på vurdering. Ta dem samlet i Workbench i stedet for å hoppe mellom tekniske steg.`;
      model.reason = "Du har faktisk arbeid som allerede er klart for en beslutning.";
      model.primaryAction = { label: "Fortsett i Workbench", href: "knowledge-workbench.html" };
      model.secondaryAction = { label: "Se siste innsikt", href: "insights.html" };
      model.context = [
        counts.intakeReview ? `${counts.intakeReview} nye til vurdering` : "",
        counts.curationReview ? `${counts.curationReview} kurateringer venter` : ""
      ].filter(Boolean);
      return model;
    }

    if (counts.trainingReady > 0 || counts.graphInsights > 0) {
      model.mode = "knowledge_step";
      model.title = "Ta neste steg med kunnskapen din";
      model.description = counts.trainingReady > 0
        ? `${counts.trainingReady} ${counts.trainingReady === 1 ? "ting er" : "ting er"} klare til å føres videre i kunnskapsløypa.`
        : `${counts.graphInsights} ${counts.graphInsights === 1 ? "kobling eller forslag er" : "koblinger eller forslag er"} klare til vurdering.`;
      model.reason = "AHA har allerede bearbeidet materiale som trenger ditt blikk før det går videre.";
      model.primaryAction = { label: "Åpne Workbench", href: "knowledge-workbench.html" };
      model.secondaryAction = { label: "Spør AHA om dette", href: "chat.html" };
      model.context = [
        counts.graphInsights ? `${counts.graphInsights} forslag` : "",
        counts.trainingReady ? `${counts.trainingReady} klare videre` : ""
      ].filter(Boolean);
      return model;
    }

    if (text(insight.text)) {
      model.mode = "continue_insight";
      model.title = "Tenk videre på siste innsikt";
      model.description = short(insight.text, 170);
      model.reason = insight.mode === "chat_provenance"
        ? "Dette er det siste AHA faktisk opprettet eller forsterket fra samtalen din."
        : "Dette er den siste lagrede innsikten i AHA.";
      model.primaryAction = { label: "Fortsett i Chat", href: "chat.html" };
      model.secondaryAction = { label: "Se innsikten", href: "insights.html" };
      model.context = [
        insight.createdCount ? `${insight.createdCount} nye` : "",
        insight.reinforcedCount ? `${insight.reinforcedCount} forsterket` : ""
      ].filter(Boolean);
      return model;
    }

    if (firstProject) {
      model.mode = "continue_project";
      model.title = `Fortsett med ${short(firstProject.title, 70)}`;
      model.description = "Ta opp det aktive sporet i Chat, eller finn materialet igjen i Biblioteket.";
      model.reason = "Dette er et aktivt spor i det eksisterende kunnskapsgrunnlaget ditt.";
      model.primaryAction = { label: "Fortsett i Chat", href: "chat.html" };
      model.secondaryAction = { label: "Finn i Bibliotek", href: "search.html" };
      model.context = firstProject.count ? [`${firstProject.count} koblede elementer`] : [];
      return model;
    }

    if (counts.chatMessages > 0 || counts.corpusItems > 0) {
      model.mode = "continue_chat";
      model.title = "Fortsett der du slapp";
      model.description = "AHA har allerede lokalt materiale å arbeide med. Gå tilbake til Chat og bygg videre på det.";
      model.reason = "Du har tidligere aktivitet, men ingen viktig review-kø som bør stoppe deg først.";
      model.primaryAction = { label: "Fortsett i Chat", href: "chat.html" };
      model.secondaryAction = { label: "Se Bibliotek", href: "search.html" };
      return model;
    }

    const loopAction = safeObject(loop.nextBestAction);
    const technical = /audit|workflow|graph intelligence|training corpus|index/i.test(`${text(loopAction.id)} ${text(loopAction.label)}`);
    model.technicalPrimarySuppressed = technical;
    return model;
  }

  function installStyles() {
    if (!global.document?.head || global.document.getElementById("aha-home-continue-styles")) return;
    const style = global.document.createElement("style");
    style.id = "aha-home-continue-styles";
    style.textContent = `
      body.aha-home-continue-mode #aha-local-home-hero,
      body.aha-home-continue-mode #aha-local-home-priority-strip,
      body.aha-home-continue-mode #aha-local-home-next-action { display:none !important; }
      body.aha-home-continue-mode .aha-home-app-card-daily > .aha-home-card-head > a { display:none !important; }
      body.aha-home-continue-mode .aha-home-app-card-daily { border-color:rgba(246,200,0,.28); }
      .aha-home-continue-card { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:18px; align-items:end; padding:4px 0 2px; }
      .aha-home-continue-copy h3 { margin:4px 0 7px; font-size:clamp(1.3rem,2.4vw,2rem); line-height:1.12; }
      .aha-home-continue-copy p { margin:0; max-width:68ch; }
      .aha-home-continue-reason { color:var(--muted,#a9a9b3); font-size:.86rem; margin-top:8px !important; }
      .aha-home-continue-context { display:flex; flex-wrap:wrap; gap:7px; margin-top:12px; }
      .aha-home-continue-context span { border:1px solid rgba(255,255,255,.12); border-radius:999px; padding:5px 9px; font-size:.76rem; }
      .aha-home-continue-actions { display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; }
      @media (max-width:760px){
        .aha-home-continue-card { grid-template-columns:1fr; align-items:start; }
        .aha-home-continue-actions { justify-content:flex-start; }
        .aha-home-continue-actions .aha-tile-btn { flex:1 1 150px; }
      }
    `;
    global.document.head.appendChild(style);
  }

  function render(modelArg) {
    const model = safeObject(modelArg);
    const mount = $("aha-local-home-daily-loop");
    if (!mount) return false;
    const title = $("aha-home-daily-title");
    if (title) title.textContent = "Fortsett her";
    global.document?.body?.classList?.add("aha-home-continue-mode");
    installStyles();
    mount.innerHTML = `<div class="aha-home-continue-card" data-home-continue-mode="${esc(model.mode || "start_chat")}">
      <div class="aha-home-continue-copy">
        <p class="eyebrow">${esc(model.eyebrow || "Fortsett her")}</p>
        <h3>${esc(model.title || "Start med AHA")}</h3>
        <p>${esc(model.description || "Åpne Chat og bygg videre.")}</p>
        <p class="aha-home-continue-reason">${esc(model.reason || "")}</p>
        ${safeArray(model.context).length ? `<div class="aha-home-continue-context">${safeArray(model.context).map((item) => `<span>${esc(item)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="aha-home-continue-actions">
        <a class="aha-tile-btn aha-tile-btn-primary" href="${esc(model.primaryAction?.href || "chat.html")}">${esc(model.primaryAction?.label || "Åpne Chat")}</a>
        <a class="aha-tile-btn" href="${esc(model.secondaryAction?.href || "search.html")}">${esc(model.secondaryAction?.label || "Se Bibliotek")}</a>
      </div>
    </div>`;
    return true;
  }

  function refresh() {
    const model = buildExperience({ home: homePayload(), loop: dailyLoop(), latestInsight: latestInsightModel() });
    render(model);
    return model;
  }

  function init() {
    refresh();
    ["aha:ingested", "aha:source-event-added"].forEach((eventName) => global.addEventListener?.(eventName, refresh));
  }

  global.AHAHomeContinueExperience = { VERSION, buildExperience, render, refresh, init };
  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", init);
  else if (global.document) init();
})(typeof window !== "undefined" ? window : globalThis);
