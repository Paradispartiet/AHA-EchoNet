// ahaEngineClient.js
// Safe client bridge for optional Python AHA Engine usage.

(function (global) {
  "use strict";

  const FLAG_KEY = "aha_python_engine_enabled";
  const URL_KEY = "aha_python_engine_url";
  const STAGING_DEFAULT_URL = "https://aha-engine-staging-7a3y.onrender.com";
  const DEFAULT_TIMEOUT_MS = 4000;

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

    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return true;
    }

    return (
      hostname.endsWith(".vercel.app") ||
      hostname.includes("staging") ||
      hostname.includes("preview")
    );
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

    return ["type", "id", "title", "reason"].every((key) => {
      return typeof item[key] === "string";
    });
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

    if (value.historyGoLinks.length > 0 && !value.historyGoLinks.every(isHistoryGoLink)) {
      return false;
    }

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
    if (!isEnabled()) {
      return buildDetailedResult({ reason: "feature_flag_disabled" });
    }

    const resolvedUrl = resolvePythonEngineUrl();
    if (!resolvedUrl) {
      return buildDetailedResult({ reason: "requires_explicit_url" });
    }

    const timeoutMs =
      options && typeof options.timeoutMs === "number" && options.timeoutMs > 0
        ? options.timeoutMs
        : DEFAULT_TIMEOUT_MS;

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
      if (!response.ok) {
        return buildDetailedResult({ reason: "http_error", status, url: resolvedUrl });
      }

      let data;
      try {
        data = await response.json();
      } catch (_) {
        return buildDetailedResult({ reason: "invalid_json", status, url: resolvedUrl });
      }

      if (data == null) {
        return buildDetailedResult({ reason: "python_null", status, url: resolvedUrl });
      }

      if (!isCanonicalAhaAnalysis(data)) {
        return buildDetailedResult({ reason: "invalid_python_shape", status, url: resolvedUrl });
      }

      return buildDetailedResult({ analysis: data, ok: true, status, url: resolvedUrl });
    } catch (err) {
      const reason = isAbortError(err)
        ? "timeout"
        : isLikelyNetworkError(err)
          ? "network_error"
          : "python_error";
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
    analyzeWithPythonEngineDetailed,
    analyzeWithPythonEngine,
    isCanonicalAhaAnalysis
  };

  global.AHAEngineClient = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
