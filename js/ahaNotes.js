// ahaNotes.js

(function () {
  "use strict";

  const KEY = "aha_notes_v1";

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function save(items) {
    localStorage.setItem(KEY, JSON.stringify(Array.isArray(items) ? items : []));
  }

  function noteActionTime(note) {
    return Math.max(
      ...[note?.deleted_at, note?.updated_at, note?.created_at]
        .map((value) => Date.parse(value || ""))
        .filter((value) => Number.isFinite(value)),
      0
    );
  }

  function mergeNotes(localNotes, remoteNotes) {
    const merged = new Map();
    const mergeIncoming = (note) => {
      if (!note?.id) return;
      const key = String(note.id);
      const existing = merged.get(key);
      if (!existing || noteActionTime(note) >= noteActionTime(existing)) {
        merged.set(key, note);
      }
    };

    (Array.isArray(localNotes) ? localNotes : []).forEach(mergeIncoming);
    (Array.isArray(remoteNotes) ? remoteNotes : []).forEach(mergeIncoming);

    return Array.from(merged.values()).sort((a, b) => noteActionTime(b) - noteActionTime(a));
  }

  async function pushLocalToDatabase(items) {
    if (!window.AHARepository?.saveNote) return { ok: false, fallback: "localStorage" };
    const results = [];
    for (const note of items) {
      results.push(await window.AHARepository.saveNote(note));
    }
    return { ok: results.some((r) => r?.ok), results };
  }

  async function syncFromDatabase() {
    if (!window.AHARepository?.loadNotes) return { ok: false, fallback: "localStorage" };
    const local = load();
    if (local.length) await pushLocalToDatabase(local);
    const result = await window.AHARepository.loadNotes();
    if (!result?.ok || !Array.isArray(result.data)) return result || { ok: false };
    const merged = mergeNotes(local, result.data);
    save(merged);
    render(merged);
    return { ...result, data: merged, merged: true };
  }

  function persistNote(note) {
    if (!window.AHARepository?.saveNote) return;
    window.AHARepository.saveNote(note).then((result) => {
      if (result?.ok === false && result.error) {
        console.warn("AHANotes: database-save feilet", result.error);
      }
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function render(source) {
    const mount = document.getElementById("notes-list");
    if (!mount) return;
    const notes = (Array.isArray(source) ? source : load()).filter((note) => !note?.deleted_at);
    mount.innerHTML = notes.length
      ? notes.map((note) => `
        <article class="module-card">
          <h3>${escapeHtml(note.title || "Uten tittel")}</h3>
          <p>${escapeHtml(note.text || "")}</p>
          <div class="module-meta">
            ${escapeHtml(note.created_at || "")}
            ${note.last_source_event_id ? ` · source: ${escapeHtml(note.last_source_event_id)}` : ""}
          </div>
          <div class="module-actions">
            <button type="button" data-note-edit="${escapeHtml(note.id)}">Rediger</button>
            <button type="button" data-note-delete="${escapeHtml(note.id)}">Slett</button>
          </div>
        </article>
      `).join("")
      : "<p>Ingen notater ennå.</p>";
  }

  async function addNote(input) {
    const note = {
      id: `note_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      title: String(input.title || "").trim(),
      text: String(input.text || "").trim(),
      tags: Array.isArray(input.tags) ? input.tags : [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const baseContract = window.AHAContracts?.createBaseItem?.({
      id: note.id,
      title: note.title || "Notat",
      type: "note",
      source: "aha_notes",
      createdAt: note.created_at,
      updatedAt: note.updated_at,
      tags: note.tags,
      meta: { note_id: note.id }
    });
    if (baseContract) note.base = baseContract;
    if (!note.title && !note.text) return null;

    const ingestResult = await window.AHAIngest?.ingest?.({
      source_type: "note",
      source_app: "aha_notes",
      content_type: "text",
      title: note.title,
      text: note.text,
      user_created: true,
      imported: false,
      created_at: note.created_at,
      meta: { note_id: note.id }
    });

    if (ingestResult?.sourceEvent?.id) {
      note.last_source_event_id = ingestResult.sourceEvent.id;
    }

    const notes = load();
    notes.unshift(note);
    save(notes);
    persistNote(note);
    render(notes);
    return note;
  }

  async function updateNote(id, changes = {}) {
    const notes = load();
    const index = notes.findIndex((note) => note.id === id);
    if (index < 0) return null;

    const current = notes[index];
    const updated = {
      ...current,
      title: String(changes.title ?? current.title ?? "").trim(),
      text: String(changes.text ?? current.text ?? "").trim(),
      updated_at: new Date().toISOString()
    };

    const ingestResult = await window.AHAIngest?.ingest?.({
      source_type: "note_edit",
      source_app: "aha_notes",
      content_type: "text",
      title: updated.title,
      text: updated.text,
      user_created: true,
      imported: false,
      created_at: updated.updated_at,
      meta: { note_id: updated.id },
      skip_insight: true
    });

    if (ingestResult?.sourceEvent?.id) {
      updated.last_source_event_id = ingestResult.sourceEvent.id;
    }

    notes[index] = updated;
    save(notes);
    persistNote(updated);
    render(notes);
    return updated;
  }

  function deleteNote(id) {
    const notes = load();
    const index = notes.findIndex((note) => note.id === id);
    if (index < 0) return null;
    const now = new Date().toISOString();
    const deleted = {
      ...notes[index],
      deleted_at: now,
      updated_at: now
    };
    notes[index] = deleted;
    save(notes);
    persistNote(deleted);
    render(notes);
    return deleted;
  }

  function bind() {
    const form = document.getElementById("note-form");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const title = document.getElementById("note-title");
      const text = document.getElementById("note-text");
      addNote({ title: title?.value, text: text?.value });
      if (title) title.value = "";
      if (text) text.value = "";
    });
    const list = document.getElementById("notes-list");
    list?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const editId = target.dataset.noteEdit;
      const deleteId = target.dataset.noteDelete;
      if (editId) {
        const notes = load();
        const note = notes.find((n) => n.id === editId && !n.deleted_at);
        if (!note) return;
        const nextTitle = window.prompt("Rediger tittel", note.title || "");
        if (nextTitle === null) return;
        const nextText = window.prompt("Rediger tekst", note.text || "");
        if (nextText === null) return;
        updateNote(editId, { title: nextTitle, text: nextText });
      }
      if (deleteId) deleteNote(deleteId);
    });

    render();
    syncFromDatabase();
    window.addEventListener("aha:auth-ready", syncFromDatabase);
  }

  window.AHANotes = { load, save, syncFromDatabase, addNote, updateNote, deleteNote, render };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
