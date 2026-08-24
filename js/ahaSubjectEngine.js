(function (global) {
  "use strict";

  const BRIDGE_URL = "/data/integrations/history-go-fagverk-bridge.v2.json";
  const INDEX_URL = "/data/integrations/runtime/history-go-fagverk-canonical-index.v2.json";
  const OVERLAY_URL = "/data/subjects/subjects_index.json";
  const cache = { bridge: null, index: null, overlays: null, subjects: {} };
  const NOISE = new Set(["og","eller","som","det","den","de","til","fra","for","med","på","av","i","om","at","er","var","kan","fag","emne","tekst","tema","analyse","canonical","active","hvordan","hvem","hva","hvorfor","får","få","gjennom","styring","makt","samfunn","institusjon","institusjoner","historie","historisk","kapittel"]);

  function normalize(value) { return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim(); }
  function unique(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : [values]).flatMap((value) => Array.isArray(value) ? value : [value]).map((value) => String(value || "").trim()).filter((value) => { const key = normalize(value); if (!key || seen.has(key)) return false; seen.add(key); return true; });
  }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function cleanText(value) { return global.AHAAnalysisText?.cleanTextForAnalysis ? global.AHAAnalysisText.cleanTextForAnalysis(value) : String(value || ""); }
  async function json(url, label) { const response = await fetch(url, { cache: "force-cache" }); if (!response.ok) throw new Error(`${label || "json"} ${response.status}`); return response.json(); }

  async function bridge() {
    if (cache.bridge) return cache.bridge;
    const data = await json(BRIDGE_URL, "bridge");
    if (data?.schema !== "aha_history_go_fagverk_bridge_v2" || data?.authority !== "history_go_canonical_fagverk") throw new Error("Unsupported History-Go Fagverk bridge.");
    if (!/^[a-f0-9]{40}$/iu.test(String(data?.canonical_source?.source_ref || ""))) throw new Error("History-Go Fagverk bridge must pin an exact commit.");
    cache.bridge = data; return data;
  }
  function validateIndex(b, index) {
    if (index?.schema !== "aha_history_go_fagverk_canonical_index_v2" || index?.authority !== "derived_cache_only") throw new Error("Canonical History-Go Fagverk deployment index missing or invalid.");
    if (index?.canonical_source?.repository !== b?.canonical_source?.repository || index?.canonical_source?.source_ref !== b?.canonical_source?.source_ref) throw new Error("Canonical Fagverk deployment index source identity mismatch.");
    const expected = object(b.expected);
    if (index?.canonical_source?.registry_content_sha256 !== expected.registry_sha256 || index?.canonical_source?.subject_inventory_content_sha256 !== expected.subject_inventory_sha256 || index?.canonical_source?.fag_manifest_content_sha256 !== expected.fag_manifest_sha256) throw new Error("Canonical Fagverk deployment index digest mismatch.");
    if (Number(index?.summary?.root_subject_count) !== Number(expected.root_subject_count) || Number(index?.summary?.specialization_count) !== Number(expected.specialization_count) || Number(index?.summary?.missing_file_count) !== 0) throw new Error("Canonical Fagverk deployment index is incomplete.");
    if (!Array.isArray(index.subjects) || index.subjects.length !== Number(expected.root_subject_count) + Number(expected.specialization_count)) throw new Error("Canonical Fagverk deployment index subject count mismatch.");
    const ids = index.subjects.map((subject) => String(subject?.subject_id || ""));
    if (new Set(ids).size !== ids.length || ids.some((id) => !id)) throw new Error("Canonical Fagverk deployment index contains invalid subject IDs.");
  }
  async function deploymentIndex() {
    if (cache.index) return cache.index;
    const [b, index] = await Promise.all([bridge(), json(INDEX_URL, "canonical index")]);
    validateIndex(b, index); cache.index = index; return index;
  }
  async function overlayIndex() {
    if (cache.overlays) return cache.overlays;
    try {
      const data = await json(OVERLAY_URL, "overlay index");
      if (data?.schema !== "aha_subject_overlays_v1" || data?.authority !== "overlay_only") throw new Error("Local subject data must be overlay_only.");
      cache.overlays = Array.isArray(data.subjects) ? data.subjects : [];
    } catch (error) { console.warn("AHASubjectEngine: overlays unavailable", error); cache.overlays = []; }
    return cache.overlays;
  }
  function canonicalTargets(entry) { return unique(Array.isArray(entry?.canonical_subject_ids) && entry.canonical_subject_ids.length ? entry.canonical_subject_ids : [entry?.subject_id]); }
  async function localEmner(subjectId) {
    const result = [];
    for (const entry of (await overlayIndex()).filter((item) => canonicalTargets(item).includes(subjectId))) {
      const file = String(entry.file || ""); if (!file || file.includes("/") || file.includes("..")) continue;
      try {
        const data = await json(`/data/subjects/${file}`, `overlay ${file}`);
        for (const emne of Array.isArray(data?.emner) ? data.emner : []) {
          if (emne?.fagverk) continue;
          result.push({ ...emne, local_knowledge: { ...object(emne.local_knowledge), classification: String(emne?.local_knowledge?.classification || "aha_overlay"), canonical_subject_ids: unique(emne?.local_knowledge?.canonical_subject_ids || [subjectId]), revalidate_on_runtime_change: true } });
        }
      } catch (error) { console.warn(`AHASubjectEngine: overlay ${file} unavailable`, error); }
    }
    return result;
  }

  function canonicalEmne(raw, subject) {
    const item = object(raw);
    return { emne_id: String(item.emne_id || ""), title: String(item.title || item.emne_id || ""), core_concepts: unique(item.core_concepts || []), keywords: unique(item.keywords || []), thinkers: unique(item.thinkers || []), methods: unique(item.methods || []), chapter_specific_terms: unique(item.semantic_terms || []), learning_goals: [], checkpoints: [], summary: String(item.definition || ""), description: String(item.why_it_matters || item.definition || ""), fagverk: { source_repo: "Paradispartiet/History-Go", source_ref: String(item.source_ref || subject.source_ref || ""), canonical_subject_id: subject.subject_id, source_path: String(item.source_path || subject?.package?.emner_path || ""), registry_path: "data/fagverk/fagverk_registry.json", manifest_path: "data/fag/fag_manifest.json", package_field: "emner", minimum_matched_terms: 2, term_source: "history_go_manifest_emner_v2", generation_mode: "canonical_history_go_deployment_index_v2" } };
  }
  function methodEmne(raw, subject) {
    const item = object(raw);
    return { emne_id: `method:${String(item.method_id || "")}`, title: String(item.title || item.short_label || item.method_id || ""), core_concepts: unique([item.short_label, ...(item.data_forms || [])]), keywords: unique(item.emne_affinities || []), thinkers: [], methods: [], learning_goals: [], checkpoints: [], summary: String(item.description || ""), description: String(item.description || ""), fagverk: { source_repo: "Paradispartiet/History-Go", source_ref: String(item.source_ref || subject.source_ref || ""), canonical_subject_id: subject.subject_id, source_path: String(item.source_path || subject?.package?.methods_path || ""), registry_path: "data/fagverk/fagverk_registry.json", manifest_path: "data/fag/fag_manifest.json", package_field: "methods", minimum_matched_terms: 2, term_source: "history_go_manifest_methods_v2", generation_mode: "canonical_history_go_deployment_index_v2" } };
  }
  function chapterEmne(raw, subject) {
    const item = object(raw), id = String(item.chapter_id || "");
    const chapterSupervisionTerms = unique([...titleTokens(item.title || id), ...titleTokens(item.subtitle || "")]);
    return { emne_id: `fagverk_${subject.subject_id}_${id}`, title: String(item.title || id), core_concepts: unique(item.core_concepts || []), keywords: unique(item.keywords || []), thinkers: unique(item.thinkers || []), methods: unique(item.methods || []), chapter_specific_terms: unique([...(item.semantic_terms || []), ...chapterSupervisionTerms]), chapter_supervision_terms: chapterSupervisionTerms, learning_goals: [], checkpoints: [], summary: String(item.subtitle || ""), description: String(item.subtitle || ""), fagverk: { source_repo: "Paradispartiet/History-Go", source_ref: String(item.source_ref || subject.source_ref || ""), canonical_subject_id: subject.subject_id, chapter_id: id, source_path: String(item.source_path || ""), registry_path: "data/fagverk/fagverk_registry.json", manifest_path: "data/fag/fag_manifest.json", package_field: "chapter_registry", minimum_matched_terms: 2, term_source: "history_go_registry_plus_manifest_emner_v2", generation_mode: "canonical_history_go_deployment_index_v2" } };
  }
  function supplementEmne(raw, subject, index) {
    const item = object(raw), sourcePath = String(item.source_path || ""), id = normalize(sourcePath).replace(/\s+/g, "_") || String(index + 1);
    return { emne_id: `package:${id}`, title: String(item.title || item.package_field || sourcePath), core_concepts: unique(item.semantic_terms || []), keywords: [], thinkers: [], methods: [], learning_goals: [], checkpoints: [], summary: String(item.summary || ""), description: String(item.summary || ""), fagverk: { source_repo: "Paradispartiet/History-Go", source_ref: String(item.source_ref || subject.source_ref || ""), canonical_subject_id: subject.subject_id, source_path: sourcePath, registry_path: "data/fagverk/fagverk_registry.json", manifest_path: "data/fag/fag_manifest.json", package_field: String(item.package_field || "supplement"), minimum_matched_terms: 2, term_source: "history_go_manifest_supplement_index_v2", generation_mode: "canonical_history_go_deployment_index_v2" } };
  }

  async function listSubjects() {
    const index = await deploymentIndex();
    return index.subjects.map((subject) => ({ subject_id: subject.subject_id, subject_label: subject.subject_label, description: subject.description, kind: subject.kind, parent_subject_id: subject.parent_subject_id || null, schema_family: subject.schema_family || "", source_ref: subject.source_ref, canonical: true }));
  }
  async function loadPackage(subjectId, field) {
    const index = await deploymentIndex(); const subject = index.subjects.find((item) => item.subject_id === subjectId); if (!subject) return null;
    if (field === "emner") return { data: subject.emner || [], source_path: subject?.package?.emner_path || "" };
    if (field === "methods") return { data: subject.methods || [], source_path: subject?.package?.methods_path || "" };
    if (field === "chapters") return { data: subject.chapters || [], source_path: "data/fagverk/fagverk_registry.json" };
    if (field === "supplements") return { data: subject.supplements || [], source_path: "data/fag/fag_manifest.json" };
    return null;
  }
  async function loadSubject(subjectId) {
    const id = String(subjectId || "").trim(); if (!id) return null; if (cache.subjects[id]) return cache.subjects[id];
    const index = await deploymentIndex(); const canonical = index.subjects.find((item) => item.subject_id === id); if (!canonical) return null;
    const overlays = await localEmner(id);
    const canonicalEntries = [ ...(canonical.emner || []).map((item) => canonicalEmne(item, canonical)), ...(canonical.methods || []).map((item) => methodEmne(item, canonical)), ...(canonical.chapters || []).map((item) => chapterEmne(item, canonical)), ...(canonical.supplements || []).map((item, index) => supplementEmne(item, canonical, index)) ];
    const seen = new Set();
    const emner = [...canonicalEntries, ...overlays].filter((entry) => { const key = `${entry.emne_id}|${normalize(entry.title)}`; if (!entry.emne_id || seen.has(key)) return false; seen.add(key); return true; });
    const subject = { subject_id: canonical.subject_id, subject_label: canonical.subject_label, description: canonical.description, kind: canonical.kind, parent_subject_id: canonical.parent_subject_id || null, schema_family: canonical.schema_family || "", source_ref: canonical.source_ref, authority: "history_go_canonical_fagverk", emner };
    cache.subjects[id] = subject; return subject;
  }
  async function loadAllSubjects() { return (await Promise.all((await listSubjects()).map((subject) => loadSubject(subject.subject_id)))).filter(Boolean); }

  function containsNormalizedSubjectTerm(haystack, term) { const needle = normalize(term); return Boolean(haystack && needle && ` ${haystack} `.includes(` ${needle} `)); }
  function containsSubjectTerm(text, term) { return containsNormalizedSubjectTerm(normalize(text), term); }
  function matchedNormalized(haystack, values) { return unique(Array.isArray(values) ? values : [values]).filter((value) => value.length <= 180 && containsNormalizedSubjectTerm(haystack, value)); }
  function relevant(values) { return unique(values).filter((value) => { const key = normalize(value); return key.length >= 3 && !NOISE.has(key); }); }
  function titleTokens(value) { return relevant(normalize(value).split(" ").filter((token) => token.length >= 4)); }
  function lexicalFamily(leftValue, rightValue) {
    const left = normalize(leftValue), right = normalize(rightValue);
    if (!left || !right) return false;
    if (left === right) return true;
    if (left.length < 6 || right.length < 6) return false;
    let common = 0;
    while (common < left.length && common < right.length && left[common] === right[common]) common += 1;
    return common >= 6 && common / Math.min(left.length, right.length) >= 0.7;
  }
  function chapterSupervisionMatches(targetTokens, values) {
    return relevant(values).filter((term) => targetTokens.some((token) => lexicalFamily(term, token)));
  }
  function buildMatchProvenance(subject, emne) {
    if (emne?.fagverk) return { kind: "canonical_fagverk", evidence_role: "reference_support_not_source_evidence", canonical_subject_id: String(emne.fagverk.canonical_subject_id || subject.subject_id), chapter_id: String(emne.fagverk.chapter_id || ""), source_repo: String(emne.fagverk.source_repo || "Paradispartiet/History-Go"), source_ref: String(emne.fagverk.source_ref || subject.source_ref || ""), source_path: String(emne.fagverk.source_path || ""), registry_path: String(emne.fagverk.registry_path || ""), manifest_path: String(emne.fagverk.manifest_path || ""), package_field: String(emne.fagverk.package_field || ""), term_source: String(emne.fagverk.term_source || ""), generation_mode: String(emne.fagverk.generation_mode || "") };
    if (emne?.local_knowledge) return { kind: "aha_local_overlay", evidence_role: "local_reference_support_not_source_evidence", classification: String(emne.local_knowledge.classification || ""), canonical_subject_ids: unique(emne.local_knowledge.canonical_subject_ids || []), revalidate_on_runtime_change: true };
    return null;
  }
  function matchClass(emne) {
    const id = String(emne?.emne_id || "");
    if (id.startsWith("method:")) return "method";
    if (id.startsWith("package:")) return "supplement";
    if (id.startsWith("fagverk_") && emne?.fagverk?.chapter_id) return "chapter";
    if (emne?.local_knowledge) return "overlay";
    return "emne";
  }
  function fieldsForClass(emne, kind) {
    if (kind === "method") return [["title", emne.title, 1.5], ["core", emne.core_concepts, 0.75], ["keywords", emne.keywords, 0.5], ["summary", emne.summary, 0.25]];
    if (kind === "supplement") return [["title", emne.title, 4], ["core", emne.core_concepts, 4.5], ["summary", emne.summary, 0.5]];
    if (kind === "chapter") return [["title", emne.title, 5], ["title_tokens", titleTokens(emne.title), 4.5], ["core", emne.core_concepts, 4.5], ["keywords", emne.keywords, 2.5], ["thinkers", emne.thinkers, 2.5], ["specific", emne.chapter_specific_terms, 2], ["methods", emne.methods, 1], ["summary", emne.summary, 1]];
    return [["title", emne.title, 6], ["core", emne.core_concepts, 5], ["keywords", emne.keywords, 3], ["thinkers", emne.thinkers, 3], ["methods", emne.methods, 1.5], ["summary", emne.summary, 0.75], ["description", emne.description, 0.5]];
  }

  async function matchText(text, options = {}) {
    const target = normalize(cleanText(text)); if (!target) return [];
    const targetTokens = relevant(target.split(" ").filter((token) => token.length >= 4));
    let subjects;
    try { subjects = await loadAllSubjects(); } catch (error) { console.warn("AHASubjectEngine: canonical Fagverk deployment index unavailable; fail closed", error); return []; }
    const out = [];
    for (const subject of subjects) {
      const subjectHits = relevant(matchedNormalized(target, subject.subject_label));
      if (subjectHits.length) out.push({ subject_id: subject.subject_id, subject_label: subject.subject_label, emne_id: null, title: subject.subject_label, type: subject.kind || "subject", score: 1.5 + subjectHits.length, matched_terms: subjectHits, source: options.source || "text", strong: false, provenance: { kind: "canonical_fagverk_subject", evidence_role: "reference_support_not_source_evidence", source_repo: "Paradispartiet/History-Go", source_ref: subject.source_ref, canonical_subject_id: subject.subject_id, registry_path: "data/fagverk/fagverk_registry.json", manifest_path: "data/fag/fag_manifest.json", generation_mode: "canonical_history_go_deployment_index_v2" } });
      for (const emne of subject.emner || []) {
        const kind = matchClass(emne), fields = fieldsForClass(emne, kind); let strong = false; const termScores = new Map(); const chapterSpecificHits = kind === "chapter" ? relevant(matchedNormalized(target, emne.chapter_specific_terms || [])) : []; const chapterSupervisionHits = kind === "chapter" ? chapterSupervisionMatches(targetTokens, emne.chapter_supervision_terms || []) : [];
        for (const [name, values, weight] of fields) {
          const hits = relevant(matchedNormalized(target, values)); if (!hits.length) continue;
          for (const hit of hits) {
            const key = normalize(hit); if (!key) continue;
            const previous = termScores.get(key);
            if (!previous || weight > previous.weight) termScores.set(key, { term: hit, weight });
          }
          if (kind !== "method" && (name === "title" || name === "core")) strong = true;
        }
        const found = relevant(Array.from(termScores.values()).map((entry) => entry.term)); if (!found.length) continue;
        let score = Array.from(termScores.values()).reduce((sum, entry) => sum + entry.weight, 0);
        const minimum = Math.max(1, Number(emne?.fagverk?.minimum_matched_terms || emne?.local_knowledge?.minimum_matched_terms || 1));
        if (found.length < minimum && !strong) continue;
        const phraseBonus = kind === "method" ? 0 : found.reduce((sum, term) => sum + (normalize(term).includes(" ") ? 3 : 0), 0);
        score += Math.max(0, found.length - 1) * (kind === "method" ? 0.25 : 1.5) + (strong ? 2 : 0) + (kind === "overlay" && strong ? 1 : 0) + phraseBonus;
        const type = kind === "method" ? "method" : kind === "supplement" ? "supplement" : kind === "chapter" ? "chapter" : (emne.thinkers || []).some((value) => found.includes(value)) ? "thinker" : (emne.core_concepts || []).some((value) => found.includes(value)) ? "concept" : "emne";
        out.push({ subject_id: subject.subject_id, subject_label: subject.subject_label, emne_id: emne.emne_id, title: emne.title, type, score, matched_terms: found, strong, source: options.source || "text", provenance: buildMatchProvenance(subject, emne), _chapter_specific_hits: chapterSpecificHits, _chapter_supervision_hits: chapterSupervisionHits });
      }
    }

    const primarySupportBySubject = new Map();
    for (const match of out) {
      if (!["emne", "concept", "thinker", "overlay"].includes(match.type) || !match.emne_id) continue;
      primarySupportBySubject.set(match.subject_id, Math.max(primarySupportBySubject.get(match.subject_id) || 0, Number(match.score || 0)));
    }
    const maxPrimarySupport = Math.max(0, ...primarySupportBySubject.values());
    const chapterSpecificityEligibleSubjects = new Set();
    if (maxPrimarySupport >= 8) {
      const derivedFloor = maxPrimarySupport * 0.5;
      for (const [subjectId, support] of primarySupportBySubject.entries()) if (support >= derivedFloor) chapterSpecificityEligibleSubjects.add(subjectId);
      for (let index = out.length - 1; index >= 0; index -= 1) {
        const match = out[index];
        if (!["chapter", "supplement", "method"].includes(match.type)) continue;
        if ((primarySupportBySubject.get(match.subject_id) || 0) < derivedFloor) out.splice(index, 1);
      }
    }

    const termSubjects = new Map();
    const termEntriesWithinSubject = new Map();
    for (const match of out) for (const term of match.matched_terms || []) {
      const key = normalize(term); if (!key) continue;
      if (!termSubjects.has(key)) termSubjects.set(key, new Set()); termSubjects.get(key).add(match.subject_id);
      if (match.emne_id) {
        const subjectKey = `${match.subject_id}|${key}`;
        if (!termEntriesWithinSubject.has(subjectKey)) termEntriesWithinSubject.set(subjectKey, new Set());
        termEntriesWithinSubject.get(subjectKey).add(match.emne_id);
      }
    }
    const chapterSpecificEntriesWithinSubject = new Map();
    for (const match of out) {
      if (match.type !== "chapter" || !match.emne_id || !chapterSpecificityEligibleSubjects.has(match.subject_id)) continue;
      for (const term of match._chapter_specific_hits || []) {
        const key = `${match.subject_id}|${normalize(term)}`;
        if (!chapterSpecificEntriesWithinSubject.has(key)) chapterSpecificEntriesWithinSubject.set(key, new Set());
        chapterSpecificEntriesWithinSubject.get(key).add(match.emne_id);
      }
    }
    const substantiveCounts = new Map();
    for (const match of out) if (match.strong && match.type !== "method" && match.emne_id) substantiveCounts.set(match.subject_id, (substantiveCounts.get(match.subject_id) || 0) + 1);
    for (const match of out) {
      if (match.type !== "method" && match.emne_id) {
        const count = substantiveCounts.get(match.subject_id) || 0;
        match.score += Math.min(3, Math.max(0, count - 1) * 0.75);
        let rarity = 0;
        let specificity = 0;
        for (const term of match.matched_terms || []) {
          const normalizedTerm = normalize(term);
          const subjectCount = termSubjects.get(normalizedTerm)?.size || 0;
          rarity += subjectCount === 1 ? 2.5 : subjectCount === 2 ? 1.25 : subjectCount === 3 ? 0.5 : 0;
          const entryCount = termEntriesWithinSubject.get(`${match.subject_id}|${normalizedTerm}`)?.size || 0;
          specificity += entryCount === 1 ? 2 : entryCount === 2 ? 1 : entryCount === 3 ? 0.4 : 0;
        }
        let chapterSpecificity = 0;
        if (match.type === "chapter" && chapterSpecificityEligibleSubjects.has(match.subject_id)) {
          for (const term of match._chapter_specific_hits || []) {
            const entryCount = chapterSpecificEntriesWithinSubject.get(`${match.subject_id}|${normalize(term)}`)?.size || 0;
            chapterSpecificity += entryCount === 1 ? 4 : entryCount === 2 ? 2 : entryCount === 3 ? 0.75 : 0;
          }
        }
        match.score += Math.min(5, rarity) + Math.min(6, specificity) + Math.min(12, chapterSpecificity);
      }
    }

    const primaryRowsBySubject = new Map();
    for (const match of out) {
      if (!["emne", "concept", "thinker", "overlay"].includes(match.type) || !match.emne_id) continue;
      if (!primaryRowsBySubject.has(match.subject_id)) primaryRowsBySubject.set(match.subject_id, []);
      primaryRowsBySubject.get(match.subject_id).push(match);
    }
    const primaryTermsBySubject = new Map();
    for (const [subjectId, matches] of primaryRowsBySubject.entries()) {
      const ranked = matches.slice().sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).slice(0, 3);
      const terms = new Set();
      for (const match of ranked) for (const term of match.matched_terms || []) { const key = normalize(term); if (key) terms.add(key); }
      primaryTermsBySubject.set(subjectId, terms);
    }
    const rankedSubjectSupportBySubject = new Map();
    for (const [subjectId, matches] of primaryRowsBySubject.entries()) {
      const ranked = matches.slice().sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
      const weights = [1, 0.5, 0.25];
      let support = 0;
      for (let index = 0; index < Math.min(3, ranked.length); index += 1) support += Number(ranked[index]?.score || 0) * weights[index];
      const terms = new Set();
      for (const match of ranked) for (const term of match.matched_terms || []) { const key = normalize(term); if (key) terms.add(key); }
      support += Math.min(4, Math.max(0, terms.size - 1) * 0.75);
      rankedSubjectSupportBySubject.set(subjectId, support);
    }
    const rankedSubjectMax = Math.max(0, ...rankedSubjectSupportBySubject.values());
    const subjectFirst = rankedSubjectMax >= 8;
    const subjectSupport = (match) => Number(rankedSubjectSupportBySubject.get(match.subject_id) || 0);
    const chapterSpecificityRank = (match) => {
      if (match.type !== "chapter" || !chapterSpecificityEligibleSubjects.has(match.subject_id)) return 0;
      let rank = 0;
      for (const term of match._chapter_specific_hits || []) {
        const entryCount = chapterSpecificEntriesWithinSubject.get(`${match.subject_id}|${normalize(term)}`)?.size || 0;
        rank += entryCount === 1 ? 4 : entryCount === 2 ? 2 : entryCount === 3 ? 0.75 : 0;
      }
      return rank;
    };
    const chapterPrimaryAlignment = (match) => {
      if (match.type !== "chapter") return 0;
      const primaryTerms = primaryTermsBySubject.get(match.subject_id);
      if (!primaryTerms?.size) return 0;
      let aligned = 0;
      for (const term of match._chapter_specific_hits || []) if (primaryTerms.has(normalize(term))) aligned += 1;
      return aligned;
    };
    const decisiveChapter = (match) => match.type === "chapter" && (match._chapter_specific_hits || []).length >= 2 && chapterSpecificityRank(match) >= 4;
    const globallyDecisiveChapter = (match) => match.type === "chapter" && (match._chapter_specific_hits || []).length >= 3 && chapterSpecificityRank(match) >= 12;
    const typeRank = { supplement: 6, chapter: 5, concept: 4, thinker: 4, emne: 3, method: 1, subject: 0 };
    out.sort((a, b) => {
      if (subjectFirst) {
        if (a.subject_id === b.subject_id) {
          const aSupervision = a.type === "chapter" ? (a._chapter_supervision_hits || []).length : 0;
          const bSupervision = b.type === "chapter" ? (b._chapter_supervision_hits || []).length : 0;
          const aSupervised = aSupervision >= 2;
          const bSupervised = bSupervision >= 2;
          if (aSupervised !== bSupervised) return aSupervised ? -1 : 1;
          if (a.type === "chapter" && b.type === "chapter") {
            const scoreDelta = Number(b.score || 0) - Number(a.score || 0);
            if (Math.abs(scoreDelta) > 2.5) return scoreDelta;
          }
          if (aSupervised && bSupervised && bSupervision !== aSupervision && Math.abs(Number(a.score || 0) - Number(b.score || 0)) <= 2.5) return bSupervision - aSupervision;
        }
        const aGlobalDecisive = globallyDecisiveChapter(a);
        const bGlobalDecisive = globallyDecisiveChapter(b);
        if (aGlobalDecisive !== bGlobalDecisive) return aGlobalDecisive ? -1 : 1;
        if (aGlobalDecisive && bGlobalDecisive) {
          const globalSpecificityDelta = chapterSpecificityRank(b) - chapterSpecificityRank(a);
          if (Math.abs(globalSpecificityDelta) > 1e-9) return globalSpecificityDelta;
          if (b.score !== a.score) return b.score - a.score;
        }
        const primarySubjectDelta = subjectSupport(b) - subjectSupport(a);
        if (Math.abs(primarySubjectDelta) > 1e-9) return primarySubjectDelta;
        const aDecisive = decisiveChapter(a);
        const bDecisive = decisiveChapter(b);
        if (aDecisive !== bDecisive) return aDecisive ? -1 : 1;
        if (aDecisive && bDecisive) {
          const alignmentDelta = chapterPrimaryAlignment(b) - chapterPrimaryAlignment(a);
          if (alignmentDelta !== 0) return alignmentDelta;
          const specificityDelta = chapterSpecificityRank(b) - chapterSpecificityRank(a);
          if (Math.abs(specificityDelta) > 1e-9) return specificityDelta;
          if (b.score !== a.score) return b.score - a.score;
        }
        const subjectDelta = subjectSupport(b) - subjectSupport(a);
        if (Math.abs(subjectDelta) > 1e-9) return subjectDelta;
        if (a.subject_id === b.subject_id && a.type === "chapter" && b.type === "chapter") {
          const aHits = (a._chapter_specific_hits || []).length;
          const bHits = (b._chapter_specific_hits || []).length;
          if (Math.max(aHits, bHits) >= 2) {
            const alignmentDelta = chapterPrimaryAlignment(b) - chapterPrimaryAlignment(a);
            if (alignmentDelta !== 0) return alignmentDelta;
            const specificityDelta = chapterSpecificityRank(b) - chapterSpecificityRank(a);
            if (Math.abs(specificityDelta) > 1e-9) return specificityDelta;
            if (bHits !== aHits) return bHits - aHits;
          }
        }
      }
      return b.score - a.score || (typeRank[b.type] || 0) - (typeRank[a.type] || 0) || String(a.subject_id).localeCompare(String(b.subject_id));
    });
    if (!out.length) return [];
    const best = out[0].score, floor = Math.max(best * 0.45, best - 5), limit = Math.min(8, Number(options.maxResults || options.limit) || 8), seen = new Set();
    return out.filter((match) => match.score >= floor && (match.strong || match.matched_terms.length >= 2)).filter((match) => { const key = `${match.subject_id}|${match.emne_id || ""}|${normalize(match.title)}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, limit).map(({ _chapter_specific_hits, _chapter_supervision_hits, ...match }) => match);
  }

  function flatten(value) { if (Array.isArray(value)) return value.map(flatten).join(" "); if (value && typeof value === "object") return Object.values(value).map(flatten).join(" "); return String(value || ""); }
  async function matchInsight(insight, options) { return matchText(flatten(insight), { ...(options || {}), source: "insight" }); }
  function resetCacheForTests() { cache.bridge = null; cache.index = null; cache.overlays = null; cache.subjects = {}; }

  global.AHASubjectEngine = { listSubjects, loadSubject, loadAllSubjects, loadPackage, matchText, matchInsight };
  global.AHASubjectEngineTestHooks = { normalizeSubjectMatchText: normalize, containsSubjectTerm, buildMatchProvenance, resetCacheForTests, validateIndex };
})(window);
