// ahaSyncHub.js

(function () {
  "use strict";

  const MODULES = [
    { id: "lists", label: "Lister", key: "aha_lists_v1", table: "aha_lists", moduleName: "AHALists", syncFunction: "syncFromDatabase" },
    { id: "paths", label: "Stier", key: "aha_paths_v1", table: "aha_paths", moduleName: "AHAPaths", syncFunction: "syncFromDatabase" },
    { id: "groups", label: "Grupper", key: "aha_groups_v1", table: "aha_groups", moduleName: "AHAGroups", syncFunction: "syncFromDatabase" },
    { id: "avisa", label: "AHAavisa", key: "aha_articles_v1", table: "aha_articles", moduleName: "AHAAvisa", syncFunction: "syncFromDatabase" }
  ];

  function safeReadArray(key) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function isDeletedRecord(record) {
    return Boolean(record?.deletedAt || record?.deleted_at);
  }

  function countActiveRecords(key) {
    return safeReadArray(key).filter((record) => !isDeletedRecord(record)).length;
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
      syncAvailable,
      status,
      fallback,
      canSyncHere: syncAvailable
    };
  }

  function inspectAll() {
    return {
      ok: true,
      mode: "read_only",
      autoSync: false,
      modules: MODULES.map(inspectModule)
    };
  }

  window.AHASyncHub = {
    modules: MODULES,
    safeReadArray,
    isDeletedRecord,
    countActiveRecords,
    inspectModule,
    inspectAll
  };
})();
