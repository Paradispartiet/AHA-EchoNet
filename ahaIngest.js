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

    // Fire-and-forget berikelse: la emne-matcheren foreslå hvilke
    // fagområder/emner teksten ligner mest på, og fest dem på den
    // resulterende insighten. Hovedflyten skal aldri vente på dette.
    enrichWithEmneMatcher(signal).catch((err) => {
      console.warn("AHAIngest: emne-berikelse feilet", err);
    });

    // Tilsvarende fire-and-forget: send insighten gjennom embedding-
    // tjenesten og lagre vektoren i Supabase. Krever innlogget bruker
    // og at /api/aha-agent/embed svarer; ellers no-op.
    enrichWithEmbedding(signal).catch((err) => {
      console.warn("AHAIngest: embedding-berikelse feilet", err);
    });

    return { ok: true, sourceEvent: src, signal };
  }

  async function enrichWithEmneMatcher(signal) {
    if (!signal || !signal.text) return;
    if (!global.AHAEmneMatcher || typeof global.AHAEmneMatcher.matchAllSubjects !== "function") return;

    const matches = await global.AHAEmneMatcher.matchAllSubjects(signal.text, { topN: 3 });
    if (!Array.isArray(matches) || !matches.length) return;

    const chamber = loadChamber();
    const insights = chamber?.insights || [];
    if (!insights.length) return;

    // Finn insighten som dette signalet endte opp på. Matchen skjer rett
    // etter addSignalToChamber, så insighten er enten siste opprettede
    // (signal seedet en ny) eller den med last_updated === signal.timestamp.
    let target = null;
    for (let i = insights.length - 1; i >= 0; i--) {
      const ins = insights[i];
      if (ins.subject_id !== signal.subject_id || ins.theme_id !== signal.theme_id) continue;
      if (ins.last_updated === signal.timestamp || ins.first_seen === signal.timestamp) {
        target = ins;
        break;
      }
    }
    if (!target) return;

    const existing = Array.isArray(target.emner) ? target.emner.slice() : [];
    const existingSet = new Set(existing);
    matches.forEach((m) => {
      if (m.emne_id && !existingSet.has(m.emne_id)) {
        existing.push(m.emne_id);
        existingSet.add(m.emne_id);
      }
    });
    target.emner = existing;

    const subjectSet = new Set(target.matched_subjects || []);
    matches.forEach((m) => m.subject_id && subjectSet.add(m.subject_id));
    target.matched_subjects = Array.from(subjectSet);

    target.emne_matches = matches;

    saveChamber(chamber);

    try {
      global.dispatchEvent(new CustomEvent("aha:emne-matched", {
        detail: { signal, matches, insight_id: target.id }
      }));
    } catch {}
  }

  async function enrichWithEmbedding(signal) {
    if (!signal || !signal.text) return;
    if (!global.AHAEmbeddings || typeof global.AHAEmbeddings.embedAndStore !== "function") return;
    if (typeof global.AHAEmbeddings.isConfigured === "function" && !global.AHAEmbeddings.isConfigured()) return;

    const chamber = loadChamber();
    const insights = chamber?.insights || [];
    if (!insights.length) return;

    let target = null;
    for (let i = insights.length - 1; i >= 0; i--) {
      const ins = insights[i];
      if (ins.subject_id !== signal.subject_id || ins.theme_id !== signal.theme_id) continue;
      if (ins.last_updated === signal.timestamp || ins.first_seen === signal.timestamp) {
        target = ins;
        break;
      }
    }
    if (!target) return;

    const result = await global.AHAEmbeddings.embedAndStore(target);
    if (!result?.ok) return;

    try {
      global.dispatchEvent(new CustomEvent("aha:embedding-stored", {
        detail: { insight_id: target.id }
      }));
    } catch {}
  }

  global.AHAIngest = { ingest, enrichWithEmneMatcher, enrichWithEmbedding };
})(window);
