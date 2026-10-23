// AHA Meet: private meeting journal in this browser only.
// No social coordination, invites, analytics, background ingest or network.
(function (global) {
  "use strict";

  const KEY = "aha_meet_journal_v1";
  const MAX_ITEMS = 250;
  const KINDS = Object.freeze({ meeting: "Møte", visit: "Besøk", activity: "Aktivitet" });
  const byId = (id) => global.document?.getElementById(id);
  const text = (value) => String(value ?? "").trim();
  const safeDate = (value) => {
    const date = text(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(date + "T12:00:00Z");
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  };
  const today = () => {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  };

  function normalizeEntry(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const title = text(raw.title).slice(0, 120);
    const date = text(raw.date);
    if (!title || !safeDate(date)) return null;
    const kind = Object.hasOwn(KINDS, raw.kind) ? raw.kind : "meeting";
    return {
      id: text(raw.id).slice(0, 100),
      title, date, kind,
      notes: text(raw.notes).slice(0, 3000),
      takeaway: text(raw.takeaway).slice(0, 1000),
      createdAt: text(raw.createdAt),
      updatedAt: text(raw.updatedAt),
      local_only: true
    };
  }

  function load() {
    let parsed;
    try { parsed = JSON.parse(global.localStorage?.getItem(KEY) || "[]"); }
    catch { return []; }
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    return parsed.slice(0, MAX_ITEMS).map(normalizeEntry).filter((entry) => {
      if (!entry || !entry.id || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
  }

  function store(entries) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(entries));
      return { ok: true };
    } catch {
      return { ok: false, reason: "Kunne ikke lagre lokalt. Kontroller lagringsplass eller privat nettlesermodus." };
    }
  }

  function save(input) {
    const title = text(input?.title);
    const date = text(input?.date);
    if (title.length < 2 || title.length > 120) return { ok: false, reason: "Tittelen må ha 2–120 tegn." };
    if (!safeDate(date)) return { ok: false, reason: "Velg en gyldig møtedato." };
    if (text(input?.notes).length > 3000 || text(input?.takeaway).length > 1000) {
      return { ok: false, reason: "Notater eller læringspunkt er for langt." };
    }
    const entries = load();
    const requestedId = text(input?.id);
    const index = requestedId ? entries.findIndex((entry) => entry.id === requestedId) : -1;
    if (requestedId && index < 0) return { ok: false, reason: "Møtet finnes ikke lenger." };
    if (index < 0 && entries.length >= MAX_ITEMS) return { ok: false, reason: "Arkivet har nådd grensen på 250 møtenotater. Eksporter og rydd før du legger til flere." };
    const now = new Date().toISOString();
    const id = index >= 0 ? requestedId : "meet_" + (global.crypto?.randomUUID?.() || Date.now().toString(36) + "_" + Math.random().toString(36).slice(2));
    const item = normalizeEntry({
      id, title, date, kind: input?.kind,
      notes: input?.notes, takeaway: input?.takeaway,
      createdAt: index >= 0 ? entries[index].createdAt : now, updatedAt: now
    });
    if (index >= 0) entries[index] = item;
    else entries.unshift(item);
    const result = store(entries);
    return result.ok ? { ok: true, item } : result;
  }

  function remove(id) {
    const entries = load();
    const next = entries.filter((entry) => entry.id !== id);
    if (next.length === entries.length) return { ok: false, reason: "Fant ikke møtet." };
    return store(next);
  }

  function getFiltered(query = "") {
    const needle = text(query).toLocaleLowerCase("no");
    return load()
      .filter((entry) => !needle || [entry.title, entry.notes, entry.takeaway, KINDS[entry.kind]]
        .some((value) => value.toLocaleLowerCase("no").includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  }

  function node(tag, value, className) {
    const el = global.document.createElement(tag);
    if (value != null) el.textContent = value;
    if (className) el.className = className;
    return el;
  }

  function notify(message) {
    const el = byId("meet-status");
    if (el) el.textContent = message;
  }

  function render() {
    const list = byId("meet-list");
    if (!list) return;
    list.replaceChildren();
    const entries = getFiltered(byId("meet-search")?.value);
    const count = byId("meet-count");
    if (count) count.textContent = entries.length + " av " + load().length + " lokale notater";
    if (!entries.length) {
      list.append(node("p", load().length ? "Ingen notater passer søket." : "Ingen møtenotater ennå. Opprett ditt første notat i skjemaet.", "meet-empty"));
      return;
    }
    const fragment = global.document.createDocumentFragment();
    entries.forEach((entry) => {
      const card = node("article", null, "meet-card");
      const head = node("div", null, "meet-card-header");
      const heading = node("h3", entry.title);
      const time = node("time", entry.date + " · " + KINDS[entry.kind]);
      time.dateTime = entry.date;
      head.append(heading, time);
      card.append(head);
      if (entry.notes) card.append(node("p", entry.notes, "meet-notes"));
      if (entry.takeaway) {
        const learning = node("div", null, "meet-learning");
        learning.append(node("strong", "Dette tar jeg med meg"), node("p", entry.takeaway));
        card.append(learning);
      }
      const actions = node("div", null, "meet-actions");
      const edit = node("button", "Rediger");
      edit.type = "button";
      edit.dataset.meetEdit = entry.id;
      const del = node("button", "Slett");
      del.type = "button";
      del.dataset.meetDelete = entry.id;
      del.className = "meet-delete";
      actions.append(edit, del);
      card.append(actions);
      fragment.append(card);
    });
    list.append(fragment);
  }

  function clearForm() {
    const form = byId("meet-form");
    if (!form) return;
    form.reset();
    byId("meet-id").value = "";
    byId("meet-date").value = today();
    byId("meet-form-title").textContent = "Nytt møtenotat";
    byId("meet-save").textContent = "Lagre notat";
    byId("meet-cancel").hidden = true;
  }

  function openForEdit(entry) {
    if (!entry) return;
    byId("meet-id").value = entry.id;
    byId("meet-title").value = entry.title;
    byId("meet-date").value = entry.date;
    byId("meet-kind").value = entry.kind;
    byId("meet-notes").value = entry.notes;
    byId("meet-takeaway").value = entry.takeaway;
    byId("meet-form-title").textContent = "Rediger møtenotat";
    byId("meet-save").textContent = "Lagre endringer";
    byId("meet-cancel").hidden = false;
    byId("meet-form").scrollIntoView?.({ behavior: "smooth", block: "start" });
    byId("meet-title").focus();
  }

  function exportJson() {
    const data = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), localOnly: true, entries: load() }, null, 2);
    const url = global.URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const anchor = node("a");
    anchor.href = url;
    anchor.download = "aha-meet-notater.json";
    anchor.click();
    global.setTimeout(() => global.URL.revokeObjectURL(url), 1000);
    notify("Arkivet er eksportert som JSON. Oppbevar filen privat.");
  }

  function init() {
    if (!byId("meet-form")) return;
    clearForm();
    render();
    byId("meet-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const result = save({
        id: byId("meet-id").value,
        title: byId("meet-title").value,
        date: byId("meet-date").value,
        kind: byId("meet-kind").value,
        notes: byId("meet-notes").value,
        takeaway: byId("meet-takeaway").value
      });
      notify(result.ok ? "Møtenotatet er lagret i denne nettleseren." : result.reason);
      if (result.ok) { clearForm(); render(); }
    });
    byId("meet-cancel").addEventListener("click", () => { clearForm(); notify("Redigering avbrutt."); });
    byId("meet-search").addEventListener("input", render);
    byId("meet-export").addEventListener("click", () => {
      try { exportJson(); }
      catch { notify("Kunne ikke eksportere notatene."); }
    });
    byId("meet-list").addEventListener("click", (event) => {
      const button = event.target.closest?.("button");
      if (!button) return;
      const entry = load().find((item) => item.id === (button.dataset.meetEdit || button.dataset.meetDelete));
      if (!entry) { notify("Møtenotatet finnes ikke lenger."); render(); return; }
      if (button.dataset.meetEdit) { openForEdit(entry); return; }
      if (button.dataset.meetDelete && global.confirm("Slette «" + entry.title + "» fra dette lokale arkivet?")) {
        const result = remove(entry.id);
        notify(result.ok ? "Notatet er slettet." : result.reason);
        if (result.ok) {
          if (byId("meet-id").value === entry.id) clearForm();
          render();
        }
      }
    });
  }

  global.AHAMeet = Object.freeze({ KEY, normalizeEntry, load, save, remove, getFiltered, render, init });
  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", init);
  else if (global.document) init();
})(typeof window !== "undefined" ? window : globalThis);
