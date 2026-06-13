// ahaTrainingDashboard.js
// ─────────────────────────────────────────────
// UI-laget for AHA Training Corpus. Binder AHATrainingCorpus og
// AHATrainingExamples til training.html: statuskort, handlinger,
// corpus-liste med samtykke-kontroller og training examples-liste.
// Alt lokalt; ingen sync, ingen nettverkskall.
// ─────────────────────────────────────────────

(function (global) {
  "use strict";

  const doc = global.document;

  function asArray(value) { return Array.isArray(value) ? value : []; }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function $(id) { return doc ? doc.getElementById(id) : null; }

  function corpusApi() { return global.AHATrainingCorpus; }
  function examplesApi() { return global.AHATrainingExamples; }
  function readinessApi() { return global.AHAPersonalModelReadiness; }
  function retrievalApi() { return global.AHAPersonalRetrieval; }
  function auditApi() { return global.AHAPersonalAiLoopAudit; }

  function setStat(id, value) {
    const el = $(id);
    if (el) el.textContent = String(value);
  }

  function shortText(text, limit = 220) {
    const value = String(text ?? "").replace(/\s+/g, " ").trim();
    if (value.length <= limit) return value;
    return `${value.slice(0, limit - 1)}…`;
  }

  function consentFlags(consent) {
    const c = consent && typeof consent === "object" ? consent : {};
    const flags = [];
    if (c.useForKnowledge) flags.push("kunnskap");
    if (c.useForMemory) flags.push("minne");
    if (c.useForTrainingExamples) flags.push("treningseksempler");
    if (c.useForStyle) flags.push("stil");
    if (c.useForFineTuning) flags.push("finjustering");
    return flags.length ? flags : ["ingen bruk valgt"];
  }

  function renderStats() {
    const corpus = corpusApi();
    const examples = examplesApi();
    const corpusStats = corpus?.collectCorpusStats?.() || {};
    const exampleStats = examples?.collectExampleStats?.() || {};

    setStat("training-stat-total", corpusStats.total || 0);
    setStat("training-stat-raw", corpusStats.raw || 0);
    setStat("training-stat-approved", corpusStats.approved || 0);
    setStat("training-stat-training-allowed", corpusStats.trainingExamplesAllowed || 0);
    setStat("training-stat-finetuning-allowed", corpusStats.fineTuningAllowed || 0);
    setStat("training-stat-examples-total", exampleStats.total || 0);
    setStat("training-stat-examples-approved", exampleStats.approved || 0);
  }

  function renderCorpusList() {
    const mount = $("training-corpus-list");
    if (!mount) return;
    const corpus = corpusApi();
    const items = corpus?.loadCorpus?.() || [];

    if (!items.length) {
      mount.innerHTML = `<p class="aha-training-empty">Training Corpus er tomt. Importer tekster fra AHA for å starte.</p>`;
      return;
    }

    mount.innerHTML = items.map((item) => `
      <article class="aha-panel aha-training-item" data-corpus-id="${escapeHtml(item.id)}">
        <header class="aha-training-item-header">
          <h3>${escapeHtml(item.title)}</h3>
          <span class="aha-status-badge">${escapeHtml(item.status)}</span>
        </header>
        <p class="module-meta">Kilde: ${escapeHtml(item.source)} · Språk: ${escapeHtml(item.language)}${item.project ? ` · Prosjekt: ${escapeHtml(item.project)}` : ""}</p>
        <p class="aha-training-consent">Samtykke: ${escapeHtml(consentFlags(item.consent).join(", "))}</p>
        <p>${escapeHtml(shortText(item.text))}</p>
        <div class="aha-training-actions">
          <button type="button" data-corpus-approve="${escapeHtml(item.id)}">Godkjenn</button>
          <button type="button" data-corpus-reject="${escapeHtml(item.id)}">Avvis</button>
          <button type="button" data-corpus-consent="useForTrainingExamples" data-corpus-id="${escapeHtml(item.id)}">${item.consent?.useForTrainingExamples ? "✓ " : ""}Tillat treningseksempler</button>
          <button type="button" data-corpus-consent="useForStyle" data-corpus-id="${escapeHtml(item.id)}">${item.consent?.useForStyle ? "✓ " : ""}Tillat stil</button>
          <button type="button" data-corpus-consent="useForFineTuning" data-corpus-id="${escapeHtml(item.id)}">${item.consent?.useForFineTuning ? "✓ " : ""}Tillat finjustering</button>
          <button type="button" data-corpus-delete="${escapeHtml(item.id)}">Slett</button>
        </div>
      </article>
    `).join("");
  }

  function renderReadiness() {
    const mount = $("training-readiness-report");
    if (!mount) return;
    const readiness = readinessApi();
    if (!readiness?.buildReadinessReport) {
      mount.innerHTML = `<p class="aha-training-empty">Readiness-modulen er ikke lastet ennå.</p>`;
      return;
    }

    const report = readiness.buildReadinessReport();
    const recommendations = asArray(report.recommendations).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    const flag = (value) => value ? "Klar" : "Ikke klar";
    mount.innerHTML = `
      <div class="aha-training-stats">
        <div class="aha-mini-stat"><strong>${escapeHtml(report.level)}</strong><span>Level</span></div>
        <div class="aha-mini-stat"><strong>${Number(report.score) || 0}/100</strong><span>Score</span></div>
        <div class="aha-mini-stat"><strong>${Number(report.corpus?.approved) || 0}</strong><span>Godkjent corpus</span></div>
        <div class="aha-mini-stat"><strong>${Number(report.examples?.approved) || 0}</strong><span>Godkjente examples</span></div>
        <div class="aha-mini-stat"><strong>${Number(report.exportReadiness?.exportableExamples) || 0}</strong><span>Eksporterbare</span></div>
        <div class="aha-mini-stat"><strong>${escapeHtml(flag(report.ragReadiness?.ready))}</strong><span>RAG readiness</span></div>
        <div class="aha-mini-stat"><strong>${escapeHtml(flag(report.fineTuningReadiness?.ready))}</strong><span>Fine-tuning readiness</span></div>
        <div class="aha-mini-stat"><strong>${escapeHtml(flag(report.styleReadiness?.ready))}</strong><span>Style readiness</span></div>
      </div>
      <p class="module-meta">${escapeHtml(report.summary)}</p>
      <p class="module-meta">Tekster brukes som treningsgrunnlag først når du har godkjent dem og slått på relevant bruk.</p>
      <ul class="aha-training-recommendations">${recommendations}</ul>
    `;
  }

  function renderExamplesList() {
    const mount = $("training-examples-list");
    if (!mount) return;
    const examples = examplesApi();
    const items = examples?.loadExamples?.() || [];

    if (!items.length) {
      mount.innerHTML = `<p class="aha-training-empty">Ingen treningseksempler ennå. Godkjenn corpus items og lag treningseksempler.</p>`;
      return;
    }

    mount.innerHTML = items.map((example) => `
      <article class="aha-panel aha-training-example" data-example-id="${escapeHtml(example.id)}">
        <header class="aha-training-item-header">
          <h4>${escapeHtml(example.taskType)}</h4>
          <span class="aha-status-badge">${escapeHtml(example.status)}</span>
        </header>
        <p><strong>Input:</strong> ${escapeHtml(example.input)}</p>
        <p><strong>Output:</strong> ${escapeHtml(shortText(example.output))}</p>
        <div class="aha-training-actions">
          <button type="button" data-example-approve="${escapeHtml(example.id)}">Godkjenn</button>
          <button type="button" data-example-reject="${escapeHtml(example.id)}">Avvis</button>
          <button type="button" data-example-review="${escapeHtml(example.id)}">Trenger gjennomgang</button>
          <button type="button" data-example-delete="${escapeHtml(example.id)}">Slett</button>
        </div>
      </article>
    `).join("");
  }

  function renderRetrieval() {
    const mount = $("training-retrieval-report");
    if (!mount) return;
    const api = retrievalApi();
    if (!api?.getRetrievalStatus) {
      mount.innerHTML = `<p class="aha-training-empty">Personal Retrieval-modulen er ikke lastet.</p>`;
      return;
    }
    const status = api.getRetrievalStatus();
    const index = api.loadRetrievalIndex?.();
    const bySource = index?.stats?.bySource || {};
    mount.innerHTML = `
      <div class="aha-training-stats">
        <div class="aha-mini-stat"><strong>${Number(status.indexedItems) || 0}</strong><span>Indexed items</span></div>
        <div class="aha-mini-stat"><strong>${Number(status.corpusItems) || 0}</strong><span>Corpus items</span></div>
        <div class="aha-mini-stat"><strong>${Number(status.examples) || 0}</strong><span>Examples</span></div>
        <div class="aha-mini-stat"><strong>${Number(status.memoryClaims) || 0}</strong><span>Memory claims</span></div>
      </div>
      <p class="module-meta">Status: ${status.available ? "Klar" : "Ikke bygget"} · Sist bygget: ${escapeHtml(status.lastBuiltAt || "aldri")}</p>
      <p class="module-meta">Per kilde: ${escapeHtml(Object.entries(bySource).map(([key, value]) => `${key}: ${value}`).join(" · ") || "ingen items")}</p>
    `;
  }

  function setMessage(text) {
    const el = $("training-message");
    if (el) el.textContent = text || "";
  }

  function renderAll() {
    renderStats();
    renderReadiness();
    renderRetrieval();
    renderAiLoopAudit();
    renderCorpusList();
    renderExamplesList();
  }

  function renderAiLoopAudit(auditArg = null) {
    const mount = $("training-ai-loop-audit-report");
    if (!mount) return;
    const api = auditApi();
    if (!api?.runAudit) {
      mount.innerHTML = `<p class="aha-training-empty">Personal AI Loop Audit-modulen er ikke lastet.</p>`;
      return;
    }
    const audit = auditArg || api.loadLastAudit?.() || api.runAudit();
    const readiness = audit?.readiness || {};
    const retrieval = audit?.retrieval || {};
    const sample = audit?.chat?.sampleQuery || {};
    mount.innerHTML = `
      <div class="aha-training-stats">
        <div class="aha-mini-stat"><strong>${escapeHtml(audit.status || "empty")}</strong><span>Status</span></div>
        <div class="aha-mini-stat"><strong>${Number(audit.score) || 0}/100</strong><span>Score</span></div>
        <div class="aha-mini-stat"><strong>${Number(readiness.approvedCorpus) || 0}</strong><span>Approved corpus</span></div>
        <div class="aha-mini-stat"><strong>${Number(readiness.approvedExamples) || 0}</strong><span>Approved examples</span></div>
        <div class="aha-mini-stat"><strong>${(Number(readiness.confirmedClaims) || 0) + (Number(readiness.importantClaims) || 0)}</strong><span>Memory claims</span></div>
        <div class="aha-mini-stat"><strong>${Number(retrieval.indexedItems) || 0}</strong><span>Indexed retrieval items</span></div>
        <div class="aha-mini-stat"><strong>${Number(sample.resultCount) || 0}</strong><span>Sample query results</span></div>
      </div>
      <p class="module-meta">${escapeHtml(audit.summary || "")}</p>
      <ul class="aha-training-recommendations">${asArray(audit.recommendations).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    `;
  }

  function handleAiLoopAudit() {
    const api = auditApi();
    if (!api?.runAudit) return;
    const audit = api.runAudit();
    try { global.localStorage?.setItem(api.STORAGE_KEY || "aha_personal_ai_loop_audit_v1", JSON.stringify(audit)); } catch {}
    setMessage(`AI-loop audit fullført: ${audit.status}, ${audit.score}/100.`);
    renderAiLoopAudit(audit);
  }

  function handleImport() {
    const corpus = corpusApi();
    if (!corpus?.importFromExistingAhaSources) return;
    const result = corpus.importFromExistingAhaSources();
    setMessage(`Importert ${result.added} tekster (${result.skipped} hoppet over). Totalt ${result.total} corpus items.`);
    renderAll();
  }

  function handleGenerate() {
    const examples = examplesApi();
    if (!examples?.generateExamplesFromApprovedCorpus) return;
    const result = examples.generateExamplesFromApprovedCorpus();
    if (result.ok) {
      setMessage(`Laget ${result.added} treningseksempler fra ${result.corpusItems || 0} godkjente corpus items.`);
    } else {
      setMessage("Kunne ikke lage treningseksempler. Mangler corpus-modul.");
    }
    renderAll();
  }

  function handleExport() {
    const examples = examplesApi();
    if (!examples?.downloadApprovedExamples) return;
    const exportable = examples.selectExportableExamples?.() || [];
    if (!exportable.length) {
      setMessage("Ingen godkjente eksempler med finjusterings-samtykke å eksportere ennå.");
      return;
    }
    examples.downloadApprovedExamples();
    setMessage(`Eksporterte ${exportable.length} godkjente eksempler som JSONL.`);
  }

  function handleRetrievalRefresh() {
    const api = retrievalApi();
    if (!api?.refreshRetrievalIndex) return;
    const index = api.refreshRetrievalIndex();
    setMessage(`Personlig søkeindeks bygget med ${index.stats.total} items: ${index.stats.corpusItems} corpus, ${index.stats.examples} examples og ${index.stats.memoryClaims} memory claims.`);
    renderRetrieval();
  }

  function bindActions() {
    if (!doc) return;
    $("training-import-btn")?.addEventListener("click", handleImport);
    $("training-generate-btn")?.addEventListener("click", handleGenerate);
    $("training-export-btn")?.addEventListener("click", handleExport);
    $("training-retrieval-btn")?.addEventListener("click", handleRetrievalRefresh);
    $("training-ai-loop-audit-btn")?.addEventListener("click", handleAiLoopAudit);

    $("training-corpus-list")?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof global.HTMLElement)) return;
      const corpus = corpusApi();
      if (!corpus) return;

      const approveId = target.getAttribute("data-corpus-approve");
      if (approveId) { corpus.markCorpusItemStatus(approveId, "approved"); renderAll(); return; }
      const rejectId = target.getAttribute("data-corpus-reject");
      if (rejectId) { corpus.markCorpusItemStatus(rejectId, "rejected"); renderAll(); return; }
      const deleteId = target.getAttribute("data-corpus-delete");
      if (deleteId) { corpus.deleteCorpusItem(deleteId); renderAll(); return; }

      const consentKey = target.getAttribute("data-corpus-consent");
      const consentId = target.getAttribute("data-corpus-id");
      if (consentKey && consentId) {
        const items = corpus.loadCorpus();
        const item = items.find((entry) => entry.id === consentId);
        const current = Boolean(item?.consent?.[consentKey]);
        corpus.setCorpusConsent(consentId, { [consentKey]: !current });
        renderAll();
      }
    });

    $("training-examples-list")?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof global.HTMLElement)) return;
      const examples = examplesApi();
      if (!examples) return;

      const approveId = target.getAttribute("data-example-approve");
      if (approveId) { examples.markExampleStatus(approveId, "approved"); renderAll(); return; }
      const rejectId = target.getAttribute("data-example-reject");
      if (rejectId) { examples.markExampleStatus(rejectId, "rejected"); renderAll(); return; }
      const reviewId = target.getAttribute("data-example-review");
      if (reviewId) { examples.markExampleStatus(reviewId, "needs_review"); renderAll(); return; }
      const deleteId = target.getAttribute("data-example-delete");
      if (deleteId) { examples.deleteExample(deleteId); renderAll(); return; }
    });
  }

  function init() {
    bindActions();
    renderAll();
  }

  const AHATrainingDashboard = { init, renderAll, renderStats, renderReadiness, renderRetrieval, renderAiLoopAudit, renderCorpusList, renderExamplesList, handleRetrievalRefresh, handleAiLoopAudit };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AHATrainingDashboard;
  }
  if (global) {
    global.AHATrainingDashboard = AHATrainingDashboard;
  }

  if (doc) {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : this);
