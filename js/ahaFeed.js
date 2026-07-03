// ahaFeed.js

(function () {
  "use strict";

  const KEY = "aha_feed_posts_v1";

  const FEED_SOURCE_METADATA = Object.freeze({
    source_app: "aha",
    source_type: "aha_feed_post",
    content_type: "text",
    user_created: true,
    imported: false,
    local_only: true
  });

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function safePostId(value) {
    const raw = String(value || "").trim();
    const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
    if (cleaned) return cleaned.slice(0, 120);
    return `feed_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  }

  function normalizeTags(tags) {
    const raw = Array.isArray(tags) ? tags : (typeof tags === "string" ? tags.split(",") : []);
    const out = [];
    const seen = new Set();
    raw.forEach((tag) => {
      const value = normalizeText(tag);
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return;
      seen.add(key);
      out.push(value);
    });
    return out;
  }

  function createLocalOnlyMeta(post) {
    return {
      feed_post_id: post.id,
      source_app: FEED_SOURCE_METADATA.source_app,
      source_type: FEED_SOURCE_METADATA.source_type,
      content_type: FEED_SOURCE_METADATA.content_type,
      user_created: true,
      imported: false,
      local_only: true,
      external_published: false,
      echonet_shared: false,
      created_at: post.created_at,
      updated_at: post.updated_at || post.created_at,
      tags: normalizeTags(post.tags)
    };
  }

  function createIngestInput(post) {
    const meta = createLocalOnlyMeta(post);
    return {
      ...FEED_SOURCE_METADATA,
      title: "AHA Feed lokal post",
      text: normalizeText(post.text),
      created_at: post.created_at,
      updated_at: post.updated_at || post.created_at,
      tags: meta.tags,
      meta
    };
  }

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function save(items) {
    localStorage.setItem(KEY, JSON.stringify(Array.isArray(items) ? items : []));
  }

  function postActionTime(post) {
    const times = [post?.deleted_at, post?.updated_at, post?.created_at]
      .map((value) => Date.parse(value || ""))
      .filter((value) => Number.isFinite(value));
    return times.length ? Math.max(...times) : 0;
  }

  function mergePosts(localPosts, remotePosts) {
    const merged = new Map();
    for (const post of Array.isArray(localPosts) ? localPosts : []) {
      if (post?.id) merged.set(post.id, post);
    }
    for (const post of Array.isArray(remotePosts) ? remotePosts : []) {
      if (!post?.id) continue;
      const existing = merged.get(post.id);
      if (!existing || postActionTime(post) >= postActionTime(existing)) {
        merged.set(post.id, post);
      }
    }
    return Array.from(merged.values()).sort((a, b) => postActionTime(b) - postActionTime(a));
  }

  async function pushLocalToDatabase(items) {
    if (!window.AHARepository?.saveFeedPost) return { ok: false, fallback: "localStorage" };
    const results = [];
    for (const post of items) {
      results.push(await window.AHARepository.saveFeedPost(post));
    }
    return { ok: results.some((r) => r?.ok), results };
  }

  async function syncFromDatabase() {
    if (!window.AHARepository?.loadFeedPosts) return { ok: false, fallback: "localStorage" };
    const local = load();
    if (local.length) await pushLocalToDatabase(local);
    const result = await window.AHARepository.loadFeedPosts();
    if (!result?.ok) return result || { ok: false };
    if (!Array.isArray(result.data)) {
      return { ...result, ok: false, fallback: "localStorage", data: local };
    }
    const merged = mergePosts(local, result.data);
    save(merged);
    render(merged);
    return { ...result, data: merged, merged: true };
  }

  function persistPost(post) {
    if (!window.AHARepository?.saveFeedPost) return;
    window.AHARepository.saveFeedPost(post).then((result) => {
      if (result?.ok === false && result.error) {
        console.warn("AHAFeed: database-save feilet", result.error);
      }
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function render(source) {
    const mount = document.getElementById("feed-list");
    if (!mount) return;
    const posts = (Array.isArray(source) ? source : load()).filter((post) => !post?.deleted_at);
    mount.innerHTML = posts.length
      ? posts.map((post) => `
        <article class="module-card">
          <p>${escapeHtml(post.text || "")}</p>
          <div class="module-meta">Lokal post · Ikke delt · ${escapeHtml(post.created_at || "")}${post.last_source_event_id ? ` · AHA source: ${escapeHtml(post.last_source_event_id)}` : ""}</div>
          <div class="module-actions"><button type="button" data-feed-ingest="${escapeHtml(post.id)}">Send til AHA</button><button type="button" data-feed-delete="${escapeHtml(post.id)}">Slett</button></div>
        </article>
      `).join("")
      : "<p>Ingen poster ennå.</p>";
  }

  async function ingestPost(postOrId) {
    const posts = load();
    const post = typeof postOrId === "string"
      ? posts.find((item) => item?.id === postOrId)
      : postOrId;
    if (!post || post.deleted_at || !normalizeText(post.text)) return null;
    if (post.last_source_event_id) {
      return { ok: true, skipped: true, reason: "already_ingested", source_event_id: post.last_source_event_id };
    }

    const ingestResult = await window.AHAIngest?.ingest?.(createIngestInput(post));
    if (ingestResult?.sourceEvent?.id) {
      post.last_source_event_id = ingestResult.sourceEvent.id;
      post.updated_at = post.updated_at || post.created_at;
      const index = posts.findIndex((item) => item?.id === post.id);
      if (index >= 0) {
        posts[index] = post;
        save(posts);
        persistPost(post);
        render(posts);
      }
    }
    return ingestResult || null;
  }

  async function addPost(input) {
    const now = new Date().toISOString();
    const post = {
      id: safePostId(input?.id),
      text: normalizeText(input?.text),
      tags: normalizeTags(input?.tags),
      meta: {},
      created_at: input?.created_at || now,
      updated_at: input?.updated_at || input?.created_at || now,
      local_only: true,
      external_published: false,
      echonet_shared: false
    };
    if (!post.text) return null;
    post.meta = createLocalOnlyMeta(post);
    const baseContract = window.AHAContracts?.createBaseItem?.({
      id: post.id,
      title: "AHA Feed lokal post",
      type: "aha_feed_post",
      source: "aha",
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      tags: post.tags,
      meta: post.meta
    });
    if (baseContract) post.base = baseContract;

    const posts = load();
    posts.unshift(post);
    save(posts);
    persistPost(post);
    render(posts);

    await ingestPost(post.id);
    return load().find((item) => item?.id === post.id) || post;
  }

  function deletePost(id) {
    const entries = load();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0) return null;
    const deletedAt = new Date().toISOString();
    entries[index] = { ...entries[index], deleted_at: deletedAt, updated_at: deletedAt };
    save(entries);
    persistPost(entries[index]);
    render(entries);
    return entries[index];
  }

  function bind() {
    const form = document.getElementById("feed-form");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = document.getElementById("feed-text");
      addPost({ text: text?.value });
      if (text) text.value = "";
    });
    document.getElementById("feed-list")?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const ingestId = target.dataset.feedIngest;
      if (ingestId) {
        ingestPost(ingestId);
        return;
      }
      const id = target.dataset.feedDelete;
      if (id) deletePost(id);
    });

    render();
    // Feed er lokal-only som standard. Database-sync finnes kun som eksplisitt API for eldre migrering/tester.
  }

  window.AHAFeed = { load, save, syncFromDatabase, addPost, ingestPost, deletePost, render, createIngestInput, normalizeText, safePostId };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
