// ahaCanonicalSyncProductionPilotBridge.js
// Explicit one-profile production pilot bridge for canonical sync.
// Loading this file performs no auth lookup, storage mutation or network I/O.
(function (global) {
  "use strict";

  const VERSION = "aha_canonical_sync_production_pilot_bridge_v1";
  const QUERY_GATE = "ahaCanonicalProductionPilot";
  const QUERY_VALUE = "1";
  const CONFIRMATION_PHRASE = "RUN_AHA_CANONICAL_PRODUCTION_PILOT_SYNC";
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

  function isPilotGateOpen(options = {}) {
    const params = new URLSearchParams(String(locationLike(options).search || ""));
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
      throw new Error("production API must use a separate origin from the static AHA page");
    }
    return url.origin;
  }

  function assertStorage(value) {
    if (!value || typeof value.getItem !== "function" || typeof value.setItem !== "function") {
      throw new Error("localStorage unavailable for production pilot sync");
    }
    return value;
  }

  async function readAuthenticatedSession(options = {}) {
    const db = options.db || global.AHADb;
    const client = db?.getClient?.() || null;
    if (!client?.auth || typeof client.auth.getSession !== "function") {
      throw new Error("AHA Supabase session provider unavailable");
    }
    const { data, error } = await client.auth.getSession();
    if (error) throw new Error("Could not read the authenticated AHA session");
    const session = data?.session || null;
    if (!text(session?.access_token) || !text(session?.user?.id)) {
      throw new Error("Logg inn i AHA før production pilot-sync kjøres");
    }
    return session;
  }

  function resolvePilotIdentity(session) {
    const subject = requiredText(session?.user?.id, "authenticated AHA user id");
    if (!UUID_PATTERN.test(subject)) throw new Error("authenticated AHA user id must be a UUID");
    return Object.freeze({
      subject,
      workspaceId: `personal-${subject}`
    });
  }

  function assertExecutionInput(input, options = {}) {
    if (!isPilotGateOpen(options)) {
      throw new Error(`production pilot URL gate is closed; add ?${QUERY_GATE}=${QUERY_VALUE}`);
    }
    if (input?.explicitConsent !== true) throw new Error("explicit production pilot consent is required");
    if (text(input?.confirmation) !== CONFIRMATION_PHRASE) {
      throw new Error("production pilot confirmation phrase is incorrect");
    }
    return Object.freeze({ apiBaseUrl: normalizeApiBaseUrl(input?.apiBaseUrl, options) });
  }

  function summarizeResult(result) {
    const source = obj(result);
    const local = obj(source.local);
    const enqueue = obj(source.enqueue);
    const push = obj(source.push);
    const bootstrap = source.bootstrap == null ? null : obj(source.bootstrap);
    const pull = obj(source.pull);
    const conflicts = Array.isArray(source.conflicts) ? source.conflicts : [];
    const conflictReasons = {};
    for (const conflict of conflicts) {
      const reason = text(conflict?.reason) || "unknown";
      conflictReasons[reason] = Number(conflictReasons[reason] || 0) + 1;
    }
    return Object.freeze({
      ok: true,
      mode: "explicit_manual_canonical_sync_production_pilot",
      workspaceDerivedFromAuthenticatedSubject: true,
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
      serverStateIncluded: false,
      profileSubjectIncluded: false,
      workspaceIdIncluded: false
    });
  }

  async function execute(input = {}, options = {}) {
    if (running) throw new Error("canonical production pilot sync is already running");
    const execution = assertExecutionInput(input, options);
    const runner = options.runner || global.AHACanonicalManualSyncRunner;
    if (!runner || typeof runner.run !== "function") throw new Error("AHACanonicalManualSyncRunner unavailable");
    const storage = assertStorage(options.storage || global.localStorage);

    running = true;
    try {
      // Auth is deliberately touched only after the explicit submit path has passed
      // both the URL gate and confirmation/consent checks.
      const session = await readAuthenticatedSession(options);
      const identity = resolvePilotIdentity(session);
      const result = await runner.run({
        explicitUserAction: true,
        workspaceId: identity.workspaceId,
        apiBaseUrl: execution.apiBaseUrl,
        accessToken: session.access_token,
        storage,
        fetch: options.fetch || global.fetch,
        crypto: options.crypto || global.crypto,
        indexedDB: options.indexedDB || global.indexedDB
      });
      if (text(result?.workspaceId) !== identity.workspaceId) {
        throw new Error("canonical runner returned an unexpected production pilot workspace");
      }
      return summarizeResult(result);
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
      confirmation: get("confirmation")?.value,
      explicitConsent: get("explicitConsent")?.checked === true
    };
  }

  function renderGate(form, status, options = {}) {
    const open = isPilotGateOpen(options);
    if (form) {
      for (const element of Array.from(form.elements || [])) element.disabled = !open;
    }
    setStatus(
      status,
      open
        ? "Production-pilotport åpen. Ingen sync skjer før du fyller ut feltene og trykker Kjør production pilot-sync."
        : `Production-pilotport lukket. Åpne siden med ?${QUERY_GATE}=${QUERY_VALUE}.`,
      open ? "ready" : "blocked"
    );
    return open;
  }

  function renderSummary(output, summary) {
    if (!output) return;
    const lines = [
      "Status: fullført",
      "Workspace: utledet fra innlogget pilotprofil",
      `Lokale canonical objekter: ${summary.localPrepared}`,
      `Endret: ${summary.localChanged}`,
      `Lagt i outbox: ${summary.enqueued}`,
      `Synkronisert til server: ${summary.pushed}`,
      `Bootstrap apply lokalt: ${summary.bootstrapApplied}`,
      `Delta apply lokalt: ${summary.pullApplied}`,
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
    const form = document.getElementById("aha-canonical-production-pilot-form");
    const status = document.getElementById("aha-canonical-production-pilot-status");
    const output = document.getElementById("aha-canonical-production-pilot-output");
    if (!form) return { bound: false, reason: "form_missing" };

    const open = renderGate(form, status, options);
    if (!open) return { bound: true, gateOpen: false };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector?.('[type="submit"]');
      if (submit) submit.disabled = true;
      setStatus(status, "Kjører eksplisitt production pilot-sync …", "running");
      if (output) output.textContent = "";
      try {
        const summary = await execute(readForm(form), options);
        renderSummary(output, summary);
        setStatus(
          status,
          summary.conflictCount ? "Production pilot-sync fullført med konflikter." : "Production pilot-sync fullført.",
          summary.conflictCount ? "warning" : "success"
        );
      } catch (error) {
        setStatus(status, error?.message || "Production pilot-sync feilet.", "error");
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
      gateOpen: isPilotGateOpen(options),
      confirmationPhrase: CONFIRMATION_PHRASE,
      autoSync: false,
      loginTriggersSync: false,
      authReadyTriggersSync: false,
      backgroundSync: false,
      executesOnLoad: false,
      requiresExplicitUserAction: true,
      requiresExplicitConsent: true,
      requiresExplicitApiBaseUrl: true,
      workspaceDerivedFromAuthenticatedSubject: true,
      userSelectableWorkspace: false,
      primarySourceHydration: false,
      appliesServerStateToRealLocalCanonicalStorage: true,
      rawPayloadRendered: false,
      serverStateRendered: false,
      pilotIdentityEnforcedServerSide: true
    });
  }

  const api = Object.freeze({
    VERSION,
    QUERY_GATE,
    QUERY_VALUE,
    CONFIRMATION_PHRASE,
    isPilotGateOpen,
    normalizeApiBaseUrl,
    readAuthenticatedSession,
    resolvePilotIdentity,
    assertExecutionInput,
    summarizeResult,
    execute,
    bind,
    getStatus
  });

  global.AHACanonicalSyncProductionPilotBridge = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", () => bind());
    } else {
      bind();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
