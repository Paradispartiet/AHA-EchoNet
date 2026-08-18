// ahaSyncHub.js

(function () {
  "use strict";

  const MODULES = [
    { id: "lists", label: "Samlinger", key: "aha_lists_v1", table: "aha_lists", moduleName: "AHALists", syncFunction: "syncFromDatabase" },
    { id: "paths", label: "Kunnskapsstier", key: "aha_paths_v1", table: "aha_paths", moduleName: "AHAPaths", syncFunction: "syncFromDatabase" },
    { id: "groups", label: "Grupper", key: "aha_groups_v1", table: "aha_groups", moduleName: "AHAGroups", syncFunction: "syncFromDatabase" },
    { id: "avisa", label: "AHAavisa", key: "aha_articles_v1", table: "aha_articles", moduleName: "AHAAvisa", syncFunction: "syncFromDatabase" }
  ];

  const PRODUCTION_HOME_SYNC_CONTROL = "js/ahaCanonicalProductionHomeSync.js";

  function safeReadArray(key) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function isSyncHubEnabled() {
    return window.AHA_CONFIG?.syncHub?.enableSyncHub === true;
  }

  function isEchoNetEnabled() {
    return window.AHA_CONFIG?.syncHub?.enableEchoNet === true;
  }

  function syncHubDisabledResult(data) {
    return {
      ok: false,
      mode: "planned_noop",
      local_only: true,
      dry_run_only: true,
      autoSync: false,
      sync_enabled: false,
      echonet_enabled: false,
      backend_enabled: false,
      reason: "sync_hub_disabled",
      data
    };
  }

  function isUnavailableRecord(record) {
    return Boolean(record?.deletedAt || record?.deleted_at || record?.archived === true);
  }

  function isDeletedRecord(record) {
    return isUnavailableRecord(record);
  }

  function countActiveRecords(key) {
    return safeReadArray(key).filter((record) => !isUnavailableRecord(record)).length;
  }

  function inspectModule(moduleConfig) {
    const runtime = window[moduleConfig.moduleName];
    const runtimeLoaded = Boolean(runtime);
    const syncAvailable = runtimeLoaded && typeof runtime[moduleConfig.syncFunction] === "function";

    let status = "sync_klar";
    let fallback = null;
    if (!runtimeLoaded) {
      status = "klarlagt";
      fallback = "module_not_loaded_on_home";
    } else if (!syncAvailable) {
      status = "mangler_sync";
      fallback = "missing_sync_function";
    }

    return {
      moduleId: moduleConfig.id,
      label: moduleConfig.label,
      key: moduleConfig.key,
      table: moduleConfig.table,
      localCount: countActiveRecords(moduleConfig.key),
      runtimeLoaded,
      syncFunctionAvailable: syncAvailable,
      syncAvailable,
      status,
      fallback,
      local_only: true,
      dryRunOnly: true,
      manualReviewRequired: true,
      canAutoSyncHere: false,
      canSyncHere: false,
      deprecatedCanSyncHere: syncAvailable
    };
  }

  function inspectAll() {
    return {
      ok: true,
      mode: "planned_noop",
      local_only: true,
      dry_run_only: true,
      autoSync: false,
      sync_enabled: false,
      echonet_enabled: false,
      backend_enabled: false,
      productionCanonicalManualSync: window.AHACanonicalProductionHomeSync?.getStatus?.() || {
        available: false,
        reason: "production_home_sync_control_not_loaded",
        autoSync: false,
        loginTriggersSync: false,
        backgroundSync: false
      },
      modules: MODULES.map(inspectModule)
    };
  }

  function productionControlScriptPresent() {
    return Array.from(document.querySelectorAll("script[src]")).some((script) => {
      const src = String(script.getAttribute("src") || "");
      return src === PRODUCTION_HOME_SYNC_CONTROL || src.endsWith(`/${PRODUCTION_HOME_SYNC_CONTROL}`);
    });
  }

  function mountProductionCanonicalManualSyncControl() {
    if (typeof document === "undefined") return { mounted: false, reason: "document_unavailable" };
    if (window.AHACanonicalProductionHomeSync?.bind) {
      return window.AHACanonicalProductionHomeSync.bind();
    }
    if (productionControlScriptPresent()) return { mounted: false, reason: "control_loading" };

    const script = document.createElement("script");
    script.src = PRODUCTION_HOME_SYNC_CONTROL;
    script.async = false;
    script.dataset.ahaSyncHubProductionManualControl = "true";
    script.addEventListener("load", () => window.AHACanonicalProductionHomeSync?.bind?.(), { once: true });
    script.addEventListener("error", () => console.warn("AHASyncHub: production canonical manual sync control failed to load"), { once: true });
    document.head.appendChild(script);
    return { mounted: true, reason: "control_script_added" };
  }

  window.AHASyncHub = {
    modules: MODULES,
    safeReadArray,
    isSyncHubEnabled,
    isEchoNetEnabled,
    syncHubDisabledResult,
    isUnavailableRecord,
    isDeletedRecord,
    countActiveRecords,
    inspectModule,
    inspectAll,
    mountProductionCanonicalManualSyncControl
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mountProductionCanonicalManualSyncControl, { once: true });
    } else {
      mountProductionCanonicalManualSyncControl();
    }
  }
})();
