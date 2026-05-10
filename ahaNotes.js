// ahaNotes.js

(function () {
  "use strict";

  const KEY = "aha_notes_v1";

  function load() { try { const p = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(p) ? p : []; } catch { return []; } }
  function save(items) { localStorage.setItem(KEY, JSON.stringify(Array.isArray(items) ? items : [])); }
  function active(items) { return (Array.isArray(items) ? items : []).filter((n) => !n?.deleted_at); }
  function uid() { return `note_${Date.now()}_${Math.floor(Math.random() * 100000)}`; }

  function persistNote(note) { window.AHARepository?.saveNote?.(note).then((r) => { if (r?.ok === false && r.error) console.warn("AHANotes: database-save feilet", r.error); }); }
  function syncFromDatabase() { return Promise.resolve({ ok: false, fallback: "localStorage" }); }

  function escapeHtml(v) { return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }

  function render(source) {
    const mount = document.getElementById("notes-list"); if (!mount) return;
    const notes = active(Array.isArray(source) ? source : load());
    mount.innerHTML = notes.length ? notes.map((note) => `
      <article class="module-card" data-note-id="${escapeHtml(note.id)}">
        <h3>${escapeHtml(note.title || "Uten tittel")}</h3>
        <p>${escapeHtml(note.text || "")}</p>
        <div class="module-meta">${escapeHtml(note.created_at || "")}${note.last_source_event_id ? ` · source: ${escapeHtml(note.last_source_event_id)}` : ""}</div>
        <div class="module-actions">
          <button type="button" data-action="edit" data-id="${escapeHtml(note.id)}">Rediger</button>
          <button type="button" data-action="delete" data-id="${escapeHtml(note.id)}">Slett</button>
        </div>
      </article>`).join("") : "<p>Ingen notater ennå.</p>";
  }

  function ingestForNote(note, sourceType) {
    return window.AHAIngest?.ingest?.({ source_type: sourceType, source_app: "aha_notes", content_type: "text", title: note.title, text: note.text, user_created: true, imported: false, created_at: note.updated_at || note.created_at, meta: { note_id: note.id, note_updated_at: note.updated_at || null } }) || null;
  }

  function addNote(input) {
    const note = { id: uid(), title: String(input.title || "").trim(), text: String(input.text || "").trim(), tags: Array.isArray(input.tags) ? input.tags : [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null, last_source_event_id: null };
    if (!note.title && !note.text) return null;
    const res = ingestForNote(note, "note");
    if (res?.sourceEvent?.id) note.last_source_event_id = res.sourceEvent.id;
    const notes = load(); notes.unshift(note); save(notes); persistNote(note); render(notes); return note;
  }

  function updateNote(id, changes) {
    const notes = load(); const i = notes.findIndex((n) => n.id === id && !n.deleted_at); if (i < 0) return null;
    notes[i] = { ...notes[i], title: String(changes.title || "").trim(), text: String(changes.text || "").trim(), updated_at: new Date().toISOString() };
    const res = ingestForNote(notes[i], "note_edit"); if (res?.sourceEvent?.id) notes[i].last_source_event_id = res.sourceEvent.id;
    save(notes); persistNote(notes[i]); render(notes); return notes[i];
  }

  function deleteNote(id) {
    const notes = load(); const i = notes.findIndex((n) => n.id === id && !n.deleted_at); if (i < 0) return false;
    notes[i] = { ...notes[i], deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    save(notes); persistNote(notes[i]); render(notes); return true;
  }

  function bind() {
    const form = document.getElementById("note-form"); if (!form) return;
    const title = document.getElementById("note-title"); const text = document.getElementById("note-text");
    let editingId = null;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (editingId) {
        updateNote(editingId, { title: title?.value, text: text?.value });
        editingId = null;
        const btn = form.querySelector('button[type="submit"]'); if (btn) btn.textContent = "Lagre notat";
      } else {
        addNote({ title: title?.value, text: text?.value });
      }
      if (title) title.value = ""; if (text) text.value = "";
    });

    document.getElementById("notes-list")?.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-action][data-id]"); if (!btn) return;
      const id = btn.dataset.id; const action = btn.dataset.action;
      const note = load().find((n) => n.id === id && !n.deleted_at); if (!note) return;
      if (action === "delete") deleteNote(id);
      if (action === "edit") {
        editingId = id; if (title) title.value = note.title || ""; if (text) text.value = note.text || "";
        const sbtn = form.querySelector('button[type="submit"]'); if (sbtn) sbtn.textContent = "Oppdater notat";
      }
    });

    render();
  }

  window.AHANotes = { load, save, syncFromDatabase, addNote, updateNote, deleteNote, render };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind); else bind();
})();
