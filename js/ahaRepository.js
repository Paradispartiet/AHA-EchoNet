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

  async function saveList(listRecord) {
    const l = cleanObject(listRecord);
    if (!l.id) return fallback("missing_id");
    const profileId = await getProfileId(l.profile_id);
    if (!profileId) return fallback("not_signed_in");
    const now = new Date().toISOString();
    return insert("aha_lists", {
      id: l.id,
      profile_id: profileId,
      title: l.title || null,
      type: l.type || null,
      description: l.description || null,
      tags: cleanArray(l.tags),
      items: cleanArray(l.items),
      source: l.source || "aha_lists",
      meta: cleanObject(l.meta),
      created_at: l.createdAt || l.created_at || now,
      updated_at: l.updatedAt || l.updated_at || l.createdAt || l.created_at || now,
      deleted_at: l.deletedAt || l.deleted_at || null
    });
  }

  async function savePath(pathRecord) {
    const p = cleanObject(pathRecord);
    if (!p.id) return fallback("missing_id");
    const profileId = await getProfileId(p.profile_id);
    if (!profileId) return fallback("not_signed_in");
    const now = new Date().toISOString();
    return insert("aha_paths", {
      id: p.id,
      profile_id: profileId,
      title: p.title || null,
      type: p.type || null,
      description: p.description || null,
      tags: cleanArray(p.tags),
      steps: cleanArray(p.steps),
      source: p.source || "aha_paths",
      meta: cleanObject(p.meta),
      created_at: p.createdAt || p.created_at || now,
      updated_at: p.updatedAt || p.updated_at || p.createdAt || p.created_at || now,
      deleted_at: p.deletedAt || p.deleted_at || null
    });
  }

  async function saveGroup(groupRecord) {
    const g = cleanObject(groupRecord);
    if (!g.id) return fallback("missing_id");
    const profileId = await getProfileId(g.profile_id);
    if (!profileId) return fallback("not_signed_in");
    const now = new Date().toISOString();
    return insert("aha_groups", {
      id: g.id,
      profile_id: profileId,
      title: g.title || null,
      type: g.type || null,
      description: g.description || null,
      tags: cleanArray(g.tags),
      members: cleanArray(g.members),
      references: cleanArray(g.references),
      source: g.source || "aha_groups",
      meta: cleanObject(g.meta),
      created_at: g.createdAt || g.created_at || now,
      updated_at: g.updatedAt || g.updated_at || g.createdAt || g.created_at || now,
      deleted_at: g.deletedAt || g.deleted_at || null
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

  async function saveInstaProfile(profile) {
    const p = cleanObject(profile);
    const profileId = await getProfileId(p.profile_id);
    if (!profileId) return fallback("not_signed_in");
    const db = client();
    if (!db) return fallback();

    try {
      const { data, error } = await db
        .from("aha_insta_profiles")
        .upsert({
          profile_id: profileId,
          local_id: p.id || null,
          username: p.username || null,
          display_name: p.displayName || null,
          bio: p.bio || null,
          avatar: p.avatar || null,
          created_at: p.created_at || new Date().toISOString(),
          updated_at: p.updated_at || new Date().toISOString()
        }, { onConflict: "profile_id" })
        .select()
        .single();
      if (error) return { ok: false, error };
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async function saveInstaLike(like) {
    const l = cleanObject(like);
    if (!l.id) return fallback("missing_id");
    const profileId = await getProfileId(l.profile_id);
    if (!profileId) return fallback("not_signed_in");
    return insert("aha_insta_likes", {
      id: l.id,
      profile_id: profileId,
      post_id: l.post_id || null,
      user_id: l.user_id || null,
      deleted_at: l.deleted_at || null,
      created_at: l.created_at || new Date().toISOString()
    });
  }

  async function saveInstaComment(comment) {
    const c = cleanObject(comment);
    if (!c.id) return fallback("missing_id");
    const profileId = await getProfileId(c.profile_id);
    if (!profileId) return fallback("not_signed_in");
    return insert("aha_insta_comments", {
      id: c.id,
      profile_id: profileId,
      post_id: c.post_id || null,
      user_id: c.user_id || null,
      username: c.username || null,
      text: c.text || null,
      deleted_at: c.deleted_at || null,
      created_at: c.created_at || new Date().toISOString()
    });
  }

  async function saveInstaFollow(follow) {
    const f = cleanObject(follow);
    if (!f.id) return fallback("missing_id");
    const profileId = await getProfileId(f.profile_id);
    if (!profileId) return fallback("not_signed_in");
    return insert("aha_insta_follows", {
      id: f.id,
      profile_id: profileId,
      follower_id: f.follower_id || null,
      following_id: f.following_id || null,
      following_username: f.following_username || null,
      deleted_at: f.deleted_at || null,
      created_at: f.created_at || new Date().toISOString()
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

  function loadLists(options = {}) {
    return list("aha_lists", { orderBy: "created_at", limit: options.limit || 200 });
  }

  function loadPaths(options = {}) {
    return list("aha_paths", { orderBy: "created_at", limit: options.limit || 200 });
  }

  function loadGroups(options = {}) {
    return list("aha_groups", { orderBy: "created_at", limit: options.limit || 200 });
  }

  function loadInstaPosts(options = {}) {
    return list("aha_insta_posts", { orderBy: "created_at", limit: options.limit || 200 });
  }

  function loadImports(options = {}) {
    return list("aha_imports", { orderBy: "created_at", limit: options.limit || 50 });
  }

  async function loadInstaProfile() {
    const db = client();
    if (!db) return fallback();
    const profileId = await getProfileId();
    if (!profileId) return fallback("not_signed_in");

    try {
      const { data, error } = await db
        .from("aha_insta_profiles")
        .select("local_id, username, display_name, bio, avatar, created_at, updated_at")
        .eq("profile_id", profileId)
        .maybeSingle();
      if (error) return { ok: false, error };
      return { ok: true, data: data || null };
    } catch (error) {
      return { ok: false, error };
    }
  }

  function loadInstaLikes(options = {}) {
    return list("aha_insta_likes", { orderBy: "created_at", limit: options.limit || 500 });
  }

  function loadInstaComments(options = {}) {
    return list("aha_insta_comments", { orderBy: "created_at", limit: options.limit || 500 });
  }

  function loadInstaFollows(options = {}) {
    return list("aha_insta_follows", { orderBy: "created_at", limit: options.limit || 500 });
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
    saveList,
    savePath,
    saveGroup,
    saveInstaPost,
    saveInstaProfile,
    saveInstaLike,
    saveInstaComment,
    saveInstaFollow,
    saveImport,
    saveChamber,
    loadSourceEvents,
    loadNotes,
    loadGalleryItems,
    loadFeedPosts,
    loadLists,
    loadPaths,
    loadGroups,
    loadInstaPosts,
    loadInstaProfile,
    loadInstaLikes,
    loadInstaComments,
    loadInstaFollows,
    loadImports,
    loadChamber,
    loadDashboardCounts
  };
})(window);
