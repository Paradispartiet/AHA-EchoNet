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

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function render() {
    const mount = document.getElementById("notes-list");
    if (!mount) return;
    const notes = load();
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (!note.title && !note.text) return null;

    const notes = load();
    notes.unshift(note);
    save(notes);

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

    render();
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
  }

  window.AHANotes = { load, save, addNote, render };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
