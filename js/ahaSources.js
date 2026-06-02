// ahaSources.js
// Rå kildelogg for AHA: chat, notes, galleri, feed, insta og importer.

(function (global) {
  "use strict";

  const STORAGE_KEY = "aha_source_events_v1";

  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function createSourceEvent(input) {
    const src = safeObject(input);
    return {
      id: src.id || uid("src"),
      source_type: String(src.source_type || "unknown").trim(),
      source_app: String(src.source_app || "aha").trim(),
      content_type: String(src.content_type || "text").trim(),
      title: String(src.title || "").trim(),
      text: String(src.text || "").trim(),
      user_created: src.user_created !== false,
      imported: src.imported === true,
      created_at: src.created_at || new Date().toISOString(),
      tags: safeArray(src.tags).map((x) => String(x || "").trim()).filter(Boolean),
      meta: safeObject(src.meta)
    };
  }

  function loadSourceEvents() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn("AHASources: kunne ikke lese source events", e);
      return [];
    }
  }

  function saveSourceEvents(events) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safeArray(events)));
      return true;
    } catch (e) {
      console.warn("AHASources: kunne ikke lagre source events", e);
      return false;
    }
  }

  function persistSourceEvent(event) {
    if (!global.AHARepository?.saveSourceEvent) return;
    global.AHARepository.saveSourceEvent(event).then((result) => {
      if (result?.ok === false && result.error) {
        console.warn("AHASources: database-save feilet", result.error);
      }
    });
  }

  function addSourceEvent(input) {
    const event = createSourceEvent(input);
    if (!event.title && !event.text) return null;

    const events = loadSourceEvents();
    events.unshift(event);
    saveSourceEvents(events);
    persistSourceEvent(event);

    try {
      global.dispatchEvent(new CustomEvent("aha:source-event-added", { detail: event }));
    } catch {}

    return event;
  }

  global.AHASources = {
    STORAGE_KEY,
    createSourceEvent,
    loadSourceEvents,
    saveSourceEvents,
    addSourceEvent
  };
})(window);
