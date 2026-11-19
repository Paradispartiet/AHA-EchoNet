// ahaFeed.js

(function () {
  "use strict";

  const KEY = "aha_feed_posts_v1"; // Historic unassigned browser archive, preserved.
  const ACCOUNT_KEY = "aha_feed_accounts_v1"; // Device-local account partition, NOT cloud storage.
  const EXPECTED_URL = "https://wshmybqyksrwkawqleiz.supabase.co";
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let activeScope = window.AHADb ? { mode: "pending", id: null } : { mode: "guest", id: null };
  let scopeEpoch = 0;

  const FEED_SOURCE_METADATA = Object.freeze({
    source_app: "aha",
    source_type: "aha_feed_post",
    content_type: "text",
    user_created: true,
    imported: false,
    local_only: true
  });

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function safePostId(value) {
    const raw = String(value || "").trim();
    const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
    if (cleaned) return cleaned.slice(0, 120);
    return `feed_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  }

  function normalizeTags(tags) {
    const raw = Array.isArray(tags) ? tags : (typeof tags === "string" ? tags.split(",") : []);
    const out = [];
    const seen = new Set();
    raw.forEach((tag) => {
      const value = normalizeText(tag);
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return;
      seen.add(key);
      out.push(value);
    });
    return out;
  }

  function createLocalOnlyMeta(post) {
    return {
      feed_post_id: post.id,
      source_app: FEED_SOURCE_METADATA.source_app,
      source_type: FEED_SOURCE_METADATA.source_type,
      content_type: FEED_SOURCE_METADATA.content_type,
      user_created: true,
      imported: false,
      local_only: true,
      external_published: false,
      echonet_shared: false,
      created_at: post.created_at,
      updated_at: post.updated_at || post.created_at,
      tags: normalizeTags(post.tags)
    };
  }

  function createIngestInput(post) {
    const meta = createLocalOnlyMeta(post);
    return {
      ...FEED_SOURCE_METADATA,
      title: "AHA Feed lokal post",
      text: normalizeText(post.text),
      created_at: post.created_at,
      updated_at: post.updated_at || post.created_at,
      tags: meta.tags,
      meta
    };
  }

  function safeReadJson(key, expected) {
    let raw;
    try { raw = localStorage.getItem(key); }
    catch { return { ok: false, reason: "local_storage_unavailable" }; }
    if (raw === null) return { ok: true, data: expected };
    try { return { ok: true, data: JSON.parse(raw) }; }
    catch { return { ok: false, reason: "invalid_local_storage" }; }
  }

  function readLegacy() {
    const result = safeReadJson(KEY, []);
    return result.ok && Array.isArray(result.data)
      ? result : { ok: false, reason: "invalid_legacy_archive" };
  }

  function readAccounts() {
    const result = safeReadJson(ACCOUNT_KEY, { version: 1, accounts: {} });
    if (!result.ok) return result;
    const data = result.data;
    if (!data || data.version !== 1 || !data.accounts ||
        typeof data.accounts !== "object" || Array.isArray(data.accounts)) {
      return { ok: false, reason: "invalid_account_archive" };
    }
    if (Object.values(data.accounts).some((entries) => !Array.isArray(entries))) {
      return { ok: false, reason: "invalid_account_archive" };
    }
    return result;
  }

  function loadForScope(scope) {
    if (scope.mode === "account") {
      const result = readAccounts();
      if (!result.ok) return [];
      // Account identity is verified by Auth before selection. Never display
      // another account's rows even if a local backup has invalid ownership.
      return (result.data.accounts[scope.id] || []).filter((post) =>
        post && post.profile_id === scope.id
      );
    }
    if (scope.mode === "guest") {
      const result = readLegacy();
      // Historic rows remain unassigned; never claim they belong to the
      // current Supabase account or copy them to a new owner.
      return result.ok ? result.data.filter((post) => post && !post.profile_id) : [];
    }
    return [];
  }

  function load() { return loadForScope(activeScope); }

  function writeForScope(items, scope) {
    if (!Array.isArray(items)) return false;
    if (scope.mode === "account") {
      if (!UUID.test(scope.id) || items.some((post) => !post || post.profile_id !== scope.id)) return false;
      const state = readAccounts();
      if (!state.ok) return false; // Never overwrite corrupt/unknown local storage.
      const accounts = { ...state.data.accounts, [scope.id]: items };
      try { localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ version: 1, accounts })); }
      catch { return false; }
      return true;
    }
    if (scope.mode === "guest") {
      if (items.some((post) => !post || post.profile_id)) return false;
      const legacy = readLegacy();
      if (!legacy.ok) return false;
      // Preserve any historically owner-labeled rows; do not display or
      // discard them when updating anonymous/unassigned rows.
      const assigned = legacy.data.filter((post) => post && post.profile_id);
      try { localStorage.setItem(KEY, JSON.stringify([...assigned, ...items])); }
      catch { return false; }
      return true;
    }
    return false;
  }

  function save(items) { return writeForScope(items, activeScope); }

  async function verifyScope() {
    const bridge = window.AHADb;
    if (!bridge) return { mode: "guest", id: null }; // Legacy local-only mode.
    if (bridge.getConfig?.().url !== EXPECTED_URL) return { mode: "blocked", id: null };
    const client = bridge.getClient?.();
    if (typeof client?.auth?.getUser !== "function") return { mode: "blocked", id: null };
    try {
      const response = await client.auth.getUser();
      if (response?.error) return { mode: "blocked", id: null };
      const id = response?.data?.user?.id;
      if (!id) return { mode: "guest", id: null };
      return UUID.test(String(id)) ? { mode: "account", id: String(id).toLowerCase() }
        : { mode: "blocked", id: null };
    } catch {
      return { mode: "blocked", id: null };
    }
  }

  async function resolveActionScope() {
    const epoch = scopeEpoch;
    const verified = await verifyScope();
    if (epoch !== scopeEpoch) return null; // Sign-in/out happened mid-action.
    activeScope = verified;
    if (verified.mode === "blocked") render();
    return verified.mode === "blocked" ? null : verified;
  }

  async function refreshScope() {
    const epoch = ++scopeEpoch;
    activeScope = { mode: "pending", id: null };
    render(); // Hide old account's rows immediately during login transition.
    const verified = await verifyScope();
    if (epoch !== scopeEpoch) return;
    activeScope = verified;
    render();
  }

  function postActionTime(post) {
    const times = [post?.deleted_at, post?.updated_at, post?.created_at]
      .map((value) => Date.parse(value || ""))
      .filter((value) => Number.isFinite(value));
    return times.length ? Math.max(...times) : 0;
  }

  function mergePosts(localPosts, remotePosts) {
    const merged = new Map();
    for (const post of Array.isArray(localPosts) ? localPosts : []) {
      if (post?.id) merged.set(post.id, post);
    }
    for (const post of Array.isArray(remotePosts) ? remotePosts : []) {
      if (!post?.id) continue;
      const existing = merged.get(post.id);
      if (!existing || postActionTime(post) >= postActionTime(existing)) {
        merged.set(post.id, post);
      }
    }
    return Array.from(merged.values()).sort((a, b) => postActionTime(b) - postActionTime(a));
  }

  function isDatabaseSyncEnabled() {
    // Local posts must never be sent to Supabase just because Auth is active.
    // Enable only after AHA's hosted RLS/grants and recovery are approved.
    return window.AHA_CONFIG?.feed?.enableDatabaseSync === true;
  }

  async function syncFromDatabase() {
    if (!isDatabaseSyncEnabled()) {
      return { ok: false, fallback: "localStorage", database_sync_disabled: true };
    }
    // An enabled flag permits an explicitly requested READ only. Never bulk
    // upload legacy localStorage posts merely because someone signs in.
    if (!window.AHARepository?.loadFeedPosts || !window.AHAAuth?.getProfileId) {
      return { ok: false, reason: "not_signed_in" };
    }
    const scope = await resolveActionScope();
    if (!scope || scope.mode !== "account") return { ok: false, reason: "not_signed_in" };
    const profileId = scope.id;
    const epoch = scopeEpoch;
    const result = await window.AHARepository.loadFeedPosts({ profile_id: profileId });
    if (!result?.ok) return result || { ok: false };
    if (!Array.isArray(result.data)) {
      return { ...result, ok: false, reason: "invalid_remote_data" };
    }
    // Defense in depth: reject unexpected cross-profile rows rather than
    // rendering or caching them. Supabase RLS remains the actual boundary.
    if (result.data.some((post) => !post || post.profile_id !== profileId)) {
      return { ok: false, reason: "remote_profile_mismatch" };
    }
    // Local posts with no owner are preserved, not attributed to this account.
    // Never render a cloud result after the user switches accounts mid-request.
    const confirmed = await verifyScope();
    if (epoch !== scopeEpoch || confirmed.mode !== "account" || confirmed.id !== profileId) {
      return { ok: false, reason: "auth_changed" };
    }
    const merged = mergePosts(loadForScope(scope), result.data);
    // Remote rows are ephemeral and never cached in localStorage.
    render(merged);
    return { ...result, data: merged, merged: true, read_only: true, local_posts_preserved: true };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function render(source) {
    const mount = document.getElementById("feed-list");
    if (!mount) return;
    const posts = (Array.isArray(source) ? source : load()).filter((post) => !post?.deleted_at);
    const status = document.getElementById("feed-scope-status");
    if (status) {
      const old = readLegacy();
      const legacyCount = old.ok ? old.data.filter((post) => post && !post.profile_id).length : 0;
      status.textContent = activeScope.mode === "account"
        ? "Kontoens innlegg på denne enheten · Ikke synkronisert." +
          (legacyCount ? " " + legacyCount + " eldre lokale innlegg er bevart separat i AHA-eksporten." : "")
        : activeScope.mode === "guest"
          ? "Ufordelte lokale innlegg på denne enheten · Ikke knyttet til en Supabase-konto."
          : activeScope.mode === "pending"
            ? "Kontrollerer aktiv konto …"
            : "Kontoen kunne ikke bekreftes. Ingen innlegg vises eller lagres før innloggingen virker.";
    }
    if (activeScope.mode === "pending" || activeScope.mode === "blocked") {
      mount.textContent = activeScope.mode === "pending"
        ? "Kontrollerer konto …"
        : "Innleggene er bevart, men kan ikke vises før kontoen er bekreftet.";
      return;
    }
    mount.innerHTML = posts.length
      ? posts.map((post) => `
        <article class="module-card">
          <p>${escapeHtml(post.text || "")}</p>
          <div class="module-meta">Lokal post · Ikke delt · ${escapeHtml(post.created_at || "")}${post.last_source_event_id ? ` · AHA source: ${escapeHtml(post.last_source_event_id)}` : ""}</div>
          <div class="module-actions"><button type="button" data-feed-ingest="${escapeHtml(post.id)}">Send til AHA</button><button type="button" data-feed-delete="${escapeHtml(post.id)}">Slett</button></div>
        </article>
      `).join("")
      : `<article class="aha-onboarding-empty aha-personal-empty" data-empty-state="no_data" role="status">
          <p class="eyebrow">Din lokale feed</p>
          <h3>Ingen oppdateringer ennå</h3>
          <p>Feed er for korte tanker og oppdateringer. Skriv den første posten over. Den blir værende lokalt og publiseres ikke eksternt.</p>
          <div class="aha-tile-actions"><a class="aha-tile-btn aha-tile-btn-primary" href="#feed-text">Skriv første post</a></div>
        </article>`;
  }

  async function ingestPost(postOrId) {
    const scope = await resolveActionScope();
    if (!scope) return null;
    const epoch = scopeEpoch;
    const posts = loadForScope(scope);
    const post = typeof postOrId === "string"
      ? posts.find((item) => item?.id === postOrId)
      : postOrId;
    if (!post || post.deleted_at || !normalizeText(post.text)) return null;
    if (post.last_source_event_id) {
      return { ok: true, skipped: true, reason: "already_ingested", source_event_id: post.last_source_event_id };
    }

    const ingest = window.AHAModuleApi?.resolve?.("ingest", "AHAIngest", { version: 1 }) || window.AHAIngest;
    const ingestResult = await ingest?.ingest?.(createIngestInput(post));
    if (ingestResult?.sourceEvent?.id) {
      post.last_source_event_id = ingestResult.sourceEvent.id;
      post.updated_at = post.updated_at || post.created_at;
      // Do not update a different account if Auth changes while ingest runs.
      const confirmed = await verifyScope();
      if (epoch !== scopeEpoch || confirmed.mode !== scope.mode || confirmed.id !== scope.id) return ingestResult;
      const index = posts.findIndex((item) => item?.id === post.id);
      if (index >= 0) {
        posts[index] = post;
        if (writeForScope(posts, scope)) render(posts);
      }
    }
    return ingestResult || null;
  }

  async function addPost(input) {
    const scope = await resolveActionScope();
    if (!scope) return null;
    const now = new Date().toISOString();
    const post = {
      id: safePostId(input?.id),
      ...(scope.mode === "account" ? { profile_id: scope.id } : {}),
      text: normalizeText(input?.text),
      tags: normalizeTags(input?.tags),
      meta: {},
      created_at: input?.created_at || now,
      updated_at: input?.updated_at || input?.created_at || now,
      local_only: true,
      external_published: false,
      echonet_shared: false
    };
    if (!post.text) return null;
    post.meta = createLocalOnlyMeta(post);
    const baseContract = window.AHAContracts?.createBaseItem?.({
      id: post.id,
      title: "AHA Feed lokal post",
      type: "aha_feed_post",
      source: "aha",
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      tags: post.tags,
      meta: post.meta
    });
    if (baseContract) post.base = baseContract;

    const posts = loadForScope(scope);
    posts.unshift(post);
    if (!writeForScope(posts, scope)) return null; // No false save success on corruption/quota error.
    render(posts);

    // Creating a Feed post is local-only. No automatic ingest or cloud write.
    return post;
  }

  async function deletePost(id) {
    const scope = await resolveActionScope();
    if (!scope) return null;
    const entries = loadForScope(scope);
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0) return null;
    const deletedAt = new Date().toISOString();
    entries[index] = { ...entries[index], deleted_at: deletedAt, updated_at: deletedAt };
    if (!writeForScope(entries, scope)) return null;
    render(entries);
    return entries[index];
  }

  function bind() {
    const form = document.getElementById("feed-form");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = document.getElementById("feed-text");
      addPost({ text: text?.value }).then((saved) => {
        if (saved && text) text.value = "";
        else {
          const status = document.getElementById("feed-scope-status");
          if (status) status.textContent = "Innlegget ble ikke lagret. Teksten er beholdt; kontroller innlogging eller lokal lagring.";
        }
      });
    });
    document.getElementById("feed-list")?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const ingestId = target.dataset.feedIngest;
      if (ingestId) {
        ingestPost(ingestId);
        return;
      }
      const id = target.dataset.feedDelete;
      if (id) deletePost(id);
    });

    refreshScope();
    window.addEventListener?.("aha:auth-ready", refreshScope);
    window.addEventListener?.("storage", (event) => {
      if (event.key === KEY || event.key === ACCOUNT_KEY) render();
      // Supabase Auth also signals session changes via aha:auth-ready.
    });
    // Cloud sync remains disabled and never runs from this handler.
  }

  window.AHAFeed = { load, save, syncFromDatabase, addPost, ingestPost, deletePost, render, createIngestInput, normalizeText, safePostId };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
