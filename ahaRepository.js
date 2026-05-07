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

  function cleanArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function cleanObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function saveSourceEvent(event) {
    const e = cleanObject(event);
    if (!e.id) return Promise.resolve(fallback("missing_id"));
    return insert("aha_source_events", {
      id: e.id,
      profile_id: e.profile_id || null,
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

  function saveNote(note) {
    const n = cleanObject(note);
    if (!n.id) return Promise.resolve(fallback("missing_id"));
    return insert("aha_notes", {
      id: n.id,
      profile_id: n.profile_id || null,
      title: n.title || null,
      text: n.text || null,
      tags: cleanArray(n.tags),
      created_at: n.created_at || new Date().toISOString(),
      updated_at: n.updated_at || n.created_at || new Date().toISOString()
    });
  }

  function saveGalleryItem(item) {
    const g = cleanObject(item);
    if (!g.id) return Promise.resolve(fallback("missing_id"));
    return insert("aha_gallery_items", {
      id: g.id,
      profile_id: g.profile_id || null,
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
      created_at: g.created_at || new Date().toISOString()
    });
  }

  function saveFeedPost(post) {
    const p = cleanObject(post);
    if (!p.id) return Promise.resolve(fallback("missing_id"));
    return insert("aha_feed_posts", {
      id: p.id,
      profile_id: p.profile_id || null,
      text: p.text || null,
      tags: cleanArray(p.tags),
      meta: cleanObject(p.meta),
      created_at: p.created_at || new Date().toISOString()
    });
  }

  function saveInstaPost(post) {
    const p = cleanObject(post);
    if (!p.id) return Promise.resolve(fallback("missing_id"));
    return insert("aha_insta_posts", {
      id: p.id,
      profile_id: p.profile_id || null,
      title: p.title || null,
      caption: p.caption || null,
      src: p.src || null,
      content_type: p.content_type || null,
      tags: cleanArray(p.tags),
      meta: cleanObject(p.meta),
      created_at: p.created_at || new Date().toISOString()
    });
  }

  function saveImport(importRecord) {
    const r = cleanObject(importRecord);
    const id = r.id || `import_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    return insert("aha_imports", {
      id,
      profile_id: r.profile_id || null,
      source_app: r.source_app || "historygo",
      payload: cleanObject(r.payload),
      counts: cleanObject(r.counts),
      created_at: r.created_at || new Date().toISOString()
    });
  }

  global.AHARepository = {
    saveSourceEvent,
    saveNote,
    saveGalleryItem,
    saveFeedPost,
    saveInstaPost,
    saveImport
  };
})(window);
