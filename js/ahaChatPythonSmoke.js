// ahaChatPythonSmoke.js
// Python AHA Engine smoke-test-harness, skilt ut fra ahaChat.js.
// Eksponerer window.AHAPythonEngineSmokeTest for manuell verifisering av
// Python-motor vs. JavaScript-fallback. Harnessen er selvinneholdt diagnostikk:
// den leser/skriver bare localStorage og global.AHAEngineClient, og kaller ikke
// inn i øvrig ahaChat-logikk. Lastes etter ahaChat.js.

(function (global) {
  "use strict";

  const AUTO_OUTPUT_STORAGE_KEY = "aha_chat_auto_outputs_v1";
  const AHA_PYTHON_ENGINE_ENABLED_KEY = "aha_python_engine_enabled";
  const AHA_PYTHON_ENGINE_URL_KEY = "aha_python_engine_url";
  const AHA_PYTHON_ENGINE_STAGING_URL = "https://aha-engine-staging-7a3y.onrender.com";
  const AHA_PYTHON_ENGINE_INVALID_URL = "https://invalid-aha-engine-staging-url.example";

  function getAhaSmokeTestLocalStorage() {
    try {
      return global.localStorage || null;
    } catch {
      return null;
    }
  }

  function isPythonEngineFeatureEnabled() {
    try {
      return global.localStorage?.getItem(AHA_PYTHON_ENGINE_ENABLED_KEY) === "true";
    } catch {
      return false;
    }
  }

  function getAhaSmokeTestFeatureFlags() {
    const storage = getAhaSmokeTestLocalStorage();
    const featureFlagEnabled = storage ? isPythonEngineFeatureEnabled() : false;
    const configuredUrl =
      global.AHAEngineClient && typeof global.AHAEngineClient.getExplicitEngineUrl === "function"
        ? global.AHAEngineClient.getExplicitEngineUrl()
        : storage
          ? String(storage.getItem(AHA_PYTHON_ENGINE_URL_KEY) || "").trim() || null
          : null;
    const resolvedUrl =
      global.AHAEngineClient && typeof global.AHAEngineClient.resolvePythonEngineUrl === "function"
        ? global.AHAEngineClient.resolvePythonEngineUrl()
        : configuredUrl;
    const urlAvailable = Boolean(resolvedUrl);
    return {
      featureFlagEnabled,
      configuredUrl,
      resolvedUrl,
      urlAvailable,
      requiresExplicitUrl: featureFlagEnabled && !urlAvailable
    };
  }

  function getLatestAutoOutput() {
    const storage = getAhaSmokeTestLocalStorage();
    if (!storage) return null;
    const raw = storage.getItem(AUTO_OUTPUT_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function getLatestEngineMeta() {
    const latest = getLatestAutoOutput();
    const meta = latest?.payload?.canonicalAnalysisMeta;
    return meta && typeof meta === "object" ? meta : null;
  }

  function isPythonActive() {
    return getLatestEngineMeta()?.source === "python";
  }

  function printAhaPythonEngineSmokeStatus() {
    const flags = getAhaSmokeTestFeatureFlags();
    const meta = getLatestEngineMeta();
    const status = {
      featureFlagEnabled: flags.featureFlagEnabled,
      configuredEngineUrl: flags.configuredUrl,
      resolvedEngineUrl: flags.resolvedUrl,
      urlAvailable: flags.urlAvailable,
      requiresExplicitUrl: flags.requiresExplicitUrl,
      latestSource: meta?.source || "n/a",
      latestReason: meta?.reason || "",
      latestStatus: typeof meta?.status === "number" ? meta.status : null,
      latestUrl: meta?.url || null
    };
    console.info("[AHAPythonEngineSmokeTest]", status);
    return status;
  }

  function clearAhaSmokeTestAutoOutput(storage) {
    storage?.removeItem(AUTO_OUTPUT_STORAGE_KEY);
  }

  function printAhaSmokeTestStorageStatus(action) {
    if (action) console.info(`[AHAPythonEngineSmokeTest] ${action}`);
    return printAhaPythonEngineSmokeStatus();
  }

  function resetAhaPythonEngineSmokeTest() {
    const storage = getAhaSmokeTestLocalStorage();
    storage?.removeItem(AHA_PYTHON_ENGINE_ENABLED_KEY);
    storage?.removeItem(AHA_PYTHON_ENGINE_URL_KEY);
    clearAhaSmokeTestAutoOutput(storage);
    return printAhaSmokeTestStorageStatus("Reset to JavaScript/default flow. Send a new AHA Chat message manually before checking latest output.");
  }

  function enableAhaPythonEngineWithStagingUrl() {
    const storage = getAhaSmokeTestLocalStorage();
    storage?.setItem(AHA_PYTHON_ENGINE_ENABLED_KEY, "true");
    storage?.setItem(AHA_PYTHON_ENGINE_URL_KEY, AHA_PYTHON_ENGINE_STAGING_URL);
    clearAhaSmokeTestAutoOutput(storage);
    return printAhaSmokeTestStorageStatus("Enabled Python Engine with explicit Render staging URL. Send a new AHA Chat message manually.");
  }

  function enableAhaPythonEngineWithoutUrl() {
    const storage = getAhaSmokeTestLocalStorage();
    storage?.setItem(AHA_PYTHON_ENGINE_ENABLED_KEY, "true");
    storage?.removeItem(AHA_PYTHON_ENGINE_URL_KEY);
    clearAhaSmokeTestAutoOutput(storage);
    return printAhaSmokeTestStorageStatus("Enabled Python Engine without explicit URL. On production-origin this should fail closed after a new manual AHA Chat message.");
  }

  function enableAhaPythonEngineWithInvalidUrl() {
    const storage = getAhaSmokeTestLocalStorage();
    storage?.setItem(AHA_PYTHON_ENGINE_ENABLED_KEY, "true");
    storage?.setItem(AHA_PYTHON_ENGINE_URL_KEY, AHA_PYTHON_ENGINE_INVALID_URL);
    clearAhaSmokeTestAutoOutput(storage);
    return printAhaSmokeTestStorageStatus("Enabled Python Engine with invalid URL. After a new manual AHA Chat message, fallback reason can vary by browser/network.");
  }

  function printAhaPythonEngineScenarioGuide() {
    const guide = [
      "1. AHAPythonEngineSmokeTest.reset()",
      "2. AHAPythonEngineSmokeTest.enableWithStagingUrl()",
      "3. Send ny AHA Chat-melding",
      "4. AHAPythonEngineSmokeTest.printStatus()",
      "5. AHAPythonEngineSmokeTest.enableWithoutUrl()",
      "6. Send ny AHA Chat-melding",
      "7. AHAPythonEngineSmokeTest.printStatus()",
      "8. AHAPythonEngineSmokeTest.enableWithInvalidUrl()",
      "9. Send ny AHA Chat-melding",
      "10. AHAPythonEngineSmokeTest.printStatus()"
    ];
    console.info([
      "[AHAPythonEngineSmokeTest] Scenario guide:",
      ...guide,
      "Helperen setter bare localStorage/teststatus; den sender ikke AHA Chat-meldinger automatisk.",
      "Invalid URL kan gi network_error, http_error eller python_error avhengig av browser/network."
    ].join("\n"));
    return guide;
  }

  global.AHAPythonEngineSmokeTest = Object.assign({}, global.AHAPythonEngineSmokeTest || {}, {
    getLatestAutoOutput,
    getLatestEngineMeta,
    isPythonActive,
    reset: resetAhaPythonEngineSmokeTest,
    enableWithStagingUrl: enableAhaPythonEngineWithStagingUrl,
    enableWithoutUrl: enableAhaPythonEngineWithoutUrl,
    enableWithInvalidUrl: enableAhaPythonEngineWithInvalidUrl,
    printScenarioGuide: printAhaPythonEngineScenarioGuide,
    printStatus: printAhaPythonEngineSmokeStatus
  });
})(window);
