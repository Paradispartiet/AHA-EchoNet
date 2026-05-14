(function (global) {
  "use strict";

  /**
   * AHA Subject Engine
   * ------------------------------------------------------------
   * Dette er matcher-laget for lokale AHA subject-data.
   * - Erstatter IKKE emnerLoader.
   * - Har kun minimal lokal datahenting for å kunne matche uten backend.
   * - Loader-delen kan senere byttes til en felles emne-loader uten å
   *   endre match/scoring-API-et som Chat/Innsikter bruker.
   */

  const BASE_PATH = "data/subjects/";
  const INDEX_FILE = "subjects_index.json";
  const cache = { index: null, subjects: {} };

  // ------------------------------------------------------------
  // 1) DATA LOADING LAYER (kan erstattes av felles loader senere)
  // ------------------------------------------------------------

  async function loadIndex() {
    if (cache.index) return cache.index;
    try {
      const res = await fetch(`${BASE_PATH}${INDEX_FILE}`);
      if (!res.ok) throw new Error(`index ${res.status}`);
      const data = await res.json();
      cache.index = Array.isArray(data?.subjects) ? data.subjects : [];
    } catch (err) {
      console.warn("AHASubjectEngine: fallback index", err);
      cache.index = [];
    }
    return cache.index;
  }

  async function listSubjects() {
    return loadIndex();
  }

  async function loadSubject(subjectId) {
    const id = String(subjectId || "").trim();
    if (!id) return null;
    if (cache.subjects[id]) return cache.subjects[id];

    const subjects = await loadIndex();
    const meta = subjects.find((s) => s?.subject_id === id);
    const file = meta?.file || `${id}.json`;

    try {
      const res = await fetch(`${BASE_PATH}${file}`);
      if (!res.ok) throw new Error(`subject ${res.status}`);
      const data = await res.json();
      cache.subjects[id] = data;
      return data;
    } catch (err) {
      console.warn(`AHASubjectEngine: missing subject ${id}`, err);
      const fallback = { subject_id: id, subject_label: meta?.subject_label || id, emner: [] };
      cache.subjects[id] = fallback;
      return fallback;
    }
  }

  async function loadAllSubjects() {
    const subjects = await loadIndex();
    const loaded = await Promise.all(subjects.map((s) => loadSubject(s.subject_id)));
    return loaded.filter(Boolean);
  }

  // ------------------------------------------------------------
  // 2) MATCH / SCORING LAYER
  // ------------------------------------------------------------

  function addMatch(matches, key, payload) {
    const previous = matches.get(key);
    if (!previous || previous.score < payload.score) {
      matches.set(key, payload);
      return;
    }
    previous.matched_terms = Array.from(new Set(previous.matched_terms.concat(payload.matched_terms)));
  }
  function dedupeMatches(matches) {
    const seen = new Set();
    return matches.filter((item) => {
      const title = String(item?.title || item?.subject_label || "").trim().toLowerCase();
      const subjectId = String(item?.subject_id || "").trim().toLowerCase();
      const emneId = String(item?.emne_id || "").trim().toLowerCase();
      const dedupeKey = `${title}::${subjectId}::${emneId}`;
      if (!title || seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    });
  }

  function scanField(text, values, boost, collector) {
    const normalized = String(text || "").toLowerCase();
    const terms = Array.isArray(values) ? values : [values];
    let matched = false;

    terms.forEach((term) => {
      const clean = String(term || "").trim();
      if (!clean) return;
      if (normalized.includes(clean.toLowerCase())) {
        collector.push(clean);
        matched = true;
      }
    });

    return matched ? boost : 0;
  }

  const GENERIC_TERMS = new Set(["kunnskap", "mennesker", "sted", "samfunn"]);
  const SEMANTIC_FIELDS = ["title", "core", "keywords", "thinkers", "summary", "description", "goals", "checkpoints"];

  function termWeight(term, fieldBoost) {
    const token = String(term || "").trim().toLowerCase();
    if (!token) return 0;
    if (GENERIC_TERMS.has(token)) return Math.max(0.2, fieldBoost * 0.2);
    return fieldBoost;
  }

  async function matchText(text, options) {
    const source = options?.source || "text";
    const maxResults = Math.min(8, Number(options?.maxResults) || 8);
    const target = String(text || "").trim();
    if (!target) return [];

    const subjects = await loadAllSubjects();
    const matches = new Map();

    subjects.forEach((subject) => {
      const subjectTerms = [];
      const subjectScore = scanField(target, subject.subject_label, 2, subjectTerms);
      if (subjectScore) {
        addMatch(matches, `subject:${subject.subject_id}`, {
          subject_id: subject.subject_id,
          subject_label: subject.subject_label,
          emne_id: null,
          title: subject.subject_label,
          type: "subject",
          score: subjectScore,
          matched_terms: subjectTerms,
          source
        });
      }

      (subject.emner || []).forEach((emne) => {
        const found = [];
        const fieldHits = {
          title: [],
          core: [],
          keywords: [],
          thinkers: [],
          summary: [],
          description: [],
          goals: [],
          checkpoints: []
        };

        scanField(target, emne.title, 3, fieldHits.title);
        scanField(target, emne.core_concepts, 3, fieldHits.core);
        scanField(target, emne.keywords, 2, fieldHits.keywords);
        scanField(target, emne.thinkers, 3, fieldHits.thinkers);
        scanField(target, emne.summary, 1, fieldHits.summary);
        scanField(target, emne.description, 1, fieldHits.description);
        scanField(target, emne.learning_goals, 1, fieldHits.goals);
        scanField(target, emne.checkpoints, 1, fieldHits.checkpoints);

        const weightedHits = []
          .concat(fieldHits.title.map((term) => termWeight(term, 3)))
          .concat(fieldHits.core.map((term) => termWeight(term, 3)))
          .concat(fieldHits.keywords.map((term) => termWeight(term, 2)))
          .concat(fieldHits.thinkers.map((term) => termWeight(term, 3)))
          .concat(fieldHits.summary.map((term) => termWeight(term, 1)))
          .concat(fieldHits.description.map((term) => termWeight(term, 1)))
          .concat(fieldHits.goals.map((term) => termWeight(term, 1)))
          .concat(fieldHits.checkpoints.map((term) => termWeight(term, 1)));

        const uniqueFound = Array.from(new Set(Object.values(fieldHits).flat()));
        if (!uniqueFound.length) return;

        let score = weightedHits.reduce((sum, value) => sum + value, 0);
        const thematicDiversityBonus = Math.max(0, uniqueFound.length - 1) * 1.35;
        score += thematicDiversityBonus;

        const fieldsWithHits = SEMANTIC_FIELDS.filter((field) => (fieldHits[field] || []).length > 0).length;
        if (fieldsWithHits > 1) score += (fieldsWithHits - 1) * 0.8;

        const strongFieldHit = fieldHits.title.length + fieldHits.core.length;
        if (strongFieldHit > 0) score += 1.5 + strongFieldHit * 0.5;

        const genericTermsFound = uniqueFound.filter((term) => GENERIC_TERMS.has(String(term || "").toLowerCase()));
        const nonGenericHits = uniqueFound.length - genericTermsFound.length;
        if (nonGenericHits === 0) {
          score = Math.min(score, 0.45);
        } else if (genericTermsFound.length > 0) {
          score -= genericTermsFound.length * 0.2;
        }

        const thinkerHit = (emne.thinkers || []).some((t) => uniqueFound.includes(t));
        const conceptHit = (emne.core_concepts || []).some((c) => uniqueFound.includes(c));
        const type = thinkerHit ? "thinker" : conceptHit ? "concept" : "emne";

        addMatch(matches, `emne:${subject.subject_id}:${emne.emne_id}`, {
          subject_id: subject.subject_id,
          subject_label: subject.subject_label,
          emne_id: emne.emne_id,
          title: emne.title,
          type,
          score,
          matched_terms: uniqueFound,
          source
        });
      });
    });

    return dedupeMatches(Array.from(matches.values()).sort((a, b) => b.score - a.score)).slice(0, maxResults);
  }

  function flattenValue(value) {
    if (Array.isArray(value)) return value.map(flattenValue).filter(Boolean).join(" ");
    if (value && typeof value === "object") return Object.values(value).map(flattenValue).filter(Boolean).join(" ");
    return String(value || "").trim();
  }

  function buildInsightBlob(insight) {
    return [
      insight?.title,
      insight?.summary,
      insight?.text,
      insight?.content,
      insight?.claim,
      insight?.concepts,
      insight?.raw_terms,
      insight?.emner,
      insight?.patterns,
      insight?.claims,
      insight?.markers,
      insight?.terms
    ].map(flattenValue).filter(Boolean).join(" ");
  }

  async function matchInsight(insight, options) {
    return matchText(buildInsightBlob(insight), { ...(options || {}), source: "insight" });
  }

  global.AHASubjectEngine = { listSubjects, loadSubject, loadAllSubjects, matchText, matchInsight };
})(window);
