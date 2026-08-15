const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createHash, webcrypto } = require("node:crypto");

const paths = [
  "js/ahaCanonicalManualSyncRunner.js",
  "js/ahaCanonicalSyncApiClient.js",
  "js/ahaCanonicalLocalApplyAdapter.js",
  "js/ahaCanonicalSyncStore.js",
  "js/ahaCanonicalFrontendSyncAdapter.js",
  "js/ahaCanonicalSyncHash.js",
  "js/ahaLocalAccountImport.js"
];
for (const relative of paths) assert.equal(fs.existsSync(relative), true, `${relative} mangler`);

const runnerSource = fs.readFileSync("js/ahaCanonicalManualSyncRunner.js", "utf8");
const apiSource = fs.readFileSync("js/ahaCanonicalSyncApiClient.js", "utf8");
const applySource = fs.readFileSync("js/ahaCanonicalLocalApplyAdapter.js", "utf8");
const storeSource = fs.readFileSync("js/ahaCanonicalSyncStore.js", "utf8");

assert.match(runnerSource, /explicitUserAction\s*!==\s*true/);
assert.match(runnerSource, /requiresExplicitWorkspaceId:\s*true/);
assert.match(runnerSource, /workspaceDiscovery:\s*false/);
assert.doesNotMatch(runnerSource, /syncFromDatabase\s*\(/);
assert.doesNotMatch(runnerSource, /addEventListener\s*\(/);
assert.doesNotMatch(runnerSource, /aha:auth-ready|SIGNED_IN|TOKEN_REFRESHED/);
assert.doesNotMatch(apiSource, /addEventListener\s*\(|setInterval\s*\(|setTimeout\s*\(/);
assert.doesNotMatch(applySource, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
for (const forbiddenKey of ["aha_notes_v1", "aha_gallery_v1", "aha_feed_v1", "aha_insta_v1", "aha_music_library_v1", "aha_training_corpus_v1"]) {
  assert.doesNotMatch(applySource, new RegExp(forbiddenKey), `${forbiddenKey} must stay outside canonical local apply`);
}

function loadBrowserScript(source, extra = {}) {
  const context = {
    window: null,
    globalThis: null,
    console,
    Date,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Promise,
    Map,
    Set,
    Uint8Array,
    TextEncoder,
    crypto: webcrypto,
    encodeURIComponent,
    ...extra
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context;
}

function memoryStorage(seed = {}, failKey = null) {
  const values = new Map(Object.entries(seed));
  let failed = false;
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      if (failKey && key === failKey && !failed) {
        failed = true;
        throw new Error(`injected storage failure: ${key}`);
      }
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); }
  };
}

async function testApiClientIsInertAndBounded() {
  let fetchCalls = 0;
  let authCalls = 0;
  const requests = [];
  const context = loadBrowserScript(apiSource, {
    AHAAuth: { async getSession() { authCalls += 1; return { access_token: "session-token" }; } },
    fetch: async (url, init) => {
      fetchCalls += 1;
      requests.push({ url, init });
      return { ok: true, status: 200, async json() { return { data: { status: "synced" }, meta: { requestId: "r", apiVersion: "v" } }; } };
    }
  });
  const api = context.AHACanonicalSyncApiClient;
  assert.ok(api);
  assert.equal(fetchCalls, 0, "loading API client must not perform network I/O");
  assert.equal(authCalls, 0, "loading API client must not read auth state");

  const hash = "a".repeat(64);
  await api.push({
    workspaceId: "workspace-1",
    deviceId: "device-1",
    idempotencyKey: `sync:${"b".repeat(64)}`,
    objectType: "conversation",
    objectId: "conversation-1",
    operation: "upsert",
    baseRevision: 0,
    payloadHash: hash,
    payload: { id: "conversation-1", title: "A" }
  }, { apiBaseUrl: "https://api.example", accessToken: "explicit-token", fetch: context.fetch });
  assert.equal(authCalls, 0, "explicit token must not cause a session lookup");
  assert.equal(fetchCalls, 1);
  assert.equal(requests[0].url, "https://api.example/v1/sync/push");
  assert.equal(requests[0].init.headers.authorization, "Bearer explicit-token");
  const pushBody = JSON.parse(requests[0].init.body);
  assert.equal(pushBody.idempotencyKey.length, 69);
  assert.equal(pushBody.idempotencyKey.startsWith("sync:"), true);

  await assert.rejects(() => api.push({
    workspaceId: "workspace-1", deviceId: "device-1", objectType: "conversation", objectId: "conversation-1",
    operation: "delete", baseRevision: 1, payloadHash: hash, payload: null
  }, { apiBaseUrl: "https://api.example", accessToken: "explicit-token", fetch: context.fetch }), /idempotencyKey is required/);
  assert.equal(fetchCalls, 1, "invalid push must fail before fetch");

  await api.pull({ workspaceId: "workspace-1", afterCursor: 3, limit: 20 }, {
    apiBaseUrl: "https://api.example",
    auth: context.AHAAuth,
    fetch: context.fetch
  });
  assert.equal(authCalls, 1);
  assert.equal(fetchCalls, 2);
  assert.match(requests[1].url, /\/v1\/sync\/pull\?workspaceId=workspace-1&afterCursor=3&limit=20$/);
}

function testStoreV2PureContract() {
  const context = loadBrowserScript(storeSource, { module: { exports: {} }, exports: {} });
  const store = context.AHACanonicalSyncStore;
  const status = store.getStatus();
  assert.equal(status.database, "aha_canonical_sync_v1");
  assert.equal(status.databaseVersion, 2);
  assert.equal(Array.from(status.stores).includes("object_states"), true);
  assert.equal(status.networkEnabled, false);
  assert.equal(status.loginTriggersSync, false);

  const payloadHash = "c".repeat(64);
  const base = {
    workspaceId: "workspace-1", deviceId: "device-1", objectType: "insight", objectId: "insight-1",
    operation: "upsert", payloadHash, payload: { id: "insight-1" }
  };
  const revisionOne = store.normalizeOutboxEvent({ ...base, baseRevision: 1 });
  const revisionTwo = store.normalizeOutboxEvent({ ...base, baseRevision: 2 });
  assert.notEqual(revisionOne.id, revisionTwo.id, "outbox identity must bind baseRevision");
  assert.match(revisionOne.id, /:1:[a-f0-9]{64}$/);

  const state = store.normalizeObjectState({
    workspaceId: "workspace-1", objectType: "insight", objectId: "insight-1", revision: 4,
    serverPayloadHash: "d".repeat(64), localPayloadHash: "e".repeat(64), source: "pull"
  });
  assert.equal(state.revision, 4);
  assert.equal(state.localPayloadHash, "e".repeat(64));
  assert.equal(state.id, "workspace-1:insight:insight-1");
}

function testLocalApplyAllTenAndIsolation() {
  const context = loadBrowserScript(applySource, { module: { exports: {} }, exports: {} });
  const apply = context.AHACanonicalLocalApplyAdapter;
  const localOnlySentinel = "LOCAL_ONLY_SENTINEL_9271";
  const storage = memoryStorage({
    aha_chat_sessions_v1: "[]",
    aha_source_events_v1: "[]",
    aha_insight_chamber_v1: JSON.stringify({ insights: [] }),
    aha_concept_lists_v1: "[]",
    aha_paths_v1: "[]",
    aha_articles_v1: "[]",
    aha_notes_v1: localOnlySentinel,
    aha_gallery_v1: localOnlySentinel,
    aha_music_library_v1: localOnlySentinel,
    aha_training_corpus_v1: localOnlySentinel
  });

  const entries = [
    { objectType: "conversation", objectId: "c1", operation: "upsert", revision: 1, payloadHash: "1".repeat(64), payload: { id: "c1", conversation_type: "personal_ai", title: "Samtale", status: "active", source_app: "aha_chat", metadata: {}, created_at: "2026-08-15T10:00:00Z" } },
    { objectType: "message", objectId: "m1", operation: "upsert", revision: 1, payloadHash: "2".repeat(64), payload: { id: "m1", conversation_id: "c1", role: "user", content: "Hei", source_app: "aha_chat", tags: [], concepts: [], metadata: {}, created_at: "2026-08-15T10:01:00Z" } },
    { objectType: "source_event", objectId: "s1", operation: "upsert", revision: 1, payloadHash: "3".repeat(64), payload: { id: "s1", conversation_id: "c1", message_id: "m1", source_type: "chat_message", source_app: "aha_chat", content_type: "text", title: "Kilde", source_text: "Hei", user_created: true, imported: false, occurred_at: "2026-08-15T10:01:00Z", tags: [], provenance: {}, metadata: {} } },
    { objectType: "insight", objectId: "i1", operation: "upsert", revision: 2, payloadHash: "4".repeat(64), payload: { id: "i1", source_event_id: "s1", functional_type: "observation", status: "active", sharing_scope: "private", metadata: {}, version: { title: "Innsikt", summary: "Kort", insight_text: "Presis", concepts: ["A"], confidence: 0.8, provenance: {} } } },
    { objectType: "concept_list", objectId: "l1", operation: "upsert", revision: 1, payloadHash: "5".repeat(64), payload: { id: "l1", title: "Begreper", list_type: "concepts", description: "", source: "aha_lists", sharing_scope: "private", tags: [], metadata: {} } },
    { objectType: "concept_list_item", objectId: "li1", operation: "upsert", revision: 1, payloadHash: "6".repeat(64), payload: { id: "li1", list_id: "l1", title: "Resonans", item_type: "concept", source: "aha_analysis", ref_id: "i1", position: 0, metadata: {} } },
    { objectType: "knowledge_path", objectId: "p1", operation: "upsert", revision: 1, payloadHash: "7".repeat(64), payload: { id: "p1", title: "Sti", path_type: "learning", description: "", goal: "Forstå", learning_outcome: "Kan forklare", source: "aha_paths", sharing_scope: "private", tags: [], metadata: {} } },
    { objectType: "knowledge_path_step", objectId: "ps1", operation: "upsert", revision: 1, payloadHash: "8".repeat(64), payload: { id: "ps1", path_id: "p1", title: "Les", step_type: "item", source: "aha_analysis", ref_id: "i1", position: 0, status: "planned", metadata: {} } },
    { objectType: "article", objectId: "a1", operation: "upsert", revision: 1, payloadHash: "9".repeat(64), payload: { id: "a1", section: "aha", status: "draft", publication_scope: "personal", source: "aha_avisa", tags: [], metadata: {}, version: { title: "Artikkel", summary: "Sammendrag", body: "Brødtekst", provenance: {} } } },
    { objectType: "article_reference", objectId: "ar1", operation: "upsert", revision: 1, payloadHash: "a".repeat(64), payload: { id: "ar1", article_id: "a1", title: "Innsikt", reference_type: "insight", source: "aha_insights", ref_id: "i1", position: 0, metadata: {} } }
  ];

  const applied = apply.applyEntries(entries, { storage });
  assert.equal(applied.length, 10);
  const conversations = JSON.parse(storage.getItem("aha_chat_sessions_v1"));
  assert.equal(conversations[0].id, "c1");
  assert.equal(conversations[0].messages[0].id, "m1");
  const lists = JSON.parse(storage.getItem("aha_concept_lists_v1"));
  assert.equal(lists[0].terms[0].id, "li1");
  const pathsState = JSON.parse(storage.getItem("aha_paths_v1"));
  assert.equal(pathsState[0].steps[0].id, "ps1");
  const articles = JSON.parse(storage.getItem("aha_articles_v1"));
  assert.equal(articles[0].references[0].id, "ar1");
  const chamber = JSON.parse(storage.getItem("aha_insight_chamber_v1"));
  assert.equal(chamber.insights[0].text, "Presis");

  for (const key of ["aha_notes_v1", "aha_gallery_v1", "aha_music_library_v1", "aha_training_corpus_v1"]) {
    assert.equal(storage.getItem(key), localOnlySentinel, `${key} leaked into canonical local apply`);
  }

  apply.applyEntries([{ objectType: "message", objectId: "m1", operation: "delete", revision: 2, payloadHash: "b".repeat(64), payload: null, deletedAt: "2026-08-15T11:00:00Z" }], { storage });
  assert.equal(JSON.parse(storage.getItem("aha_chat_sessions_v1"))[0].messages.length, 0);

  const empty = memoryStorage({
    aha_chat_sessions_v1: "[]", aha_source_events_v1: "[]", aha_insight_chamber_v1: JSON.stringify({ insights: [] }),
    aha_concept_lists_v1: "[]", aha_paths_v1: "[]", aha_articles_v1: "[]"
  });
  const beforeEmpty = JSON.stringify(Object.fromEntries(empty.values));
  assert.throws(() => apply.applyEntries([{ objectType: "message", objectId: "orphan", operation: "upsert", revision: 1, payloadHash: "c".repeat(64), payload: { id: "orphan", conversation_id: "missing", role: "user", content: "x", source_app: "aha_chat" } }], { storage: empty }), /parent conversation missing/);
  assert.equal(JSON.stringify(Object.fromEntries(empty.values)), beforeEmpty, "invalid server page must fail before local writes");

  const rollbackSeed = {
    aha_chat_sessions_v1: "[]", aha_source_events_v1: "[]", aha_insight_chamber_v1: JSON.stringify({ insights: [] }),
    aha_concept_lists_v1: "[]", aha_paths_v1: "[]", aha_articles_v1: "[]"
  };
  const failing = memoryStorage(rollbackSeed, "aha_source_events_v1");
  assert.throws(() => apply.applyEntries([entries[0]], { storage: failing }), /injected storage failure/);
  assert.deepEqual(Object.fromEntries(failing.values), rollbackSeed, "local apply must rollback earlier writes after a storage failure");
}

function sha(value) {
  const canonical = JSON.stringify(value, Object.keys(value || {}).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

function makeFakeStore({ states = [], cursor = null, outbox = [] } = {}) {
  const stateMap = new Map(states.map((state) => [`${state.objectType}:${state.objectId}`, { ...state }]));
  const rows = outbox.map((item) => ({ ...item }));
  let currentCursor = cursor ? { ...cursor } : { id: "device-1:workspace-1", workspaceId: "workspace-1", deviceId: "device-1", pullCursor: 0, pushCursor: 0, bootstrapCompleted: false, bootstrapHighWatermark: null };
  const tombstones = [];
  let enqueueCount = 0;
  return {
    rows,
    stateMap,
    tombstones,
    get enqueueCount() { return enqueueCount; },
    assertSyncableObjectType(value) { return value; },
    normalizeOutboxEvent(value) { return { status: "pending", retryCount: 0, createdAt: value.createdAt || "2026-08-15T10:00:00.000Z", updatedAt: value.createdAt || "2026-08-15T10:00:00.000Z", ...value }; },
    async listPending() { return rows.filter((row) => row.status === "pending" || row.status === "retry").map((row) => ({ ...row })); },
    async listConflicts() { return rows.filter((row) => row.status === "conflict").map((row) => ({ ...row })); },
    async listObjectStates(workspaceId) { return Array.from(stateMap.values()).filter((state) => state.workspaceId === workspaceId).map((state) => ({ ...state })); },
    async enqueue(event) {
      enqueueCount += 1;
      rows.push({ status: "pending", retryCount: 0, createdAt: event.createdAt || `2026-08-15T10:00:0${enqueueCount}.000Z`, updatedAt: event.createdAt || `2026-08-15T10:00:0${enqueueCount}.000Z`, ...event });
      return event.id;
    },
    async markOutboxResult(id, result) {
      const row = rows.find((item) => item.id === id);
      if (!row) throw new Error("outbox event not found");
      row.status = result.status;
      row.lastError = result.error || null;
      row.serverRevision = result.serverRevision ?? null;
      row.serverPayloadHash = result.serverPayloadHash ?? null;
      row.serverCursor = result.cursor ?? null;
      row.conflictReason = result.reason || result.conflictReason || null;
      row.conflictId = result.conflictId || null;
      row.serverState = result.serverState ?? null;
      row.deletedAt = result.deletedAt || null;
      return true;
    },
    async getCursor() { return { ...currentCursor }; },
    async advanceCursor(next) {
      assert.ok(next.pullCursor >= currentCursor.pullCursor);
      assert.ok(next.pushCursor >= currentCursor.pushCursor);
      currentCursor = { ...currentCursor, ...next, bootstrapCompleted: currentCursor.bootstrapCompleted || next.bootstrapCompleted, bootstrapHighWatermark: next.bootstrapHighWatermark ?? currentCursor.bootstrapHighWatermark };
      return { ...currentCursor };
    },
    async putObjectState(next) {
      const key = `${next.objectType}:${next.objectId}`;
      const current = stateMap.get(key);
      if (current && Number(current.revision) > Number(next.revision)) return { ...current };
      const merged = {
        ...current,
        ...next,
        localPayloadHash: next.localPayloadHash ?? current?.localPayloadHash ?? null,
        serverPayloadHash: next.serverPayloadHash ?? current?.serverPayloadHash ?? null
      };
      stateMap.set(key, merged);
      return { ...merged };
    },
    async putTombstone(next) { tombstones.push({ ...next }); return { ...next }; }
  };
}

function makeEvent({ hash = "1".repeat(64), revision = 0, operation = "upsert", objectId = "c1" } = {}) {
  return {
    id: `device-1:workspace-1:conversation:${objectId}:${operation}:${revision}:${hash}`,
    workspaceId: "workspace-1",
    deviceId: "device-1",
    objectType: "conversation",
    objectId,
    operation,
    baseRevision: revision,
    payloadHash: hash,
    payload: operation === "upsert" ? { id: objectId, conversation_type: "personal_ai", title: "Local", status: "active", source_app: "aha_chat", metadata: {} } : null,
    createdAt: "2026-08-15T10:00:00.000Z"
  };
}

function makeFrontend(getHashes) {
  return {
    async prepareSnapshot(snapshot, options) {
      return getHashes().map((item) => makeEvent({ hash: item.hash, revision: options.baseRevisions?.[`conversation:${item.objectId || "c1"}`] || 0, objectId: item.objectId || "c1" }));
    },
    async prepareRecord(objectType, localRecord, options) {
      assert.equal(objectType, "conversation");
      return makeEvent({ hash: "d".repeat(64), revision: options.baseRevision, operation: "delete", objectId: localRecord.id });
    }
  };
}

function makeLocalApply() {
  const calls = [];
  return {
    calls,
    prepareEntries(entries) { return { entries: entries.map((entry) => ({ ...entry })) }; },
    writePrepared(prepared) {
      calls.push(prepared.entries.map((entry) => ({ ...entry })));
      return prepared.entries.map((entry) => ({ objectType: entry.objectType, objectId: entry.objectId, operation: entry.operation }));
    }
  };
}

function loadRunner() {
  const context = loadBrowserScript(runnerSource, { module: { exports: {} }, exports: {} });
  return context.AHACanonicalManualSyncRunner;
}

function fakeHash() {
  return {
    async canonicalSyncPayloadHash(value) {
      return createHash("sha256").update(JSON.stringify(value)).digest("hex");
    }
  };
}

async function testRunnerFirstRunThenDeltaOnly() {
  const runner = loadRunner();
  const store = makeFakeStore();
  let localHashes = [{ hash: "1".repeat(64) }];
  const frontendAdapter = makeFrontend(() => localHashes);
  const localApply = makeLocalApply();
  const localImport = { snapshotFromStorage() { return {}; } };
  const hash = fakeHash();
  const pushCalls = [];
  const bootstrapCalls = [];
  const pullCalls = [];
  const api = {
    async push(event) {
      pushCalls.push({ ...event });
      return { status: "synced", serverRevision: 1, serverPayloadHash: "a".repeat(64), cursor: 1, serverState: event.payload, deletedAt: null };
    },
    async bootstrap(input) {
      bootstrapCalls.push({ ...input });
      if (bootstrapCalls.length === 1) {
        return {
          highWatermark: 5, hasMore: true, nextKey: "conversation\u001fc1",
          objects: [{ objectType: "conversation", objectId: "c1", operation: "upsert", revision: 1, payloadHash: "a".repeat(64), deletedAt: null, payload: makeEvent().payload }]
        };
      }
      return { highWatermark: 5, hasMore: false, nextKey: "conversation\u001fc1", objects: [] };
    },
    async pull(input) {
      pullCalls.push({ ...input });
      return { highWatermark: 5, nextCursor: input.afterCursor, hasMore: false, changes: [] };
    }
  };
  const storage = memoryStorage();

  let hiddenIoTouched = false;
  await assert.rejects(() => runner.run({
    explicitUserAction: false,
    get store() { hiddenIoTouched = true; return store; }
  }), /explicitUserAction=true/);
  assert.equal(hiddenIoTouched, false, "no dependency may be touched without explicit user action");

  const result = await runner.run({
    explicitUserAction: true,
    workspaceId: "workspace-1",
    deviceId: "device-1",
    store,
    frontendAdapter,
    localImport,
    localApply,
    hash,
    api,
    storage,
    now: new Date("2026-08-15T12:00:00Z")
  });
  assert.equal(result.push.synced, 1);
  assert.equal(result.bootstrap.pages, 2);
  assert.equal(result.bootstrap.highWatermark, 5);
  assert.equal(result.pull.pages, 1);
  assert.equal(bootstrapCalls[0].highWatermark, null);
  assert.equal(bootstrapCalls[1].highWatermark, 5, "follow-up bootstrap page must reuse the fixed watermark");
  assert.equal(pullCalls[0].afterCursor, 5, "delta pull must begin at the completed bootstrap watermark");
  assert.equal(pushCalls.length, 1);
  assert.match(pushCalls[0].idempotencyKey, /^sync:[a-f0-9]{64}$/);
  assert.ok(pushCalls[0].idempotencyKey.length <= 256);
  assert.notEqual(pushCalls[0].idempotencyKey, pushCalls[0].id, "long IndexedDB event identity must not be reused as HTTP idempotency key");
  assert.equal(store.stateMap.get("conversation:c1").localPayloadHash, "1".repeat(64));

  const bootstrapCount = bootstrapCalls.length;
  const pushCount = pushCalls.length;
  const second = await runner.run({
    explicitUserAction: true,
    workspaceId: "workspace-1",
    deviceId: "device-1",
    store,
    frontendAdapter,
    localImport,
    localApply,
    hash,
    api,
    storage,
    now: new Date("2026-08-15T12:05:00Z")
  });
  assert.equal(second.local.changed, 0, "unchanged local canonical data must not be re-enqueued");
  assert.equal(second.enqueue.enqueued, 0);
  assert.equal(pushCalls.length, pushCount, "unchanged second run must not push again");
  assert.equal(bootstrapCalls.length, bootstrapCount, "bootstrap is first-run only");
  assert.equal(second.bootstrap, null);
}

async function testRunnerConflictIsNeverAutoApplied() {
  const runner = loadRunner();
  const store = makeFakeStore({
    states: [{ workspaceId: "workspace-1", objectType: "conversation", objectId: "c1", revision: 1, serverPayloadHash: "a".repeat(64), localPayloadHash: "1".repeat(64), deletedAt: null, source: "push" }],
    cursor: { workspaceId: "workspace-1", deviceId: "device-1", pullCursor: 5, pushCursor: 1, bootstrapCompleted: true, bootstrapHighWatermark: 5 }
  });
  const frontendAdapter = makeFrontend(() => [{ hash: "2".repeat(64) }]);
  const localApply = makeLocalApply();
  const api = {
    async push() {
      return { status: "conflict", reason: "stale_base_revision", conflictId: "conflict-1", serverRevision: 2, serverPayloadHash: "b".repeat(64), serverState: { id: "c1", title: "Server" }, deletedAt: null };
    },
    async bootstrap() { throw new Error("bootstrap must not run after completed bootstrap"); },
    async pull() {
      return {
        highWatermark: 6, nextCursor: 6, hasMore: false,
        changes: [{ objectType: "conversation", objectId: "c1", operation: "upsert", revision: 2, payloadHash: "b".repeat(64), deletedAt: null, payload: { id: "c1", title: "Server" } }]
      };
    }
  };
  const result = await runner.run({
    explicitUserAction: true, workspaceId: "workspace-1", deviceId: "device-1",
    store, frontendAdapter, localImport: { snapshotFromStorage() { return {}; } }, localApply,
    hash: fakeHash(), api, storage: memoryStorage()
  });
  assert.equal(result.push.conflicts, 1);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].reason, "stale_base_revision");
  assert.equal(result.pull.skippedConflicts, 1);
  assert.equal(localApply.calls.length, 0, "server state for a conflicted object must never overwrite local data automatically");
  assert.equal(store.stateMap.get("conversation:c1").revision, 1, "conflict must not silently advance local server revision state");
}

async function testRunnerInferredDeleteAndRetryStop() {
  const runner = loadRunner();
  const store = makeFakeStore({
    states: [{ workspaceId: "workspace-1", objectType: "conversation", objectId: "c1", revision: 3, serverPayloadHash: "a".repeat(64), localPayloadHash: "1".repeat(64), deletedAt: null, source: "pull" }],
    cursor: { workspaceId: "workspace-1", deviceId: "device-1", pullCursor: 5, pushCursor: 2, bootstrapCompleted: true, bootstrapHighWatermark: 5 }
  });
  const frontendAdapter = makeFrontend(() => []);
  const pushed = [];
  const api = {
    async push(event) {
      pushed.push({ ...event });
      return { status: "synced", serverRevision: 4, serverPayloadHash: "f".repeat(64), cursor: 7, serverState: null, deletedAt: "2026-08-15T12:00:00Z" };
    },
    async bootstrap() { throw new Error("unexpected bootstrap"); },
    async pull(input) { return { highWatermark: 7, nextCursor: input.afterCursor, hasMore: false, changes: [] }; }
  };
  const result = await runner.run({
    explicitUserAction: true, workspaceId: "workspace-1", deviceId: "device-1",
    store, frontendAdapter, localImport: { snapshotFromStorage() { return {}; } }, localApply: makeLocalApply(),
    hash: fakeHash(), api, storage: memoryStorage(), now: new Date("2026-08-15T12:00:00Z")
  });
  assert.equal(result.local.changed, 1);
  assert.equal(pushed[0].operation, "delete");
  assert.equal(pushed[0].baseRevision, 3, "hard local removal must become a delete against the last known server revision");
  assert.equal(store.stateMap.get("conversation:c1").deletedAt, "2026-08-15T12:00:00Z");

  const retryStore = makeFakeStore();
  const retryFrontend = makeFrontend(() => [{ hash: "9".repeat(64) }]);
  let bootstrapCalls = 0;
  let pullCalls = 0;
  const networkError = Object.assign(new Error("offline"), { retryable: true, code: "CANONICAL_SYNC_NETWORK_ERROR" });
  await assert.rejects(() => runner.run({
    explicitUserAction: true, workspaceId: "workspace-1", deviceId: "device-1",
    store: retryStore, frontendAdapter: retryFrontend, localImport: { snapshotFromStorage() { return {}; } }, localApply: makeLocalApply(),
    hash: fakeHash(),
    api: {
      async push() { throw networkError; },
      async bootstrap() { bootstrapCalls += 1; return {}; },
      async pull() { pullCalls += 1; return {}; }
    },
    storage: memoryStorage()
  }), /offline/);
  assert.equal(retryStore.rows[0].status, "retry");
  assert.equal(bootstrapCalls, 0, "read phase must not start after failed push");
  assert.equal(pullCalls, 0, "read phase must not start after failed push");
}

async function main() {
  await testApiClientIsInertAndBounded();
  testStoreV2PureContract();
  testLocalApplyAllTenAndIsolation();
  await testRunnerFirstRunThenDeltaOnly();
  await testRunnerConflictIsNeverAutoApplied();
  await testRunnerInferredDeleteAndRetryStop();
  console.log("aha-canonical-manual-sync-runner-v1.test.cjs passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
