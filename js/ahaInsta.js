(function () {
  "use strict";

  const POSTS_KEY = "aha_insta_posts_v1";
  const STORIES_KEY = "aha_insta_stories_v1";
  const IMPORT_SESSIONS_KEY = "aha_insta_import_sessions_v1";
  const IMPORT_PREVIEW_KEY = "aha_insta_import_preview_v1";
  const PROFILE_KEY = "aha_insta_profile_v1";
  const LIKES_KEY = "aha_insta_likes_v1";
  const COMMENTS_KEY = "aha_insta_comments_v1";
  const FOLLOWS_KEY = "aha_insta_follows_v1";
  const MAX_MEDIA_DATA_URL_SIZE = 10 * 1024 * 1024;

  const ICON_HEART_OUTLINE = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  const ICON_HEART_FILLED = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  const ICON_COMMENT = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  const ICON_COPY = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

  const createId = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const nowIso = () => new Date().toISOString();

  function formatRelativeTime(value) {
    const date = new Date(value || 0);
    const time = date.getTime();
    if (!value || Number.isNaN(time)) return "";

    const diffSec = Math.floor((Date.now() - time) / 1000);
    if (diffSec < 60) return "nå";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}t`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}d`;
    const diffWeek = Math.floor(diffDay / 7);
    if (diffWeek < 5) return `${diffWeek}u`;
    return date.toLocaleDateString("no-NO", { day: "numeric", month: "short" });
  }

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


  function normalizeDedupField(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function createPostSignature(input = {}) {
    const platform = normalizeDedupField(input.source_app || input.source || "aha_insta");
    const timestamp = normalizeDedupField(input.originalInstagramDate || input.created_at || "");
    const media = normalizeDedupField(input.src || input.media_uri || input.uri || input.path || "");
    const caption = normalizeDedupField(input.caption || input.text || input.title || "");
    const permalink = normalizeDedupField(input.permalink || input.meta?.permalink || "");
    return [platform, timestamp, media, caption, permalink].join("||");
  }

  function normalizePostShape(input = {}, fallback = {}) {
    const profile = ensureProfile();
    const src = String(input.src || fallback.src || "").trim();
    const createdAt = input.created_at || fallback.created_at || nowIso();
    const contentType = String(input.content_type || fallback.content_type || (detectMediaType(src) === "video" ? "video" : "image")).trim() || "image";
    const mergedMeta = { ...(fallback.meta || {}), ...(input.meta || {}) };
    const signature = createPostSignature({ ...fallback, ...input, src, created_at: createdAt, content_type: contentType, meta: mergedMeta });
    return {
      ...fallback,
      ...input,
      id: String(input.id || fallback.id || createId("insta")),
      title: String(input.title || fallback.title || "").trim(),
      src,
      caption: String(input.caption || fallback.caption || "").trim(),
      content_type: contentType,
      tags: Array.isArray(input.tags) ? input.tags : (Array.isArray(fallback.tags) ? fallback.tags : []),
      ownerId: String(input.ownerId || fallback.ownerId || profile.id),
      ownerUsername: normalizeUsername(input.ownerUsername || fallback.ownerUsername || profile.username),
      visibility: input.visibility || fallback.visibility || "public",
      like_count: Number(input.like_count ?? fallback.like_count ?? 0),
      comment_count: Number(input.comment_count ?? fallback.comment_count ?? 0),
      created_at: createdAt,
      source_signature: signature,
      meta: mergedMeta
    };
  }
  function dedupeImportItems(items) {
    const seen = new Set();
    const deduped = [];

    for (const item of items) {
      const key = createPostSignature(item) + "||" + normalizeDedupField(item.type || "media");
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

  function loadProfile() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function isDatabaseSyncEnabled() {
    return window.AHA_CONFIG?.insta?.enableDatabaseSync === true;
  }

  function localOnlyMeta(extra = {}) {
    return {
      source_app: "aha",
      origin_app: "aha_insta",
      local_only: true,
      published_external: false,
      echonet_shared: false,
      sync_enabled: false,
      user_created: true,
      imported: false,
      ...extra
    };
  }

  function hasTextualContent(item = {}) {
    return Boolean(String(item.title || item.caption || item.note || "").trim());
  }

  function persistSocial(method, record) {
    // AHA Insta is local-only by default. Database persistence requires an explicit dev/user flag.
    if (!isDatabaseSyncEnabled()) return;
    const repo = window.AHARepository;
    if (!repo || typeof repo[method] !== "function") return;

    repo[method](record)
      .then((result) => {
        if (result?.ok === false && result.error) {
          console.warn(`AHAInsta: ${method} feilet`, result.error);
        }
      })
      .catch((error) => {
        console.warn(`AHAInsta: ${method} feilet`, error);
      });
  }

  function saveProfile(profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile || null));
    if (profile) persistSocial("saveInstaProfile", profile);
    return profile;
  }

  function ensureProfile() {
    const existing = loadProfile();
    if (existing?.username) return existing;

    const timestamp = nowIso();
    const profile = {
      id: existing?.id || createId("user"),
      username: existing?.username || "meg",
      displayName: existing?.displayName || "Meg",
      bio: existing?.bio || "",
      avatar: existing?.avatar || "",
      created_at: existing?.created_at || timestamp,
      updated_at: timestamp
    };

    saveProfile(profile);
    return profile;
  }

  function loadLikes() { return readArray(LIKES_KEY); }
  function saveLikes(items) { writeArray(LIKES_KEY, items); }
  function loadComments() { return readArray(COMMENTS_KEY); }
  function saveComments(items) { writeArray(COMMENTS_KEY, items); }
  function loadFollows() { return readArray(FOLLOWS_KEY); }
  function saveFollows(items) { writeArray(FOLLOWS_KEY, items); }

  function hasLiked(postId) {
    const profile = ensureProfile();
    return loadLikes().some((like) => like.post_id === postId && like.user_id === profile.id);
  }

  function getLikeCount(postId) {
    return loadLikes().filter((like) => like.post_id === postId).length;
  }

  function toggleLike(postId) {
    const profile = ensureProfile();
    const likes = loadLikes();
    const index = likes.findIndex((like) => like.post_id === postId && like.user_id === profile.id);

    let record;
    if (index >= 0) {
      record = { ...likes[index], deleted_at: nowIso() };
      likes.splice(index, 1);
    } else {
      record = { id: `like_${postId}_${profile.id}`, post_id: postId, user_id: profile.id, created_at: nowIso(), deleted_at: null };
      likes.push(record);
    }

    saveLikes(likes);
    persistSocial("saveInstaLike", record);
    renderProfile();
    render();
  }

  function addComment(postId, text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return null;

    const profile = ensureProfile();
    const comments = loadComments();
    const comment = {
      id: createId("comment"),
      post_id: postId,
      user_id: profile.id,
      username: profile.username,
      text: trimmed,
      created_at: nowIso(),
      deleted_at: null
    };

    comments.push(comment);
    saveComments(comments);
    persistSocial("saveInstaComment", comment);
    render();
    return comment;
  }

  function deleteComment(commentId) {
    const profile = ensureProfile();
    const comments = loadComments();
    const index = comments.findIndex((comment) => comment.id === commentId && comment.user_id === profile.id);
    if (index < 0) return null;

    comments[index] = { ...comments[index], deleted_at: nowIso() };
    saveComments(comments);
    persistSocial("saveInstaComment", comments[index]);
    render();
    return comments[index];
  }

  function getCommentsForPost(postId) {
    return loadComments().filter((comment) => comment.post_id === postId && !comment.deleted_at);
  }

  function isFollowing(username) {
    const profile = ensureProfile();
    return loadFollows().some((follow) => follow.follower_id === profile.id && follow.following_username === username);
  }

  function toggleFollow(username) {
    const profile = ensureProfile();
    const follows = loadFollows();
    const index = follows.findIndex((follow) => follow.follower_id === profile.id && follow.following_username === username);

    let record;
    if (index >= 0) {
      record = { ...follows[index], deleted_at: nowIso() };
      follows.splice(index, 1);
    } else {
      record = { id: `follow_${profile.id}_${username}`, follower_id: profile.id, following_id: `user_${username}`, following_username: username, created_at: nowIso(), deleted_at: null };
      follows.push(record);
    }

    saveFollows(follows);
    persistSocial("saveInstaFollow", record);
    renderProfile();
    render();
  }

  let currentFeedFilter = "all";

  function setFeedFilter(filter) {
    currentFeedFilter = ["all", "following", "mine"].includes(filter) ? filter : "all";
    renderFeedControls();
    render();
  }

  function getFilteredPosts(posts) {
    const profile = ensureProfile();
    if (currentFeedFilter === "mine") {
      return posts.filter((post) => getPostOwner(post).username === profile.username);
    }

    if (currentFeedFilter === "following") {
      const following = new Set(loadFollows().filter((entry) => entry.follower_id === profile.id).map((entry) => entry.following_username));
      return posts.filter((post) => {
        const owner = getPostOwner(post).username;
        return owner === profile.username || following.has(owner);
      });
    }

    return posts;
  }

  function renderFeedControls() {
    const mount = document.getElementById("insta-feed-controls");
    if (!mount) return;

    const button = (value, label) => `<button type="button" data-feed-filter="${value}" class="${currentFeedFilter === value ? "is-active" : ""}">${label}</button>`;
    mount.innerHTML = `<div class="insta-feed-controls">${button("all", "Alle poster")}${button("following", "Følger")}${button("mine", "Mine poster")}</div>`;
  }

  function normalizeUsername(value) {
    return String(value || "").trim().replace(/^@+/, "").trim() || "meg";
  }

  function populateProfileForm() {
    const profile = ensureProfile();
    const username = document.getElementById("insta-profile-username");
    const displayName = document.getElementById("insta-profile-display-name");
    const bio = document.getElementById("insta-profile-bio");
    const avatar = document.getElementById("insta-profile-avatar");

    if (username) username.value = profile.username || "";
    if (displayName) displayName.value = profile.displayName || "";
    if (bio) bio.value = profile.bio || "";
    if (avatar) avatar.value = profile.avatar || "";
  }

  function bindProfileForm() {
    document.getElementById("insta-profile-save")?.addEventListener("click", () => {
      const existing = ensureProfile();
      const username = normalizeUsername(document.getElementById("insta-profile-username")?.value);
      const displayName = String(document.getElementById("insta-profile-display-name")?.value || "").trim() || username;
      const bio = String(document.getElementById("insta-profile-bio")?.value || "").trim();
      const avatar = String(document.getElementById("insta-profile-avatar")?.value || "").trim();

      saveProfile({
        ...existing,
        id: existing.id,
        created_at: existing.created_at,
        username,
        displayName,
        bio,
        avatar,
        updated_at: nowIso()
      });

      renderProfile();
      render();
    });
  }

  function renderProfile() {
    const profile = ensureProfile();
    const postCount = load().filter((post) => !post.deleted_at && getPostOwner(post).username === profile.username).length;
    const followerCount = loadFollows().filter((entry) => entry.following_username === profile.username).length;
    const followingCount = loadFollows().filter((entry) => entry.follower_id === profile.id).length;

    const mount = document.getElementById("insta-profile-card");
    if (!mount) return;

    mount.innerHTML = `
      <div class="insta-profile-header">
        ${renderAvatar(profile.displayName || profile.username, profile.avatar, "insta-avatar-lg")}
        <div class="insta-profile-stats">
          <div><strong>${postCount}</strong><span>poster</span></div>
          <div><strong>${followerCount}</strong><span>følgere</span></div>
          <div><strong>${followingCount}</strong><span>følger</span></div>
        </div>
      </div>
      <div class="insta-profile-namebio">
        <strong>${escapeHtml(profile.displayName || "Meg")}</strong>
        <span class="module-meta">@${escapeHtml(profile.username || "meg")}</span>
        ${profile.bio ? `<p>${escapeHtml(profile.bio)}</p>` : ""}
      </div>
    `;
  }

  function renderAvatar(name, avatarUrl, sizeClass) {
    const initial = escapeHtml(String(name || "?").trim().slice(0, 1).toUpperCase() || "?");
    const safeAvatar = String(avatarUrl || "").trim();
    const inner = safeAvatar ? `<img src="${escapeHtml(safeAvatar)}" alt="" />` : initial;
    return `<span class="insta-avatar ${sizeClass}">${inner}</span>`;
  }

  function getPostOwner(post) {
    const profile = ensureProfile();
    const username = String(post?.ownerUsername || "").trim() || profile.username;
    const id = String(post?.ownerId || "").trim() || profile.id;
    return { id, username };
  }

  const expandedComments = new Set();

  function toggleCommentsExpanded(postId) {
    if (expandedComments.has(postId)) expandedComments.delete(postId);
    else expandedComments.add(postId);
    render();
  }

  async function copyPostText(postId) {
    const post = load().find((entry) => entry.id === postId);
    if (!post) return;

    const owner = getPostOwner(post);
    const text = [post.title, post.caption].filter(Boolean).join(" — ") || `Lokal AHA Insta-post av @${owner.username}`;

    try {
      await navigator.clipboard?.writeText?.(text);
    } catch {
      /* utklippstavle ikke tilgjengelig */
    }
  }

  function renderComments(post) {
    const me = ensureProfile();
    const comments = getCommentsForPost(post.id);
    const previewCount = 2;
    const expanded = expandedComments.has(post.id);
    const hasMore = comments.length > previewCount && !expanded;
    const visible = hasMore ? comments.slice(-previewCount) : comments;

    const viewAllLink = comments.length > previewCount
      ? `<button type="button" class="insta-view-comments" data-insta-toggle-comments="${escapeHtml(post.id)}">${expanded ? "Vis færre kommentarer" : `Se alle ${comments.length} kommentarer`}</button>`
      : "";

    const list = visible
      .map((comment) => `
        <li class="insta-comment-item">
          <span><strong>@${escapeHtml(comment.username)}</strong> ${escapeHtml(comment.text)}</span>
          ${comment.user_id === me.id ? `<button type="button" class="insta-comment-delete" data-insta-delete-comment="${escapeHtml(comment.id)}" aria-label="Slett kommentar">×</button>` : ""}
        </li>
      `)
      .join("");

    return `
      <div class="insta-comments-block">
        ${viewAllLink}
        ${list ? `<ul class="insta-comments">${list}</ul>` : ""}
        <div class="insta-comment-input">
          <input type="text" data-insta-comment-input="${escapeHtml(post.id)}" placeholder="Skriv en kommentar …" />
          <button type="button" class="insta-comment-send" data-insta-comment="${escapeHtml(post.id)}">Post</button>
        </div>
      </div>
    `;
  }

  function renderPostCard(post) {
    const me = ensureProfile();
    const owner = getPostOwner(post);
    const isOwner = owner.username === me.username;
    const canFollow = !!owner.username && !isOwner;
    const liked = hasLiked(post.id);
    const likeCount = getLikeCount(post.id);

    return `
      <article class="insta-post">
        <header class="insta-post-header">
          ${renderAvatar(owner.username, "", "insta-avatar-sm")}
          <div class="insta-post-header-meta">
            <strong>@${escapeHtml(owner.username)}</strong>
            <span class="insta-post-time">${escapeHtml(formatRelativeTime(post.created_at))}${post.imported ? " · importert" : ""}</span>
          </div>
          ${canFollow ? `<button type="button" class="insta-follow-btn" data-insta-follow="${escapeHtml(owner.username)}">${isFollowing(owner.username) ? "Følger" : "Følg"}</button>` : ""}
          ${isOwner ? `
            <details class="insta-post-menu">
              <summary aria-label="Mer">⋯</summary>
              <div class="insta-post-menu-list">
                <button type="button" data-insta-delete="${escapeHtml(post.id)}">Slett post</button>
              </div>
            </details>
          ` : ""}
        </header>

        <div class="insta-post-media">${renderMedia(post.src, post.content_type)}</div>

        <div class="insta-post-actions">
          <button type="button" class="insta-icon-btn ${liked ? "is-liked" : ""}" data-insta-like="${escapeHtml(post.id)}" aria-label="Lik">${liked ? ICON_HEART_FILLED : ICON_HEART_OUTLINE}</button>
          <button type="button" class="insta-icon-btn" data-insta-focus-comment="${escapeHtml(post.id)}" aria-label="Kommenter">${ICON_COMMENT}</button>
          <button type="button" class="insta-icon-btn" data-insta-copy="${escapeHtml(post.id)}" aria-label="Kopier tekst lokalt" title="Kopier tekst">${ICON_COPY}</button>
        </div>

        ${likeCount > 0 ? `<p class="insta-like-count">${likeCount} liker</p>` : ""}
        ${post.title ? `<p class="insta-post-title">${escapeHtml(post.title)}</p>` : ""}
        ${post.caption ? `<p class="insta-caption"><strong>@${escapeHtml(owner.username)}</strong> ${escapeHtml(post.caption)}</p>` : ""}

        ${renderComments(post)}
      </article>
    `;
  }

  function persistPost(post) {
    // AHA Insta is local-only by default. Database persistence requires an explicit dev/user flag.
    if (!isDatabaseSyncEnabled()) return;
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
    if (!isDatabaseSyncEnabled()) return { ok: false, fallback: "localOnly", database_sync_disabled: true };
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
    const merged = new Map();
    const index = new Map();

    const upsert = (raw, preferRemote = false) => {
      if (!raw || typeof raw !== "object") return;
      const candidate = normalizePostShape(raw);
      const signature = candidate.source_signature || createPostSignature(candidate);
      const keyById = candidate.id ? `id:${candidate.id}` : "";
      const keyBySig = signature ? `sig:${signature}` : "";
      const matchKey = (keyById && index.get(keyById)) || (keyBySig && index.get(keyBySig));

      if (!matchKey) {
        const storageKey = keyById || keyBySig;
        if (!storageKey) return;
        merged.set(storageKey, candidate);
        if (keyById) index.set(keyById, storageKey);
        if (keyBySig) index.set(keyBySig, storageKey);
        return;
      }

      const existing = merged.get(matchKey) || {};
      const existingDate = new Date(resolvePostDate(existing)).getTime() || 0;
      const incomingDate = new Date(resolvePostDate(candidate)).getTime() || 0;
      const remotePreferred = preferRemote || incomingDate >= existingDate;
      const next = remotePreferred
        ? normalizePostShape({ ...existing, ...candidate, id: existing.id || candidate.id }, existing)
        : normalizePostShape({ ...candidate, ...existing, id: existing.id || candidate.id }, existing);
      merged.set(matchKey, next);
      if (next.id) index.set(`id:${next.id}`, matchKey);
      if (next.source_signature) index.set(`sig:${next.source_signature}`, matchKey);
    };

    (Array.isArray(localPosts) ? localPosts : []).forEach((post) => upsert(post, false));
    (Array.isArray(remotePosts) ? remotePosts : []).forEach((post) => upsert(post, true));

    return Array.from(merged.values()).sort((a, b) => {
      const aTime = new Date(a?.created_at || 0).getTime() || 0;
      const bTime = new Date(b?.created_at || 0).getTime() || 0;
      return bTime - aTime;
    });
  }



  function findMergedPost(posts, candidate) {
    const list = Array.isArray(posts) ? posts : [];
    const signature = String(candidate?.source_signature || createPostSignature(candidate) || "");
    const id = String(candidate?.id || "");
    if (signature) {
      const bySignature = list.find((item) => String(item?.source_signature || createPostSignature(item) || "") === signature);
      if (bySignature) return bySignature;
    }
    if (id) {
      const byId = list.find((item) => String(item?.id || "") === id);
      if (byId) return byId;
    }
    return null;
  }

  function postFingerprint(post) {
    if (!post || typeof post !== "object") return "";
    try {
      return JSON.stringify(post);
    } catch {
      return "";
    }
  }

  async function syncFromDatabase() {
    if (!isDatabaseSyncEnabled()) return { ok: false, fallback: "localOnly", database_sync_disabled: true };
    if (!window.AHARepository?.loadInstaPosts) return { ok: false, fallback: "localStorage" };

    const localPosts = load();
    // Push both active posts and tombstones before pull so local deletes are not dependent on prior persistPost timing.
    if (localPosts.length) {
      await pushLocalToDatabase(localPosts);
    }

    const result = await window.AHARepository.loadInstaPosts();
    if (!result?.ok) return result || { ok: false };
    if (!Array.isArray(result.data)) {
      return { ...result, ok: false, fallback: "localStorage", data: localPosts };
    }

    const merged = mergePosts(localPosts, result.data);
    save(merged);
    render(merged);
    return { ...result, data: merged, merged: true };
  }

  function socialActionTime(row) {
    return new Date(row?.deleted_at || row?.updated_at || row?.created_at || 0).getTime() || 0;
  }

  // Last-write-wins reconciliation by action time, matching how posts merge.
  // deleted_at is a tombstone: a newer remote unlike/unfollow beats a stale
  // local like/follow, and a newer local action beats a stale remote tombstone.
  function reconcileSocial(localItems, remoteRows, mapRemote) {
    const byId = new Map();
    const consider = (row) => {
      if (!row?.id) return;
      const prev = byId.get(row.id);
      if (!prev || socialActionTime(row) >= socialActionTime(prev)) byId.set(row.id, row);
    };
    (Array.isArray(localItems) ? localItems : []).forEach(consider);
    (Array.isArray(remoteRows) ? remoteRows : []).forEach((row) => consider(mapRemote(row)));
    return Array.from(byId.values());
  }

  async function pushSocialCollection(items, method) {
    const repo = window.AHARepository;
    if (!repo || typeof repo[method] !== "function") return;
    for (const item of Array.isArray(items) ? items : []) {
      try {
        await repo[method](item);
      } catch (error) {
        console.warn(`AHAInsta: ${method} sync feilet`, error);
        return;
      }
    }
  }

  // Pull remote, reconcile by action time, persist locally, then push the
  // reconciled state back. Pulling before pushing is what lets a remote
  // tombstone win instead of being clobbered by stale local state.
  async function reconcileSocialCollection({ loadLocal, saveLocal, loadRemote, pushMethod, mapRemote, keepDeleted }) {
    const repo = window.AHARepository;
    if (!repo || typeof repo[loadRemote] !== "function") {
      await pushSocialCollection(loadLocal(), pushMethod);
      return;
    }

    let remoteRows = null;
    try {
      const res = await repo[loadRemote]();
      if (res?.ok && Array.isArray(res.data)) remoteRows = res.data;
    } catch (error) {
      console.warn(`AHAInsta: ${loadRemote} feilet`, error);
    }

    if (!remoteRows) {
      // Could not read remote; keep local canonical and push best-effort.
      await pushSocialCollection(loadLocal(), pushMethod);
      return;
    }

    const reconciled = reconcileSocial(loadLocal(), remoteRows, mapRemote);
    saveLocal(keepDeleted ? reconciled : reconciled.filter((row) => !row.deleted_at));
    await pushSocialCollection(reconciled, pushMethod);
  }

  async function syncSocialFromDatabase() {
    if (!isDatabaseSyncEnabled()) return { ok: false, fallback: "localOnly", database_sync_disabled: true };
    const repo = window.AHARepository;
    if (!repo) return { ok: false, fallback: "localStorage" };

    if (typeof repo.loadInstaProfile === "function") {
      try {
        const res = await repo.loadInstaProfile();
        if (res?.ok && res.data) {
          const remote = res.data;
          const local = loadProfile();
          const remoteUpdated = new Date(remote.updated_at || 0).getTime() || 0;
          const localUpdated = new Date(local?.updated_at || 0).getTime() || 0;
          if (!local || remoteUpdated > localUpdated) {
            localStorage.setItem(PROFILE_KEY, JSON.stringify({
              id: remote.local_id || local?.id || createId("user"),
              username: remote.username || local?.username || "meg",
              displayName: remote.display_name || local?.displayName || "Meg",
              bio: remote.bio ?? local?.bio ?? "",
              avatar: remote.avatar ?? local?.avatar ?? "",
              created_at: remote.created_at || local?.created_at || nowIso(),
              updated_at: remote.updated_at || nowIso()
            }));
          }
        }
      } catch (error) {
        console.warn("AHAInsta: profil-sync feilet", error);
      }
    }

    await reconcileSocialCollection({
      loadLocal: loadLikes,
      saveLocal: saveLikes,
      loadRemote: "loadInstaLikes",
      pushMethod: "saveInstaLike",
      mapRemote: (row) => ({
        id: row.id,
        post_id: row.post_id,
        user_id: row.user_id,
        created_at: row.created_at,
        deleted_at: row.deleted_at || null
      }),
      keepDeleted: false
    });

    await reconcileSocialCollection({
      loadLocal: loadComments,
      saveLocal: saveComments,
      loadRemote: "loadInstaComments",
      pushMethod: "saveInstaComment",
      mapRemote: (row) => ({
        id: row.id,
        post_id: row.post_id,
        user_id: row.user_id,
        username: row.username,
        text: row.text,
        created_at: row.created_at,
        deleted_at: row.deleted_at || null
      }),
      keepDeleted: true
    });

    await reconcileSocialCollection({
      loadLocal: loadFollows,
      saveLocal: saveFollows,
      loadRemote: "loadInstaFollows",
      pushMethod: "saveInstaFollow",
      mapRemote: (row) => ({
        id: row.id,
        follower_id: row.follower_id,
        following_id: row.following_id,
        following_username: row.following_username,
        created_at: row.created_at,
        deleted_at: row.deleted_at || null
      }),
      keepDeleted: false
    });

    renderProfile();
    render();
    return { ok: true };
  }

  async function completeInstagramImport(options = {}) {
    const selectedIds = new Set(options.selectedIds || []);
    const visibility = options.visibility === "public" ? "public" : "private";
    const connectIngest = !!options.connectIngest;

    const preview = loadImportPreview();
    const selectedItems = preview.filter((item) => selectedIds.has(item.id));
    const profile = ensureProfile();
    const posts = load();
    const stories = loadStories();

    for (const item of selectedItems) {
      if (item.type === "story") {
        stories.unshift({
          id: createId("story"),
          ownerId: profile.id,
          ownerUsername: profile.username,
          mediaType: item.mediaType,
          src: item.src,
          caption: item.caption || item.title || "",
          created_at: nowIso(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          originalInstagramDate: item.originalInstagramDate || null,
          imported: true,
          archived: false,
          source_app: "aha",
          source_type: "aha_insta_imported_story",
          origin_app: "instagram",
          origin_type: "instagram_export",
          local_only: true,
          published_external: false,
          echonet_shared: false,
          sync_enabled: false,
          visibility,
          meta: localOnlyMeta({ source_type: "aha_insta_imported_story", origin_app: "instagram", origin_type: "instagram_export", user_created: false, imported: true, import_session_id: options.sessionId || null, insta_object_type: "story" })
        });
        continue;
      }

      const post = normalizePostShape({
        id: createId("insta"),
        title: item.title || "",
        src: item.src || "",
        caption: item.caption || "",
        content_type: item.mediaType === "video" ? "video" : "image",
        tags: [],
        created_at: nowIso(),
        imported: true,
        source_app: "aha",
        source_type: "aha_insta_imported_post",
        origin_app: "instagram",
        origin_type: "instagram_export",
        local_only: true,
        published_external: false,
        echonet_shared: false,
        sync_enabled: false,
        visibility,
        originalInstagramDate: item.originalInstagramDate || null,
        ownerId: profile.id,
        ownerUsername: profile.username,
        like_count: 0,
        comment_count: 0,
        meta: localOnlyMeta({ source_type: "aha_insta_imported_post", origin_app: "instagram", origin_type: "instagram_export", user_created: false, imported: true, import_session_id: options.sessionId || null, insta_object_type: "post" })
      });

      const beforeMerged = findMergedPost(posts, post);
      const beforeFingerprint = postFingerprint(beforeMerged);
      const mergedImport = mergePosts(posts, [post]);
      posts.splice(0, posts.length, ...mergedImport);
      const mergedPost = findMergedPost(posts, post) || post;
      const afterFingerprint = postFingerprint(mergedPost);
      const shouldPersistOrIngest = !beforeMerged || beforeFingerprint !== afterFingerprint;
      if (shouldPersistOrIngest) {
        persistPost(mergedPost);
      }

      if (shouldPersistOrIngest && connectIngest && hasTextualContent(mergedPost)) {
        await window.AHAIngest?.ingest?.({
          source_type: "aha_insta_imported_post",
          source_app: "aha",
          content_type: mergedPost.content_type,
          title: mergedPost.title,
          text: [mergedPost.title, mergedPost.caption].filter(Boolean).join("\n"),
          user_created: false,
          imported: true,
          created_at: mergedPost.created_at,
          meta: {
            insta_post_id: mergedPost.id,
            insta_object_type: "post",
            src: mergedPost.src,
            local_only: true,
            published_external: false,
            echonet_shared: false,
            sync_enabled: false,
            import_session_id: options.sessionId || null,
            origin_app: "instagram"
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
      <div class="module-meta">Preview lokalt – ikke delt eksternt · EchoNet ikke aktivert · Database-sync ikke automatisk · Mulige poster: ${counts.posts} · stories: ${counts.stories} · media: ${counts.media}</div>
      <label><input type="radio" name="insta-visibility" value="private" checked /> Lagre som privat lokal post</label>
      <label><input type="radio" name="insta-visibility" value="public" /> Lagre som synlig i lokal AHA-flate</label>
      <label><input id="insta-import-connect-ingest" type="checkbox" /> Koble importerte captions/titler til lokal AHA-innsikt</label>
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

  let activeStoryId = null;

  function setActiveStory(storyId) {
    activeStoryId = activeStoryId === storyId ? null : storyId;
    renderStories();
  }

  function renderStories() {
    const mount = document.getElementById("insta-stories");
    if (!mount) return;

    const stories = loadStories().filter((story) => !story.archived);
    if (!stories.length) {
      mount.innerHTML = "<p>Ingen stories ennå.</p>";
      return;
    }

    const activeStory = stories.find((story) => story.id === activeStoryId) || null;

    mount.innerHTML = `
      <div class="insta-stories-row">
        ${stories
          .map(
            (story) => `
              <button type="button" class="insta-story" data-insta-story="${escapeHtml(story.id)}">
                <span class="insta-story-ring">${renderAvatar(story.ownerUsername || "?", "", "insta-avatar-md")}</span>
                <span class="insta-story-name">${escapeHtml(story.ownerUsername || (story.imported ? "Importert" : "Story"))}</span>
              </button>
            `
          )
          .join("")}
      </div>
      ${activeStory ? `
        <article class="insta-story-viewer">
          ${renderMedia(activeStory.src, activeStory.mediaType)}
          ${activeStory.caption ? `<p>${escapeHtml(activeStory.caption)}</p>` : ""}
          <button type="button" class="insta-story-close" data-insta-story-close="1">Lukk</button>
        </article>
      ` : ""}
    `;
  }

  function render(source) {
    const mount = document.getElementById("insta-list");
    if (!mount) return;

    const activePosts = (Array.isArray(source) ? source : load()).filter((post) => !post?.deleted_at);
    const posts = getFilteredPosts(activePosts);
    if (!posts.length) {
      const emptyText = currentFeedFilter === "mine"
        ? "Ingen egne poster ennå."
        : currentFeedFilter === "following"
          ? "Ingen poster fra folk du følger ennå."
          : "Ingen Insta-poster ennå.";
      mount.innerHTML = `<p>${emptyText}</p>`;
      return;
    }

    mount.innerHTML = posts.map((post) => renderPostCard(post)).join("");
  }

  function deletePost(postId) {
    const profile = ensureProfile();
    const entries = load();
    const index = entries.findIndex((entry) => entry.id === postId);
    if (index < 0) return null;

    const owner = getPostOwner(entries[index]);
    if (owner.id !== profile.id && owner.username !== profile.username) return null;

    const deletedAt = nowIso();
    entries[index] = { ...entries[index], deleted_at: deletedAt, updated_at: deletedAt };
    save(entries);
    persistPost(entries[index]);
    render(entries);
    return entries[index];
  }

  async function addPost(input) {
    const profile = ensureProfile();
    const src = String(input.src || "").trim();
    const contentType = detectMediaType(src) === "video" ? "video" : "image";

    let post = normalizePostShape({
      id: createId("insta"),
      title: String(input.title || "").trim(),
      src,
      caption: String(input.caption || "").trim(),
      content_type: contentType,
      tags: Array.isArray(input.tags) ? input.tags : [],
      source_app: "aha",
      source_type: "aha_insta_post",
      origin_app: "aha_insta",
      local_only: true,
      published_external: false,
      echonet_shared: false,
      sync_enabled: false,
      user_created: true,
      imported: false,
      meta: localOnlyMeta({ source_type: "aha_insta_post", insta_object_type: "post" }),
      ownerId: profile.id,
      ownerUsername: profile.username,
      visibility: "public",
      like_count: 0,
      comment_count: 0,
      created_at: nowIso()
    });

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

    let ingestResult = null;
    if (hasTextualContent(post)) {
      ingestResult = await window.AHAIngest?.ingest?.({
        source_type: "aha_insta_post",
        source_app: "aha",
        content_type: post.content_type,
        title: post.title,
        text: [post.title, post.caption].filter(Boolean).join("\n"),
        user_created: true,
        imported: false,
        created_at: post.created_at,
        meta: { insta_post_id: post.id, insta_object_type: "post", src: post.src, local_only: true, published_external: false, echonet_shared: false, sync_enabled: false, origin_app: "aha_insta" }
      });
    }

    if (ingestResult?.sourceEvent?.id) {
      post.last_source_event_id = ingestResult.sourceEvent.id;
    }

    const existingPosts = load();
    const beforeMerged = findMergedPost(existingPosts, post);
    const beforeFingerprint = postFingerprint(beforeMerged);
    const posts = mergePosts(existingPosts, [post]);
    post = findMergedPost(posts, post) || post;
    save(posts);
    const afterFingerprint = postFingerprint(post);
    if (!beforeMerged || beforeFingerprint !== afterFingerprint) {
      persistPost(post);
    }
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
      const target = event.target instanceof HTMLElement ? event.target.closest("button") : null;
      if (!target) return;
      if (target.dataset.instaDelete) deletePost(target.dataset.instaDelete);
      if (target.dataset.instaLike) toggleLike(target.dataset.instaLike);
      if (target.dataset.instaFollow) toggleFollow(target.dataset.instaFollow);
      if (target.dataset.instaDeleteComment) deleteComment(target.dataset.instaDeleteComment);
      if (target.dataset.instaCopy) copyPostText(target.dataset.instaCopy);
      if (target.dataset.instaToggleComments) toggleCommentsExpanded(target.dataset.instaToggleComments);
      if (target.dataset.instaFocusComment) {
        const input = document.querySelector(`[data-insta-comment-input="${target.dataset.instaFocusComment}"]`);
        input?.focus();
      }
      if (target.dataset.instaComment) {
        const postId = target.dataset.instaComment;
        const input = document.querySelector(`[data-insta-comment-input="${postId}"]`);
        addComment(postId, input?.value || "");
        if (input) input.value = "";
      }
    });

    document.getElementById("insta-feed-controls")?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.feedFilter) setFeedFilter(target.dataset.feedFilter);
    });

    document.getElementById("insta-stories")?.addEventListener("click", (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest("button") : null;
      if (!target) return;
      if (target.dataset.instaStory) setActiveStory(target.dataset.instaStory);
      if (target.dataset.instaStoryClose) setActiveStory(null);
    });

    bindProfileForm();
    populateProfileForm();

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

    renderProfile();
    renderFeedControls();
    render();
    renderStories();
    renderImportStatus();
    renderImportPreview();
    window.addEventListener("aha:auth-ready", () => {
      renderProfile();
      render();
    });
  }

  window.AHAInsta = {
    loadProfile,
    saveProfile,
    ensureProfile,
    renderProfile,
    loadLikes,
    saveLikes,
    toggleLike,
    getLikeCount,
    hasLiked,
    loadComments,
    saveComments,
    addComment,
    deleteComment,
    getCommentsForPost,
    loadFollows,
    saveFollows,
    toggleFollow,
    isFollowing,
    renderFeedControls,
    setFeedFilter,
    getFilteredPosts,
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
    findMergedPost,
    syncFromDatabase,
    syncSocialFromDatabase,
    addPost,
    deletePost,
    copyPostText,
    render
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
