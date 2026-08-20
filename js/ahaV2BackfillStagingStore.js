// ahaV2BackfillStagingStore.js
// Isolated IndexedDB-backed staging adapter for V2 legacy-knowledge rehearsal.
//
// This store is deliberately separate from every AHA product store. It exposes
// exactly the adapter scope required by AHAKnowledgeMigrationV2 and never reads
// or writes Chamber, Lists, Paths, Mindmap, Meta, canonical storage or remote
// backends.

(function (global) {
  "use strict";

  const STORE_SCHEMA = "aha_v2_backfill_staging_store_v1";
  const STORE_VERSION = 1;
  const ADAPTER_SCOPE = "v2_backfill_staging";
  const DB_NAME = "aha_v2_backfill_staging_v1";
  const OBJECT_STORE = "records";
  const TARGET_KINDS = Object.freeze(["v2_backfill_candidate", "v2_reference_rewrite_candidate"]);

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function safeNamespace(value) {
    const normalized = text(value || "default")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120);
    return normalized || "default";
  }

  function assertTarget(kind, id) {
    if (!TARGET_KINDS.includes(kind)) throw new Error(`invalid_staging_target_kind:${kind}`);
    if (!text(id)) throw new Error("staging_target_id_required");
  }

  function createIndexedDbBackend(indexedDB, dbName = DB_NAME) {
    let openPromise = null;

    function open() {
      if (openPromise) return openPromise;
      openPromise = new Promise((resolve, reject) => {
        let request;
        try {
          request = indexedDB.open(dbName, STORE_VERSION);
        } catch (error) {
          reject(error);
          return;
        }
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(OBJECT_STORE)) {
            db.createObjectStore(OBJECT_STORE, { keyPath: "key" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("indexeddb_open_failed"));
        request.onblocked = () => reject(new Error("indexeddb_open_blocked"));
      });
      return openPromise;
    }

    async function transact(mode, operation) {
      const db = await open();
      return new Promise((resolve, reject) => {
        let result;
        let transaction;
        try {
          transaction = db.transaction(OBJECT_STORE, mode);
          result = operation(transaction.objectStore(OBJECT_STORE));
        } catch (error) {
          reject(error);
          return;
        }
        transaction.oncomplete = () => resolve(result?.result ?? result ?? null);
        transaction.onerror = () => reject(transaction.error || new Error("indexeddb_transaction_failed"));
        transaction.onabort = () => reject(transaction.error || new Error("indexeddb_transaction_aborted"));
      });
    }

    async function get(key) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(OBJECT_STORE, "readonly");
        const request = transaction.objectStore(OBJECT_STORE).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error("indexeddb_get_failed"));
      });
    }

    async function put(record) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(OBJECT_STORE, "readwrite");
        const request = transaction.objectStore(OBJECT_STORE).put(clone(record));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("indexeddb_put_failed"));
      });
    }

    async function remove(key) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(OBJECT_STORE, "readwrite");
        const request = transaction.objectStore(OBJECT_STORE).delete(key);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error || new Error("indexeddb_delete_failed"));
      });
    }

    async function all() {
      const db = await open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(OBJECT_STORE, "readonly");
        const request = transaction.objectStore(OBJECT_STORE).getAll();
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        request.onerror = () => reject(request.error || new Error("indexeddb_getall_failed"));
      });
    }

    return Object.freeze({ driver: "indexeddb", get, put, remove, all, transact });
  }

  function create(options = {}) {
    const namespace = safeNamespace(options.namespace);
    const backend = options.backend || (
      (options.indexedDB || global.indexedDB)
        ? createIndexedDbBackend(options.indexedDB || global.indexedDB, options.dbName || DB_NAME)
        : null
    );
    if (!backend || typeof backend.get !== "function" || typeof backend.put !== "function" || typeof backend.remove !== "function" || typeof backend.all !== "function") {
      throw new Error("v2_backfill_staging_backend_required");
    }

    const driver = text(options.driver || backend.driver || "custom");
    const prefix = `${namespace}:`;
    const keyFor = (kind, id) => `${prefix}${kind}:${id}`;

    async function get(kind, id) {
      assertTarget(kind, id);
      const record = await Promise.resolve(backend.get(keyFor(kind, id)));
      if (!record || record.namespace !== namespace || record.target_kind !== kind || record.target_id !== id) return null;
      return clone(record.payload);
    }

    async function put(kind, id, value) {
      assertTarget(kind, id);
      const record = {
        schema: STORE_SCHEMA,
        version: STORE_VERSION,
        key: keyFor(kind, id),
        namespace,
        target_kind: kind,
        target_id: id,
        payload: clone(value)
      };
      await Promise.resolve(backend.put(record));
      return clone(value);
    }

    async function remove(kind, id) {
      assertTarget(kind, id);
      await Promise.resolve(backend.remove(keyFor(kind, id)));
      return true;
    }

    async function list() {
      const records = await Promise.resolve(backend.all());
      return (Array.isArray(records) ? records : [])
        .filter((record) => record && record.namespace === namespace && text(record.key).startsWith(prefix))
        .map((record) => ({
          target_kind: record.target_kind,
          target_id: record.target_id,
          payload: clone(record.payload)
        }))
        .sort((a, b) => `${a.target_kind}:${a.target_id}`.localeCompare(`${b.target_kind}:${b.target_id}`));
    }

    async function count() {
      return (await list()).length;
    }

    async function clear() {
      const records = await list();
      for (const record of records) await remove(record.target_kind, record.target_id);
      return records.length;
    }

    return Object.freeze({
      schema: STORE_SCHEMA,
      version: STORE_VERSION,
      scope: ADAPTER_SCOPE,
      namespace,
      driver,
      get,
      put,
      remove,
      list,
      count,
      clear
    });
  }

  const api = Object.freeze({
    STORE_SCHEMA,
    STORE_VERSION,
    ADAPTER_SCOPE,
    DB_NAME,
    OBJECT_STORE,
    TARGET_KINDS,
    create
  });
  global.AHAV2BackfillStagingStore = api;
  global.AHAModuleApi?.register?.("v2BackfillStagingStore", api, {
    version: STORE_VERSION,
    legacyGlobal: "AHAV2BackfillStagingStore",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
