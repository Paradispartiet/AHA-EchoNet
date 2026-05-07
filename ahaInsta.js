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

  function render() {
    const mount = document.getElementById("insta-list");
    if (!mount) return;
    const posts = load();
    mount.innerHTML = posts.length
      ? posts.map((post) => `
        <article class="module-card">
          <h3>${escapeHtml(post.title || "Uten tittel")}</h3>
          ${renderMedia(post.src)}
          <p>${escapeHtml(post.caption || "")}</p>
          <div class="module-meta">${escapeHtml(post.created_at || "")}</div>
        </article>
      `).join("")
      : "<p>Ingen Insta-poster ennå.</p>";
  }

  function addPost(input) {
    const post = {
      id: `insta_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      title: String(input.title || "").trim(),
      src: String(input.src || "").trim(),
      caption: String(input.caption || "").trim(),
      content_type: /\.(mp4|webm|ogg)(\?|#|$)/i.test(String(input.src || "")) ? "video" : "image",
      created_at: new Date().toISOString()
    };
    if (!post.title && !post.caption && !post.src) return null;

    const posts = load();
    posts.unshift(post);
    save(posts);

    window.AHAIngest?.ingest?.({
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

    render();
    return post;
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
    render();
  }

  window.AHAInsta = { load, save, addPost, render };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
