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
  const PROFILE_PREFIX = "aha_kunstrommet_refs_v2_";
  const OWNERS_KEY = "aha_kunstrommet_artwork_owners_v2";
  const profileKey = (profile = owner()) => PROFILE_PREFIX + encodeURIComponent(profile);

  function validEntries(raw) {
    return Array.isArray(raw) ? raw.filter((item) => item && typeof item === "object").slice(0, 5000) : [];
  }

  function parseArray(key) {
    try { return validEntries(JSON.parse(global.localStorage?.getItem(key) || "[]")); }
    catch { return []; }
  }

  function readOwnerIndex() { return parseArray(OWNERS_KEY); }

  function migrateLegacyReferences() {
    const old = parseArray(KEY);
    if (!old.length) return;
    const byOwner = new Map();
    const index = readOwnerIndex();
    for (const entry of old) {
      if (!entry || entry.source !== SOURCE || !entry.id || !entry.owner) continue;
      if (!byOwner.has(entry.owner)) byOwner.set(entry.owner, []);
      byOwner.get(entry.owner).push(entry);
      if (!index.some((row) => row.id === entry.id && row.owner === entry.owner)) {
        index.push({ id: entry.id, owner: entry.owner });
      }
    }
    // All writes must succeed before deleting the old, globally shared index.
    for (const [profile, records] of byOwner) {
      const next = new Map(parseArray(profileKey(profile)).map((row) => [row.id, row]));
      for (const record of records) if (!next.has(record.id)) next.set(record.id, record);
      global.localStorage.setItem(profileKey(profile), JSON.stringify([...next.values()]));
    }
    global.localStorage.setItem(OWNERS_KEY, JSON.stringify(index));
    global.localStorage.removeItem(KEY);
  }

  function readAll() {
    migrateLegacyReferences();
    return parseArray(profileKey());
  }

  function saveOwner(records) {
    global.localStorage.setItem(profileKey(), JSON.stringify(records));
  }

  function indexOwner(id) {
    const current = readOwnerIndex();
    if (!current.some((row) => row.id === id && row.owner === owner())) {
      current.push({ id, owner: owner() });
      global.localStorage.setItem(OWNERS_KEY, JSON.stringify(current));
    }
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
    saveOwner(next);
    indexOwner(id);
    return { entry, wasPresent: Boolean(previous) };
  }
  function remove(id) {
    const activeOwner = owner();
    const all = readAll();
    const next = all.filter((item) => !(item.source === SOURCE && item.owner === activeOwner && item.id === id));
    if (next.length !== all.length) {
      saveOwner(next);
      global.localStorage.setItem(OWNERS_KEY, JSON.stringify(readOwnerIndex().filter(
        (row) => !(row.id === id && row.owner === owner())
      )));
    }
    unlinkArtwork(id);
    return next.length !== all.length;
  }

  // AHA's global list store is not profile-private. Keep all art memberships
  // in a separate local-only, owner-scoped overlay rather than writing artist
  // titles/identities into aha_lists_v1 or a remote list repository.
  const MEMBERS_KEY = "aha_kunstrommet_memberships_v1";

  function allMemberships() {
    try {
      const entries = JSON.parse(global.localStorage?.getItem(MEMBERS_KEY) || "[]");
      return Array.isArray(entries) ? entries.filter((item) => item && typeof item === "object").slice(0, 15000) : [];
    } catch { return []; }
  }

  function saveMemberships(items) {
    if (items.length > 15000) throw new Error("For mange lokale kunstverkkoblinger.");
    global.localStorage.setItem(MEMBERS_KEY, JSON.stringify(items));
  }

  function memberships() {
    const active = owner();
    const visible = new Set(load().map((item) => item.id));
    return allMemberships().filter((entry) =>
      entry.owner === active && typeof entry.listId === "string" &&
      typeof entry.artworkId === "string" && visible.has(entry.artworkId));
  }

  function addMembership(listId, artworkId) {
    if (!listId || !artworkId || !load().some((ref) => ref.id === artworkId)) {
      return { ok: false, reason: "source_missing" };
    }
    const active = owner();
    const entries = allMemberships();
    if (entries.some((item) => item.owner === active && item.listId === listId && item.artworkId === artworkId)) {
      return { ok: false, reason: "duplicate" };
    }
    entries.push({ owner: active, listId, artworkId, addedAt: new Date().toISOString() });
    saveMemberships(entries);
    return { ok: true };
  }

  function removeMembership(listId, artworkId) {
    const entries = allMemberships();
    const next = entries.filter((item) =>
      !(item.owner === owner() && item.listId === listId && item.artworkId === artworkId));
    if (entries.length !== next.length) saveMemberships(next);
    return entries.length !== next.length;
  }

  function unlinkArtwork(artworkId) {
    const entries = allMemberships();
    const next = entries.filter((item) => !(item.owner === owner() && item.artworkId === artworkId));
    if (entries.length !== next.length) saveMemberships(next);
    return entries.length - next.length;
  }

  function overlayLists(rawLists) {
    const links = memberships();
    const refs = new Map(load().map((item) => [item.id, item]));
    return (Array.isArray(rawLists) ? rawLists : []).map((list) => {
      const copy = { ...list, items: (Array.isArray(list.items) ? list.items : [])
        .filter((item) => item?.source !== SOURCE) };
      const added = links.filter((item) => item.listId === list.id).map((link) => {
        const ref = refs.get(link.artworkId);
        if (!ref) return null;
        return {
          id: "art_" + link.artworkId, title: ref.title, type: "artwork",
          source: SOURCE, refId: ref.id, addedAt: link.addedAt,
          meta: { local_only: true, referenced_artwork: true, private_overlay: true }
        };
      }).filter(Boolean);
      copy.items = [...copy.items, ...added];
      return copy;
    });
  }

  // One-time migration for links created by the older version of Kunstrommet:
  // gather the matching owner from its explicit reference index and move
  // memberships OUT of AHA's shared list dataset. Do not drop old rows if the
  // membership write fails. The caller must persist the returned clean lists.
  function migrateLegacyRows(rawLists) {
    const rows = Array.isArray(rawLists) ? rawLists : [];
    const matches = rows.flatMap((list) =>
      (Array.isArray(list.items) ? list.items : [])
        .filter((item) => item?.source === SOURCE)
        .map((item) => ({ listId: list.id, artworkId: item.refId || item.ref_id })));
    if (!matches.length) return { changed: false, lists: rows };
    migrateLegacyReferences();
    const ownersByArt = new Map(readOwnerIndex().map((ref) => [ref.id, ref.owner]));
    const existing = allMemberships();
    let changed = false;
    for (const match of matches) {
      const linkedOwner = ownersByArt.get(match.artworkId);
      if (!linkedOwner || !match.listId || !match.artworkId) continue;
      if (existing.some((item) => item.owner === linkedOwner &&
        item.listId === match.listId && item.artworkId === match.artworkId)) continue;
      existing.push({
        owner: linkedOwner, listId: match.listId, artworkId: match.artworkId,
        addedAt: new Date().toISOString()
      });
      changed = true;
    }
    if (changed) saveMemberships(existing);
    return { changed: true, lists: rows.map((list) => ({
      ...list, items: (Array.isArray(list.items) ? list.items : [])
        .filter((item) => item?.source !== SOURCE)
    })) };
  }

  global.AHAKunstrommetReferences = { KEY, OWNERS_KEY, MEMBERS_KEY, SOURCE, owner, profileKey, load, upsert, remove, memberships, addMembership, removeMembership, unlinkArtwork, overlayLists, migrateLegacyRows };
})(window);
