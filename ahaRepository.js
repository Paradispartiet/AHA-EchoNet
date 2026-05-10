// ahaRepository.js
// Optional Supabase persistence layer for AHA-EchoNet.
// localStorage remains the primary fallback path.

(function (global) {
  "use strict";

  function fallback(reason = "localStorage") {
    return { ok: false, fallback: reason };
  }

  function client() {
    return global.AHADb?.getClient?.() || null;
  }

  async function getProfileId(explicitProfileId) {
    if (explicitProfileId) return explicitProfileId;
    if (!global.AHAAuth?.getProfileId) return null;
    return await global.AHAAuth.getProfileId();
  }

  async function insert(table, record) {
    const db = client();
    if (!db) return fallback();

    try {
      const { data, error } = await db
        .from(table)
        .upsert(record, { onConflict: "id" })
        .select()
        .single();

      if (error) return { ok: false, error };
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async function list(table, options = {}) {
    const db = client();
    if (!db) return fallback();

    const profileId = await getProfileId(options.profile_id);
    if (!profileId) return fallback("not_signed_in");

    try {
      let query = db
        .from(table)
        .select(options.select || "*")
        .eq("profile_id", profileId);

      if (options.orderBy) {
        query = query.order(options.orderBy, { ascending: options.ascending === true });
      }

      if (Number.isFinite(options.limit)) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;
      if (error) return { ok: false, error };
      return { ok: true, data: Array.isArray(data) ? data : [] };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async function count(table) {
    const db = client();
    if (!db) return fallback();

    const profileId = await getProfileId();
    if (!profileId) return fallback("not_signed_in");

    try {
      const { count: total, error } = await db
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profileId);

      if (error) return { ok: false, error };
      return { ok: true, count: total || 0 };
    } catch (error) {
      return { ok: false, error };
    }
  }

  function cleanArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function cleanObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  async function saveSourceEvent(event) {
    const e = cleanObject(event);
    if (!e.id) return fallback("missing_id");
    const profileId = await getProfileId(e.profile_id);
    if (!profileId) return fallback("not_signed_in");
    return insert("aha_source_events", {
      id: e.id,
      profile_id: profileId,
      source_type: e.source_type || null,
      source_app: e.source_app || null,
      content_type: e.content_type || null,
      title: e.title || null,
      text: e.text || null,
      user_created: e.user_created !== false,
      imported: e.imported === true,
      tags: cleanArray(e.tags),
      meta: cleanObject(e.meta),
      created_at: e.created_at || new Date().toISOString()
    });
  }

  async function saveNote(note) {
    const n = cleanObject(note);
    if (!n.id) return fallback("missing_id");
    const profileId = await getProfileId(n.profile_id);
    if (!profileId) return fallback("not_signed_in");
    return insert("aha_notes", {
      id: n.id,
      profile_id: profileId,
      title: n.title || null,
      text: n.text || null,
      tags: cleanArray(n.tags),
      created_at: n.created_at || new Date().toISOString(),
      updated_at: n.updated_at || n.created_at || new Date().toISOString(),
      deleted_at: n.deleted_at || null,
      last_source_event_id: n.last_source_event_id || null
    });
  }

  async function saveGalleryItem(item) {
    const g = cleanObject(item);
    if (!g.id) return fallback("missing_id");
    const profileId = await getProfileId(g.profile_id);
    if (!profileId) return fallback("not_signed_in");
    return insert("aha_gallery_items", {
      id: g.id,
      profile_id: profileId,
      type: g.type || null,
      title: g.title || null,
      description: g.description || null,
      src: g.src || null,
      thumbnail: g.thumbnail || null,
      source_type: g.source_type || "gallery",
      source_app: g.source_app || "aha_gallery",
      user_created: g.user_created !== false,
      imported: g.imported === true,
      tags: cleanArray(g.tags),
      meta: cleanObject(g.meta),
      created_at: g.created_at || new Date().toISOString(),
      deleted_at: g.deleted_at || null,
      last_source_event_id: g.last_source_event_id || null
    });
  }

  async function saveFeedPost(post) {
    const p = cleanObject(post);
    if (!p.id) return fallback("missing_id");
    const profileId = await getProfileId(p.profile_id);
    if (!profileId) return fallback("not_signed_in");
    return insert("aha_feed_posts", {
      id: p.id,
      profile_id: profileId,
      text: p.text || null,
      tags: cleanArray(p.tags),
      meta: cleanObject(p.meta),
      created_at: p.created_at || new Date().toISOString(),
      deleted_at: p.deleted_at || null,
      last_source_event_id: p.last_source_event_id || null
    });
  }

  async function saveInstaPost(post) {
    const p = cleanObject(post);
    if (!p.id) return fallback("missing_id");
    const profileId = await getProfileId(p.profile_id);
    if (!profileId) return fallback("not_signed_in");
    return insert("aha_insta_posts", {
      id: p.id,
      profile_id: profileId,
      title: p.title || null,
      caption: p.caption || null,
      src: p.src || null,
      content_type: p.content_type || null,
      tags: cleanArray(p.tags),
      meta: cleanObject(p.meta),
      created_at: p.created_at || new Date().toISOString(),
      deleted_at: p.deleted_at || null,
      last_source_event_id: p.last_source_event_id || null
    });
  }

  async function saveImport(importRecord) {
    const r = cleanObject(importRecord);
    const id = r.id || `import_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const profileId = await getProfileId(r.profile_id);
    if (!profileId) return fallback("not_signed_in");
    return insert("aha_imports", {
      id,
      profile_id: profileId,
      source_app: r.source_app || "historygo",
      payload: cleanObject(r.payload),
      counts: cleanObject(r.counts),
      created_at: r.created_at || new Date().toISOString()
    });
  }

  function loadSourceEvents(options = {}) {
    return list("aha_source_events", { orderBy: "created_at", limit: options.limit || 200 });
  }

  function loadNotes(options = {}) {
    return list("aha_notes", { orderBy: "created_at", limit: options.limit || 200 });
  }

  function loadGalleryItems(options = {}) {
    return list("aha_gallery_items", { orderBy: "created_at", limit: options.limit || 200 });
  }

  function loadFeedPosts(options = {}) {
    return list("aha_feed_posts", { orderBy: "created_at", limit: options.limit || 200 });
  }

  function loadInstaPosts(options = {}) {
    return list("aha_insta_posts", { orderBy: "created_at", limit: options.limit || 200 });
  }

  function loadImports(options = {}) {
    return list("aha_imports", { orderBy: "created_at", limit: options.limit || 50 });
  }

  async function saveChamber(chamber) {
    const db = client();
    if (!db) return fallback();
    const profileId = await getProfileId();
    if (!profileId) return fallback("not_signed_in");

    const safeChamber = cleanObject(chamber);
    const insights = cleanArray(safeChamber.insights);

    try {
      const { data, error } = await db
        .from("aha_insight_chambers")
        .upsert({
          profile_id: profileId,
          chamber: safeChamber,
          insight_count: insights.length,
          updated_at: safeChamber._local_updated_at || new Date().toISOString()
        }, { onConflict: "profile_id" })
        .select()
        .single();
      if (error) return { ok: false, error };
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async function loadChamber() {
    const db = client();
    if (!db) return fallback();
    const profileId = await getProfileId();
    if (!profileId) return fallback("not_signed_in");

    try {
      const { data, error } = await db
        .from("aha_insight_chambers")
        .select("chamber, insight_count, updated_at")
        .eq("profile_id", profileId)
        .maybeSingle();
      if (error) return { ok: false, error };
      return { ok: true, data: data || null };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async function countActive(table) {
    const db = client();
    if (!db) return fallback();

    const profileId = await getProfileId();
    if (!profileId) return fallback("not_signed_in");

    try {
      const { count: total, error } = await db
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profileId)
        .is("deleted_at", null);

      if (error) return { ok: false, error };
      return { ok: true, count: total || 0 };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async function loadDashboardCounts() {
    const tables = {
      source_events: "aha_source_events",
      notes: "aha_notes",
      gallery: "aha_gallery_items",
      feed: "aha_feed_posts",
      insta: "aha_insta_posts",
      imports: "aha_imports"
    };

    const entries = await Promise.all(
      Object.entries(tables).map(async ([key, table]) => [key, await (["notes", "gallery", "feed", "insta"].includes(key) ? countActive(table) : count(table))])
    );

    const counts = {};
    const errors = [];
    entries.forEach(([key, result]) => {
      if (result?.ok) counts[key] = result.count || 0;
      else errors.push({ key, result });
    });

    return errors.length ? { ok: false, counts, errors } : { ok: true, counts };
  }

  global.AHARepository = {
    saveSourceEvent,
    saveNote,
    saveGalleryItem,
    saveFeedPost,
    saveInstaPost,
    saveImport,
    saveChamber,
    loadSourceEvents,
    loadNotes,
    loadGalleryItems,
    loadFeedPosts,
    loadInstaPosts,
    loadImports,
    loadChamber,
    loadDashboardCounts
  };
})(window);
