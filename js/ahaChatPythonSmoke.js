// ahaChatPythonSmoke.js
// Python AHA Engine smoke-test-harness, skilt ut fra ahaChat.js.
// Eksponerer window.AHAPythonEngineSmokeTest for manuell verifisering av
// Python-motor vs. JavaScript-fallback. Harnessen er selvinneholdt diagnostikk:
// den leser/skriver bare localStorage og global.AHAEngineClient, og kaller ikke
// inn i øvrig ahaChat-logikk. Lastes etter ahaChat.js.
//
// I tillegg verifiserer den auto-output source binding etter render. Lagrede
// payloads får aldri dagens sourceTextHash bare fordi wrapperen har den: hash-løse
// nested artifacts forblir unverifiserte ved repair, og semantisk krysskontaminering
// failer lukket før eksport.

(function (global) {
  "use strict";

  const AUTO_OUTPUT_STORAGE_KEY = "aha_chat_auto_outputs_v1";
  const AHA_PYTHON_ENGINE_ENABLED_KEY = "aha_python_engine_enabled";
  const AHA_PYTHON_ENGINE_URL_KEY = "aha_python_engine_url";
  const AHA_PYTHON_ENGINE_STAGING_URL = "https://aha-engine-staging-7a3y.onrender.com";
  const AHA_PYTHON_ENGINE_INVALID_URL = "https://invalid-aha-engine-staging-url.example";

  const TOPIC_STOPWORDS = new Set([
    "dette", "denne", "disse", "eller", "ikke", "som", "med", "for", "til", "fra", "har", "kan", "skal",
    "det", "der", "seg", "sin", "sitt", "sine", "mens", "viser", "fortsatt", "mye", "eget", "tema", "teksten",
    "handler", "analyse", "kilde", "output", "blir", "være", "vaere", "også", "ogsa", "bare", "etter", "gjennom",
    "ulike", "mer", "alle", "andre", "noen", "samt", "selv", "før", "foer", "og", "men", "ved", "om", "av"
  ]);

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

  function normalizeTopicText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/æ/g, "ae")
      .replace(/ø/g, "o")
      .replace(/å/g, "a")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function topicTokenCounts(value) {
    const counts = new Map();
    normalizeTopicText(value).split(" ").forEach((token) => {
      if (token.length < 4 || TOPIC_STOPWORDS.has(token)) return;
      counts.set(token, (counts.get(token) || 0) + 1);
    });
    return counts;
  }

  function topTopicTerms(value, maxTerms = 18) {
    return Array.from(topicTokenCounts(value).entries())
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .slice(0, maxTerms)
      .map(([term]) => term);
  }

  function repeatedSourceTerms(value, maxTerms = 18) {
    return Array.from(topicTokenCounts(value).entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .slice(0, maxTerms)
      .map(([term]) => term);
  }

  function flattenTopicValue(value, depth = 0) {
    if (value == null || depth > 5) return "";
    if (["string", "number", "boolean"].includes(typeof value)) return String(value);
    if (Array.isArray(value)) return value.map((item) => flattenTopicValue(item, depth + 1)).filter(Boolean).join(" ");
    if (typeof value === "object") {
      return Object.keys(value)
        .filter((key) => ![
          "sourceText", "sourceTextPreview", "sourceTextHash", "sourceHash", "normalizedSourceHash", "sourceFingerprint",
          "source_binding", "sourceBinding", "quality", "analysisRunId", "runId", "analysisId", "conversationId", "sessionId",
          "turnId", "sourceId", "createdAt", "exportedAt"
        ].includes(key))
        .map((key) => flattenTopicValue(value[key], depth + 1))
        .filter(Boolean)
        .join(" ");
    }
    return "";
  }

  function structuredAnalysisText(artifact) {
    if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) return "";
    const canonical = artifact.canonicalAnalysis && typeof artifact.canonicalAnalysis === "object"
      ? artifact.canonicalAnalysis
      : artifact;
    const parts = [
      canonical.theme,
      canonical.mainTension,
      canonical.keyInsight,
      canonical.summary,
      canonical.reflection,
      canonical.fieldConnections,
      canonical.suggestedActions,
      canonical.sortItems,
      canonical.list,
      canonical.path,
      canonical.ahaSer,
      artifact.ahaSer,
      artifact.reflection,
      artifact.day,
      artifact.sortItems,
      artifact.list,
      artifact.path,
      artifact.insightCards
    ];
    return parts.map((value) => flattenTopicValue(value)).filter(Boolean).join(" ");
  }

  function buildSemanticTopicReport(sourceText, artifact) {
    const source = String(sourceText || "").trim();
    const artifactText = structuredAnalysisText(artifact);
    const sourceTop = topTopicTerms(source);
    const artifactTop = topTopicTerms(artifactText);
    const artifactSet = new Set(artifactTop);
    const topOverlap = sourceTop.filter((term) => artifactSet.has(term));
    const anchors = repeatedSourceTerms(source);
    const normalizedArtifact = ` ${normalizeTopicText(artifactText)} `;
    const anchorOverlap = anchors.filter((term) => normalizedArtifact.includes(` ${term} `));
    const sourceWordCount = normalizeTopicText(source).split(" ").filter(Boolean).length;
    const artifactWordCount = normalizeTopicText(artifactText).split(" ").filter(Boolean).length;

    // Fail closed only for a strong signal: a substantial source, a substantial
    // structured analysis, several repeated source anchors, and no shared anchor.
    // This catches stale cross-run payloads without requiring verbatim paraphrases.
    const strongMismatch = sourceWordCount >= 60
      && artifactWordCount >= 20
      && anchors.length >= 3
      && anchorOverlap.length === 0
      && topOverlap.length <= 1;

    return {
      status: strongMismatch ? "invalid_semantic_topic_mismatch" : "valid",
      valid: !strongMismatch,
      reason: strongMismatch ? "no_repeated_source_anchor_in_structured_analysis" : "semantic_topic_overlap_ok",
      sourceTerms: sourceTop,
      outputTerms: artifactTop,
      overlappingTerms: topOverlap,
      sourceAnchorTerms: anchors,
      overlappingAnchorTerms: anchorOverlap,
      sourceWordCount,
      outputWordCount: artifactWordCount
    };
  }

  function readObjectSourceHash(value) {
    const obj = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return normalizeSourceHash(
      obj.sourceTextHash
      || obj.source_text_hash
      || obj.sourceHash
      || obj.source_hash
      || obj.source_binding?.fieldSourceTextHash
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

  function buildSourceBinding(field, sourceTextHash, existingHash, reason, options = {}) {
    const current = normalizeSourceHash(sourceTextHash);
    const fieldHash = normalizeSourceHash(existingHash);
    const hasFieldHash = Boolean(fieldHash);
    const hashesMatch = Boolean(current) && hasFieldHash && fieldHash === current;
    const allowInference = options.allowInference === true;

    return {
      field,
      status: !current
        ? "invalid_missing_current_source_hash"
        : hasFieldHash
          ? (hashesMatch ? "verified" : "invalid_hash_mismatch")
          : allowInference
            ? "inferred_from_auto_output_wrapper"
            : "warning_unverified_binding",
      valid: Boolean(current) && (hasFieldHash ? hashesMatch : allowInference),
      currentSourceTextHash: current || null,
      fieldSourceTextHash: fieldHash || null,
      inferred: !hasFieldHash && Boolean(current) && allowInference,
      reason: reason || "auto_output_render_repair"
    };
  }

  function bindObjectToCurrentSource(value, field, sourceTextHash, options = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const existingHash = readObjectSourceHash(value);
    const binding = buildSourceBinding(field, sourceTextHash, existingHash, options.reason || "auto_output_render_repair", {
      allowInference: options.allowInference === true
    });
    if (!existingHash && binding.inferred === true && binding.currentSourceTextHash) value.sourceTextHash = binding.currentSourceTextHash;
    value.source_binding = Object.assign({}, value.source_binding || {}, binding);
    return value;
  }

  function markSemanticMismatch(value, field, sourceTextHash, report) {
    if (!value || typeof value !== "object" || Array.isArray(value) || !report || report.valid !== false) return value;
    value.source_binding = Object.assign({}, value.source_binding || {}, {
      field,
      status: "invalid_semantic_topic_mismatch",
      valid: false,
      currentSourceTextHash: normalizeSourceHash(sourceTextHash) || null,
      fieldSourceTextHash: readObjectSourceHash(value) || null,
      inferred: false,
      reason: report.reason || "semantic_topic_mismatch",
      semanticTopicReport: report
    });
    return value;
  }

  function bindAutoOutputToSource(autoOutput, options = {}) {
    if (!autoOutput || typeof autoOutput !== "object" || Array.isArray(autoOutput)) return autoOutput;
    const sourceTextHash = resolveAutoOutputSourceHash(autoOutput);
    const sourceText = String(autoOutput.sourceText || autoOutput.payload?.sourceText || "");
    const allowNestedInference = options.allowNestedInference !== false;

    if (sourceTextHash && !autoOutput.sourceTextHash) autoOutput.sourceTextHash = sourceTextHash;
    autoOutput.source_binding = buildSourceBinding("autoOutput", sourceTextHash, autoOutput.sourceTextHash, "auto_output_render_repair", {
      allowInference: true
    });

    const payload = autoOutput.payload && typeof autoOutput.payload === "object" && !Array.isArray(autoOutput.payload)
      ? autoOutput.payload
      : null;
    let semanticReport = null;
    if (payload) {
      bindObjectToCurrentSource(payload, "rawAutoPayload", sourceTextHash, { allowInference: allowNestedInference });
      bindObjectToCurrentSource(payload.canonicalAnalysis, "canonicalAnalysis", sourceTextHash, { allowInference: allowNestedInference });
      bindObjectToCurrentSource(payload.ahaSer, "ahaSer", sourceTextHash, { allowInference: allowNestedInference });

      semanticReport = buildSemanticTopicReport(sourceText, payload);
      if (semanticReport.valid === false) {
        markSemanticMismatch(payload, "rawAutoPayload", sourceTextHash, semanticReport);
        markSemanticMismatch(payload.canonicalAnalysis, "canonicalAnalysis", sourceTextHash, semanticReport);
        markSemanticMismatch(payload.ahaSer, "ahaSer", sourceTextHash, semanticReport);
      }
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
      semanticTopicReport: semanticReport,
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
    // Stored payloads are not allowed to inherit provenance from their wrapper.
    // Only a fresh bindAutoOutputToSource() call may infer nested binding.
    const bound = bindAutoOutputToSource(parsed, { allowNestedInference: false });
    const after = JSON.stringify(bound);
    if (after !== before) storage.setItem(AUTO_OUTPUT_STORAGE_KEY, after);
    return bound;
  }

  function hardenExportBundle(bundle) {
    if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) return bundle;
    const sourceText = String(bundle.sourceText || "");
    const structuredArtifact = {
      canonicalAnalysis: bundle.canonicalAnalysis,
      ahaSer: bundle.ahaSer,
      reflection: bundle.afterwork?.reflection,
      day: bundle.afterwork?.summary,
      sortItems: bundle.afterwork?.sortItems,
      list: bundle.afterwork?.list,
      path: bundle.afterwork?.path
    };
    const semanticReport = buildSemanticTopicReport(sourceText, structuredArtifact);
    if (semanticReport.valid !== false) return bundle;

    bundle.quality = bundle.quality && typeof bundle.quality === "object" ? bundle.quality : {};
    bundle.quality.status = "invalid_topic_mismatch";
    bundle.quality.failClosed = true;
    bundle.quality.topicConsistency = Object.assign({}, bundle.quality.topicConsistency || {}, semanticReport, {
      status: "invalid_semantic_topic_mismatch",
      valid: false,
      checkedAt: "post_export_semantic_guard"
    });
    bundle.quality.warnings = Array.isArray(bundle.quality.warnings) ? bundle.quality.warnings : [];
    if (!bundle.quality.warnings.includes("semantic_topic_mismatch")) bundle.quality.warnings.push("semantic_topic_mismatch");
    bundle.quality.sourceBinding = bundle.quality.sourceBinding && typeof bundle.quality.sourceBinding === "object"
      ? bundle.quality.sourceBinding
      : {};
    bundle.quality.sourceBinding.invalidFields = Array.isArray(bundle.quality.sourceBinding.invalidFields)
      ? bundle.quality.sourceBinding.invalidFields
      : [];
    if (!bundle.quality.sourceBinding.invalidFields.some((item) => item?.field === "topicConsistency")) {
      bundle.quality.sourceBinding.invalidFields.push({
        field: "topicConsistency",
        status: "invalid_semantic_topic_mismatch",
        reason: semanticReport.reason,
        overlappingTerms: semanticReport.overlappingTerms,
        overlappingAnchorTerms: semanticReport.overlappingAnchorTerms
      });
    }
    const contract = global.AHAChatAnalysisRunContract;
    return contract?.finalizeExport ? contract.finalizeExport(bundle) : bundle;
  }

  function installExportIntegrityGuard() {
    const exporter = global.AHAChatExport;
    if (!exporter || typeof exporter.buildAhaAnalysisExportBundle !== "function") return false;
    if (exporter.buildAhaAnalysisExportBundle.__ahaSemanticIntegrityGuard === true) return true;
    const originalBuild = exporter.buildAhaAnalysisExportBundle;
    const guardedBuild = function (...args) {
      return hardenExportBundle(originalBuild.apply(this, args));
    };
    guardedBuild.__ahaSemanticIntegrityGuard = true;
    guardedBuild.__ahaOriginalBuild = originalBuild;
    exporter.buildAhaAnalysisExportBundle = guardedBuild;
    return true;
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
  installExportIntegrityGuard();
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installAutoOutputBindingRepairObserver, { once: true });
    else installAutoOutputBindingRepairObserver();
  }

  global.AHAAutoOutputSourceBinding = Object.assign({}, global.AHAAutoOutputSourceBinding || {}, {
    bindAutoOutputToSource,
    repairStored: repairStoredAutoOutputSourceBinding,
    installObserver: installAutoOutputBindingRepairObserver,
    getLatestAutoOutput,
    buildSemanticTopicReport,
    hardenExportBundle,
    installExportIntegrityGuard
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
