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
