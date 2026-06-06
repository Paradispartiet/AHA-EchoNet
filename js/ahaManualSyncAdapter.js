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

  function getAuditWriter(repository = getRepository()) {
    if (repository && typeof repository.writeAhaManualSyncAuditLog === "function") {
      return repository.writeAhaManualSyncAuditLog.bind(repository);
    }
    if (repository && typeof repository.createAhaManualSyncAuditEntry === "function") {
      return repository.createAhaManualSyncAuditEntry.bind(repository);
    }
    return null;
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
    const writer = getAuditWriter();
    const configuredStatus = writer ? "configured" : "not_configured";
    return {
      status: writer ? (source.status === "failed" ? "failed" : (source.status || source.auditStatus || configuredStatus)) : "not_configured",
      writeStatus: writer ? (source.writeStatus || configuredStatus) : "not_configured",
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
    if (auditPreviewSummary.status === "not_configured") blockers.push("Audit log writer is not configured.");
    if (!adapterCanExecute && auditPreviewSummary.status !== "not_configured") blockers.push("Adapter canExecute is false.");
    if (!stateMachineState.canExecute) blockers.push("State machine canExecute is false.");

    if (readinessStatus === "warning") warnings.push("Readiness has warnings.");
    if (validationSummary.warningCount > 0) warnings.push("Validation has warnings.");
    if (checklistSummary.warningCount > 0) warnings.push("Operator checklist has warnings.");
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
    const auditWriterConfigured = Boolean(getAuditWriter());
    const ready = targetValidation.ok && auditWriterConfigured;
    const stateMachine = getStateMachine();
    const stateMachineStatus = stateMachine?.getAhaManualSyncStateMachineStatus
      ? stateMachine.getAhaManualSyncStateMachineStatus()
      : { currentState: "blocked", previousState: "not_started", canExecute: true, canWrite: true, isStub: false, writeStatus: WRITE_STATUS_READY };

    return {
      adapterStatus: ready ? "ready" : "blocked",
      target: DATABASE_TARGET_ID,
      targetStatus: targetValidation.ok ? "configured" : "not_configured",
      canPrepare: true,
      canExecute: ready,
      canWrite: ready,
      isStub: false,
      reason: targetValidation.ok && !auditWriterConfigured ? "Audit log writer is not configured." : targetValidation.reason,
      missingWriteMethods: targetValidation.missingWriteMethods,
      auditStatus: auditWriterConfigured ? "configured" : "not_configured",
      writeStatus: ready ? WRITE_STATUS_READY : WRITE_STATUS_BLOCKED,
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

  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function checksum(value) {
    const text = stableStringify(value);
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) - hash + text.charCodeAt(index)) >>> 0;
    }
    return `sha256-not-cryptographic-${hash.toString(16).padStart(8, "0")}`;
  }

  function auditErrorMessage(error) {
    if (!error) return null;
    if (typeof error === "string") return error;
    return error.message || error.reason || error.fallback || String(error);
  }

  function buildAuditEntry(prepared, resultPatch = {}) {
    const writtenAt = new Date().toISOString();
    const baseSummary = {
      includedModules: prepared.includedModules || [],
      excludedModules: prepared.excludedModules || [],
      itemCounts: prepared.dryRunResult?.itemCounts || {},
      totalItems: prepared.dryRunResult?.totalItems || 0
    };
    return {
      runId: prepared.runState?.runId || resultPatch.runId || `aha-manual-sync-${writtenAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
      timestamp: writtenAt,
      trigger: "manual",
      target: prepared.target,
      targetStatus: prepared.targetStatus,
      includedModules: baseSummary.includedModules,
      excludedModules: baseSummary.excludedModules,
      itemCounts: baseSummary.itemCounts,
      totalItems: baseSummary.totalItems,
      readinessStatus: prepared.readinessStatus,
      validationSummary: prepared.validationSummary,
      checklistSummary: prepared.checklistSummary,
      payloadSummary: {
        includedModules: baseSummary.includedModules,
        excludedModules: baseSummary.excludedModules,
        itemCounts: baseSummary.itemCounts,
        totalItems: baseSummary.totalItems,
        checksum: checksum(baseSummary)
      },
      confirmation: {
        confirmed: resultPatch.confirmed === true,
        confirmedAt: resultPatch.confirmed === true ? (resultPatch.confirmedAt || writtenAt) : null
      },
      resultStatus: resultPatch.resultStatus || prepared.status || "blocked",
      writeStatus: resultPatch.writeStatus || prepared.writeStatus || WRITE_STATUS_BLOCKED,
      rollbackStatus: resultPatch.rollbackStatus || prepared.rollbackStatus || ROLLBACK_STATUS,
      writeResult: resultPatch.writeResult || null,
      warnings: cloneList(prepared.warnings).concat(cloneList(resultPatch.warnings)),
      errors: cloneList(prepared.blockers).concat(cloneList(prepared.errors)).concat(cloneList(resultPatch.errors)).filter(Boolean)
    };
  }

  async function writeAuditEntry(repository, prepared, resultPatch = {}) {
    const writer = getAuditWriter(repository);
    if (!writer) {
      return {
        ok: false,
        status: "not_configured",
        runId: prepared.runState?.runId || null,
        target: prepared.target,
        writtenAt: null,
        errors: ["Audit log writer is not configured."],
        warnings: []
      };
    }
    const entry = buildAuditEntry(prepared, resultPatch);
    try {
      const result = await writer(entry);
      const ok = result?.ok === true;
      return {
        ok,
        status: ok ? (result.status || "success") : (result?.status || "failed"),
        auditId: result?.auditId || result?.id || result?.data?.id || entry.runId,
        runId: entry.runId,
        target: entry.target,
        writtenAt: result?.writtenAt || result?.data?.created_at || entry.timestamp,
        errors: cloneList(result?.errors).concat(ok ? [] : [auditErrorMessage(result?.error || result?.reason || result?.fallback || "audit_write_failed")]).filter(Boolean),
        warnings: cloneList(result?.warnings),
        entry
      };
    } catch (error) {
      return {
        ok: false,
        status: "failed",
        runId: entry.runId,
        target: entry.target,
        writtenAt: null,
        errors: [auditErrorMessage(error) || "audit_write_failed"],
        warnings: [],
        entry
      };
    }
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

  async function loadAhaManualSyncHistory(options = {}) {
    const repository = getRepository();
    if (!repository || typeof repository.loadSourceEvents !== "function") {
      return { ok: false, status: "not_configured", entries: [], reason: "history_reader_not_configured" };
    }
    const limit = Math.min(100, Math.max(1, Number(options.limit || 20)));
    try {
      const result = await repository.loadSourceEvents({ limit: Math.max(limit, 50) });
      if (!result?.ok) return { ok: false, status: "unavailable", entries: [], reason: result?.fallback || result?.reason || "history_read_failed" };
      const entries = cloneList(result.data)
        .filter((entry) => entry?.source_type === "aha_manual_sync" && entry?.content_type === "manual_sync_audit")
        .slice(0, limit);
      return { ok: true, status: "loaded", entries };
    } catch (error) {
      return { ok: false, status: "unavailable", entries: [], reason: error?.message || "history_read_failed" };
    }
  }

  async function executeRun(input) {
    const prepared = prepareRun(input);
    const stateMachine = getStateMachine();
    const repository = getRepository();

    if (!hasExplicitConfirmation(input)) {
      const auditResult = await writeAuditEntry(repository, prepared, {
        confirmed: false,
        resultStatus: "blocked",
        writeStatus: WRITE_STATUS_BLOCKED,
        errors: ["Explicit manual confirmation is required."]
      });
      return {
        ok: false,
        status: "blocked",
        reason: "Explicit manual confirmation is required.",
        canExecute: false,
        canWrite: false,
        isStub: false,
        writeStatus: WRITE_STATUS_BLOCKED,
        rollbackStatus: ROLLBACK_STATUS,
        auditStatus: auditResult.status,
        auditResult,
        runState: { ...prepared.runState, currentState: "blocked", errors: cloneList(prepared.runState?.errors).concat("Explicit manual confirmation is required.") },
        prepared
      };
    }

    if (!prepared.ok) {
      const auditResult = await writeAuditEntry(repository, prepared, {
        confirmed: true,
        resultStatus: "blocked",
        writeStatus: WRITE_STATUS_BLOCKED,
        errors: prepared.blockers
      });
      return {
        ok: false,
        status: "blocked",
        reason: prepared.reason,
        canExecute: false,
        canWrite: false,
        isStub: false,
        writeStatus: WRITE_STATUS_BLOCKED,
        rollbackStatus: ROLLBACK_STATUS,
        auditStatus: auditResult.status,
        auditResult,
        blockers: prepared.blockers,
        runState: { ...prepared.runState, currentState: "blocked" },
        prepared
      };
    }

    if (!repository) {
      const auditResult = await writeAuditEntry(repository, prepared, {
        confirmed: true,
        resultStatus: "blocked",
        writeStatus: WRITE_STATUS_BLOCKED,
        errors: ["Existing database target found, but no approved write method exists."]
      });
      return {
        ok: false,
        status: "blocked",
        reason: "Existing database target found, but no approved write method exists.",
        canExecute: false,
        canWrite: false,
        isStub: false,
        writeStatus: WRITE_STATUS_BLOCKED,
        rollbackStatus: ROLLBACK_STATUS,
        auditStatus: auditResult.status,
        auditResult,
        runState: { ...prepared.runState, currentState: "blocked" },
        prepared
      };
    }

    if (!getAuditWriter(repository)) {
      return {
        ok: false,
        status: "blocked",
        reason: "Audit log writer is not configured.",
        canExecute: false,
        canWrite: false,
        isStub: false,
        writeStatus: WRITE_STATUS_BLOCKED,
        rollbackStatus: ROLLBACK_STATUS,
        auditStatus: "not_configured",
        auditResult: { ok: false, status: "not_configured", runId: prepared.runState?.runId || null, target: prepared.target, writtenAt: null, errors: ["Audit log writer is not configured."], warnings: [] },
        runState: { ...prepared.runState, currentState: "blocked", errors: cloneList(prepared.runState?.errors).concat("Audit log writer is not configured.") },
        prepared
      };
    }

    const confirmedState = stateMachine?.transitionAhaManualSyncState
      ? stateMachine.transitionAhaManualSyncState(prepared.runState, "confirmed")
      : { ...prepared.runState, previousState: "blocked", currentState: "confirmed" };
    if (confirmedState.currentState !== "confirmed") {
      const auditResult = await writeAuditEntry(repository, prepared, { confirmed: true, resultStatus: "blocked", writeStatus: WRITE_STATUS_BLOCKED, errors: [confirmedState.reason || "State machine blocked confirmation."] });
      return {
        ok: false,
        status: "blocked",
        reason: confirmedState.reason || "State machine blocked confirmation.",
        canExecute: false,
        canWrite: false,
        isStub: false,
        writeStatus: WRITE_STATUS_BLOCKED,
        rollbackStatus: ROLLBACK_STATUS,
        auditStatus: auditResult.status,
        auditResult,
        runState: confirmedState,
        prepared
      };
    }

    const runningState = stateMachine?.transitionAhaManualSyncState
      ? stateMachine.transitionAhaManualSyncState(confirmedState, "running", { explicitConfirmation: true })
      : { ...confirmedState, previousState: "confirmed", currentState: "running" };
    if (runningState.currentState !== "running") {
      const auditResult = await writeAuditEntry(repository, prepared, { confirmed: true, resultStatus: "blocked", writeStatus: WRITE_STATUS_BLOCKED, errors: [runningState.reason || "State machine blocked running state."] });
      return {
        ok: false,
        status: "blocked",
        reason: runningState.reason || "State machine blocked running state.",
        canExecute: false,
        canWrite: false,
        isStub: false,
        writeStatus: WRITE_STATUS_BLOCKED,
        rollbackStatus: ROLLBACK_STATUS,
        auditStatus: auditResult.status,
        auditResult,
        runState: runningState,
        prepared
      };
    }

    try {
      const writes = await writeRunPayload(repository, prepared.runPayload);
      const successState = stateMachine?.transitionAhaManualSyncState
        ? stateMachine.transitionAhaManualSyncState(runningState, "success")
        : { ...runningState, previousState: "running", currentState: "success" };
      const auditResult = await writeAuditEntry(repository, prepared, {
        confirmed: true,
        resultStatus: "success",
        writeStatus: "written",
        writeResult: { ok: true, writeCount: writes.length },
        rollbackStatus: ROLLBACK_STATUS
      });
      const auditOk = auditResult.ok === true;
      return {
        ok: auditOk,
        status: auditOk ? "success" : "partial_success",
        reason: auditOk
          ? "Manual sync completed through existing database repository write methods. Audit log written."
          : "Manual sync database write completed, but audit log write failed.",
        canExecute: false,
        canWrite: false,
        isStub: false,
        writeStatus: "written",
        rollbackStatus: ROLLBACK_STATUS,
        auditStatus: auditResult.status,
        auditId: auditResult.auditId,
        auditResult,
        target: prepared.target,
        targetStatus: prepared.targetStatus,
        includedModules: prepared.includedModules,
        excludedModules: prepared.excludedModules,
        writeCount: writes.length,
        writes,
        errors: auditOk ? [] : auditResult.errors,
        runState: successState,
        prepared
      };
    } catch (error) {
      const failedState = stateMachine?.transitionAhaManualSyncState
        ? stateMachine.transitionAhaManualSyncState(runningState, "failed")
        : { ...runningState, previousState: "running", currentState: "failed" };
      const writeError = error?.message || "Manual sync write failed.";
      const auditResult = await writeAuditEntry(repository, prepared, {
        confirmed: true,
        resultStatus: "failed",
        writeStatus: "failed",
        writeResult: { ok: false, error: writeError },
        rollbackStatus: ROLLBACK_STATUS,
        errors: [writeError]
      });
      return {
        ok: false,
        status: "failed",
        reason: writeError,
        error: writeError,
        canExecute: false,
        canWrite: false,
        isStub: false,
        writeStatus: "failed",
        rollbackStatus: ROLLBACK_STATUS,
        auditStatus: auditResult.status,
        auditId: auditResult.auditId,
        auditResult,
        target: prepared.target,
        targetStatus: prepared.targetStatus,
        includedModules: prepared.includedModules,
        excludedModules: prepared.excludedModules,
        errors: auditResult.ok ? [writeError] : [writeError].concat(auditResult.errors),
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
    executeAhaManualSyncRun: executeRun,
    loadAhaManualSyncHistory
  };

  if (typeof window !== "undefined") {
    window.AHAManualSyncAdapter = api;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
