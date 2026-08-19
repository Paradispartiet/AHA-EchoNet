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
  const PRODUCTION_FRONTEND_ORIGIN = "https://paradispartiet.github.io";
  const CARD_ID = "aha-canonical-production-home-sync";
  const STATUS_ID = "aha-canonical-production-home-sync-status";
  const RESULT_ID = "aha-canonical-production-home-sync-result";
  const TECHNICAL_RESULT_ID = "aha-canonical-production-home-sync-technical-result";
  const OPEN_ID = "aha-canonical-production-home-sync-open";
  const CONFIRM_ID = "aha-canonical-production-home-sync-confirm";
  const CONSENT_ID = "aha-canonical-production-home-sync-consent";
  const RUN_ID = "aha-canonical-production-home-sync-run";
  const CANCEL_ID = "aha-canonical-production-home-sync-cancel";

  let productionControlPromise = null;
  let productionRunInFlight = false;
  let mountQueued = false;

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

  function localDevelopmentOrigin(origin) {
    try {
      const parsed = new URL(origin);
      return parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    } catch {
      return false;
    }
  }

  function isAllowedProductionFrontend(origin = window.location?.origin || "") {
    const normalized = String(origin || "").trim().replace(/\/+$/, "");
    return normalized === PRODUCTION_FRONTEND_ORIGIN || localDevelopmentOrigin(normalized);
  }

  function inspectAll() {
    scheduleProductionCanonicalManualSyncControl();
    return {
      ok: true,
      mode: "planned_noop",
      local_only: true,
      dry_run_only: true,
      autoSync: false,
      sync_enabled: false,
      echonet_enabled: false,
      backend_enabled: false,
      productionCanonicalManualSync: {
        available: isAllowedProductionFrontend(),
        mode: "explicit_manual_canonical_sync_production",
        autoSync: false,
        loginTriggersSync: false,
        authReadyTriggersSync: false,
        requiresExplicitUserAction: true,
        requiresExplicitConsent: true,
        controlLoaded: Boolean(window.AHACanonicalProductionHomeSync)
      },
      modules: MODULES.map(inspectModule)
    };
  }

  function productionControlScriptPresent() {
    if (typeof document === "undefined" || !document.querySelectorAll) return false;
    return Array.from(document.querySelectorAll("script[src]")).some((script) => {
      const src = String(script.getAttribute?.("src") || script.src || "");
      return src === PRODUCTION_HOME_SYNC_CONTROL || src.endsWith(`/${PRODUCTION_HOME_SYNC_CONTROL}`);
    });
  }

  function loadProductionControl() {
    if (window.AHACanonicalProductionHomeSync?.execute) {
      return Promise.resolve(window.AHACanonicalProductionHomeSync);
    }
    if (productionControlPromise) return productionControlPromise;
    if (typeof document === "undefined" || !document.createElement || !document.head?.appendChild) {
      return Promise.reject(new Error("document unavailable for production sync control loading"));
    }

    productionControlPromise = new Promise((resolve, reject) => {
      if (productionControlScriptPresent()) {
        const poll = () => {
          if (window.AHACanonicalProductionHomeSync?.execute) {
            resolve(window.AHACanonicalProductionHomeSync);
            return;
          }
          reject(new Error("production sync control is present but unavailable"));
        };
        queueMicrotask(poll);
        return;
      }

      const script = document.createElement("script");
      script.src = PRODUCTION_HOME_SYNC_CONTROL;
      script.async = false;
      script.dataset.ahaSyncHubProductionManualControl = "true";
      script.addEventListener("load", () => {
        const control = window.AHACanonicalProductionHomeSync;
        if (!control?.execute) {
          reject(new Error("production sync control failed to initialize"));
          return;
        }
        resolve(control);
      }, { once: true });
      script.addEventListener("error", () => reject(new Error("production sync control failed to load")), { once: true });
      document.head.appendChild(script);
    }).catch((error) => {
      productionControlPromise = null;
      throw error;
    });

    return productionControlPromise;
  }

  function summarizeProductionResult(summary = {}) {
    const pushed = Number(summary.pushed || 0);
    const received = Number(summary.bootstrapApplied || 0) + Number(summary.pullApplied || 0);
    const conflicts = Number(summary.conflictCount || 0);

    if (conflicts > 0) {
      return `Synkronisering fullført med ${conflicts} konflikt${conflicts === 1 ? "" : "er"}. Se tekniske detaljer.`;
    }
    if (pushed === 0 && received === 0) return "AHA er allerede oppdatert.";

    const parts = [];
    if (pushed > 0) parts.push(`${pushed} endring${pushed === 1 ? "" : "er"} lagret`);
    if (received > 0) parts.push(`${received} oppdatering${received === 1 ? "" : "er"} hentet`);
    return `AHA er synkronisert. ${parts.join(" · ")}.`;
  }

  function productionCardMarkup() {
    const allowed = isAllowedProductionFrontend();
    return `
      <section id="${CARD_ID}" class="aha-sync-validation-block" aria-label="AHA synkronisering">
        <p class="eyebrow">Synkronisering</p>
        <h4>Synkroniser AHA</h4>
        <p id="${STATUS_ID}" class="aha-sync-prep-notice" role="status" aria-live="polite">${allowed
          ? "Hold AHA-dataene dine oppdatert på tvers av økter. Synkronisering skjer bare når du ber om det."
          : "Synkronisering er ikke tilgjengelig på denne siden."}</p>
        <div class="aha-tile-actions">
          <button id="${OPEN_ID}" class="aha-tile-btn aha-tile-btn-primary" type="button"${allowed ? "" : " disabled aria-disabled=\"true\""}>Synkroniser nå</button>
        </div>
        <div id="${CONFIRM_ID}" hidden>
          <p class="aha-sync-prep-notice"><strong>Synkroniser nå?</strong> Nye og endrede AHA-data kan lagres, og oppdateringer kan hentes tilbake til denne enheten.</p>
          <label class="aha-sync-prep-notice">
            <input id="${CONSENT_ID}" type="checkbox" />
            Ja, synkroniser AHA nå.
          </label>
          <div class="aha-tile-actions">
            <button id="${RUN_ID}" class="aha-tile-btn aha-tile-btn-primary" type="button" disabled aria-disabled="true">Bekreft og synkroniser</button>
            <button id="${CANCEL_ID}" class="aha-tile-btn" type="button">Avbryt</button>
          </div>
        </div>
        <p id="${RESULT_ID}" class="aha-sync-prep-notice" aria-live="polite"></p>
        <details class="aha-tech-status">
          <summary>Tekniske detaljer</summary>
          <pre id="${TECHNICAL_RESULT_ID}" class="aha-dashboard-output"></pre>
        </details>
        <p class="aha-sync-prep-notice">Profil, innloggingstoken og rådata vises ikke i synkroniseringsresultatet.</p>
      </section>
    `;
  }

  function setProductionStatus(message, state = "info") {
    const node = document.getElementById(STATUS_ID);
    if (!node) return;
    node.textContent = String(message || "");
    node.dataset.state = state;
  }

  function bindProductionCard() {
    if (typeof document === "undefined") return false;
    const open = document.getElementById(OPEN_ID);
    const confirm = document.getElementById(CONFIRM_ID);
    const consent = document.getElementById(CONSENT_ID);
    const run = document.getElementById(RUN_ID);
    const cancel = document.getElementById(CANCEL_ID);
    const output = document.getElementById(RESULT_ID);
    const technicalOutput = document.getElementById(TECHNICAL_RESULT_ID);
    if (!open || open.dataset.ahaCanonicalProductionHomeSyncBound === "true") return false;
    open.dataset.ahaCanonicalProductionHomeSyncBound = "true";

    open.addEventListener("click", () => {
      if (!isAllowedProductionFrontend()) return;
      if (confirm) confirm.hidden = false;
      if (consent) consent.checked = false;
      if (run) {
        run.disabled = true;
        run.setAttribute("aria-disabled", "true");
      }
      setProductionStatus("Bekreft én manuell synkronisering. Ingenting er sendt eller hentet ennå.", "confirm");
    });

    consent?.addEventListener("change", () => {
      if (!run) return;
      run.disabled = consent.checked !== true;
      run.setAttribute("aria-disabled", consent.checked === true ? "false" : "true");
    });

    cancel?.addEventListener("click", () => {
      if (confirm) confirm.hidden = true;
      if (consent) consent.checked = false;
      setProductionStatus("Hold AHA-dataene dine oppdatert på tvers av økter. Synkronisering skjer bare når du ber om det.", "ready");
    });

    run?.addEventListener("click", async () => {
      if (productionRunInFlight || consent?.checked !== true) return;
      productionRunInFlight = true;
      run.disabled = true;
      open.disabled = true;
      if (output) output.textContent = "";
      if (technicalOutput) technicalOutput.textContent = "";
      setProductionStatus("Synkroniserer AHA …", "running");

      try {
        const control = await loadProductionControl();
        const summary = await control.execute({
          explicitUserAction: true,
          explicitConsent: true,
          origin: window.location?.origin || ""
        });
        if (output) output.textContent = summarizeProductionResult(summary);
        if (technicalOutput) technicalOutput.textContent = control.renderResult(summary);
        const conflicts = Number(summary?.conflictCount || 0);
        setProductionStatus(conflicts ? "Synkronisering fullført med konflikter." : "Synkronisering fullført.", conflicts ? "warning" : "success");
        if (confirm) confirm.hidden = true;
        if (consent) consent.checked = false;
      } catch (error) {
        const control = window.AHACanonicalProductionHomeSync;
        const message = control?.safeErrorMessage
          ? control.safeErrorMessage(error)
          : "Synkronisering feilet før kjøringen kunne starte. Ingen automatisk retry kjøres.";
        setProductionStatus(message, "error");
      } finally {
        productionRunInFlight = false;
        open.disabled = false;
        if (run) {
          run.disabled = true;
          run.setAttribute("aria-disabled", "true");
        }
      }
    });

    return true;
  }

  function mountProductionCanonicalManualSyncControl() {
    if (typeof document === "undefined" || !document.getElementById) {
      return { mounted: false, reason: "document_unavailable" };
    }

    const visibleHomeAnchor = document.getElementById("aha-local-home-technical-details");
    const legacySyncHubMount = document.getElementById("aha-sync-hub-status");
    if (!visibleHomeAnchor && !legacySyncHubMount) {
      return { mounted: false, reason: "sync_hub_mount_unavailable" };
    }

    if (!document.getElementById(CARD_ID)) {
      if (visibleHomeAnchor?.insertAdjacentHTML) {
        visibleHomeAnchor.insertAdjacentHTML("beforebegin", productionCardMarkup());
      } else {
        legacySyncHubMount.insertAdjacentHTML("afterbegin", productionCardMarkup());
      }
    }

    bindProductionCard();
    return {
      mounted: true,
      reason: visibleHomeAnchor ? "visible_home_manual_control_ready" : "legacy_sync_hub_manual_control_ready"
    };
  }

  function scheduleProductionCanonicalManualSyncControl() {
    if (mountQueued || typeof document === "undefined") return;
    mountQueued = true;
    const schedule = typeof queueMicrotask === "function" ? queueMicrotask : (callback) => Promise.resolve().then(callback);
    schedule(() => {
      mountQueued = false;
      mountProductionCanonicalManualSyncControl();
    });
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
    isAllowedProductionFrontend,
    loadProductionControl,
    summarizeProductionResult,
    productionCardMarkup,
    bindProductionCard,
    mountProductionCanonicalManualSyncControl,
    scheduleProductionCanonicalManualSyncControl
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mountProductionCanonicalManualSyncControl, { once: true });
    } else {
      mountProductionCanonicalManualSyncControl();
    }
  }
})();
