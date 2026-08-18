// ahaCanonicalProductionHomeSync.js
// Explicit manual production canonical sync controller for AHA Home / Sync Hub.
// Loading this file performs no auth read, storage mutation or network request.
(function (global) {
  "use strict";

  const VERSION = "aha_canonical_production_home_sync_v1";
  const PRODUCTION_API_ORIGIN = "https://aha-canonical-api-production.redground-9c6e20c2.northeurope.azurecontainerapps.io";
  const PRODUCTION_FRONTEND_ORIGIN = "https://paradispartiet.github.io";

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
    renderResult
  });

  global.AHACanonicalProductionHomeSync = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
