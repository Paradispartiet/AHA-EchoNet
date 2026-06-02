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

  function galleryActionTime(item) {
    const times = [item?.deleted_at, item?.updated_at, item?.created_at]
      .map((value) => Date.parse(value || ""))
      .filter((value) => Number.isFinite(value));
    return times.length ? Math.max(...times) : 0;
  }

  function mergeGalleryItems(localItems, remoteItems) {
    const merged = new Map();
    for (const item of Array.isArray(localItems) ? localItems : []) {
      if (item?.id) merged.set(String(item.id), item);
    }
    for (const item of Array.isArray(remoteItems) ? remoteItems : []) {
      if (!item?.id) continue;
      const key = String(item.id);
      const existing = merged.get(key);
      if (!existing || galleryActionTime(item) >= galleryActionTime(existing)) {
        merged.set(key, item);
      }
    }
    return Array.from(merged.values()).sort((a, b) => galleryActionTime(b) - galleryActionTime(a));
  }

  async function pushLocalToDatabase(items) {
    if (!window.AHARepository?.saveGalleryItem) return { ok: false, fallback: "localStorage" };
    const results = [];
    for (const item of items) {
      results.push(await window.AHARepository.saveGalleryItem(item));
    }
    return { ok: results.some((r) => r?.ok), results };
  }

  async function syncFromDatabase() {
    if (!window.AHARepository?.loadGalleryItems) return { ok: false, fallback: "localStorage" };
    const local = load();
    if (local.length) await pushLocalToDatabase(local);
    const result = await window.AHARepository.loadGalleryItems();
    if (!result?.ok) return result || { ok: false };
    if (!Array.isArray(result.data)) {
      return { ...result, ok: false, fallback: "localStorage", data: local };
    }
    const merged = mergeGalleryItems(local, result.data);
    save(merged);
    render(merged);
    return { ...result, data: merged, merged: true };
  }

  function persistItem(item) {
    if (!window.AHARepository?.saveGalleryItem) return;
    window.AHARepository.saveGalleryItem(item).then((result) => {
      if (result?.ok === false && result.error) {
        console.warn("AHAGallery: database-save feilet", result.error);
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
    const mount = document.getElementById("gallery-list");
    if (!mount) return;
    const items = (Array.isArray(source) ? source : load()).filter((item) => !item?.deleted_at);
    mount.innerHTML = items.length
      ? items.map((item) => `
        <article class="module-card">
          <h3>${escapeHtml(item.title || "Uten tittel")}</h3>
          <p>${escapeHtml(item.description || "")}</p>
          ${renderMedia(item.src)}
          <div class="module-meta">${escapeHtml(item.created_at || "")}${item.last_source_event_id ? ` · source: ${escapeHtml(item.last_source_event_id)}` : ""}</div>
          <div class="module-actions"><button type="button" data-gallery-delete="${escapeHtml(item.id)}">Slett</button></div>
        </article>
      `).join("")
      : "<p>Ingen galleriobjekter ennå.</p>";
  }

  async function addItem(input) {
    const mediaType = /\.(mp4|webm|ogg)(\?|#|$)/i.test(String(input.src || "")) ? "video" : "image";
    const item = {
      id: `gal_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      type: mediaType,
      title: String(input.title || "").trim(),
      description: String(input.description || "").trim(),
      src: String(input.src || "").trim(),
      thumbnail: String(input.thumbnail || input.src || "").trim(),
      source_type: "gallery",
      source_app: "aha_gallery",
      user_created: true,
      imported: false,
      tags: Array.isArray(input.tags) ? input.tags : [],
      meta: {},
      created_at: new Date().toISOString()
    };
    const baseContract = window.AHAContracts?.createBaseItem?.({
      id: item.id,
      title: item.title || "Galleriobjekt",
      type: mediaType === "video" ? "gallery_video" : "gallery_image",
      source: "aha_gallery",
      createdAt: item.created_at,
      updatedAt: item.created_at,
      tags: item.tags,
      meta: { gallery_item_id: item.id, src: item.src }
    });
    if (baseContract) item.base = baseContract;
    if (!item.title && !item.description && !item.src) return null;

    const ingestResult = await window.AHAIngest?.ingest?.({
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

    if (ingestResult?.sourceEvent?.id) item.last_source_event_id = ingestResult.sourceEvent.id;

    const items = load();
    items.unshift(item);
    save(items);
    persistItem(item);

    render(items);
    return item;
  }

  function deleteItem(id) {
    const entries = load();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0) return null;
    const deletedAt = new Date().toISOString();
    entries[index] = { ...entries[index], deleted_at: deletedAt, updated_at: deletedAt };
    save(entries);
    persistItem(entries[index]);
    render(entries);
    return entries[index];
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
    document.getElementById("gallery-list")?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const id = target.dataset.galleryDelete;
      if (id) deleteItem(id);
    });

    render();
    syncFromDatabase();
    window.addEventListener("aha:auth-ready", syncFromDatabase);
  }

  window.AHAGallery = { load, save, syncFromDatabase, addItem, deleteItem, render };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
