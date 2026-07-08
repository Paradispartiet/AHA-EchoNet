// ahaGroups.js
// Fase 4A: første fungerende lokale Grupper / Sirkler-modul (localStorage-first).

(function (global) {
  "use strict";

  const GROUPS_KEY = "aha_groups_v1";
  const PRIVACY_KEY = "aha_privacy_settings_v1";

  const ALLOWED_GROUP_TYPES = ["circle", "project", "learning", "publishing", "historygo", "private"];
  const ALLOWED_MEMBER_ROLES = ["owner", "editor", "member", "observer"];
  const ALLOWED_MEMBER_STATUS = ["local", "invited_later", "inactive"];
  const LIBRARY_FILTERS = ["all", "insights", "lists", "paths", "articles", "notes", "feed"];
  const ALLOWED_REFERENCE_SOURCES = new Set([
    "aha_insights",
    "aha_lists",
    "aha_paths",
    "aha_avisa",
    "aha_notes",
    "aha_feed"
  ]);

  function safeParse(raw, fallback) {
    try {
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asText(value, fallback) { const s = String(value ?? "").trim(); return s || fallback; }
  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function uid(prefix) { return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`; }
  function isDatabaseSyncEnabled() {
    return global.AHA_CONFIG?.groups?.enableDatabaseSync === true;
  }
  function databaseSyncDisabledResult(data) {
    return { ok: false, fallback: "localOnly", database_sync_disabled: true, data };
  }
  function isUnavailableRecord(record) {
    return Boolean(record?.deletedAt || record?.deleted_at || record?.archived === true);
  }
  function isDeletedRecord(record) {
    return isUnavailableRecord(record);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeTags(input) {
    const raw = Array.isArray(input) ? input : String(input ?? "").split(",");
    const seen = new Set();
    const out = [];
    raw.forEach((tag) => {
      const t = String(tag ?? "").trim();
      if (!t) return;
      const key = t.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(t);
    });
    return out;
  }

  function normalizeMember(input) {
    const src = asObject(input);
    const now = new Date().toISOString();
    const role = ALLOWED_MEMBER_ROLES.includes(src.role) ? src.role : "member";
    const status = ALLOWED_MEMBER_STATUS.includes(src.status) ? src.status : "local";
    return {
      id: asText(src.id, uid("group_member")),
      name: asText(src.name, "Lokalt medlem"),
      role,
      status,
      addedAt: src.addedAt || src.added_at || now,
      local_only: true,
      external_identity: false,
      invitation_sent: false,
      account_linked: false,
      sync_enabled: false,
      meta: {
        ...asObject(src.meta),
        local_only: true,
        external_identity: false,
        invitation_sent: false,
        account_linked: false,
        sync_enabled: false
      }
    };
  }

  function normalizeReference(input) {
    const src = asObject(input);
    const now = new Date().toISOString();
    return {
      id: asText(src.id, uid("group_ref")),
      title: asText(src.title, "Referanse"),
      type: asText(src.type, "reference"),
      source: asText(src.source, "aha"),
      refId: asText(src.refId ?? src.ref_id, ""),
      addedAt: src.addedAt || src.added_at || now,
      meta: asObject(src.meta)
    };
  }

  function normalizeGroup(input) {
    const src = asObject(input);
    const now = new Date().toISOString();
    const type = ALLOWED_GROUP_TYPES.includes(src.type) ? src.type : "circle";
    return {
      id: asText(src.id, uid("group")),
      title: asText(src.title, "Uten navn"),
      type,
      description: asText(src.description, ""),
      createdAt: src.createdAt || src.created_at || now,
      updatedAt: src.updatedAt || src.updated_at || src.createdAt || src.created_at || now,
      tags: normalizeTags(src.tags),
      members: asArray(src.members).map((item) => normalizeMember(item)),
      references: asArray(src.references).map((item) => normalizeReference(item)).filter((ref) => ref.source && ref.refId),
      source: asText(src.source, "aha_groups"),
      local_only: true,
      shared_external: src.shared_external === true || src.sharedExternal === true,
      echonet_shared: src.echonet_shared === true || src.echonetShared === true,
      sync_enabled: src.sync_enabled === true || src.syncEnabled === true,
      external_share_enabled: src.external_share_enabled === true || src.externalShareEnabled === true,
      meta: {
        ...asObject(src.meta),
        local_only: true,
        shared_external: asObject(src.meta).shared_external === true || src.shared_external === true || src.sharedExternal === true,
        echonet_shared: asObject(src.meta).echonet_shared === true || src.echonet_shared === true || src.echonetShared === true,
        sync_enabled: asObject(src.meta).sync_enabled === true || src.sync_enabled === true || src.syncEnabled === true,
        external_share_enabled: asObject(src.meta).external_share_enabled === true || src.external_share_enabled === true || src.externalShareEnabled === true
      },
      deletedAt: src.deletedAt || src.deleted_at || "",
      archived: src.archived === true
    };
  }

  function loadGroups() {
    return asArray(safeParse(localStorage.getItem(GROUPS_KEY) || "[]", [])).map((g) => normalizeGroup(g));
  }

  function getActiveGroups() {
    return loadGroups().filter((group) => !isUnavailableRecord(group));
  }

  function saveGroups(groups) {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(asArray(groups)));
    return asArray(groups);
  }

  async function persistGroup(group) {
    if (!isDatabaseSyncEnabled()) return databaseSyncDisabledResult(group);
    if (!global.AHARepository?.saveGroup) return databaseSyncDisabledResult(group);
    try {
      return await global.AHARepository.saveGroup(group);
    } catch (error) {
      return { ok: false, error };
    }
  }

  function groupActionTime(group) {
    const src = asObject(group);
    const candidates = [
      src.deletedAt,
      src.deleted_at,
      src.updatedAt,
      src.updated_at,
      src.createdAt,
      src.created_at
    ];
    for (const value of candidates) {
      const time = Date.parse(value || "");
      if (Number.isFinite(time)) return time;
    }
    return 0;
  }

  function normalizeRemoteGroup(remote) {
    const src = asObject(remote);
    return normalizeGroup({
      id: src.id,
      title: src.title,
      type: src.type,
      description: src.description,
      tags: src.tags,
      members: asArray(src.members).map((member) => normalizeMember(member)),
      references: asArray(src.references).map((reference) => normalizeReference(reference)),
      source: src.source,
      meta: src.meta,
      createdAt: src.createdAt || src.created_at,
      updatedAt: src.updatedAt || src.updated_at,
      deletedAt: src.deletedAt || src.deleted_at || ""
    });
  }

  function mergeGroups(localGroups, remoteGroups) {
    const mergedById = new Map();
    asArray(localGroups).forEach((group) => {
      const normalized = normalizeGroup(group);
      mergedById.set(normalized.id, normalized);
    });
    asArray(remoteGroups).forEach((group) => {
      const incoming = normalizeGroup(group);
      const existing = mergedById.get(incoming.id);
      if (!existing || groupActionTime(incoming) >= groupActionTime(existing)) {
        mergedById.set(incoming.id, incoming);
      }
    });
    return Array.from(mergedById.values()).sort((a, b) => groupActionTime(b) - groupActionTime(a));
  }

  async function pushLocalToDatabase(groups) {
    if (!isDatabaseSyncEnabled()) return databaseSyncDisabledResult(asArray(groups));
    if (!global.AHARepository?.saveGroup) return databaseSyncDisabledResult(asArray(groups));
    const saves = asArray(groups).map(async (group) => {
      try {
        return await global.AHARepository.saveGroup(group);
      } catch (error) {
        return { ok: false, error };
      }
    });
    return Promise.allSettled(saves);
  }

  async function syncFromDatabase() {
    const localGroups = loadGroups();
    if (!isDatabaseSyncEnabled()) return databaseSyncDisabledResult(localGroups);
    if (localGroups.length) await pushLocalToDatabase(localGroups);
    if (!global.AHARepository?.loadGroups) {
      return databaseSyncDisabledResult(localGroups);
    }

    let result;
    try {
      result = await global.AHARepository.loadGroups();
    } catch (error) {
      return { ok: false, fallback: "localOnly", data: localGroups, error };
    }

    if (!result?.ok) return result || { ok: false };
    if (!Array.isArray(result.data)) {
      return { ...result, ok: false, fallback: "localOnly", data: localGroups };
    }

    const remoteGroups = result.data.map((group) => normalizeRemoteGroup(group));
    const merged = mergeGroups(localGroups, remoteGroups);
    saveGroups(merged);
    render();
    return { ...result, data: merged, merged: true };
  }

  function createGroup(input) {
    const title = asText(input?.title, "");
    if (!title) return null;
    const now = new Date().toISOString();
    const groups = loadGroups();
    const group = normalizeGroup({
      id: uid("group"),
      title,
      type: input?.type,
      description: asText(input?.description, ""),
      createdAt: now,
      updatedAt: now,
      tags: input?.tags,
      members: [],
      references: [],
      source: "aha_groups",
      meta: { createdBy: "groups_ui", local_only: true, shared_external: false, echonet_shared: false, sync_enabled: false, external_share_enabled: false }
    });
    groups.unshift(group);
    saveGroups(groups);
    persistGroup(group);
    return group;
  }

  function updateGroup(id, changes) {
    const groups = loadGroups();
    const idx = groups.findIndex((g) => g.id === id);
    if (idx < 0) return null;
    const current = groups[idx];
    const next = normalizeGroup({
      ...current,
      ...asObject(changes),
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
      members: changes?.members !== undefined ? changes.members : current.members,
      references: changes?.references !== undefined ? changes.references : current.references
    });
    groups[idx] = next;
    saveGroups(groups);
    persistGroup(next);
    return next;
  }

  function deleteGroup(id) {
    return updateGroup(id, { deletedAt: new Date().toISOString() });
  }

  function addMemberToGroup(groupId, memberInput) {
    const groups = loadGroups();
    const idx = groups.findIndex((g) => g.id === groupId && !isUnavailableRecord(g));
    if (idx < 0) return { ok: false, reason: "group_not_found" };
    const group = groups[idx];
    const name = asText(memberInput?.name, "");
    if (!name) return { ok: false, reason: "missing_name" };

    const duplicate = group.members.some((m) => m.name.toLowerCase() === name.toLowerCase() && m.role === (memberInput?.role || "member"));
    if (duplicate) return { ok: false, reason: "duplicate", group };

    group.members.push(normalizeMember({ ...memberInput, id: uid("group_member"), name, status: memberInput?.status || "local" }));
    group.updatedAt = new Date().toISOString();
    groups[idx] = normalizeGroup(group);
    saveGroups(groups);
    persistGroup(groups[idx]);
    return { ok: true, member: group.members[group.members.length - 1], group: groups[idx] };
  }

  function removeMemberFromGroup(groupId, memberId) {
    const groups = loadGroups();
    const idx = groups.findIndex((g) => g.id === groupId && !isUnavailableRecord(g));
    if (idx < 0) return { ok: false, reason: "group_not_found" };
    const group = groups[idx];
    const next = group.members.filter((m) => m.id !== memberId);
    if (next.length === group.members.length) return { ok: false, reason: "member_not_found" };
    group.members = next;
    group.updatedAt = new Date().toISOString();
    groups[idx] = normalizeGroup(group);
    saveGroups(groups);
    persistGroup(groups[idx]);
    return { ok: true, group };
  }

  function addReferenceToGroup(groupId, referenceInput) {
    const groups = loadGroups();
    const lookupId = String(groupId);
    const idx = groups.findIndex((g) => String(g.id) === lookupId && !isUnavailableRecord(g));
    if (idx < 0) return { ok: false, reason: "group_not_found" };
    const group = groups[idx];

    const validation = validateGroupReference(referenceInput);
    if (!validation.ok) return { ok: false, reason: "invalid_reference", detail: validation.reason };
    const candidate = normalizeReference({ ...validation.item, ...referenceInput, id: uid("group_ref") });

    const duplicate = group.references.some((ref) => ref.source === candidate.source && ref.refId === candidate.refId);
    if (duplicate) return { ok: false, reason: "duplicate", group };

    group.references.push(candidate);
    group.updatedAt = new Date().toISOString();
    groups[idx] = normalizeGroup(group);
    saveGroups(groups);
    persistGroup(groups[idx]);
    return { ok: true, reference: candidate, group: groups[idx] };
  }

  function addReferenceToGroupByObject(groupId, objectInput) {
    const src = asObject(objectInput);
    const reference = {
      title: asText(src.title, "Referanse"),
      type: asText(src.type, "reference"),
      source: asText(src.source, "aha"),
      refId: asText(src.refId ?? src.ref_id, ""),
      meta: asObject(src.meta)
    };
    return addReferenceToGroup(groupId, reference);
  }

  function removeReferenceFromGroup(groupId, referenceId) {
    const groups = loadGroups();
    const idx = groups.findIndex((g) => g.id === groupId && !isUnavailableRecord(g));
    if (idx < 0) return { ok: false, reason: "group_not_found" };
    const group = groups[idx];
    const next = group.references.filter((ref) => ref.id !== referenceId);
    if (next.length === group.references.length) return { ok: false, reason: "reference_not_found" };
    group.references = next;
    group.updatedAt = new Date().toISOString();
    groups[idx] = normalizeGroup(group);
    saveGroups(groups);
    persistGroup(groups[idx]);
    return { ok: true, group };
  }

  function collectFromInsightChamber(out) {
    const chamber = asObject(safeParse(localStorage.getItem("aha_insight_chamber_v1") || "{}", {}));
    asArray(chamber.insights).forEach((item, index) => {
      if (isUnavailableRecord(item)) return;
      const refId = asText(
        item?.id || item?.base?.id || item?.source_event_id || item?.sourceEventId || item?.source_id || item?.sourceId || item?.event_id || item?.eventId,
        `insight_idx_${index}`
      );
      out.push({ title: asText(item?.title || item?.heading || item?.label || item?.summary || item?.text, "Innsikt"), type: "insight", source: "aha_insights", refId });
    });
  }

  function collectFromArrayKey(storageKey, type, source, titleReader) {
    const arr = asArray(safeParse(localStorage.getItem(storageKey) || "[]", []));
    return arr
      .filter((item) => !isUnavailableRecord(item))
      .map((item, index) => {
        const refId = asText(item?.id, `${type}_idx_${index}`);
        return { title: asText(titleReader(item), type), type, source, refId };
      });
  }

  function collectAvailableGroupReferences() {
    const out = [];
    collectFromInsightChamber(out);
    out.push(...collectFromArrayKey("aha_lists_v1", "list", "aha_lists", (item) => item?.title || "Liste"));
    out.push(...collectFromArrayKey("aha_paths_v1", "path", "aha_paths", (item) => item?.title || "Sti"));
    out.push(...collectFromArrayKey("aha_articles_v1", "article", "aha_avisa", (item) => item?.title || "Artikkel"));
    out.push(...collectFromArrayKey("aha_notes_v1", "note", "aha_notes", (item) => item?.title || item?.text || "Notat"));
    out.push(...collectFromArrayKey("aha_feed_posts_v1", "feed_post", "aha_feed", (item) => item?.text || item?.title || "Feed-post"));
    return out;
  }
  function buildAvailableGroupReferenceIndex(items = collectAvailableGroupReferences()) {
    const index = new Map();
    asArray(items).forEach((item) => {
      const source = asText(item?.source, "");
      const refId = asText(item?.refId || item?.ref_id, "");
      if (source && refId) index.set(`${source}::${refId}`, item);
    });
    return index;
  }

  function validateGroupReference(referenceInput, availableItems = collectAvailableGroupReferences()) {
    const ref = asObject(referenceInput);
    const source = asText(ref.source, "");
    const refId = asText(ref.refId || ref.ref_id, "");
    if (!source) return { ok: false, reason: "missing_source" };
    if (!refId) return { ok: false, reason: "missing_refId" };
    if (!ALLOWED_REFERENCE_SOURCES.has(source)) return { ok: false, reason: "unknown_source" };
    const item = buildAvailableGroupReferenceIndex(availableItems).get(`${source}::${refId}`);
    if (!item) return { ok: false, reason: "target_unavailable" };
    if (isUnavailableRecord(item)) return { ok: false, reason: "target_unavailable" };
    if (!asText(item.title, "") || !asText(item.type, "") || !asText(item.source, "") || !asText(item.refId || item.ref_id, "")) {
      return { ok: false, reason: "invalid_target" };
    }
    return { ok: true, item };
  }

  function collectGroupArticleDrafts(groupId) {
    const targetId = asText(groupId, "");
    if (!targetId) return [];
    const articles = asArray(safeParse(localStorage.getItem("aha_articles_v1") || "[]", []));
    return articles.filter((article) => {
      if (isUnavailableRecord(article)) return false;
      const metaGroupId = asText(article?.meta?.createdFromGroupId, "");
      if (metaGroupId && metaGroupId === targetId) return true;
      return asArray(article?.references).some((ref) => asText(ref?.source, "") === "aha_groups" && asText(ref?.refId || ref?.ref_id, "") === targetId);
    });
  }

  function buildGroupReport(groupId) {
    const targetId = asText(groupId, "");
    if (!targetId) return null;

    const group = getActiveGroups().find((item) => item.id === targetId);
    if (!group) return null;

    const references = asArray(group.references);
    const referencesByType = {};
    const referencesBySource = {};
    let resolvedCount = 0;

    references.forEach((ref) => {
      const type = asText(ref?.type, "reference");
      const source = asText(ref?.source, "aha");
      referencesByType[type] = (referencesByType[type] || 0) + 1;
      referencesBySource[source] = (referencesBySource[source] || 0) + 1;
      if (resolveReferenceObject(ref)) resolvedCount += 1;
    });

    const referencesCount = references.length;
    const missingCount = Math.max(0, referencesCount - resolvedCount);
    const articleDrafts = collectGroupArticleDrafts(group.id);
    const articleDraftCount = articleDrafts.length;
    const readyArticleDraftCount = articleDrafts.filter((article) => asText(article?.status, "").toLowerCase() === "ready").length;

    const dominantTypes = Object.entries(referencesByType)
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      })
      .slice(0, 3)
      .map((entry) => entry[0]);

    let publishingReadiness = "low";
    if (referencesCount >= 2) publishingReadiness = "medium";
    if (referencesCount >= 5 && articleDraftCount > 0) publishingReadiness = "high";
    if (readyArticleDraftCount > 0) publishingReadiness = "ready";

    const suggestedNextActions = [];
    if (group.members.length === 0) suggestedNextActions.push("Legg til lokale medlemmer/roller.");
    if (referencesCount === 0) suggestedNextActions.push("Legg til innsikter, lister, stier eller notater i gruppen.");
    if (missingCount > 0) suggestedNextActions.push("Sjekk referanser som ikke lenger finnes.");
    if (articleDraftCount === 0) suggestedNextActions.push("Lag et AHAavisa-utkast fra gruppen.");
    if (readyArticleDraftCount > 0) suggestedNextActions.push("Vurder publiseringsflyt senere.");
    if (!suggestedNextActions.length) suggestedNextActions.push("Bygg videre på delt bibliotek.");

    return {
      groupId: group.id,
      title: group.title,
      type: group.type,
      description: group.description,
      tags: normalizeTags(group.tags),
      membersCount: group.members.length,
      referencesCount,
      referencesByType,
      referencesBySource,
      resolvedCount,
      missingCount,
      articleDraftCount,
      readyArticleDraftCount,
      dominantTypes,
      suggestedNextActions,
      publishingReadiness,
      generatedAt: new Date().toISOString()
    };
  }

  function createArticleDraftFromGroup(groupId) {
    const targetId = asText(groupId, "");
    if (!targetId) return null;

    const group = getActiveGroups().find((item) => item.id === targetId);
    if (!group) return null;

    const avisa = global.AHAAvisa;
    if (!avisa || typeof avisa.createArticle !== "function") return null;

    const baseTags = normalizeTags(group.tags);
    const tags = normalizeTags(baseTags.concat(["gruppe", "sirkel"]));
    const title = asText(group.title, "Uten navn");

    const articleInput = {
      title,
      section: "aha",
      status: "draft",
      summary: asText(group.description, "Utkast basert på gruppe/sirkel."),
      body: `Dette utkastet er opprettet fra gruppen/sirkelen "${title}". Det bygger på gruppens delte bibliotek og lokale referanser.`,
      tags,
      source: "aha_avisa",
      publicationLayer: "group",
      local_only: true,
      published_external: false,
      external_publish_enabled: false,
      echonet_shared: false,
      sync_enabled: false,
      meta: {
        createdFromGroupId: group.id,
        createdFromGroupTitle: title,
        source: "aha_groups",
        local_only: true,
        echonet_shared: false,
        sync_enabled: false
      }
    };

    const created = avisa.createArticle(articleInput);
    if (!created) return null;

    const fullArticle = typeof avisa.updateArticle === "function"
      ? avisa.updateArticle(created.id, {
        section: articleInput.section,
        status: "draft",
        summary: articleInput.summary,
        body: articleInput.body,
        tags: articleInput.tags,
        source: "aha_avisa",
        publicationLayer: "group",
        local_only: true,
        published_external: false,
        external_publish_enabled: false,
        echonet_shared: false,
        sync_enabled: false,
        meta: articleInput.meta
      })
      : created;

    const articleId = asText(fullArticle?.id || created.id, "");
    if (!articleId) return null;

    if (typeof avisa.addReferenceToArticle === "function") {
      asArray(group.references).forEach((ref) => {
        avisa.addReferenceToArticle(articleId, {
          title: asText(ref?.title, "Referanse"),
          type: asText(ref?.type, "reference"),
          source: asText(ref?.source, ""),
          refId: asText(ref?.refId || ref?.ref_id, ""),
          meta: asObject(ref?.meta)
        });
      });
      avisa.addReferenceToArticle(articleId, {
        title,
        type: "group",
        source: "aha_groups",
        refId: group.id,
        meta: { createdFrom: "group_workspace" }
      });
    }

    return (typeof avisa.loadArticles === "function"
      ? asArray(avisa.loadArticles()).find((article) => article.id === articleId)
      : null) || fullArticle || created;
  }

  function safeDecodeHash(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return "";
    }
  }

  function hashGroupId() {
    const raw = String(global.location.hash || "").replace(/^#/, "").trim();
    if (!raw) return "";
    if (raw.startsWith("group=")) return safeDecodeHash(raw.slice(6));
    return safeDecodeHash(raw);
  }

  function setHashGroupId(groupId) {
    global.location.hash = groupId ? `group=${encodeURIComponent(groupId)}` : "";
  }

  function resolveModuleHref(source) {
    if (source === "aha_insights") return "insights.html";
    if (source === "aha_lists") return "lists.html";
    if (source === "aha_paths") return "paths.html";
    if (source === "aha_avisa") return "avisa.html";
    if (source === "aha_notes") return "notes.html";
    if (source === "aha_feed") return "feed.html";
    return "index.html";
  }

  function previewForObject(item) {
    return asText(item?.summary || item?.description || item?.text || item?.body || item?.label || "", "");
  }

  function resolveReferenceObject(ref) {
    const source = asText(ref?.source, "");
    const refId = asText(ref?.refId, "");
    if (!source || !refId) return null;
    if (source === "aha_insights") {
      const chamber = asObject(safeParse(localStorage.getItem("aha_insight_chamber_v1") || "{}", {}));
      const items = asArray(chamber.insights);
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (isUnavailableRecord(item)) continue;
        const candidates = [
          item?.id, item?.base?.id, item?.source_event_id, item?.sourceEventId, item?.source_id, item?.sourceId, item?.event_id, item?.eventId, `insight_idx_${i}`
        ].map((x) => asText(x, ""));
        if (candidates.includes(refId)) return item;
      }
      return null;
    }
    const sources = {
      aha_lists: { key: "aha_lists_v1", fallbackPrefix: "list" },
      aha_paths: { key: "aha_paths_v1", fallbackPrefix: "path" },
      aha_avisa: { key: "aha_articles_v1", fallbackPrefix: "article" },
      aha_notes: { key: "aha_notes_v1", fallbackPrefix: "note" },
      aha_feed: { key: "aha_feed_posts_v1", fallbackPrefix: "feed_post" }
    };
    const sourceConfig = sources[source];
    if (!sourceConfig?.key) return null;
    const items = asArray(safeParse(localStorage.getItem(sourceConfig.key) || "[]", []));
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (isUnavailableRecord(item)) continue;
      const fallbackId = `${sourceConfig.fallbackPrefix}_idx_${i}`;
      const candidates = [item?.id, fallbackId].map((x) => asText(x, ""));
      if (candidates.includes(refId)) return item;
    }
    return null;
  }

  function referenceFilterMatches(filter, ref) {
    if (filter === "all") return true;
    if (filter === "insights") return ref.source === "aha_insights";
    if (filter === "lists") return ref.source === "aha_lists";
    if (filter === "paths") return ref.source === "aha_paths";
    if (filter === "articles") return ref.source === "aha_avisa";
    if (filter === "notes") return ref.source === "aha_notes";
    if (filter === "feed") return ref.source === "aha_feed";
    return true;
  }

  function buildGroupActivity(group) {
    const out = [];
    if (group.createdAt) out.push({ at: group.createdAt, label: "Gruppe opprettet" });
    if (group.updatedAt) out.push({ at: group.updatedAt, label: "Gruppe oppdatert" });
    group.members.forEach((member) => {
      if (member.addedAt) out.push({ at: member.addedAt, label: `Medlem lagt til: ${member.name} (${member.role})` });
    });
    group.references.forEach((ref) => {
      if (ref.addedAt) out.push({ at: ref.addedAt, label: `Referanse lagt til: ${ref.title}` });
    });
    return out.sort((a, b) => Date.parse(b.at || "") - Date.parse(a.at || "")).slice(0, 10);
  }

  function loadPrivacySettings() {
    return asObject(safeParse(localStorage.getItem(PRIVACY_KEY) || "{}", {}));
  }

  function renderContent() {
    const root = document.getElementById("groups-root");
    if (!root) return;

    const rawDataset = localStorage.getItem(GROUPS_KEY);
    const datasetExists = rawDataset !== null;
    if (datasetExists) JSON.parse(rawDataset);
    const groups = getActiveGroups();
    const references = collectAvailableGroupReferences();
    const activeGroupId = hashGroupId();
    const activeGroup = groups.find((g) => g.id === activeGroupId) || null;
    const activeReport = activeGroup ? buildGroupReport(activeGroup.id) : null;
    const activeFilter = LIBRARY_FILTERS.includes(asText(root.getAttribute("data-library-filter"), "all")) ? root.getAttribute("data-library-filter") : "all";
    const privacy = loadPrivacySettings();

    const memberCount = groups.reduce((sum, g) => sum + g.members.length, 0);
    const referenceCount = groups.reduce((sum, g) => sum + g.references.length, 0);

    const privacyText = privacy.allowSocialSharing
      ? "Sosial deling er bare samtykke/plan for senere. Ekte deling er ikke bygget eller aktivert."
      : "Sosial deling er av. Dette er kun lokal gruppeplanlegging.";

    root.innerHTML = `
      <section class="aha-panel aha-module-shell" aria-labelledby="groups-module-title">
        <header class="aha-module-shell-header">
          <div>
            <p class="eyebrow">AHA module</p>
            <h1 id="groups-module-title">Groups</h1>
            <p class="aha-module-purpose">Lokale grupperom for AHA-objekter, roller og delte referanser. Groups organiserer materiale lokalt, men deler ikke eksternt.</p>
          </div>
          <span id="aha-module-health" class="aha-module-health-badge aha-module-health-unknown" role="status" aria-label="Groups: Unknown"><span>Unknown</span></span>
        </header>
        <div class="aha-module-actions" aria-label="Groups actions">
          <a class="aha-tile-btn aha-tile-btn-primary" href="#groups-create">Lag gruppe</a>
          <button type="button" class="aha-tile-btn" id="groups-refresh-btn">Oppdater</button>
          <a class="aha-tile-btn" href="index.html">Tilbake til AHA Home</a>
        </div>
        <details class="aha-module-details">
          <summary>Advanced details</summary>
          <p>Groups er local-only. Medlemmer er lokale roller, ikke ekte brukerkontoer. Ingen invitasjoner sendes, ingen data deles eksternt, ingen backend brukes, og EchoNet er ikke aktivert.</p>
          <p class="groups-privacy-note">${escapeHtml(privacyText)}</p>
        </details>
      </section>

      <section id="groups-create" class="aha-panel groups-create-panel">
        <h2>Opprett gruppe</h2>
        <form id="groups-create-form" class="groups-form-grid">
          <label>Tittel<input type="text" name="title" required /></label>
          <label>Type
            <select name="type">
              ${ALLOWED_GROUP_TYPES.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}
            </select>
          </label>
          <label>Beskrivelse<textarea name="description" rows="2"></textarea></label>
          <label>Tags (komma-separert)<input type="text" name="tags" /></label>
          <button type="submit" class="aha-tile-btn aha-tile-btn-primary">Lag gruppe</button>
        </form>
      </section>

      <section class="aha-panel groups-stats">
        <h2>Oversikt</h2>
        <div class="groups-badges">
          <span class="groups-badge">Grupper: ${escapeHtml(String(groups.length))}</span>
          <span class="groups-badge">Medlemmer: ${escapeHtml(String(memberCount))}</span>
          <span class="groups-badge">Referanser: ${escapeHtml(String(referenceCount))}</span>
        </div>
      </section>

      <section class="aha-panel groups-selector-panel">
        <h2>Velg aktiv gruppe</h2>
        ${groups.length ? `
          <div class="groups-selector-row">
            <select id="groups-active-select">
              <option value="">Velg gruppe</option>
              ${groups.map((group) => `<option value="${escapeHtml(group.id)}" ${activeGroup && activeGroup.id === group.id ? "selected" : ""}>${escapeHtml(group.title)}</option>`).join("")}
            </select>
            <button type="button" class="aha-tile-btn" id="groups-open-active-btn">Åpne gruppe</button>
          </div>
        ` : "<p>Ingen grupper finnes ennå.</p>"}
      </section>

      <section class="groups-card-list aha-module-content" aria-live="polite">
        ${groups.length ? groups.map((group) => `
          <article class="aha-panel groups-card" data-group-id="${escapeHtml(group.id)}">
            <header>
              <h3>${escapeHtml(group.title)}</h3>
              <div class="groups-badges"><span class="groups-badge">${escapeHtml(group.type)}</span></div>
            </header>
            <p>${escapeHtml(group.description || "Ingen beskrivelse")}</p>
            <p>Tags: ${group.tags.length ? group.tags.map((tag) => `<span class="groups-tag">${escapeHtml(tag)}</span>`).join(" ") : "Ingen"}</p>
            <p>Opprettet: ${escapeHtml(group.createdAt)} · Oppdatert: ${escapeHtml(group.updatedAt)}</p>
            <p>Medlemmer: ${escapeHtml(String(group.members.length))} · Referanser: ${escapeHtml(String(group.references.length))}</p>
            <div class="aha-tile-actions">
              <button type="button" class="aha-tile-btn" data-action="open-workspace" data-group-id="${escapeHtml(group.id)}">Åpne arbeidsrom</button>
              <button type="button" class="aha-tile-btn" data-action="delete-group" data-group-id="${escapeHtml(group.id)}">Slett gruppe</button>
            </div>

            <section class="groups-subsection">
              <h4>Medlemmer</h4>
              <ul class="groups-list">
                ${group.members.length
                  ? group.members.map((member) => `<li>
                      <span>${escapeHtml(member.name)} · ${escapeHtml(member.role)} · ${escapeHtml(member.status)}</span>
                      <button type="button" data-action="remove-member" data-group-id="${escapeHtml(group.id)}" data-member-id="${escapeHtml(member.id)}">Fjern</button>
                    </li>`).join("")
                  : "<li>Ingen medlemmer ennå.</li>"}
              </ul>
              <form class="groups-inline-form" data-action="add-member" data-group-id="${escapeHtml(group.id)}">
                <input type="text" name="memberName" placeholder="Lokalt navn" required />
                <select name="memberRole">${ALLOWED_MEMBER_ROLES.map((role) => `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`).join("")}</select>
                <button type="submit">Legg til medlem</button>
              </form>
              <p class="groups-statusline" data-status="add-member" data-group-id="${escapeHtml(group.id)}" aria-live="polite"></p>
            </section>

            <section class="groups-subsection">
              <h4>Delt bibliotek / referanser</h4>
              <ul class="groups-list">
                ${group.references.length
                  ? group.references.map((ref) => `<li>
                      <span>${escapeHtml(ref.title)} · ${escapeHtml(ref.type)} · ${escapeHtml(ref.source)} (${escapeHtml(ref.refId)})</span>
                      <button type="button" data-action="remove-reference" data-group-id="${escapeHtml(group.id)}" data-reference-id="${escapeHtml(ref.id)}">Fjern</button>
                    </li>`).join("")
                  : "<li>Ingen referanser ennå.</li>"}
              </ul>
              <form class="groups-inline-form" data-action="add-reference" data-group-id="${escapeHtml(group.id)}">
                <select name="referenceKey" required>
                  <option value="">Velg objekt</option>
                  ${references.map((ref, index) => `<option value="${escapeHtml(String(index))}">${escapeHtml(`${ref.title} (${ref.type} · ${ref.source})`)}</option>`).join("")}
                </select>
                <button type="submit">Legg til referanse</button>
              </form>
              <p class="groups-statusline" data-status="add-reference" data-group-id="${escapeHtml(group.id)}" aria-live="polite"></p>
            </section>
          </article>
        `).join("") : global.AHAModules.buildModuleEmptyState({
          type: datasetExists ? "no_data" : "missing_source",
          moduleId: "groups",
          hint: datasetExists ? "Use Lag gruppe above when you are ready." : "Groups will appear here when available."
        })}
      </section>

      ${activeGroup ? `
        <section class="aha-panel groups-workspace">
          <header class="groups-workspace-header">
            <div>
              <p class="eyebrow">Gruppe-arbeidsrom</p>
              <h2>${escapeHtml(activeGroup.title)}</h2>
            </div>
            <div class="aha-tile-actions">
              <button type="button" class="aha-tile-btn" id="groups-back-overview-btn">Til gruppeoversikt</button>
              <button type="button" class="aha-tile-btn" id="groups-workspace-refresh-btn">Oppdater</button>
            </div>
          </header>
          <p>Type: ${escapeHtml(activeGroup.type)}</p>
          <p>Beskrivelse: ${escapeHtml(activeGroup.description || "Ingen beskrivelse")}</p>
          <p>Tags: ${activeGroup.tags.length ? activeGroup.tags.map((tag) => `<span class="groups-tag">${escapeHtml(tag)}</span>`).join(" ") : "Ingen"}</p>
          <p>Opprettet: ${escapeHtml(activeGroup.createdAt)} · Oppdatert: ${escapeHtml(activeGroup.updatedAt)}</p>
          <p>Medlemmer: ${escapeHtml(String(activeGroup.members.length))} · Referanser: ${escapeHtml(String(activeGroup.references.length))}</p>

          <section class="groups-subsection">
            <h3>AHAavisa-utkast</h3>
            <p>Lag et lokalt artikkelutkast basert på gruppens tittel, beskrivelse og referanser.</p>
            <div class="aha-tile-actions">
              <button type="button" class="aha-tile-btn aha-tile-btn-primary" id="groups-create-avisa-draft-btn" data-group-id="${escapeHtml(activeGroup.id)}">Lag AHAavisa-utkast fra gruppe</button>
              <a class="aha-tile-btn" href="avisa.html">Åpne AHAavisa</a>
            </div>
            <p class="groups-statusline" id="groups-avisa-draft-status" aria-live="polite"></p>
          </section>

          <section class="groups-subsection">
            <h3>Grupperapport</h3>
            <div class="groups-report-grid">
              <article class="groups-report-card"><strong>${escapeHtml(String(activeReport.referencesCount))}</strong><span>Referanser</span></article>
              <article class="groups-report-card"><strong>${escapeHtml(String(activeReport.resolvedCount))}</strong><span>Resolved</span></article>
              <article class="groups-report-card"><strong>${escapeHtml(String(activeReport.missingCount))}</strong><span>Mangler</span></article>
              <article class="groups-report-card"><strong>${escapeHtml(String(activeReport.articleDraftCount))}</strong><span>AHAavisa-utkast</span></article>
              <article class="groups-report-card"><strong>${escapeHtml(String(activeReport.readyArticleDraftCount))}</strong><span>Ready-utkast</span></article>
              <article class="groups-report-card groups-readiness"><strong>${escapeHtml(activeReport.publishingReadiness)}</strong><span>Publiseringsmodenhet</span></article>
            </div>
            <p>Dominante typer: ${activeReport.dominantTypes.length ? activeReport.dominantTypes.map((type) => `<span class="groups-tag">${escapeHtml(type)}</span>`).join(" ") : "Ingen"}</p>
            <h4>Kilder</h4>
            <ul class="groups-list groups-report-list">
              ${Object.keys(activeReport.referencesBySource).length
                ? Object.entries(activeReport.referencesBySource).map(([source, count]) => `<li><span>${escapeHtml(source)}</span><strong>${escapeHtml(String(count))}</strong></li>`).join("")
                : "<li>Ingen kilder registrert.</li>"}
            </ul>
            <h4>Forslag til neste steg</h4>
            <ul class="groups-list groups-report-list">
              ${activeReport.suggestedNextActions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
            ${activeReport.articleDraftCount > 0 ? '<p><a href="avisa.html">Se gruppeutkast i AHAavisa</a></p>' : ''}
            <p><small>Generert: ${escapeHtml(activeReport.generatedAt)}</small></p>
          </section>

          <section class="groups-subsection">
            <h3>Medlemmer</h3>
            <ul class="groups-list">
              ${activeGroup.members.length ? activeGroup.members.map((member) => `<li><span>${escapeHtml(member.name)} · ${escapeHtml(member.role)} · ${escapeHtml(member.status)} · ${escapeHtml(member.addedAt)}</span><button type="button" data-action="remove-member" data-group-id="${escapeHtml(activeGroup.id)}" data-member-id="${escapeHtml(member.id)}">Fjern</button></li>`).join("") : "<li>Ingen medlemmer ennå.</li>"}
            </ul>
            <form class="groups-inline-form" data-action="add-member" data-group-id="${escapeHtml(activeGroup.id)}">
              <input type="text" name="memberName" placeholder="Lokalt navn" required />
              <select name="memberRole">${ALLOWED_MEMBER_ROLES.map((role) => `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`).join("")}</select>
              <button type="submit">Legg til medlem</button>
            </form>
            <p class="groups-statusline" data-status="add-member" data-group-id="${escapeHtml(activeGroup.id)}" aria-live="polite"></p>
          </section>

          <section class="groups-subsection groups-shared-library">
            <h3>Delt bibliotek</h3>
            <div class="groups-filter-row">
              ${LIBRARY_FILTERS.map((filter) => `<button type="button" class="aha-tile-btn ${activeFilter === filter ? "aha-tile-btn-primary" : ""}" data-action="set-library-filter" data-filter="${escapeHtml(filter)}">${escapeHtml(filter)}</button>`).join("")}
            </div>
            <ul class="groups-list">
              ${activeGroup.references.filter((ref) => referenceFilterMatches(activeFilter, ref)).length
                ? activeGroup.references.filter((ref) => referenceFilterMatches(activeFilter, ref)).map((ref) => {
                  const obj = resolveReferenceObject(ref);
                  const preview = obj ? previewForObject(obj) : "";
                  return `<li><span><strong>${escapeHtml(ref.title)}</strong> · ${escapeHtml(ref.type)} · ${escapeHtml(ref.source)} · ${escapeHtml(ref.refId)}${preview ? `<br/><small>${escapeHtml(preview.slice(0, 160))}</small>` : ""}${obj ? "" : "<br/><small>Referansen finnes i gruppen, men objektet er ikke lenger tilgjengelig.</small>"}<br/><a href="${escapeHtml(resolveModuleHref(ref.source))}">Åpne modul</a></span><button type="button" data-action="remove-reference" data-group-id="${escapeHtml(activeGroup.id)}" data-reference-id="${escapeHtml(ref.id)}">Fjern</button></li>`;
                }).join("")
                : "<li>Ingen referanser i valgt filter.</li>"}
            </ul>
          </section>

          <section class="groups-subsection">
            <h3>Gruppeaktivitet</h3>
            <ul class="groups-list groups-activity-list">
              ${buildGroupActivity(activeGroup).length ? buildGroupActivity(activeGroup).map((item) => `<li><span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.at)}</small></li>`).join("") : "<li>Ingen aktivitet ennå.</li>"}
            </ul>
          </section>
        </section>
      ` : ""}
    `;

    global.AHAModules?.updatePageHealth?.("groups", global.AHAModules.localPageHealth({
      count: groups.length,
      datasetExists
    }));
    bindEvents(references);
  }

  function render() {
    try {
      renderContent();
    } catch {
      const root = document.getElementById("groups-root");
      if (root) root.innerHTML = `
        <section class="aha-panel aha-module-shell" aria-labelledby="groups-module-title">
          <header class="aha-module-shell-header">
            <div><p class="eyebrow">AHA module</p><h1 id="groups-module-title">Groups</h1><p class="aha-module-purpose">Lokale grupperom for AHA-objekter, roller og delte referanser. Groups organiserer materiale lokalt, men deler ikke eksternt.</p></div>
            <span class="aha-module-health-badge aha-module-health-blocked" role="status" aria-label="Groups: Blocked"><span>Blocked</span></span>
          </header>
          <div class="aha-module-actions"><a class="aha-tile-btn" href="index.html">Tilbake til AHA Home</a></div>
        </section>
        ${global.AHAModules.buildModuleEmptyState({ type: "read_error", moduleId: "groups" })}`;
    }
  }

  function bindEvents(availableReferences) {
    const refreshBtn = document.getElementById("groups-refresh-btn");
    if (refreshBtn) refreshBtn.addEventListener("click", refresh);
    const workspaceRefreshBtn = document.getElementById("groups-workspace-refresh-btn");
    if (workspaceRefreshBtn) workspaceRefreshBtn.addEventListener("click", refresh);
    const backBtn = document.getElementById("groups-back-overview-btn");
    if (backBtn) backBtn.addEventListener("click", () => { setHashGroupId(""); refresh(); });
    const activeSelect = document.getElementById("groups-active-select");
    const openActiveBtn = document.getElementById("groups-open-active-btn");
    if (openActiveBtn && activeSelect) openActiveBtn.addEventListener("click", () => { setHashGroupId(asText(activeSelect.value, "")); refresh(); });

    const createForm = document.getElementById("groups-create-form");
    if (createForm) {
      createForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(createForm);
        createGroup({
          title: formData.get("title"),
          type: formData.get("type"),
          description: formData.get("description"),
          tags: formData.get("tags")
        });
        createForm.reset();
        refresh();
      });
    }

    document.querySelectorAll('[data-action="delete-group"]').forEach((button) => {
      button.addEventListener("click", () => {
        deleteGroup(button.getAttribute("data-group-id"));
        refresh();
      });
    });
    document.querySelectorAll('[data-action="open-workspace"]').forEach((button) => {
      button.addEventListener("click", () => {
        setHashGroupId(button.getAttribute("data-group-id"));
        refresh();
      });
    });
    document.querySelectorAll('[data-action="set-library-filter"]').forEach((button) => {
      button.addEventListener("click", () => {
        const root = document.getElementById("groups-root");
        if (root) root.setAttribute("data-library-filter", asText(button.getAttribute("data-filter"), "all"));
        refresh();
      });
    });

    document.querySelectorAll('[data-action="remove-member"]').forEach((button) => {
      button.addEventListener("click", () => {
        removeMemberFromGroup(button.getAttribute("data-group-id"), button.getAttribute("data-member-id"));
        refresh();
      });
    });

    document.querySelectorAll('[data-action="remove-reference"]').forEach((button) => {
      button.addEventListener("click", () => {
        removeReferenceFromGroup(button.getAttribute("data-group-id"), button.getAttribute("data-reference-id"));
        refresh();
      });
    });

    document.querySelectorAll('form[data-action="add-member"]').forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const result = addMemberToGroup(form.getAttribute("data-group-id"), {
          name: formData.get("memberName"),
          role: formData.get("memberRole"),
          status: "local"
        });
        const statusEl = form.parentElement?.querySelector('[data-status="add-member"]');
        if (result?.ok) { form.reset(); refresh(); return; }
        if (statusEl) statusEl.textContent = result?.reason === "duplicate" ? "Medlem finnes allerede lokalt" : "Gruppen finnes ikke lenger";
      });
    });

    const createDraftBtn = document.getElementById("groups-create-avisa-draft-btn");
    if (createDraftBtn) {
      createDraftBtn.addEventListener("click", () => {
        const groupId = asText(createDraftBtn.getAttribute("data-group-id"), "");
        const statusEl = document.getElementById("groups-avisa-draft-status");
        const created = createArticleDraftFromGroup(groupId);
        if (statusEl) {
          statusEl.innerHTML = created
            ? `Artikkelutkast opprettet. <a href="avisa.html">Åpne AHAavisa</a>`
            : "Kunne ikke opprette artikkelutkast";
        }
      });
    }

    document.querySelectorAll('form[data-action="add-reference"]').forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const rawReferenceKey = formData.get("referenceKey");
        const statusEl = form.parentElement?.querySelector('[data-status="add-reference"]');
        if (rawReferenceKey === null || rawReferenceKey === "") { if (statusEl) statusEl.textContent = "Velg et objekt først"; return; }
        const idx = Number(rawReferenceKey);
        if (!Number.isInteger(idx) || !availableReferences[idx]) { if (statusEl) statusEl.textContent = "Kilden finnes ikke lenger"; return; }
        const result = addReferenceToGroup(form.getAttribute("data-group-id"), availableReferences[idx]);
        if (result?.ok) { form.reset(); refresh(); return; }
        if (statusEl) {
          if (result?.reason === "duplicate") statusEl.textContent = "Finnes allerede i gruppen";
          else if (result?.reason === "group_not_found") statusEl.textContent = "Gruppen finnes ikke lenger";
          else statusEl.textContent = "Kilden finnes ikke lenger";
        }
      });
    });
  }

  function refresh() { render(); }

  global.AHAGroups = {
    loadGroups,
    getActiveGroups,
    saveGroups,
    syncFromDatabase,
    createGroup,
    updateGroup,
    deleteGroup,
    addMemberToGroup,
    removeMemberFromGroup,
    addReferenceToGroup,
    addReferenceToGroupByObject,
    removeReferenceFromGroup,
    collectAvailableGroupReferences,
    buildAvailableGroupReferenceIndex,
    validateGroupReference,
    resolveReferenceObject,
    buildGroupReport,
    createArticleDraftFromGroup,
    render,
    refresh
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})(window);
