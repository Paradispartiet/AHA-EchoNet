// ahaManualSyncStateMachine.js

(function () {
  "use strict";

  const BLOCKED_REASON = "Manual sync execution is disabled in state machine stub.";
  const DEFAULT_REASON = "Manual sync execution is not implemented.";
  const DISABLED_WRITE_STATUS = "disabled_stub_only";

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

  const AHA_MANUAL_SYNC_ALLOWED_TRANSITIONS_PREVIEW = Object.freeze({
    [AHA_MANUAL_SYNC_STATES.NOT_STARTED]: Object.freeze([AHA_MANUAL_SYNC_STATES.BLOCKED]),
    [AHA_MANUAL_SYNC_STATES.BLOCKED]: Object.freeze([AHA_MANUAL_SYNC_STATES.NOT_STARTED]),
    [AHA_MANUAL_SYNC_STATES.CONFIRMED]: Object.freeze([AHA_MANUAL_SYNC_STATES.BLOCKED]),
    [AHA_MANUAL_SYNC_STATES.RUNNING]: Object.freeze([AHA_MANUAL_SYNC_STATES.FAILED]),
    [AHA_MANUAL_SYNC_STATES.FAILED]: Object.freeze([AHA_MANUAL_SYNC_STATES.ROLLED_BACK])
  });

  const AHA_MANUAL_SYNC_DISABLED_EXECUTION_STATES = Object.freeze([
    AHA_MANUAL_SYNC_STATES.CONFIRMED,
    AHA_MANUAL_SYNC_STATES.RUNNING,
    AHA_MANUAL_SYNC_STATES.PARTIAL_SUCCESS,
    AHA_MANUAL_SYNC_STATES.SUCCESS
  ]);

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
    return normalizeStatus(target.id || target.target || target.status, "not_configured");
  }

  function createRunId(now) {
    const timestamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    return `aha-manual-sync-stub-${timestamp}`;
  }

  function createDisabledBase(overrides) {
    const state = overrides || {};
    return {
      runId: state.runId || createRunId(new Date()),
      currentState: AHA_MANUAL_SYNC_STATES.BLOCKED,
      previousState: AHA_MANUAL_SYNC_STATES.NOT_STARTED,
      reason: DEFAULT_REASON,
      target: "not_configured",
      readinessStatus: "blocked",
      validationStatus: "blocked",
      checklistStatus: "blocked",
      payloadStatus: "preview_only",
      warnings: [],
      errors: [],
      canExecute: false,
      canWrite: false,
      isStub: true,
      writeStatus: DISABLED_WRITE_STATUS,
      createdAt: new Date().toISOString()
    };
  }

  function createAhaManualSyncRunState(input) {
    const source = input && typeof input === "object" ? input : {};
    const now = new Date();
    const base = createDisabledBase({ runId: source.runId || createRunId(now) });

    return {
      ...base,
      runId: source.runId || base.runId,
      currentState: AHA_MANUAL_SYNC_STATES.BLOCKED,
      previousState: AHA_MANUAL_SYNC_STATES.NOT_STARTED,
      reason: DEFAULT_REASON,
      target: normalizeTarget(source.target),
      readinessStatus: normalizeStatus(source.readinessStatus || source.readiness, "blocked"),
      validationStatus: normalizeStatus(source.validationStatus || source.validation, "blocked"),
      checklistStatus: normalizeStatus(source.checklistStatus || source.checklist, "blocked"),
      payloadStatus: normalizeStatus(source.payloadStatus || source.payload, "preview_only"),
      warnings: cloneArray(source.warnings),
      errors: cloneArray(source.errors),
      canExecute: false,
      canWrite: false,
      isStub: true,
      writeStatus: DISABLED_WRITE_STATUS,
      createdAt: source.createdAt || now.toISOString()
    };
  }

  function getAhaManualSyncStateMachineStatus() {
    return {
      currentState: AHA_MANUAL_SYNC_STATES.BLOCKED,
      previousState: AHA_MANUAL_SYNC_STATES.NOT_STARTED,
      reason: DEFAULT_REASON,
      canExecute: false,
      canWrite: false,
      isStub: true,
      writeStatus: DISABLED_WRITE_STATUS,
      states: values(AHA_MANUAL_SYNC_STATES),
      allowedPreviewTransitions: Object.keys(AHA_MANUAL_SYNC_ALLOWED_TRANSITIONS_PREVIEW).reduce((copy, state) => {
        copy[state] = AHA_MANUAL_SYNC_ALLOWED_TRANSITIONS_PREVIEW[state].slice();
        return copy;
      }, {}),
      disabledExecutionStates: AHA_MANUAL_SYNC_DISABLED_EXECUTION_STATES.slice(),
      blockedTransitionReason: BLOCKED_REASON
    };
  }

  function isKnownState(state) {
    return values(AHA_MANUAL_SYNC_STATES).includes(state);
  }

  function canTransitionAhaManualSyncState(state, nextState) {
    const currentState = typeof state === "string" ? state : state?.currentState;
    const normalizedCurrent = isKnownState(currentState) ? currentState : AHA_MANUAL_SYNC_STATES.BLOCKED;
    const normalizedNext = isKnownState(nextState) ? nextState : "";

    if (!normalizedNext) {
      return {
        allowed: false,
        reason: "Unknown manual sync state.",
        currentState: normalizedCurrent,
        nextState
      };
    }

    if (AHA_MANUAL_SYNC_DISABLED_EXECUTION_STATES.includes(normalizedNext)) {
      return {
        allowed: false,
        reason: BLOCKED_REASON,
        currentState: normalizedCurrent,
        nextState: normalizedNext
      };
    }

    const allowed = (AHA_MANUAL_SYNC_ALLOWED_TRANSITIONS_PREVIEW[normalizedCurrent] || []).includes(normalizedNext);
    return {
      allowed,
      reason: allowed ? "Allowed preview transition only; no execution or write is performed." : BLOCKED_REASON,
      currentState: normalizedCurrent,
      nextState: normalizedNext
    };
  }

  function transitionAhaManualSyncState(state, nextState) {
    const source = state && typeof state === "object" ? state : createAhaManualSyncRunState();
    const decision = canTransitionAhaManualSyncState(source, nextState);
    const errors = cloneArray(source.errors);

    if (!decision.allowed) {
      return {
        ...source,
        reason: decision.reason,
        attemptedState: decision.nextState || nextState,
        errors: [...errors, decision.reason],
        canExecute: false,
        canWrite: false,
        isStub: true,
        writeStatus: DISABLED_WRITE_STATUS
      };
    }

    return {
      ...source,
      previousState: decision.currentState,
      currentState: decision.nextState,
      reason: decision.reason,
      canExecute: false,
      canWrite: false,
      isStub: true,
      writeStatus: DISABLED_WRITE_STATUS
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
