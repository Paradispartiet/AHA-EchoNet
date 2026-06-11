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

  function setMessage(text) {
    const el = $("training-message");
    if (el) el.textContent = text || "";
  }

  function renderAll() {
    renderStats();
    renderCorpusList();
    renderExamplesList();
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

  function bindActions() {
    if (!doc) return;
    $("training-import-btn")?.addEventListener("click", handleImport);
    $("training-generate-btn")?.addEventListener("click", handleGenerate);
    $("training-export-btn")?.addEventListener("click", handleExport);

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

  const AHATrainingDashboard = { init, renderAll, renderStats, renderCorpusList, renderExamplesList };

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
