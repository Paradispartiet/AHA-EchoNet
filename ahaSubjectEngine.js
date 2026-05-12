(function (global) {
  "use strict";

  const BASE_PATH = "data/subjects/";
  const INDEX_FILE = "subjects_index.json";
  const cache = { index: null, subjects: {} };

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

  function addMatch(matches, key, payload) {
    const previous = matches.get(key);
    if (!previous || previous.score < payload.score) {
      matches.set(key, payload);
    } else if (previous) {
      previous.matched_terms = Array.from(new Set(previous.matched_terms.concat(payload.matched_terms)));
    }
  }

  function scanField(text, values, boost, collector) {
    const normalized = String(text || "").toLowerCase();
    const terms = Array.isArray(values) ? values : [values];
    terms.forEach((term) => {
      const clean = String(term || "").trim();
      if (!clean) return;
      if (normalized.includes(clean.toLowerCase())) {
        collector.push(clean);
      }
    });
    return collector.length ? boost : 0;
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
        let score = 0;
        score += scanField(target, emne.title, 3, found);
        score += scanField(target, emne.core_concepts, 3, found);
        score += scanField(target, emne.keywords, 2, found);
        score += scanField(target, emne.thinkers, 3, found);
        score += scanField(target, emne.summary, 1, found);
        score += scanField(target, emne.description, 1, found);
        score += scanField(target, emne.learning_goals, 1, found);
        score += scanField(target, emne.checkpoints, 1, found);

        if (!score) return;
        const thinkerHit = (emne.thinkers || []).some((t) => found.includes(t));
        const conceptHit = (emne.core_concepts || []).some((c) => found.includes(c));
        const type = thinkerHit ? "thinker" : conceptHit ? "concept" : "emne";

        addMatch(matches, `emne:${subject.subject_id}:${emne.emne_id}`, {
          subject_id: subject.subject_id,
          subject_label: subject.subject_label,
          emne_id: emne.emne_id,
          title: emne.title,
          type,
          score,
          matched_terms: Array.from(new Set(found)),
          source
        });
      });
    });

    return Array.from(matches.values()).sort((a, b) => b.score - a.score).slice(0, maxResults);
  }

  async function matchInsight(insight, options) {
    const blob = [
      insight?.title,
      insight?.summary,
      insight?.text,
      insight?.content,
      insight?.claim,
      Array.isArray(insight?.terms) ? insight.terms.join(" ") : ""
    ].filter(Boolean).join(" ");
    return matchText(blob, { ...(options || {}), source: "insight" });
  }

  global.AHASubjectEngine = { listSubjects, loadSubject, loadAllSubjects, matchText, matchInsight };
})(window);
