// ahaIngest.js
// Felles bro fra AHA-kilder til eksisterende AHA-motor.

(function (global) {
  "use strict";

  const CHAMBER_KEY = "aha_insight_chamber_v1";

  function readChamberFallback() {
    try {
      const raw = localStorage.getItem(CHAMBER_KEY);
      if (!raw) return global.InsightsEngine?.createEmptyChamber?.() || { insights: [] };
      return JSON.parse(raw);
    } catch {
      return global.InsightsEngine?.createEmptyChamber?.() || { insights: [] };
    }
  }

  function saveChamberFallback(chamber) {
    localStorage.setItem(CHAMBER_KEY, JSON.stringify(chamber));
  }

  function loadChamber() {
    if (typeof global.loadChamberFromStorage === "function") {
      return global.loadChamberFromStorage();
    }
    return readChamberFallback();
  }

  function saveChamber(chamber) {
    if (typeof global.saveChamberToStorage === "function") {
      global.saveChamberToStorage(chamber);
      return;
    }
    saveChamberFallback(chamber);
  }

  function ingest(input) {
    const sourceEvent = global.AHASources?.addSourceEvent?.(input) || null;
    const src = sourceEvent || input || {};
    const text = String(src.text || src.title || "").trim();

    if (!text) return { ok: false, reason: "empty_text", sourceEvent };
    if (!global.InsightsEngine) return { ok: false, reason: "missing_InsightsEngine", sourceEvent };

    const themeId = String(src.theme_id || src.source_type || "self").trim() || "self";
    const subjectId = String(src.subject_id || "sub_laring").trim() || "sub_laring";

    const signal = global.InsightsEngine.createSignalFromMessage(
      text,
      subjectId,
      themeId,
      {
        source_event_id: src.id || null,
        source_type: src.source_type || null,
        source_app: src.source_app || null,
        imported: src.imported === true,
        place_id: src.meta?.place_id || src.place_id || null,
        person_id: src.meta?.person_id || src.person_id || null,
        field_id: src.field_id || src.meta?.field_id || src.theme_id || null,
        emner: Array.isArray(src.meta?.related_emner) ? src.meta.related_emner : []
      }
    );

    signal.source_event_id = src.id || null;
    signal.source_type = src.source_type || null;
    signal.source_app = src.source_app || null;
    signal.imported = src.imported === true;
    signal.meta = src.meta || {};

    const chamber = loadChamber();
    const next = global.InsightsEngine.addSignalToChamber(chamber, signal);
    saveChamber(next);

    try {
      global.dispatchEvent(new CustomEvent("aha:ingested", { detail: { sourceEvent: src, signal } }));
    } catch {}

    return { ok: true, sourceEvent: src, signal };
  }

  global.AHAIngest = { ingest };
})(window);
