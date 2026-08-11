// ahaChatInsightFeedback.js
// Chat-only, ephemeral feedback for what the canonical insight ingest just changed.

(function (global) {
  "use strict";

  const STATUS_ID = "chat-status-note";
  const MAX_RUNS = 20;
  const feedbackByRun = new Map();

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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

  function resetFeedbackForTests() {
    feedbackByRun.clear();
  }

  global.AHAChatInsightFeedback = {
    normalizeAction,
    summarizeInsightIngestResult,
    formatInsightFeedback,
    renderInsightFeedback,
    scheduleInsightFeedback,
    installInsightIngestFeedback,
    resetFeedbackForTests
  };

  function init() {
    installInsightIngestFeedback();
  }

  if (global.document?.readyState === "loading") {
    global.document.addEventListener?.("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
