// ahaEngineClient.js
// Safe client bridge for optional Python AHA Engine usage.

(function (global) {
  "use strict";

  const FLAG_KEY = "aha_python_engine_enabled";
  const URL_KEY = "aha_python_engine_url";
  const STAGING_DEFAULT_URL = "https://aha-engine-staging-7a3y.onrender.com";
  const DEFAULT_TIMEOUT_MS = 4000;
  const AGENT_CHAT_PATH = "/api/aha-agent/chat";
  let lastAgentSubjectContext = null;

  function getStorage() {
    try {
      return global.localStorage || null;
    } catch (_) {
      return null;
    }
  }

  function isEnabled() {
    const storage = getStorage();
    if (!storage) return false;
    return storage.getItem(FLAG_KEY) === "true";
  }

  function getExplicitEngineUrl() {
    const storage = getStorage();
    const raw = storage ? String(storage.getItem(URL_KEY) || "").trim() : "";
    return raw || null;
  }

  function getHostname() {
    try {
      return String(global.location?.hostname || "").trim().toLowerCase();
    } catch (_) {
      return "";
    }
  }

  function isNonProductionHost() {
    const hostname = getHostname();
    if (!hostname) return false;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
    return hostname.endsWith(".vercel.app") || hostname.includes("staging") || hostname.includes("preview");
  }

  function resolvePythonEngineUrl() {
    const explicit = getExplicitEngineUrl();
    if (explicit) return explicit;
    if (isNonProductionHost()) return STAGING_DEFAULT_URL;
    return null;
  }

  function getConfiguredBaseUrl() {
    return resolvePythonEngineUrl();
  }

  function buildAnalyzePayload(message, assistantReply, historyGoContext) {
    return {
      message: String(message || ""),
      assistantReply: String(assistantReply || ""),
      historyGoContext:
        historyGoContext && typeof historyGoContext === "object" && !Array.isArray(historyGoContext)
          ? historyGoContext
          : {}
    };
  }

  function normalizeSubjectContextMatch(match) {
    if (!match || typeof match !== "object") return null;
    const subjectId = String(match.subject_id || "").trim();
    const title = String(match.title || match.subject_label || match.emne_id || subjectId).trim();
    if (!subjectId || !title) return null;
    return {
      subject_id: subjectId,
      subject_label: String(match.subject_label || subjectId).trim(),
      emne_id: match.emne_id == null ? null : String(match.emne_id),
      title,
      type: String(match.type || "emne"),
      score: Number.isFinite(Number(match.score)) ? Number(match.score) : 0,
      matched_terms: Array.isArray(match.matched_terms) ? match.matched_terms.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12) : [],
      provenance: match.provenance && typeof match.provenance === "object" ? JSON.parse(JSON.stringify(match.provenance)) : null
    };
  }

  async function buildAgentSubjectContext(message) {
    const text = String(message || "").trim();
    const engine = global.AHASubjectEngine;
    const base = {
      schema: "aha_agent_subject_context_v1",
      role: "fagverk_reference_support",
      evidence_policy: {
        source_evidence: "user_message_only",
        fagverk: "reference_support_not_source_evidence"
      },
      matches: []
    };
    if (!text || !engine || typeof engine.matchText !== "function") {
      lastAgentSubjectContext = base;
      return base;
    }
    try {
      const matches = await engine.matchText(text, { source: "agent_preflight", maxResults: 6 });
      const normalized = (Array.isArray(matches) ? matches : []).map(normalizeSubjectContextMatch).filter(Boolean);
      lastAgentSubjectContext = { ...base, matches: normalized };
      return lastAgentSubjectContext;
    } catch (error) {
      console.warn("AHAEngineClient: Subject Engine preflight failed", error);
      lastAgentSubjectContext = { ...base, status: "subject_engine_unavailable" };
      return lastAgentSubjectContext;
    }
  }

  async function prepareAgentChatRequest(body) {
    const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
    const subjectContext = await buildAgentSubjectContext(source.message);
    const aiState = source.ai_state && typeof source.ai_state === "object" && !Array.isArray(source.ai_state)
      ? { ...source.ai_state }
      : {};
    aiState.subject_context = subjectContext;
    return { ...source, ai_state: aiState, subject_context: subjectContext };
  }

  function isAgentChatRequest(input) {
    const value = typeof input === "string" ? input : String(input?.url || "");
    return value.includes(AGENT_CHAT_PATH);
  }

  function installAgentSubjectPreflight() {
    if (typeof window === "undefined" || global !== window || typeof global.fetch !== "function") return false;
    if (global.fetch.__ahaSubjectPreflight === true) return true;
    const originalFetch = global.fetch.bind(global);
    const wrappedFetch = async function (input, init) {
      if (!isAgentChatRequest(input) || !init || String(init.method || "GET").toUpperCase() !== "POST" || typeof init.body !== "string") {
        return originalFetch(input, init);
      }
      try {
        const parsed = JSON.parse(init.body);
        const prepared = await prepareAgentChatRequest(parsed);
        return originalFetch(input, { ...init, body: JSON.stringify(prepared) });
      } catch (error) {
        console.warn("AHAEngineClient: agent subject-context injection failed", error);
        return originalFetch(input, init);
      }
    };
    wrappedFetch.__ahaSubjectPreflight = true;
    wrappedFetch.__ahaOriginalFetch = originalFetch;
    global.fetch = wrappedFetch;
    return true;
  }

  function isConfidenceObject(confidence) {
    if (!confidence || typeof confidence !== "object" || Array.isArray(confidence)) return false;
    const keys = ["contentType", "domain", "theme", "mainTension", "historyGoLinks"];
    return keys.every((key) => {
      const value = confidence[key];
      return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
    });
  }

  function isHistoryGoLink(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    return ["type", "id", "title", "reason"].every((key) => typeof item[key] === "string");
  }

  function isCanonicalAhaAnalysis(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (typeof value.contentType !== "string") return false;
    if (typeof value.domain !== "string") return false;
    if (typeof value.theme !== "string") return false;
    if (typeof value.mainTension !== "string") return false;
    if (typeof value.keyInsight !== "string") return false;
    if (!Array.isArray(value.fieldConnections)) return false;
    if (!Array.isArray(value.historyGoLinks)) return false;
    if (!Array.isArray(value.suggestedActions)) return false;
    if (!Array.isArray(value.warnings)) return false;
    if (!isConfidenceObject(value.confidence)) return false;
    if (value.historyGoLinks.length > 0 && !value.historyGoLinks.every(isHistoryGoLink)) return false;
    return true;
  }

  function buildDetailedResult({ analysis = null, ok = false, reason = "", status = null, url = null } = {}) {
    return { analysis, ok, reason, status, url };
  }

  function isAbortError(error) {
    return error && (error.name === "AbortError" || error.code === 20);
  }

  function isLikelyNetworkError(error) {
    return error instanceof TypeError || /fetch|network|failed to fetch/i.test(String(error?.message || error || ""));
  }

  async function analyzeWithPythonEngineDetailed(payload, options) {
    if (!isEnabled()) return buildDetailedResult({ reason: "feature_flag_disabled" });
    const resolvedUrl = resolvePythonEngineUrl();
    if (!resolvedUrl) return buildDetailedResult({ reason: "requires_explicit_url" });
    const timeoutMs = options && typeof options.timeoutMs === "number" && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let status = null;
    try {
      const response = await fetch(`${resolvedUrl}/api/aha/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      status = typeof response.status === "number" ? response.status : null;
      if (!response.ok) return buildDetailedResult({ reason: "http_error", status, url: resolvedUrl });
      let data;
      try { data = await response.json(); }
      catch (_) { return buildDetailedResult({ reason: "invalid_json", status, url: resolvedUrl }); }
      if (data == null) return buildDetailedResult({ reason: "python_null", status, url: resolvedUrl });
      if (!isCanonicalAhaAnalysis(data)) return buildDetailedResult({ reason: "invalid_python_shape", status, url: resolvedUrl });
      return buildDetailedResult({ analysis: data, ok: true, status, url: resolvedUrl });
    } catch (err) {
      const reason = isAbortError(err) ? "timeout" : isLikelyNetworkError(err) ? "network_error" : "python_error";
      return buildDetailedResult({ reason, status, url: resolvedUrl });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function analyzeWithPythonEngine(payload, options) {
    const detailed = await analyzeWithPythonEngineDetailed(payload, options);
    return detailed.analysis;
  }

  const api = {
    isEnabled,
    getExplicitEngineUrl,
    isNonProductionHost,
    resolvePythonEngineUrl,
    getConfiguredBaseUrl,
    buildAnalyzePayload,
    buildAgentSubjectContext,
    prepareAgentChatRequest,
    installAgentSubjectPreflight,
    getLastAgentSubjectContext() { return lastAgentSubjectContext; },
    analyzeWithPythonEngineDetailed,
    analyzeWithPythonEngine,
    isCanonicalAhaAnalysis
  };

  global.AHAEngineClient = api;
  global.AHAAgentSubjectContext = {
    get() { return lastAgentSubjectContext; },
    build: buildAgentSubjectContext,
    prepare: prepareAgentChatRequest
  };

  installAgentSubjectPreflight();

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
