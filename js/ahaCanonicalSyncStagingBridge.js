// ahaCanonicalSyncStagingBridge.js
// Controlled operator-only bridge for real canonical sync staging runs.
// Loading this file performs no auth lookup, storage write or network I/O.
(function (global) {
  "use strict";

  const VERSION = "aha_canonical_sync_staging_bridge_v1";
  const QUERY_GATE = "ahaCanonicalStaging";
  const QUERY_VALUE = "1";
  const CONFIRMATION_PHRASE = "RUN_AHA_CANONICAL_STAGING_SYNC";
  const MAX_WORKSPACE_ID_LENGTH = 200;
  let running = false;

  function text(value) { return String(value ?? "").trim(); }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function requiredText(value, field) {
    const result = text(value);
    if (!result) throw new Error(`${field} is required`);
    return result;
  }

  function locationLike(options = {}) {
    return options.location || global.location || { search: "", origin: "" };
  }

  function isStagingGateOpen(options = {}) {
    const location = locationLike(options);
    const params = new URLSearchParams(String(location.search || ""));
    return params.get(QUERY_GATE) === QUERY_VALUE;
  }

  function normalizeApiBaseUrl(value, options = {}) {
    const raw = requiredText(value, "apiBaseUrl");
    let url;
    try { url = new URL(raw); }
    catch { throw new Error("apiBaseUrl must be an absolute URL"); }

    if (url.username || url.password) throw new Error("apiBaseUrl must not contain credentials");
    if (url.search || url.hash) throw new Error("apiBaseUrl must not contain query or fragment");
    if (url.pathname !== "/" && url.pathname !== "") throw new Error("apiBaseUrl must point to an origin, not an API path");

    const localhost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(localhost && url.protocol === "http:")) {
      throw new Error("apiBaseUrl must use HTTPS outside localhost");
    }

    const currentOrigin = text(locationLike(options).origin).replace(/\/+$/, "");
    if (currentOrigin && url.origin === currentOrigin) {
      throw new Error("staging API must use a separate origin from the static AHA page");
    }
    return url.origin;
  }

  function normalizeWorkspaceId(value) {
    const workspaceId = requiredText(value, "workspaceId");
    if (workspaceId.length > MAX_WORKSPACE_ID_LENGTH) throw new Error("workspaceId is too long");
    if (/\s/.test(workspaceId)) throw new Error("workspaceId must not contain whitespace");
    return workspaceId;
  }

  function createLazySessionProvider(options = {}) {
    let touched = false;
    let cachedClient = null;
    let cachedSession = null;
    let sessionResolved = false;

    function getClient() {
      if (cachedClient) return cachedClient;
      const db = options.db || global.AHADb;
      cachedClient = db?.getClient?.() || null;
      if (!cachedClient?.auth || typeof cachedClient.auth.getSession !== "function") {
        throw new Error("AHA Supabase session provider unavailable");
      }
      return cachedClient;
    }

    return Object.freeze({
      async getSession() {
        if (sessionResolved) return cachedSession;
        touched = true;
        const client = getClient();
        const { data, error } = await client.auth.getSession();
        if (error) throw new Error("Could not read the authenticated AHA session");
        cachedSession = data?.session || null;
        sessionResolved = true;
        return cachedSession;
      },
      getClient,
      get touched() { return touched; }
    });
  }

  function summarizeResult(result, hydrationStats = {}) {
    const source = obj(result);
    const local = obj(source.local);
    const enqueue = obj(source.enqueue);
    const push = obj(source.push);
    const bootstrap = source.bootstrap == null ? null : obj(source.bootstrap);
    const pull = obj(source.pull);
    const hydration = obj(hydrationStats);
    const conflicts = Array.isArray(source.conflicts) ? source.conflicts : [];
    const conflictReasons = {};
    for (const conflict of conflicts) {
      const reason = text(conflict?.reason) || "unknown";
      conflictReasons[reason] = Number(conflictReasons[reason] || 0) + 1;
    }
    return Object.freeze({
      ok: true,
      mode: "explicit_manual_canonical_sync_staging",
      workspaceId: text(source.workspaceId),
      deviceId: text(source.deviceId),
      primarySourceEventsFetched: Number(hydration.fetched || 0),
      primarySourceEventsIncluded: Number(hydration.included || 0),
      primarySourceEventsExcluded: Number(hydration.excluded || 0),
      hydratedSourceEventsMerged: Number(hydration.mergedSourceEvents || 0),
      localPrepared: Number(local.prepared || 0),
      localChanged: Number(local.changed || 0),
      blockedByExistingConflict: Number(local.blockedByExistingConflict || 0),
      enqueued: Number(enqueue.enqueued || 0),
      superseded: Number(enqueue.superseded || 0),
      pushed: Number(push.synced || 0),
      pushConflicts: Number(push.conflicts || 0),
      pushRejected: Number(push.rejected || 0),
      pushRetry: Number(push.retry || 0),
      bootstrapPages: bootstrap ? Number(bootstrap.pages || 0) : 0,
      bootstrapApplied: bootstrap ? Number(bootstrap.applied || 0) : 0,
      pullPages: Number(pull.pages || 0),
      pullApplied: Number(pull.applied || 0),
      conflictCount: conflicts.length,
      conflictReasons,
      rawPayloadIncluded: false,
      serverStateIncluded: false
    });
  }

  function assertExecutionInput(input, options = {}) {
    if (!isStagingGateOpen(options)) throw new Error(`staging URL gate is closed; add ?${QUERY_GATE}=${QUERY_VALUE}`);
    if (input?.explicitConsent !== true) throw new Error("explicit staging consent is required");
    if (text(input?.confirmation) !== CONFIRMATION_PHRASE) throw new Error("staging confirmation phrase is incorrect");
    return {
      apiBaseUrl: normalizeApiBaseUrl(input?.apiBaseUrl, options),
      workspaceId: normalizeWorkspaceId(input?.workspaceId)
    };
  }

  async function execute(input = {}, options = {}) {
    if (running) throw new Error("canonical staging sync is already running");
    const execution = assertExecutionInput(input, options);
    const runner = options.runner || global.AHACanonicalManualSyncRunner;
    if (!runner || typeof runner.run !== "function") throw new Error("AHACanonicalManualSyncRunner unavailable");
    const hydrator = options.hydrator || global.AHACanonicalStagingSourceHydrator;
    if (!hydrator || typeof hydrator.hydrateStorage !== "function") throw new Error("AHACanonicalStagingSourceHydrator unavailable");

    const baseStorage = options.storage || global.localStorage;
    const sessionProvider = createLazySessionProvider(options);
    running = true;
    try {
      const session = await sessionProvider.getSession();
      if (!text(session?.access_token) || !text(session?.user?.id)) {
        throw new Error("Logg inn i AHA før canonical staging-sync kjøres");
      }
      const hydration = await hydrator.hydrateStorage({
        client: sessionProvider.getClient(),
        session,
        storage: baseStorage,
        localImport: options.localImport || global.AHALocalAccountImport
      });
      if (!hydration?.storage || typeof hydration.storage.getItem !== "function") {
        throw new Error("canonical staging source hydration did not produce a storage snapshot");
      }

      const result = await runner.run({
        explicitUserAction: true,
        workspaceId: execution.workspaceId,
        apiBaseUrl: execution.apiBaseUrl,
        auth: sessionProvider,
        storage: hydration.storage,
        fetch: options.fetch || global.fetch,
        crypto: options.crypto || global.crypto,
        indexedDB: options.indexedDB || global.indexedDB
      });
      return summarizeResult(result, hydration.stats);
    } finally {
      running = false;
    }
  }

  function setStatus(element, message, state) {
    if (!element) return;
    element.textContent = String(message || "");
    element.dataset.state = state || "info";
  }

  function readForm(form) {
    const get = (name) => form?.elements?.namedItem?.(name);
    return {
      apiBaseUrl: get("apiBaseUrl")?.value,
      workspaceId: get("workspaceId")?.value,
      confirmation: get("confirmation")?.value,
      explicitConsent: get("explicitConsent")?.checked === true
    };
  }

  function renderGate(form, status, options = {}) {
    const open = isStagingGateOpen(options);
    if (form) {
      for (const element of Array.from(form.elements || [])) element.disabled = !open;
    }
    setStatus(
      status,
      open
        ? "Staging-port åpen. Ingen sync skjer før du fyller ut feltene og trykker Kjør staging-sync."
        : `Staging-port lukket. Åpne siden med ?${QUERY_GATE}=${QUERY_VALUE}.`,
      open ? "ready" : "blocked"
    );
    return open;
  }

  function renderSummary(output, summary) {
    if (!output) return;
    const lines = [
      `Status: fullført`,
      `Primære AHA-kildehendelser hentet: ${summary.primarySourceEventsFetched}`,
      `Inkludert etter canonical-filter: ${summary.primarySourceEventsIncluded}`,
      `Ekskludert lokale/deferred kilder: ${summary.primarySourceEventsExcluded}`,
      `Kildehendelser i hydrert snapshot: ${summary.hydratedSourceEventsMerged}`,
      `Lokale canonical objekter: ${summary.localPrepared}`,
      `Endret: ${summary.localChanged}`,
      `Lagt i outbox: ${summary.enqueued}`,
      `Synkronisert til server: ${summary.pushed}`,
      `Bootstrap apply: ${summary.bootstrapApplied}`,
      `Delta apply: ${summary.pullApplied}`,
      `Konflikter: ${summary.conflictCount}`
    ];
    if (summary.conflictCount) {
      lines.push(`Konflikttyper: ${Object.entries(summary.conflictReasons).map(([reason, count]) => `${reason}=${count}`).join(", ")}`);
    }
    output.textContent = lines.join("\n");
  }

  function bind(options = {}) {
    const document = options.document || global.document;
    if (!document?.getElementById) return { bound: false, reason: "document_unavailable" };
    const form = document.getElementById("aha-canonical-staging-form");
    const status = document.getElementById("aha-canonical-staging-status");
    const output = document.getElementById("aha-canonical-staging-output");
    if (!form) return { bound: false, reason: "form_missing" };

    const open = renderGate(form, status, options);
    if (!open) return { bound: true, gateOpen: false };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector?.('[type="submit"]');
      if (submit) submit.disabled = true;
      setStatus(status, "Henter canonical-eligible AHA-kilder og kjører eksplisitt staging-sync …", "running");
      if (output) output.textContent = "";
      try {
        const summary = await execute(readForm(form), options);
        renderSummary(output, summary);
        setStatus(status, summary.conflictCount ? "Staging-sync fullført med konflikter." : "Staging-sync fullført.", summary.conflictCount ? "warning" : "success");
      } catch (error) {
        setStatus(status, error?.message || "Staging-sync feilet.", "error");
      } finally {
        if (submit) submit.disabled = false;
      }
    });
    return { bound: true, gateOpen: true };
  }

  function getStatus(options = {}) {
    return Object.freeze({
      version: VERSION,
      queryGate: `${QUERY_GATE}=${QUERY_VALUE}`,
      gateOpen: isStagingGateOpen(options),
      confirmationPhrase: CONFIRMATION_PHRASE,
      autoSync: false,
      loginTriggersSync: false,
      authReadyTriggersSync: false,
      executesOnLoad: false,
      requiresExplicitUserAction: true,
      requiresExplicitConsent: true,
      requiresExplicitApiBaseUrl: true,
      requiresExplicitWorkspaceId: true,
      primarySourceHydration: "explicit_run_only",
      primarySourceHydrationReadOnly: true,
      rawPayloadRendered: false,
      serverStateRendered: false
    });
  }

  const api = Object.freeze({
    VERSION,
    QUERY_GATE,
    QUERY_VALUE,
    CONFIRMATION_PHRASE,
    isStagingGateOpen,
    normalizeApiBaseUrl,
    normalizeWorkspaceId,
    createLazySessionProvider,
    summarizeResult,
    assertExecutionInput,
    execute,
    bind,
    getStatus
  });

  global.AHACanonicalSyncStagingBridge = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", () => bind());
    } else {
      bind();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
