// ahaCanonicalManualSyncRunner.js
// Explicit user-initiated canonical sync orchestration.
// Loading this file never reads auth, storage, IndexedDB or network.
(function (global) {
  "use strict";

  const VERSION = "aha_canonical_manual_sync_runner_v1";
  const DEVICE_ID_STORAGE_KEY = "aha_canonical_sync_device_id_v1";
  const DEFAULT_PAGE_LIMIT = 200;

  function text(value) { return String(value ?? "").trim(); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function requiredText(value, field) {
    const result = text(value);
    if (!result) throw new Error(`${field} is required`);
    return result;
  }
  function nonNegativeInteger(value, field) {
    const number = Number(value ?? 0);
    if (!Number.isInteger(number) || number < 0) throw new Error(`${field} must be a non-negative integer`);
    return number;
  }
  function objectKey(objectType, objectId) { return `${requiredText(objectType, "objectType")}:${requiredText(objectId, "objectId")}`; }

  function dependencies(options = {}) {
    const store = options.store || global.AHACanonicalSyncStore;
    const frontend = options.frontendAdapter || global.AHACanonicalFrontendSyncAdapter;
    const localImport = options.localImport || global.AHALocalAccountImport;
    const localApply = options.localApply || global.AHACanonicalLocalApplyAdapter;
    const hash = options.hash || global.AHACanonicalSyncHash;
    const api = options.api || global.AHACanonicalSyncApiClient;
    if (!store?.listPending || !store?.listObjectStates || !store?.putObjectState) throw new Error("AHACanonicalSyncStore v2 unavailable");
    if (!frontend?.prepareSnapshot || !frontend?.prepareRecord) throw new Error("AHACanonicalFrontendSyncAdapter unavailable");
    if (!localImport?.snapshotFromStorage) throw new Error("AHALocalAccountImport unavailable");
    if (!localApply?.prepareEntries || !localApply?.writePrepared) throw new Error("AHACanonicalLocalApplyAdapter unavailable");
    if (!hash?.canonicalSyncPayloadHash) throw new Error("AHACanonicalSyncHash unavailable");
    if (!api?.profile || !api?.push || !api?.bootstrap || !api?.pull) throw new Error("AHACanonicalSyncApiClient unavailable");
    return { store, frontend, localImport, localApply, hash, api };
  }

  function storage(options = {}) {
    const value = options.storage || global.localStorage;
    if (!value || typeof value.getItem !== "function" || typeof value.setItem !== "function") throw new Error("localStorage unavailable");
    return value;
  }

  function storeOptions(options = {}) { return options.storeOptions || {}; }
  function apiOptions(options = {}) {
    return {
      apiBaseUrl: options.apiBaseUrl,
      accessToken: options.accessToken,
      auth: options.auth || global.AHAAuth,
      fetch: options.fetch || global.fetch
    };
  }

  function randomDeviceId(options = {}) {
    const cryptoImpl = options.crypto || global.crypto;
    if (typeof cryptoImpl?.randomUUID === "function") return `browser-${cryptoImpl.randomUUID()}`;
    if (typeof cryptoImpl?.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      cryptoImpl.getRandomValues(bytes);
      return `browser-${Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    }
    throw new Error("Web Crypto random source required for canonical sync device id");
  }

  function resolveDeviceId(options = {}) {
    const explicit = text(options.deviceId);
    if (explicit) return explicit;
    const localStorage = storage(options);
    const current = text(localStorage.getItem(DEVICE_ID_STORAGE_KEY));
    if (current) return current;
    const next = randomDeviceId(options);
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, next);
    return next;
  }

  async function resolveWorkspaceId(api, options = {}) {
    const explicit = text(options.workspaceId);
    if (explicit) return explicit;
    const profile = await api.profile(apiOptions(options));
    const workspaceId = text(profile?.personalWorkspaceId);
    if (!workspaceId) throw new Error("canonical profile has no active personalWorkspaceId");
    return workspaceId;
  }

  function revisionsMap(states) {
    return Object.fromEntries(arr(states).map((state) => [objectKey(state.objectType, state.objectId), nonNegativeInteger(state.revision, "revision")]));
  }

  function conflictKeySet(conflicts, workspaceId) {
    return new Set(arr(conflicts)
      .filter((item) => !workspaceId || item.workspaceId === workspaceId)
      .map((item) => objectKey(item.objectType, item.objectId)));
  }

  async function prepareCurrentLocalEvents(context, options = {}) {
    const { store, frontend, localImport } = context.deps;
    const states = await store.listObjectStates(context.workspaceId, storeOptions(options));
    const conflicts = await store.listConflicts(storeOptions(options));
    const blocked = conflictKeySet(conflicts, context.workspaceId);
    const snapshot = localImport.snapshotFromStorage(context.localStorage);
    const prepared = await frontend.prepareSnapshot(snapshot, {
      workspaceId: context.workspaceId,
      deviceId: context.deviceId,
      baseRevisions: revisionsMap(states),
      hash: context.deps.hash,
      store,
      localModels: localImport,
      now: options.now
    });
    const stateByKey = new Map(states.map((state) => [objectKey(state.objectType, state.objectId), state]));
    const localKeys = new Set(prepared.map((event) => objectKey(event.objectType, event.objectId)));
    const changed = [];

    for (const event of prepared) {
      const key = objectKey(event.objectType, event.objectId);
      if (blocked.has(key)) continue;
      const known = stateByKey.get(key);
      if (known && !known.deletedAt && event.operation === "upsert" && known.localPayloadHash === event.payloadHash) continue;
      changed.push(event);
    }

    const deletionTime = new Date(options.now instanceof Date ? options.now.getTime() : Number(options.now ?? Date.now())).toISOString();
    for (const known of states) {
      const key = objectKey(known.objectType, known.objectId);
      if (blocked.has(key) || known.deletedAt || localKeys.has(key)) continue;
      changed.push(await frontend.prepareRecord(known.objectType, { id: known.objectId, deletedAt: deletionTime }, {
        workspaceId: context.workspaceId,
        deviceId: context.deviceId,
        baseRevision: known.revision,
        hash: context.deps.hash,
        store
      }));
    }

    return { states, conflicts, blocked, prepared, changed };
  }

  async function enqueueChangedEvents(context, local, options = {}) {
    const { store } = context.deps;
    const pending = (await store.listPending(storeOptions(options))).filter((item) => item.workspaceId === context.workspaceId && item.deviceId === context.deviceId);
    const pendingByObject = new Map();
    for (const event of pending) {
      const key = objectKey(event.objectType, event.objectId);
      if (!pendingByObject.has(key)) pendingByObject.set(key, []);
      pendingByObject.get(key).push(event);
    }

    let enqueued = 0;
    let superseded = 0;
    for (const event of local.changed) {
      const key = objectKey(event.objectType, event.objectId);
      const existing = pendingByObject.get(key) || [];
      if (existing.some((item) => item.operation === event.operation && item.payloadHash === event.payloadHash && item.baseRevision === event.baseRevision)) continue;
      for (const old of existing) {
        await store.markOutboxResult(old.id, { status: "rejected", error: "superseded_by_newer_local_state" }, storeOptions(options));
        superseded += 1;
      }
      await store.enqueue(event, storeOptions(options));
      enqueued += 1;
    }
    return { enqueued, superseded };
  }

  async function pushOutbox(context, options = {}) {
    const { store, api } = context.deps;
    const pending = (await store.listPending(storeOptions(options)))
      .filter((item) => item.workspaceId === context.workspaceId && item.deviceId === context.deviceId)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    let cursor = await store.getCursor(context.workspaceId, context.deviceId, storeOptions(options));
    const summary = { attempted: 0, synced: 0, conflicts: 0, rejected: 0, retry: 0, conflictKeys: new Set() };

    for (const event of pending) {
      summary.attempted += 1;
      let result;
      try {
        result = await api.push({ ...event, idempotencyKey: event.id }, apiOptions(options));
      } catch (error) {
        const retryable = error?.retryable === true;
        await store.markOutboxResult(event.id, {
          status: retryable ? "retry" : "rejected",
          error: `${error?.code || error?.name || "sync_error"}: ${error?.message || "request failed"}`
        }, storeOptions(options));
        if (retryable) summary.retry += 1;
        else summary.rejected += 1;
        throw error;
      }

      if (result?.status === "conflict") {
        await store.markOutboxResult(event.id, {
          status: "conflict",
          reason: result.reason,
          conflictId: result.conflictId,
          serverRevision: result.serverRevision,
          serverPayloadHash: result.serverPayloadHash,
          serverState: result.serverState,
          deletedAt: result.deletedAt
        }, storeOptions(options));
        summary.conflicts += 1;
        summary.conflictKeys.add(objectKey(event.objectType, event.objectId));
        continue;
      }

      if (result?.status !== "synced") {
        await store.markOutboxResult(event.id, { status: "rejected", error: "unexpected_sync_push_result" }, storeOptions(options));
        summary.rejected += 1;
        throw new Error("unexpected canonical sync push result");
      }

      await store.markOutboxResult(event.id, {
        status: "synced",
        serverRevision: result.serverRevision,
        serverPayloadHash: result.serverPayloadHash,
        cursor: result.cursor,
        serverState: result.serverState,
        deletedAt: result.deletedAt
      }, storeOptions(options));
      await store.putObjectState({
        workspaceId: context.workspaceId,
        objectType: event.objectType,
        objectId: event.objectId,
        revision: nonNegativeInteger(result.serverRevision, "serverRevision"),
        serverPayloadHash: result.serverPayloadHash || null,
        localPayloadHash: event.operation === "upsert" ? event.payloadHash : null,
        deletedAt: event.operation === "delete" ? (result.deletedAt || new Date().toISOString()) : null,
        source: "push"
      }, storeOptions(options));
      if (event.operation === "delete" && result.deletedAt) {
        await store.putTombstone({
          workspaceId: context.workspaceId,
          objectType: event.objectType,
          objectId: event.objectId,
          revision: result.serverRevision,
          deletedAt: result.deletedAt,
          source: "server"
        }, storeOptions(options));
      }
      const serverCursor = result.cursor == null ? cursor.pushCursor : nonNegativeInteger(result.cursor, "cursor");
      if (serverCursor > cursor.pushCursor) {
        cursor = await store.advanceCursor({ ...cursor, pushCursor: serverCursor }, storeOptions(options));
      }
      summary.synced += 1;
    }
    return summary;
  }

  function validateReadPage(page, collectionName) {
    const source = obj(page);
    const rows = arr(source[collectionName]);
    const highWatermark = nonNegativeInteger(source.highWatermark, "highWatermark");
    return { source, rows, highWatermark };
  }

  async function applyServerEntries(context, entries, source, blockedKeys, options = {}) {
    const { localApply, store } = context.deps;
    const safeEntries = arr(entries).filter((entry) => !blockedKeys.has(objectKey(entry.objectType, entry.objectId)));
    if (!safeEntries.length) return { applied: 0, skippedConflicts: arr(entries).length };

    const prepared = localApply.prepareEntries(safeEntries, { storage: context.localStorage });
    const applied = localApply.writePrepared(prepared, { storage: context.localStorage });
    for (const entry of safeEntries) {
      const revision = nonNegativeInteger(entry.revision, "revision");
      await store.putObjectState({
        workspaceId: context.workspaceId,
        objectType: entry.objectType,
        objectId: entry.objectId,
        revision,
        serverPayloadHash: entry.payloadHash || null,
        localPayloadHash: null,
        deletedAt: entry.operation === "delete" ? entry.deletedAt : null,
        source
      }, storeOptions(options));
      if (entry.operation === "delete" && entry.deletedAt) {
        await store.putTombstone({
          workspaceId: context.workspaceId,
          objectType: entry.objectType,
          objectId: entry.objectId,
          revision,
          deletedAt: entry.deletedAt,
          source: "server"
        }, storeOptions(options));
      }
    }
    return { applied: applied.length, skippedConflicts: arr(entries).length - safeEntries.length };
  }

  async function bootstrap(context, blockedKeys, options = {}) {
    const { api, store } = context.deps;
    const pageLimit = Number(options.pageLimit || DEFAULT_PAGE_LIMIT);
    let afterKey = "";
    let highWatermark = null;
    let applied = 0;
    let skippedConflicts = 0;
    let pages = 0;

    while (true) {
      const result = await api.bootstrap({ workspaceId: context.workspaceId, afterKey, highWatermark, limit: pageLimit }, apiOptions(options));
      const page = validateReadPage(result, "objects");
      if (highWatermark === null) highWatermark = page.highWatermark;
      else if (page.highWatermark !== highWatermark) throw new Error("bootstrap highWatermark changed between pages");
      const appliedPage = await applyServerEntries(context, page.rows, "bootstrap", blockedKeys, options);
      applied += appliedPage.applied;
      skippedConflicts += appliedPage.skippedConflicts;
      pages += 1;
      if (page.source.hasMore !== true) break;
      const nextKey = text(page.source.nextKey);
      if (!nextKey || nextKey === afterKey) throw new Error("bootstrap pagination made no progress");
      afterKey = nextKey;
    }

    let cursor = await store.getCursor(context.workspaceId, context.deviceId, storeOptions(options));
    cursor = await store.advanceCursor({
      ...cursor,
      pullCursor: highWatermark || 0,
      bootstrapCompleted: true,
      bootstrapHighWatermark: highWatermark || 0
    }, storeOptions(options));
    return { pages, applied, skippedConflicts, highWatermark: highWatermark || 0, cursor };
  }

  async function pull(context, blockedKeys, options = {}) {
    const { api, store } = context.deps;
    const pageLimit = Number(options.pageLimit || DEFAULT_PAGE_LIMIT);
    let cursor = await store.getCursor(context.workspaceId, context.deviceId, storeOptions(options));
    let applied = 0;
    let skippedConflicts = 0;
    let pages = 0;

    while (true) {
      const result = await api.pull({ workspaceId: context.workspaceId, afterCursor: cursor.pullCursor, limit: pageLimit }, apiOptions(options));
      const page = validateReadPage(result, "changes");
      const nextCursor = nonNegativeInteger(page.source.nextCursor, "nextCursor");
      const appliedPage = await applyServerEntries(context, page.rows, "pull", blockedKeys, options);
      applied += appliedPage.applied;
      skippedConflicts += appliedPage.skippedConflicts;
      pages += 1;
      if (nextCursor < cursor.pullCursor) throw new Error("pull cursor moved backwards");
      if (page.source.hasMore === true && nextCursor === cursor.pullCursor) throw new Error("pull pagination made no progress");
      cursor = await store.advanceCursor({ ...cursor, pullCursor: nextCursor }, storeOptions(options));
      if (page.source.hasMore !== true) break;
    }
    return { pages, applied, skippedConflicts, cursor };
  }

  async function rebaselineLocalHashes(context, blockedKeys, options = {}) {
    const { store, frontend, localImport } = context.deps;
    const states = await store.listObjectStates(context.workspaceId, storeOptions(options));
    const snapshot = localImport.snapshotFromStorage(context.localStorage);
    const prepared = await frontend.prepareSnapshot(snapshot, {
      workspaceId: context.workspaceId,
      deviceId: context.deviceId,
      baseRevisions: revisionsMap(states),
      hash: context.deps.hash,
      store,
      localModels: localImport,
      now: options.now
    });
    const stateByKey = new Map(states.map((state) => [objectKey(state.objectType, state.objectId), state]));
    let updated = 0;
    for (const event of prepared) {
      const key = objectKey(event.objectType, event.objectId);
      const current = stateByKey.get(key);
      if (!current || blockedKeys.has(key) || current.deletedAt || event.operation !== "upsert") continue;
      await store.putObjectState({ ...current, localPayloadHash: event.payloadHash }, storeOptions(options));
      updated += 1;
    }
    return updated;
  }

  async function run(options = {}) {
    if (options.explicitUserAction !== true) throw new Error("canonical manual sync requires explicitUserAction=true");
    const deps = dependencies(options);
    const localStorage = storage(options);
    const deviceId = resolveDeviceId(options);
    const workspaceId = await resolveWorkspaceId(deps.api, options);
    const context = { deps, localStorage, deviceId, workspaceId };

    const local = await prepareCurrentLocalEvents(context, options);
    const enqueue = await enqueueChangedEvents(context, local, options);
    const pushed = await pushOutbox(context, options);
    const conflicts = await deps.store.listConflicts(storeOptions(options));
    const blockedKeys = conflictKeySet(conflicts, workspaceId);
    let cursor = await deps.store.getCursor(workspaceId, deviceId, storeOptions(options));
    let bootstrapResult = null;
    if (!cursor.bootstrapCompleted) {
      bootstrapResult = await bootstrap(context, blockedKeys, options);
      cursor = bootstrapResult.cursor;
    }
    const pullResult = await pull(context, blockedKeys, options);
    const rebaselined = await rebaselineLocalHashes(context, blockedKeys, options);
    cursor = await deps.store.getCursor(workspaceId, deviceId, storeOptions(options));

    return {
      version: VERSION,
      mode: "explicit_manual_canonical_sync",
      workspaceId,
      deviceId,
      local: { prepared: local.prepared.length, changed: local.changed.length, blockedByExistingConflict: local.blocked.size },
      enqueue,
      push: { attempted: pushed.attempted, synced: pushed.synced, conflicts: pushed.conflicts, rejected: pushed.rejected, retry: pushed.retry },
      bootstrap: bootstrapResult ? { pages: bootstrapResult.pages, applied: bootstrapResult.applied, skippedConflicts: bootstrapResult.skippedConflicts, highWatermark: bootstrapResult.highWatermark } : null,
      pull: { pages: pullResult.pages, applied: pullResult.applied, skippedConflicts: pullResult.skippedConflicts },
      conflicts: conflicts.filter((item) => item.workspaceId === workspaceId).map((item) => ({
        id: item.id,
        objectType: item.objectType,
        objectId: item.objectId,
        operation: item.operation,
        reason: item.conflictReason,
        baseRevision: item.baseRevision,
        serverRevision: item.serverRevision,
        serverPayloadHash: item.serverPayloadHash,
        serverState: item.serverState,
        deletedAt: item.deletedAt
      })),
      rebaselined,
      cursor,
      autoSync: false,
      loginTriggered: false
    };
  }

  function getStatus() {
    return {
      version: VERSION,
      autoSync: false,
      loginTriggersSync: false,
      executesOnLoad: false,
      requiresExplicitUserAction: true,
      legacySyncRoutesUsed: false,
      nextActivation: "staging_explicit_control_only"
    };
  }

  const api = Object.freeze({
    VERSION,
    DEVICE_ID_STORAGE_KEY,
    resolveDeviceId,
    resolveWorkspaceId,
    prepareCurrentLocalEvents,
    enqueueChangedEvents,
    pushOutbox,
    applyServerEntries,
    bootstrap,
    pull,
    rebaselineLocalHashes,
    run,
    getStatus
  });

  global.AHACanonicalManualSyncRunner = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
