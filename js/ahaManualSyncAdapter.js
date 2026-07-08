// ahaManualSyncAdapter.js
// Planned/no-op manual Sync Hub adapter. Local dry-run metadata only; no backend writes.

(function () {
  "use strict";

  const NOOP_META = Object.freeze({
    mode: "planned_noop",
    local_only: true,
    dry_run_only: true,
    sync_enabled: false,
    echonet_enabled: false,
    backend_enabled: false,
    applied: false,
    canExecute: false,
    canWrite: false,
    writeStatus: "blocked",
    rollbackStatus: "not_available",
    reason: "sync_hub_planned_noop_boundary"
  });

  function cloneArray(value) {
    return Array.isArray(value) ? value.slice() : [];
  }

  function disabledResult(extra) {
    return { ok: false, status: "blocked", ...NOOP_META, ...(extra || {}) };
  }

  function validateAhaManualSyncTarget(target) {
    const source = target && typeof target === "object" ? target : {};
    return disabledResult({
      target: String(source.id || source.target || target || "not_configured"),
      targetStatus: String(source.status || source.targetStatus || "not_configured"),
      missingWriteMethods: [],
      blockers: ["sync_hub_planned_noop", "backend_disabled", "manual_review_required"]
    });
  }

  function getAhaManualSyncAdapterStatus() {
    return disabledResult({
      service: "AHAManualSyncAdapter",
      dryRunAvailable: true,
      historyAvailable: true
    });
  }

  function runAhaManualSyncTargetDryRun(input) {
    return {
      ok: true,
      status: "dry_run_only",
      ...NOOP_META,
      target: input?.target || input?.targetId || "not_configured",
      payloadPreview: input?.payloadPreview || null,
      includedModules: cloneArray(input?.includedModules),
      excludedModules: cloneArray(input?.excludedModules),
      wouldWrite: false,
      wouldCallSyncFromDatabase: false,
      wouldCallRepository: false
    };
  }

  function prepareRun(input) {
    const dryRun = runAhaManualSyncTargetDryRun(input || {});
    return { ...dryRun, ok: false, status: "blocked", blockers: ["sync_hub_planned_noop", "future_contract_required"] };
  }

  async function executeRun(input) {
    return disabledResult({
      attempted: Boolean(input),
      blockers: ["sync_hub_planned_noop", "auto_sync_forbidden", "backend_disabled"],
      auditStatus: "not_written",
      writeCount: 0,
      writes: []
    });
  }

  async function loadAhaManualSyncHistory(options = {}) {
    return {
      ok: true,
      status: "local_dry_run_history_only",
      ...NOOP_META,
      limit: Number(options.limit || 10),
      entries: [],
      total: 0
    };
  }

  const api = {
    getAhaManualSyncAdapterStatus,
    validateAhaManualSyncTarget,
    runAhaManualSyncTargetDryRun,
    dryRunAhaManualSyncTarget: runAhaManualSyncTargetDryRun,
    prepareRun,
    prepareAhaManualSyncRun: prepareRun,
    executeRun,
    executeAhaManualSyncRun: executeRun,
    loadAhaManualSyncHistory
  };

  if (typeof window !== "undefined") window.AHAManualSyncAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
