// ahaManualSyncStateMachine.js

(function () {
  "use strict";

  const BLOCKED_REASON = "Manual sync gates are not passed.";
  const READY_REASON = "Manual sync remains planned/no-op; execution is disabled until explicit future contract.";
  const WRITE_STATUS_READY = "planned_noop_blocked";
  const WRITE_STATUS_BLOCKED = "blocked";

  const AHA_MANUAL_SYNC_STATES = Object.freeze({
    NOT_STARTED: "not_started",
    BLOCKED: "blocked",
    CONFIRMED: "confirmed",
    RUNNING: "running",
    PARTIAL_SUCCESS: "partial_success",
    SUCCESS: "success",
    FAILED: "failed",
    ROLLED_BACK: "rolled_back"
  });

  const AHA_MANUAL_SYNC_ALLOWED_TRANSITIONS = Object.freeze({
    [AHA_MANUAL_SYNC_STATES.NOT_STARTED]: Object.freeze([AHA_MANUAL_SYNC_STATES.BLOCKED]),
    [AHA_MANUAL_SYNC_STATES.BLOCKED]: Object.freeze([AHA_MANUAL_SYNC_STATES.CONFIRMED]),
    [AHA_MANUAL_SYNC_STATES.CONFIRMED]: Object.freeze([AHA_MANUAL_SYNC_STATES.RUNNING]),
    [AHA_MANUAL_SYNC_STATES.RUNNING]: Object.freeze([AHA_MANUAL_SYNC_STATES.SUCCESS, AHA_MANUAL_SYNC_STATES.FAILED]),
    [AHA_MANUAL_SYNC_STATES.FAILED]: Object.freeze([AHA_MANUAL_SYNC_STATES.ROLLED_BACK])
  });

  function values(object) {
    return Object.keys(object).map((key) => object[key]);
  }

  function cloneArray(value) {
    return Array.isArray(value) ? value.slice() : [];
  }

  function normalizeStatus(value, fallback) {
    const text = String(value || "").trim();
    return text || fallback;
  }

  function normalizeTarget(target) {
    if (!target) return "not_configured";
    if (typeof target === "string") return normalizeStatus(target, "not_configured");
    return normalizeStatus(target.id || target.target || target.targetId || target.status, "not_configured");
  }

  function createRunId(now) {
    const timestamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    return `aha-manual-sync-${timestamp}`;
  }

  function normalizeChecklistBlockedCount(source) {
    if (Number.isFinite(Number(source.checklistBlockedCount))) return Number(source.checklistBlockedCount);
    if (Number.isFinite(Number(source.checklist?.summary?.blocked))) return Number(source.checklist.summary.blocked);
    if (Number.isFinite(Number(source.checklist?.summary?.blockedCount))) return Number(source.checklist.summary.blockedCount);
    if (Number.isFinite(Number(source.checklistSummary?.blockedCount))) return Number(source.checklistSummary.blockedCount);
    if (Array.isArray(source.checklist?.items)) return source.checklist.items.filter((item) => item?.status === "blocked").length;
    return normalizeStatus(source.checklistStatus || source.checklist, "blocked") === "blocked" ? 1 : 0;
  }

  function normalizeValidationErrorCount(source) {
    if (Number.isFinite(Number(source.validationErrorCount))) return Number(source.validationErrorCount);
    if (Array.isArray(source.validation?.errors)) return source.validation.errors.length;
    if (Number.isFinite(Number(source.validation?.errorCount))) return Number(source.validation.errorCount);
    if (Number.isFinite(Number(source.validation?.errorsCount))) return Number(source.validation.errorsCount);
    const status = normalizeStatus(source.validationStatus || source.validation?.status || source.validation, "blocked").toLowerCase();
    return status.includes("error") || status.includes("invalid") || status === "blocked" ? 1 : 0;
  }

  function normalizeIncludedModuleCount(source) {
    if (Number.isFinite(Number(source.includedModuleCount))) return Number(source.includedModuleCount);
    if (Number.isFinite(Number(source.payloadPreview?.modulesIncluded))) return Number(source.payloadPreview.modulesIncluded);
    if (Array.isArray(source.payloadPreview?.includedModules)) return source.payloadPreview.includedModules.length;
    if (Array.isArray(source.payloadPreview?.modules)) return source.payloadPreview.modules.filter((modulePreview) => modulePreview?.included === true).length;
    return normalizeStatus(source.payloadStatus || source.payload, "preview_only").includes("ready") ? 1 : 0;
  }

  function getGateBlockers(source) {
    const blockers = [];
    const target = normalizeTarget(source.target);
    const targetStatus = normalizeStatus(source.targetStatus || source.target?.targetStatus || source.target?.status, target === "database_existing" ? "configured" : "not_configured");
    const readinessStatus = normalizeStatus(source.readinessStatus || source.readiness?.status || source.readiness, "blocked");
    const validationErrorCount = normalizeValidationErrorCount(source);
    const checklistBlockedCount = normalizeChecklistBlockedCount(source);
    const includedModuleCount = normalizeIncludedModuleCount(source);

    if (target !== "database_existing" || targetStatus !== "configured") blockers.push("Target is not configured.");
    if (readinessStatus !== "ready") blockers.push("Readiness is not ready.");
    if (validationErrorCount > 0) blockers.push("Validation has errors.");
    if (checklistBlockedCount > 0) blockers.push("Operator checklist has blocked items.");
    if (includedModuleCount === 0) blockers.push("Payload preview has 0 included modules.");

    return blockers;
  }

  function createAhaManualSyncRunState(input) {
    const source = input && typeof input === "object" ? input : {};
    const now = new Date();
    const blockers = getGateBlockers(source);
    const canExecute = blockers.length === 0;
    const currentState = canExecute ? AHA_MANUAL_SYNC_STATES.BLOCKED : AHA_MANUAL_SYNC_STATES.BLOCKED;

    return {
      runId: source.runId || createRunId(now),
      currentState,
      previousState: source.previousState || AHA_MANUAL_SYNC_STATES.NOT_STARTED,
      reason: canExecute ? READY_REASON : blockers[0] || BLOCKED_REASON,
      target: normalizeTarget(source.target),
      targetStatus: normalizeStatus(source.targetStatus || source.target?.targetStatus || source.target?.status, "not_configured"),
      readinessStatus: normalizeStatus(source.readinessStatus || source.readiness?.status || source.readiness, "blocked"),
      validationStatus: normalizeStatus(source.validationStatus || source.validation?.status || source.validation, canExecute ? "valid" : "blocked"),
      checklistStatus: normalizeStatus(source.checklistStatus || source.checklist?.status || source.checklist, canExecute ? "ready" : "blocked"),
      payloadStatus: normalizeStatus(source.payloadStatus || source.payload?.status || source.payloadPreview?.status || source.payload, canExecute ? "ready" : "preview_only"),
      warnings: cloneArray(source.warnings),
      errors: cloneArray(source.errors).concat(blockers),
      blockers,
      canExecute: false,
      canWrite: false,
      isStub: false,
      writeStatus: WRITE_STATUS_BLOCKED,
      rollbackStatus: "not_available",
      createdAt: source.createdAt || now.toISOString()
    };
  }

  function getAhaManualSyncStateMachineStatus() {
    return {
      currentState: AHA_MANUAL_SYNC_STATES.BLOCKED,
      previousState: AHA_MANUAL_SYNC_STATES.NOT_STARTED,
      reason: READY_REASON,
      canExecute: false,
      canWrite: false,
      isStub: false,
      writeStatus: WRITE_STATUS_BLOCKED,
      rollbackStatus: "not_available",
      states: values(AHA_MANUAL_SYNC_STATES),
      allowedTransitions: Object.keys(AHA_MANUAL_SYNC_ALLOWED_TRANSITIONS).reduce((copy, state) => {
        copy[state] = AHA_MANUAL_SYNC_ALLOWED_TRANSITIONS[state].slice();
        return copy;
      }, {}),
      allowedPreviewTransitions: Object.keys(AHA_MANUAL_SYNC_ALLOWED_TRANSITIONS).reduce((copy, state) => {
        copy[state] = AHA_MANUAL_SYNC_ALLOWED_TRANSITIONS[state].slice();
        return copy;
      }, {}),
      disabledExecutionStates: values(AHA_MANUAL_SYNC_STATES),
      blockedTransitionReason: BLOCKED_REASON
    };
  }

  function isKnownState(state) {
    return values(AHA_MANUAL_SYNC_STATES).includes(state);
  }

  function canTransitionAhaManualSyncState(state, nextState, options = {}) {
    const source = state && typeof state === "object" ? state : { currentState: state };
    const currentState = typeof state === "string" ? state : source.currentState;
    const normalizedCurrent = isKnownState(currentState) ? currentState : AHA_MANUAL_SYNC_STATES.BLOCKED;
    const normalizedNext = isKnownState(nextState) ? nextState : "";

    if (!normalizedNext) {
      return { allowed: false, reason: "Unknown manual sync state.", currentState: normalizedCurrent, nextState };
    }

    const allowedByGraph = (AHA_MANUAL_SYNC_ALLOWED_TRANSITIONS[normalizedCurrent] || []).includes(normalizedNext);
    if (!allowedByGraph) {
      return { allowed: false, reason: "Manual sync state transition is not allowed.", currentState: normalizedCurrent, nextState: normalizedNext };
    }

    if (normalizedCurrent === AHA_MANUAL_SYNC_STATES.BLOCKED && normalizedNext === AHA_MANUAL_SYNC_STATES.CONFIRMED) {
      const blockers = getGateBlockers({ ...source, ...options });
      return {
        allowed: false,
        reason: "Manual sync is planned/no-op; future activation requires an explicit contract.",
        currentState: normalizedCurrent,
        nextState: normalizedNext,
        blockers: blockers.concat("sync_hub_planned_noop")
      };
    }

    if (normalizedCurrent === AHA_MANUAL_SYNC_STATES.CONFIRMED && normalizedNext === AHA_MANUAL_SYNC_STATES.RUNNING) {
      if (options.explicitConfirmation !== true && source.explicitConfirmation !== true) {
        return { allowed: false, reason: "Explicit manual confirmation is required.", currentState: normalizedCurrent, nextState: normalizedNext };
      }
    }

    if (normalizedCurrent === AHA_MANUAL_SYNC_STATES.FAILED && normalizedNext === AHA_MANUAL_SYNC_STATES.ROLLED_BACK) {
      if (options.rollbackAvailable !== true && source.rollbackAvailable !== true) {
        return { allowed: false, reason: "Rollback is not available for AHA manual sync.", currentState: normalizedCurrent, nextState: normalizedNext };
      }
    }

    return { allowed: true, reason: "Manual sync transition allowed.", currentState: normalizedCurrent, nextState: normalizedNext };
  }

  function transitionAhaManualSyncState(state, nextState, options = {}) {
    const source = state && typeof state === "object" ? state : createAhaManualSyncRunState();
    const decision = canTransitionAhaManualSyncState(source, nextState, options);
    const errors = cloneArray(source.errors);

    if (!decision.allowed) {
      return {
        ...source,
        reason: decision.reason,
        attemptedState: decision.nextState || nextState,
        errors: errors.concat(decision.reason),
        blockers: cloneArray(source.blockers).concat(decision.blockers || []),
        canExecute: false,
        canWrite: false,
        isStub: false,
        writeStatus: WRITE_STATUS_BLOCKED,
        rollbackStatus: source.rollbackStatus || "not_available"
      };
    }

    return {
      ...source,
      previousState: decision.currentState,
      currentState: decision.nextState,
      reason: decision.reason,
      canExecute: false,
      canWrite: false,
      isStub: false,
      writeStatus: WRITE_STATUS_BLOCKED,
      rollbackStatus: source.rollbackStatus || "not_available"
    };
  }

  const api = {
    AHA_MANUAL_SYNC_STATES,
    getAhaManualSyncStateMachineStatus,
    createAhaManualSyncRunState,
    canTransitionAhaManualSyncState,
    transitionAhaManualSyncState
  };

  if (typeof window !== "undefined") {
    window.AHAManualSyncStateMachine = api;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
