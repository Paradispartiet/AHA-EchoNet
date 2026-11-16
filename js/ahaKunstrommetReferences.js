// Explicit, metadata-only bridge from private IndexedDB artworks to local AHA collections.
// A title+stable ID are visible to the local List/Mindmap modules ONLY after user opt-in.
// The artwork's pixels, strokes and personal notes never enter localStorage.
(function (global) {
  "use strict";
  const KEY = "aha_kunstrommet_references_v1";
  const SOURCE = "aha_kunstrommet";
  function owner() {
    try { return String(global.localStorage?.getItem("aha_profile_id") || "local").slice(0, 120); }
    catch { return "local"; }
  }
  function readAll() {
    try {
      const parsed = JSON.parse(global.localStorage?.getItem(KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object").slice(0, 5000) : [];
    } catch { return []; }
  }
  function load() {
    const scoped = owner();
    return readAll().filter((item) =>
      item.owner === scoped && item.source === SOURCE && item.local_only === true &&
      item.published_external !== true && item.echonet_shared !== true &&
      item.deleted_at == null && typeof item.id === "string" && item.id.length > 0 &&
      typeof item.title === "string"
    ).map((item) => ({
      id: item.id, title: item.title, source: SOURCE, type: "artwork",
      owner: scoped, local_only: true, published_external: false,
      echonet_shared: false, sync_enabled: false, updated_at: item.updated_at || ""
    }));
  }
  function upsert(record) {
    const id = String(record?.id || "").trim().slice(0, 128);
    if (!id || record?.owner !== owner()) throw new Error("Kunstverket har en ugyldig lokal identitet.");
    const all = readAll();
    const previous = all.find((entry) => entry.owner === owner() && entry.id === id && entry.source === SOURCE);
    const entry = {
      id, title: String(record.title || "Uten tittel").trim().slice(0, 120) || "Uten tittel",
      owner: owner(), source: SOURCE, type: "artwork", local_only: true,
      published_external: false, echonet_shared: false, sync_enabled: false,
      updated_at: new Date().toISOString()
    };
    const next = all.filter((entry) => !(entry.owner === owner() && entry.id === id && entry.source === SOURCE));
    next.push(entry);
    global.localStorage.setItem(KEY, JSON.stringify(next));
    return { entry, wasPresent: Boolean(previous) };
  }
  function remove(id) {
    const activeOwner = owner();
    const all = readAll();
    const next = all.filter((item) => !(item.source === SOURCE && item.owner === activeOwner && item.id === id));
    if (next.length !== all.length) global.localStorage.setItem(KEY, JSON.stringify(next));
    return next.length !== all.length;
  }
  global.AHAKunstrommetReferences = { KEY, SOURCE, owner, load, upsert, remove };
})(window);
