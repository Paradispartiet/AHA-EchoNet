// Local, privacy-preserving calibration derived from existing AHA records.
// No parallel store, model training, backend write, sync, or raw source capture.
(function (global) {
  "use strict";

  const VERSION = "aha_analysis_quality_profile_v1";
  const CHAMBER_KEY = "aha_insight_chamber_v1";
  const AUTO_OUTPUT_KEY = "aha_chat_auto_outputs_v1";
  const RESPONSES = new Set(["useful", "too_generic", "misinterpreted", "missing_evidence"]);
  const text = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const arr = (value) => Array.isArray(value) ? value : [];

  function safeStorage() {
    try { return global.localStorage || null; } catch { return null; }
  }

  function parse(raw, fallback) {
    try { const value = JSON.parse(raw); return value == null ? fallback : value; } catch { return fallback; }
  }

  function domainFrom(input) {
    const canonical = input?.payload?.canonicalAnalysis || input?.canonicalAnalysis || input || {};
    return text(canonical.domain || canonical.contentType || input?.payload?.textType || input?.textType || "general").toLowerCase() || "general";
  }

  function normalizeEvent(event, fallback = {}) {
    const response = text(event?.response).toLowerCase();
    if (!RESPONSES.has(response) || event?.undone_at) return null;
    return {
      response,
      domain: text(event?.domain || fallback.domain || "general").toLowerCase() || "general",
      analysisSourceHash: text(event?.analysis_source_hash || event?.analysisSourceHash || fallback.analysisSourceHash),
      createdAt: text(event?.created_at || event?.createdAt || fallback.createdAt),
      local_only: true
    };
  }

  function collectFeedbackEvents(options = {}) {
    const storage = options.storage || safeStorage();
    const events = [];
    const sessions = global.AHAChatPersistence?.loadSessions?.() || [];
    arr(sessions).forEach((session) => arr(session?.messages).forEach((message) => {
      arr(message?.meta?.analysisQualityFeedback).forEach((event) => {
        const normalized = normalizeEvent(event);
        if (normalized) events.push(normalized);
      });
    }));

    const chamber = options.chamber || parse(storage?.getItem?.(CHAMBER_KEY) || "{}", {});
    arr(chamber?.insights).forEach((insight) => arr(insight?.user_quality_feedback).forEach((event) => {
      const normalized = normalizeEvent(event, {
        domain: insight?.domain || insight?.contentType,
        analysisSourceHash: insight?.sourceHash || insight?.sourceTextHash,
        createdAt: insight?.created_at || insight?.createdAt
      });
      if (normalized) events.push(normalized);
    }));

    const cache = options.cache || parse(storage?.getItem?.(AUTO_OUTPUT_KEY) || "null", null);
    arr(cache?.payload?.analysisQuality?.userFeedback).forEach((event) => {
      const normalized = normalizeEvent(event, {
        domain: domainFrom(cache),
        analysisSourceHash: cache?.sourceHash || cache?.sourceTextHash,
        createdAt: cache?.createdAt
      });
      if (normalized) events.push(normalized);
    });

    const seen = new Set();
    return events.filter((event) => {
      const key = `${event.analysisSourceHash}|${event.response}|${event.createdAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function summarize(events) {
    const counts = { useful: 0, too_generic: 0, misinterpreted: 0, missing_evidence: 0 };
    arr(events).forEach((event) => { if (RESPONSES.has(event?.response)) counts[event.response] += 1; });
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return {
      total,
      counts,
      usefulRate: total ? Number((counts.useful / total).toFixed(3)) : 0,
      issueRate: total ? Number(((total - counts.useful) / total).toFixed(3)) : 0
    };
  }

  function buildProfile(options = {}) {
    const events = collectFeedbackEvents(options);
    const domain = text(options.domain || domainFrom(options.cache)).toLowerCase() || "general";
    const domainEvents = events.filter((event) => event.domain === domain);
    const globalSummary = summarize(events);
    const domainSummary = summarize(domainEvents);
    const active = domainSummary.total >= 2 ? domainSummary : globalSummary;
    const enoughEvidence = active.total >= 3;
    const recommendations = {
      requireMoreSpecificity: enoughEvidence && active.counts.too_generic >= 2 && active.counts.too_generic / active.total >= 0.3,
      requireStrongerEvidence: enoughEvidence && active.counts.missing_evidence >= 2 && active.counts.missing_evidence / active.total >= 0.3,
      useConservativeInterpretation: enoughEvidence && active.counts.misinterpreted >= 2 && active.counts.misinterpreted / active.total >= 0.3
    };
    return {
      version: VERSION,
      domain,
      sampleSize: active.total,
      scope: domainSummary.total >= 2 ? "domain" : "global",
      global: globalSummary,
      domainSummary,
      recommendations,
      adaptive: enoughEvidence && Object.values(recommendations).some(Boolean),
      boundary: {
        local_only: true,
        raw_source_stored: false,
        model_training_enabled: false,
        sync_enabled: false,
        echonet_shared: false
      }
    };
  }

  function adjustedThresholds(profile) {
    const recommendations = profile?.recommendations || {};
    return {
      ...(recommendations.requireMoreSpecificity ? { specificity: 0.6, actionability: 0.58 } : {}),
      ...(recommendations.requireStrongerEvidence ? { sourceGrounding: 0.68 } : {}),
      ...(recommendations.useConservativeInterpretation ? { transformation: 0.52 } : {})
    };
  }

  function recordFeedback(cache, response, options = {}) {
    const normalized = text(response).toLowerCase();
    if (!RESPONSES.has(normalized)) return { ok: false, reason: "invalid_response" };
    const persistence = global.AHAChatPersistence;
    if (!persistence?.loadSessions || !persistence?.updateMessage) return { ok: false, reason: "chat_persistence_unavailable" };
    const sessions = persistence.loadSessions();
    const sessionId = text(cache?.sessionId || cache?.conversationId);
    const session = sessions.find((item) => item.id === sessionId) || sessions[0];
    const message = arr(session?.messages).slice().reverse().find((item) => item.role === "assistant");
    if (!message) return { ok: false, reason: "assistant_message_not_found" };
    const now = options.now || new Date().toISOString();
    const history = arr(message?.meta?.analysisQualityFeedback).slice();
    const sourceHash = text(cache?.sourceHash || cache?.sourceTextHash || cache?.payload?.canonicalAnalysis?.sourceHash);
    const latest = history.slice().reverse().find((item) => !item?.undone_at);
    if (latest?.response === normalized && text(latest?.analysisSourceHash) === sourceHash) return { ok: true, noChange: true, message };
    history.push({
      response: normalized,
      domain: domainFrom(cache),
      analysisSourceHash: sourceHash,
      createdAt: now,
      local_only: true
    });
    const updated = persistence.updateMessage(message.id, {
      meta: { ...(message.meta || {}), analysisQualityFeedback: history }
    });
    return { ok: Boolean(updated), message: updated || message };
  }

  function undoFeedback(cache, options = {}) {
    const persistence = global.AHAChatPersistence;
    if (!persistence?.loadSessions || !persistence?.updateMessage) return { ok: false, reason: "chat_persistence_unavailable" };
    const sessions = persistence.loadSessions();
    const sessionId = text(cache?.sessionId || cache?.conversationId);
    const session = sessions.find((item) => item.id === sessionId) || sessions[0];
    const sourceHash = text(cache?.sourceHash || cache?.sourceTextHash || cache?.payload?.canonicalAnalysis?.sourceHash);
    const message = arr(session?.messages).slice().reverse().find((item) => item.role === "assistant" && arr(item?.meta?.analysisQualityFeedback).some((event) => {
      return !event?.undone_at && (!sourceHash || text(event?.analysisSourceHash) === sourceHash);
    }));
    if (!message) return { ok: false, reason: "nothing_to_undo" };
    const history = arr(message.meta.analysisQualityFeedback).map((event) => ({ ...event }));
    const index = history.map((event, itemIndex) => ({ event, itemIndex })).reverse().find(({ event }) => {
      return !event?.undone_at && (!sourceHash || text(event?.analysisSourceHash) === sourceHash);
    })?.itemIndex;
    if (!Number.isInteger(index)) return { ok: false, reason: "nothing_to_undo" };
    history[index].undone_at = options.now || new Date().toISOString();
    const updated = persistence.updateMessage(message.id, { meta: { ...(message.meta || {}), analysisQualityFeedback: history } });
    return { ok: Boolean(updated), message: updated || message };
  }

  function loadScript(src, marker, available) {
    const doc = global.document;
    if (!doc?.head || !doc.createElement || available?.()) return false;
    if (doc.querySelector?.(`script[data-aha-quality-module="${marker}"]`)) return true;
    const script = doc.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.ahaQualityModule = marker;
    doc.head.appendChild(script);
    return true;
  }

  function loadQualityCompletion() {
    const completion = loadScript("js/ahaQualityCompletion.js", "completion", () => Boolean(global.AHAQualityCompletion));
    const artifacts = loadScript("js/ahaAdaptiveArtifacts.js", "adaptive-artifacts", () => Boolean(global.AHAAdaptiveArtifacts));
    return completion || artifacts;
  }

  const api = Object.freeze({ VERSION, collectFeedbackEvents, buildProfile, adjustedThresholds, recordFeedback, undoFeedback, loadScript, loadQualityCompletion });
  global.AHAAnalysisQualityProfile = api;
  global.AHAModuleApi?.register?.("analysis.qualityProfile", api, {
    version: 1,
    legacyGlobal: "AHAAnalysisQualityProfile",
    exports: Object.keys(api)
  });
  loadQualityCompletion();
})(typeof window !== "undefined" ? window : globalThis);