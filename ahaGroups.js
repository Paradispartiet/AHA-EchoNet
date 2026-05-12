// ahaGroups.js
// Fase 4A: første fungerende lokale Grupper / Sirkler-modul (localStorage-first).

(function (global) {
  "use strict";

  const GROUPS_KEY = "aha_groups_v1";
  const PRIVACY_KEY = "aha_privacy_settings_v1";

  const ALLOWED_GROUP_TYPES = ["circle", "project", "learning", "publishing", "historygo", "private"];
  const ALLOWED_MEMBER_ROLES = ["owner", "editor", "member", "observer"];
  const ALLOWED_MEMBER_STATUS = ["local", "invited_later", "inactive"];

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
      meta: asObject(src.meta)
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
      refId: asText(src.refId || src.ref_id, ""),
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
      meta: asObject(src.meta),
      deletedAt: src.deletedAt || src.deleted_at || ""
    };
  }

  function loadGroups() {
    return asArray(safeParse(localStorage.getItem(GROUPS_KEY) || "[]", [])).map((g) => normalizeGroup(g));
  }

  function saveGroups(groups) {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(asArray(groups)));
    return asArray(groups);
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
      meta: { createdBy: "groups_ui" }
    });
    groups.unshift(group);
    saveGroups(groups);
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
    return next;
  }

  function deleteGroup(id) {
    return updateGroup(id, { deletedAt: new Date().toISOString() });
  }

  function addMemberToGroup(groupId, memberInput) {
    const groups = loadGroups();
    const idx = groups.findIndex((g) => g.id === groupId && !g.deletedAt);
    if (idx < 0) return null;
    const group = groups[idx];
    const name = asText(memberInput?.name, "");
    if (!name) return null;

    const duplicate = group.members.some((m) => m.name.toLowerCase() === name.toLowerCase() && m.role === (memberInput?.role || "member"));
    if (duplicate) return group;

    group.members.push(normalizeMember({ ...memberInput, id: uid("group_member"), name, status: memberInput?.status || "local" }));
    group.updatedAt = new Date().toISOString();
    groups[idx] = normalizeGroup(group);
    saveGroups(groups);
    return group.members[group.members.length - 1];
  }

  function removeMemberFromGroup(groupId, memberId) {
    const groups = loadGroups();
    const idx = groups.findIndex((g) => g.id === groupId && !g.deletedAt);
    if (idx < 0) return null;
    const group = groups[idx];
    const next = group.members.filter((m) => m.id !== memberId);
    if (next.length === group.members.length) return null;
    group.members = next;
    group.updatedAt = new Date().toISOString();
    groups[idx] = normalizeGroup(group);
    saveGroups(groups);
    return group;
  }

  function addReferenceToGroup(groupId, referenceInput) {
    const groups = loadGroups();
    const idx = groups.findIndex((g) => g.id === groupId && !g.deletedAt);
    if (idx < 0) return null;
    const group = groups[idx];

    const candidate = normalizeReference({ ...referenceInput, id: uid("group_ref") });
    if (!candidate.source || !candidate.refId) return null;

    const duplicate = group.references.some((ref) => ref.source === candidate.source && ref.refId === candidate.refId);
    if (duplicate) return group;

    group.references.push(candidate);
    group.updatedAt = new Date().toISOString();
    groups[idx] = normalizeGroup(group);
    saveGroups(groups);
    return candidate;
  }

  function removeReferenceFromGroup(groupId, referenceId) {
    const groups = loadGroups();
    const idx = groups.findIndex((g) => g.id === groupId && !g.deletedAt);
    if (idx < 0) return null;
    const group = groups[idx];
    const next = group.references.filter((ref) => ref.id !== referenceId);
    if (next.length === group.references.length) return null;
    group.references = next;
    group.updatedAt = new Date().toISOString();
    groups[idx] = normalizeGroup(group);
    saveGroups(groups);
    return group;
  }

  function collectFromInsightChamber(out) {
    const chamber = asObject(safeParse(localStorage.getItem("aha_insight_chamber_v1") || "{}", {}));
    asArray(chamber.insights).forEach((item, index) => {
      if (item?.deletedAt || item?.deleted_at) return;
      const refId = asText(item?.id, `insight_idx_${index}`);
      out.push({ title: asText(item?.title || item?.heading || item?.label || item?.summary || item?.text, "Innsikt"), type: "insight", source: "aha_insights", refId });
    });
  }

  function collectFromArrayKey(storageKey, type, source, titleReader) {
    const arr = asArray(safeParse(localStorage.getItem(storageKey) || "[]", []));
    return arr
      .filter((item) => !item?.deletedAt && !item?.deleted_at)
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
    out.push(...collectFromArrayKey("aha_articles_v1", "article", "aha_articles", (item) => item?.title || "Artikkel"));
    out.push(...collectFromArrayKey("aha_notes_v1", "note", "aha_notes", (item) => item?.title || item?.text || "Notat"));
    out.push(...collectFromArrayKey("aha_feed_posts_v1", "feed_post", "aha_feed", (item) => item?.text || item?.title || "Feed-post"));
    return out;
  }

  function loadPrivacySettings() {
    return asObject(safeParse(localStorage.getItem(PRIVACY_KEY) || "{}", {}));
  }

  function render() {
    const root = document.getElementById("groups-root");
    if (!root) return;

    const groups = loadGroups().filter((group) => !group.deletedAt);
    const references = collectAvailableGroupReferences();
    const privacy = loadPrivacySettings();

    const memberCount = groups.reduce((sum, g) => sum + g.members.length, 0);
    const referenceCount = groups.reduce((sum, g) => sum + g.references.length, 0);

    const privacyText = privacy.allowSocialSharing
      ? "Sosial deling er tillatt lokalt, men ekte deling er ikke bygget ennå."
      : "Sosial deling er av. Dette er kun lokal gruppeplanlegging.";

    root.innerHTML = `
      <section class="aha-panel">
        <p class="eyebrow">Fase 4A</p>
        <h1>Grupper / Sirkler</h1>
        <p>Lokale grupperom for delte innsikter, lister, stier og utkast. Ekte deling kommer senere.</p>
        <p class="groups-privacy-note">${escapeHtml(privacyText)}</p>
        <div class="aha-tile-actions">
          <a class="aha-tile-btn aha-tile-btn-primary" href="index.html">Tilbake til AHA Home</a>
          <button type="button" class="aha-tile-btn" id="groups-refresh-btn">Oppdater</button>
        </div>
      </section>

      <section class="aha-panel groups-create-panel">
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

      <section class="groups-card-list">
        ${groups.map((group) => `
          <article class="aha-panel groups-card" data-group-id="${escapeHtml(group.id)}">
            <header>
              <h3>${escapeHtml(group.title)}</h3>
              <div class="groups-badges"><span class="groups-badge">${escapeHtml(group.type)}</span></div>
            </header>
            <p>${escapeHtml(group.description || "Ingen beskrivelse")}</p>
            <p>Tags: ${group.tags.length ? group.tags.map((tag) => `<span class="groups-tag">${escapeHtml(tag)}</span>`).join(" ") : "Ingen"}</p>
            <p>Opprettet: ${escapeHtml(group.createdAt)} · Oppdatert: ${escapeHtml(group.updatedAt)}</p>
            <p>Medlemmer: ${escapeHtml(String(group.members.length))} · Referanser: ${escapeHtml(String(group.references.length))}</p>
            <button type="button" class="aha-tile-btn" data-action="delete-group" data-group-id="${escapeHtml(group.id)}">Slett gruppe</button>

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
                <select name="referenceKey">
                  <option value="">Velg objekt</option>
                  ${references.map((ref, index) => `<option value="${escapeHtml(String(index))}">${escapeHtml(`${ref.title} (${ref.type} · ${ref.source})`)}</option>`).join("")}
                </select>
                <button type="submit">Legg til referanse</button>
              </form>
            </section>
          </article>
        `).join("")}
      </section>
    `;

    bindEvents(references);
  }

  function bindEvents(availableReferences) {
    const refreshBtn = document.getElementById("groups-refresh-btn");
    if (refreshBtn) refreshBtn.addEventListener("click", refresh);

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
        addMemberToGroup(form.getAttribute("data-group-id"), {
          name: formData.get("memberName"),
          role: formData.get("memberRole"),
          status: "local"
        });
        form.reset();
        refresh();
      });
    });

    document.querySelectorAll('form[data-action="add-reference"]').forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const idx = Number(formData.get("referenceKey"));
        if (!Number.isFinite(idx) || !availableReferences[idx]) return;
        addReferenceToGroup(form.getAttribute("data-group-id"), availableReferences[idx]);
        form.reset();
        refresh();
      });
    });
  }

  function refresh() { render(); }

  global.AHAGroups = {
    loadGroups,
    saveGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    addMemberToGroup,
    removeMemberFromGroup,
    addReferenceToGroup,
    removeReferenceFromGroup,
    collectAvailableGroupReferences,
    render,
    refresh
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})(window);
