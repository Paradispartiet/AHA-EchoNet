// AHA Knowledge Workbench Dashboard V2 – user-facing presentation over the existing Workbench status model.
// Technical pipeline controls remain under the advanced section. No new state, approval logic or automation.
(function (global) {
  "use strict";

  const doc = global.document;
  let last = null;

  const STAGE_LABELS = {
    sources: "Kilder",
    intake: "Inntak",
    curation: "Kuratering",
    map: "Kunnskapskart",
    graph_intelligence: "Sammenhenger og forslag",
    training: "Godkjent kunnskapsgrunnlag",
    personal_ai: "Personal AI",
    chat: "Bruk i Chat"
  };

  const NEXT_EXPLANATIONS = {
    scan_sources: "Nye funn går først til Data Intake som kandidater. Ingenting blir automatisk godkjent kunnskap.",
    review_intake: "Når du har vurdert nye kandidater, kan relevant materiale gå videre til kuratering.",
    build_curation_queue: "Kurateringskøen samler materialet som må ryddes, prioriteres og godkjennes manuelt.",
    approve_curation: "Godkjent kuratering kan brukes til å bygge det lokale kunnskapskartet.",
    refresh_knowledge_map: "Kunnskapskartet organiserer godkjent materiale som prosjekter, begreper og koblinger.",
    analyze_graph: "Graph Intelligence foreslår mulige koblinger og hull. Forslagene er ikke canonical sannhet.",
    send_to_training: "Materiale som er klart kan legges i det godkjente kunnskapsgrunnlaget for Personal AI.",
    personal_ai_index: "Når grunnlaget er klart, kan Personal AI bygge lokal retrieval over det godkjente materialet.",
    open_chat: "Kunnskapsløypa er klar nok til at du kan bruke det godkjente grunnlaget i Chat."
  };

  function $(id) { return doc && doc.getElementById(id); }
  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function num(value) { return Number(value) || 0; }
  function api() { return global.AHAKnowledgeWorkbench; }
  function stageLabel(id) { return STAGE_LABELS[String(id || "")] || String(id || "Ukjent steg"); }

  function buildWorkbenchExperienceModel(statusArg) {
    const status = obj(statusArg);
    const counts = obj(status.counts);
    const workflow = obj(status.workflow);
    const stageCards = arr(workflow.stageCards);
    const next = obj(status.nextAction);
    const waiting = [];

    if (num(counts.intakeReview)) {
      waiting.push({
        id: "intake_review",
        count: num(counts.intakeReview),
        title: num(counts.intakeReview) === 1 ? "1 nytt element trenger vurdering" : `${num(counts.intakeReview)} nye elementer trenger vurdering`,
        description: "Avgjør hva som er relevant nok til å gå videre fra Data Intake.",
        href: "intake.html"
      });
    }
    if (num(counts.curationReview)) {
      waiting.push({
        id: "curation_review",
        count: num(counts.curationReview),
        title: num(counts.curationReview) === 1 ? "1 kuratering trenger godkjenning" : `${num(counts.curationReview)} kurateringer trenger godkjenning`,
        description: "Rydd og godkjenn materialet før det kan behandles som kuratert kunnskap.",
        href: "curation.html"
      });
    }
    if (num(counts.graphInsights)) {
      waiting.push({
        id: "graph_review",
        count: num(counts.graphInsights),
        title: num(counts.graphInsights) === 1 ? "1 grafinnsikt å se gjennom" : `${num(counts.graphInsights)} grafinnsikter å se gjennom`,
        description: "Dette er forslag til sammenhenger og hull, ikke ferdig godkjent kunnskap.",
        href: "knowledge-map.html#graph-intelligence"
      });
    }
    if (num(counts.trainingReady)) {
      waiting.push({
        id: "training_ready",
        count: num(counts.trainingReady),
        title: num(counts.trainingReady) === 1 ? "1 element er klart for Training" : `${num(counts.trainingReady)} elementer er klare for Training`,
        description: "Godkjent materiale kan flyttes videre til det personlige kunnskapsgrunnlaget.",
        href: "training.html"
      });
    }

    if (!waiting.length) {
      waiting.push({
        id: "nothing_waiting",
        count: 0,
        title: num(counts.intakeTotal) ? "Ingen manuelle køer akkurat nå" : "Ingen kunnskapskø ennå",
        description: num(counts.intakeTotal)
          ? "Neste handling bestemmes av hvor langt materialet har kommet i kunnskapsløypa."
          : "Start med kilder eller legg inn materiale i Data Intake.",
        href: num(counts.intakeTotal) ? (next.href || "knowledge-workbench.html") : "intake.html"
      });
    }

    const readyStages = stageCards.filter((card) => card.status === "ready").map((card) => stageLabel(card.id));
    const currentId = String(workflow.currentStage || next.id || "sources");
    const currentIndex = stageCards.findIndex((card) => card.id === currentId);
    const laterStages = stageCards
      .filter((card, index) => card.status !== "ready" && (currentIndex < 0 || index > currentIndex))
      .map((card) => stageLabel(card.id));

    return {
      waiting,
      progress: {
        readyStages,
        currentId,
        currentLabel: stageLabel(currentId),
        laterStages
      },
      next: {
        id: String(next.id || ""),
        label: String(next.label || "Åpne Workbench"),
        description: String(next.description || ""),
        href: String(next.href || "knowledge-workbench.html"),
        action: String(next.action || "open"),
        after: NEXT_EXPLANATIONS[String(next.id || "")] || "Når dette er gjort, beregner Workbench neste manuelle steg på nytt."
      },
      status: {
        label: String(status.overall?.label || status.overall?.status || "Ukjent"),
        score: num(status.overall?.score)
      }
    };
  }

  function buildUserRecommendations(statusArg) {
    const status = obj(statusArg);
    const c = obj(status.counts);
    const out = [];
    if (!num(c.intakeTotal)) out.push("Start med kilder eller eget materiale; alt kommer først inn som kandidater.");
    if (num(c.intakeReview)) out.push("Vurder nye intake-kandidater før du bygger videre på dem.");
    if (num(c.curationReview)) out.push("Godkjenn kurateringen manuelt før materialet behandles som kuratert kunnskap.");
    if (num(c.graphInsights)) out.push("Se gjennom grafinnsikter som forslag; de skal ikke bli sannhet automatisk.");
    if (num(c.trainingReady)) out.push("Flytt bare godkjent materiale videre til Training når du vil at Personal AI skal kunne bruke det.");
    if (!out.length) out.push("Kunnskapsløypa har ingen tydelig manuell restanse akkurat nå; følg neste handling over.");
    return out.slice(0, 4);
  }

  function message(text) {
    const node = $("workbench-message");
    if (node) node.textContent = text || "";
  }

  function primaryActionMarkup(next) {
    const localActions = new Set(["scan_sources", "build_curation_queue", "refresh_knowledge_map", "analyze_graph"]);
    if (localActions.has(next.id)) {
      return `<button class="aha-tile-btn aha-tile-btn-primary" type="button" data-workbench-action="${esc(next.id)}">${esc(next.label)}</button>`;
    }
    return `<a class="aha-tile-btn aha-tile-btn-primary" href="${esc(next.href)}">${esc(next.label)}</a>`;
  }

  function renderQueue(status) {
    const host = $("workbench-queue");
    if (!host) return;
    const model = buildWorkbenchExperienceModel(status);
    host.innerHTML = model.waiting.map((item) => `
      <article class="aha-panel">
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.description)}</p>
        <a class="aha-tile-btn" href="${esc(item.href)}">Åpne</a>
      </article>`).join("");
  }

  function renderOverall(status) {
    const host = $("workbench-overall");
    if (!host) return;
    const model = buildWorkbenchExperienceModel(status);
    const next = model.next;
    host.innerHTML = `
      <div class="aha-training-stats">
        <div class="aha-mini-stat"><strong>${esc(model.status.label)}</strong><span>Status</span></div>
        <div class="aha-mini-stat"><strong>${model.status.score}/100</strong><span>Modenhet</span></div>
        <div class="aha-mini-stat"><strong>${esc(model.progress.currentLabel)}</strong><span>Nåværende steg</span></div>
      </div>
      <h3>${esc(next.label)}</h3>
      <p>${esc(next.description)}</p>
      ${primaryActionMarkup(next)}
      <p class="module-meta"><strong>Etterpå:</strong> ${esc(next.after)}</p>`;
  }

  function renderProgress(status) {
    const host = $("workbench-progress");
    const afterHost = $("workbench-next-stage");
    if (!host) return;
    const model = buildWorkbenchExperienceModel(status);
    const readyText = model.progress.readyStages.length ? model.progress.readyStages.join(" → ") : "Ingen steg er ferdige ennå";
    const laterText = model.progress.laterStages.length ? model.progress.laterStages.join(" → ") : "Ingen senere steg står igjen";
    host.innerHTML = `
      <article class="aha-panel">
        <h3>Klart</h3>
        <p>${esc(readyText)}</p>
      </article>
      <article class="aha-panel">
        <h3>Nå</h3>
        <p><strong>${esc(model.progress.currentLabel)}</strong></p>
      </article>
      <article class="aha-panel">
        <h3>Senere</h3>
        <p>${esc(laterText)}</p>
      </article>`;
    if (afterHost) afterHost.innerHTML = `<strong>Hva skjer etterpå:</strong> ${esc(model.next.after)}`;
  }

  function renderLegacyWorkflowBoard(status) {
    const host = $("workbench-board");
    if (!host) return;
    host.innerHTML = arr(status.workflow?.stageCards).map((card) => `
      <article class="aha-panel aha-training-item">
        <h3>${esc(stageLabel(card.id))}</h3>
        <p class="aha-status-badge">${esc(card.status)}</p>
        <p class="module-meta">Teller: ${esc(card.count)}</p>
        <p>${esc(card.description)}</p>
        <a class="aha-tile-btn" href="${esc(card.href)}">${esc(card.actionLabel)}</a>
      </article>`).join("");
  }

  function renderRecommendations(status) {
    const host = $("workbench-recommendations");
    if (host) host.innerHTML = buildUserRecommendations(status).map((item) => `<li>${esc(item)}</li>`).join("");
  }

  function renderResult(result) {
    const host = $("workbench-result");
    if (!host) return;
    if (!result) {
      host.innerHTML = '<p class="module-meta">Kjør trygg pipeline for å se steg, endringer og warnings.</p>';
      return;
    }
    host.innerHTML = `<h3>Resultat</h3><p>${esc(result.summary || result.updatedAt || "")}</p><ul>${arr(result.steps).map((step) => `<li><strong>${esc(step.label)}</strong>: ${step.ok ? "ok" : "feil"} · changed: ${step.changed ? "ja" : "nei"}${step.warning ? ` · ${esc(step.warning)}` : ""}</li>`).join("")}</ul><details><summary>Tekniske detaljer</summary><pre>${esc(JSON.stringify(result, null, 2)).slice(0, 5000)}</pre></details>`;
  }

  function renderWorkflowAudit(audit, simulation) {
    const host = $("workbench-workflow-audit");
    if (!host) return;
    if (!audit) {
      host.innerHTML = '<p class="module-meta">Kjør workflow audit for å se status, score, manglende moduler, lenker, consent warnings og anbefalinger.</p>';
      return;
    }
    const missing = arr(audit.stages?.missing);
    const linkIssues = arr(audit.links?.issues);
    const warnings = arr(audit.consent?.warnings);
    host.innerHTML = `<div class="aha-training-stats"><div class="aha-mini-stat"><strong>${esc(audit.status)}</strong><span>Status</span></div><div class="aha-mini-stat"><strong>${esc(audit.score)}/100</strong><span>Score</span></div><div class="aha-mini-stat"><strong>${esc(audit.stages?.available || 0)}</strong><span>Available stages</span></div><div class="aha-mini-stat"><strong>${esc(missing.length)}</strong><span>Missing modules</span></div></div><details open><summary>Stage availability</summary><ul>${arr(audit.stages?.stages).map((stage) => `<li>${stage.available ? "✅" : "⚠️"} ${esc(stage.label)} — ${esc(stage.notes)}</li>`).join("")}</ul></details><details><summary>Link issues (${linkIssues.length})</summary><ul>${(linkIssues.length ? linkIssues : [{ label: "Ingen brutte lenker funnet i tilgjengelig runtime." }]).map((item) => `<li>${esc(item.label || item.message)}</li>`).join("")}</ul></details><details><summary>Consent warnings (${warnings.length})</summary><ul>${(warnings.length ? warnings : [{ label: "Ingen consent warnings." }]).map((warning) => `<li>${esc(warning.label || warning)}</li>`).join("")}</ul></details><h3>Anbefalinger</h3><ul>${arr(audit.recommendations).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>${simulation ? `<details open><summary>Trygg workflow-simulering: ${simulation.ok ? "ok" : "feil"}</summary><ul>${arr(simulation.steps).map((step) => `<li>${step.ok ? "✅" : "❌"} ${esc(step.label)}</li>`).join("")}</ul></details>` : ""}<details><summary>Tekniske detaljer</summary><pre>${esc(JSON.stringify({ audit, simulation: simulation || null }, null, 2)).slice(0, 6000)}</pre></details>`;
  }

  function renderDailyLoop() {
    const host = $("workbench-daily-loop");
    if (!host) return;
    const loop = global.AHADailyOperatingLoop?.refreshDailyLoop?.({ save: true, lightweight: true })
      || global.AHADailyOperatingLoop?.loadDailyLoopStatus?.();
    if (!loop) {
      host.innerHTML = '<p class="module-meta">Daily Operating Loop er ikke tilgjengelig ennå.</p>';
      return;
    }
    const next = loop.nextBestAction || {};
    const queue = arr(loop.actionQueue).slice(0, 5);
    const prompt = arr(loop.suggestedPrompts).slice(0, 1)[0];
    host.innerHTML = `<div class="aha-training-stats"><div class="aha-mini-stat"><strong>${esc(loop.status)}</strong><span>Status</span></div><div class="aha-mini-stat"><strong>${esc(next.label || "Åpne Chat")}</strong><span>Neste beste handling</span></div><div class="aha-mini-stat"><strong>${esc(queue.length)}</strong><span>Action queue</span></div></div><p>${esc(loop.currentFocus || "")}</p><ul>${queue.map((item) => `<li><a href="${esc(item.href || "index.html")}">${esc(item.label)}</a> — ${esc(item.reason || "")}</li>`).join("")}</ul><div class="aha-tile-actions"><a class="aha-tile-btn" href="index.html">Tilbake til Home</a><a class="aha-tile-btn aha-tile-btn-primary" href="chat.html${prompt ? `?prompt=${encodeURIComponent(prompt.prompt)}` : ""}">Åpne Chat med foreslått prompt</a></div>`;
  }

  function render() {
    renderDailyLoop();
    const status = api()?.buildWorkbenchStatus?.({ save: false });
    last = status;
    if (!status) return;
    const counts = status.counts || {};
    $("workbench-empty")?.classList.toggle("hidden", Boolean(counts.intakeTotal));
    renderQueue(status);
    renderOverall(status);
    renderProgress(status);
    renderLegacyWorkflowBoard(status);
    renderRecommendations(status);
  }

  function doAction(action) {
    let result = null;
    if (action === "scan_sources") result = global.AHASourceConnectors?.scanAllSources?.() || {};
    if (action === "build_curation_queue") result = global.AHAKnowledgeCuration?.buildCurationItemsFromIntake?.() || {};
    if (action === "refresh_knowledge_map") result = global.AHAKnowledgeMap?.refreshKnowledgeMap?.() || {};
    if (action === "analyze_graph") result = global.AHAKnowledgeGraphIntelligence?.analyzeKnowledgeGraph?.() || {};
    if (action === "workbench_refresh") result = api()?.runWorkbenchRefresh?.() || {};
    if (action === "safe_pipeline") result = api()?.runWorkbenchPipeline?.() || {};
    if (action === "workflow_audit") {
      result = global.AHAKnowledgeWorkflowAudit?.runWorkflowAudit?.() || {};
      renderWorkflowAudit(result);
    }
    if (action === "workflow_simulation") {
      const audit = global.AHAKnowledgeWorkflowAudit?.runWorkflowAudit?.() || {};
      result = global.AHAKnowledgeWorkflowAudit?.simulateWorkflow?.() || {};
      renderWorkflowAudit(audit, result);
    }
    message(`${action}: ferdig.`);
    renderResult(result);
    render();
  }

  function bind() {
    doc?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof global.HTMLElement)) return;
      const action = target.getAttribute("data-workbench-action");
      if (action) doAction(action);
    });
  }

  function init(){bind();render();renderResult(null);renderWorkflowAudit(global.AHAKnowledgeWorkflowAudit?.loadLastAudit?.() || null);}

  const dashboard = {
    init,
    render,
    renderDailyLoop,
    renderResult,
    doAction,
    stageLabel,
    buildWorkbenchExperienceModel,
    buildUserRecommendations
  };
  if (typeof module !== "undefined" && module.exports) module.exports = dashboard;
  global.AHAKnowledgeWorkbenchDashboard = dashboard;
  if (doc) doc.readyState === "loading" ? doc.addEventListener("DOMContentLoaded", init) : init();
})(typeof window !== "undefined" ? window : globalThis);
