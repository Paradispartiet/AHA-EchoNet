// ahaCanonicalStagingSourceHydrator.js
// Explicit staging-only read bridge from the primary AHA source-event store into
// the canonical browser snapshot. Loading this file performs no auth lookup,
// storage write or network I/O.
(function (global) {
  "use strict";

  const VERSION = "aha_canonical_staging_source_hydrator_v1";
  const SOURCE_TABLE = "aha_source_events";
  const SOURCE_COLUMNS = "id,source_type,source_app,content_type,title,text,user_created,imported,tags,meta,created_at";
  const DEFAULT_PAGE_SIZE = 500;
  const MAX_PAGES = 100;
  const SUPPORTED_STORAGE_KEYS = Object.freeze([
    "aha_chat_sessions_v1",
    "aha_source_events_v1",
    "aha_insight_chamber_v1",
    "aha_concept_lists_v1",
    "aha_paths_v1",
    "aha_articles_v1"
  ]);
  const SUPPORTED_STORAGE_KEY_SET = new Set(SUPPORTED_STORAGE_KEYS);
  const EXCLUDED_SOURCE_APPS = new Set([
    "aha_notes",
    "aha_gallery",
    "aha_feed",
    "aha_insta",
    "aha_music",
    "aha_training",
    "aha_personal_ai",
    "aha_knowledge_workbench",
    "aha_lists",
    "aha_groups",
    "aha_sync_hub"
  ]);
  const EXCLUDED_SOURCE_TYPES = new Set([
    "note",
    "notes",
    "gallery",
    "feed",
    "insta",
    "instagram",
    "music",
    "training",
    "workbench"
  ]);

  function text(value) { return String(value ?? "").trim(); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function lower(value) { return text(value).toLowerCase(); }
  function requiredText(value, field) {
    const result = text(value);
    if (!result) throw new Error(`${field} is required`);
    return result;
  }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

  function assertStorage(storage) {
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      throw new Error("canonical staging source hydration requires local storage");
    }
    return storage;
  }

  function isEligiblePrimarySourceEvent(input) {
    const row = obj(input);
    if (!text(row.id)) return false;
    const sourceApp = lower(row.source_app || row.sourceApp);
    const sourceType = lower(row.source_type || row.sourceType);
    if (EXCLUDED_SOURCE_APPS.has(sourceApp)) return false;
    if (EXCLUDED_SOURCE_TYPES.has(sourceType)) return false;
    return true;
  }

  function normalizePrimarySourceEvent(input) {
    const row = obj(input);
    return {
      id: requiredText(row.id, "primary source event id"),
      source_type: text(row.source_type) || "unknown",
      source_app: text(row.source_app) || "aha",
      content_type: text(row.content_type) || "text",
      title: text(row.title) || null,
      text: text(row.text),
      user_created: row.user_created === true,
      imported: row.imported === true,
      tags: clone(arr(row.tags)),
      meta: clone(obj(row.meta)),
      created_at: text(row.created_at) || null
    };
  }

  async function fetchPrimarySourceEvents(client, userId, options = {}) {
    if (!client || typeof client.from !== "function") throw new Error("primary AHA Supabase client unavailable");
    const profileId = requiredText(userId, "authenticated AHA user id");
    const pageSize = Math.max(1, Math.min(Number(options.pageSize || DEFAULT_PAGE_SIZE), 1000));
    const rows = [];

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      let query = client
        .from(SOURCE_TABLE)
        .select(SOURCE_COLUMNS)
        .eq("profile_id", profileId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (!query || typeof query.range !== "function") throw new Error("primary AHA source query unavailable");
      const { data, error } = await query.range(from, to);
      if (error) throw new Error("Could not read canonical-eligible source events from primary AHA");
      const pageRows = arr(data);
      rows.push(...pageRows);
      if (pageRows.length < pageSize) return rows;
    }

    throw new Error("primary AHA source hydration exceeded the staging safety page limit");
  }

  function mergeSourceEvents(primaryRows, localRows) {
    const merged = new Map();
    for (const item of arr(primaryRows)) {
      if (!isEligiblePrimarySourceEvent(item)) continue;
      const normalized = normalizePrimarySourceEvent(item);
      merged.set(normalized.id, normalized);
    }
    // Local canonical state wins by ID, including local metadata/tombstone fields.
    for (const item of arr(localRows)) {
      const id = text(item?.id);
      if (!id) continue;
      merged.set(id, clone(item));
    }
    return Array.from(merged.values());
  }

  function buildHydratedSnapshot(localSnapshot, primaryRows) {
    const local = obj(localSnapshot);
    const snapshot = {};
    for (const key of SUPPORTED_STORAGE_KEYS) {
      if (key === "aha_insight_chamber_v1") snapshot[key] = clone(obj(local[key]));
      else snapshot[key] = clone(arr(local[key]));
    }
    snapshot.aha_source_events_v1 = mergeSourceEvents(primaryRows, snapshot.aha_source_events_v1);
    return snapshot;
  }

  function createOverlayStorage(baseStorage, snapshot) {
    const base = assertStorage(baseStorage);
    const source = obj(snapshot);
    const overlay = new Map();
    for (const key of SUPPORTED_STORAGE_KEYS) {
      const fallback = key === "aha_insight_chamber_v1" ? { insights: [] } : [];
      const value = Object.prototype.hasOwnProperty.call(source, key) ? source[key] : fallback;
      overlay.set(key, JSON.stringify(value));
    }

    // Supported canonical keys remain virtual for this staging run. This keeps
    // server/bootstrap staging data out of the user's real primary browser store,
    // while non-canonical runner state (device id, IndexedDB cursor etc.) keeps its
    // established behavior.
    return Object.freeze({
      getItem(key) {
        const name = String(key);
        if (SUPPORTED_STORAGE_KEY_SET.has(name)) return overlay.has(name) ? overlay.get(name) : null;
        return base.getItem(name);
      },
      setItem(key, value) {
        const name = String(key);
        if (SUPPORTED_STORAGE_KEY_SET.has(name)) {
          overlay.set(name, String(value));
          return;
        }
        base.setItem(name, String(value));
      },
      removeItem(key) {
        const name = String(key);
        if (SUPPORTED_STORAGE_KEY_SET.has(name)) {
          overlay.set(name, null);
          return;
        }
        if (typeof base.removeItem === "function") base.removeItem(name);
      }
    });
  }

  async function hydrateStorage(options = {}) {
    const localImport = options.localImport || global.AHALocalAccountImport;
    if (!localImport || typeof localImport.snapshotFromStorage !== "function") {
      throw new Error("AHALocalAccountImport unavailable for staging source hydration");
    }
    const session = obj(options.session);
    const userId = requiredText(session.user?.id, "authenticated AHA user id");
    if (!text(session.access_token)) throw new Error("authenticated AHA session is required for staging source hydration");
    const storage = assertStorage(options.storage || global.localStorage);
    const localSnapshot = localImport.snapshotFromStorage(storage);
    const fetched = await fetchPrimarySourceEvents(options.client, userId, options);
    const eligible = fetched.filter(isEligiblePrimarySourceEvent);
    const hydratedSnapshot = buildHydratedSnapshot(localSnapshot, eligible);
    const localSourceCount = arr(localSnapshot.aha_source_events_v1).length;
    const mergedSourceCount = arr(hydratedSnapshot.aha_source_events_v1).length;

    return Object.freeze({
      storage: createOverlayStorage(storage, hydratedSnapshot),
      stats: Object.freeze({
        fetched: fetched.length,
        included: eligible.length,
        excluded: fetched.length - eligible.length,
        localSourceEvents: localSourceCount,
        mergedSourceEvents: mergedSourceCount
      })
    });
  }

  function getStatus() {
    return Object.freeze({
      version: VERSION,
      sourceTable: SOURCE_TABLE,
      supportedStorageKeys: SUPPORTED_STORAGE_KEYS.slice(),
      primaryReadOnly: true,
      writesPrimaryDatabase: false,
      executesOnLoad: false,
      loginTriggersHydration: false,
      authReadyTriggersHydration: false,
      timerTriggersHydration: false,
      supportedCanonicalStorageVirtualizedInStaging: true
    });
  }

  const api = Object.freeze({
    VERSION,
    SOURCE_TABLE,
    SOURCE_COLUMNS,
    SUPPORTED_STORAGE_KEYS,
    isEligiblePrimarySourceEvent,
    normalizePrimarySourceEvent,
    fetchPrimarySourceEvents,
    mergeSourceEvents,
    buildHydratedSnapshot,
    createOverlayStorage,
    hydrateStorage,
    getStatus
  });

  global.AHACanonicalStagingSourceHydrator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
