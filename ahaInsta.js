// ahaInsta.js

(function () {
  "use strict";

  const KEY = "aha_insta_posts_v1";

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
    if (!window.AHARepository?.saveInstaPost) return { ok: false, fallback: "localStorage" };
    const results = [];
    for (const post of items) {
      results.push(await window.AHARepository.saveInstaPost(post));
    }
    return { ok: results.some((r) => r?.ok), results };
  }

  async function syncFromDatabase() {
    if (!window.AHARepository?.loadInstaPosts) return { ok: false, fallback: "localStorage" };
    const local = load();
    if (local.length) await pushLocalToDatabase(local);
    const result = await window.AHARepository.loadInstaPosts();
    if (!result?.ok || !Array.isArray(result.data)) return result || { ok: false };
    save(result.data);
    render(result.data);
    return result;
  }

  function persistPost(post) {
    if (!window.AHARepository?.saveInstaPost) return;
    window.AHARepository.saveInstaPost(post).then((result) => {
      if (result?.ok === false && result.error) {
        console.warn("AHAInsta: database-save feilet", result.error);
      }
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function renderMedia(src) {
    const value = String(src || "").trim();
    if (!value) return "";
    if (/\.(mp4|webm|ogg)(\?|#|$)/i.test(value)) {
      return `<video src="${escapeHtml(value)}" controls></video>`;
    }
    return `<img src="${escapeHtml(value)}" alt="" loading="lazy" />`;
  }

  function render(source) {
    const mount = document.getElementById("insta-list");
    if (!mount) return;
    const posts = (Array.isArray(source) ? source : load()).filter((post) => !post?.deleted_at);
    mount.innerHTML = posts.length
      ? posts.map((post) => `
        <article class="module-card">
          <h3>${escapeHtml(post.title || "Uten tittel")}</h3>
          ${renderMedia(post.src)}
          <p>${escapeHtml(post.caption || "")}</p>
          <div class="module-meta">${escapeHtml(post.created_at || "")}${post.last_source_event_id ? ` · source: ${escapeHtml(post.last_source_event_id)}` : ""}</div>
          <div class="module-actions"><button type="button" data-insta-delete="${escapeHtml(post.id)}">Slett</button></div>
        </article>
      `).join("")
      : "<p>Ingen Insta-poster ennå.</p>";
  }

  async function addPost(input) {
    const post = {
      id: `insta_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      title: String(input.title || "").trim(),
      src: String(input.src || "").trim(),
      caption: String(input.caption || "").trim(),
      content_type: /\.(mp4|webm|ogg)(\?|#|$)/i.test(String(input.src || "")) ? "video" : "image",
      tags: Array.isArray(input.tags) ? input.tags : [],
      meta: {},
      created_at: new Date().toISOString()
    };
    if (!post.title && !post.caption && !post.src) return null;

    const ingestResult = await window.AHAIngest?.ingest?.({
      source_type: "insta_post",
      source_app: "aha_insta",
      content_type: post.content_type,
      title: post.title,
      text: [post.title, post.caption].filter(Boolean).join("\n"),
      user_created: true,
      imported: false,
      created_at: post.created_at,
      meta: { insta_post_id: post.id, src: post.src }
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
    const form = document.getElementById("insta-form");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const title = document.getElementById("insta-title");
      const src = document.getElementById("insta-src");
      const caption = document.getElementById("insta-caption");
      addPost({ title: title?.value, src: src?.value, caption: caption?.value });
      if (title) title.value = "";
      if (src) src.value = "";
      if (caption) caption.value = "";
    });
    document.getElementById("insta-list")?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const id = target.dataset.instaDelete;
      if (id) deletePost(id);
    });

    render();
    syncFromDatabase();
    window.addEventListener("aha:auth-ready", syncFromDatabase);
  }

  window.AHAInsta = { load, save, syncFromDatabase, addPost, deletePost, render };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
