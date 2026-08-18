// ahaCanonicalProductionHomeSync.js
// Explicit manual production canonical sync control for AHA Home / Sync Hub.
// Loading this file never reads auth/storage or performs canonical network I/O.
(function (global) {
  "use strict";

  const VERSION = "aha_canonical_production_home_sync_v1";
  const PRODUCTION_API_ORIGIN = "https://aha-canonical-api-production.redground-9c6e20c2.northeurope.azurecontainerapps.io";
  const PRODUCTION_FRONTEND_ORIGIN = "https://paradispartiet.github.io";
  const CARD_ID = "aha-canonical-production-home-sync";
  const STATUS_ID = "aha-canonical-production-home-sync-status";
  const RESULT_ID = "aha-canonical-production-home-sync-result";
  const OPEN_ID = "aha-canonical-production-home-sync-open";
  const CONFIRM_ID = "aha-canonical-production-home-sync-confirm";
  const CONSENT_ID = "aha-canonical-production-home-sync-consent";
  const RUN_ID = "aha-canonical-production-home-sync-run";
  const CANCEL_ID = "aha-canonical-production-home-sync-cancel";

  const CANONICAL_SCRIPT_PATHS = Object.freeze([
    "js/ahaCanonicalSyncHash.js",
    "js/ahaCanonicalSyncStore.js",
    "js/ahaLocalAccountImport.js",
    "js/ahaCanonicalFrontendSyncAdapter.js",
    "js/ahaCanonicalLocalApplyAdapter.js",
    "js/ahaCanonicalSyncApiClient.js",
    "js/ahaCanonicalManualSyncRunner.js",
    "js/ahaCanonicalSyncProductionPilotBridge.js"
  ]);

  let running = false;
  let loadPromise = null;
  let mountObserver = null;

  function text(value) {
    return String(value ?? "").trim();
  }

  function localDevelopmentOrigin(origin) {
    try {
      const parsed = new URL(origin);
      return parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    } catch {
      return false;
    }
  }

  function isAllowedFrontendOrigin(origin = global.location?.origin || "") {
    const normalized = text(origin).replace(/\/+$/, "");
    return normalized === PRODUCTION_FRONTEND_ORIGIN || localDevelopmentOrigin(normalized);
  }

  function getStatus(options = {}) {
    const origin = options.origin ?? global.location?.origin ?? "";
    return Object.freeze({
      version: VERSION,
      mode: "explicit_manual_canonical_sync_production",
      productionApiOrigin: PRODUCTION_API_ORIGIN,
      productionFrontendOrigin: PRODUCTION_FRONTEND_ORIGIN,
      frontendOriginAllowed: isAllowedFrontendOrigin(origin),
      autoSync: false,
      loginTriggersSync: false,
      authReadyTriggersSync: false,
      backgroundSync: false,
      executesOnLoad: false,
      requiresExplicitUserAction: true,
      requiresExplicitConsent: true,
      userSelectableWorkspace: false,
      workspaceDerivedFromAuthenticatedSubject: true,
      pilotIdentityEnforcedServerSide: true,
      rawPayloadRendered: false,
      serverStateRendered: false,
      productionPilotOnly: true
    });
  }

  function assertExplicitExecution(input = {}) {
    if (input.explicitUserAction !== true) throw new Error("explicit production sync user action is required");
    if (input.explicitConsent !== true) throw new Error("explicit production sync consent is required");
    const origin = input.origin ?? global.location?.origin ?? "";
    if (!isAllowedFrontendOrigin(origin)) throw new Error("production sync frontend origin is not allowed");
  }

  function dependencyPair(options = {}) {
    const bridge = options.bridge || global.AHACanonicalSyncProductionPilotBridge;
    const runner = options.runner || global.AHACanonicalManualSyncRunner;
    if (!bridge?.readAuthenticatedSession || !bridge?.resolvePilotIdentity || !bridge?.summarizeResult) {
      throw new Error("canonical production identity bridge unavailable");
    }
    if (!runner?.run) throw new Error("canonical manual sync runner unavailable");
    return { bridge, runner };
  }

  function scriptAlreadyPresent(path, document = global.document) {
    if (!document?.querySelectorAll) return false;
    return Array.from(document.querySelectorAll("script[src]")).some((script) => {
      const src = text(script.getAttribute?.("src") || script.src);
      return src === path || src.endsWith(`/${path}`);
    });
  }

  function loadScript(path, options = {}) {
    const document = options.document || global.document;
    if (!document?.createElement || !document?.head?.appendChild) {
      return Promise.reject(new Error("document unavailable for canonical sync module loading"));
    }
    if (scriptAlreadyPresent(path, document)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = path;
      script.async = false;
      script.dataset.ahaCanonicalProductionHomeSyncDependency = "true";
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error(`could not load ${path}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  async function ensureCanonicalDependencies(options = {}) {
    if (options.bridge && options.runner) return dependencyPair(options);
    try {
      return dependencyPair(options);
    } catch {}
    if (!loadPromise) {
      loadPromise = (async () => {
        for (const path of CANONICAL_SCRIPT_PATHS) await loadScript(path, options);
        return dependencyPair(options);
      })().catch((error) => {
        loadPromise = null;
        throw error;
      });
    }
    return loadPromise;
  }

  function safeErrorMessage(error) {
    const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
    const code = text(error?.code || error?.name);
    const message = text(error?.message);
    const combined = `${code} ${message}`.toLowerCase();

    if (status === 403 || /canonical_sync_pilot_forbidden|pilot.*forbidden|forbidden/.test(combined)) {
      return "Production-sync er foreløpig bare tilgjengelig for den godkjente pilotprofilen.";
    }
    if (/logg inn|authenticated aha session|session provider|auth/.test(combined)) {
      return "Logg inn i AHA før du synkroniserer.";
    }
    if (/load failed|failed to fetch|network|could not load/.test(combined)) {
      return "Kunne ikke nå production-sync akkurat nå. Ingen automatisk retry kjøres.";
    }
    if (/origin/.test(combined)) {
      return "Production-sync kan bare kjøres fra den godkjente AHA-frontenden.";
    }
    return "Production-sync feilet. Ingen automatisk retry kjøres.";
  }

  async function execute(input = {}, options = {}) {
    assertExplicitExecution({ ...input, origin: input.origin ?? options.origin });
    if (running) throw new Error("canonical production sync is already running");

    running = true;
    try {
      const { bridge, runner } = await ensureCanonicalDependencies(options);
      const session = await bridge.readAuthenticatedSession(options);
      const identity = bridge.resolvePilotIdentity(session);
      const storage = options.storage || global.localStorage;
      if (!storage?.getItem || !storage?.setItem) throw new Error("localStorage unavailable for production sync");

      const result = await runner.run({
        explicitUserAction: true,
        workspaceId: identity.workspaceId,
        apiBaseUrl: PRODUCTION_API_ORIGIN,
        accessToken: session.access_token,
        storage,
        fetch: options.fetch || global.fetch,
        crypto: options.crypto || global.crypto,
        indexedDB: options.indexedDB || global.indexedDB
      });

      if (text(result?.workspaceId) !== identity.workspaceId) {
        throw new Error("canonical runner returned an unexpected production workspace");
      }
      return bridge.summarizeResult(result);
    } finally {
      running = false;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderResult(summary) {
    const conflicts = Number(summary?.conflictCount || 0);
    const reasons = Object.entries(summary?.conflictReasons || {})
      .map(([reason, count]) => `${reason}=${count}`)
      .join(", ");
    return [
      "Status: fullført",
      "Workspace: utledet fra innlogget profil",
      `Lokale canonical objekter: ${Number(summary?.localPrepared || 0)}`,
      `Endret: ${Number(summary?.localChanged || 0)}`,
      `Lagt i outbox: ${Number(summary?.enqueued || 0)}`,
      `Synkronisert til server: ${Number(summary?.pushed || 0)}`,
      `Bootstrap apply lokalt: ${Number(summary?.bootstrapApplied || 0)}`,
      `Delta apply lokalt: ${Number(summary?.pullApplied || 0)}`,
      `Konflikter: ${conflicts}`,
      conflicts && reasons ? `Konflikttyper: ${reasons}` : ""
    ].filter(Boolean).join("\n");
  }

  function cardMarkup(options = {}) {
    const allowed = isAllowedFrontendOrigin(options.origin ?? global.location?.origin ?? "");
    return `
      <section id="${CARD_ID}" class="aha-sync-validation-block" aria-label="Canonical production sync">
        <p class="eyebrow">Canonical production</p>
        <h4>Synkroniser AHA</h4>
        <p id="${STATUS_ID}" class="aha-sync-prep-notice" role="status" aria-live="polite">${allowed
          ? "Manuell production-sync er tilgjengelig. Ingenting synkroniseres ved innlogging eller i bakgrunnen."
          : "Production-sync er blokkert på denne frontenden."}</p>
        <div class="aha-tile-actions">
          <button id="${OPEN_ID}" class="aha-tile-btn aha-tile-btn-primary" type="button"${allowed ? "" : " disabled aria-disabled=\"true\""}>Synkroniser nå</button>
        </div>
        <div id="${CONFIRM_ID}" hidden>
          <p class="aha-sync-prep-notice"><strong>Én eksplisitt kjøring.</strong> Endrede canonical data sendes til production, og serverendringer kan anvendes tilbake på ditt lokale AHA-lager.</p>
          <label class="aha-sync-prep-notice">
            <input id="${CONSENT_ID}" type="checkbox" />
            Jeg vil synkronisere AHA nå.
          </label>
          <div class="aha-tile-actions">
            <button id="${RUN_ID}" class="aha-tile-btn aha-tile-btn-primary" type="button" disabled aria-disabled="true">Bekreft og synkroniser</button>
            <button id="${CANCEL_ID}" class="aha-tile-btn" type="button">Avbryt</button>
          </div>
        </div>
        <pre id="${RESULT_ID}" class="aha-dashboard-output" aria-live="polite"></pre>
        <p class="aha-sync-prep-notice">Pilotgrensen håndheves på serveren. Profil-ID, workspace-ID, token, rå payload og serverState vises ikke her.</p>
      </section>
    `;
  }

  function setStatus(message, state = "info", options = {}) {
    const document = options.document || global.document;
    const node = document?.getElementById?.(STATUS_ID);
    if (!node) return;
    node.textContent = String(message || "");
    node.dataset.state = state;
  }

  function bindCard(options = {}) {
    const document = options.document || global.document;
    const open = document?.getElementById?.(OPEN_ID);
    const confirm = document?.getElementById?.(CONFIRM_ID);
    const consent = document?.getElementById?.(CONSENT_ID);
    const run = document?.getElementById?.(RUN_ID);
    const cancel = document?.getElementById?.(CANCEL_ID);
    const output = document?.getElementById?.(RESULT_ID);
    if (!open || open.dataset.ahaCanonicalProductionHomeSyncBound === "true") return false;
    open.dataset.ahaCanonicalProductionHomeSyncBound = "true";

    open.addEventListener("click", () => {
      if (!isAllowedFrontendOrigin(options.origin ?? global.location?.origin ?? "")) return;
      if (confirm) confirm.hidden = false;
      if (consent) consent.checked = false;
      if (run) {
        run.disabled = true;
        run.setAttribute("aria-disabled", "true");
      }
      setStatus("Bekreft én manuell production-sync. Ingen kjøring har startet ennå.", "confirm", options);
    });

    consent?.addEventListener("change", () => {
      if (!run) return;
      run.disabled = consent.checked !== true;
      run.setAttribute("aria-disabled", consent.checked === true ? "false" : "true");
    });

    cancel?.addEventListener("click", () => {
      if (confirm) confirm.hidden = true;
      if (consent) consent.checked = false;
      setStatus("Manuell production-sync er tilgjengelig. Ingenting synkroniseres ved innlogging eller i bakgrunnen.", "ready", options);
    });

    run?.addEventListener("click", async () => {
      if (running || consent?.checked !== true) return;
      run.disabled = true;
      open.disabled = true;
      if (output) output.textContent = "";
      setStatus("Synkroniserer eksplisitt mot production …", "running", options);
      try {
        const summary = await execute({ explicitUserAction: true, explicitConsent: true }, options);
        if (output) output.textContent = renderResult(summary);
        const conflicts = Number(summary?.conflictCount || 0);
        setStatus(conflicts ? "Production-sync fullført med konflikter." : "Production-sync fullført.", conflicts ? "warning" : "success", options);
        if (confirm) confirm.hidden = true;
        if (consent) consent.checked = false;
      } catch (error) {
        setStatus(safeErrorMessage(error), "error", options);
      } finally {
        open.disabled = false;
        if (run) {
          run.disabled = true;
          run.setAttribute("aria-disabled", "true");
        }
      }
    });
    return true;
  }

  function ensureCard(options = {}) {
    const document = options.document || global.document;
    const mount = document?.getElementById?.("aha-sync-hub-status");
    if (!mount) return false;
    if (!document.getElementById(CARD_ID)) {
      mount.insertAdjacentHTML("afterbegin", cardMarkup(options));
    }
    bindCard(options);
    return true;
  }

  function bind(options = {}) {
    const document = options.document || global.document;
    if (!document?.getElementById) return { bound: false, reason: "document_unavailable" };
    ensureCard(options);

    const mount = document.getElementById("aha-sync-hub-status");
    const MutationObserverImpl = options.MutationObserver || global.MutationObserver;
    if (mount && typeof MutationObserverImpl === "function" && !mountObserver) {
      mountObserver = new MutationObserverImpl(() => ensureCard(options));
      mountObserver.observe(mount, { childList: true });
    }
    return { bound: true, originAllowed: isAllowedFrontendOrigin(options.origin ?? global.location?.origin ?? "") };
  }

  const api = Object.freeze({
    VERSION,
    PRODUCTION_API_ORIGIN,
    PRODUCTION_FRONTEND_ORIGIN,
    CANONICAL_SCRIPT_PATHS,
    isAllowedFrontendOrigin,
    getStatus,
    assertExplicitExecution,
    dependencyPair,
    ensureCanonicalDependencies,
    safeErrorMessage,
    execute,
    renderResult,
    cardMarkup,
    bindCard,
    ensureCard,
    bind
  });

  global.AHACanonicalProductionHomeSync = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (global.document) {
    const start = () => {
      bind();
      global.setTimeout?.(() => ensureCard(), 0);
      global.setTimeout?.(() => ensureCard(), 750);
    };
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})(typeof window !== "undefined" ? window : globalThis);
