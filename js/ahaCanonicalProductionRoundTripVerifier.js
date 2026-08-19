// ahaCanonicalProductionRoundTripVerifier.js
// Explicit, operator-only evidence layer for the bounded production pilot.
// Loading this file performs no auth read, storage read/write or network I/O.
(function (global) {
  "use strict";

  const VERSION = "aha_canonical_production_round_trip_verifier_v1";
  const QUERY_GATE = "ahaCanonicalProductionRoundTrip";
  const QUERY_VALUE = "1";
  const CONFIRMATION_PHRASE = "RUN_AHA_CANONICAL_TWO_PROFILE_ROUND_TRIP";
  let running = false;
  let firstEvidence = null;

  function text(value) { return String(value ?? "").trim(); }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function count(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  }
  function isSha256Hex(value) { return /^[a-f0-9]{64}$/i.test(text(value)); }
  function cursorShape(value) {
    const source = obj(value);
    return Object.freeze({
      pushCursor: count(source.pushCursor),
      pullCursor: count(source.pullCursor),
      bootstrapCompleted: source.bootstrapCompleted === true,
      bootstrapHighWatermark: count(source.bootstrapHighWatermark)
    });
  }
  function locationLike(options = {}) {
    return options.location || global.location || { search: "", origin: "" };
  }
  function isGateOpen(options = {}) {
    const params = new URLSearchParams(String(locationLike(options).search || ""));
    return params.get(QUERY_GATE) === QUERY_VALUE;
  }
  function dependencies(options = {}) {
    const bridge = options.bridge || global.AHACanonicalSyncProductionPilotBridge;
    const runner = options.runner || global.AHACanonicalManualSyncRunner;
    const store = options.store || global.AHACanonicalSyncStore;
    const hash = options.hash || global.AHACanonicalSyncHash;
    const home = options.home || global.AHACanonicalProductionHomeSync;
    if (!bridge?.readAuthenticatedSession || !bridge?.resolvePilotIdentity) throw new Error("canonical production identity bridge unavailable");
    if (!runner?.run || !runner?.resolveDeviceId) throw new Error("canonical manual sync runner unavailable");
    if (!store?.getCursor || !store?.listObjectStates) throw new Error("canonical sync store unavailable");
    if (!hash?.canonicalSyncPayloadHash) throw new Error("canonical sync hash unavailable");
    if (!text(home?.PRODUCTION_API_ORIGIN)) throw new Error("configured production API origin unavailable");
    return { bridge, runner, store, hash, home };
  }
  function assertStorage(value) {
    if (!value || typeof value.getItem !== "function" || typeof value.setItem !== "function") {
      throw new Error("localStorage unavailable for round-trip verification");
    }
    return value;
  }
  function assertExplicitExecution(input = {}, options = {}) {
    if (!isGateOpen(options)) throw new Error(`production round-trip URL gate is closed; add ?${QUERY_GATE}=${QUERY_VALUE}`);
    if (input.explicitConsent !== true) throw new Error("explicit production round-trip consent is required");
    if (text(input.confirmation) !== CONFIRMATION_PHRASE) throw new Error("production round-trip confirmation phrase is incorrect");
  }
  function storeOptions(options = {}) { return options.storeOptions || {}; }
  function cursorNeverMovesBackward(before, after) {
    return after.pushCursor >= before.pushCursor && after.pullCursor >= before.pullCursor;
  }
  function cursorMovedForward(before, after) {
    return after.pushCursor > before.pushCursor || after.pullCursor > before.pullCursor;
  }

  // serverPayloadHash and localPayloadHash deliberately describe different
  // representations. The server hash is the materialized server snapshot/journal
  // domain, while the local hash is the frontend canonical projection used for
  // local change detection. Equality is diagnostic only; integrity requires both
  // domains to be present and well-formed for active state, then stable on replay.
  async function buildStateHashAudit(states, hash, options = {}) {
    const normalized = arr(states)
      .map((state) => ({
        objectType: text(state?.objectType),
        objectId: text(state?.objectId),
        revision: count(state?.revision),
        serverPayloadHash: text(state?.serverPayloadHash) || null,
        localPayloadHash: text(state?.localPayloadHash) || null,
        deleted: Boolean(state?.deletedAt)
      }))
      .filter((state) => state.objectType && state.objectId)
      .sort((left, right) => `${left.objectType}:${left.objectId}`.localeCompare(`${right.objectType}:${right.objectId}`));

    let comparable = 0;
    let matches = 0;
    let mismatches = 0;
    let serverOnly = 0;
    let localOnly = 0;
    let deleted = 0;
    let activeStateCount = 0;
    let activeHashPairs = 0;
    let missingServerHashes = 0;
    let missingLocalHashes = 0;
    let invalidServerHashes = 0;
    let invalidLocalHashes = 0;

    for (const state of normalized) {
      if (state.deleted) deleted += 1;
      else activeStateCount += 1;

      if (state.serverPayloadHash && state.localPayloadHash) {
        comparable += 1;
        if (state.serverPayloadHash === state.localPayloadHash) matches += 1;
        else mismatches += 1;
      } else if (state.serverPayloadHash) serverOnly += 1;
      else if (state.localPayloadHash) localOnly += 1;

      if (state.deleted) continue;
      const serverValid = isSha256Hex(state.serverPayloadHash);
      const localValid = isSha256Hex(state.localPayloadHash);
      if (!state.serverPayloadHash) missingServerHashes += 1;
      else if (!serverValid) invalidServerHashes += 1;
      if (!state.localPayloadHash) missingLocalHashes += 1;
      else if (!localValid) invalidLocalHashes += 1;
      if (serverValid && localValid) activeHashPairs += 1;
    }

    const hashDomainsComplete =
      activeStateCount > 0 &&
      activeHashPairs === activeStateCount &&
      missingServerHashes === 0 &&
      missingLocalHashes === 0 &&
      invalidServerHashes === 0 &&
      invalidLocalHashes === 0;

    const digest = await hash.canonicalSyncPayloadHash(normalized, {
      crypto: options.crypto || global.crypto,
      TextEncoder: options.TextEncoder || global.TextEncoder
    });

    return Object.freeze({
      stateCount: normalized.length,
      activeStateCount,
      activeHashPairs,
      comparable,
      matches,
      mismatches,
      serverOnly,
      localOnly,
      deleted,
      missingServerHashes,
      missingLocalHashes,
      invalidServerHashes,
      invalidLocalHashes,
      hashDomainsComplete,
      crossDomainEqualityRequired: false,
      batchDigestSha256: digest,
      objectIdentifiersIncluded: false,
      payloadIncluded: false
    });
  }

  function hashDomainsReady(hashAudit) {
    const audit = obj(hashAudit);
    if (audit.hashDomainsComplete === true) return true;
    if (audit.hashDomainsComplete === false) return false;
    // Compatibility for older deterministic test fixtures. Live audits always
    // expose hashDomainsComplete explicitly.
    return count(audit.mismatches) === 0;
  }

  function conflictReasonCounts(conflicts) {
    const result = {};
    for (const conflict of arr(conflicts)) {
      const reason = text(conflict?.reason) || "unknown";
      result[reason] = count(result[reason]) + 1;
    }
    return result;
  }
  function safeRunEvidence(result, beforeCursor, afterCursor, hashAudit) {
    const source = obj(result);
    const local = obj(source.local);
    const enqueue = obj(source.enqueue);
    const push = obj(source.push);
    const bootstrap = source.bootstrap == null ? null : obj(source.bootstrap);
    const pull = obj(source.pull);
    const conflicts = arr(source.conflicts);
    const applyCount = count(bootstrap?.applied) + count(pull.applied);
    const before = cursorShape(beforeCursor);
    const after = cursorShape(afterCursor);
    const cursorNonDecreasing = cursorNeverMovesBackward(before, after);
    const cursorAdvanced = cursorMovedForward(before, after);
    const roundTripPass =
      count(push.synced) > 0 &&
      applyCount > 0 &&
      count(push.conflicts) === 0 &&
      count(push.rejected) === 0 &&
      conflicts.length === 0 &&
      hashDomainsReady(hashAudit) &&
      cursorNonDecreasing &&
      cursorAdvanced;

    return Object.freeze({
      version: VERSION,
      mode: "explicit_manual_two_profile_round_trip_proof",
      localPrepared: count(local.prepared),
      localChanged: count(local.changed),
      blockedByExistingConflict: count(local.blockedByExistingConflict),
      enqueued: count(enqueue.enqueued),
      superseded: count(enqueue.superseded),
      pushed: count(push.synced),
      pushConflicts: count(push.conflicts),
      pushRejected: count(push.rejected),
      pushRetry: count(push.retry),
      bootstrapApplied: count(bootstrap?.applied),
      bootstrapHighWatermark: count(bootstrap?.highWatermark),
      pullApplied: count(pull.applied),
      conflictCount: conflicts.length,
      conflictReasons: conflictReasonCounts(conflicts),
      cursorBefore: before,
      cursorAfter: after,
      cursorNonDecreasing,
      cursorAdvanced,
      hashAudit,
      roundTripPass,
      explicitUserAction: true,
      automaticSync: false,
      loginTriggeredSync: false,
      backgroundSync: false,
      rawPayloadIncluded: false,
      serverStateIncluded: false,
      profileSubjectIncluded: false,
      workspaceIdIncluded: false,
      accessTokenIncluded: false
    });
  }
  function evaluateReplay(first, replay) {
    if (!first?.roundTripPass) throw new Error("first round-trip evidence must pass before replay evaluation");
    const cursorNonDecreasing = cursorNeverMovesBackward(cursorShape(first.cursorAfter), cursorShape(replay.cursorAfter));
    const digestStable = text(first?.hashAudit?.batchDigestSha256) === text(replay?.hashAudit?.batchDigestSha256);
    const pass =
      count(replay.localChanged) === 0 &&
      count(replay.enqueued) === 0 &&
      count(replay.pushed) === 0 &&
      count(replay.pushConflicts) === 0 &&
      count(replay.pushRejected) === 0 &&
      count(replay.conflictCount) === 0 &&
      hashDomainsReady(replay?.hashAudit) &&
      cursorNonDecreasing &&
      digestStable;
    return Object.freeze({
      version: VERSION,
      mode: "explicit_manual_two_profile_round_trip_replay_proof",
      pass,
      localChanged: count(replay.localChanged),
      enqueued: count(replay.enqueued),
      pushed: count(replay.pushed),
      conflictCount: count(replay.conflictCount),
      pushRejected: count(replay.pushRejected),
      cursorNonDecreasing,
      hashDomainsComplete: hashDomainsReady(replay?.hashAudit),
      hashDigestStable: digestStable,
      rawPayloadIncluded: false,
      profileSubjectIncluded: false,
      workspaceIdIncluded: false,
      accessTokenIncluded: false
    });
  }
  async function runOnce(input = {}, options = {}) {
    if (running) throw new Error("production round-trip verification is already running");
    assertExplicitExecution(input, options);
    const deps = dependencies(options);
    const localStorage = assertStorage(options.storage || global.localStorage);

    running = true;
    try {
      const session = await deps.bridge.readAuthenticatedSession(options);
      const identity = deps.bridge.resolvePilotIdentity(session);
      const deviceId = deps.runner.resolveDeviceId({
        storage: localStorage,
        crypto: options.crypto || global.crypto
      });
      const beforeCursor = await deps.store.getCursor(identity.workspaceId, deviceId, storeOptions(options));
      const result = await deps.runner.run({
        explicitUserAction: true,
        workspaceId: identity.workspaceId,
        apiBaseUrl: deps.home.PRODUCTION_API_ORIGIN,
        accessToken: session.access_token,
        storage: localStorage,
        fetch: options.fetch || global.fetch,
        crypto: options.crypto || global.crypto,
        indexedDB: options.indexedDB || global.indexedDB,
        storeOptions: storeOptions(options)
      });
      if (text(result?.workspaceId) !== identity.workspaceId) throw new Error("canonical runner returned an unexpected production workspace");
      const afterCursor = result?.cursor || await deps.store.getCursor(identity.workspaceId, deviceId, storeOptions(options));
      const states = await deps.store.listObjectStates(identity.workspaceId, storeOptions(options));
      const hashAudit = await buildStateHashAudit(states, deps.hash, options);
      return safeRunEvidence(result, beforeCursor, afterCursor, hashAudit);
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
      confirmation: get("confirmation")?.value,
      explicitConsent: get("explicitConsent")?.checked === true
    };
  }
  function renderEvidence(output, evidence, replay = null) {
    if (!output) return;
    const audit = obj(evidence.hashAudit);
    const invalidHashes = count(audit.invalidServerHashes) + count(audit.invalidLocalHashes);
    const missingHashes = count(audit.missingServerHashes) + count(audit.missingLocalHashes);
    const lines = [
      `Round-trip: ${evidence.roundTripPass ? "PASS" : "IKKE BESTÅTT"}`,
      `Lokale endringer: ${evidence.localChanged}`,
      `Outbox: ${evidence.enqueued}`,
      `Pushet: ${evidence.pushed}`,
      `Bootstrap apply: ${evidence.bootstrapApplied}`,
      `Pull apply: ${evidence.pullApplied}`,
      `Konflikter: ${evidence.conflictCount}`,
      `Rejected: ${evidence.pushRejected}`,
      `Cursor fremover: ${evidence.cursorAdvanced ? "ja" : "nei"}`,
      `Hash-domener komplette: ${hashDomainsReady(audit) ? "ja" : "nei"}`,
      `Aktive hash-par: ${count(audit.activeHashPairs)}/${count(audit.activeStateCount)}`,
      `Manglende aktive hashverdier: ${missingHashes}`,
      `Ugyldige hashverdier: ${invalidHashes}`,
      `Server/lokal hash ulike (diagnostikk): ${count(audit.mismatches)}`,
      `Batch digest: ${audit.batchDigestSha256}`
    ];
    if (replay) {
      lines.push(
        "",
        `Idempotens-replay: ${replay.pass ? "PASS" : "IKKE BESTÅTT"}`,
        `Replay endret: ${replay.localChanged}`,
        `Replay outbox: ${replay.enqueued}`,
        `Replay pushed: ${replay.pushed}`,
        `Replay konflikter: ${replay.conflictCount}`,
        `Hash-domener komplette: ${replay.hashDomainsComplete ? "ja" : "nei"}`,
        `Hash digest stabil: ${replay.hashDigestStable ? "ja" : "nei"}`
      );
    }
    lines.push("", "Serverhash og lokalhash dekker ulike canonical representasjoner og skal ikke kreves identiske.");
    lines.push("Ingen profil-ID, workspace-ID, access token eller rå payload er inkludert.");
    output.textContent = lines.join("\n");
  }
  function bind(options = {}) {
    const document = options.document || global.document;
    if (!document?.getElementById) return { bound: false, reason: "document_unavailable" };
    const form = document.getElementById("aha-canonical-production-roundtrip-form");
    const firstButton = document.getElementById("aha-canonical-production-roundtrip-first");
    const replayButton = document.getElementById("aha-canonical-production-roundtrip-replay");
    const status = document.getElementById("aha-canonical-production-roundtrip-status");
    const output = document.getElementById("aha-canonical-production-roundtrip-output");
    if (!form || !firstButton || !replayButton) return { bound: false, reason: "surface_missing" };

    const open = isGateOpen(options);
    for (const element of Array.from(form.elements || [])) element.disabled = !open;
    replayButton.disabled = true;
    setStatus(
      status,
      open
        ? "Round-trip-port åpen. Lag først én liten kontrollert AHA-endring i denne profilen, og start deretter første kjøring."
        : `Round-trip-port lukket. Åpne siden med ?${QUERY_GATE}=${QUERY_VALUE}.`,
      open ? "ready" : "blocked"
    );
    if (!open) return { bound: true, gateOpen: false };

    firstButton.addEventListener("click", async () => {
      firstButton.disabled = true;
      replayButton.disabled = true;
      if (output) output.textContent = "";
      setStatus(status, "Kjører ekte production round-trip …", "running");
      try {
        firstEvidence = await runOnce(readForm(form), options);
        renderEvidence(output, firstEvidence);
        replayButton.disabled = !firstEvidence.roundTripPass;
        setStatus(
          status,
          firstEvidence.roundTripPass
            ? "Round-trip bestått. Kjør nå identisk replay uten å endre lokale data."
            : "Round-trip oppfylte ikke alle closeout-krav.",
          firstEvidence.roundTripPass ? "success" : "warning"
        );
      } catch (error) {
        firstEvidence = null;
        setStatus(status, error?.message || "Round-trip feilet.", "error");
      } finally {
        firstButton.disabled = false;
      }
    });

    replayButton.addEventListener("click", async () => {
      if (!firstEvidence?.roundTripPass) return;
      firstButton.disabled = true;
      replayButton.disabled = true;
      setStatus(status, "Kjører identisk idempotens-replay …", "running");
      try {
        const replayEvidence = await runOnce(readForm(form), options);
        const replay = evaluateReplay(firstEvidence, replayEvidence);
        renderEvidence(output, firstEvidence, replay);
        setStatus(
          status,
          replay.pass ? "Round-trip og idempotens-replay bestått." : "Idempotens-replay oppfylte ikke alle closeout-krav.",
          replay.pass ? "success" : "warning"
        );
      } catch (error) {
        setStatus(status, error?.message || "Idempotens-replay feilet.", "error");
      } finally {
        firstButton.disabled = false;
        replayButton.disabled = false;
      }
    });

    return { bound: true, gateOpen: true };
  }
  function getStatus(options = {}) {
    return Object.freeze({
      version: VERSION,
      queryGate: `${QUERY_GATE}=${QUERY_VALUE}`,
      gateOpen: isGateOpen(options),
      confirmationPhrase: CONFIRMATION_PHRASE,
      productionApiOriginConfigured: Boolean(text((options.home || global.AHACanonicalProductionHomeSync)?.PRODUCTION_API_ORIGIN)),
      executesOnLoad: false,
      requiresExplicitUserAction: true,
      requiresExplicitConsent: true,
      automaticSync: false,
      loginTriggeredSync: false,
      backgroundSync: false,
      profileIdentityRendered: false,
      workspaceIdentityRendered: false,
      rawPayloadRendered: false
    });
  }

  const api = Object.freeze({
    VERSION,
    QUERY_GATE,
    QUERY_VALUE,
    CONFIRMATION_PHRASE,
    isGateOpen,
    assertExplicitExecution,
    cursorShape,
    buildStateHashAudit,
    hashDomainsReady,
    safeRunEvidence,
    evaluateReplay,
    runOnce,
    renderEvidence,
    bind,
    getStatus
  });

  global.AHACanonicalProductionRoundTripVerifier = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
