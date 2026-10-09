// AHA Release Readiness Surface V1
// Read-only projection of the canonical module registry. No storage, sync or backend actions.
(function (global) {
  "use strict";

  const VERSION = "aha_release_readiness_surface_v1";
  const SNAPSHOT_STATUS = "local_only_ready_baseline";
  const RELEASE_STATE_BY_REGISTRY = Object.freeze({
    active: "ready",
    shell: "shell",
    planned: "planned"
  });

  const GLOBAL_BOUNDARIES = Object.freeze({
    backend_enabled: false,
    sync_enabled: false,
    echonet_enabled: false,
    external_sharing_enabled: false,
    model_training_enabled: false,
    fine_tuning_enabled: false,
    historygo_writeback_enabled: false,
    hidden_auto_discovery_enabled: false
  });

  function modulesFrom(options = {}) {
    return Array.isArray(options.modules)
      ? options.modules
      : (Array.isArray(global.AHA_MODULES) ? global.AHA_MODULES : []);
  }

  function releaseState(module) {
    return RELEASE_STATE_BY_REGISTRY[String(module?.status || "")] || "unknown";
  }

  function buildReleaseReadinessStatus(options = {}) {
    const modules = modulesFrom(options).map((module) => ({
      id: String(module?.id || ""),
      title: String(module?.title || module?.id || "Ukjent modul"),
      registry_status: String(module?.status || "unknown"),
      release_state: releaseState(module),
      href: String(module?.href || "")
    }));

    const counts = modules.reduce((acc, module) => {
      acc.total += 1;
      if (module.release_state === "ready") acc.ready += 1;
      else if (module.release_state === "shell") acc.shell += 1;
      else if (module.release_state === "planned") acc.planned += 1;
      else acc.unknown += 1;
      return acc;
    }, { total: 0, ready: 0, shell: 0, planned: 0, unknown: 0 });

    const intentionalNonReady = modules.filter((module) =>
      module.release_state === "shell" || module.release_state === "planned"
    );

    const localOnlyReady = counts.total > 0 &&
      counts.unknown === 0 &&
      counts.ready + counts.shell + counts.planned === counts.total;

    return {
      version: VERSION,
      snapshot_status: SNAPSHOT_STATUS,
      local_only_ready: localOnlyReady,
      counts,
      modules,
      intentional_non_ready: intentionalNonReady,
      global_boundaries: { ...GLOBAL_BOUNDARIES },
      summary: localOnlyReady
        ? `Lokal-only baseline er klar: ${counts.ready} av ${counts.total} moduler er ready; ${counts.shell} shell og ${counts.planned} planned holdes bevisst inaktive.`
        : "Release readiness kan ikke bekreftes fra modulregisteret."
    };
  }

  global.AHAReleaseReadiness = {
    VERSION,
    SNAPSHOT_STATUS,
    RELEASE_STATE_BY_REGISTRY,
    GLOBAL_BOUNDARIES,
    buildReleaseReadinessStatus
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.AHAReleaseReadiness;
  }
})(typeof window !== "undefined" ? window : globalThis);
