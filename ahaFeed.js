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
    const posts = Array.isArray(source) ? source : load();
    mount.innerHTML = posts.length
      ? posts.map((post) => `
        <article class="module-card">
          <p>${escapeHtml(post.text || "")}</p>
          <div class="module-meta">${escapeHtml(post.created_at || "")}</div>
        </article>
      `).join("")
      : "<p>Ingen poster ennå.</p>";
  }

  function addPost(input) {
    const post = {
      id: `feed_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      text: String(input.text || "").trim(),
      tags: Array.isArray(input.tags) ? input.tags : [],
      meta: {},
      created_at: new Date().toISOString()
    };
    if (!post.text) return null;

    const posts = load();
    posts.unshift(post);
    save(posts);
    persistPost(post);

    window.AHAIngest?.ingest?.({
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

    render(posts);
    return post;
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
    render();
    syncFromDatabase();
    window.addEventListener("aha:auth-ready", syncFromDatabase);
  }

  window.AHAFeed = { load, save, syncFromDatabase, addPost, render };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
