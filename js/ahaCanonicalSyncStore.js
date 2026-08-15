// ahaCanonicalSyncStore.js
// Local-only persistence boundary for future canonical bidirectional sync.
// No network calls, no login hooks and no automatic execution.

(function () {
  "use strict";

  const DB_NAME = "aha_canonical_sync_v1";
  const DB_VERSION = 1;
  const OUTBOX_STORE = "outbox";
  const CURSOR_STORE = "cursors";
  const TOMBSTONE_STORE = "tombstones";

  const ALLOWED_OBJECT_TYPES = Object.freeze([
    "conversation",
    "message",
    "source_event",
    "insight",
    "concept_list",
    "concept_list_item",
    "knowledge_path",
    "knowledge_path_step",
    "article",
    "article_reference"
  ]);

  const FORBIDDEN_LOCAL_ONLY_TYPES = Object.freeze([
    "note",
    "gallery_item",
    "feed_post",
    "insta_post",
    "music_item",
    "training_item",
    "personal_ai_state",
    "workbench_state"
  ]);

  const OPERATIONS = Object.freeze(["upsert", "delete"]);

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function nonEmpty(value, field) {
    const text = String(value || "").trim();
    if (!text) throw new Error(`${field} is required`);
    return text;
  }

  function normalizeRevision(value) {
    const revision = Number(value || 0);
    if (!Number.isInteger(revision) || revision < 0) throw new Error("baseRevision must be a non-negative integer");
    return revision;
  }

  function normalizeHash(value) {
    const hash = String(value || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("payloadHash must be a sha256 hex digest");
    return hash;
  }

  function assertSyncableObjectType(objectType) {
    const type = nonEmpty(objectType, "objectType");
    if (FORBIDDEN_LOCAL_ONLY_TYPES.includes(type)) throw new Error(`local-only object type cannot enter sync outbox: ${type}`);
    if (!ALLOWED_OBJECT_TYPES.includes(type)) throw new Error(`unsupported canonical sync object type: ${type}`);
    return type;
  }

  function normalizeOutboxEvent(input) {
    const source = input && typeof input === "object" ? input : {};
    const objectType = assertSyncableObjectType(source.objectType);
    const operation = nonEmpty(source.operation, "operation");
    if (!OPERATIONS.includes(operation)) throw new Error(`unsupported sync operation: ${operation}`);
    const objectId = nonEmpty(source.objectId, "objectId");
    const workspaceId = nonEmpty(source.workspaceId, "workspaceId");
    const deviceId = nonEmpty(source.deviceId, "deviceId");
    const payloadHash = normalizeHash(source.payloadHash);
    const baseRevision = normalizeRevision(source.baseRevision);
    const now = source.createdAt || new Date().toISOString();
    const id = nonEmpty(source.id || `${deviceId}:${workspaceId}:${objectType}:${objectId}:${operation}:${payloadHash}`, "id");

    if (operation === "upsert" && (!source.payload || typeof source.payload !== "object" || Array.isArray(source.payload))) {
      throw new Error("upsert outbox event requires an object payload");
    }
    if (operation === "delete" && source.payload != null) throw new Error("delete outbox event must not carry object payload");

    return {
      id,
      workspaceId,
      deviceId,
      objectType,
      objectId,
      operation,
      baseRevision,
      payloadHash,
      payload: operation === "upsert" ? clone(source.payload) : null,
      status: "pending",
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
      lastError: null
    };
  }

  function normalizeCursor(input) {
    const source = input && typeof input === "object" ? input : {};
    const workspaceId = nonEmpty(source.workspaceId, "workspaceId");
    const deviceId = nonEmpty(source.deviceId, "deviceId");
    const pullCursor = Number(source.pullCursor || 0);
    const pushCursor = Number(source.pushCursor || 0);
    if (!Number.isInteger(pullCursor) || pullCursor < 0 || !Number.isInteger(pushCursor) || pushCursor < 0) {
      throw new Error("sync cursors must be non-negative integers");
    }
    return { id: `${deviceId}:${workspaceId}`, workspaceId, deviceId, pullCursor, pushCursor, updatedAt: source.updatedAt || new Date().toISOString() };
  }

  function normalizeTombstone(input) {
    const source = input && typeof input === "object" ? input : {};
    const objectType = assertSyncableObjectType(source.objectType);
    return {
      id: `${nonEmpty(source.workspaceId, "workspaceId")}:${objectType}:${nonEmpty(source.objectId, "objectId")}`,
      workspaceId: String(source.workspaceId),
      objectType,
      objectId: String(source.objectId),
      revision: normalizeRevision(source.revision),
      deletedAt: nonEmpty(source.deletedAt, "deletedAt"),
      source: source.source === "server" ? "server" : "local"
    };
  }

  function openDatabase(indexedDBImpl) {
    const indexedDB = indexedDBImpl || (typeof window !== "undefined" ? window.indexedDB : null);
    if (!indexedDB || typeof indexedDB.open !== "function") return Promise.reject(new Error("IndexedDB unavailable"));
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
          const store = db.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
          store.createIndex("status_createdAt", ["status", "createdAt"], { unique: false });
          store.createIndex("workspace_status", ["workspaceId", "status"], { unique: false });
        }
        if (!db.objectStoreNames.contains(CURSOR_STORE)) db.createObjectStore(CURSOR_STORE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(TOMBSTONE_STORE)) {
          const store = db.createObjectStore(TOMBSTONE_STORE, { keyPath: "id" });
          store.createIndex("workspace_object", ["workspaceId", "objectType", "objectId"], { unique: true });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    });
  }

  function transactionRequest(db, storeName, mode, action) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let request;
      try { request = action(store); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(request ? clone(request.result) : undefined);
      tx.onerror = () => reject(tx.error || request?.error || new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    });
  }

  async function withDb(options, work) {
    const db = await openDatabase(options?.indexedDB);
    try { return await work(db); } finally { db.close(); }
  }

  async function enqueue(input, options = {}) {
    const event = normalizeOutboxEvent(input);
    return withDb(options, (db) => transactionRequest(db, OUTBOX_STORE, "readwrite", (store) => store.put(event)));
  }

  async function listPending(options = {}) {
    return withDb(options, (db) => new Promise((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE, "readonly");
      const request = tx.objectStore(OUTBOX_STORE).getAll();
      request.onsuccess = () => resolve((request.result || []).filter((item) => item.status === "pending" || item.status === "retry").sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).map(clone));
      request.onerror = () => reject(request.error || new Error("IndexedDB read failed"));
    }));
  }

  async function markOutboxResult(id, result, options = {}) {
    const eventId = nonEmpty(id, "id");
    const status = String(result?.status || "");
    if (!["pending", "retry", "synced", "conflict", "rejected"].includes(status)) throw new Error("invalid outbox result status");
    return withDb(options, (db) => new Promise((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE, "readwrite");
      const store = tx.objectStore(OUTBOX_STORE);
      const get = store.get(eventId);
      get.onsuccess = () => {
        const current = get.result;
        if (!current) { tx.abort(); reject(new Error("outbox event not found")); return; }
        const updated = { ...current, status, retryCount: status === "retry" ? Number(current.retryCount || 0) + 1 : Number(current.retryCount || 0), updatedAt: new Date().toISOString(), lastError: result?.error ? String(result.error) : null };
        store.put(updated);
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("outbox update failed"));
      tx.onabort = () => reject(tx.error || new Error("outbox update aborted"));
    }));
  }

  async function getCursor(workspaceId, deviceId, options = {}) {
    const cursor = normalizeCursor({ workspaceId, deviceId });
    return withDb(options, (db) => transactionRequest(db, CURSOR_STORE, "readonly", (store) => store.get(cursor.id))).then((stored) => stored || cursor);
  }

  async function advanceCursor(input, options = {}) {
    const next = normalizeCursor(input);
    const current = await getCursor(next.workspaceId, next.deviceId, options);
    if (next.pullCursor < Number(current.pullCursor || 0) || next.pushCursor < Number(current.pushCursor || 0)) throw new Error("sync cursor cannot move backwards");
    return withDb(options, (db) => transactionRequest(db, CURSOR_STORE, "readwrite", (store) => store.put(next)));
  }

  async function putTombstone(input, options = {}) {
    const next = normalizeTombstone(input);
    return withDb(options, async (db) => {
      const current = await transactionRequest(db, TOMBSTONE_STORE, "readonly", (store) => store.get(next.id));
      if (current && Number(current.revision || 0) > next.revision) return current;
      return transactionRequest(db, TOMBSTONE_STORE, "readwrite", (store) => store.put(next));
    });
  }

  async function getTombstone(workspaceId, objectType, objectId, options = {}) {
    const type = assertSyncableObjectType(objectType);
    const id = `${nonEmpty(workspaceId, "workspaceId")}:${type}:${nonEmpty(objectId, "objectId")}`;
    return withDb(options, (db) => transactionRequest(db, TOMBSTONE_STORE, "readonly", (store) => store.get(id)));
  }

  function getStatus() {
    return {
      version: "aha_canonical_sync_store_v1",
      database: DB_NAME,
      networkEnabled: false,
      autoSync: false,
      loginTriggersSync: false,
      allowedObjectTypes: ALLOWED_OBJECT_TYPES.slice(),
      forbiddenLocalOnlyTypes: FORBIDDEN_LOCAL_ONLY_TYPES.slice()
    };
  }

  const api = { ALLOWED_OBJECT_TYPES, FORBIDDEN_LOCAL_ONLY_TYPES, normalizeOutboxEvent, normalizeCursor, normalizeTombstone, assertSyncableObjectType, enqueue, listPending, markOutboxResult, getCursor, advanceCursor, putTombstone, getTombstone, getStatus };
  if (typeof window !== "undefined") window.AHACanonicalSyncStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
