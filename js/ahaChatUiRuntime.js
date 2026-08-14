// ahaChatUiRuntime.js
// DOM-bootstrap, pending prompt, reset og handlingsbindinger for AHA Chat.

(function (global) {
  "use strict";

  function createShell(deps = {}) {
    if (typeof deps.loadChamberFromStorage !== "function") {
      throw new Error("AHAChatShellRuntime mangler avhengighet: loadChamberFromStorage");
    }
    if (typeof deps.getInsightsApi !== "function") {
      throw new Error("AHAChatShellRuntime mangler avhengighet: getInsightsApi");
    }
    if (typeof deps.filterConceptLabels !== "function") {
      throw new Error("AHAChatShellRuntime mangler avhengighet: filterConceptLabels");
    }
    if (typeof deps.buildExportBundle !== "function") {
      throw new Error("AHAChatShellRuntime mangler avhengighet: buildExportBundle");
    }
    const subjectId = String(deps.subjectId || "").trim();
    if (!subjectId) throw new Error("AHAChatShellRuntime mangler avhengighet: subjectId");

    const documentRef = deps.document || global.document;
    const defaultThemeId = String(deps.defaultThemeId || "th_default");
    const getExplorerApi = deps.getExplorerApi || (() => global.AHAExplorer);
    const getPersistenceApi = deps.getPersistenceApi || (() => global.AHAChatPersistence);
    const setTimeoutRef = deps.setTimeout || global.setTimeout;
    const clearTimeoutRef = deps.clearTimeout || global.clearTimeout;
    const warn = deps.warn || ((...args) => global.console?.warn?.(...args));
    let explorerRefreshTimer = null;

    function getThemeId() {
      const input = documentRef?.getElementById?.("theme-id");
      const value = input && String(input.value || "").trim();
      return value || defaultThemeId;
    }

    function getFieldId() {
      return null;
    }

    function out(message) {
      const el = documentRef?.getElementById?.("out");
      if (el) el.textContent = String(message || "");
    }

    function setStatusNote(message) {
      const el = documentRef?.getElementById?.("chat-status-note");
      if (el) el.textContent = String(message || "");
    }

    function escHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function renderAuxPanel(targetId, markup) {
      const el = documentRef?.getElementById?.(targetId);
      if (el) el.innerHTML = String(markup || "");
    }

    function renderPanel(html) {
      const panel = documentRef?.getElementById?.("panel");
      if (panel) panel.innerHTML = String(html || "");
    }

    function currentInsights() {
      const chamber = deps.loadChamberFromStorage();
      const engine = deps.getInsightsApi();
      const active = typeof engine?.getActiveInsights === "function"
        ? engine.getActiveInsights(chamber)
        : chamber?.insights;
      return (Array.isArray(active) ? active : []).filter(
        (insight) => insight?.subject_id === subjectId && insight?.theme_id === getThemeId()
      );
    }

    function normalizeDisplayText(value) {
      return String(value || "")
        .replace(/underviser(\s+)viktigheten/gi, (_match, gap) => `understreker${gap}viktigheten`);
    }

    function resolveConceptTerm(term) {
      if (term == null) return "";
      if (typeof term === "string") return term;
      if (typeof term === "number") return String(term);
      if (typeof term === "object") {
        return String(term?.label || term?.title || term?.key || term?.term || term?.name || term?.subject_label || term?.subject_id || term?.id || term?.value || "");
      }
      return String(term || "");
    }

    function suggestCategoryChips() {
      const labels = [];
      currentInsights().slice(0, 6).forEach((insight) => {
        (insight.emner || []).forEach((emne) => labels.push(emne));
        (insight.concepts || []).forEach((concept) => labels.push(concept?.label || concept?.key));
        (insight.patterns || []).forEach((pattern) => labels.push(pattern?.label || pattern?.key));
      });
      return [...new Set(deps.filterConceptLabels(labels))].slice(0, 8);
    }

    function refreshAhaExplorer() {
      const explorer = getExplorerApi();
      if (!explorer?.render || typeof setTimeoutRef !== "function") return;
      if (explorerRefreshTimer && typeof clearTimeoutRef === "function") clearTimeoutRef(explorerRefreshTimer);
      explorerRefreshTimer = setTimeoutRef(() => {
        explorerRefreshTimer = null;
        try {
          explorer.render(deps.buildExportBundle());
        } catch (err) {
          warn("AHA Explorer-oppdatering feilet", err);
        }
      }, 150);
    }

    function renderChatMemoryStatus() {
      const host = documentRef?.getElementById?.("aha-chat-memory-status");
      if (!host) return null;
      const api = getPersistenceApi();
      if (!api?.collectChatStats) {
        host.textContent = "Chat-minne er ikke aktivt. Samtaler brukes ikke som treningsgrunnlag før du har godkjent dem i Data Intake.";
        return null;
      }
      const session = api.getOrCreateCurrentSession?.();
      const stats = api.collectChatStats();
      host.textContent = `Lagring aktiv. Session: ${session?.id || "ukjent"}. Meldinger i session: ${(session?.messages || []).length}. Totalt: ${stats.messages}. Samtaler brukes ikke som treningsgrunnlag før du har godkjent dem i Data Intake.`;
      return stats;
    }

    return Object.freeze({
      getThemeId,
      getFieldId,
      out,
      setStatusNote,
      escHtml,
      renderAuxPanel,
      renderPanel,
      currentInsights,
      normalizeDisplayText,
      resolveConceptTerm,
      suggestCategoryChips,
      refreshAhaExplorer,
      renderChatMemoryStatus
    });
  }

  function create(deps = {}) {
    const required = [
      "submitMessage", "showInsights", "showStatus", "showConcepts", "showMeta",
      "showKnowledgeMap", "showSavedAfterwork", "exportAnalysisJson",
      "copyAnalysisMarkdown", "clearChamber", "clearAutoOutputs", "out",
      "setStatusNote", "resetAnalysisView", "focusAutoCard", "bindMemoryControls",
      "bindPanelActions", "setProcessing", "restoreAutoOutput", "startMetaAiSession",
      "updateMemoryStatus", "renderChatMemoryStatus", "renderPersonalContextStatus",
      "updateEmptyState", "renderHighlightsRail"
    ];
    required.forEach((name) => {
      if (typeof deps[name] !== "function") throw new Error(`AHAChatUiRuntime mangler avhengighet: ${name}`);
    });

    const documentRef = deps.document || global.document;
    const storage = deps.storage || global.localStorage;
    const eventTarget = deps.eventTarget || global;
    const EventCtor = deps.Event || global.Event;
    const pendingPromptKey = String(deps.pendingPromptKey || "aha_pending_chat_prompt_v1");
    const highlightsStorageKey = String(deps.highlightsStorageKey || "aha_chat_highlights_v1");
    const afterworkStorageKey = String(deps.afterworkStorageKey || "aha_afterwork_v1");

    function consumePendingChatPrompt() {
      const raw = storage.getItem(pendingPromptKey);
      if (!raw) return;
      let payload = null;
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }
      const prompt = String(payload?.prompt || "").trim();
      if (!prompt) return;
      const msg = documentRef.getElementById("msg");
      if (!msg || String(msg.value || "").trim()) return;
      msg.value = prompt;
      msg.dispatchEvent(new EventCtor("input", { bubbles: true }));
      msg.focus();
      storage.removeItem(pendingPromptKey);
      if (String(payload?.type || "") === "meta_insights_ai_session") {
        deps.startMetaAiSession(payload);
        return;
      }
      deps.setStatusNote("Klar til å bygge videre fra AHA Home.");
    }

    function reset() {
      deps.clearChamber();
      storage.removeItem(highlightsStorageKey);
      deps.clearAutoOutputs();
      storage.removeItem(afterworkStorageKey);
      deps.out("AHA-kammer nullstilt.");
      deps.setStatusNote("Nullstilt lokalt kammer og highlights.");
      deps.resetAnalysisView();
    }

    function bindActionChips() {
      documentRef.querySelectorAll("[data-chat-action]").forEach((button) => {
        button.addEventListener("click", () => {
          const action = button.getAttribute("data-chat-action");
          if (action === "import_hg") {
            documentRef.getElementById("btn-import-hg")?.click();
            return;
          }
          if (action === "koble_hg") {
            deps.setStatusNote("Koblinger vises gjennom innsikter og fagkoblinger i chatten.");
            return;
          }
          if (action === "lag_innsikt") deps.showInsights();
          deps.focusAutoCard(action);
          deps.setStatusNote("Viser valgt analysekort.");
        });
      });
    }

    function bind() {
      const button = documentRef.getElementById("btn-send");
      const textarea = documentRef.getElementById("msg");
      if (button && textarea) {
        button.addEventListener("click", async () => {
          const text = textarea.value.trim();
          if (text) await deps.submitMessage(text, textarea);
        });
      }

      [
        ["btn-insights", deps.showInsights],
        ["btn-status", deps.showStatus],
        ["btn-concepts", deps.showConcepts],
        ["btn-meta", deps.showMeta],
        ["btn-knowledge-map", deps.showKnowledgeMap],
        ["btn-saved-afterwork", deps.showSavedAfterwork],
        ["btn-export", deps.exportAnalysisJson],
        ["btn-export-analysis-json", deps.exportAnalysisJson],
        ["btn-export-analysis-json-main", deps.exportAnalysisJson],
        ["btn-reset", reset]
      ].forEach(([id, handler]) => documentRef.getElementById(id)?.addEventListener("click", handler));
      ["btn-export-analysis", "btn-export-analysis-main"].forEach((id) => {
        documentRef.getElementById(id)?.addEventListener("click", () => { void deps.copyAnalysisMarkdown(); });
      });

      bindActionChips();
      deps.bindMemoryControls();
      deps.bindPanelActions();
      deps.setProcessing(false);
      deps.restoreAutoOutput();
      consumePendingChatPrompt();

      eventTarget.addEventListener("aha:merge-suggested", () => {
        const panel = documentRef.getElementById("panel");
        if (panel && panel.querySelector(".insight-panel")) deps.showInsights();
      });
      ["aha:chamber-saved", "aha:embedding-stored", "aha:embeddings-bulk-complete"].forEach((eventName) => {
        eventTarget.addEventListener(eventName, () => { void deps.updateMemoryStatus(); });
      });
      void deps.updateMemoryStatus();
      deps.renderChatMemoryStatus();
      deps.renderPersonalContextStatus();
      deps.updateEmptyState();
      deps.renderHighlightsRail();

      const log = documentRef.getElementById("chat-log");
      if (log) {
        log.addEventListener("scroll", deps.renderHighlightsRail);
        eventTarget.addEventListener("resize", deps.renderHighlightsRail);
      }
    }

    return Object.freeze({ bind, reset, consumePendingChatPrompt, bindActionChips });
  }

  const publicApi = Object.freeze({ create, createShell });
  global.AHAChatUiRuntime = publicApi;
  global.AHAModuleApi?.register?.("chat.uiRuntime", publicApi, {
    version: 1,
    legacyGlobal: "AHAChatUiRuntime",
    exports: ["create", "createShell"]
  });
})(window);
