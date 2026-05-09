// ahaEmneMatcher.js
// Matcher fritekst mot kjente emner. Beholder den enkle keyword/concept-
// scoringen, men eksponerer nå et navngitt API og lar oss matche på
// tvers av alle fagområder samtidig — slik at AHAIngest kan berike
// nye signaler uten at brukeren må oppgi hvilket fag teksten gjelder.

(function (global) {
  "use strict";

  const SUBJECT_IDS = [
    "historie",
    "by",
    "kunst",
    "musikk",
    "natur",
    "vitenskap",
    "litteratur",
    "populaerkultur",
    "naeringsliv",
    "sport",
    "politikk",
    "subkultur",
    "psykologi"
  ];

  const _emnerCache = new Map();

  async function loadEmnerCached(subjectId) {
    if (_emnerCache.has(subjectId)) return _emnerCache.get(subjectId);
    if (!global.Emner || typeof global.Emner.loadForSubject !== "function") {
      _emnerCache.set(subjectId, []);
      return [];
    }
    try {
      const list = await global.Emner.loadForSubject(subjectId);
      const arr = Array.isArray(list) ? list : [];
      _emnerCache.set(subjectId, arr);
      return arr;
    } catch (err) {
      console.warn("AHAEmneMatcher: kunne ikke laste emner for", subjectId, err);
      _emnerCache.set(subjectId, []);
      return [];
    }
  }

  function scoreEmne(emne, lower) {
    const keywords = (emne.keywords || []).map((k) => String(k).toLowerCase());
    const concepts = (emne.core_concepts || []).map((c) => String(c).toLowerCase());

    let score = 0;
    const hits = [];
    keywords.forEach((k) => {
      if (k && lower.includes(k)) {
        score += 3;
        hits.push(k);
      }
    });
    concepts.forEach((c) => {
      if (c && lower.includes(c)) {
        score += 2;
        hits.push(c);
      }
    });
    return { score, hits };
  }

  async function matchEmneForText(subjectId, text) {
    if (!text || !text.trim()) return null;
    const emner = await loadEmnerCached(subjectId);
    if (!emner.length) return null;

    const lower = text.toLowerCase();
    let best = null;
    let bestScore = 0;

    for (const emne of emner) {
      const { score } = scoreEmne(emne, lower);
      if (score > bestScore) {
        bestScore = score;
        best = emne;
      }
    }

    if (!best || bestScore === 0) return null;

    return {
      emne_id: best.emne_id || best.id,
      title: best.title,
      short_label: best.short_label,
      subject_id: subjectId,
      area_id: best.area_id || null,
      area_label: best.area_label || null,
      score: bestScore
    };
  }

  async function matchAllSubjects(text, options) {
    const opts = options || {};
    const topN = opts.topN || 3;
    const minScore = opts.minScore || 1;
    if (!text || !text.trim()) return [];

    const lower = text.toLowerCase();
    const lists = await Promise.all(
      SUBJECT_IDS.map(async (sid) => {
        const emner = await loadEmnerCached(sid);
        return emner.map((e) => {
          const { score, hits } = scoreEmne(e, lower);
          return { emne: e, subject_id: sid, score, hits };
        });
      })
    );

    return lists
      .flat()
      .filter((x) => x.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map((x) => ({
        emne_id: x.emne.emne_id || x.emne.id,
        title: x.emne.title,
        short_label: x.emne.short_label,
        subject_id: x.subject_id,
        area_id: x.emne.area_id || null,
        area_label: x.emne.area_label || null,
        score: x.score,
        matched_terms: x.hits
      }));
  }

  function clearCache() {
    _emnerCache.clear();
  }

  global.AHAEmneMatcher = {
    matchEmneForText,
    matchAllSubjects,
    clearCache,
    SUBJECT_IDS
  };

  // Bakoverkompatibilitet: behold den globale funksjonen som tidligere
  // ble eksponert direkte uten namespace.
  global.matchEmneForText = matchEmneForText;
})(typeof window !== "undefined" ? window : globalThis);
