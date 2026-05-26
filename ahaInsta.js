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

  function saveProfile(profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile || null));
    // TODO: persist profile/likes/comments/follows via AHARepository/backend
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

    if (index >= 0) likes.splice(index, 1);
    else likes.push({ id: createId("like"), post_id: postId, user_id: profile.id, created_at: nowIso() });

    saveLikes(likes);
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

    if (index >= 0) follows.splice(index, 1);
    else follows.push({ id: createId("follow"), follower_id: profile.id, following_id: `user_${username}`, following_username: username, created_at: nowIso() });

    saveFollows(follows);
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
      <article class="module-card insta-profile-card">
        ${profile.avatar ? `<img class="insta-avatar" src="${escapeHtml(profile.avatar)}" alt="avatar"/>` : ""}
        <strong>${escapeHtml(profile.displayName || "Meg")}</strong>
        <div>@${escapeHtml(profile.username || "meg")}</div>
        <p>${escapeHtml(profile.bio || "")}</p>
        <div class="module-meta">poster:${postCount} · følgere:${followerCount} · følger:${followingCount}</div>
      </article>
    `;
  }

  function getPostOwner(post) {
    const profile = ensureProfile();
    const username = String(post?.ownerUsername || "").trim() || profile.username;
    const id = String(post?.ownerId || "").trim() || profile.id;
    return { id, username };
  }

  function renderComments(post) {
    const me = ensureProfile();
    const comments = getCommentsForPost(post.id);

    const list = comments.length
      ? comments
          .map((comment) => `
            <li class="insta-comment-item">
              <span><strong>@${escapeHtml(comment.username)}:</strong> ${escapeHtml(comment.text)}</span>
              ${comment.user_id === me.id ? `<button type="button" data-insta-delete-comment="${escapeHtml(comment.id)}">Slett</button>` : ""}
            </li>
          `)
          .join("")
      : '<li class="insta-comment-item">Ingen kommentarer ennå.</li>';

    return `
      <ul class="insta-comments">${list}</ul>
      <div class="insta-comment-input">
        <input type="text" data-insta-comment-input="${escapeHtml(post.id)}" placeholder="Skriv kommentar …" />
        <button type="button" data-insta-comment="${escapeHtml(post.id)}">Kommenter</button>
      </div>
    `;
  }

  function renderSocialRow(post) {
    const me = ensureProfile();
    const owner = getPostOwner(post);
    const canFollow = !!owner.username && owner.username !== me.username;
    const followButton = canFollow
      ? `<button type="button" data-insta-follow="${escapeHtml(owner.username)}">${isFollowing(owner.username) ? "Unfollow" : "Følg"}</button>`
      : "";

    return `
      <div class="insta-social-row">
        <span class="module-meta">@${escapeHtml(owner.username)}</span>
        ${followButton}
        <button type="button" data-insta-like="${escapeHtml(post.id)}">${hasLiked(post.id) ? "Likt" : "Lik"}</button>
        <span>${getLikeCount(post.id)} liker</span>
        <span>${getCommentsForPost(post.id).length} kommentarer</span>
      </div>
    `;
  }

  function renderPostCard(post) {
    return `
      <article class="module-card">
        ${renderMedia(post.src, post.content_type)}
        <h3>${escapeHtml(post.title || "Uten tittel")}</h3>
        <p>${escapeHtml(post.caption || "")}</p>
        <div class="module-meta">
          ${escapeHtml(post.created_at || "")}
          ${post.originalInstagramDate ? ` · opprinnelig: ${escapeHtml(post.originalInstagramDate)}` : ""}
          ${post.imported ? " · Importert fra Instagram" : ""}
          ${post.last_source_event_id ? ` · source: ${escapeHtml(post.last_source_event_id)}` : ""}
        </div>
        ${renderSocialRow(post)}
        ${renderComments(post)}
        <div class="module-actions"><button type="button" data-insta-delete="${escapeHtml(post.id)}">Slett</button></div>
      </article>
    `;
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
          source_app: "instagram",
          source_type: "instagram_export",
          visibility,
          meta: { import_session_id: options.sessionId || null }
        });
        continue;
      }

      const post = normalizePostShape({
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
        ownerId: profile.id,
        ownerUsername: profile.username,
        like_count: 0,
        comment_count: 0,
        meta: { import_session_id: options.sessionId || null }
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

      if (shouldPersistOrIngest && connectIngest && (mergedPost.caption || mergedPost.title)) {
        await window.AHAIngest?.ingest?.({
          source_type: "insta_post",
          source_app: "aha_insta",
          content_type: mergedPost.content_type,
          title: mergedPost.title,
          text: [mergedPost.title, mergedPost.caption].filter(Boolean).join("\n"),
          user_created: true,
          imported: true,
          created_at: mergedPost.created_at,
          meta: {
            insta_post_id: mergedPost.id,
            src: mergedPost.src,
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
      meta: {},
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
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.instaDelete) deletePost(target.dataset.instaDelete);
      if (target.dataset.instaLike) toggleLike(target.dataset.instaLike);
      if (target.dataset.instaFollow) toggleFollow(target.dataset.instaFollow);
      if (target.dataset.instaDeleteComment) deleteComment(target.dataset.instaDeleteComment);
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
    syncFromDatabase();
    window.addEventListener("aha:auth-ready", syncFromDatabase);
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
