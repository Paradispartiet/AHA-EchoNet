// ahaLists.js
// Fase 3B: første fungerende AHA-lister modul (localStorage-first).

(function (global) {
  "use strict";

  const LISTS_KEY = "aha_lists_v1";
  const CONCEPT_LISTS_KEY = "aha_concept_lists_v1";
  const INSIGHTS_KEY = "aha_insight_chamber_v1";
  const NOTES_KEY = "aha_notes_v1";
  const FEED_KEY = "aha_feed_posts_v1";
  const GALLERY_KEY = "aha_gallery_v1";
  const INSTA_KEY = "aha_insta_posts_v1";

  const ALLOWED_TYPES = ["favorites", "todo", "concepts", "process", "quality", "ai", "shared_later"];
  let selectedListId = "";
  const projectionReceipts = new Map();

  function safeParse(raw, fallback) {
    try {
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asText(value, fallback) {
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  }

  function stableId(prefix, value) {
    const input = String(value || "").toLocaleLowerCase("no");
    let hash = 5381;
    for (let index = 0; index < input.length; index += 1) hash = ((hash << 5) + hash + input.charCodeAt(index)) >>> 0;
    return `${prefix}_${hash.toString(36)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function loadRawByKey(key, fallback) {
    return safeParse(localStorage.getItem(key) || JSON.stringify(fallback), fallback);
  }

  function isDatabaseSyncEnabled() {
    return global.AHA_CONFIG?.lists?.enableDatabaseSync === true;
  }

  function isDeletedRecord(record) {
    return Boolean(record?.deletedAt || record?.deleted_at);
  }

  function isUnavailableRecord(record) {
    return isDeletedRecord(record) || record?.archived === true;
  }

  function normalizeListItem(item, listId) {
    const now = new Date().toISOString();
    return {
      id: asText(item?.id, uid("list_item")),
      title: asText(item?.title, "Objekt"),
      type: asText(item?.type, "reference"),
      source: asText(item?.source, "aha"),
      refId: asText(item?.refId || item?.ref_id, ""),
      addedAt: item?.addedAt || item?.added_at || now,
      meta: item && typeof item.meta === "object" && !Array.isArray(item.meta) ? item.meta : { listId }
    };
  }

  function normalizeList(list) {
    const now = new Date().toISOString();
    const normalizedType = ALLOWED_TYPES.includes(list?.type) ? list.type : "favorites";
    const base = global.AHAContracts?.normalizeBaseItem
      ? global.AHAContracts.normalizeBaseItem(list, {
        id: list?.id || uid("list"),
        title: list?.title || "Uten navn",
        type: normalizedType,
        source: "aha_lists",
        createdAt: list?.createdAt || list?.created_at || now,
        updatedAt: list?.updatedAt || list?.updated_at || now,
        tags: list?.tags || []
      })
      : null;

    return {
      id: asText(list?.id || base?.id, uid("list")),
      title: asText(list?.title || base?.title, "Uten navn"),
      type: normalizedType,
      description: asText(list?.description, ""),
      status: asText(list?.status, ""),
      createdAt: list?.createdAt || list?.created_at || base?.createdAt || now,
      updatedAt: list?.updatedAt || list?.updated_at || base?.updatedAt || now,
      tags: global.AHAContracts?.normalizeTags ? global.AHAContracts.normalizeTags(list?.tags) : asArray(list?.tags),
      items: asArray(list?.items).map((item) => normalizeListItem(item, list?.id)),
      source: asText(list?.source || base?.source, "aha_lists"),
      local_only: list?.local_only !== false,
      published_external: list?.published_external === true,
      echonet_shared: list?.echonet_shared === true,
      sync_enabled: list?.sync_enabled === true,
      meta: {
        ...(list && typeof list.meta === "object" && !Array.isArray(list.meta) ? list.meta : {}),
        local_only: list?.meta?.local_only !== false,
        published_external: list?.meta?.published_external === true,
        echonet_shared: list?.meta?.echonet_shared === true,
        sync_enabled: list?.meta?.sync_enabled === true
      },
      deletedAt: list?.deletedAt || list?.deleted_at || ""
    };
  }

  function normalizeConceptTerm(term, index = 0, listId = "") {
    const input = typeof term === "string" ? { term } : (term || {});
    const title = asText(input.term || input.title || input.label, "");
    return {
      id: asText(input.id, stableId("concept_term", `${listId}:${title}:${index}`)),
      term: title,
      definition: asText(input.definition || input.description, ""),
      relation: asText(input.relation, "related_to")
    };
  }

  function normalizeConceptRelation(relation, index = 0) {
    const input = relation && typeof relation === "object" && !Array.isArray(relation) ? relation : {};
    const from = asText(input.from || input.source || input.fromTerm || input.from_term, "");
    const to = asText(input.to || input.target || input.toTerm || input.to_term, "");
    if (!from || !to || from.toLocaleLowerCase("no") === to.toLocaleLowerCase("no")) return null;
    return {
      id: asText(input.id, stableId("concept_relation", `${from}:${to}:${input.type || input.label || index}`)),
      from,
      to,
      type: asText(input.type, "related_to"),
      label: asText(input.label || input.type, "relatert til"),
      explanation: asText(input.explanation || input.reason, "")
    };
  }

  function normalizeConceptList(list) {
    const now = new Date().toISOString();
    return {
      id: asText(list?.id, uid("concept_list")),
      title: asText(list?.title || list?.theme, "Uten navn"),
      description: asText(list?.description, ""),
      terms: asArray(list?.terms || list?.concepts)
        .map((term, index) => normalizeConceptTerm(term, index, list?.id || list?.title))
        .filter((term) => term.term),
      relations: asArray(list?.relations)
        .map((relation, index) => normalizeConceptRelation(relation, index))
        .filter(Boolean),
      references: asArray(list?.references).map((reference) => ({
        id: asText(reference?.id, uid("concept_reference")),
        source: asText(reference?.source, "aha"),
        refId: asText(reference?.refId || reference?.ref_id, ""),
        type: asText(reference?.type, "reference"),
        title: asText(reference?.title, "")
      })).filter((reference) => reference.refId),
      createdAt: list?.createdAt || list?.created_at || now,
      updatedAt: list?.updatedAt || list?.updated_at || now,
      source: "aha_concept_lists",
      local_only: true,
      meta: list && typeof list.meta === "object" && !Array.isArray(list.meta) ? list.meta : {},
      deletedAt: list?.deletedAt || list?.deleted_at || ""
    };
  }

  function loadConceptLists() {
    return asArray(loadRawByKey(CONCEPT_LISTS_KEY, [])).map(normalizeConceptList);
  }

  function saveConceptLists(lists) {
    localStorage.setItem(CONCEPT_LISTS_KEY, JSON.stringify(asArray(lists)));
    return asArray(lists);
  }

  function parseInitialTerms(value) {
    const raw = Array.isArray(value) ? value : String(value || "").split(",");
    const seen = new Set();
    return raw.map((term) => normalizeConceptTerm(term)).filter((term) => {
      const key = term.term.toLocaleLowerCase("no");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function createConceptList(input) {
    const title = asText(input?.title, "");
    if (!title) return null;
    const now = new Date().toISOString();
    const lists = loadConceptLists();
    const created = normalizeConceptList({
      id: uid("concept_list"),
      title,
      description: input?.description,
      terms: parseInitialTerms(input?.terms),
      relations: input?.relations,
      references: input?.references,
      meta: input?.meta,
      createdAt: now,
      updatedAt: now
    });
    lists.unshift(created);
    saveConceptLists(lists);
    return created;
  }

  function addConceptTerm(listId, input) {
    const term = normalizeConceptTerm(input);
    if (!term.term) return { ok: false, reason: "missing_term" };
    const lists = loadConceptLists();
    const index = lists.findIndex((list) => list.id === listId && !isUnavailableRecord(list));
    if (index < 0) return { ok: false, reason: "list_not_found" };
    const duplicate = lists[index].terms.some((item) => item.term.toLocaleLowerCase("no") === term.term.toLocaleLowerCase("no"));
    if (duplicate) return { ok: false, reason: "duplicate" };
    lists[index].terms.push(term);
    lists[index].updatedAt = new Date().toISOString();
    saveConceptLists(lists);
    return { ok: true, term, list: lists[index] };
  }

  function removeConceptTerm(listId, termId) {
    const lists = loadConceptLists();
    const index = lists.findIndex((list) => list.id === listId && !isUnavailableRecord(list));
    if (index < 0) return null;
    const next = lists[index].terms.filter((term) => term.id !== termId);
    if (next.length === lists[index].terms.length) return null;
    const removed = lists[index].terms.find((term) => term.id === termId);
    lists[index].terms = next;
    if (removed) lists[index].relations = lists[index].relations.filter((relation) => relation.from !== removed.term && relation.to !== removed.term);
    lists[index].updatedAt = new Date().toISOString();
    saveConceptLists(lists);
    return lists[index];
  }

  function addConceptRelation(listId, input) {
    const relation = normalizeConceptRelation(input);
    if (!relation) return { ok: false, reason: "invalid_relation" };
    const lists = loadConceptLists();
    const index = lists.findIndex((list) => list.id === listId && !isUnavailableRecord(list));
    if (index < 0) return { ok: false, reason: "list_not_found" };
    const termNames = new Set(lists[index].terms.map((term) => term.term));
    if (!termNames.has(relation.from) || !termNames.has(relation.to)) return { ok: false, reason: "term_not_found" };
    const duplicate = lists[index].relations.some((item) => item.from === relation.from && item.to === relation.to && item.type === relation.type);
    if (duplicate) return { ok: false, reason: "duplicate" };
    lists[index].relations.push(relation);
    lists[index].updatedAt = new Date().toISOString();
    saveConceptLists(lists);
    return { ok: true, relation, list: lists[index] };
  }

  function removeConceptRelation(listId, relationId) {
    const lists = loadConceptLists();
    const index = lists.findIndex((list) => list.id === listId && !isUnavailableRecord(list));
    if (index < 0) return null;
    const next = lists[index].relations.filter((relation) => relation.id !== relationId);
    if (next.length === lists[index].relations.length) return null;
    lists[index].relations = next;
    lists[index].updatedAt = new Date().toISOString();
    saveConceptLists(lists);
    return lists[index];
  }

  function deleteConceptList(id) {
    const lists = loadConceptLists();
    const index = lists.findIndex((list) => list.id === id);
    if (index < 0) return null;
    lists[index].deletedAt = new Date().toISOString();
    lists[index].updatedAt = lists[index].deletedAt;
    saveConceptLists(lists);
    return lists[index];
  }

  function loadLists() {
    const parsed = loadRawByKey(LISTS_KEY, []);
    return asArray(parsed).map((list) => normalizeList(list));
  }

  function saveLists(lists) {
    localStorage.setItem(LISTS_KEY, JSON.stringify(asArray(lists)));
    return asArray(lists);
  }

  async function persistList(list) {
    if (list?.meta?.createdBy === "aha_projection_materializer_v2") {
      return { ok: false, fallback: "localOnly", projection_artifact_local_only: true };
    }
    if (!isDatabaseSyncEnabled()) {
      return { ok: false, fallback: "localOnly", database_sync_disabled: true };
    }
    if (!global.AHARepository?.saveList) return { ok: false, fallback: "localOnly", repository_unavailable: true };
    try {
      return await global.AHARepository.saveList(list);
    } catch (error) {
      return { ok: false, error, fallback: "localOnly" };
    }
  }

  function listActionTime(list) {
    return [
      list?.deletedAt,
      list?.deleted_at,
      list?.updatedAt,
      list?.updated_at,
      list?.createdAt,
      list?.created_at
    ].reduce((latest, value) => {
      const time = Date.parse(value);
      return Number.isFinite(time) && time > latest ? time : latest;
    }, 0);
  }

  function normalizeRemoteList(remote) {
    const { created_at, updated_at, deleted_at, ...rest } = remote || {};
    const normalized = normalizeList({
      ...rest,
      createdAt: rest.createdAt || created_at,
      updatedAt: rest.updatedAt || updated_at,
      deletedAt: rest.deletedAt || deleted_at
    });
    return { ...rest, ...normalized };
  }

  function mergeLists(localLists, remoteLists) {
    const merged = new Map();
    [...asArray(localLists), ...asArray(remoteLists)].forEach((incoming) => {
      const list = normalizeList(incoming);
      const existing = merged.get(list.id);
      if (!existing || listActionTime(list) >= listActionTime(existing)) {
        merged.set(list.id, list);
      }
    });
    return [...merged.values()].sort((a, b) => listActionTime(b) - listActionTime(a));
  }

  async function pushLocalToDatabase(lists) {
    if (!isDatabaseSyncEnabled()) {
      return { ok: false, fallback: "localOnly", database_sync_disabled: true };
    }
    if (!global.AHARepository?.saveList) return { ok: false, fallback: "localOnly", repository_unavailable: true };
    return Promise.allSettled(asArray(lists).map((list) => {
      return Promise.resolve().then(() => global.AHARepository.saveList(list));
    }));
  }

  async function syncFromDatabase() {
    const localLists = loadLists();
    if (!isDatabaseSyncEnabled()) {
      return { ok: false, fallback: "localOnly", database_sync_disabled: true, data: localLists };
    }
    if (localLists.length) await pushLocalToDatabase(localLists);
    if (!global.AHARepository?.loadLists) {
      return { ok: false, fallback: "localStorage", data: localLists };
    }

    let result;
    try {
      result = await global.AHARepository.loadLists();
    } catch (error) {
      return { ok: false, error, fallback: "localStorage", data: localLists };
    }

    if (!result?.ok) return result || { ok: false };
    if (!Array.isArray(result.data)) {
      return { ...result, ok: false, fallback: "localStorage", data: localLists };
    }

    const remoteLists = result.data.map((remote) => normalizeRemoteList(remote));
    const merged = mergeLists(localLists, remoteLists);
    saveLists(merged);
    render();
    return { ...result, data: merged, merged: true };
  }

  function createList(input) {
    const now = new Date().toISOString();
    const current = loadLists();
    const created = normalizeList({
      id: uid("list"),
      title: asText(input?.title, ""),
      type: input?.type,
      description: asText(input?.description, ""),
      createdAt: now,
      updatedAt: now,
      tags: input?.tags,
      items: [],
      source: "aha_lists",
      local_only: true,
      published_external: false,
      echonet_shared: false,
      sync_enabled: false,
      meta: {
        createdBy: "lists_ui",
        local_only: true,
        published_external: false,
        echonet_shared: false,
        sync_enabled: false
      }
    });
    if (!created.title) return null;
    current.unshift(created);
    saveLists(current);
    persistList(created);
    return created;
  }

  function updateList(id, changes) {
    const lists = loadLists();
    const index = lists.findIndex((list) => list.id === id);
    if (index < 0) return null;
    const current = lists[index];
    const next = normalizeList({
      ...current,
      ...changes,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
      items: changes?.items !== undefined ? changes.items : current.items
    });
    lists[index] = next;
    saveLists(lists);
    persistList(next);
    return next;
  }

  function deleteList(id) {
    return updateList(id, { deletedAt: new Date().toISOString() });
  }

  function addItemToList(listId, itemInput) {
    const lists = loadLists();
    const index = lists.findIndex((list) => list.id === listId && !isDeletedRecord(list));
    if (index < 0) return { ok: false, reason: "list_not_found" };

    const list = lists[index];
    const validation = validateListReference(itemInput);
    if (!validation.ok) return { ok: false, reason: "invalid_reference", detail: validation.reason };

    const duplicate = list.items.some((it) => String(it.refId) === String(validation.item.refId) && String(it.source) === String(validation.item.source));
    if (duplicate) return { ok: false, reason: "duplicate", list };

    const item = normalizeListItem({
      ...validation.item,
      id: uid("list_item"),
      addedAt: new Date().toISOString(),
      meta: itemInput?.meta || validation.item.meta || {}
    }, listId);

    list.items.push(item);
    list.updatedAt = new Date().toISOString();
    lists[index] = list;
    saveLists(lists);
    persistList(list);
    return { ok: true, item, list };
  }

  function removeItemFromList(listId, itemId) {
    const lists = loadLists();
    const index = lists.findIndex((list) => list.id === listId && !isDeletedRecord(list));
    if (index < 0) return null;

    const list = lists[index];
    const nextItems = list.items.filter((item) => item.id !== itemId);
    if (nextItems.length === list.items.length) return null;

    list.items = nextItems;
    list.updatedAt = new Date().toISOString();
    lists[index] = list;
    saveLists(lists);
    persistList(list);
    return list;
  }

  function collectAvailableItems() {
    const out = [];

    const chamber = loadRawByKey(INSIGHTS_KEY, { insights: [] });
    asArray(chamber?.insights).forEach((insight, index) => {
      if (isUnavailableRecord(insight)) return;
      const refId = asText(insight?.id, `insight_idx_${index}`);
      out.push({
        id: `insight_${refId}`,
        title: asText(insight?.title || insight?.heading || insight?.label || insight?.summary || insight?.text, "Innsikt"),
        type: "insight",
        source: "aha_insights",
        refId,
        meta: { index }
      });
    });

    asArray(loadRawByKey(NOTES_KEY, [])).filter((note) => !isUnavailableRecord(note)).forEach((note) => {
      out.push({ id: `note_${note.id}`, title: asText(note?.title, "Notat"), type: "note", source: "aha_notes", refId: asText(note?.id, ""), meta: {} });
    });

    asArray(loadRawByKey(FEED_KEY, [])).filter((post) => !isUnavailableRecord(post)).forEach((post) => {
      const raw = asText(post?.text, "");
      const title = raw ? `${raw.slice(0, 60)}${raw.length > 60 ? "…" : ""}` : "Feed-post";
      out.push({ id: `feed_${post.id}`, title, type: "feed_post", source: "aha_feed", refId: asText(post?.id, ""), meta: {} });
    });

    asArray(loadRawByKey(GALLERY_KEY, [])).filter((item) => !isUnavailableRecord(item)).forEach((item) => {
      out.push({ id: `gallery_${item.id}`, title: asText(item?.title, "Galleriobjekt"), type: "gallery_item", source: "aha_gallery", refId: asText(item?.id, ""), meta: {} });
    });

    asArray(loadRawByKey(INSTA_KEY, [])).filter((post) => !isUnavailableRecord(post)).forEach((post) => {
      out.push({ id: `insta_${post.id}`, title: asText(post?.title || post?.caption, "Insta-post"), type: "insta_post", source: "aha_insta", refId: asText(post?.id, ""), meta: {} });
    });

    asArray(loadRawByKey(LISTS_KEY, [])).filter((list) => !isUnavailableRecord(list)).forEach((list) => {
      asArray(list?.items).filter((item) => item?.source === "aha_projection_v2" && item?.meta?.inline === true).forEach((item) => {
        out.push({
          id: asText(item?.id, `projection_${item?.refId}`),
          title: asText(item?.title || item?.meta?.snapshot?.title, "V2-innsikt"),
          type: asText(item?.type || item?.meta?.snapshot?.type, "insight"),
          source: "aha_projection_v2",
          refId: asText(item?.refId, ""),
          meta: item?.meta || {}
        });
      });
    });

    return out.filter((item) => item.refId);
  }

  function buildAvailableItemIndex(items = collectAvailableItems()) {
    const index = new Map();
    asArray(items).forEach((item) => {
      const source = asText(item?.source, "");
      const refId = asText(item?.refId || item?.ref_id, "");
      if (source && refId) index.set(`${source}::${refId}`, item);
    });
    return index;
  }

  function validateListReference(itemInput, availableItems = collectAvailableItems()) {
    const allowedSources = new Set(["aha_insights", "aha_notes", "aha_feed", "aha_gallery", "aha_insta", "aha_projection_v2"]);
    const source = asText(itemInput?.source, "");
    const refId = asText(itemInput?.refId || itemInput?.ref_id, "");
    if (!source) return { ok: false, reason: "missing_source" };
    if (!allowedSources.has(source)) return { ok: false, reason: "unknown_source" };
    if (!refId) return { ok: false, reason: "missing_refId" };
    if (source === "aha_projection_v2") {
      const snapshot = itemInput?.meta?.snapshot;
      if (itemInput?.meta?.inline !== true
        || itemInput?.meta?.immutable !== true
        || !asText(itemInput?.meta?.projection_id, "")
        || !asText(itemInput?.meta?.projection_artifact_id, "")
        || !asText(snapshot?.id, "")
        || !asText(snapshot?.title, "")
        || snapshot?.source !== "aha_semantic_v2") return { ok: false, reason: "incomplete_projection_snapshot" };
      return { ok: true, item: itemInput };
    }
    const item = buildAvailableItemIndex(availableItems).get(`${source}::${refId}`);
    if (!item) return { ok: false, reason: "source_missing" };
    if (isUnavailableRecord(item)) return { ok: false, reason: "source_unavailable" };
    if (!asText(item.title, "") || !asText(item.type, "") || !asText(item.source, "") || !asText(item.refId || item.ref_id, "")) {
      return { ok: false, reason: "incomplete_reference" };
    }
    return { ok: true, item };
  }

  function formatDate(value) {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return "Date unavailable";
    return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(time));
  }

  function listStatusLabel(list) {
    return asText(list?.status, "Local");
  }

  function renderOverviewCard(list, isSelected) {
    return `
      <article class="aha-panel aha-list-overview-card${isSelected ? " is-selected" : ""}" data-list-card="${escapeHtml(list.id)}">
        <div class="aha-list-header">
          <div>
            <p class="aha-list-card-kicker">${escapeHtml(listStatusLabel(list))} samling</p>
            <h3>${escapeHtml(list.title)}</h3>
          </div>
          <span class="aha-list-badge">${list.items.length} ${list.items.length === 1 ? "item" : "items"}</span>
        </div>
        <p class="aha-list-summary">${escapeHtml(list.description || "Ingen beskrivelse ennå.")}</p>
        <div class="aha-list-meta" aria-label="List metadata">
          <span>${escapeHtml(list.type)}</span>
          <span>Updated ${escapeHtml(formatDate(list.updatedAt || list.createdAt))}</span>
        </div>
        <button type="button" class="aha-tile-btn${isSelected ? " aha-tile-btn-primary" : ""}" data-list-select-preview="${escapeHtml(list.id)}" aria-pressed="${isSelected ? "true" : "false"}">
          ${isSelected ? "Valgt" : "Vis samling"}
        </button>
      </article>`;
  }

  function renderProjectionListPreviews() {
    const shell = document.getElementById("v2-list-preview-shell");
    const mount = document.getElementById("v2-list-previews");
    if (!shell || !mount) return;
    const model = global.AHAProjectionRuntimeSourceV2?.build?.();
    const candidates = model?.status === "ready" && model?.validation?.valid === true
      ? asArray(model?.surfaces?.lists)
      : [];
    shell.hidden = false;
    if (!candidates.length) {
      const state = model?.product_states?.list || {};
      const label = asText(state.label, "Trenger mer belegg");
      const reason = asText(state.reason, asArray(model?.blocking_reasons).length
        ? `Forslaget ble holdt tilbake: ${asArray(model.blocking_reasons).join(", ")}.`
        : "Den aktive analysen har ikke nok kvalitetssikret kildebelegg til et listeforslag.");
      mount.innerHTML = `<article class="aha-v2-list-preview-card aha-v2-preview-blocked"><div class="aha-list-header"><div><p class="aha-list-card-kicker">Produktstatus</p><h3>${escapeHtml(label)}</h3></div><span class="aha-list-badge">Ikke lagret</span></div><p>${escapeHtml(reason)}</p><div class="aha-list-meta"><span>Read-only</span><span>Ingen produktwrite</span></div></article>`;
      return;
    }
    mount.innerHTML = candidates.map((list) => {
      const score = Number(list?.quality?.score);
      const quality = Number.isFinite(score) ? `${Math.round(score * 100)} % kvalitetsport` : "Kvalitetsgodkjent";
      const items = asArray(list.items).map((item) => {
        const membershipReason = asText(item?.membership_reason || item?.meta?.membership_reason, "");
        return `<li><strong>${escapeHtml(item.title)}</strong>${membershipReason ? `<p class="aha-v2-membership-reason"><span>Medlemsgrunn:</span> ${escapeHtml(membershipReason)}</p>` : ""}</li>`;
      }).join("");
      const undoAvailable = global.AHAProjectionMaterializerV2?.canUndoMaterialized?.({ artifact_type: "list", artifact_id: list.id, projection_id: model.projection_id }) === true;
      return `<article class="aha-v2-list-preview-card" data-v2-list-preview="${escapeHtml(list.id)}">
        <div class="aha-list-header">
          <div><p class="aha-list-card-kicker">${escapeHtml(list.meta?.semantic_basis_label || "Semantisk sammenheng")}</p><h3>${escapeHtml(list.title)}</h3></div>
          <span class="aha-list-badge">${list.items.length} innsikter</span>
        </div>
        <p>${escapeHtml(list.description)}</p>
        <ul class="aha-v2-preview-items">${items}</ul>
        <div class="aha-list-meta"><span>${escapeHtml(quality)}</span><span>Ikke lagret</span><span>Read-only</span></div>
        <div class="aha-v2-materialize-actions">
          <button type="button" class="aha-tile-btn aha-tile-btn-primary" data-v2-list-materialize="${escapeHtml(list.id)}">Lagre som min liste</button>
          <button type="button" class="aha-tile-btn" data-v2-list-undo="${escapeHtml(list.id)}"${undoAvailable ? "" : " hidden"}>Angre lagring</button>
          <span class="module-meta" data-v2-list-materialize-status="${escapeHtml(list.id)}" aria-live="polite">Krever et eksplisitt klikk og lagres bare lokalt.</span>
        </div>
      </article>`;
    }).join("");
  }

  function renderSelectedPreview(list, allItems, groups) {
    if (!list) {
      return `<aside class="aha-panel aha-list-preview aha-list-preview-empty" aria-label="List preview">
        <p class="eyebrow">Forhåndsvisning av samling</p>
        <h2>Velg en samling</h2>
        <p>Velg en samling for å se objektene og detaljene.</p>
      </aside>`;
    }

    const options = allItems.map((item) => {
      return `<option value="${escapeHtml(item.source)}::${escapeHtml(item.refId)}">${escapeHtml(item.title)} (${escapeHtml(item.type)})</option>`;
    }).join("");
    const visibleItems = list.items.slice(0, 5);
    const itemsHtml = visibleItems.length
      ? visibleItems.map((item) => `
        <li class="aha-list-item-row">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <div class="module-meta">${escapeHtml(item.type)}${buildAvailableItemIndex(allItems).has(`${item.source}::${item.refId}`) ? "" : " · ikke lenger tilgjengelig"}</div>
          </div>
          <button type="button" class="aha-tile-btn" data-list-remove="${escapeHtml(list.id)}::${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.title)} from ${escapeHtml(list.title)}">Remove</button>
        </li>`).join("")
      : `<li class="aha-list-preview-empty-item">No items in this list yet.</li>`;
    const remainingCount = Math.max(0, list.items.length - visibleItems.length);

    return `<aside class="aha-panel aha-list-preview" aria-labelledby="list-preview-title">
      <div class="aha-list-header">
        <div>
          <p class="eyebrow">Forhåndsvisning av samling</p>
          <h2 id="list-preview-title" tabindex="-1">${escapeHtml(list.title)}</h2>
        </div>
        <button type="button" class="aha-tile-btn" data-list-preview-close aria-label="Close list preview">Close</button>
      </div>
      <p>${escapeHtml(list.description || "Ingen beskrivelse ennå.")}</p>
      <div class="aha-list-meta" aria-label="Selected list metadata">
        <span class="aha-list-badge">${escapeHtml(listStatusLabel(list))}</span>
        <span class="aha-list-badge">${list.items.length} ${list.items.length === 1 ? "item" : "items"}</span>
        <span>Created ${escapeHtml(formatDate(list.createdAt))}</span>
        <span>Updated ${escapeHtml(formatDate(list.updatedAt || list.createdAt))}</span>
      </div>
      <section aria-labelledby="list-preview-items-title">
        <h3 id="list-preview-items-title">Objekter</h3>
        <ul class="aha-list-items">${itemsHtml}</ul>
        ${remainingCount ? `<p class="module-meta">${remainingCount} more ${remainingCount === 1 ? "item" : "items"} not shown in this preview.</p>` : ""}
      </section>
      <details class="aha-list-manage">
        <summary>Administrer samling</summary>
        <div class="aha-list-manage-content">
          <div class="aha-list-add-row">
            <select data-list-select="${escapeHtml(list.id)}" aria-label="Choose an AHA item to add to ${escapeHtml(list.title)}">
              <option value="">Velg et objekt fra AHA</option>
              ${options}
            </select>
            <button type="button" data-list-add="${escapeHtml(list.id)}">Legg til objekt</button>
            <div class="statuslinje" data-list-action-status="${escapeHtml(list.id)}" aria-live="polite"></div>
          </div>
          <div class="aha-list-add-row">
            ${groups.length ? `
            <select class="gruppe-select" data-list-group-select="${escapeHtml(list.id)}" aria-label="Choose a group for ${escapeHtml(list.title)}">
              <option value="">Choose a group</option>
              ${groups.map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.title)}</option>`).join("")}
            </select>
            <button type="button" class="gruppe-knapp" data-list-add-group="${escapeHtml(list.id)}">Add list to group</button>
            <div class="statuslinje" data-list-group-status="${escapeHtml(list.id)}" aria-live="polite"></div>
            ` : `<p class="statuslinje">No groups yet. <a href="groups.html">Create a group first.</a></p>`}
          </div>
          <button type="button" class="aha-list-delete" data-list-delete="${escapeHtml(list.id)}">Slett samling</button>
        </div>
      </details>
    </aside>`;
  }

  function renderConceptLists() {
    const lists = loadConceptLists()
      .filter((list) => !isUnavailableRecord(list))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const mount = document.getElementById("concept-lists-list");
    const count = document.getElementById("concept-lists-count");
    const termsCount = document.getElementById("concept-terms-count");
    if (count) count.textContent = String(lists.length);
    if (termsCount) termsCount.textContent = String(lists.reduce((sum, list) => sum + list.terms.length, 0));
    if (!mount) return;

    if (!lists.length) {
      mount.innerHTML = `<article class="aha-panel aha-concept-list-card">
        <p class="eyebrow">Ingen begrepslister ennå</p>
        <h3>Start med et tema</h3>
        <p>Lag en liste med ord og begreper som hører sammen, for eksempel demokrati, valg og representasjon.</p>
      </article>`;
      return;
    }

    mount.innerHTML = lists.map((list) => {
      const terms = list.terms.length
        ? `<ul class="aha-concept-terms">${list.terms.map((term) => `<li class="aha-concept-term"><div class="aha-concept-term-main"><span><strong>${escapeHtml(term.term)}</strong>${term.definition ? `<span class="aha-concept-term-definition">${escapeHtml(term.definition)}</span>` : ""}</span><button type="button" class="aha-concept-term-remove" data-concept-term-remove="${escapeHtml(list.id)}::${escapeHtml(term.id)}" aria-label="Fjern ${escapeHtml(term.term)}">×</button></div></li>`).join("")}</ul>`
        : `<p class="module-meta">Listen er tom. Legg til det første begrepet nedenfor.</p>`;
      const relations = list.relations.length
        ? `<ul class="aha-concept-relations">${list.relations.map((relation) => `<li><span><strong>${escapeHtml(relation.from)}</strong> ${escapeHtml(relation.label)} <strong>${escapeHtml(relation.to)}</strong></span><button type="button" class="aha-concept-term-remove" data-concept-relation-remove="${escapeHtml(list.id)}::${escapeHtml(relation.id)}" aria-label="Fjern relasjon">×</button></li>`).join("")}</ul>`
        : `<p class="module-meta">Ingen relasjoner ennå.</p>`;
      const termOptions = list.terms.map((term) => `<option value="${escapeHtml(term.term)}">${escapeHtml(term.term)}</option>`).join("");
      return `<article class="aha-panel aha-concept-list-card" data-concept-list-card="${escapeHtml(list.id)}">
        <div class="aha-list-header"><div><p class="eyebrow">Begrepsliste</p><h3>${escapeHtml(list.title)}</h3></div><span class="aha-list-badge">${list.terms.length} ${list.terms.length === 1 ? "begrep" : "begreper"}</span></div>
        ${list.description ? `<p>${escapeHtml(list.description)}</p>` : ""}
        ${terms}
        <form class="aha-concept-add-form" data-concept-term-form="${escapeHtml(list.id)}">
          <label>Begrep<input name="term" required placeholder="Nytt begrep" /></label>
          <label>Kort forklaring<input name="definition" placeholder="Valgfri forklaring" /></label>
          <button type="submit">Legg til</button>
        </form>
        <details><summary>Relasjoner (${list.relations.length})</summary>${relations}
          ${list.terms.length >= 2 ? `<form class="aha-concept-add-form" data-concept-relation-form="${escapeHtml(list.id)}">
            <label>Fra<select name="from" required>${termOptions}</select></label>
            <label>Relasjon<input name="label" required value="relatert til" /></label>
            <label>Til<select name="to" required>${termOptions}</select></label>
            <button type="submit">Legg til relasjon</button>
          </form>` : ""}
        </details>
        <div class="aha-concept-list-actions"><span class="module-meta">Oppdatert ${escapeHtml(formatDate(list.updatedAt))}</span><button type="button" class="aha-list-delete" data-concept-list-delete="${escapeHtml(list.id)}">Slett liste</button></div>
      </article>`;
    }).join("");
  }

  function renderContent() {
    const rawDataset = localStorage.getItem(LISTS_KEY);
    const rawConceptDataset = localStorage.getItem(CONCEPT_LISTS_KEY);
    const datasetExists = rawDataset !== null || rawConceptDataset !== null;
    if (rawDataset !== null) JSON.parse(rawDataset);
    if (rawConceptDataset !== null) JSON.parse(rawConceptDataset);
    const lists = loadLists()
      .filter((list) => !isDeletedRecord(list))
      .sort((a, b) => listActionTime(b) - listActionTime(a));
    const groups = global.AHAGroups?.getActiveGroups ? asArray(global.AHAGroups.getActiveGroups()) : [];
    const allItems = collectAvailableItems();
    const statsLists = document.getElementById("lists-count");
    const statsItems = document.getElementById("list-items-count");
    const mount = document.getElementById("lists-list");

    if (statsLists) statsLists.textContent = String(lists.length);
    if (statsItems) statsItems.textContent = String(lists.reduce((sum, list) => sum + list.items.length, 0));
    if (!mount) return;

    global.AHAModules?.updatePageHealth?.("lists", global.AHAModules.localPageHealth({
      count: lists.length + loadConceptLists().filter((list) => !isUnavailableRecord(list)).length,
      datasetExists
    }));

    if (!lists.length) {
      selectedListId = "";
      mount.innerHTML = global.AHAModules.buildModuleEmptyState({
        type: "no_data",
        moduleId: "lists",
        title: "Ingen samlinger ennå.",
        message: "Lag en lokal samling for å samle innsikter, notater, feedposter, galleriobjekter eller Insta-poster.",
        hint: "Samlinger er lokale og deles ikke automatisk."
      });
      return;
    }

    const selected = lists.find((list) => list.id === selectedListId) || null;
    mount.innerHTML = `<div class="aha-lists-workspace">
      <section class="aha-list-overview" aria-labelledby="lists-overview-title">
        <div class="aha-list-section-heading">
          <div>
            <p class="eyebrow">Oversikt</p>
            <h2 id="lists-overview-title">Dine samlinger</h2>
          </div>
          <span>${lists.length} ${lists.length === 1 ? "list" : "lists"}</span>
        </div>
        <div class="aha-list-overview-grid">
          ${lists.map((list) => renderOverviewCard(list, list.id === selectedListId)).join("")}
        </div>
      </section>
      ${renderSelectedPreview(selected, allItems, groups)}
    </div>`;
  }

  function render() {
    try {
      renderProjectionListPreviews();
      renderConceptLists();
      renderContent();
    } catch {
      const mount = document.getElementById("lists-list");
      if (mount) mount.innerHTML = global.AHAModules.buildModuleEmptyState({ type: "read_error", moduleId: "lists", title: "Could not read list data.", message: "Try refreshing the page." });
      global.AHAModules?.updatePageHealth?.("lists", global.AHAModules.localPageHealth({ error: true }));
    }
  }

  function refresh() {
    render();
  }

  function bind() {
    document.getElementById("lists-refresh")?.addEventListener("click", refresh);

    document.getElementById("v2-list-previews")?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const artifactId = target.dataset.v2ListMaterialize;
      const undoId = target.dataset.v2ListUndo;
      const id = artifactId || undoId;
      if (!id) return;
      const status = document.querySelector(`[data-v2-list-materialize-status="${id}"]`);
      const undoButton = document.querySelector(`[data-v2-list-undo="${id}"]`);
      if (undoId) {
        const receipt = projectionReceipts.get(id);
        const model = global.AHAProjectionRuntimeSourceV2?.build?.();
        const result = receipt
          ? global.AHAProjectionMaterializerV2?.undo?.(receipt, { user_confirmed: true })
          : global.AHAProjectionMaterializerV2?.undoMaterialized?.({ artifact_type: "list", artifact_id: id, projection_id: model?.projection_id, user_confirmed: true });
        if (result?.ok) {
          projectionReceipts.delete(id);
          if (status instanceof HTMLElement) status.textContent = "Den lokale listen ble fjernet igjen.";
          if (undoButton instanceof HTMLElement) undoButton.hidden = true;
          renderContent();
        } else if (status instanceof HTMLElement) status.textContent = "Kunne ikke angre; listen kan ha blitt endret etter lagring.";
        return;
      }
      const model = global.AHAProjectionRuntimeSourceV2?.build?.();
      const result = global.AHAProjectionMaterializerV2?.materialize?.({
        model,
        artifact_type: "list",
        artifact_id: id,
        user_confirmed: true
      });
      if (!result?.ok) {
        if (status instanceof HTMLElement) status.textContent = "Kunne ikke lagre: forslaget besto ikke den kontrollerte write-grensen.";
        return;
      }
      if (result.receipt) projectionReceipts.set(id, result.receipt);
      if (status instanceof HTMLElement) status.textContent = result.existing ? "Listen finnes allerede lokalt." : "Listen er lagret lokalt. Ingen sync ble åpnet.";
      if (undoButton instanceof HTMLElement) undoButton.hidden = !result.receipt;
      renderContent();
    });

    document.getElementById("concept-list-create-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const title = document.getElementById("concept-list-title")?.value || "";
      const description = document.getElementById("concept-list-description")?.value || "";
      const terms = document.getElementById("concept-list-initial-terms")?.value || "";
      const created = createConceptList({ title, description, terms });
      if (!created) return;
      event.target.reset();
      render();
    });

    document.getElementById("concept-lists-list")?.addEventListener("submit", (event) => {
      const form = event.target?.closest?.("[data-concept-relation-form]");
      if (!form) return;
      event.preventDefault();
      const data = new FormData(form);
      const result = addConceptRelation(form.dataset.conceptRelationForm, { from: data.get("from"), to: data.get("to"), label: data.get("label"), type: "related_to" });
      if (result?.ok) render();
    });

    document.getElementById("concept-lists-list")?.addEventListener("submit", (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.dataset.conceptTermForm) return;
      event.preventDefault();
      const data = new FormData(form);
      const result = addConceptTerm(form.dataset.conceptTermForm, {
        term: data.get("term"),
        definition: data.get("definition")
      });
      if (!result?.ok) return;
      form.reset();
      render();
    });

    document.getElementById("concept-lists-list")?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.conceptListDelete) {
        deleteConceptList(target.dataset.conceptListDelete);
        render();
        return;
      }
      if (target.dataset.conceptTermRemove) {
        const [listId, termId] = target.dataset.conceptTermRemove.split("::");
        removeConceptTerm(listId, termId);
        render();
        return;
      }
      if (target.dataset.conceptRelationRemove) {
        const [listId, relationId] = target.dataset.conceptRelationRemove.split("::");
        removeConceptRelation(listId, relationId);
        render();
      }
    });

    document.getElementById("list-create-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const title = document.getElementById("list-title")?.value || "";
      const type = document.getElementById("list-type")?.value || "favorites";
      const description = document.getElementById("list-description")?.value || "";
      const tags = document.getElementById("list-tags")?.value || "";
      createList({ title, type, description, tags });
      event.target.reset();
      render();
    });

    document.getElementById("lists-list")?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const previewPayload = target.dataset.listSelectPreview;
      if (previewPayload) {
        selectedListId = previewPayload;
        render();
        document.getElementById("list-preview-title")?.focus?.();
        return;
      }

      if (target.hasAttribute("data-list-preview-close")) {
        selectedListId = "";
        render();
        return;
      }

      const deletePayload = target.dataset.listDelete;
      if (deletePayload) {
        deleteList(deletePayload);
        if (selectedListId === deletePayload) selectedListId = "";
        render();
        return;
      }

      const removePayload = target.dataset.listRemove;
      if (removePayload) {
        const [listId, itemId] = removePayload.split("::");
        removeItemFromList(listId, itemId);
        render();
        return;
      }

      const addPayload = target.dataset.listAdd;
      if (addPayload) {
        const select = document.querySelector(`[data-list-select="${addPayload}"]`);
        const status = document.querySelector(`[data-list-action-status="${addPayload}"]`);
        if (!(select instanceof HTMLSelectElement)) return;
        const value = select.value || "";
        if (!value) { if (status instanceof HTMLElement) status.textContent = "Velg et objekt først"; return; }
        const [source, refId] = value.split("::");
        const available = collectAvailableItems();
        const found = available.find((it) => it.source === source && String(it.refId) === String(refId));
        const result = addItemToList(addPayload, found || { source, refId });
        if (!result?.ok) {
          if (status instanceof HTMLElement) status.textContent = result?.reason === "duplicate" ? "Finnes allerede i listen" : "Kilden finnes ikke lenger";
          return;
        }
        select.value = "";
        render();
      }
      const addGroupPayload = target.dataset.listAddGroup;
      if (addGroupPayload) {
        const select = document.querySelector(`[data-list-group-select="${addGroupPayload}"]`);
        const status = document.querySelector(`[data-list-group-status="${addGroupPayload}"]`);
        if (!(select instanceof HTMLSelectElement) || !(status instanceof HTMLElement)) return;
        if (!select.value) { status.textContent = "Velg en gruppe først"; return; }
        const currentList = loadLists().find((list) => list.id === addGroupPayload && !isDeletedRecord(list));
        if (!currentList || !global.AHAGroups?.addReferenceToGroupByObject) return;
        const result = global.AHAGroups.addReferenceToGroupByObject(select.value, {
          title: currentList.title,
          type: "list",
          source: "aha_lists",
          refId: currentList.id
        });
        status.textContent = result?.references ? "Finnes allerede i gruppen" : (result ? "Lagt i gruppe" : "Kunne ikke legge til i gruppe.");
      }
    });

    render();
  }

  global.AHALists = {
    loadConceptLists,
    saveConceptLists,
    createConceptList,
    addConceptTerm,
    removeConceptTerm,
    addConceptRelation,
    removeConceptRelation,
    deleteConceptList,
    loadLists,
    saveLists,
    createList,
    updateList,
    deleteList,
    addItemToList,
    removeItemFromList,
    collectAvailableItems,
    buildAvailableItemIndex,
    validateListReference,
    renderProjectionListPreviews,
    syncFromDatabase,
    selectList(id) {
      selectedListId = asText(id, "");
      render();
    },
    render,
    refresh
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})(window);
