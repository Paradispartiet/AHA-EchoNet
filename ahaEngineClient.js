// ahaEngineClient.js
// Safe client bridge for optional Python AHA Engine usage.

(function (global) {
  "use strict";

  const FLAG_KEY = "aha_python_engine_enabled";
  const URL_KEY = "aha_python_engine_url";
  const DEFAULT_URL = "https://aha-engine-staging-7a3y.onrender.com";
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
    return String(storage.getItem(FLAG_KEY) || "").trim().toLowerCase() === "true";
  }

  function getBaseUrl() {
    const storage = getStorage();
    const raw = storage ? String(storage.getItem(URL_KEY) || "").trim() : "";
    return raw || DEFAULT_URL;
  }

  function getConfiguredBaseUrl() {
    return getBaseUrl();
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

  async function analyzeWithPythonEngine(payload, options) {
    if (!isEnabled()) return null;

    const timeoutMs =
      options && typeof options.timeoutMs === "number" && options.timeoutMs > 0
        ? options.timeoutMs
        : DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${getBaseUrl()}/api/aha/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) return null;

      const data = await response.json();
      return isCanonicalAhaAnalysis(data) ? data : null;
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const api = {
    isEnabled,
    getConfiguredBaseUrl,
    buildAnalyzePayload,
    analyzeWithPythonEngine,
    isCanonicalAhaAnalysis
  };

  global.AHAEngineClient = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
