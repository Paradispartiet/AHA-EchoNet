// ahaChatAnalysisStateView.js
// Synlig analyse-state, processing, eksporttilgjengelighet og reset av Chat-UI.
//
// Modulen muterer bare DOM. Kildetilstand, cache og øvrig persistens injiseres
// eksplisitt, slik at ahaChat.js beholder orkestreringsansvaret.

(function (global) {
  "use strict";

  function create(deps = {}) {
    const required = [
      "getActiveAnalysisRun", "setActiveAnalysisRun", "clearAutoOutputs", "escHtml",
      "renderAhaPersonalRetrieval", "renderAhaAnswerComposer", "renderPanel",
      "renderHighlightsRail", "updateEmptyState"
    ];
    required.forEach((name) => {
      if (typeof deps[name] !== "function") {
        throw new Error(`AHAChatAnalysisStateView mangler avhengighet: ${name}`);
      }
    });

    const documentRef = deps.document || global.document;
    const now = typeof deps.now === "function" ? deps.now : () => new Date().toISOString();

    function renderAnalysisDebugPanel(payload = {}) {
      const canonical = payload?.canonicalAnalysis && typeof payload.canonicalAnalysis === "object" ? payload.canonicalAnalysis : {};
      const afterwork = payload && typeof payload === "object" ? payload : {};
      const run = deps.getActiveAnalysisRun() || {};
      const activeRunId = run.analysisRunId || run.runId || "";
      return `<aside class="aha-analysis-debug" data-dev-info="analysis-run"><strong>Dev analysebinding</strong><dl>` +
        `<div><dt>activeRunId</dt><dd>${deps.escHtml(activeRunId)}</dd></div>` +
        `<div><dt>canonicalAnalysis.runId</dt><dd>${deps.escHtml(canonical.analysisRunId || canonical.runId || "")}</dd></div>` +
        `<div><dt>afterwork.runId</dt><dd>${deps.escHtml(afterwork.analysisRunId || afterwork.runId || "")}</dd></div>` +
        `<div><dt>sourceHash</dt><dd>${deps.escHtml(afterwork.sourceHash || afterwork.sourceTextHash || run.sourceHash || "")}</dd></div>` +
        `<div><dt>sourceKind</dt><dd>${deps.escHtml(afterwork.sourceKind || run.sourceKind || "")}</dd></div>` +
        `<div><dt>lastUpdated</dt><dd>${deps.escHtml(afterwork.lastUpdated || afterwork.createdAt || now())}</dd></div>` +
        `</dl></aside>`;
    }

    function setExportButtonsEnabled(enabled) {
      const isEnabled = Boolean(enabled);
      [
        "btn-export-analysis",
        "btn-export-analysis-json",
        "btn-export-analysis-main",
        "btn-export-analysis-json-main",
        "btn-export"
      ].forEach((id) => {
        const button = documentRef.getElementById(id);
        if (button) button.disabled = !isEnabled;
      });
    }

    function setProcessing(isProcessing, message = "AHA analyserer teksten …") {
      const indicator = documentRef.getElementById("aha-processing-indicator");
      const text = documentRef.getElementById("aha-processing-text");
      const sendButton = documentRef.getElementById("btn-send");

      if (text) text.textContent = message;
      if (indicator) indicator.hidden = !isProcessing;
      if (sendButton) sendButton.disabled = Boolean(isProcessing);
      documentRef.body.classList.toggle("aha-is-processing", Boolean(isProcessing));
    }

    function clearActiveAnalysisState(run, message = "AHA analyserer ny kilde …") {
      if (run) deps.setActiveAnalysisRun(run);
      deps.clearAutoOutputs();
      const host = documentRef.getElementById("aha-auto-output");
      if (host) {
        host.dataset.analysisId = run?.analysisId || "";
        host.dataset.analysisRunId = run?.analysisRunId || run?.runId || "";
        host.dataset.runId = run?.runId || run?.analysisRunId || "";
        host.dataset.sourceId = run?.sourceId || "";
        host.dataset.sourceTextHash = run?.sourceHash || "";
        host.dataset.sourceTextPreview = run?.sourcePreview || "";
        host.innerHTML = `<div class="auto-output-head"><h2>AHA etterarbeid</h2><p>${deps.escHtml(message)}</p></div>${renderAnalysisDebugPanel({})}`;
      }
      deps.renderAhaPersonalRetrieval(null);
      deps.renderAhaAnswerComposer(null);
      deps.renderPanel("");
      const afterworkPanel = documentRef.getElementById("afterwork-panel");
      if (afterworkPanel) afterworkPanel.innerHTML = "";
      try { global.AHAExplorer?.clear?.(run); } catch (error) { global.console?.warn?.("AHA Explorer clear feilet", error); }
      const evaluationStatus = documentRef.getElementById("aha-answer-evaluation-status");
      if (evaluationStatus) evaluationStatus.textContent = "Svar-evaluering venter på aktiv analyse.";
      setExportButtonsEnabled(false);
    }

    function resetView() {
      deps.renderPanel("");
      const chatLog = documentRef.getElementById("chat-log");
      if (chatLog) chatLog.innerHTML = "";
      const autoOutput = documentRef.getElementById("aha-auto-output");
      if (autoOutput) autoOutput.innerHTML = "";
      const metaProfilePanel = documentRef.getElementById("meta-profile-panel");
      if (metaProfilePanel) metaProfilePanel.innerHTML = "";
      const afterworkPanel = documentRef.getElementById("afterwork-panel");
      if (afterworkPanel) afterworkPanel.innerHTML = "";
      ["aha-auto-output", "afterwork-panel"].forEach((id) => {
        const element = documentRef.getElementById(id);
        if (!element?.dataset) return;
        delete element.dataset.sourceText;
        delete element.dataset.sourceTextHash;
        delete element.dataset.sourceTextPreview;
      });
      deps.renderHighlightsRail();
      deps.updateEmptyState();
    }

    return Object.freeze({
      renderAnalysisDebugPanel,
      setExportButtonsEnabled,
      setProcessing,
      clearActiveAnalysisState,
      resetView
    });
  }

  const publicApi = { create };
  global.AHAChatAnalysisStateView = publicApi;
  global.AHAModuleApi?.register?.("chat.analysisStateView", publicApi, {
    version: 1,
    legacyGlobal: "AHAChatAnalysisStateView",
    exports: Object.keys(publicApi)
  });
})(window);
