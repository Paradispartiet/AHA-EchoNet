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
    save(result.data);
    render(result.data);
    return result;
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
    const notes = Array.isArray(source) ? source : load();
    mount.innerHTML = notes.length
      ? notes.map((note) => `
        <article class="module-card">
          <h3>${escapeHtml(note.title || "Uten tittel")}</h3>
          <p>${escapeHtml(note.text || "")}</p>
          <div class="module-meta">${escapeHtml(note.created_at || "")}</div>
        </article>
      `).join("")
      : "<p>Ingen notater ennå.</p>";
  }

  function addNote(input) {
    const note = {
      id: `note_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      title: String(input.title || "").trim(),
      text: String(input.text || "").trim(),
      tags: Array.isArray(input.tags) ? input.tags : [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (!note.title && !note.text) return null;

    const notes = load();
    notes.unshift(note);
    save(notes);
    persistNote(note);

    window.AHAIngest?.ingest?.({
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

    render(notes);
    return note;
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
    render();
    syncFromDatabase();
    window.addEventListener("aha:auth-ready", syncFromDatabase);
  }

  window.AHANotes = { load, save, syncFromDatabase, addNote, render };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
