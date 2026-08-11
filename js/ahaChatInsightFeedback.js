// ahaChatInsightFeedback.js
// Chat-only feedback for canonical insight changes and Personal AI answer transparency.

(function (global) {
  "use strict";

  const STATUS_ID = "chat-status-note";
  const MAX_RUNS = 20;
  const feedbackByRun = new Map();
  const personalAnswerTransparencyQueue = [];

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeAction(value) {
    const action = text(value).toLowerCase();
    if (action === "created" || action === "create") return "created";
    if (action === "reinforced" || action === "reinforce") return "reinforced";
    return action ? "processed" : "";
  }

  function runKeyForResult(result) {
    const trace = result && typeof result.analysis_trace === "object" ? result.analysis_trace : {};
    return text(trace.analysisRunId || trace.analysis_run_id || trace.runId)
      || text(result?.sourceEvent?.id)
      || "current";
  }

  function createState(runKey) {
    return {
      runKey,
      actionKeys: new Set(),
      duplicatesSkipped: 0,
      emptyCandidatesSkipped: 0
    };
  }

  function trimRunCache() {
    while (feedbackByRun.size > MAX_RUNS) {
      const oldest = feedbackByRun.keys().next().value;
      feedbackByRun.delete(oldest);
    }
  }

  function summarizeInsightIngestResult(result) {
    if (!result || typeof result !== "object") return null;
    const runKey = runKeyForResult(result);
    let state = feedbackByRun.get(runKey);
    if (!state) {
      state = createState(runKey);
      feedbackByRun.set(runKey, state);
      trimRunCache();
    }

    const items = Array.isArray(result.items) ? result.items : [];
    items.forEach((item, index) => {
      const action = normalizeAction(item?.meta?.action);
      if (!action) return;
      const insightId = text(item?.meta?.insight_id || item?.meta?.insightId || item?.signal?.id) || `item_${index}`;
      state.actionKeys.add(`${insightId}|${action}`);
    });

    state.duplicatesSkipped += number(result.duplicates_skipped);
    state.emptyCandidatesSkipped += number(result.empty_candidates_skipped);

    let created = 0;
    let reinforced = 0;
    let processed = 0;
    state.actionKeys.forEach((key) => {
      if (key.endsWith("|created")) created += 1;
      else if (key.endsWith("|reinforced")) reinforced += 1;
      else if (key.endsWith("|processed")) processed += 1;
    });

    return {
      created,
      reinforced,
      processed,
      duplicatesSkipped: state.duplicatesSkipped,
      emptyCandidatesSkipped: state.emptyCandidatesSkipped
    };
  }

  function formatInsightFeedback(summary) {
    if (!summary) return "";
    const parts = [];
    if (summary.created) parts.push(summary.created === 1 ? "1 ny" : `${summary.created} nye`);
    if (summary.reinforced) parts.push(`${summary.reinforced} forsterket`);
    if (summary.processed) parts.push(`${summary.processed} analysert`);
    if (summary.duplicatesSkipped) {
      parts.push(summary.duplicatesSkipped === 1 ? "1 duplikat filtrert" : `${summary.duplicatesSkipped} duplikater filtrert`);
    }
    if (summary.emptyCandidatesSkipped) {
      parts.push(summary.emptyCandidatesSkipped === 1 ? "1 tom kandidat hoppet over" : `${summary.emptyCandidatesSkipped} tomme kandidater hoppet over`);
    }
    return parts.length ? `Innsikter oppdatert · ${parts.join(" · ")}` : "";
  }

  function renderInsightFeedback(summary) {
    const message = formatInsightFeedback(summary);
    if (!message) return false;
    const node = global.document?.getElementById?.(STATUS_ID);
    if (!node) return false;
    node.textContent = message;
    return true;
  }

  function scheduleInsightFeedback(summary) {
    if (!formatInsightFeedback(summary)) return false;
    const schedule = typeof global.setTimeout === "function" ? global.setTimeout : (callback) => callback();
    schedule(() => renderInsightFeedback(summary), 0);
    return true;
  }

  function installInsightIngestFeedback() {
    const statusNode = global.document?.getElementById?.(STATUS_ID);
    if (!statusNode) return false;

    // Important isolation boundary: do not even read AHAIngest outside Chat.
    const ingestApi = global.AHAIngest;
    if (!ingestApi || typeof ingestApi.ingestWithCandidates !== "function") return false;
    if (ingestApi.__ahaChatInsightFeedbackInstalled === true) return true;

    const original = ingestApi.ingestWithCandidates;
    ingestApi.ingestWithCandidates = function feedbackWrappedIngest(input, candidates) {
      const result = original.call(this, input, candidates);
      const summary = summarizeInsightIngestResult(result);
      scheduleInsightFeedback(summary);
      return result;
    };
    ingestApi.__ahaChatInsightFeedbackInstalled = true;
    return true;
  }

  function emptyPersistedChanges() {
    return { created: [], reinforced: [], createdCount: 0, reinforcedCount: 0, totalTouched: 0 };
  }

  function bundleRunId(bundle) {
    const activeRun = bundle && typeof bundle.activeRun === "object" ? bundle.activeRun : {};
    return text(bundle?.analysisRunId || bundle?.runId || activeRun.analysisRunId || activeRun.runId);
  }

  function buildPersistedInsightChanges(bundle) {
    const builder = global.AHAConversationInsightSnapshot?.buildConversationInsightSnapshot;
    if (typeof builder !== "function" || !bundle || typeof bundle !== "object") return emptyPersistedChanges();
    const snapshot = builder({
      analysisRunId: bundleRunId(bundle),
      activeRun: bundle.activeRun,
      chamberInsights: Array.isArray(bundle.chamberInsights) ? bundle.chamberInsights : []
    });
    return snapshot?.insightChanges || emptyPersistedChanges();
  }

  function formatPersistedInsightSummary(changes) {
    if (!changes || !number(changes.totalTouched)) return "";
    const parts = [];
    if (number(changes.createdCount)) parts.push(changes.createdCount === 1 ? "1 ny" : `${changes.createdCount} nye`);
    if (number(changes.reinforcedCount)) parts.push(`${changes.reinforcedCount} forsterket`);
    return parts.length ? `Denne analysen · ${parts.join(" · ")}` : "";
  }

  function removePersistedSurface(host) {
    host?.querySelectorAll?.("[data-conversation-insight-changes]")?.forEach?.((node) => node.remove?.());
  }

  function insightChangeCards(items, label) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return "";
    return `
      <div class="exp-conversation-insight-change-group">
        <p class="exp-kicker">${esc(label)}</p>
        ${list.map((item) => {
          const meta = [];
          if (number(item?.evidenceCount)) meta.push(`${item.evidenceCount} belegg`);
          if (number(item?.totalScore)) meta.push(`styrke ${item.totalScore}`);
          return `<article class="exp-card exp-insight-card">
            <h3>${esc(item?.title || "Innsikt")}</h3>
            ${text(item?.summary) ? `<p>${esc(item.summary)}</p>` : ""}
            ${meta.length ? `<div class="exp-chips">${meta.map((value) => `<span class="exp-chip exp-chip-meta">${esc(value)}</span>`).join("")}</div>` : ""}
          </article>`;
        }).join("")}
      </div>`;
  }

  function renderPersistedInsightChanges(bundle) {
    const changes = buildPersistedInsightChanges(bundle);
    const nowHost = global.document?.getElementById?.("aha-now-content");
    const insightHost = global.document?.getElementById?.("exp-innsikter");
    removePersistedSurface(nowHost);
    removePersistedSurface(insightHost);

    const summary = formatPersistedInsightSummary(changes);
    if (!summary) return changes;

    const previewHost = nowHost?.querySelector?.(".aha-snapshot-preview") || nowHost;
    previewHost?.insertAdjacentHTML?.("beforeend", `
      <section class="aha-snapshot-group" data-conversation-insight-changes="true">
        <h3>Innsikter fra denne analysen</h3>
        <p>${esc(summary)}</p>
      </section>`);

    const detailed = `
      <section data-conversation-insight-changes="true" aria-label="Innsiktsendringer fra denne analysen">
        <p class="exp-kicker">${esc(summary)}</p>
        ${insightChangeCards(changes.created, "Nye innsikter fra denne analysen")}
        ${insightChangeCards(changes.reinforced, "Forsterket i denne analysen")}
      </section>`;
    insightHost?.insertAdjacentHTML?.("afterbegin", detailed);
    return changes;
  }

  function installExplorerInsightChangesSurface() {
    const explorerNode = global.document?.getElementById?.("aha-explorer");
    if (!explorerNode) return false;

    // Chat-only presentation adapter: do not even read AHAExplorer outside the Chat surface.
    const explorer = global.AHAExplorer;
    if (!explorer || typeof explorer.render !== "function") return false;
    if (explorer.__ahaConversationInsightChangesInstalled === true) return true;

    const originalRender = explorer.render;
    explorer.render = function renderWithPersistedInsightChanges(bundle) {
      const result = originalRender.call(this, bundle);
      renderPersistedInsightChanges(bundle);
      return result;
    };
    explorer.__ahaConversationInsightChangesInstalled = true;
    return true;
  }

  function personalSourceLabel(source) {
    const sourceType = text(source?.sourceType).toLowerCase();
    const origin = text(source?.source).toLowerCase();
    if (sourceType === "confirmed_claim") return "Bekreftet selvinnsikt";
    if (sourceType === "important_claim") return "Viktig selvinnsikt";
    if (sourceType === "corpus_item" || origin === "training_corpus") return "Godkjent kunnskapsgrunnlag";
    if (sourceType === "training_example" || origin === "training_examples") return "Godkjent eksempel";
    if (sourceType === "readiness_summary") return "Readiness-status";
    return "Personlig kilde";
  }

  function safePersonalSource(source) {
    const title = text(source?.title || source?.excerpt || personalSourceLabel(source)).replace(/\s+/g, " ").slice(0, 140);
    return { label: personalSourceLabel(source), title: title || personalSourceLabel(source) };
  }

  function buildPersonalAnswerTransparency(evaluation) {
    const used = Array.isArray(evaluation?.sourceUse?.usedSources) ? evaluation.sourceUse.usedSources : [];
    const unused = Array.isArray(evaluation?.sourceUse?.unusedSources) ? evaluation.sourceUse.unusedSources : [];
    const dims = evaluation && typeof evaluation.dimensions === "object" ? evaluation.dimensions : {};
    return {
      used: used.map(safePersonalSource).slice(0, 6),
      unused: unused.map(safePersonalSource).slice(0, 6),
      usedCount: used.length,
      selectedCount: used.length + unused.length,
      score: number(evaluation?.score),
      status: text(evaluation?.status || "unknown"),
      sourceGrounding: number(dims.sourceGrounding?.score),
      personalRelevance: number(dims.personalRelevance?.score),
      transparency: number(dims.transparency?.score)
    };
  }

  function personalAnswerSummaryText(summary) {
    if (!summary) return "";
    if (summary.usedCount === 1) {
      return "1 personlig kilde ble identifisert som tydelig brukt. Ikke alt i svaret kommer fra personlig materiale; resten er AHA sin formulering og vurdering.";
    }
    if (summary.usedCount > 1) {
      return `${summary.usedCount} personlige kilder ble identifisert som tydelig brukt. Ikke alt i svaret kommer fra personlig materiale; resten er AHA sin formulering og vurdering.`;
    }
    if (summary.selectedCount > 0) {
      return "Personlig materiale ble hentet frem, men ingen kilde ble identifisert som tydelig brukt i svaret. Les derfor svaret primært som AHA sin formulering og vurdering.";
    }
    return "Ingen personlige kilder ble identifisert som tydelig brukt i dette svaret. Personal AI har derfor ikke dokumentert kildebruk fra ditt lagrede materiale her.";
  }

  function personalSourceList(items, emptyText) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return `<p>${esc(emptyText)}</p>`;
    return `<ul>${list.map((item) => `<li><strong>${esc(item.label)}:</strong> ${esc(item.title)}</li>`).join("")}</ul>`;
  }

  function renderPersonalAnswerTransparency(node, summary) {
    if (!node || !summary) return false;
    node.classList?.add?.("aha-personal-answer-grounding");
    if (node.dataset) node.dataset.personalGrounding = "true";
    node.innerHTML = `
      <strong>Personlig grunnlag</strong>
      <span>${esc(personalAnswerSummaryText(summary))}</span>
      <details>
        <summary>Vis personlig grunnlag og svar-evaluering</summary>
        <div><strong>Identifisert som brukt i svaret</strong>${personalSourceList(summary.used, "Ingen personlige kilder ble identifisert som tydelig brukt.")}</div>
        ${summary.unused.length ? `<div><strong>Hentet frem, men lite synlig i svaret</strong>${personalSourceList(summary.unused, "")}</div>` : ""}
        <div><strong>Teknisk svar-evaluering:</strong> ${summary.score}/100 · status ${esc(summary.status)} · kildegrunnlag ${summary.sourceGrounding} · personlig relevans ${summary.personalRelevance} · transparens ${summary.transparency}.</div>
        <p>Dette er en heuristisk kontroll av teksten. Den kan vise synlig kildebruk, men kan ikke bevise nøyaktig hva svarmodellen brukte internt.</p>
      </details>`;
    return true;
  }

  function installPersonalAnswerEvaluationCapture() {
    const chatLog = global.document?.getElementById?.("chat-log");
    if (!chatLog) return false;

    // Chat-only boundary: do not read the evaluation API unless the Chat log exists.
    const api = global.AHAPersonalAnswerEvaluation;
    if (!api || typeof api.evaluateAnswer !== "function") return false;
    if (api.__ahaPersonalAnswerTransparencyCaptureInstalled === true) return true;

    const original = api.evaluateAnswer;
    api.evaluateAnswer = function evaluateWithPersonalTransparency(...args) {
      const result = original.apply(this, args);
      if (result && typeof result === "object") {
        personalAnswerTransparencyQueue.push(buildPersonalAnswerTransparency(result));
        while (personalAnswerTransparencyQueue.length > MAX_RUNS) personalAnswerTransparencyQueue.shift();
      }
      return result;
    };
    api.__ahaPersonalAnswerTransparencyCaptureInstalled = true;
    return true;
  }

  function evaluationNodesFromAddedNode(node) {
    if (!node || typeof node !== "object") return [];
    const out = [];
    if (typeof node.matches === "function" && node.matches(".aha-answer-evaluation")) out.push(node);
    if (typeof node.querySelectorAll === "function") {
      node.querySelectorAll(".aha-answer-evaluation").forEach((item) => out.push(item));
    }
    return out;
  }

  function installPersonalAnswerTransparencyObserver() {
    const chatLog = global.document?.getElementById?.("chat-log");
    if (!chatLog || typeof global.MutationObserver !== "function") return false;
    if (global.__ahaPersonalAnswerTransparencyObserver) return true;

    const observer = new global.MutationObserver((mutations) => {
      (Array.isArray(mutations) ? mutations : []).forEach((mutation) => {
        const addedNodes = mutation?.addedNodes ? Array.from(mutation.addedNodes) : [];
        addedNodes.forEach((addedNode) => {
          evaluationNodesFromAddedNode(addedNode).forEach((node) => {
            if (node?.dataset?.personalGrounding === "true") return;
            const summary = personalAnswerTransparencyQueue.shift();
            if (summary) renderPersonalAnswerTransparency(node, summary);
          });
        });
      });
    });
    observer.observe(chatLog, { childList: true, subtree: true });
    global.__ahaPersonalAnswerTransparencyObserver = observer;
    return true;
  }

  function resetFeedbackForTests() {
    feedbackByRun.clear();
    personalAnswerTransparencyQueue.length = 0;
  }

  global.AHAChatInsightFeedback = {
    normalizeAction,
    summarizeInsightIngestResult,
    formatInsightFeedback,
    renderInsightFeedback,
    scheduleInsightFeedback,
    installInsightIngestFeedback,
    buildPersistedInsightChanges,
    formatPersistedInsightSummary,
    renderPersistedInsightChanges,
    installExplorerInsightChangesSurface,
    personalSourceLabel,
    buildPersonalAnswerTransparency,
    personalAnswerSummaryText,
    renderPersonalAnswerTransparency,
    installPersonalAnswerEvaluationCapture,
    installPersonalAnswerTransparencyObserver,
    resetFeedbackForTests
  };

  function init() {
    installInsightIngestFeedback();
    installExplorerInsightChangesSurface();
    installPersonalAnswerEvaluationCapture();
    installPersonalAnswerTransparencyObserver();
  }

  if (global.document?.readyState === "loading") {
    global.document.addEventListener?.("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
