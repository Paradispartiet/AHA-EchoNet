// ahaLists.js
// Fase 3B: første fungerende AHA-lister modul (localStorage-first).

(function (global) {
  "use strict";

  const LISTS_KEY = "aha_lists_v1";
  const INSIGHTS_KEY = "aha_insight_chamber_v1";
  const NOTES_KEY = "aha_notes_v1";
  const FEED_KEY = "aha_feed_posts_v1";
  const GALLERY_KEY = "aha_gallery_v1";
  const INSTA_KEY = "aha_insta_posts_v1";

  const ALLOWED_TYPES = ["favorites", "todo", "concepts", "process", "quality", "ai", "shared_later"];
  let selectedListId = "";

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

  function isDeletedRecord(record) {
    return Boolean(record?.deletedAt || record?.deleted_at);
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
      meta: list && typeof list.meta === "object" && !Array.isArray(list.meta) ? list.meta : {},
      deletedAt: list?.deletedAt || list?.deleted_at || ""
    };
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
    if (!global.AHARepository?.saveList) return null;
    try {
      return await global.AHARepository.saveList(list);
    } catch (error) {
      return { ok: false, error };
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
    if (!global.AHARepository?.saveList) return null;
    return Promise.allSettled(asArray(lists).map((list) => {
      return Promise.resolve().then(() => global.AHARepository.saveList(list));
    }));
  }

  async function syncFromDatabase() {
    const localLists = loadLists();
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
      meta: { createdBy: "lists_ui" }
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
    if (index < 0) return null;

    const list = lists[index];
    const refId = asText(itemInput?.refId || itemInput?.ref_id, "");
    if (!refId) return null;

    const duplicate = list.items.some((it) => String(it.refId) === refId && String(it.source) === String(itemInput?.source));
    if (duplicate) return list;

    const item = normalizeListItem({
      id: uid("list_item"),
      title: itemInput?.title,
      type: itemInput?.type,
      source: itemInput?.source,
      refId,
      addedAt: new Date().toISOString(),
      meta: itemInput?.meta || {}
    }, listId);

    list.items.push(item);
    list.updatedAt = new Date().toISOString();
    lists[index] = list;
    saveLists(lists);
    persistList(list);
    return item;
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
      if (isDeletedRecord(insight)) return;
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

    asArray(loadRawByKey(NOTES_KEY, [])).filter((note) => !isDeletedRecord(note)).forEach((note) => {
      out.push({ id: `note_${note.id}`, title: asText(note?.title, "Notat"), type: "note", source: "aha_notes", refId: asText(note?.id, ""), meta: {} });
    });

    asArray(loadRawByKey(FEED_KEY, [])).filter((post) => !isDeletedRecord(post)).forEach((post) => {
      const raw = asText(post?.text, "");
      const title = raw ? `${raw.slice(0, 60)}${raw.length > 60 ? "…" : ""}` : "Feed-post";
      out.push({ id: `feed_${post.id}`, title, type: "feed_post", source: "aha_feed", refId: asText(post?.id, ""), meta: {} });
    });

    asArray(loadRawByKey(GALLERY_KEY, [])).filter((item) => !isDeletedRecord(item)).forEach((item) => {
      out.push({ id: `gallery_${item.id}`, title: asText(item?.title, "Galleriobjekt"), type: "gallery_item", source: "aha_gallery", refId: asText(item?.id, ""), meta: {} });
    });

    asArray(loadRawByKey(INSTA_KEY, [])).filter((post) => !isDeletedRecord(post)).forEach((post) => {
      out.push({ id: `insta_${post.id}`, title: asText(post?.title || post?.caption, "Insta-post"), type: "insta_post", source: "aha_insta", refId: asText(post?.id, ""), meta: {} });
    });

    return out.filter((item) => item.refId);
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
            <p class="aha-list-card-kicker">${escapeHtml(listStatusLabel(list))} list</p>
            <h3>${escapeHtml(list.title)}</h3>
          </div>
          <span class="aha-list-badge">${list.items.length} ${list.items.length === 1 ? "item" : "items"}</span>
        </div>
        <p class="aha-list-summary">${escapeHtml(list.description || "No description yet.")}</p>
        <div class="aha-list-meta" aria-label="List metadata">
          <span>${escapeHtml(list.type)}</span>
          <span>Updated ${escapeHtml(formatDate(list.updatedAt || list.createdAt))}</span>
        </div>
        <button type="button" class="aha-tile-btn${isSelected ? " aha-tile-btn-primary" : ""}" data-list-select-preview="${escapeHtml(list.id)}" aria-pressed="${isSelected ? "true" : "false"}">
          ${isSelected ? "Selected" : "View details"}
        </button>
      </article>`;
  }

  function renderSelectedPreview(list, allItems, groups) {
    if (!list) {
      return `<aside class="aha-panel aha-list-preview aha-list-preview-empty" aria-label="List preview">
        <p class="eyebrow">List preview</p>
        <h2>Select a list</h2>
        <p>Choose a list from the overview to see its items and details.</p>
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
            <div class="module-meta">${escapeHtml(item.type)}</div>
          </div>
          <button type="button" class="aha-tile-btn" data-list-remove="${escapeHtml(list.id)}::${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.title)} from ${escapeHtml(list.title)}">Remove</button>
        </li>`).join("")
      : `<li class="aha-list-preview-empty-item">No items in this list yet.</li>`;
    const remainingCount = Math.max(0, list.items.length - visibleItems.length);

    return `<aside class="aha-panel aha-list-preview" aria-labelledby="list-preview-title">
      <div class="aha-list-header">
        <div>
          <p class="eyebrow">List preview</p>
          <h2 id="list-preview-title" tabindex="-1">${escapeHtml(list.title)}</h2>
        </div>
        <button type="button" class="aha-tile-btn" data-list-preview-close aria-label="Close list preview">Close</button>
      </div>
      <p>${escapeHtml(list.description || "No description yet.")}</p>
      <div class="aha-list-meta" aria-label="Selected list metadata">
        <span class="aha-list-badge">${escapeHtml(listStatusLabel(list))}</span>
        <span class="aha-list-badge">${list.items.length} ${list.items.length === 1 ? "item" : "items"}</span>
        <span>Created ${escapeHtml(formatDate(list.createdAt))}</span>
        <span>Updated ${escapeHtml(formatDate(list.updatedAt || list.createdAt))}</span>
      </div>
      <section aria-labelledby="list-preview-items-title">
        <h3 id="list-preview-items-title">Items</h3>
        <ul class="aha-list-items">${itemsHtml}</ul>
        ${remainingCount ? `<p class="module-meta">${remainingCount} more ${remainingCount === 1 ? "item" : "items"} not shown in this preview.</p>` : ""}
      </section>
      <details class="aha-list-manage">
        <summary>Manage list</summary>
        <div class="aha-list-manage-content">
          <div class="aha-list-add-row">
            <select data-list-select="${escapeHtml(list.id)}" aria-label="Choose an AHA item to add to ${escapeHtml(list.title)}">
              <option value="">Choose an item from AHA modules</option>
              ${options}
            </select>
            <button type="button" data-list-add="${escapeHtml(list.id)}">Add item</button>
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
          <button type="button" class="aha-list-delete" data-list-delete="${escapeHtml(list.id)}">Delete list</button>
        </div>
      </details>
    </aside>`;
  }

  function renderContent() {
    const rawDataset = localStorage.getItem(LISTS_KEY);
    const datasetExists = rawDataset !== null;
    if (datasetExists) JSON.parse(rawDataset);
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
      count: lists.length,
      datasetExists
    }));

    if (!lists.length) {
      selectedListId = "";
      mount.innerHTML = global.AHAModules.buildModuleEmptyState({
        type: "no_data",
        moduleId: "lists",
        message: "Lists will appear here when available.",
        hint: "Use Create list above when you are ready."
      });
      return;
    }

    const selected = lists.find((list) => list.id === selectedListId) || null;
    mount.innerHTML = `<div class="aha-lists-workspace">
      <section class="aha-list-overview" aria-labelledby="lists-overview-title">
        <div class="aha-list-section-heading">
          <div>
            <p class="eyebrow">Overview</p>
            <h2 id="lists-overview-title">Your lists</h2>
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
        if (!(select instanceof HTMLSelectElement)) return;
        const value = select.value || "";
        if (!value) return;
        const [source, refId] = value.split("::");
        const available = collectAvailableItems();
        const found = available.find((it) => it.source === source && String(it.refId) === String(refId));
        if (!found) return;
        addItemToList(addPayload, found);
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
    loadLists,
    saveLists,
    createList,
    updateList,
    deleteList,
    addItemToList,
    removeItemFromList,
    collectAvailableItems,
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
