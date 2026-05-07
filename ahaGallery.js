// ahaGallery.js

(function () {
  "use strict";

  const KEY = "aha_gallery_v1";

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
    const mount = document.getElementById("gallery-list");
    if (!mount) return;
    const items = load();
    mount.innerHTML = items.length
      ? items.map((item) => `
        <article class="module-card">
          <h3>${escapeHtml(item.title || "Uten tittel")}</h3>
          <p>${escapeHtml(item.description || "")}</p>
          ${renderMedia(item.src)}
          <div class="module-meta">${escapeHtml(item.created_at || "")}</div>
        </article>
      `).join("")
      : "<p>Ingen galleriobjekter ennå.</p>";
  }

  function addItem(input) {
    const item = {
      id: `gal_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      type: /\.(mp4|webm|ogg)(\?|#|$)/i.test(String(input.src || "")) ? "video" : "image",
      title: String(input.title || "").trim(),
      description: String(input.description || "").trim(),
      src: String(input.src || "").trim(),
      created_at: new Date().toISOString()
    };
    if (!item.title && !item.description && !item.src) return null;

    const items = load();
    items.unshift(item);
    save(items);

    window.AHAIngest?.ingest?.({
      source_type: "gallery",
      source_app: "aha_gallery",
      content_type: item.type,
      title: item.title,
      text: [item.title, item.description].filter(Boolean).join("\n"),
      user_created: true,
      imported: false,
      created_at: item.created_at,
      meta: { gallery_item_id: item.id, src: item.src, media_type: item.type }
    });

    render();
    return item;
  }

  function bind() {
    const form = document.getElementById("gallery-form");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const title = document.getElementById("gallery-title");
      const src = document.getElementById("gallery-src");
      const description = document.getElementById("gallery-description");
      addItem({ title: title?.value, src: src?.value, description: description?.value });
      if (title) title.value = "";
      if (src) src.value = "";
      if (description) description.value = "";
    });
    render();
  }

  window.AHAGallery = { load, save, addItem, render };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
