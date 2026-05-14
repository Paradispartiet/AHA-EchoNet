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
    if (chamber && typeof chamber === "object") {
      chamber._local_updated_at = new Date().toISOString();
    }
    localStorage.setItem(CHAMBER_KEY, JSON.stringify(chamber));
    try {
      global.dispatchEvent(new CustomEvent("aha:chamber-saved", {
        detail: { source: "ahaIngest", insight_count: (chamber?.insights || []).length }
      }));
    } catch {}
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

  function normalizeCandidateConcepts(concepts) {
    const list = Array.isArray(concepts) ? concepts : [];
    const out = [];
    const seen = new Set();
    list.forEach((item) => {
      let value = "";
      if (typeof item === "string") value = item;
      else if (item && typeof item === "object") value = item.label || item.key || item.term || item.name || "";
      const label = String(value || "").trim();
      if (!label) return;
      const normalized = label.toLowerCase();
      if (seen.has(normalized)) return;
      seen.add(normalized);
      out.push(label);
    });
    return out;
  }

  function markInsightImportSource(chamber, meta, sourceApp) {
    if (!chamber || !Array.isArray(chamber.insights) || !meta?.insight_id || !sourceApp) return false;
    const target = chamber.insights.find((insight) => insight?.id === meta.insight_id);
    if (!target || target.import_source === sourceApp) return false;
    target.import_source = sourceApp;
    return true;
  }
  function normalizeSimpleStringList(list, maxItems) {
    const values = Array.isArray(list) ? list : [];
    const out = [];
    const seen = new Set();
    values.forEach((item) => {
      const label = String(item || "").trim();
      if (!label) return;
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(label);
    });
    return out.slice(0, maxItems);
  }
  function normalizeTheoreticalLinks(list, maxItems) {
    const values = Array.isArray(list) ? list : [];
    const out = [];
    values.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const name = String(item.name || "").trim();
      const relation = String(item.relation || "").trim();
      if (!name || !relation) return;
      out.push({ name, relation });
    });
    return out.slice(0, maxItems);
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
    markInsightImportSource(chamber, meta, signal.source_app);
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

  function ingestWithCandidates(input, candidates) {
    const baseInput = Object.assign({}, input || {}, { skip_insight: true });
    const sourceOnly = ingest(baseInput);
    if (!sourceOnly?.ok) return sourceOnly;
    if (
      !global.InsightsEngine ||
      typeof global.InsightsEngine.createSignalFromMessage !== "function"
    ) {
      return { ok: false, reason: "insights_engine_unavailable", items: [] };
    }

    const sourceEvent = sourceOnly.sourceEvent || input || {};
    const themeId = String(
      sourceEvent.theme_id || input?.theme_id || sourceEvent.meta?.theme_id || sourceEvent.source_type || "self"
    ).trim() || "self";
    const subjectId = String(
      sourceEvent.subject_id || input?.subject_id || sourceEvent.meta?.subject_id || "sub_laring"
    ).trim() || "sub_laring";

    const list = Array.isArray(candidates) ? candidates : [];
    const chamber = loadChamber();
    const items = [];

    list.forEach((candidate) => {
      const isObjectCandidate = candidate && typeof candidate === "object" && !Array.isArray(candidate);
      const candidateText = isObjectCandidate
        ? String(candidate.text || candidate.summary || candidate.title || "").trim()
        : String(candidate || "").trim();
      if (!candidateText) return;
      const candidateConcepts = isObjectCandidate ? normalizeCandidateConcepts(candidate.concepts) : [];
      const candidateThinkers = isObjectCandidate ? normalizeSimpleStringList(candidate.thinkers, 5) : [];
      const candidateTheories = isObjectCandidate ? normalizeSimpleStringList(candidate.theories, 5) : [];
      const candidateTraditions = isObjectCandidate ? normalizeSimpleStringList(candidate.traditions, 5) : [];
      const candidateTheoreticalLinks = isObjectCandidate ? normalizeTheoreticalLinks(candidate.theoretical_links, 5) : [];
      const signal = global.InsightsEngine.createSignalFromMessage(
        candidateText,
        subjectId,
        themeId,
        {
          source_event_id: sourceEvent.id || null,
          source_type: sourceEvent.source_type || null,
          source_app: sourceEvent.source_app || null,
          imported: sourceEvent.imported === true,
          place_id: sourceEvent.meta?.place_id || sourceEvent.place_id || null,
          person_id: sourceEvent.meta?.person_id || sourceEvent.person_id || null,
          field_id: sourceEvent.field_id || input?.field_id || sourceEvent.meta?.field_id || sourceEvent.theme_id || null,
          emner: Array.isArray(sourceEvent.meta?.related_emner) ? sourceEvent.meta.related_emner : [],
          candidate_title: isObjectCandidate ? String(candidate.title || "").trim() : "",
          candidate_summary: isObjectCandidate ? String(candidate.summary || "").trim() : "",
          candidate_functional_type: isObjectCandidate ? String(candidate.functional_type || candidate.candidate_type || "").trim() : "",
          candidate_concepts: candidateConcepts,
          candidate_thinkers: candidateThinkers,
          candidate_theories: candidateTheories,
          candidate_traditions: candidateTraditions,
          candidate_theoretical_links: candidateTheoreticalLinks
        }
      );
      signal.source_event_id = sourceEvent.id || null;
      signal.source_type = sourceEvent.source_type || null;
      signal.source_app = sourceEvent.source_app || null;
      signal.imported = sourceEvent.imported === true;
      signal.meta = sourceEvent.meta || {};
      if (isObjectCandidate) {
        signal.candidate_title = String(candidate.title || "").trim() || null;
        signal.candidate_summary = String(candidate.summary || "").trim() || null;
        signal.candidate_functional_type = String(candidate.functional_type || candidate.candidate_type || "").trim() || null;
        signal.candidate_concepts = candidateConcepts;
        signal.candidate_thinkers = candidateThinkers;
        signal.candidate_theories = candidateTheories;
        signal.candidate_traditions = candidateTraditions;
        signal.candidate_theoretical_links = candidateTheoreticalLinks;
      }

      let meta = null;
      if (typeof global.InsightsEngine.addSignalToChamberWithMeta === "function") {
        meta = global.InsightsEngine.addSignalToChamberWithMeta(chamber, signal);
      } else {
        global.InsightsEngine.addSignalToChamber(chamber, signal);
      }
      markInsightImportSource(chamber, meta, signal.source_app);
      items.push({ signal, meta });
    });

    saveChamber(chamber);
    items.forEach(({ signal, meta }) => {
      enrichWithEmneMatcher(signal, meta).catch((err) => {
        console.warn("AHAIngest: emne-berikelse feilet", err);
      });
      enrichWithEmbedding(signal, meta).catch((err) => {
        console.warn("AHAIngest: embedding-berikelse feilet", err);
      });
    });

    return { ok: true, sourceEvent, items };
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
        const latestChamber = loadChamber();
        const persisted = engine.recordMergeSuggestion(latestChamber, {
          source_id: target.id,
          target_id: suggestion.candidate.id,
          similarity: suggestion.similarity,
          threshold: suggestion.threshold,
          source_summary: target.summary || target.title || "",
          target_summary: suggestion.candidate.summary || suggestion.candidate.title || ""
        });
        if (persisted) saveChamber(latestChamber);
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

  global.AHAIngest = { ingest, ingestWithCandidates, enrichWithEmneMatcher, enrichWithEmbedding };
})(window);
