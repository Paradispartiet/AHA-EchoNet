// ahaManualSyncDryRunTargetAdapter.js

(function () {
  "use strict";

  const TARGETS = Object.freeze([
    Object.freeze({
      targetId: "lists",
      label: "Lister",
      storageKey: "aha_lists_v1",
      table: "aha_lists",
      syncModule: "AHALists",
      syncFunction: "syncFromDatabase",
      executionAllowed: false
    }),
    Object.freeze({
      targetId: "paths",
      label: "Stier",
      storageKey: "aha_paths_v1",
      table: "aha_paths",
      syncModule: "AHAPaths",
      syncFunction: "syncFromDatabase",
      executionAllowed: false
    }),
    Object.freeze({
      targetId: "groups",
      label: "Grupper",
      storageKey: "aha_groups_v1",
      table: "aha_groups",
      syncModule: "AHAGroups",
      syncFunction: "syncFromDatabase",
      executionAllowed: false
    }),
    Object.freeze({
      targetId: "avisa",
      label: "AHAavisa",
      storageKey: "aha_articles_v1",
      table: "aha_articles",
      syncModule: "AHAAvisa",
      syncFunction: "syncFromDatabase",
      executionAllowed: false
    })
  ]);

  const EXECUTION_BLOCKERS = Object.freeze([
    "manual_sync_execution_is_no_go",
    "activation_pr_missing",
    "auto_sync_permanently_forbidden"
  ]);

  function getManualSyncTargets() {
    return TARGETS;
  }

  function readLocalRecords(storageKey) {
    try {
      const storage = window.localStorage;
      if (!storage || typeof storage.getItem !== "function") return [];
      const parsed = JSON.parse(storage.getItem(storageKey) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function isTombstone(record) {
    return Boolean(record && (record.deletedAt || record.deleted_at));
  }

  function inspectManualSyncTarget(targetId) {
    const target = TARGETS.find((candidate) => candidate.targetId === targetId);
    if (!target) {
      return {
        targetId: String(targetId || ""),
        label: "Ukjent target",
        storageKey: null,
        table: null,
        syncModule: null,
        syncFunction: null,
        localTotal: 0,
        localActive: 0,
        localTombstones: 0,
        runtimeLoaded: false,
        syncFunctionAvailable: false,
        executionAllowed: false,
        dryRunOnly: true,
        blocked: true,
        blockers: ["unknown_target", ...EXECUTION_BLOCKERS]
      };
    }

    const records = readLocalRecords(target.storageKey);
    const localTombstones = records.filter(isTombstone).length;
    const runtime = window[target.syncModule];
    const runtimeLoaded = Boolean(runtime);
    const syncFunctionAvailable = runtimeLoaded && typeof runtime[target.syncFunction] === "function";
    const blockers = ["execution_not_allowed", ...EXECUTION_BLOCKERS];

    if (!runtimeLoaded) blockers.push("target_runtime_not_loaded");
    if (!syncFunctionAvailable) blockers.push("sync_function_unavailable");

    return {
      targetId: target.targetId,
      label: target.label,
      storageKey: target.storageKey,
      table: target.table,
      syncModule: target.syncModule,
      syncFunction: target.syncFunction,
      localTotal: records.length,
      localActive: records.length - localTombstones,
      localTombstones,
      runtimeLoaded,
      syncFunctionAvailable,
      executionAllowed: false,
      dryRunOnly: true,
      blocked: true,
      blockers
    };
  }

  function inspectAllManualSyncTargets() {
    return TARGETS.map((target) => inspectManualSyncTarget(target.targetId));
  }

  function unique(values) {
    return [...new Set(values)];
  }

  function createManualSyncDryRunPlan(options = {}) {
    const requestedTargetIds = Array.isArray(options && options.targetIds)
      ? options.targetIds
      : TARGETS.map((target) => target.targetId);
    const targets = requestedTargetIds.map(inspectManualSyncTarget);

    return {
      ok: true,
      mode: "dry_run",
      executionAllowed: false,
      autoSync: false,
      blocked: true,
      reason: "manual_sync_execution_is_no_go",
      targets,
      blockers: unique(targets.flatMap((target) => target.blockers)),
      wouldRun: [],
      wouldWrite: false,
      wouldCallSyncFromDatabase: false,
      wouldCallRepository: false
    };
  }

  window.AHAManualSyncDryRunTargetAdapter = Object.freeze({
    getManualSyncTargets,
    inspectManualSyncTarget,
    inspectAllManualSyncTargets,
    createManualSyncDryRunPlan
  });
})();
