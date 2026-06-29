// ahaChatPythonSmoke.js
// Python AHA Engine smoke-test-harness, skilt ut fra ahaChat.js.
// Eksponerer window.AHAPythonEngineSmokeTest for manuell verifisering av
// Python-motor vs. JavaScript-fallback. Harnessen er selvinneholdt diagnostikk:
// den leser/skriver bare localStorage og global.AHAEngineClient, og kaller ikke
// inn i øvrig ahaChat-logikk. Lastes etter ahaChat.js.
//
// I tillegg reparerer den auto-output source binding etter render, slik at
// payload/canonicalAnalysis får samme sourceTextHash som wrapperen før eksport
// eller Explorer leser siste auto-output.

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

  function shortHash(input) {
    let hash = 5381;
    const value = String(input || "");
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) + hash) + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function normalizeSourceHash(value) {
    return String(value || "").trim();
  }

  function readObjectSourceHash(value) {
    const obj = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return normalizeSourceHash(
      obj.sourceTextHash
      || obj.source_text_hash
      || obj.sourceHash
      || obj.source_hash
      || obj.source_binding?.currentSourceTextHash
      || obj.source_binding?.sourceTextHash
      || obj.sourceBinding?.sourceTextHash
    );
  }

  function resolveAutoOutputSourceHash(autoOutput) {
    const auto = autoOutput && typeof autoOutput === "object" && !Array.isArray(autoOutput) ? autoOutput : {};
    const topLevelHash = readObjectSourceHash(auto);
    if (topLevelHash) return topLevelHash;
    const payloadHash = readObjectSourceHash(auto.payload);
    if (payloadHash) return payloadHash;
    const sourceText = String(auto.sourceText || auto.payload?.sourceText || "");
    return sourceText.trim() ? shortHash(sourceText) : "";
  }

  function buildSourceBinding(field, sourceTextHash, existingHash, reason) {
    const current = normalizeSourceHash(sourceTextHash);
    const fieldHash = normalizeSourceHash(existingHash);
    const hasFieldHash = Boolean(fieldHash);
    const valid = Boolean(current) && (!hasFieldHash || fieldHash === current);
    return {
      field,
      status: !current
        ? "invalid_missing_current_source_hash"
        : hasFieldHash
          ? (valid ? "verified" : "invalid_hash_mismatch")
          : "inferred_from_auto_output_wrapper",
      valid,
      currentSourceTextHash: current || null,
      fieldSourceTextHash: fieldHash || null,
      inferred: !hasFieldHash && Boolean(current),
      reason: reason || "auto_output_render_repair"
    };
  }

  function bindObjectToCurrentSource(value, field, sourceTextHash) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const existingHash = readObjectSourceHash(value);
    const binding = buildSourceBinding(field, sourceTextHash, existingHash, "auto_output_render_repair");
    if (!existingHash && binding.currentSourceTextHash) value.sourceTextHash = binding.currentSourceTextHash;
    value.source_binding = Object.assign({}, value.source_binding || {}, binding);
    return value;
  }

  function bindAutoOutputToSource(autoOutput) {
    if (!autoOutput || typeof autoOutput !== "object" || Array.isArray(autoOutput)) return autoOutput;
    const sourceTextHash = resolveAutoOutputSourceHash(autoOutput);
    if (sourceTextHash && !autoOutput.sourceTextHash) autoOutput.sourceTextHash = sourceTextHash;
    autoOutput.source_binding = buildSourceBinding("autoOutput", sourceTextHash, autoOutput.sourceTextHash, "auto_output_render_repair");

    const payload = autoOutput.payload && typeof autoOutput.payload === "object" && !Array.isArray(autoOutput.payload)
      ? autoOutput.payload
      : null;
    if (payload) {
      bindObjectToCurrentSource(payload, "rawAutoPayload", sourceTextHash);
      bindObjectToCurrentSource(payload.canonicalAnalysis, "canonicalAnalysis", sourceTextHash);
      bindObjectToCurrentSource(payload.ahaSer, "ahaSer", sourceTextHash);
    }

    const bindings = [
      autoOutput.source_binding,
      payload?.source_binding,
      payload?.canonicalAnalysis?.source_binding,
      payload?.ahaSer?.source_binding
    ].filter(Boolean);
    autoOutput.sourceBinding = {
      currentSourceTextHash: sourceTextHash || null,
      bindings,
      invalidFields: bindings
        .filter((binding) => binding.valid === false)
        .map((binding) => ({ field: binding.field, status: binding.status, reason: binding.reason })),
      stampedAt: new Date().toISOString()
    };
    return autoOutput;
  }

  function repairStoredAutoOutputSourceBinding() {
    const storage = getAhaSmokeTestLocalStorage();
    if (!storage) return null;
    const raw = storage.getItem(AUTO_OUTPUT_STORAGE_KEY);
    if (!raw) return null;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const before = JSON.stringify(parsed);
    const bound = bindAutoOutputToSource(parsed);
    const after = JSON.stringify(bound);
    if (after !== before) storage.setItem(AUTO_OUTPUT_STORAGE_KEY, after);
    return bound;
  }

  function scheduleAutoOutputBindingRepair() {
    const run = () => repairStoredAutoOutputSourceBinding();
    if (typeof global.requestAnimationFrame === "function") global.requestAnimationFrame(run);
    else global.setTimeout?.(run, 0);
  }

  function installAutoOutputBindingRepairObserver() {
    if (typeof document === "undefined" || typeof MutationObserver === "undefined") return false;
    const host = document.getElementById("aha-auto-output") || document.getElementById("aha-explorer");
    if (!host) return false;
    const observer = new MutationObserver(scheduleAutoOutputBindingRepair);
    observer.observe(host, { childList: true, subtree: true, characterData: true });
    scheduleAutoOutputBindingRepair();
    return true;
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
    repairStoredAutoOutputSourceBinding();
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
    const latest = getLatestAutoOutput();
    const status = {
      featureFlagEnabled: flags.featureFlagEnabled,
      configuredEngineUrl: flags.configuredUrl,
      resolvedEngineUrl: flags.resolvedUrl,
      urlAvailable: flags.urlAvailable,
      requiresExplicitUrl: flags.requiresExplicitUrl,
      latestSource: meta?.source || "n/a",
      latestReason: meta?.reason || "",
      latestStatus: typeof meta?.status === "number" ? meta.status : null,
      latestUrl: meta?.url || null,
      latestSourceTextHash: latest?.sourceTextHash || null,
      latestPayloadSourceBinding: latest?.payload?.source_binding?.status || null
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

  repairStoredAutoOutputSourceBinding();
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installAutoOutputBindingRepairObserver, { once: true });
    else installAutoOutputBindingRepairObserver();
  }

  global.AHAAutoOutputSourceBinding = Object.assign({}, global.AHAAutoOutputSourceBinding || {}, {
    bindAutoOutputToSource,
    repairStored: repairStoredAutoOutputSourceBinding,
    installObserver: installAutoOutputBindingRepairObserver,
    getLatestAutoOutput
  });

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