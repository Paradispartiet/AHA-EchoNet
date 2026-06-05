// ahaManualSyncAdapter.js

(function () {
  "use strict";

  const DISABLED_REASON = "Manual sync execution is disabled in state machine stub.";
  const DISABLED_WRITE_STATUS = "disabled_stub_only";

  function getStateMachine() {
    if (typeof window !== "undefined" && window.AHAManualSyncStateMachine) return window.AHAManualSyncStateMachine;
    if (typeof globalThis !== "undefined" && globalThis.AHAManualSyncStateMachine) return globalThis.AHAManualSyncStateMachine;
    return null;
  }

  function fallbackRunState(input) {
    const source = input && typeof input === "object" ? input : {};
    return {
      runId: source.runId || `aha-manual-sync-adapter-stub-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`,
      currentState: "blocked",
      previousState: "not_started",
      reason: "Manual sync execution is not implemented.",
      target: typeof source.target === "string" ? source.target : source.target?.id || "not_configured",
      readinessStatus: source.readinessStatus || "blocked",
      validationStatus: source.validationStatus || "blocked",
      checklistStatus: source.checklistStatus || "blocked",
      payloadStatus: source.payloadStatus || "preview_only",
      warnings: Array.isArray(source.warnings) ? source.warnings.slice() : [],
      errors: Array.isArray(source.errors) ? source.errors.slice() : [],
      canExecute: false,
      canWrite: false,
      isStub: true,
      writeStatus: DISABLED_WRITE_STATUS,
      createdAt: source.createdAt || new Date().toISOString()
    };
  }


  const DRY_RUN_WRITE_STATUS = "disabled_dry_run_only";
  const DRY_RUN_ROLLBACK_STATUS = "not_available_dry_run_only";
  const FUTURE_ONLY_TARGETS = Object.freeze([
    "aha_repository_future",
    "database_api_future",
    "custom_sync_backend_future"
  ]);

  function cloneList(value) {
    return Array.isArray(value) ? value.filter(Boolean).slice() : [];
  }

  function normalizeTargetDetails(target) {
    const source = target && typeof target === "object" ? target : {};
    const id = typeof target === "string"
      ? target
      : source.id || source.target || source.targetId || source.value || "not_configured";
    const normalizedId = String(id || "not_configured").trim() || "not_configured";
    let targetStatus = String(source.targetStatus || source.status || "").trim();

    if (!targetStatus) {
      if (normalizedId === "not_configured") targetStatus = "not_configured";
      else if (FUTURE_ONLY_TARGETS.includes(normalizedId)) targetStatus = "future_only";
      else targetStatus = "preview_only";
    }

    return { id: normalizedId, targetStatus };
  }

  function countValidationErrors(validation, fallbackErrors) {
    const source = validation && typeof validation === "object" ? validation : {};
    if (Array.isArray(source.errors)) return source.errors.length;
    if (Number.isFinite(Number(source.errorCount))) return Number(source.errorCount);
    if (Number.isFinite(Number(source.errorsCount))) return Number(source.errorsCount);
    const validationStatus = String(source.status || validation || "").toLowerCase();
    if (validationStatus.includes("error") || validationStatus.includes("invalid")) return 1;
    return cloneList(fallbackErrors).length;
  }

  function summarizeValidation(validation, fallbackErrors) {
    const source = validation && typeof validation === "object" ? validation : {};
    const errorCount = countValidationErrors(validation, fallbackErrors);
    return {
      status: String(source.status || (errorCount > 0 ? "invalid" : "valid_preview")),
      validCount: Number(source.validCount || source.modulesReady || 0),
      warningCount: Number(source.warningCount || source.warningsCount || cloneList(source.warnings).length || 0),
      errorCount
    };
  }

  function summarizeChecklist(checklist, checklistSummary) {
    const source = checklistSummary && typeof checklistSummary === "object"
      ? checklistSummary
      : checklist && typeof checklist === "object" && checklist.summary && typeof checklist.summary === "object"
        ? checklist.summary
        : checklist && typeof checklist === "object"
          ? checklist
          : {};
    const items = Array.isArray(checklist?.items) ? checklist.items : [];
    const blockedFromItems = items.filter((item) => item?.status === "blocked").length;
    return {
      passedCount: Number(source.passedCount || source.passed || 0),
      warningCount: Number(source.warningCount || source.warning || 0),
      blockedCount: Number(source.blockedCount || source.blocked || blockedFromItems || 0)
    };
  }

  function normalizeReadinessStatus(readiness, readinessStatus) {
    const source = readiness && typeof readiness === "object" ? readiness : {};
    return String(source.status || readinessStatus || readiness || "blocked").trim() || "blocked";
  }

  function summarizePayloadPreview(payloadPreview) {
    const source = payloadPreview && typeof payloadPreview === "object" ? payloadPreview : {};
    const modules = Array.isArray(source.modules) ? source.modules : [];
    const includedFromModules = modules.filter((modulePreview) => modulePreview?.included === true);
    const excludedFromModules = modules.filter((modulePreview) => modulePreview?.included !== true);
    const includedModules = cloneList(source.includedModules).length
      ? cloneList(source.includedModules)
      : includedFromModules.map((modulePreview) => modulePreview.id || modulePreview.name).filter(Boolean);
    const excludedModules = cloneList(source.excludedModules).length
      ? cloneList(source.excludedModules)
      : excludedFromModules.map((modulePreview) => modulePreview.id || modulePreview.name).filter(Boolean);
    const itemCounts = modules.reduce((counts, modulePreview) => {
      const key = modulePreview?.id || modulePreview?.name;
      if (key) counts[key] = Number(modulePreview.itemCount || modulePreview.count || 0);
      return counts;
    }, { ...(source.itemCounts || {}) });
    const totalItems = Number(source.totalItems || source.totalPreviewItems || Object.keys(itemCounts).reduce((total, key) => total + Number(itemCounts[key] || 0), 0));
    const modulesIncluded = Number(source.modulesIncluded ?? includedModules.length ?? includedFromModules.length ?? 0);

    return { includedModules, excludedModules, itemCounts, totalItems, modulesIncluded };
  }

  function summarizeAuditPreview(auditPreview) {
    const source = auditPreview && typeof auditPreview === "object" ? auditPreview : {};
    return {
      status: source.status || source.auditStatus || "preview_only",
      writeStatus: source.writeStatus || "disabled_preview_only",
      rollbackStatus: source.rollbackStatus || "not_available_preview_only",
      warningCount: cloneList(source.warnings).length
    };
  }

  function normalizeStateMachineState(stateMachineStatus) {
    const source = stateMachineStatus && typeof stateMachineStatus === "object" ? stateMachineStatus : {};
    return {
      currentState: source.currentState || source.state || "blocked",
      canExecute: source.canExecute === true,
      canWrite: source.canWrite === true,
      writeStatus: source.writeStatus || DISABLED_WRITE_STATUS
    };
  }

  function getAdapterCanExecute(input) {
    if (input?.adapterStatus && typeof input.adapterStatus === "object") return input.adapterStatus.canExecute === true;
    if (input?.adapter && typeof input.adapter === "object") return input.adapter.canExecute === true;
    if (Object.prototype.hasOwnProperty.call(input || {}, "adapterCanExecute")) return input.adapterCanExecute === true;
    return false;
  }

  function runAhaManualSyncTargetDryRun(input) {
    const source = input && typeof input === "object" ? input : {};
    const target = normalizeTargetDetails(source.target);
    const payloadSummary = summarizePayloadPreview(source.payloadPreview || source.payload);
    const validationSummary = summarizeValidation(source.validationSummary || source.validation || source.validationStatus, source.errors);
    const readinessStatus = normalizeReadinessStatus(source.readiness, source.readinessStatus);
    const checklistSummary = summarizeChecklist(source.checklist, source.checklistSummary);
    const auditPreviewSummary = summarizeAuditPreview(source.auditPreview);
    const stateMachineState = normalizeStateMachineState(source.stateMachineStatus || source.stateMachine);
    const blockers = [];
    const warnings = [];
    const errors = cloneList(source.errors);
    const adapterCanExecute = getAdapterCanExecute(source);

    if (!source.target || target.id === "not_configured") blockers.push("No manual sync target is configured.");
    if (target.targetStatus === "not_configured") blockers.push("Target status is not_configured.");
    if (target.targetStatus === "future_only" || target.targetStatus === "preview_only") blockers.push("Selected target is preview-only/future-only and cannot execute.");
    if (validationSummary.errorCount > 0) blockers.push("Validation has errors.");
    if (readinessStatus === "blocked") blockers.push("Readiness is blocked.");
    if (checklistSummary.blockedCount > 0) blockers.push("Operator checklist has blocked items.");
    if (payloadSummary.modulesIncluded === 0 || payloadSummary.includedModules.length === 0) blockers.push("Payload preview has 0 included modules.");
    if (!adapterCanExecute) blockers.push("Adapter canExecute is false.");
    if (!stateMachineState.canExecute) blockers.push("State machine canExecute is false.");

    if (readinessStatus === "warning") warnings.push("Readiness has warnings.");
    if (validationSummary.warningCount > 0) warnings.push("Validation has warnings.");
    if (checklistSummary.warningCount > 0) warnings.push("Operator checklist has warnings.");
    if (auditPreviewSummary.warningCount > 0) warnings.push("Audit preview has warnings.");

    const status = blockers.length ? (validationSummary.errorCount > 0 ? "invalid" : "blocked") : "preview_only";

    return {
      ok: false,
      mode: "dry_run",
      status,
      target: target.id,
      targetStatus: target.targetStatus,
      canExecute: false,
      canWrite: false,
      wouldExecute: false,
      wouldWrite: false,
      includedModules: payloadSummary.includedModules,
      excludedModules: payloadSummary.excludedModules,
      itemCounts: payloadSummary.itemCounts,
      totalItems: payloadSummary.totalItems,
      validationSummary,
      readinessStatus,
      checklistSummary,
      auditPreviewSummary,
      stateMachineState: stateMachineState.currentState,
      blockers: [...new Set(blockers)],
      warnings: [...new Set(warnings)],
      errors,
      message: blockers.length
        ? "Target adapter dry-run is blocked. No execution or write is available."
        : "Target adapter dry-run preview only. Execution and writes remain disabled.",
      writeStatus: DRY_RUN_WRITE_STATUS,
      rollbackStatus: DRY_RUN_ROLLBACK_STATUS
    };
  }

  function getAhaManualSyncAdapterStatus() {
    const stateMachine = getStateMachine();
    const stateMachineStatus = stateMachine?.getAhaManualSyncStateMachineStatus
      ? stateMachine.getAhaManualSyncStateMachineStatus()
      : {
          currentState: "blocked",
          previousState: "not_started",
          reason: "Manual sync execution is not implemented.",
          canExecute: false,
          canWrite: false,
          isStub: true,
          writeStatus: DISABLED_WRITE_STATUS
        };

    return {
      adapterStatus: "disabled_stub_only",
      target: "not_configured",
      targetStatus: "not_configured",
      canPrepare: true,
      canExecute: false,
      canWrite: false,
      isStub: true,
      reason: DISABLED_REASON,
      writeStatus: DISABLED_WRITE_STATUS,
      stateMachineStatus
    };
  }

  function validateAhaManualSyncTarget(target) {
    const normalizedTarget = typeof target === "string"
      ? target
      : target?.id || target?.target || target?.status || "not_configured";

    return {
      ok: false,
      status: "blocked",
      target: normalizedTarget || "not_configured",
      targetStatus: normalizedTarget || "not_configured",
      canExecute: false,
      canWrite: false,
      isStub: true,
      reason: DISABLED_REASON,
      writeStatus: DISABLED_WRITE_STATUS
    };
  }

  function prepareRun(input) {
    const stateMachine = getStateMachine();
    const runState = stateMachine?.createAhaManualSyncRunState
      ? stateMachine.createAhaManualSyncRunState(input)
      : fallbackRunState(input);

    return {
      ok: false,
      status: "blocked_preview_disabled",
      canExecute: false,
      canWrite: false,
      isStub: true,
      reason: DISABLED_REASON,
      writeStatus: DISABLED_WRITE_STATUS,
      targetValidation: validateAhaManualSyncTarget(input?.target),
      dryRunResult: runAhaManualSyncTargetDryRun({
        ...input,
        adapterStatus: getAhaManualSyncAdapterStatus(),
        stateMachineStatus: runState
      }),
      runState,
      stateMachineStatus: getAhaManualSyncAdapterStatus().stateMachineStatus
    };
  }

  function executeRun(input) {
    const prepared = prepareRun(input);
    return {
      ok: false,
      status: "blocked",
      canExecute: false,
      canWrite: false,
      isStub: true,
      reason: DISABLED_REASON,
      writeStatus: DISABLED_WRITE_STATUS,
      runState: {
        ...prepared.runState,
        currentState: "blocked",
        previousState: prepared.runState.previousState || "not_started",
        reason: DISABLED_REASON,
        errors: [...(prepared.runState.errors || []), DISABLED_REASON],
        canExecute: false,
        canWrite: false,
        isStub: true,
        writeStatus: DISABLED_WRITE_STATUS
      },
      stateMachineStatus: prepared.stateMachineStatus
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
    executeAhaManualSyncRun: executeRun
  };

  if (typeof window !== "undefined") {
    window.AHAManualSyncAdapter = api;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
