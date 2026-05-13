// ahaHistoryGoImport.js
// Importerer History Go sin AHA-payload fra aha_import_payload_v1.

(function (global) {
  "use strict";

  const PAYLOAD_KEY = "aha_import_payload_v1";

  let importSaveChain = Promise.resolve();
  let latestImportSaveToken = 0;

  function s(value) {
    return String(value ?? "").trim();
  }

  function arr(value) {
    return Array.isArray(value) ? value : [];
  }

  function obj(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function ingestSignal(input) {
    if (!global.AHAIngest || typeof global.AHAIngest.ingest !== "function") {
      return null;
    }
    return global.AHAIngest.ingest(input);
  }

  function writeJsonToStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function applyPayloadToRuntimeAndStorage(payload) {
    const p = obj(payload);
    const applied = [];

    const writeObject = (key, value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      if (writeJsonToStorage(key, value)) applied.push(key);
    };

    const writeArray = (key, value) => {
      if (!Array.isArray(value)) return;
      if (writeJsonToStorage(key, value)) applied.push(key);
    };

    writeObject("knowledge_universe", p.knowledge_universe);
    writeArray("hg_learning_log_v1", p.hg_learning_log_v1);
    writeArray("hg_insights_events_v1", p.hg_insights_events_v1);
    writeObject("merits_by_category", p.merits_by_category);
    writeArray("people_collected", p.people_collected);

    if (global.merits && p.merits_by_category && typeof p.merits_by_category === "object") {
      Object.keys(global.merits).forEach((key) => delete global.merits[key]);
      Object.assign(global.merits, p.merits_by_category);
    }

    if (global.peopleCollected && Array.isArray(p.people_collected)) {
      global.peopleCollected.splice(0, global.peopleCollected.length, ...p.people_collected);
    }

    return applied;
  }

  function persistImport(payload, counts) {
    if (!global.AHARepository?.saveImport) return;
    latestImportSaveToken += 1;
    const requestToken = latestImportSaveToken;
    importSaveChain = importSaveChain
      .catch(() => null)
      .then(async () => {
        if (requestToken !== latestImportSaveToken) return;
        const result = await global.AHARepository.saveImport({
          source_app: "historygo",
          payload: obj(payload),
          counts: obj(counts),
          created_at: new Date().toISOString()
        });
        if (result?.ok === false && result.error) {
          console.warn("AHAHistoryGoImport: database-save feilet", result.error);
        }
      });
  }

  function collectNextUpSignal(chamber, nextupLearningSignal, fallbackTimestamp) {
    const signal = obj(nextupLearningSignal);
    if (!Object.keys(signal).length) return 0;

    const lines = [];
    if (signal.learning_style) lines.push(`Læringsstil: ${signal.learning_style}`);
    arr(signal.interpretation_texts).forEach((line) => lines.push(s(line)));
    arr(signal.inferred_interests).forEach((line) => lines.push(s(line)));
    arr(signal.recommended_learning_paths).forEach((path) => {
      const title = s(path?.title);
      const reason = s(path?.reason);
      if (title || reason) lines.push([title, reason].filter(Boolean).join(" — "));
    });

    const text = lines.filter(Boolean).join("\n");
    if (!text) return 0;

    ingestSignal({
      source_type: "historygo_nextup_profile",
      source_app: "historygo",
      content_type: "text",
      title: "History Go NextUp-profil",
      text,
      theme_id: "historygo_nextup",
      user_created: false,
      imported: true,
      created_at: fallbackTimestamp,
      meta: signal
    });

    return 1;
  }

  function collectLearningLogSignals(chamber, events, fallbackTimestamp) {
    let count = 0;
    arr(events).forEach((event) => {
      const e = obj(event);
      const parts = [];
      if (e.name) parts.push(s(e.name));
      if (e.note) parts.push(s(e.note));
      if (arr(e.concepts).length) parts.push(`Begreper: ${arr(e.concepts).map(s).filter(Boolean).join(", ")}`);
      if (arr(e.related_emner).length) parts.push(`Relaterte emner: ${arr(e.related_emner).map(s).filter(Boolean).join(", ")}`);
      arr(e.correctAnswers).forEach((a) => {
        const question = s(a?.question);
        const answer = s(a?.answer || a?.chosenAnswer);
        if (question || answer) parts.push([question, answer].filter(Boolean).join(" → "));
      });

      const text = parts.filter(Boolean).join("\n");
      if (!text) return;

      ingestSignal({
        source_type: e.type || "historygo_learning_event",
        source_app: "historygo",
        content_type: "text",
        title: s(e.name || e.type || "History Go learning event"),
        text,
        theme_id: s(e.categoryId || "historygo_learning"),
        user_created: false,
        imported: true,
        created_at: e.date || (e.ts ? new Date(e.ts).toISOString() : fallbackTimestamp),
        meta: {
          targetId: e.targetId || null,
          parentTargetId: e.parentTargetId || null,
          setId: e.setId || null,
          concepts: arr(e.concepts),
          related_emner: arr(e.related_emner),
          correctCount: e.correctCount ?? null,
          total: e.total ?? null,
          raw: e
        }
      });
      count += 1;
    });
    return count;
  }

  function collectInsightEventSignals(chamber, events, fallbackTimestamp) {
    let count = 0;
    arr(events).forEach((event) => {
      const e = obj(event);
      const concepts = arr(e.concepts).map(s).filter(Boolean);
      if (!concepts.length) return;

      ingestSignal({
        source_type: "historygo_concept_event",
        source_app: "historygo",
        content_type: "text",
        title: "History Go begreper",
        text: `History Go begreper: ${concepts.join(", ")}`,
        theme_id: s(e.categoryId || "historygo_concepts"),
        user_created: false,
        imported: true,
        created_at: e.ts ? new Date(e.ts).toISOString() : fallbackTimestamp,
        meta: {
          place_id: e.placeId || null,
          person_id: e.personId || null,
          concepts,
          quizId: e.quizId || null,
          raw: e
        }
      });
      count += 1;
    });
    return count;
  }

  function collectKnowledgeSignals(chamber, universe, fallbackTimestamp) {
    let count = 0;
    const uni = obj(universe);

    Object.entries(uni).forEach(([category, dimensions]) => {
      Object.entries(obj(dimensions)).forEach(([dimension, items]) => {
        arr(items).forEach((item) => {
          const k = obj(item);
          const topic = s(k.topic || k.title || "Kunnskap");
          const text = s(k.text || k.summary || k.description || "");
          if (!topic && !text) return;

          ingestSignal({
            source_type: "historygo_knowledge",
            source_app: "historygo",
            content_type: "text",
            title: topic,
            text: [topic, text].filter(Boolean).join(": "),
            theme_id: s(category || "historygo_knowledge"),
            user_created: false,
            imported: true,
            created_at: fallbackTimestamp,
            meta: {
              category,
              dimension,
              knowledge_id: k.id || null,
              raw: k
            }
          });
          count += 1;
        });
      });
    });

    return count;
  }

  function collectNoteSignals(items, sourceType, fallbackTimestamp) {
    let count = 0;
    arr(items).forEach((item) => {
      const n = obj(item);
      const title = s(n.title || n.name || sourceType);
      const text = s(n.text || n.body || n.content || n.note || n.message || "");
      if (!title && !text) return;
      ingestSignal({
        source_type: sourceType,
        source_app: "historygo",
        content_type: "text",
        title,
        text: [title, text].filter(Boolean).join("\n"),
        theme_id: "historygo_notes",
        user_created: false,
        imported: true,
        created_at: n.created_at || n.date || fallbackTimestamp,
        meta: { raw: n }
      });
      count += 1;
    });
    return count;
  }

  function importHistoryGoData(payload) {
    if (!payload || (typeof payload !== "object" && typeof payload !== "string")) {
      return {
        error: "Ugyldig payload.",
        importedSignals: 0
      };
    }

    if (!global.AHAIngest || typeof global.AHAIngest.ingest !== "function") {
      return {
        error: "AHAIngest mangler.",
        importedSignals: 0
      };
    }

    const p = typeof payload === "string" ? JSON.parse(payload) : obj(payload);
    const fallbackTimestamp = p.exported_at || new Date().toISOString();
    const chamber = null;
    const appliedStorageKeys = applyPayloadToRuntimeAndStorage(p);

    const counts = {
      nextup: collectNextUpSignal(chamber, p.nextup_learning_signal || p.nextup?.learning_signal, fallbackTimestamp),
      learning_log: collectLearningLogSignals(chamber, p.hg_learning_log_v1, fallbackTimestamp),
      insight_events: collectInsightEventSignals(chamber, p.hg_insights_events_v1, fallbackTimestamp),
      knowledge: collectKnowledgeSignals(chamber, p.knowledge_universe, fallbackTimestamp),
      notes: collectNoteSignals(p.notes, "historygo_note", fallbackTimestamp),
      dialogs: collectNoteSignals(p.dialogs, "historygo_dialog", fallbackTimestamp),
      storage_keys_applied: appliedStorageKeys.length
    };

    persistImport(p, counts);

    try {
      global.dispatchEvent(new CustomEvent("aha:historygo-imported", { detail: counts }));
    } catch {}

    return counts;
  }

  function importHistoryGoDataFromSharedStorage() {
    const raw = localStorage.getItem(PAYLOAD_KEY);
    if (!raw) {
      throw new Error("Fant ingen aha_import_payload_v1 i localStorage.");
    }
    return importHistoryGoData(raw);
  }

  // Import-knapp håndteres av historygo.html for å unngå dobbelt-binding.

  global.AHAHistoryGoImport = {
    PAYLOAD_KEY,
    importHistoryGoData,
    importHistoryGoDataFromSharedStorage,
    collectKnowledgeSignals,
    collectLearningLogSignals,
    collectInsightEventSignals,
    collectNextUpSignal
  };

})(window);
