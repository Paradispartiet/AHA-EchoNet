// AHA Local Demo Seed Loader V1
// Explicit localStorage-only seed installer/remover. Never auto-applies.
(function (global) {
  "use strict";

  const VERSION = "aha_local_demo_seed_loader_v1";
  const STATE_KEY = "aha_local_demo_seed_state_v1";

  function storageFrom(options = {}) {
    try { return options.storage || global.localStorage || null; } catch { return null; }
  }

  function parse(raw, fallback) {
    try {
      const value = JSON.parse(raw);
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function itemId(item) {
    return String(item?.id || "");
  }

  function belongsToSeed(item, seedId) {
    return String(item?.demo_seed_id || item?.meta?.demo_seed_id || "") === String(seedId || "");
  }

  function replaceSeedItems(existing, incoming, seedId) {
    const incomingIds = new Set(asArray(incoming).map(itemId).filter(Boolean));
    const preserved = asArray(existing).filter((item) => !belongsToSeed(item, seedId) && !incomingIds.has(itemId(item)));
    return [...asArray(incoming), ...preserved];
  }

  function readJson(storage, key, fallback) {
    if (!storage) return fallback;
    try { return parse(storage.getItem(key), fallback); } catch { return fallback; }
  }

  function writeJson(storage, key, value) {
    storage.setItem(key, JSON.stringify(value));
  }

  function countSeedItems(value, descriptor, seedId) {
    if (descriptor.kind === "array") {
      return asArray(value).filter((item) => belongsToSeed(item, seedId)).length;
    }
    if (descriptor.kind === "object_array") {
      return asArray(asObject(value)[descriptor.field]).filter((item) => belongsToSeed(item, seedId)).length;
    }
    return 0;
  }

  function inspectSeed(options = {}) {
    const storage = storageFrom(options);
    const pack = options.pack || global.AHA_LOCAL_DEMO_SEED_V1;
    if (!storage || !pack?.seed_id) {
      return { ok: false, installed: false, count: 0, error: "seed_unavailable" };
    }

    let count = 0;
    for (const descriptor of asArray(pack.stores)) {
      const fallback = descriptor.kind === "array" ? [] : {};
      count += countSeedItems(readJson(storage, descriptor.key, fallback), descriptor, pack.seed_id);
    }

    const state = readJson(storage, STATE_KEY, null);
    return {
      ok: true,
      installed: count > 0,
      count,
      seed_id: pack.seed_id,
      state: state?.seed_id === pack.seed_id ? state : null
    };
  }

  function applySeed(options = {}) {
    const storage = storageFrom(options);
    const pack = options.pack || global.AHA_LOCAL_DEMO_SEED_V1;
    if (!storage || !pack?.seed_id) return { ok: false, error: "seed_unavailable" };

    let installed = 0;
    let preserved = 0;

    for (const descriptor of asArray(pack.stores)) {
      if (!descriptor?.key || !descriptor?.kind) continue;

      if (descriptor.kind === "array") {
        const current = asArray(readJson(storage, descriptor.key, []));
        preserved += current.filter((item) => !belongsToSeed(item, pack.seed_id)).length;
        const next = replaceSeedItems(current, descriptor.items, pack.seed_id);
        writeJson(storage, descriptor.key, next);
        installed += asArray(descriptor.items).length;
        continue;
      }

      if (descriptor.kind === "object_array") {
        const current = asObject(readJson(storage, descriptor.key, {}));
        const currentItems = asArray(current[descriptor.field]);
        preserved += currentItems.filter((item) => !belongsToSeed(item, pack.seed_id)).length;
        const next = {
          ...current,
          [descriptor.field]: replaceSeedItems(currentItems, descriptor.items, pack.seed_id)
        };
        writeJson(storage, descriptor.key, next);
        installed += asArray(descriptor.items).length;
      }
    }

    let scalarWrites = 0;
    for (const scalar of asArray(pack.optional_scalars)) {
      if (!scalar?.key) continue;
      let existing = null;
      try { existing = storage.getItem(scalar.key); } catch {}
      if (scalar.set_only_if_empty && existing) continue;
      storage.setItem(scalar.key, String(scalar.value ?? ""));
      scalarWrites += 1;
    }

    const appliedAt = new Date().toISOString();
    writeJson(storage, STATE_KEY, {
      seed_id: pack.seed_id,
      version: pack.version,
      applied_at: appliedAt,
      local_only: true,
      synthetic_example: true
    });

    return {
      ok: true,
      seed_id: pack.seed_id,
      installed,
      preserved,
      scalar_writes: scalarWrites,
      applied_at: appliedAt
    };
  }

  function removeSeed(options = {}) {
    const storage = storageFrom(options);
    const pack = options.pack || global.AHA_LOCAL_DEMO_SEED_V1;
    if (!storage || !pack?.seed_id) return { ok: false, error: "seed_unavailable" };

    let removed = 0;

    for (const descriptor of asArray(pack.stores)) {
      if (!descriptor?.key || !descriptor?.kind) continue;

      if (descriptor.kind === "array") {
        const current = asArray(readJson(storage, descriptor.key, []));
        const next = current.filter((item) => !belongsToSeed(item, pack.seed_id));
        removed += current.length - next.length;
        writeJson(storage, descriptor.key, next);
        continue;
      }

      if (descriptor.kind === "object_array") {
        const current = asObject(readJson(storage, descriptor.key, {}));
        const currentItems = asArray(current[descriptor.field]);
        const nextItems = currentItems.filter((item) => !belongsToSeed(item, pack.seed_id));
        removed += currentItems.length - nextItems.length;
        writeJson(storage, descriptor.key, { ...current, [descriptor.field]: nextItems });
      }
    }

    for (const scalar of asArray(pack.optional_scalars)) {
      if (!scalar?.key) continue;
      let existing = null;
      try { existing = storage.getItem(scalar.key); } catch {}
      if (String(existing || "") === String(scalar.value ?? "")) {
        storage.removeItem(scalar.key);
      }
    }

    try {
      const state = readJson(storage, STATE_KEY, null);
      if (state?.seed_id === pack.seed_id) storage.removeItem(STATE_KEY);
    } catch {}

    return { ok: true, seed_id: pack.seed_id, removed };
  }

  global.AHALocalDemoSeed = {
    VERSION,
    STATE_KEY,
    inspectSeed,
    applySeed,
    removeSeed
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.AHALocalDemoSeed;
  }
})(typeof window !== "undefined" ? window : globalThis);
