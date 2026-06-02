// ahaFeed.js

(function () {
  "use strict";

  const KEY = "aha_feed_posts_v1";

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
    if (!result?.ok || !Array.isArray(result.data)) return result || { ok: false };
    save(result.data);
    render(result.data);
    return result;
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
          <div class="module-meta">${escapeHtml(post.created_at || "")}${post.last_source_event_id ? ` · source: ${escapeHtml(post.last_source_event_id)}` : ""}</div>
          <div class="module-actions"><button type="button" data-feed-delete="${escapeHtml(post.id)}">Slett</button></div>
        </article>
      `).join("")
      : "<p>Ingen poster ennå.</p>";
  }

  async function addPost(input) {
    const post = {
      id: `feed_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      text: String(input.text || "").trim(),
      tags: Array.isArray(input.tags) ? input.tags : [],
      meta: {},
      created_at: new Date().toISOString()
    };
    const baseContract = window.AHAContracts?.createBaseItem?.({
      id: post.id,
      title: "AHA Feed-post",
      type: "feed_post",
      source: "aha_feed",
      createdAt: post.created_at,
      updatedAt: post.created_at,
      tags: post.tags,
      meta: { feed_post_id: post.id }
    });
    if (baseContract) post.base = baseContract;
    if (!post.text) return null;

    const ingestResult = await window.AHAIngest?.ingest?.({
      source_type: "feed_post",
      source_app: "aha_feed",
      content_type: "text",
      title: "AHA Feed-post",
      text: post.text,
      user_created: true,
      imported: false,
      created_at: post.created_at,
      meta: { feed_post_id: post.id }
    });

    if (ingestResult?.sourceEvent?.id) post.last_source_event_id = ingestResult.sourceEvent.id;

    const posts = load();
    posts.unshift(post);
    save(posts);
    persistPost(post);

    render(posts);
    return post;
  }

  function deletePost(id) {
    const entries = load();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0) return null;
    entries[index] = { ...entries[index], deleted_at: new Date().toISOString() };
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
      const id = target.dataset.feedDelete;
      if (id) deletePost(id);
    });

    render();
    syncFromDatabase();
    window.addEventListener("aha:auth-ready", syncFromDatabase);
  }

  window.AHAFeed = { load, save, syncFromDatabase, addPost, deletePost, render };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
