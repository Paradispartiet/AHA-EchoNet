(function () {
  "use strict";

  const POSTS_KEY = "aha_insta_posts_v1";
  const STORIES_KEY = "aha_insta_stories_v1";
  const IMPORT_SESSIONS_KEY = "aha_insta_import_sessions_v1";
  const IMPORT_PREVIEW_KEY = "aha_insta_import_preview_v1";

  const id = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const now = () => new Date().toISOString();

  function readArray(key) { try { const p = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(p) ? p : []; } catch { return []; } }
  function writeArray(key, value) { localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : [])); }
  const load = () => readArray(POSTS_KEY);
  const save = (items) => writeArray(POSTS_KEY, items);
  const loadStories = () => readArray(STORIES_KEY);
  const saveStories = (stories) => writeArray(STORIES_KEY, stories);
  const loadImportSessions = () => readArray(IMPORT_SESSIONS_KEY);
  const saveImportSessions = (sessions) => writeArray(IMPORT_SESSIONS_KEY, sessions);
  const loadImportPreview = () => readArray(IMPORT_PREVIEW_KEY);
  const saveImportPreview = (items) => writeArray(IMPORT_PREVIEW_KEY, items);
  const clearImportPreview = () => localStorage.removeItem(IMPORT_PREVIEW_KEY);

  function createImportSession(input = {}) {
    const session = { id: id("insta_import"), source: "instagram_export", status: "pending", created_at: now(), updated_at: now(), importedPostCount: 0, importedStoryCount: 0, importedMediaCount: 0, errors: [], filesSeen: [], parserMode: input.parserMode || "v1" };
    const all = loadImportSessions(); all.unshift(session); saveImportSessions(all); return session;
  }
  function updateImportSession(sessionId, patch = {}) {
    const all = loadImportSessions(); const ix = all.findIndex((s) => s.id === sessionId); if (ix < 0) return null;
    all[ix] = { ...all[ix], ...patch, updated_at: now() }; saveImportSessions(all); return all[ix];
  }

  function escapeHtml(v) { return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
  function detectMediaType(src = "") { return /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(src) ? "video" : (/\.(png|jpe?g|gif|webp|bmp|heic)(\?|#|$)/i.test(src) ? "image" : "unknown"); }
  function renderMedia(src) { if (!src) return ""; return detectMediaType(src) === "video" ? `<video src="${escapeHtml(src)}" controls></video>` : `<img src="${escapeHtml(src)}" alt="" loading="lazy" />`; }

  async function parseInstagramJsonFile(file) {
    const text = await file.text(); const raw = JSON.parse(text); const items = [];
    const visit = (node, hint = "media") => {
      if (Array.isArray(node)) return node.forEach((n) => visit(n, hint));
      if (!node || typeof node !== "object") return;
      if (node.stories) visit(node.stories, "story"); if (node.posts) visit(node.posts, "post"); if (node.media) visit(node.media, "media");
      const src = node.media_uri || node.uri || node.path || node.src || node.thumbnail_uri || "";
      const caption = node.caption || node.text || node.title || node.name || "";
      const ts = node.timestamp || node.creation_timestamp || node.taken_at || node.created_at || null;
      const type = /story/i.test(String(node.type || hint)) ? "story" : (/post/i.test(String(node.type || hint)) ? "post" : hint);
      if (src || caption) items.push({ id: id("preview"), source: "instagram_export", originalInstagramId: String(node.id || ""), originalInstagramDate: ts ? new Date(Number(ts) > 10000000000 ? Number(ts) : Number(ts) * 1000).toISOString() : null, mediaType: detectMediaType(String(src)), src: String(src || ""), caption: String(caption || ""), title: String(node.title || ""), type, imported: true, visibility: "private", created_at: now(), meta: { file: file.name, rawType: node.type || hint } });
      Object.values(node).forEach((v) => (typeof v === "object" ? visit(v, hint) : null));
    };
    visit(raw);
    return { items, raw };
  }

  async function parseInstagramExport(files) {
    const session = createImportSession({ parserMode: "heuristic_json_media_v1" });
    const parsed = []; const errors = []; const filesSeen = [];
    for (const file of Array.from(files || [])) {
      filesSeen.push(file.name);
      if (/\.zip$/i.test(file.name)) { errors.push(`ZIP-fil er valgt. Første versjon er klar for Instagram-eksport, men ZIP-parseren må kobles på før faktisk ZIP-import. (${file.name})`); continue; }
      if (/\.json$/i.test(file.name) || file.type === "application/json") {
        try {
          const result = await parseInstagramJsonFile(file);
          if (!result.items.length) errors.push(`Kunne ikke tolke innhold i ${file.name} ennå.`);
          parsed.push(...result.items);
        } catch (e) { errors.push(`JSON-feil i ${file.name}: ${e.message}`); }
        continue;
      }
      if ((file.type || "").startsWith("image/") || (file.type || "").startsWith("video/")) {
        parsed.push({ id: id("preview"), source: "instagram_export", originalInstagramId: "", originalInstagramDate: null, mediaType: (file.type || "").startsWith("video/") ? "video" : "image", src: URL.createObjectURL(file), caption: "", title: file.name, type: "media", imported: true, visibility: "private", created_at: now(), meta: { file: file.name, objectUrl: true } });
      } else errors.push(`Filtype ikke tolket ennå: ${file.name}`);
    }
    const preview = buildInstagramImportPreview(parsed); saveImportPreview(preview.items);
    updateImportSession(session.id, { status: parsed.length ? "parsed" : "failed", importedPostCount: preview.counts.posts, importedStoryCount: preview.counts.stories, importedMediaCount: preview.counts.media, errors, filesSeen });
    renderImportStatus(); renderImportPreview();
    return { sessionId: session.id, items: parsed, errors };
  }

  function buildInstagramImportPreview(parsed) { const items = Array.isArray(parsed) ? parsed : []; return { items, counts: { posts: items.filter((i) => i.type === "post").length, stories: items.filter((i) => i.type === "story").length, media: items.filter((i) => i.type === "media").length } }; }

  function persistPost(post) { if (!window.AHARepository?.saveInstaPost) return; window.AHARepository.saveInstaPost(post).catch(() => {}); }
  async function completeInstagramImport(options = {}) {
    const selectedIds = new Set(options.selectedIds || []); const visibility = options.visibility === "public" ? "public" : "private";
    const connectIngest = !!options.connectIngest; const preview = loadImportPreview(); const selected = preview.filter((i) => selectedIds.has(i.id));
    const posts = load(); const stories = loadStories();
    for (const item of selected) {
      if (item.type === "story") {
        stories.unshift({ id: id("story"), ownerId: "local", mediaType: item.mediaType, src: item.src, caption: item.caption || item.title || "", created_at: now(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), originalInstagramDate: item.originalInstagramDate || null, imported: true, archived: false, meta: { import_session_id: options.sessionId || null } });
      } else {
        const post = { id: id("insta"), title: item.title || "Importert", src: item.src || "", caption: item.caption || "", content_type: item.mediaType === "video" ? "video" : "image", tags: [], created_at: now(), imported: true, source_app: "instagram", source_type: "instagram_export", visibility, originalInstagramDate: item.originalInstagramDate || null, meta: { import_session_id: options.sessionId || null } };
        posts.unshift(post); persistPost(post);
        if (connectIngest && (post.caption || post.title)) await window.AHAIngest?.ingest?.({ source_type: "insta_post", source_app: "aha_insta", content_type: post.content_type, title: post.title, text: [post.title, post.caption].filter(Boolean).join("\n"), user_created: true, imported: true, created_at: post.created_at, meta: { insta_post_id: post.id, src: post.src, import_session_id: options.sessionId || null } });
      }
    }
    save(posts); saveStories(stories); clearImportPreview();
    if (options.sessionId) updateImportSession(options.sessionId, { status: "completed" });
    render(); renderStories(); renderImportStatus(); renderImportPreview();
  }

  function renderImportStatus() {
    const el = document.getElementById("insta-import-status"); if (!el) return; const s = loadImportSessions()[0]; if (!s) { el.innerHTML = ""; return; }
    const errors = (s.errors || []).map((e) => `<li>${escapeHtml(e)}</li>`).join("");
    el.innerHTML = `<strong>Status:</strong> ${escapeHtml(s.status)} · poster:${s.importedPostCount} stories:${s.importedStoryCount} media:${s.importedMediaCount}${errors ? `<ul class="insta-errors">${errors}</ul>` : ""}`;
  }

  function renderImportPreview() {
    const mount = document.getElementById("insta-import-preview"); if (!mount) return; const preview = loadImportPreview();
    if (!preview.length) { mount.innerHTML = "<p>Ingen forhåndsvisning ennå.</p>"; return; }
    const c = buildInstagramImportPreview(preview).counts;
    mount.innerHTML = `<div class="module-meta">Mulige poster: ${c.posts} · stories: ${c.stories} · media: ${c.media}</div>
    <label><input id="insta-import-visibility" type="radio" name="insta-visibility" value="private" checked /> Publiser som private</label>
    <label><input type="radio" name="insta-visibility" value="public" /> Publiser som offentlige</label>
    <label><input id="insta-import-connect-ingest" type="checkbox" /> Koble importerte captions til AHA-innsikt</label>
    <div>${preview.map((item) => `<article class="module-card insta-import-card"><label><input type="checkbox" data-import-item="${escapeHtml(item.id)}" checked /> Importer</label><strong>${escapeHtml(item.type)}</strong>${renderMedia(item.src)}<p>${escapeHtml(item.caption || item.title || "")}</p></article>`).join("")}</div>
    <button id="insta-import-complete" type="button">Importer valgte</button>`;
  }

  function renderStories() {
    const mount = document.getElementById("insta-stories"); if (!mount) return; const stories = loadStories().filter((s) => !s.archived);
    mount.innerHTML = stories.length ? `<div class="insta-stories-row">${stories.map((s) => `<article class="module-card insta-story-card">${renderMedia(s.src)}<p>${escapeHtml(s.caption || "")}</p>${s.imported ? '<div class="module-meta">importert</div>' : ""}</article>`).join("")}</div>` : "<p>Ingen stories ennå.</p>";
  }

  function render(source) {
    const mount = document.getElementById("insta-list"); if (!mount) return; const posts = (Array.isArray(source) ? source : load()).filter((p) => !p.deleted_at);
    mount.innerHTML = posts.length ? posts.map((post) => `<article class="module-card"><h3>${escapeHtml(post.title || "Uten tittel")}</h3>${renderMedia(post.src)}<p>${escapeHtml(post.caption || "")}</p><div class="module-meta">${escapeHtml(post.created_at || "")}${post.originalInstagramDate ? ` · opprinnelig: ${escapeHtml(post.originalInstagramDate)}` : ""}${post.imported ? " · Importert fra Instagram" : ""}</div><div class="module-actions"><button type="button" data-insta-delete="${escapeHtml(post.id)}">Slett</button></div></article>`).join("") : "<p>Ingen Insta-poster ennå.</p>";
  }

  function deletePost(idToDelete) { const entries = load(); const i = entries.findIndex((e) => e.id === idToDelete); if (i < 0) return; entries[i] = { ...entries[i], deleted_at: now() }; save(entries); persistPost(entries[i]); render(entries); }
  async function syncFromDatabase() { if (!window.AHARepository?.loadInstaPosts) return; const result = await window.AHARepository.loadInstaPosts(); if (result?.ok && Array.isArray(result.data)) { save(result.data); render(result.data); } }
  async function addPost(input) { const post = { id: id("insta"), title: String(input.title || "").trim(), src: String(input.src || "").trim(), caption: String(input.caption || "").trim(), content_type: detectMediaType(String(input.src || "")) === "video" ? "video" : "image", tags: [], meta: {}, created_at: now() }; if (!post.title && !post.caption && !post.src) return null; const posts = load(); posts.unshift(post); save(posts); persistPost(post); render(posts); return post; }

  function bind() {
    document.getElementById("insta-form")?.addEventListener("submit", (event) => { event.preventDefault(); const title = document.getElementById("insta-title"); const src = document.getElementById("insta-src"); const caption = document.getElementById("insta-caption"); addPost({ title: title?.value, src: src?.value, caption: caption?.value }); if (title) title.value = ""; if (src) src.value = ""; if (caption) caption.value = ""; });
    document.getElementById("insta-list")?.addEventListener("click", (event) => { const target = event.target; if (target instanceof HTMLElement && target.dataset.instaDelete) deletePost(target.dataset.instaDelete); });
    document.getElementById("insta-import-files")?.addEventListener("change", (event) => parseInstagramExport(event.target.files));
    document.getElementById("insta-import-preview")?.addEventListener("click", (event) => {
      const target = event.target; if (!(target instanceof HTMLElement) || target.id !== "insta-import-complete") return;
      const selectedIds = [...document.querySelectorAll("input[data-import-item]:checked")].map((el) => el.getAttribute("data-import-item"));
      const visibility = document.querySelector("input[name='insta-visibility']:checked")?.value || "private";
      const connectIngest = !!document.getElementById("insta-import-connect-ingest")?.checked;
      const sessionId = loadImportSessions()[0]?.id || null;
      completeInstagramImport({ selectedIds, visibility, connectIngest, sessionId });
    });

    render(); renderStories(); renderImportStatus(); renderImportPreview(); syncFromDatabase();
    window.addEventListener("aha:auth-ready", syncFromDatabase);
  }

  window.AHAInsta = { load, save, loadStories, saveStories, loadImportSessions, saveImportSessions, createImportSession, updateImportSession, parseInstagramExport, parseInstagramJsonFile, buildInstagramImportPreview, saveImportPreview, loadImportPreview, clearImportPreview, completeInstagramImport, renderImportStatus, renderImportPreview, renderStories, syncFromDatabase, addPost, deletePost, render };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind); else bind();
})();
