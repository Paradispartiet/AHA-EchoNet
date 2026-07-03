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

  async function syncFromDatabase() {
    const local = load();
    render(local);
    return { ok: false, fallback: "localStorage", local_only: true, data: local };
  }

  function persistItem() {
    // Gallery is intentionally local-only. Do not persist gallery image
    // references to repository/database APIs from this module.
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeTags(tags) {
    const raw = Array.isArray(tags) ? tags : (typeof tags === "string" ? tags.split(",") : []);
    const seen = new Set();
    const out = [];
    raw.forEach((tag) => {
      const value = normalizeText(tag);
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return;
      seen.add(key);
      out.push(value);
    });
    return out;
  }

  function safeGalleryId(value) {
    const candidate = normalizeText(value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96);
    if (candidate) return candidate;
    return `gal_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  }

  function localOnlyMetadata(item) {
    return {
      source_app: "aha",
      source_type: "aha_gallery_item",
      content_type: item?.type === "video" ? "visual_note" : "image_reference",
      user_created: true,
      imported: false,
      local_only: true
    };
  }

  function buildIngestPayload(item) {
    const title = normalizeText(item?.title);
    const description = normalizeText(item?.description || item?.caption || item?.note);
    const tags = normalizeTags(item?.tags);
    const text = [title, description, tags.length ? `Tags: ${tags.join(", ")}` : ""].filter(Boolean).join("\n");
    const sourceMeta = localOnlyMetadata(item);

    return {
      ...sourceMeta,
      id: item?.last_source_event_id || `src_gallery_${safeGalleryId(item?.id)}`,
      title,
      text,
      tags,
      user_created: true,
      imported: false,
      local_only: true,
      created_at: item?.created_at || new Date().toISOString(),
      meta: {
        ...sourceMeta,
        gallery_item_id: item?.id || null,
        title: title || null,
        caption: normalizeText(item?.caption) || null,
        note: normalizeText(item?.note) || null,
        description: description || null,
        created_at: item?.created_at || null,
        updated_at: item?.updated_at || null,
        tags,
        local_only: true
      }
    };
  }

  async function ingestItemText(item) {
    if (!window.AHAIngest?.ingest) return { ok: false, reason: "missing_AHAIngest" };
    const payload = buildIngestPayload(item);
    if (!payload.title && !payload.text) return { ok: false, reason: "empty_text" };
    return window.AHAIngest.ingest(payload);
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
    const now = new Date().toISOString();
    const item = {
      id: safeGalleryId(input.id),
      type: mediaType,
      title: normalizeText(input.title),
      description: normalizeText(input.description || input.caption || input.note),
      caption: normalizeText(input.caption),
      note: normalizeText(input.note),
      src: String(input.src || "").trim(),
      thumbnail: String(input.thumbnail || input.src || "").trim(),
      ...localOnlyMetadata({ type: mediaType }),
      tags: normalizeTags(input.tags),
      meta: { local_only: true, not_published: true, echonet_shared: false, image_analysis_enabled: false },
      created_at: now,
      updated_at: now
    };
    const baseContract = window.AHAContracts?.createBaseItem?.({
      id: item.id,
      title: item.title || "Galleriobjekt",
      type: mediaType === "video" ? "gallery_video" : "gallery_image",
      source: "aha_gallery",
      createdAt: item.created_at,
      updatedAt: item.created_at,
      tags: item.tags,
      meta: { gallery_item_id: item.id, local_only: true, not_published: true, echonet_shared: false }
    });
    if (baseContract) item.base = baseContract;
    if (!item.title && !item.description && !item.src) return null;

    const ingestResult = await ingestItemText(item);

    if (ingestResult?.sourceEvent?.id) item.last_source_event_id = ingestResult.sourceEvent.id;
    if (ingestResult?.ok) item.last_ingested_at = new Date().toISOString();

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
    // Local-only boundary: do not auto-sync Gallery objects or image references.
  }

  window.AHAGallery = { load, save, syncFromDatabase, addItem, deleteItem, render, buildIngestPayload, ingestItemText };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
