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
    // AHASources.createSourceEvent stripper top-level theme_id / subject_id /
    // field_id og beholder bare det som er en del av source-event-schemaet.
    // For å unngå at theme_id forsvinner inn i ingest, leser vi fra both
    // det lagrede source-eventet og det opprinnelige input-objektet.
    const src = sourceEvent || input || {};
    const inp = input || {};
    const text = String(src.text || src.title || inp.text || inp.title || "").trim();

    if (!text) return { ok: false, reason: "empty_text", sourceEvent };

    // skip_insight: kilden vil at materialet skal logges som source event,
    // men IKKE bli en ordinær brukerinnsikt. Brukes f.eks. for AHA-agentens
    // egne svar — de skal vises i chat og ligge i source-loggen, men ikke
    // forurense innsiktskammeret med AI-oppsummeringer.
    if (inp.skip_insight === true || src.skip_insight === true) {
      try {
        global.dispatchEvent(new CustomEvent("aha:source-only", { detail: { sourceEvent: src } }));
      } catch {}
      return { ok: true, sourceEvent: src, signal: null, meta: null, skipped_insight: true };
    }

    if (!global.InsightsEngine) return { ok: false, reason: "missing_InsightsEngine", sourceEvent };

    const themeId = String(
      src.theme_id || inp.theme_id || src.meta?.theme_id || src.source_type || "self"
    ).trim() || "self";
    const subjectId = String(
      src.subject_id || inp.subject_id || src.meta?.subject_id || "sub_laring"
    ).trim() || "sub_laring";

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
        field_id: src.field_id || inp.field_id || src.meta?.field_id || src.theme_id || null,
        emner: Array.isArray(src.meta?.related_emner) ? src.meta.related_emner : []
      }
    );

    signal.source_event_id = src.id || null;
    signal.source_type = src.source_type || null;
    signal.source_app = src.source_app || null;
    signal.imported = src.imported === true;
    signal.meta = src.meta || {};

    const chamber = loadChamber();
    let meta = null;
    if (typeof global.InsightsEngine.addSignalToChamberWithMeta === "function") {
      meta = global.InsightsEngine.addSignalToChamberWithMeta(chamber, signal);
    } else {
      global.InsightsEngine.addSignalToChamber(chamber, signal);
    }
    saveChamber(chamber);

    try {
      global.dispatchEvent(new CustomEvent("aha:ingested", { detail: { sourceEvent: src, signal } }));
    } catch {}

    // Fire-and-forget berikelse: la emne-matcheren foreslå hvilke
    // fagområder/emner teksten ligner mest på, og fest dem på den
    // resulterende insighten. Hovedflyten skal aldri vente på dette.
    enrichWithEmneMatcher(signal, meta).catch((err) => {
      console.warn("AHAIngest: emne-berikelse feilet", err);
    });

    // Tilsvarende fire-and-forget: send insighten gjennom embedding-
    // tjenesten og lagre vektoren i Supabase. Krever innlogget bruker
    // og at /api/aha-agent/embed svarer; ellers no-op.
    enrichWithEmbedding(signal, meta).catch((err) => {
      console.warn("AHAIngest: embedding-berikelse feilet", err);
    });

    return { ok: true, sourceEvent: src, signal, meta };
  }

  function isHistoryGoSignal(signal) {
    if (!signal) return false;
    if (signal.imported === true) return true;
    if (signal.source_app === "historygo") return true;
    if (typeof signal.source_type === "string" && signal.source_type.startsWith("historygo")) return true;
    const meta = signal.meta;
    if (meta && typeof meta === "object") {
      if (meta.source_app === "historygo") return true;
      if (meta.imported === true) return true;
    }
    return false;
  }

  async function enrichWithEmneMatcher(signal, meta) {
    if (!signal || !signal.text) return;
    if (!global.AHAEmneMatcher || typeof global.AHAEmneMatcher.matchAllSubjects !== "function") return;
    // History Go har egen lærings-/innsiktsmotor og eksporterer allerede
    // concepts, related_emner og categoryId. AHA skal stole på det og
    // ikke gjette emner på nytt for importert materiale.
    if (isHistoryGoSignal(signal)) return;

    const matches = await global.AHAEmneMatcher.matchAllSubjects(signal.text, { topN: 3 });
    if (!Array.isArray(matches) || !matches.length) return;

    const chamber = loadChamber();
    const insights = chamber?.insights || [];
    if (!insights.length) return;

    // Foretrukket: hent insight via meta.insight_id fra
    // addSignalToChamberWithMeta. Det gjør at vi treffer riktig insight
    // selv om flere signaler ingestes tett etter hverandre og
    // last_updated-feltet endres mens denne async-jobben venter.
    let target = null;
    if (meta?.insight_id) {
      target = insights.find((ins) => ins.id === meta.insight_id) || null;
    }
    if (!target) {
      for (let i = insights.length - 1; i >= 0; i--) {
        const ins = insights[i];
        if (ins.subject_id !== signal.subject_id || ins.theme_id !== signal.theme_id) continue;
        if (ins.last_updated === signal.timestamp || ins.first_seen === signal.timestamp) {
          target = ins;
          break;
        }
      }
    }
    if (!target) return;

    // ahaEmneMatcher skriver forslag, ikke fasit. Bekreftede emner ligger
    // på target.emner og target.matched_subjects og rører vi ikke. Forslag
    // legges på target.emne_suggestions med status "suggested" og kan
    // senere bekreftes/avvises av brukeren.
    const now = new Date().toISOString();
    const existing = Array.isArray(target.emne_suggestions) ? target.emne_suggestions.slice() : [];
    const existingIds = new Set(existing.map((s) => s && s.emne_id).filter(Boolean));

    const additions = [];
    matches.forEach((m) => {
      if (!m || !m.emne_id || existingIds.has(m.emne_id)) return;
      const score = Number.isFinite(m.score) ? m.score : 0;
      additions.push({
        emne_id: m.emne_id,
        subject_id: m.subject_id || null,
        label: m.short_label || m.title || null,
        title: m.title || null,
        short_label: m.short_label || null,
        area_id: m.area_id || null,
        area_label: m.area_label || null,
        score,
        confidence: score,
        matched_terms: Array.isArray(m.matched_terms) ? m.matched_terms.slice() : [],
        source: "ahaEmneMatcher",
        status: "suggested",
        created_at: now
      });
      existingIds.add(m.emne_id);
    });

    if (!additions.length) return;

    target.emne_suggestions = existing.concat(additions);

    saveChamber(chamber);

    try {
      global.dispatchEvent(new CustomEvent("aha:emne-suggested", {
        detail: { signal, suggestions: additions, insight_id: target.id }
      }));
    } catch {}
  }

  async function enrichWithEmbedding(signal, meta) {
    if (!signal || !signal.text) return;
    if (!global.AHAEmbeddings || typeof global.AHAEmbeddings.embedAndStore !== "function") return;
    if (typeof global.AHAEmbeddings.isConfigured === "function" && !global.AHAEmbeddings.isConfigured()) return;

    const chamber = loadChamber();
    const insights = chamber?.insights || [];
    if (!insights.length) return;

    let target = null;
    if (meta?.insight_id) {
      target = insights.find((ins) => ins.id === meta.insight_id) || null;
    }
    if (!target) {
      for (let i = insights.length - 1; i >= 0; i--) {
        const ins = insights[i];
        if (ins.subject_id !== signal.subject_id || ins.theme_id !== signal.theme_id) continue;
        if (ins.last_updated === signal.timestamp || ins.first_seen === signal.timestamp) {
          target = ins;
          break;
        }
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

    // Suggestion-only: bare når lexical-laget faktisk skapte en ny insight.
    // Hvis lexical allerede reinforced en eksisterende, har vi ingen
    // grunn til å foreslå en merge. Ingen mutasjon, ingen merged_into,
    // bare et event UI/devtools kan lytte på.
    if (meta?.action !== "created") return;
    if (typeof global.AHAEmbeddings.findMergeCandidate !== "function") return;

    try {
      const suggestion = await global.AHAEmbeddings.findMergeCandidate(target, chamber);
      if (!suggestion?.ok || !suggestion.candidate) return;

      // Skip pairs the user has already dismissed. Avoids re-surfacing
      // the same suggestion every time a new signal lands on either side.
      const engine = global.InsightsEngine || {};
      if (typeof engine.isMergeDismissed === "function" &&
          engine.isMergeDismissed(chamber, target.id, suggestion.candidate.id)) {
        return;
      }

      const detail = {
        source_insight_id: target.id,
        source_summary: target.summary || target.title || "",
        candidate: suggestion.candidate,
        similarity: suggestion.similarity,
        threshold: suggestion.threshold
      };

      // Persist suggestion on the chamber so the UI can list pending
      // ones across reloads, not only in-flight events.
      if (typeof engine.recordMergeSuggestion === "function") {
        const persisted = engine.recordMergeSuggestion(chamber, {
          source_id: target.id,
          target_id: suggestion.candidate.id,
          similarity: suggestion.similarity,
          threshold: suggestion.threshold,
          source_summary: target.summary || target.title || "",
          target_summary: suggestion.candidate.summary || suggestion.candidate.title || ""
        });
        if (persisted) saveChamber(chamber);
      }

      console.info(
        "[aha:merge-suggested]",
        `source=${target.id}`,
        `candidate=${suggestion.candidate.id}`,
        `similarity=${suggestion.similarity.toFixed(3)}`,
        `threshold=${suggestion.threshold}`
      );
      global.dispatchEvent(new CustomEvent("aha:merge-suggested", { detail }));
    } catch (err) {
      console.warn("AHAIngest: merge-kandidat søk feilet", err);
    }
  }

  global.AHAIngest = { ingest, enrichWithEmneMatcher, enrichWithEmbedding };
})(window);
