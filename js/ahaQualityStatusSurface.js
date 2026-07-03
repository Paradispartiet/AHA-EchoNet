// AHA Quality Status Surface V1
// Local, read-only helper for safe quality status surfaces.
(function (global) {
  "use strict";

  const VERSION = "aha_quality_status_surface_v1";
  const SOURCE_SCOPE = "current_conversation_or_analysis";
  const CHECK_NAMES = ["sourceBinding", "topicConsistency", "staleData", "analysisIsolation"];

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function compactStatus(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().toLowerCase();
  }

  function booleanOrNull(value) {
    return typeof value === "boolean" ? value : null;
  }

  function statusMatches(value, words) {
    const status = compactStatus(value);
    if (!status) return false;
    return words.some((word) => status === word || status.indexOf(word) !== -1);
  }

  function pickBoolean() {
    for (let i = 0; i < arguments.length; i += 1) {
      const value = booleanOrNull(arguments[i]);
      if (value !== null) return value;
    }
    return null;
  }

  function checkFromBooleanAndStatus(value, statusValues, passWords, failWords) {
    if (value === true) return "passed";
    if (value === false) return "failed";
    for (let i = 0; i < statusValues.length; i += 1) {
      const status = statusValues[i];
      if (statusMatches(status, failWords)) return "failed";
      if (statusMatches(status, ["warn", "warning", "unverified"])) return "warning";
      if (statusMatches(status, passWords)) return "passed";
    }
    return "unknown";
  }

  function normalizeQualityStatusInput(input) {
    const src = safeObject(input);
    const quality = safeObject(src.quality);
    const sourceBinding = safeObject(src.sourceBinding);
    const qualitySourceBinding = safeObject(quality.sourceBinding);
    const topicConsistency = safeObject(src.topicConsistency);
    const qualityTopicConsistency = safeObject(quality.topicConsistency);
    const staleData = safeObject(src.staleData);
    const qualityStaleData = safeObject(quality.staleData);
    const analysisIsolation = safeObject(src.analysisIsolation);
    const qualityAnalysisIsolation = safeObject(quality.analysisIsolation);
    const snapshotQuality = safeObject(src.snapshotQuality);

    return {
      sourceBinding: {
        sourceBound: pickBoolean(sourceBinding.sourceBound, quality.sourceBound, qualitySourceBinding.sourceBound, snapshotQuality.sourceBound),
        status: sourceBinding.status || qualitySourceBinding.status || quality.status
      },
      topicConsistency: {
        topicConsistent: pickBoolean(topicConsistency.topicConsistent, quality.topicConsistent, qualityTopicConsistency.topicConsistent, snapshotQuality.topicConsistent),
        status: topicConsistency.status || qualityTopicConsistency.status || quality.status
      },
      staleData: {
        staleDataGuarded: pickBoolean(src.staleDataGuarded, staleData.staleDataGuarded, quality.staleDataGuarded, qualityStaleData.staleDataGuarded, snapshotQuality.staleDataGuarded),
        status: staleData.status || qualityStaleData.status || quality.staleDataStatus
      },
      analysisIsolation: {
        isolated: pickBoolean(src.isolated, analysisIsolation.isolated, quality.isolated, qualityAnalysisIsolation.isolated),
        status: analysisIsolation.status || qualityAnalysisIsolation.status || quality.analysisIsolationStatus
      }
    };
  }

  function buildQualityChecks(normalized) {
    const src = safeObject(normalized);
    const sourceBinding = safeObject(src.sourceBinding);
    const topicConsistency = safeObject(src.topicConsistency);
    const staleData = safeObject(src.staleData);
    const analysisIsolation = safeObject(src.analysisIsolation);

    return {
      sourceBinding: {
        status: checkFromBooleanAndStatus(sourceBinding.sourceBound, [sourceBinding.status], ["valid", "verified", "pass", "passed", "ok"], ["failed", "fail", "invalid", "mismatch", "source binding failure", "source_mismatch", "invalid_source_mismatch"]),
        sourceBound: sourceBinding.sourceBound
      },
      topicConsistency: {
        status: checkFromBooleanAndStatus(topicConsistency.topicConsistent, [topicConsistency.status], ["valid", "verified", "pass", "passed", "ok"], ["failed", "fail", "invalid", "mismatch", "invalid_topic_mismatch"]),
        topicConsistent: topicConsistency.topicConsistent
      },
      staleData: {
        status: checkFromBooleanAndStatus(staleData.staleDataGuarded, [staleData.status], ["valid", "verified", "pass", "passed", "ok", "guarded"], ["failed", "fail", "stale", "invalid"]),
        staleDataGuarded: staleData.staleDataGuarded
      },
      analysisIsolation: {
        status: checkFromBooleanAndStatus(analysisIsolation.isolated, [analysisIsolation.status], ["valid", "verified", "pass", "passed", "ok", "isolated"], ["failed", "fail", "leak", "contaminated", "stale"]),
        isolated: analysisIsolation.isolated
      }
    };
  }

  function deriveOverallQualityStatus(checks) {
    const src = safeObject(checks);
    const statuses = CHECK_NAMES.map((name) => compactStatus(safeObject(src[name]).status) || "unknown");
    if (statuses.some((status) => status === "failed")) return "blocked";
    if (statuses.some((status) => status === "warning")) return "warning";
    if (statuses.every((status) => status === "unknown")) return "unknown";
    if (statuses.some((status) => status === "unknown")) return "warning";
    if (statuses.every((status) => status === "passed")) return "ok";
    return "unknown";
  }

  function buildQualitySafeSummary(status, checks) {
    const src = safeObject(checks);
    const lines = [];
    function addFor(name, failedLine, unknownLine, warningLine) {
      const checkStatus = compactStatus(safeObject(src[name]).status) || "unknown";
      if (checkStatus === "failed") lines.push(failedLine);
      else if (checkStatus === "warning") lines.push(warningLine || unknownLine);
      else if (checkStatus === "unknown") lines.push(unknownLine);
    }

    addFor("sourceBinding", "Kildebinding mangler eller feiler.", "Kildebinding er ukjent.", "Kildebinding er ikke sikkert verifisert.");
    addFor("topicConsistency", "Tema-konsistens feiler.", "Tema-konsistens er ukjent.", "Tema-konsistens trenger kontroll.");
    addFor("staleData", "Stale-data guard feiler.", "Stale-data guard er ukjent.", "Stale-data guard trenger kontroll.");
    addFor("analysisIsolation", "Analyse-isolering feiler.", "Analyse-isolering er ukjent.", "Analyse-isolering trenger kontroll.");

    if (status === "ok") lines.push("Alle tilgjengelige quality checks passerer.");
    if (status === "unknown" && lines.length === CHECK_NAMES.length) {
      return { headline: "Quality status er ukjent.", lines: ["Quality status er ukjent fordi ingen quality checks er tilgjengelige ennå."] };
    }
    return { headline: status === "blocked" ? "Quality status er blokkert." : status === "warning" ? "Quality status trenger kontroll." : status === "ok" ? "Quality status er ok." : "Quality status er ukjent.", lines };
  }

  function buildQualityStatusSafety() {
    return {
      rawUserTextIncluded: false,
      privateUrlsIncluded: false,
      userIdentifiersIncluded: false,
      ["approval" + "ActionAvailable"]: false,
      syncAvailable: false,
      echoNetAvailable: false
    };
  }

  function buildQualityStatusSurface(input) {
    const normalized = normalizeQualityStatusInput(input);
    const checks = buildQualityChecks(normalized);
    const status = deriveOverallQualityStatus(checks);
    return {
      version: VERSION,
      localOnly: true,
      readOnly: true,
      noSync: true,
      sourceScope: SOURCE_SCOPE,
      status,
      checks,
      safeSummary: buildQualitySafeSummary(status, checks),
      safety: buildQualityStatusSafety()
    };
  }

  global.AHAQualityStatusSurface = {
    buildQualityStatusSurface,
    normalizeQualityStatusInput,
    buildQualityChecks,
    deriveOverallQualityStatus,
    buildQualitySafeSummary,
    buildQualityStatusSafety
  };
})(typeof window !== "undefined" ? window : globalThis);
