// ahaChatChamberStore.js
// Versjonert lokal lagringsgrense for innsiktskammeret i AHA Chat.
//
// Modulen eier nøkkel, fallback, lokalt tidsstempel, lagringssignal og sletting.
// Orkestratoren bestemmer fortsatt når kammeret skal leses eller endres.

(function (global) {
  "use strict";

  const STORAGE_KEY = "aha_insight_chamber_v1";
  const SAVED_EVENT = "aha:chamber-saved";

  function create(deps = {}) {
    if (typeof deps.createEmptyChamber !== "function") {
      throw new Error("AHAChatChamberStore mangler avhengighet: createEmptyChamber");
    }
    const storage = deps.storage || global.localStorage;
    const storageKey = deps.storageKey || STORAGE_KEY;
    const now = typeof deps.now === "function" ? deps.now : () => new Date().toISOString();
    const warn = typeof deps.warn === "function" ? deps.warn : (...args) => global.console?.warn?.(...args);
    const dispatchEvent = typeof deps.dispatchEvent === "function"
      ? deps.dispatchEvent
      : (event) => global.dispatchEvent?.(event);
    const createSavedEvent = typeof deps.createSavedEvent === "function"
      ? deps.createSavedEvent
      : (detail) => new global.CustomEvent(SAVED_EVENT, { detail });

    function load() {
      try {
        const raw = storage?.getItem?.(storageKey);
        if (!raw) return deps.createEmptyChamber();
        return JSON.parse(raw);
      } catch (error) {
        warn("Kunne ikke laste innsiktskammer, lager nytt.", error);
        return deps.createEmptyChamber();
      }
    }

    function save(chamber) {
      try {
        // ahaChamberSync sammenligner dette med Supabase updated_at i pull-fasen.
        if (chamber && typeof chamber === "object") {
          chamber._local_updated_at = now();
        }
        if (typeof storage?.setItem !== "function") throw new Error("localStorage.setItem er utilgjengelig");
        storage.setItem(storageKey, JSON.stringify(chamber));
        try {
          dispatchEvent(createSavedEvent({
            source: "ahaChat",
            insight_count: (chamber?.insights || []).length
          }));
        } catch {}
      } catch (error) {
        warn("Kunne ikke lagre innsiktskammer.", error);
      }
    }

    function clear() {
      try {
        if (typeof storage?.removeItem !== "function") return false;
        storage.removeItem(storageKey);
        return true;
      } catch {
        return false;
      }
    }

    return Object.freeze({ load, save, clear });
  }

  const publicApi = { STORAGE_KEY, SAVED_EVENT, create };
  global.AHAChatChamberStore = publicApi;
  global.AHAModuleApi?.register?.("chat.chamberStore", publicApi, {
    version: 1,
    legacyGlobal: "AHAChatChamberStore",
    exports: Object.keys(publicApi)
  });
})(window);
