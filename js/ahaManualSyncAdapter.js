// ahaManualSyncAdapter.js

(function () {
  "use strict";

  const DATABASE_TARGET_ID = "database_existing";
  const WRITE_STATUS_READY = "manual_gated_existing_database_target";
  const WRITE_STATUS_BLOCKED = "blocked";
  const ROLLBACK_STATUS = "not_available";
  const ALLOWED_MODULES = Object.freeze({
    lists: "saveList",
    paths: "savePath",
    groups: "saveGroup",
    ahaavisa: "saveArticle"
  });

  function getGlobal() {
    if (typeof window !== "undefined") return window;
    if (typeof globalThis !== "undefined") return globalThis;
    return {};
  }

  function getStateMachine() {
    const global = getGlobal();
    return global.AHAManualSyncStateMachine || null;
  }

  function getRepository() {
    const global = getGlobal();
    return global.AHARepository || null;
  }

  function cloneList(value) {
    return Array.isArray(value) ? value.filter(Boolean).slice() : [];
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeTargetDetails(target) {
    const source = target && typeof target === "object" ? target : {};
    const id = typeof target === "string"
      ? target
      : source.id || source.target || source.targetId || source.value || "not_configured";
    const normalizedId = String(id || "not_configured").trim() || "not_configured";
    const targetStatus = String(source.targetStatus || source.status || (normalizedId === DATABASE_TARGET_ID ? "configured" : "not_configured")).trim() || "not_configured";
    return { id: normalizedId, targetStatus };
  }

  function getMissingWriteMethods(repository = getRepository()) {
    if (!repository || typeof repository !== "object") return Object.values(ALLOWED_MODULES);
    return Object.values(ALLOWED_MODULES).filter((methodName) => typeof repository[methodName] !== "function");
  }

  function validateAhaManualSyncTarget(target) {
    const normalized = normalizeTargetDetails(target);
    const missingWriteMethods = getMissingWriteMethods();

    if (normalized.id !== DATABASE_TARGET_ID) {
      return {
        ok: false,
        status: "blocked",
        target: normalized.id,
        targetStatus: normalized.targetStatus,
        canExecute: false,
        canWrite: false,
        isStub: false,
        reason: "Existing database target is not selected.",
        missingWriteMethods,
        writeStatus: WRITE_STATUS_BLOCKED
      };
    }

    if (normalized.targetStatus !== "configured") {
      return {
        ok: false,
        status: "blocked",
        target: normalized.id,
        targetStatus: normalized.targetStatus,
        canExecute: false,
        canWrite: false,
        isStub: false,
        reason: "Existing database target is present but not configured.",
        missingWriteMethods,
        writeStatus: WRITE_STATUS_BLOCKED
      };
    }

    if (missingWriteMethods.length) {
      return {
        ok: false,
        status: "blocked",
        target: normalized.id,
        targetStatus: normalized.targetStatus,
        canExecute: false,
        canWrite: false,
        isStub: false,
        reason: "Existing database target found, but no approved write method exists.",
        missingWriteMethods,
        writeStatus: WRITE_STATUS_BLOCKED
      };
    }

    return {
      ok: true,
      status: "configured",
      target: normalized.id,
      targetStatus: "configured",
      canExecute: true,
      canWrite: true,
      isStub: false,
      reason: "Existing AHARepository write methods are available for the configured database target.",
      missingWriteMethods: [],
      writeStatus: WRITE_STATUS_READY
    };
  }

  function countValidationErrors(validation, fallbackErrors) {
    const source = validation && typeof validation === "object" ? validation : {};
    if (Array.isArray(source.errors)) return source.errors.length;
    if (Number.isFinite(Number(source.errorCount))) return Number(source.errorCount);
    if (Number.isFinite(Number(source.errorsCount))) return Number(source.errorsCount);
    const validationStatus = String(source.status || validation || "").toLowerCase();
    if (validationStatus.includes("error") || validationStatus.includes("invalid") || validationStatus === "blocked") return 1;
    return cloneList(fallbackErrors).length;
  }

  function summarizeValidation(validation, fallbackErrors) {
    const source = validation && typeof validation === "object" ? validation : {};
    const errorCount = countValidationErrors(validation, fallbackErrors);
    return {
      status: String(source.status || (errorCount > 0 ? "invalid" : "valid")),
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

  function normalizeModuleId(value) {
    const text = String(value || "").trim().toLowerCase();
    if (text === "ahaavisa" || text === "aha_avisa" || text === "articles") return "ahaavisa";
    return text;
  }

  function getModuleItems(modulePreview) {
    if (!modulePreview || typeof modulePreview !== "object") return [];
    if (Array.isArray(modulePreview.items)) return modulePreview.items.slice();
    if (Array.isArray(modulePreview.records)) return modulePreview.records.slice();
    if (Array.isArray(modulePreview.payload?.items)) return modulePreview.payload.items.slice();
    if (Array.isArray(modulePreview.sampleItems)) return modulePreview.sampleItems.slice();
    return [];
  }

  function summarizePayloadPreview(payloadPreview) {
    const source = payloadPreview && typeof payloadPreview === "object" ? payloadPreview : {};
    const modules = Array.isArray(source.modules) ? source.modules : [];
    const includedFromModules = modules.filter((modulePreview) => modulePreview?.included === true);
    const excludedFromModules = modules.filter((modulePreview) => modulePreview?.included !== true);
    const includedModules = cloneList(source.includedModules).length
      ? cloneList(source.includedModules).map(normalizeModuleId)
      : includedFromModules.map((modulePreview) => normalizeModuleId(modulePreview.id || modulePreview.name)).filter(Boolean);
    const excludedModules = cloneList(source.excludedModules).length
      ? cloneList(source.excludedModules).map(normalizeModuleId)
      : excludedFromModules.map((modulePreview) => normalizeModuleId(modulePreview.id || modulePreview.name)).filter(Boolean);
    const itemCounts = modules.reduce((counts, modulePreview) => {
      const key = normalizeModuleId(modulePreview?.id || modulePreview?.name);
      if (key) counts[key] = Number(modulePreview.itemCount || modulePreview.count || getModuleItems(modulePreview).length || 0);
      return counts;
    }, { ...(source.itemCounts || {}) });
    const totalItems = Number(source.totalItems || source.totalPreviewItems || Object.keys(itemCounts).reduce((total, key) => total + Number(itemCounts[key] || 0), 0));
    const modulesIncluded = Number(source.modulesIncluded ?? includedModules.length ?? includedFromModules.length ?? 0);

    return { modules, includedModules, excludedModules, itemCounts, totalItems, modulesIncluded };
  }

  function summarizeAuditPreview(auditPreview) {
    const source = auditPreview && typeof auditPreview === "object" ? auditPreview : {};
    return {
      status: source.status || source.auditStatus || "not_configured",
      writeStatus: source.writeStatus || "not_configured",
      rollbackStatus: source.rollbackStatus || ROLLBACK_STATUS,
      warningCount: cloneList(source.warnings).length
    };
  }

  function normalizeStateMachineState(stateMachineStatus) {
    const source = stateMachineStatus && typeof stateMachineStatus === "object" ? stateMachineStatus : {};
    return {
      currentState: source.currentState || source.state || "blocked",
      canExecute: source.canExecute === true,
      canWrite: source.canWrite === true,
      writeStatus: source.writeStatus || WRITE_STATUS_BLOCKED
    };
  }

  function getAdapterCanExecute(input) {
    if (input?.adapterStatus && typeof input.adapterStatus === "object") return input.adapterStatus.canExecute === true;
    if (input?.adapter && typeof input.adapter === "object") return input.adapter.canExecute === true;
    if (Object.prototype.hasOwnProperty.call(input || {}, "adapterCanExecute")) return input.adapterCanExecute === true;
    return getAhaManualSyncAdapterStatus().canExecute === true;
  }

  function buildGateSummary(input) {
    const source = input && typeof input === "object" ? input : {};
    const target = normalizeTargetDetails(source.target);
    const targetValidation = validateAhaManualSyncTarget(target);
    const payloadSummary = summarizePayloadPreview(source.payloadPreview || source.payload);
    const validationSummary = summarizeValidation(source.validationSummary || source.validation || source.validationStatus, source.errors);
    const readinessStatus = normalizeReadinessStatus(source.readiness, source.readinessStatus);
    const checklistSummary = summarizeChecklist(source.checklist, source.checklistSummary);
    const auditPreviewSummary = summarizeAuditPreview(source.auditPreview);
    const stateMachineState = normalizeStateMachineState(source.stateMachineStatus || source.stateMachine || getStateMachine()?.getAhaManualSyncStateMachineStatus?.());
    const blockers = [];
    const warnings = [];
    const errors = cloneList(source.errors);
    const adapterCanExecute = getAdapterCanExecute(source);

    if (!targetValidation.ok) blockers.push(targetValidation.reason);
    if (validationSummary.errorCount > 0) blockers.push("Validation has errors.");
    if (readinessStatus !== "ready") blockers.push("Readiness is not ready.");
    if (checklistSummary.blockedCount > 0) blockers.push("Operator checklist has blocked items.");
    if (payloadSummary.modulesIncluded === 0 || payloadSummary.includedModules.length === 0) blockers.push("Payload preview has 0 included modules.");
    if (!adapterCanExecute) blockers.push("Adapter canExecute is false.");
    if (!stateMachineState.canExecute) blockers.push("State machine canExecute is false.");

    if (readinessStatus === "warning") warnings.push("Readiness has warnings.");
    if (validationSummary.warningCount > 0) warnings.push("Validation has warnings.");
    if (checklistSummary.warningCount > 0) warnings.push("Operator checklist has warnings.");
    if (auditPreviewSummary.status === "not_configured") warnings.push("Audit log writer is not configured.");
    if (auditPreviewSummary.warningCount > 0) warnings.push("Audit preview has warnings.");

    return {
      target,
      targetValidation,
      payloadSummary,
      validationSummary,
      readinessStatus,
      checklistSummary,
      auditPreviewSummary,
      stateMachineState,
      blockers: [...new Set(blockers.filter(Boolean))],
      warnings: [...new Set(warnings.filter(Boolean))],
      errors,
      canExecute: blockers.length === 0,
      canWrite: blockers.length === 0
    };
  }

  function runAhaManualSyncTargetDryRun(input) {
    const summary = buildGateSummary(input);
    const status = summary.blockers.length ? (summary.validationSummary.errorCount > 0 ? "invalid" : "blocked") : "prepared";

    return {
      ok: summary.blockers.length === 0,
      mode: "dry_run",
      status,
      target: summary.target.id,
      targetStatus: summary.target.targetStatus,
      canExecute: summary.canExecute,
      canWrite: summary.canWrite,
      wouldExecute: false,
      wouldWrite: false,
      includedModules: summary.payloadSummary.includedModules,
      excludedModules: summary.payloadSummary.excludedModules,
      itemCounts: summary.payloadSummary.itemCounts,
      totalItems: summary.payloadSummary.totalItems,
      validationSummary: summary.validationSummary,
      readinessStatus: summary.readinessStatus,
      checklistSummary: summary.checklistSummary,
      auditPreviewSummary: summary.auditPreviewSummary,
      stateMachineState: summary.stateMachineState.currentState,
      blockers: summary.blockers,
      warnings: summary.warnings,
      errors: summary.errors,
      message: summary.blockers.length
        ? "Target adapter dry-run is blocked. No execution or write is available."
        : "Target adapter dry-run passed. Explicit manual confirmation is still required before write.",
      writeStatus: summary.blockers.length ? WRITE_STATUS_BLOCKED : WRITE_STATUS_READY,
      rollbackStatus: ROLLBACK_STATUS
    };
  }

  function getAhaManualSyncAdapterStatus() {
    const targetValidation = validateAhaManualSyncTarget({ id: DATABASE_TARGET_ID, status: "configured" });
    const stateMachine = getStateMachine();
    const stateMachineStatus = stateMachine?.getAhaManualSyncStateMachineStatus
      ? stateMachine.getAhaManualSyncStateMachineStatus()
      : { currentState: "blocked", previousState: "not_started", canExecute: true, canWrite: true, isStub: false, writeStatus: WRITE_STATUS_READY };

    return {
      adapterStatus: targetValidation.ok ? "ready" : "blocked",
      target: DATABASE_TARGET_ID,
      targetStatus: targetValidation.ok ? "configured" : "not_configured",
      canPrepare: true,
      canExecute: targetValidation.ok,
      canWrite: targetValidation.ok,
      isStub: false,
      reason: targetValidation.reason,
      missingWriteMethods: targetValidation.missingWriteMethods,
      writeStatus: targetValidation.ok ? WRITE_STATUS_READY : WRITE_STATUS_BLOCKED,
      stateMachineStatus
    };
  }

  function buildRunPayload(payloadSummary) {
    const included = new Set(payloadSummary.includedModules.map(normalizeModuleId));
    return payloadSummary.modules
      .filter((modulePreview) => modulePreview?.included === true)
      .map((modulePreview) => {
        const moduleId = normalizeModuleId(modulePreview.id || modulePreview.name);
        const errors = cloneList(modulePreview.errors);
        const items = getModuleItems(modulePreview);
        return { moduleId, methodName: ALLOWED_MODULES[moduleId], items, errors, validationStatus: modulePreview.validationStatus || "valid" };
      })
      .filter((moduleRun) => included.has(moduleRun.moduleId) && ALLOWED_MODULES[moduleRun.moduleId])
      .filter((moduleRun) => moduleRun.errors.length === 0 && moduleRun.validationStatus !== "errors");
  }

  function prepareRun(input) {
    const summary = buildGateSummary(input);
    const stateMachine = getStateMachine();
    const runStateInput = {
      ...(input || {}),
      target: { id: summary.target.id, status: summary.target.targetStatus },
      targetStatus: summary.target.targetStatus,
      readinessStatus: summary.readinessStatus,
      validation: summary.validationSummary,
      checklistSummary: summary.checklistSummary,
      payloadPreview: input?.payloadPreview || input?.payload,
      includedModuleCount: summary.payloadSummary.includedModules.length,
      validationErrorCount: summary.validationSummary.errorCount,
      checklistBlockedCount: summary.checklistSummary.blockedCount
    };
    const runState = stateMachine?.createAhaManualSyncRunState
      ? stateMachine.createAhaManualSyncRunState(runStateInput)
      : {
          runId: input?.runId || `aha-manual-sync-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`,
          currentState: "blocked",
          previousState: "not_started",
          target: summary.target.id,
          canExecute: summary.canExecute,
          canWrite: summary.canWrite,
          isStub: false,
          writeStatus: summary.canExecute ? WRITE_STATUS_READY : WRITE_STATUS_BLOCKED,
          errors: summary.blockers.slice()
        };
    const runPayload = buildRunPayload(summary.payloadSummary);
    const payloadItemCount = runPayload.reduce((total, moduleRun) => total + moduleRun.items.length, 0);
    const blockers = summary.blockers.slice();

    if (runPayload.length === 0) blockers.push("No included valid modules can be written.");
    if (payloadItemCount === 0) blockers.push("Included modules contain 0 writable items.");

    const prepared = blockers.length === 0;
    return {
      ok: prepared,
      status: prepared ? "prepared" : "blocked",
      canExecute: prepared,
      canWrite: prepared,
      isStub: false,
      reason: prepared ? "Manual sync run prepared. Explicit confirmation is required to execute." : blockers[0],
      writeStatus: prepared ? WRITE_STATUS_READY : WRITE_STATUS_BLOCKED,
      rollbackStatus: ROLLBACK_STATUS,
      auditStatus: summary.auditPreviewSummary.status === "not_configured" ? "not_configured" : summary.auditPreviewSummary.status,
      targetValidation: summary.targetValidation,
      dryRunResult: runAhaManualSyncTargetDryRun(input),
      runState: { ...runState, canExecute: prepared, canWrite: prepared, writeStatus: prepared ? WRITE_STATUS_READY : WRITE_STATUS_BLOCKED, errors: cloneList(runState.errors).concat(blockers) },
      stateMachineStatus: getAhaManualSyncAdapterStatus().stateMachineStatus,
      runPayload,
      includedModules: runPayload.map((moduleRun) => moduleRun.moduleId),
      excludedModules: summary.payloadSummary.excludedModules,
      blockers: [...new Set(blockers)],
      warnings: summary.warnings,
      validationSummary: summary.validationSummary,
      readinessStatus: summary.readinessStatus,
      checklistSummary: summary.checklistSummary,
      target: summary.target.id,
      targetStatus: summary.target.targetStatus
    };
  }

  function hasExplicitConfirmation(input) {
    const source = input && typeof input === "object" ? input : {};
    if (source.confirmation === true || source.confirm === true || source.explicitConfirmation === true) return true;
    if (typeof source.confirmationToken === "string" && source.confirmationToken.trim()) return true;
    if (typeof source.confirmation?.token === "string" && source.confirmation.token.trim()) return true;
    return false;
  }

  async function writeRunPayload(repository, runPayload) {
    const writes = [];
    for (const moduleRun of runPayload) {
      const method = repository[moduleRun.methodName];
      for (const item of moduleRun.items) {
        const result = await method.call(repository, item);
        writes.push({ moduleId: moduleRun.moduleId, itemId: item?.id || null, result });
        if (!result || result.ok !== true) {
          const reason = result?.fallback || result?.reason || result?.error?.message || result?.error || "write_failed";
          throw new Error(`${moduleRun.moduleId} write failed: ${String(reason)}`);
        }
      }
    }
    return writes;
  }

  async function executeRun(input) {
    const prepared = prepareRun(input);
    const stateMachine = getStateMachine();
    const repository = getRepository();

    if (!hasExplicitConfirmation(input)) {
      return {
        ok: false,
        status: "blocked",
        reason: "Explicit manual confirmation is required.",
        canExecute: false,
        canWrite: false,
        isStub: false,
        writeStatus: WRITE_STATUS_BLOCKED,
        rollbackStatus: ROLLBACK_STATUS,
        auditStatus: prepared.auditStatus || "not_configured",
        runState: { ...prepared.runState, currentState: "blocked", errors: cloneList(prepared.runState?.errors).concat("Explicit manual confirmation is required.") },
        prepared
      };
    }

    if (!prepared.ok) {
      return {
        ok: false,
        status: "blocked",
        reason: prepared.reason,
        canExecute: false,
        canWrite: false,
        isStub: false,
        writeStatus: WRITE_STATUS_BLOCKED,
        rollbackStatus: ROLLBACK_STATUS,
        auditStatus: prepared.auditStatus || "not_configured",
        blockers: prepared.blockers,
        runState: { ...prepared.runState, currentState: "blocked" },
        prepared
      };
    }

    if (!repository) {
      return {
        ok: false,
        status: "blocked",
        reason: "Existing database target found, but no approved write method exists.",
        canExecute: false,
        canWrite: false,
        isStub: false,
        writeStatus: WRITE_STATUS_BLOCKED,
        rollbackStatus: ROLLBACK_STATUS,
        auditStatus: prepared.auditStatus || "not_configured",
        runState: { ...prepared.runState, currentState: "blocked" },
        prepared
      };
    }

    const confirmedState = stateMachine?.transitionAhaManualSyncState
      ? stateMachine.transitionAhaManualSyncState(prepared.runState, "confirmed")
      : { ...prepared.runState, previousState: "blocked", currentState: "confirmed" };
    if (confirmedState.currentState !== "confirmed") {
      return {
        ok: false,
        status: "blocked",
        reason: confirmedState.reason || "State machine blocked confirmation.",
        canExecute: false,
        canWrite: false,
        isStub: false,
        writeStatus: WRITE_STATUS_BLOCKED,
        rollbackStatus: ROLLBACK_STATUS,
        auditStatus: prepared.auditStatus || "not_configured",
        runState: confirmedState,
        prepared
      };
    }

    const runningState = stateMachine?.transitionAhaManualSyncState
      ? stateMachine.transitionAhaManualSyncState(confirmedState, "running", { explicitConfirmation: true })
      : { ...confirmedState, previousState: "confirmed", currentState: "running" };
    if (runningState.currentState !== "running") {
      return {
        ok: false,
        status: "blocked",
        reason: runningState.reason || "State machine blocked running state.",
        canExecute: false,
        canWrite: false,
        isStub: false,
        writeStatus: WRITE_STATUS_BLOCKED,
        rollbackStatus: ROLLBACK_STATUS,
        auditStatus: prepared.auditStatus || "not_configured",
        runState: runningState,
        prepared
      };
    }

    try {
      const writes = await writeRunPayload(repository, prepared.runPayload);
      const successState = stateMachine?.transitionAhaManualSyncState
        ? stateMachine.transitionAhaManualSyncState(runningState, "success")
        : { ...runningState, previousState: "running", currentState: "success" };
      return {
        ok: true,
        status: "success",
        reason: "Manual sync completed through existing database repository write methods.",
        canExecute: false,
        canWrite: false,
        isStub: false,
        writeStatus: "written",
        rollbackStatus: ROLLBACK_STATUS,
        auditStatus: prepared.auditStatus || "not_configured",
        target: prepared.target,
        targetStatus: prepared.targetStatus,
        includedModules: prepared.includedModules,
        excludedModules: prepared.excludedModules,
        writeCount: writes.length,
        writes,
        runState: successState,
        prepared
      };
    } catch (error) {
      const failedState = stateMachine?.transitionAhaManualSyncState
        ? stateMachine.transitionAhaManualSyncState(runningState, "failed")
        : { ...runningState, previousState: "running", currentState: "failed" };
      return {
        ok: false,
        status: "failed",
        reason: error?.message || "Manual sync write failed.",
        error: error?.message || String(error),
        canExecute: false,
        canWrite: false,
        isStub: false,
        writeStatus: "failed",
        rollbackStatus: ROLLBACK_STATUS,
        auditStatus: prepared.auditStatus || "not_configured",
        target: prepared.target,
        targetStatus: prepared.targetStatus,
        includedModules: prepared.includedModules,
        excludedModules: prepared.excludedModules,
        runState: failedState,
        prepared
      };
    }
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
