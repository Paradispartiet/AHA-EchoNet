(function () {
  "use strict";

  const POSTS_KEY = "aha_insta_posts_v1";
  const STORIES_KEY = "aha_insta_stories_v1";
  const IMPORT_SESSIONS_KEY = "aha_insta_import_sessions_v1";
  const IMPORT_PREVIEW_KEY = "aha_insta_import_preview_v1";
  const MAX_MEDIA_DATA_URL_SIZE = 10 * 1024 * 1024;

  const createId = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const nowIso = () => new Date().toISOString();

  function readArray(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeArray(key, value) {
    localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
  }

  function load() {
    return readArray(POSTS_KEY);
  }

  function save(items) {
    writeArray(POSTS_KEY, items);
  }

  function loadStories() {
    return readArray(STORIES_KEY);
  }

  function saveStories(stories) {
    writeArray(STORIES_KEY, stories);
  }

  function loadImportSessions() {
    return readArray(IMPORT_SESSIONS_KEY);
  }

  function saveImportSessions(sessions) {
    writeArray(IMPORT_SESSIONS_KEY, sessions);
  }

  function loadImportPreview() {
    return readArray(IMPORT_PREVIEW_KEY);
  }

  function saveImportPreview(items) {
    writeArray(IMPORT_PREVIEW_KEY, items);
  }

  function clearImportPreview() {
    localStorage.removeItem(IMPORT_PREVIEW_KEY);
  }

  function createImportSession(input = {}) {
    const session = {
      id: createId("insta_import"),
      source: "instagram_export",
      status: "pending",
      created_at: nowIso(),
      updated_at: nowIso(),
      importedPostCount: 0,
      importedStoryCount: 0,
      importedMediaCount: 0,
      errors: [],
      filesSeen: [],
      parserMode: input.parserMode || "v1"
    };

    const sessions = loadImportSessions();
    sessions.unshift(session);
    saveImportSessions(sessions);
    return session;
  }

  function updateImportSession(sessionId, patch = {}) {
    const sessions = loadImportSessions();
    const index = sessions.findIndex((entry) => entry.id === sessionId);
    if (index < 0) return null;

    sessions[index] = { ...sessions[index], ...patch, updated_at: nowIso() };
    saveImportSessions(sessions);
    return sessions[index];
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function detectMediaType(src = "") {
    if (/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(src)) return "video";
    if (/\.(png|jpe?g|gif|webp|bmp|heic)(\?|#|$)/i.test(src)) return "image";
    return "unknown";
  }

  function renderMedia(src, mediaType) {
    const safeSrc = String(src || "").trim();
    if (!safeSrc) return "";

    const resolvedMediaType = mediaType || detectMediaType(safeSrc);
    if (resolvedMediaType === "video") {
      return `<video src="${escapeHtml(safeSrc)}" controls></video>`;
    }

    if (resolvedMediaType === "image") {
      return `<img src="${escapeHtml(safeSrc)}" alt="" loading="lazy" />`;
    }

    return detectMediaType(safeSrc) === "video"
      ? `<video src="${escapeHtml(safeSrc)}" controls></video>`
      : `<img src="${escapeHtml(safeSrc)}" alt="" loading="lazy" />`;
  }

  function normalizeInstagramDate(value) {
    if (value === null || value === undefined || value === "") return null;

    try {
      if (typeof value === "number") {
        const milliseconds = value > 10000000000 ? value : value * 1000;
        const date = new Date(milliseconds);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
      }

      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return null;

        if (/^\d+$/.test(trimmed)) {
          const asNumber = Number(trimmed);
          const milliseconds = asNumber > 10000000000 ? asNumber : asNumber * 1000;
          const date = new Date(milliseconds);
          return Number.isNaN(date.getTime()) ? null : date.toISOString();
        }

        const date = new Date(trimmed);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
      }

      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    } catch {
      return null;
    }
  }

  function inferInstagramItemType(node, hint, fileNameOrPath) {
    const scope = `${hint || ""} ${fileNameOrPath || ""} ${node?.type || ""}`.toLowerCase();
    if (scope.includes("stories") || scope.includes("story")) return "story";
    if (scope.includes("media/posts") || scope.includes("/posts") || scope.includes("posts") || scope.includes("post")) return "post";
    return "media";
  }

  function dedupeImportItems(items) {
    const seen = new Set();
    const deduped = [];

    for (const item of items) {
      const key = [item.src || "", item.caption || "", item.originalInstagramDate || "", item.type || "media"].join("||");
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }

    return deduped;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Kunne ikke lese fil."));
      reader.readAsDataURL(file);
    });
  }

  async function parseInstagramJsonFile(file) {
    const text = await file.text();
    const raw = JSON.parse(text);
    const items = [];
    const handledKeys = new Set(["stories", "posts", "media"]);

    function visit(node, hint = "media", location = file.name) {
      if (Array.isArray(node)) {
        for (const entry of node) visit(entry, hint, location);
        return;
      }

      if (!node || typeof node !== "object") return;

      if (node.stories) visit(node.stories, "story", `${location}/stories`);
      if (node.posts) visit(node.posts, "post", `${location}/posts`);
      if (node.media) visit(node.media, "media", `${location}/media`);

      const src = node.media_uri || node.uri || node.path || node.src || node.thumbnail_uri || "";
      const caption = node.caption || node.text || node.title || node.name || "";
      const dateValue = node.timestamp || node.creation_timestamp || node.taken_at || node.created_at || null;
      const normalizedDate = normalizeInstagramDate(dateValue);
      const type = inferInstagramItemType(node, hint, `${location} ${src}`);

      if (src || caption) {
        items.push({
          id: createId("preview"),
          source: "instagram_export",
          originalInstagramId: String(node.id || ""),
          originalInstagramDate: normalizedDate,
          mediaType: detectMediaType(String(src || "")),
          src: String(src || ""),
          caption: String(caption || ""),
          title: String(node.title || ""),
          type,
          imported: true,
          visibility: "private",
          created_at: nowIso(),
          meta: { file: file.name, rawType: node.type || hint }
        });
      }

      for (const [key, value] of Object.entries(node)) {
        if (handledKeys.has(key)) continue;
        if (value && typeof value === "object") visit(value, hint, `${location}/${key}`);
      }
    }

    visit(raw, "media", file.name);
    return { items: dedupeImportItems(items), raw };
  }

  function buildInstagramImportPreview(parsed) {
    const items = Array.isArray(parsed) ? parsed : [];
    return {
      items,
      counts: {
        posts: items.filter((item) => item.type === "post").length,
        stories: items.filter((item) => item.type === "story").length,
        media: items.filter((item) => item.type === "media").length
      }
    };
  }

  async function parseInstagramExport(files) {
    const session = createImportSession({ parserMode: "heuristic_json_media_v1" });
    const parsedItems = [];
    const errors = [];
    const filesSeen = [];

    for (const file of Array.from(files || [])) {
      filesSeen.push(file.name);

      if (/\.zip$/i.test(file.name)) {
        errors.push(`ZIP-fil er valgt. Første versjon er klar for Instagram-eksport, men ZIP-parseren må kobles på før faktisk ZIP-import. (${file.name})`);
        continue;
      }

      if (/\.json$/i.test(file.name) || file.type === "application/json") {
        try {
          const result = await parseInstagramJsonFile(file);
          if (!result.items.length) {
            errors.push(`Kunne ikke tolke innhold i ${file.name} ennå.`);
          }
          parsedItems.push(...result.items);
        } catch (error) {
          errors.push(`JSON-feil i ${file.name}: ${error?.message || error}`);
        }
        continue;
      }

      if ((file.type || "").startsWith("image/") || (file.type || "").startsWith("video/")) {
        if (file.size > MAX_MEDIA_DATA_URL_SIZE) {
          errors.push(`Filen er for stor for lokal MVP-import og må senere håndteres via Storage/backend: ${file.name}`);
          continue;
        }

        try {
          const dataUrl = await readFileAsDataUrl(file);
          parsedItems.push({
            id: createId("preview"),
            source: "instagram_export",
            originalInstagramId: "",
            originalInstagramDate: null,
            mediaType: (file.type || "").startsWith("video/") ? "video" : "image",
            src: String(dataUrl || ""),
            caption: "",
            title: file.name,
            type: inferInstagramItemType({}, "media", file.name),
            imported: true,
            visibility: "private",
            created_at: nowIso(),
            meta: { file: file.name, dataUrl: true, originalFileName: file.name }
          });
        } catch (error) {
          errors.push(`Kunne ikke lese fil ${file.name}: ${error?.message || error}`);
        }
        continue;
      }

      errors.push(`Filtype ikke tolket ennå: ${file.name}`);
    }

    const preview = buildInstagramImportPreview(dedupeImportItems(parsedItems));
    saveImportPreview(preview.items);

    updateImportSession(session.id, {
      status: preview.items.length ? "parsed" : "failed",
      importedPostCount: preview.counts.posts,
      importedStoryCount: preview.counts.stories,
      importedMediaCount: preview.counts.media,
      errors,
      filesSeen
    });

    renderImportStatus();
    renderImportPreview();
    return { sessionId: session.id, items: preview.items, errors };
  }

  function persistPost(post) {
    if (!window.AHARepository?.saveInstaPost) return;

    window.AHARepository
      .saveInstaPost(post)
      .then((result) => {
        if (result?.ok === false && result.error) {
          console.warn("AHAInsta: database-save feilet", result.error);
        }
      })
      .catch((error) => {
        console.warn("AHAInsta: database-save feilet", error);
      });
  }

  async function pushLocalToDatabase(items) {
    if (!window.AHARepository?.saveInstaPost) return { ok: false, fallback: "localStorage" };

    const results = [];
    for (const post of items) {
      results.push(await window.AHARepository.saveInstaPost(post));
    }
    return { ok: results.some((entry) => entry?.ok), results };
  }

  function resolvePostDate(post) {
    return post?.updated_at || post?.deleted_at || post?.created_at || "";
  }

  function mergePosts(localPosts, remotePosts) {
    const byId = new Map();

    for (const post of Array.isArray(localPosts) ? localPosts : []) {
      if (!post?.id) continue;
      byId.set(post.id, post);
    }

    for (const remote of Array.isArray(remotePosts) ? remotePosts : []) {
      if (!remote?.id) continue;
      const existing = byId.get(remote.id);

      if (!existing) {
        byId.set(remote.id, remote);
        continue;
      }

      const existingDate = new Date(resolvePostDate(existing)).getTime() || 0;
      const remoteDate = new Date(resolvePostDate(remote)).getTime() || 0;
      byId.set(remote.id, remoteDate > existingDate ? remote : existing);
    }

    return Array.from(byId.values()).sort((a, b) => {
      const aTime = new Date(a?.created_at || 0).getTime() || 0;
      const bTime = new Date(b?.created_at || 0).getTime() || 0;
      return bTime - aTime;
    });
  }

  async function syncFromDatabase() {
    if (!window.AHARepository?.loadInstaPosts) return { ok: false, fallback: "localStorage" };

    const localPosts = load();
    const localActivePosts = localPosts.filter((post) => !post?.deleted_at);
    if (localActivePosts.length) {
      await pushLocalToDatabase(localActivePosts);
    }

    const result = await window.AHARepository.loadInstaPosts();
    if (!result?.ok || !Array.isArray(result.data)) return result || { ok: false };

    const merged = mergePosts(localPosts, result.data);
    save(merged);
    render(merged);
    return result;
  }

  async function completeInstagramImport(options = {}) {
    const selectedIds = new Set(options.selectedIds || []);
    const visibility = options.visibility === "public" ? "public" : "private";
    const connectIngest = !!options.connectIngest;

    const preview = loadImportPreview();
    const selectedItems = preview.filter((item) => selectedIds.has(item.id));
    const posts = load();
    const stories = loadStories();

    for (const item of selectedItems) {
      if (item.type === "story") {
        stories.unshift({
          id: createId("story"),
          ownerId: "local",
          mediaType: item.mediaType,
          src: item.src,
          caption: item.caption || item.title || "",
          created_at: nowIso(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          originalInstagramDate: item.originalInstagramDate || null,
          imported: true,
          archived: false,
          source_app: "instagram",
          source_type: "instagram_export",
          visibility,
          meta: { import_session_id: options.sessionId || null }
        });
        continue;
      }

      const post = {
        id: createId("insta"),
        title: item.title || "Importert",
        src: item.src || "",
        caption: item.caption || "",
        content_type: item.mediaType === "video" ? "video" : "image",
        tags: [],
        created_at: nowIso(),
        imported: true,
        source_app: "instagram",
        source_type: "instagram_export",
        visibility,
        originalInstagramDate: item.originalInstagramDate || null,
        meta: { import_session_id: options.sessionId || null }
      };

      posts.unshift(post);
      persistPost(post);

      if (connectIngest && (post.caption || post.title)) {
        await window.AHAIngest?.ingest?.({
          source_type: "insta_post",
          source_app: "aha_insta",
          content_type: post.content_type,
          title: post.title,
          text: [post.title, post.caption].filter(Boolean).join("\n"),
          user_created: true,
          imported: true,
          created_at: post.created_at,
          meta: {
            insta_post_id: post.id,
            src: post.src,
            import_session_id: options.sessionId || null
          }
        });
      }
    }

    save(posts);
    saveStories(stories);

    if (selectedItems.length > 0) {
      clearImportPreview();
      if (options.sessionId) updateImportSession(options.sessionId, { status: "completed" });
    }

    render();
    renderStories();
    renderImportStatus();
    renderImportPreview();
  }

  function renderImportStatus() {
    const mount = document.getElementById("insta-import-status");
    if (!mount) return;

    const latestSession = loadImportSessions()[0];
    if (!latestSession) {
      mount.innerHTML = "";
      return;
    }

    const errors = Array.isArray(latestSession.errors) ? latestSession.errors : [];
    const errorList = errors.length
      ? `<ul class="insta-errors">${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`
      : "";

    mount.innerHTML = `
      <strong>Status:</strong> ${escapeHtml(latestSession.status)}
      · poster:${latestSession.importedPostCount}
      · stories:${latestSession.importedStoryCount}
      · media:${latestSession.importedMediaCount}
      ${errorList}
    `;
  }

  function renderImportPreview() {
    const mount = document.getElementById("insta-import-preview");
    if (!mount) return;

    const previewItems = loadImportPreview();
    if (!previewItems.length) {
      mount.innerHTML = "<p>Ingen forhåndsvisning ennå.</p>";
      return;
    }

    const counts = buildInstagramImportPreview(previewItems).counts;
    mount.innerHTML = `
      <div class="module-meta">Mulige poster: ${counts.posts} · stories: ${counts.stories} · media: ${counts.media}</div>
      <label><input type="radio" name="insta-visibility" value="private" checked /> Publiser som private</label>
      <label><input type="radio" name="insta-visibility" value="public" /> Publiser som offentlige</label>
      <label><input id="insta-import-connect-ingest" type="checkbox" /> Koble importerte captions til AHA-innsikt</label>
      <div>
        ${previewItems
          .map(
            (item) => `
              <article class="module-card insta-import-card">
                <label><input type="checkbox" data-import-item="${escapeHtml(item.id)}" checked /> Importer</label>
                <strong>${escapeHtml(item.type)}</strong>
                ${renderMedia(item.src, item.mediaType)}
                <p>${escapeHtml(item.caption || item.title || "")}</p>
              </article>
            `
          )
          .join("")}
      </div>
      <button id="insta-import-complete" type="button">Importer valgte</button>
    `;
  }

  function renderStories() {
    const mount = document.getElementById("insta-stories");
    if (!mount) return;

    const stories = loadStories().filter((story) => !story.archived);
    if (!stories.length) {
      mount.innerHTML = "<p>Ingen stories ennå.</p>";
      return;
    }

    mount.innerHTML = `
      <div class="insta-stories-row">
        ${stories
          .map(
            (story) => `
              <article class="module-card insta-story-card">
                ${renderMedia(story.src, story.mediaType)}
                <p>${escapeHtml(story.caption || "")}</p>
                ${story.imported ? '<div class="module-meta">importert</div>' : ""}
              </article>
            `
          )
          .join("")}
      </div>
    `;
  }

  function render(source) {
    const mount = document.getElementById("insta-list");
    if (!mount) return;

    const posts = (Array.isArray(source) ? source : load()).filter((post) => !post?.deleted_at);
    if (!posts.length) {
      mount.innerHTML = "<p>Ingen Insta-poster ennå.</p>";
      return;
    }

    mount.innerHTML = posts
      .map(
        (post) => `
          <article class="module-card">
            <h3>${escapeHtml(post.title || "Uten tittel")}</h3>
            ${renderMedia(post.src, post.content_type)}
            <p>${escapeHtml(post.caption || "")}</p>
            <div class="module-meta">
              ${escapeHtml(post.created_at || "")}
              ${post.originalInstagramDate ? ` · opprinnelig: ${escapeHtml(post.originalInstagramDate)}` : ""}
              ${post.imported ? " · Importert fra Instagram" : ""}
              ${post.last_source_event_id ? ` · source: ${escapeHtml(post.last_source_event_id)}` : ""}
            </div>
            <div class="module-actions"><button type="button" data-insta-delete="${escapeHtml(post.id)}">Slett</button></div>
          </article>
        `
      )
      .join("");
  }

  function deletePost(postId) {
    const entries = load();
    const index = entries.findIndex((entry) => entry.id === postId);
    if (index < 0) return null;

    entries[index] = { ...entries[index], deleted_at: nowIso() };
    save(entries);
    persistPost(entries[index]);
    render(entries);
    return entries[index];
  }

  async function addPost(input) {
    const src = String(input.src || "").trim();
    const contentType = detectMediaType(src) === "video" ? "video" : "image";

    const post = {
      id: createId("insta"),
      title: String(input.title || "").trim(),
      src,
      caption: String(input.caption || "").trim(),
      content_type: contentType,
      tags: Array.isArray(input.tags) ? input.tags : [],
      meta: {},
      created_at: nowIso()
    };

    const baseContract = window.AHAContracts?.createBaseItem?.({
      id: post.id,
      title: post.title || "AHA Insta-post",
      type: contentType === "video" ? "insta_video" : "insta_image",
      source: "aha_insta",
      createdAt: post.created_at,
      updatedAt: post.created_at,
      tags: post.tags,
      meta: { insta_post_id: post.id, src: post.src }
    });

    if (baseContract) {
      post.base = baseContract;
    }

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

    if (ingestResult?.sourceEvent?.id) {
      post.last_source_event_id = ingestResult.sourceEvent.id;
    }

    const posts = load();
    posts.unshift(post);
    save(posts);
    persistPost(post);
    render(posts);
    return post;
  }

  function bind() {
    const form = document.getElementById("insta-form");
    form?.addEventListener("submit", (event) => {
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
      if (target.dataset.instaDelete) deletePost(target.dataset.instaDelete);
    });

    const importHandler = (event) => parseInstagramExport(event.target.files);
    document.getElementById("insta-import-files")?.addEventListener("change", importHandler);
    document.getElementById("insta-import-folder")?.addEventListener("change", importHandler);

    document.getElementById("insta-import-preview")?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.id !== "insta-import-complete") return;

      const selectedIds = [...document.querySelectorAll("input[data-import-item]:checked")]
        .map((input) => input.getAttribute("data-import-item"))
        .filter(Boolean);

      const visibility = document.querySelector("input[name='insta-visibility']:checked")?.value || "private";
      const connectIngest = !!document.getElementById("insta-import-connect-ingest")?.checked;
      const sessionId = loadImportSessions()[0]?.id || null;

      completeInstagramImport({ selectedIds, visibility, connectIngest, sessionId });
    });

    render();
    renderStories();
    renderImportStatus();
    renderImportPreview();
    syncFromDatabase();
    window.addEventListener("aha:auth-ready", syncFromDatabase);
  }

  window.AHAInsta = {
    load,
    save,
    loadStories,
    saveStories,
    loadImportSessions,
    saveImportSessions,
    createImportSession,
    updateImportSession,
    parseInstagramExport,
    parseInstagramJsonFile,
    buildInstagramImportPreview,
    saveImportPreview,
    loadImportPreview,
    clearImportPreview,
    completeInstagramImport,
    renderImportStatus,
    renderImportPreview,
    renderStories,
    pushLocalToDatabase,
    mergePosts,
    syncFromDatabase,
    addPost,
    deletePost,
    render
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
