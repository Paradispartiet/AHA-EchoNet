// ahaManualSyncHistory.js
// Read-only helpers for sanitized manual sync history and retry eligibility previews.

(function (global) {
  "use strict";

  const SAFE_STATUS_VALUES = new Set(["success", "failed", "blocked", "partial_success"]);
  const SECURITY_PATTERN = /(redact(?:ed|ion)?|security|secret|token|password|credential|connection[ _-]?string|api[ _-]?key)/i;
  const UNRESOLVED_ROLLBACK_STATUSES = new Set(["pending", "required", "failed", "unknown", "partial", "incomplete"]);

  function objectValue(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function safeString(value, fallback = "") {
    if (typeof value !== "string" && typeof value !== "number") return fallback;
    const text = String(value).trim();
    if (!text) return fallback;
    return text
      .replace(/((?:secret|token|password|credential|api[ _-]?key)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
      .replace(/((?:connection[ _-]?string)\s*[:=]\s*)[^\n]+/gi, "$1[redacted]")
      .slice(0, 500);
  }

  function safeStringList(value) {
    return Array.isArray(value) ? value.map((entry) => safeString(entry)).filter(Boolean).slice(0, 50) : [];
  }

  function safeModuleList(value) {
    return safeStringList(value).map((entry) => entry.toLowerCase().replace(/[^a-z0-9_-]/g, "")).filter(Boolean);
  }

  function safeItemCounts(value) {
    const counts = {};
    const source = objectValue(value);
    Object.keys(source).slice(0, 50).forEach((key) => {
      const safeKey = safeString(key).toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const count = Number(source[key]);
      if (safeKey && Number.isFinite(count) && count >= 0) counts[safeKey] = count;
    });
    return counts;
  }

  function hasSecurityWarning(source) {
    const audit = objectValue(source?.meta || source);
    if (audit.securityWarning === true) return true;
    const messages = []
      .concat(Array.isArray(audit.warnings) ? audit.warnings : [])
      .concat(Array.isArray(audit.errors) ? audit.errors : []);
    if (messages.some((message) => SECURITY_PATTERN.test(String(message)))) return true;
    return Object.keys(audit).some((key) => SECURITY_PATTERN.test(key) && !["warnings", "errors", "securityWarning"].includes(key));
  }

  function sanitizeAhaManualSyncHistoryDetails(source) {
    const event = objectValue(source);
    const audit = objectValue(event.meta || event);
    const payloadSummaryPresent = audit.payloadSummaryPresent === true || (Object.prototype.hasOwnProperty.call(audit, "payloadSummary")
      && audit.payloadSummary && typeof audit.payloadSummary === "object" && !Array.isArray(audit.payloadSummary));
    const payloadSummary = objectValue(audit.payloadSummary);
    const validationSummary = objectValue(audit.validationSummary);
    const includedModules = safeModuleList(audit.includedModules?.length ? audit.includedModules : payloadSummary.includedModules);
    const itemCounts = safeItemCounts(Object.keys(objectValue(audit.itemCounts)).length ? audit.itemCounts : payloadSummary.itemCounts);
    const totalItemsValue = audit.totalItems ?? payloadSummary.totalItems;
    const totalItems = Number.isFinite(Number(totalItemsValue)) && Number(totalItemsValue) >= 0 ? Number(totalItemsValue) : 0;
    const securityWarning = hasSecurityWarning(source);
    const resultStatus = safeString(audit.resultStatus || "unknown").toLowerCase();

    return {
      runId: safeString(audit.runId),
      timestamp: safeString(audit.timestamp || event.created_at),
      trigger: audit.trigger === "manual" ? "manual" : "manual",
      target: safeString(audit.target),
      targetStatus: safeString(audit.targetStatus || "unknown").toLowerCase(),
      resultStatus: SAFE_STATUS_VALUES.has(resultStatus) ? resultStatus : "unknown",
      writeStatus: safeString(audit.writeStatus || "unknown").toLowerCase(),
      rollbackStatus: safeString(audit.rollbackStatus || "unknown").toLowerCase(),
      readinessStatus: safeString(audit.readinessStatus || "unknown").toLowerCase(),
      includedModules,
      excludedModules: safeModuleList(audit.excludedModules?.length ? audit.excludedModules : payloadSummary.excludedModules),
      itemCounts,
      totalItems,
      validationSummary: {
        status: safeString(validationSummary.status || "unknown").toLowerCase(),
        errorCount: Math.max(0, Number(validationSummary.errorCount || 0)),
        warningCount: Math.max(0, Number(validationSummary.warningCount || 0))
      },
      payloadSummaryPresent: Boolean(payloadSummaryPresent),
      warnings: securityWarning ? ["Security or redaction warning recorded; sensitive details are hidden."] : safeStringList(audit.warnings),
      errors: securityWarning ? ["Sensitive audit details are hidden."] : safeStringList(audit.errors),
      securityWarning
    };
  }

  function buildAhaManualSyncRetryEligibilityPreview(sanitizedRun) {
    const run = sanitizeAhaManualSyncHistoryDetails(sanitizedRun);
    const blockers = [];
    const warnings = [...run.warnings];
    const requiredBeforeRetry = [];
    let status = "blocked";
    let reason = "This run does not currently have enough safe metadata for a retry preview.";

    if (run.resultStatus === "success") {
      return {
        retryEligible: false,
        status: "not_eligible",
        reason: "Retry not applicable for successful run.",
        blockers: [],
        warnings,
        retryMode: "preview_only",
        target: run.target || null,
        targetStatus: run.targetStatus,
        originalRunId: run.runId || null,
        modules: run.includedModules,
        itemCounts: run.itemCounts,
        requiredBeforeRetry: []
      };
    }

    if (!run.runId) {
      blockers.push("Audit entry is missing runId.");
      requiredBeforeRetry.push("Restore a valid original runId in the audit metadata.");
    }
    if (!run.payloadSummaryPresent) {
      blockers.push("Audit entry is missing payloadSummary.");
      requiredBeforeRetry.push("Restore a sanitized payload summary for the original run.");
      status = "unknown";
    }
    if (run.securityWarning) {
      blockers.push("Run contains a security or redaction warning.");
      requiredBeforeRetry.push("Resolve the security/redaction warning without exposing secrets or full payloads.");
    }
    if (run.validationSummary.errorCount > 0) {
      blockers.push("Original run has validation errors.");
      requiredBeforeRetry.push("Resolve all validation errors before a future retry.");
    }
    if (!run.target) {
      blockers.push("Original run is missing a target.");
      requiredBeforeRetry.push("Select and validate an approved manual sync target.");
    } else if (run.target === "not_configured" || run.targetStatus === "not_configured") {
      blockers.push("Original target is not configured.");
      requiredBeforeRetry.push("Configure the approved target before a future retry.");
    }
    if (!run.includedModules.length) {
      blockers.push("Original run has no included modules.");
      requiredBeforeRetry.push("Choose at least one valid module before a future retry.");
    }
    if (run.totalItems <= 0) {
      blockers.push("Original run has no items to retry.");
      requiredBeforeRetry.push("Build a non-empty sanitized payload summary before a future retry.");
    }
    if (UNRESOLVED_ROLLBACK_STATUSES.has(run.rollbackStatus)) {
      blockers.push("Rollback or partial failure status is unresolved.");
      requiredBeforeRetry.push("Resolve rollback/partial failure state before a future retry.");
    }
    if (run.resultStatus === "blocked" && run.validationSummary.errorCount === 0) {
      blockers.push("Original run was blocked.");
      requiredBeforeRetry.push("Resolve the original run blockers before a future retry.");
    }
    if (!["failed", "partial_success", "blocked"].includes(run.resultStatus)) {
      blockers.push("Original result status is unknown or not retryable.");
      requiredBeforeRetry.push("Restore a supported failed or partial_success result status.");
      if (status !== "unknown") status = "unknown";
    }

    if (blockers.length) {
      reason = blockers[0];
      return {
        retryEligible: false,
        status,
        reason,
        blockers: [...new Set(blockers)],
        warnings: [...new Set(warnings)],
        retryMode: "preview_only",
        target: run.target || null,
        targetStatus: run.targetStatus,
        originalRunId: run.runId || null,
        modules: run.includedModules,
        itemCounts: run.itemCounts,
        requiredBeforeRetry: [...new Set(requiredBeforeRetry)]
      };
    }

    if (["failed", "partial_success"].includes(run.resultStatus)) {
      status = "eligible_preview";
      reason = "The sanitized audit metadata meets the current preview rules for a possible future retry.";
      warnings.push("Retry is not implemented yet. This is an eligibility preview only.");
      return {
        retryEligible: true,
        status,
        reason,
        blockers: [],
        warnings: [...new Set(warnings)],
        retryMode: "preview_only",
        target: run.target,
        targetStatus: run.targetStatus,
        originalRunId: run.runId,
        modules: run.includedModules,
        itemCounts: run.itemCounts,
        requiredBeforeRetry: ["Revalidate target, modules, item counts, and confirmation gates when retry is implemented."]
      };
    }

    return {
      retryEligible: false,
      status: "not_eligible",
      reason: "Retry is not applicable for this run.",
      blockers: [],
      warnings: [...new Set(warnings)],
      retryMode: "preview_only",
      target: run.target || null,
      targetStatus: run.targetStatus,
      originalRunId: run.runId || null,
      modules: run.includedModules,
      itemCounts: run.itemCounts,
      requiredBeforeRetry: []
    };
  }

  global.AHAManualSyncHistory = Object.freeze({
    sanitizeAhaManualSyncHistoryDetails,
    buildAhaManualSyncRetryEligibilityPreview
  });
})(typeof window !== "undefined" ? window : globalThis);
