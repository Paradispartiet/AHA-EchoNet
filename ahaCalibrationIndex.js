// ahaCalibrationIndex.js
(function (global) {
  "use strict";

  const VERSION = "aha_calibration_index_v1";
  const CACHE_KEY = VERSION;
  const CACHE_META_KEY = `${VERSION}:meta`;
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const RAW_BASE = "https://raw.githubusercontent.com/Paradispartiet/History-Go/main/";
  const EMNER_LOADER_URL = `${RAW_BASE}js/emnerLoader.js`;
  const PLACE_MANIFEST_URL = `${RAW_BASE}data/places/manifest.json`;
  const MAX_PLACE_CONTEXT = 300;

  const STOPWORDS = new Set(["og","i","på","for","med","til","av","en","et","det","som","er","om","fra","den","de","at","å","the","and","of"]);
  const DEF_SPLIT_RE = /[.;:!?]\s+|\n+/g;

  let state = { loaded: false, loading: false, cached: false, last_error: null, source_count: 0, fag_file_count: 0, loaded_fag_file_count: 0, place_file_count: 0, file_errors: [], file_error_count: 0 };
  let index = emptyIndex();
  let loadingPromise = null;

  function emptyIndex() {
    return {
      version: VERSION, generated_at: new Date().toISOString(), source: "historygo_fag",
      subjects: [], subjectProfiles: [], categories: [], categoryProfiles: [], concepts: [], relations: [], progressionLevels: [], theoryHooks: [], methodProfiles: [], questionPatterns: [], conflictPatterns: [], blindspotPatterns: [], nextStepRules: [], placeContext: [], emner: []
    };
  }

  function normalizeText(v) { return String(v || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim(); }
  function asArray(v) { return Array.isArray(v) ? v : (v == null ? [] : [v]); }
  async function fetchJson(path) { const r = await fetch(path); if (!r.ok) throw new Error(`Fetch failed ${path}: ${r.status}`); return r.json(); }
  async function fetchText(path) { const r = await fetch(path); if (!r.ok) throw new Error(`Fetch failed ${path}: ${r.status}`); return r.text(); }

  function applyCachedStats() {
    state.fag_file_count = Number(index?._meta?.fag_file_count || state.fag_file_count || 0);
    state.loaded_fag_file_count = Number(index?._meta?.loaded_fag_file_count || state.loaded_fag_file_count || 0);
    state.place_file_count = Number(index?._meta?.place_file_count || state.place_file_count || 0);
    state.file_errors = Array.isArray(index?._meta?.file_errors) ? index._meta.file_errors : (state.file_errors || []);
    state.file_error_count = Number(index?._meta?.file_error_count || state.file_errors.length || 0);
    state.source_count = Number(index?._meta?.source_count || (1 + state.fag_file_count + state.place_file_count));
  }

  function readCachedIndexSync(ignoreTtl) {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (!cached) return null;
      if (!ignoreTtl) {
        const meta = JSON.parse(localStorage.getItem(CACHE_META_KEY) || "null");
        if (!meta?.saved_at || Date.now() - meta.saved_at >= CACHE_TTL_MS) return null;
      }
      index = cached;
      state.loaded = true;
      state.cached = true;
      applyCachedStats();
      return index;
    } catch {
      return null;
    }
  }

  function parseEmnerIndex(loaderText) {
    const m = loaderText.match(/EMNER_INDEX\s*=\s*\{([\s\S]*?)\}\s*;/);
    if (!m) return [];
    const block = m[1];
    const re = /:\s*["'`](data\/fag\/[\w\-\/]+\.json)["'`]/g;
    const files = [];
    let hit;
    while ((hit = re.exec(block))) files.push(hit[1]);
    return Array.from(new Set(files));
  }

  function addConcept(target, emne, value, sourceField, weight) {
    const label = String(value || "").trim();
    const key = normalizeText(label);
    if (!label || !key || key.length < 3 || STOPWORDS.has(key) || label.length > 120) return;
    target.push({ key, label, sourceField, weight, emne_id: emne.emne_id || null, subject_id: emne.subject_id || null, area_id: emne.area_id || null, area_label: emne.area_label || null, source: "historygo_fag_calibration" });
  }
  function addManyConcepts(target, emne, field, weight) { asArray(emne[field]).forEach((v) => addConcept(target, emne, v, field, weight)); }

  function extractDefinitionPhrases(text) {
    const parts = String(text || "").split(DEF_SPLIT_RE).map((p) => p.trim()).filter(Boolean);
    return parts.filter((p) => p.length >= 12 && p.length <= 80 && p.split(/\s+/).length <= 8).slice(0, 6);
  }

  function buildFromEmne(emne, out) {
    const compactEmne = {
      emne_id: emne.emne_id || null,
      subject_id: emne.subject_id || null,
      title: emne.title || null,
      short_label: emne.short_label || null,
      area_id: emne.area_id || null,
      area_label: emne.area_label || null,
      level: emne.level || null,
      progression_stage: emne.progression_stage || null,
      pedagogical_track: emne.pedagogical_track || null,
      corpusText: [emne.definition || "", emne.why_it_matters || ""].join("\n").trim()
    };
    out.emner.push(compactEmne);
    if (emne.subject_id) out.subjects.push({ id: emne.subject_id, label: emne.subject_id });
    if (emne.area_id || emne.area_label) out.categories.push({ id: emne.area_id || emne.area_label, label: emne.area_label || emne.area_id });

    addManyConcepts(out.concepts, emne, "keywords", 1.0);
    addManyConcepts(out.concepts, emne, "key_concepts", 1.25);
    addManyConcepts(out.concepts, emne, "core_concepts", 1.6);
    addManyConcepts(out.concepts, emne, "sub_concepts", 1.1);
    addManyConcepts(out.concepts, emne, "dimensions", 1.1);
    addManyConcepts(out.concepts, emne, "analysis_axes", 1.2);
    addManyConcepts(out.concepts, emne, "methods", 1.15);
    addManyConcepts(out.concepts, emne, "conflicts", 1.0);
    addManyConcepts(out.concepts, emne, "ideological_dimensions", 1.0);
    addConcept(out.concepts, emne, emne.title, "title", 1.15);
    addConcept(out.concepts, emne, emne.short_label, "short_label", 1.15);
    extractDefinitionPhrases(emne.definition).forEach((p) => addConcept(out.concepts, emne, p, "definition_phrase", 1.2));
    extractDefinitionPhrases(emne.why_it_matters).forEach((p) => addConcept(out.concepts, emne, p, "why_phrase", 1.15));

    out.relations.push({ emne_id: emne.emne_id || null, related_emner: asArray(emne.related_emner), parent_emne_id: emne.parent_emne_id || null, area_id: emne.area_id || null, area_label: emne.area_label || null, domain: emne.domain || null, logic_family: emne.logic_family || null, akse: emne.akse || null, distinguish_from_emner: asArray(emne.distinguish_from_emner) });
    out.progressionLevels.push({ emne_id: emne.emne_id || null, level: emne.level || null, progression_stage: emne.progression_stage || null, pedagogical_track: emne.pedagogical_track || null, history_weight: emne.history_weight || null, theory_weight: emne.theory_weight || null, broadness: emne.broadness || null, quiz_priority: emne.quiz_priority || null });
    out.theoryHooks.push({ emne_id: emne.emne_id || null, canonical_thinkers: asArray(emne.canonical_thinkers), canonical_thinker_ids: asArray(emne.canonical_thinker_ids), norwegian_thinkers: asArray(emne.norwegian_thinkers), primary_theory_hooks: asArray(emne.primary_theory_hooks), secondary_theory_hooks: asArray(emne.secondary_theory_hooks), reserve_theory_hooks: asArray(emne.reserve_theory_hooks), theory_progression_note: emne.theory_progression_note || null });
    out.methodProfiles.push({ emne_id: emne.emne_id || null, methods: asArray(emne.methods), method_ids: asArray(emne.method_ids), recommended_methods: asArray(emne.recommended_methods) });
    out.questionPatterns.push({ emne_id: emne.emne_id || null, key_questions: asArray(emne.key_questions), quiz_angles: asArray(emne.quiz_angles), question_surface_mode: emne.question_surface_mode || null, generator_use_note: emne.generator_use_note || null });
    out.conflictPatterns.push({ emne_id: emne.emne_id || null, conflicts: asArray(emne.conflicts), ideological_dimensions: asArray(emne.ideological_dimensions), analysis_axes: asArray(emne.analysis_axes), anti_patterns: asArray(emne.anti_patterns) });
    out.blindspotPatterns.push({ emne_id: emne.emne_id || null, blindspots: asArray(emne.blindspots), theory_overreach_risk: emne.theory_overreach_risk || null, overlap_risk: emne.overlap_risk || null, scope_guard: emne.scope_guard || null });
    out.nextStepRules.push({ emne_id: emne.emne_id || null, progression_stage: emne.progression_stage || null, pedagogical_track: emne.pedagogical_track || null, recommended_set_phases: asArray(emne.recommended_set_phases), generator_constraints: asArray(emne.generator_constraints), requires_history_anchor: !!emne.requires_history_anchor, requires_visible_trace: !!emne.requires_visible_trace });
  }

  function scoreMatch(textNorm, term, weight) { if (!textNorm.includes(term)) return 0; return weight * (term.includes(" ") ? 1.35 : 1); }

  function compactPlace(place) {
    const obj = place && typeof place === "object" ? place : {};
    return {
      id: obj.id || obj.place_id || null,
      name: obj.name || obj.title || null,
      category: obj.categoryId || obj.category || null,
      type: obj.type || null,
      place_type: obj.place_type || null,
      emner: asArray(obj.emner).slice(0, 12),
      concepts: asArray(obj.concepts).slice(0, 20),
      related_emner: asArray(obj.related_emner).slice(0, 12)
    };
  }

  function matchText(text, options) {
    if (!state.loaded) readCachedIndexSync(false);
    const topN = Math.max(1, Math.min(50, Number(options?.topN) || 12));
    const textNorm = normalizeText(text);
    const byEmne = new Map();
    const conceptHits = [];

    index.concepts.forEach((c) => {
      const s = scoreMatch(textNorm, c.key, c.weight || 1);
      if (s < 1.0) return;
      conceptHits.push({ key: c.key, label: c.label, score: s, subject_id: c.subject_id, emne_id: c.emne_id, area_id: c.area_id, area_label: c.area_label, source: "historygo_fag_calibration" });
      if (c.emne_id) byEmne.set(c.emne_id, (byEmne.get(c.emne_id) || 0) + s + 0.25);
    });

    index.emner.forEach((e) => {
      if (!e?.corpusText || !e.emne_id) return;
      const corpus = normalizeText(e.corpusText);
      if (!corpus) return;
      let overlap = 0;
      textNorm.split(/\s+/).forEach((t) => { if (t.length > 4 && corpus.includes(t)) overlap += 1; });
      if (overlap >= 2) byEmne.set(e.emne_id, (byEmne.get(e.emne_id) || 0) + Math.min(2.0, overlap * 0.35));
    });

    const dedupConcepts = []; const seen = new Set();
    conceptHits.sort((a, b) => b.score - a.score).forEach((c) => { if (!seen.has(c.key)) { seen.add(c.key); dedupConcepts.push(c); } });
    const emneMap = new Map(index.emner.map((e) => [e.emne_id, e]));
    const matched_emner = Array.from(byEmne.entries()).map(([emne_id, score]) => { const e = emneMap.get(emne_id) || {}; return { emne_id, subject_id: e.subject_id || null, title: e.title || null, short_label: e.short_label || null, score, level: e.level || null, progression_stage: e.progression_stage || null }; }).sort((a, b) => b.score - a.score).slice(0, topN);

    const catScore = new Map();
    dedupConcepts.forEach((c) => { if (c.area_id || c.area_label) { const id = c.area_id || c.area_label; catScore.set(id, (catScore.get(id) || 0) + c.score); } });
    const matched_categories = Array.from(catScore.entries()).map(([id, score]) => ({ id, label: id, score })).sort((a, b) => b.score - a.score).slice(0, 8);

    const matched_theory_hooks = []; index.theoryHooks.forEach((t) => { asArray(t.primary_theory_hooks).concat(asArray(t.secondary_theory_hooks), asArray(t.reserve_theory_hooks), asArray(t.canonical_thinkers), asArray(t.norwegian_thinkers)).forEach((label) => { const key = normalizeText(label); const s = scoreMatch(textNorm, key, 1.2); if (s > 0.9) matched_theory_hooks.push({ id: key, label, score: s, source_emne_id: t.emne_id || null }); }); });
    const matched_methods = []; index.methodProfiles.forEach((m) => { asArray(m.methods).concat(asArray(m.recommended_methods)).forEach((label) => { const key = normalizeText(label); const s = scoreMatch(textNorm, key, 1.1); if (s > 0.9) matched_methods.push({ id: key, label, score: s, source_emne_id: m.emne_id || null }); }); });

    return { matched_concepts: dedupConcepts.slice(0, topN), matched_categories, matched_emner, matched_theory_hooks: matched_theory_hooks.sort((a,b)=>b.score-a.score).slice(0, topN), matched_methods: matched_methods.sort((a,b)=>b.score-a.score).slice(0, topN), conflict_patterns: [], blindspot_patterns: [], suggested_next_steps: [], calibration_score: Math.min(1, dedupConcepts.slice(0, topN).reduce((a, c) => a + c.score, 0) / 20), source: "historygo_fag_calibration" };
  }

  async function buildIndex() {
    const out = emptyIndex();
    const loader = await fetchText(EMNER_LOADER_URL);
    const fagFiles = parseEmnerIndex(loader);
    state.fag_file_count = fagFiles.length;
    const fileErrors = [];
    let loadedFagFileCount = 0;
    for (const rel of fagFiles) {
      try {
        const data = await fetchJson(`${RAW_BASE}${rel}`);
        const emner = Array.isArray(data) ? data : (Array.isArray(data?.emner) ? data.emner : []);
        emner.forEach((emne) => buildFromEmne(emne || {}, out));
        loadedFagFileCount += 1;
      } catch (err) {
        fileErrors.push({ file: rel, error: String(err?.message || err) });
      }
    }

    try {
      const manifest = await fetchJson(PLACE_MANIFEST_URL);
      const paths = asArray(manifest?.files || manifest?.place_files || manifest);
      state.place_file_count = paths.length;
      for (const p of paths) {
        if (out.placeContext.length >= MAX_PLACE_CONTEXT) break;
        const data = await fetchJson(`${RAW_BASE}${String(p).replace(/^\/+/, "")}`);
        const places = Array.isArray(data) ? data : [data];
        for (const place of places) {
          if (out.placeContext.length >= MAX_PLACE_CONTEXT) break;
          out.placeContext.push(compactPlace(place));
        }
      }
    } catch {}

    out.subjects = Array.from(new Map(out.subjects.map((s) => [s.id, s])).values());
    out.categories = Array.from(new Map(out.categories.map((c) => [c.id, c])).values());
    out.generated_at = new Date().toISOString();
    out._meta = { fag_file_count: state.fag_file_count, loaded_fag_file_count: loadedFagFileCount, place_file_count: state.place_file_count, file_errors: fileErrors, file_error_count: fileErrors.length, source_count: 1 + state.fag_file_count + state.place_file_count };
    return out;
  }

  async function ensureLoaded(force) {
    if (state.loading && loadingPromise) return loadingPromise;
    if (!force && readCachedIndexSync(false)) return index;

    state.loading = true; state.last_error = null;
    loadingPromise = (async () => {
      try {
        index = await buildIndex();
        applyCachedStats();
        const conceptCount = Array.isArray(index?.concepts) ? index.concepts.length : 0;
        state.loaded = state.loaded_fag_file_count > 0 && conceptCount > 0;
        state.cached = false;
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(index));
          localStorage.setItem(CACHE_META_KEY, JSON.stringify({ saved_at: Date.now() }));
        } catch (err) {
          state.last_error = `cache_write_failed: ${String(err?.message || err)}`;
        }
        return index;
      } catch (err) {
        state.last_error = String(err?.message || err);
        if (readCachedIndexSync(true)) return index;
        index = emptyIndex(); state.loaded = false;
        return index;
      } finally { state.loading = false; loadingPromise = null; }
    })();
    return loadingPromise;
  }

  function getStatus() {
    applyCachedStats();
    return { loaded: !!state.loaded, loading: !!state.loading, source_count: state.source_count || 0, fag_file_count: state.fag_file_count || 0, loaded_fag_file_count: state.loaded_fag_file_count || 0, place_file_count: state.place_file_count || 0, file_errors: Array.isArray(state.file_errors) ? state.file_errors : [], file_error_count: state.file_error_count || 0, concept_count: index.concepts.length, category_count: index.categories.length, relation_count: index.relations.length, theory_hook_count: index.theoryHooks.length, method_count: index.methodProfiles.length, last_error: state.last_error, cached: !!state.cached };
  }

  function getIndex() { return index; }
  function rebuild() { return ensureLoaded(true); }

  global.AHACalibration = { ensureLoaded, getIndex, matchText, getStatus, rebuild };
  ensureLoaded(false).catch(() => {});
})(window);
