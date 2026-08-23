(function (global) {
  "use strict";

  const BRIDGE_URL = "/data/integrations/history-go-fagverk-bridge.v2.json";
  const OVERLAY_URL = "/data/subjects/subjects_index.json";
  const cache = { bridge: null, release: null, inventory: null, registry: null, manifest: null, index: null, packages: {}, subjects: {}, overlays: null };
  const NOISE = new Set(["og","eller","som","det","den","de","til","fra","for","med","på","av","i","om","at","er","var","kan","fag","emne","tekst","tema","analyse","canonical","active"]);

  function normalize(value) {
    return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  }
  function unique(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : [values]).map((v) => String(v || "").trim()).filter((v) => {
      const key = normalize(v); if (!key || seen.has(key)) return false; seen.add(key); return true;
    });
  }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function cleanText(value) { return global.AHAAnalysisText?.cleanTextForAnalysis ? global.AHAAnalysisText.cleanTextForAnalysis(value) : String(value || ""); }
  async function json(url, label) { const r = await fetch(url, { cache: "force-cache" }); if (!r.ok) throw new Error(`${label || "json"} ${r.status}`); return r.json(); }
  function rawBase(bridge) {
    const repo = String(bridge?.canonical_source?.repository || "");
    const ref = String(bridge?.canonical_source?.source_ref || "");
    if (!/^[-\w.]+\/[-\w.]+$/u.test(repo) || !/^[a-f0-9]{40}$/iu.test(ref)) throw new Error("History-Go bridge requires repository + exact commit SHA.");
    return `https://raw.githubusercontent.com/${repo}/${ref}/`;
  }
  function canonicalUrl(bridge, rel) {
    const clean = String(rel || "").replace(/^\/+/, "");
    if (!clean || clean.includes("..")) throw new Error(`Invalid canonical path: ${rel || "missing"}`);
    return `${rawBase(bridge)}${clean}`;
  }
  async function bridge() {
    if (cache.bridge) return cache.bridge;
    const data = await json(BRIDGE_URL, "bridge");
    if (data?.schema !== "aha_history_go_fagverk_bridge_v2" || data?.authority !== "history_go_canonical_fagverk") throw new Error("Unsupported History-Go Fagverk bridge.");
    rawBase(data); cache.bridge = data; return data;
  }
  function inventoryEntries(inventory) {
    const out = [];
    for (const root of Array.isArray(inventory?.subjects) ? inventory.subjects : []) {
      if (!root?.id) continue;
      out.push({ ...root, kind: "subject", parent_subject_id: null });
      for (const child of Array.isArray(root.specializations) ? root.specializations : []) if (child?.id) out.push({ ...child, kind: "specialization", parent_subject_id: root.id });
    }
    return out;
  }
  function manifestNode(entry, manifest) {
    return entry?.parent_subject_id ? object(manifest?.[entry.parent_subject_id]?.specializations?.[entry.id]) : object(manifest?.[entry?.id]);
  }
  function validatePackage(b, release, inventory, registry, manifest) {
    const e = object(b.expected);
    if (release?.schema !== "history_go_fagverk_release_v2" || inventory?.schema !== "history_go_fagverk_subject_inventory_v1" || registry?.schema !== "history_go_fagverk_registry_v1") throw new Error("Canonical History-Go Fagverk schema mismatch.");
    if (!manifest || Array.isArray(manifest)) throw new Error("Canonical History-Go manifest missing.");
    if (release?.registry?.content_sha256 !== e.registry_sha256 || release?.subject_inventory?.content_sha256 !== e.subject_inventory_sha256 || release?.fag_manifest?.content_sha256 !== e.fag_manifest_sha256) throw new Error("Canonical History-Go Fagverk digest mismatch.");
    if (Number(release?.summary?.root_subject_count) !== Number(e.root_subject_count) || Number(release?.summary?.specialization_count) !== Number(e.specialization_count) || Number(release?.summary?.missing_file_count) !== 0) throw new Error("Canonical History-Go Fagverk release is incomplete.");
  }
  async function loadIndex() {
    if (cache.index) return cache.index;
    const b = await bridge(); const p = b.canonical_source.paths;
    const [release, inventory, registry, manifest] = await Promise.all([
      json(canonicalUrl(b, p.release), "release"), json(canonicalUrl(b, p.subject_inventory), "inventory"), json(canonicalUrl(b, p.registry), "registry"), json(canonicalUrl(b, p.fag_manifest), "manifest")
    ]);
    validatePackage(b, release, inventory, registry, manifest);
    cache.release = release; cache.inventory = inventory; cache.registry = registry; cache.manifest = manifest;
    cache.index = inventoryEntries(inventory).map((entry) => {
      const node = manifestNode(entry, manifest); const required = Array.isArray(entry.requiredManifestFields) ? entry.requiredManifestFields : [];
      const missing = required.filter((field) => !node[field]); if (missing.length) throw new Error(`${entry.id}: missing canonical manifest fields ${missing.join(", ")}.`);
      return { subject_id: entry.id, subject_label: String(registry?.subjects?.[entry.id]?.title || release?.subjects?.[entry.id]?.title || entry.id), description: String(registry?.subjects?.[entry.id]?.description || ""), kind: entry.kind, parent_subject_id: entry.parent_subject_id, schema_family: String(entry.schemaFamily || ""), source_ref: b.canonical_source.source_ref, canonical: true };
    });
    return cache.index;
  }
  function resolveManifestPath(rel) {
    const parts = ["data", "fag"];
    String(rel || "").split("/").forEach((part) => { if (!part || part === ".") return; if (part === "..") parts.pop(); else parts.push(part); });
    return parts.join("/");
  }
  async function loadPackage(subjectId, field) {
    const key = `${subjectId}:${field}`; if (key in cache.packages) return cache.packages[key];
    const list = await loadIndex(); const meta = list.find((s) => s.subject_id === subjectId); if (!meta) return null;
    const entry = inventoryEntries(cache.inventory).find((s) => s.id === subjectId); const rel = manifestNode(entry, cache.manifest)?.[field];
    if (typeof rel !== "string" || !rel) return (cache.packages[key] = null);
    const source_path = resolveManifestPath(rel); const data = await json(canonicalUrl(await bridge(), source_path), `${subjectId}.${field}`);
    return (cache.packages[key] = { data, source_path });
  }
  async function overlayIndex() {
    if (cache.overlays) return cache.overlays;
    try { const data = await json(OVERLAY_URL, "overlay index"); if (data?.authority && data.authority !== "overlay_only") throw new Error("Local subject data must be overlay_only."); return (cache.overlays = Array.isArray(data?.subjects) ? data.subjects : []); }
    catch (err) { console.warn("AHASubjectEngine: overlays unavailable", err); return (cache.overlays = []); }
  }
  function canonicalTargets(entry) { return unique(Array.isArray(entry?.canonical_subject_ids) && entry.canonical_subject_ids.length ? entry.canonical_subject_ids : [entry?.subject_id]); }
  async function localEmner(subjectId) {
    const result = [];
    for (const entry of (await overlayIndex()).filter((e) => canonicalTargets(e).includes(subjectId))) {
      const file = String(entry.file || ""); if (!file || file.includes("/") || file.includes("..")) continue;
      try {
        const data = await json(`/data/subjects/${file}`, `overlay ${file}`);
        for (const emne of Array.isArray(data?.emner) ? data.emner : []) {
          if (emne?.fagverk) continue;
          result.push({ ...emne, local_knowledge: { ...object(emne.local_knowledge), classification: String(emne?.local_knowledge?.classification || "aha_overlay"), canonical_subject_ids: unique(emne?.local_knowledge?.canonical_subject_ids || [subjectId]), revalidate_on_runtime_change: true } });
        }
      } catch (err) { console.warn(`AHASubjectEngine: overlay ${file} unavailable`, err); }
    }
    return result;
  }
  function arrayStrings(item, keys) { return unique(keys.flatMap((key) => Array.isArray(item?.[key]) ? item[key] : [])); }
  function canonicalEmne(item, meta, sourcePath, index) {
    const value = object(item); const id = String(value.emne_id || value.id || value.topic_id || `canonical_${meta.subject_id}_${index + 1}`);
    return {
      emne_id: id,
      title: String(value.title || value.name || value.label || value.short_label || id),
      core_concepts: arrayStrings(value, ["core_concepts", "key_concepts", "sub_concepts", "concepts"]),
      keywords: arrayStrings(value, ["keywords", "dimensions", "analysis_axes", "conflicts", "ideological_dimensions", "tags"]),
      thinkers: arrayStrings(value, ["canonical_thinkers", "thinkers", "theorists"]),
      learning_goals: arrayStrings(value, ["learning_goals", "key_questions"]), checkpoints: arrayStrings(value, ["checkpoints"]),
      summary: String(value.definition || value.summary || value.why_it_matters || ""), description: String(value.description || value.why_it_matters || value.definition || ""),
      fagverk: { source_repo: "Paradispartiet/History-Go", source_ref: meta.source_ref, canonical_subject_id: meta.subject_id, source_path: sourcePath, registry_path: "data/fagverk/fagverk_registry.json", manifest_path: "data/fag/fag_manifest.json", package_field: "emner", minimum_matched_terms: 2, term_source: "history_go_manifest_emner_v2", generation_mode: "canonical_history_go_runtime_projection_v2" }
    };
  }
  function chapterEmner(meta) {
    const subject = object(cache.registry?.subjects?.[meta.subject_id]);
    return (Array.isArray(subject.chapters) ? subject.chapters : []).map((chapter, index) => ({
      emne_id: `fagverk_${meta.subject_id}_${String(chapter?.id || index + 1)}`, title: String(chapter?.title || chapter?.id || `Kapittel ${index + 1}`),
      core_concepts: unique((chapter?.emne_ids || []).flatMap((id) => normalize(id).split(" ")).filter((t) => t.length >= 4 && !NOISE.has(t))), keywords: unique([chapter?.primary_domain_id]), thinkers: [], learning_goals: [], checkpoints: [], summary: String(chapter?.subtitle || ""), description: String(subject.description || ""),
      fagverk: { source_repo: "Paradispartiet/History-Go", source_ref: meta.source_ref, canonical_subject_id: meta.subject_id, chapter_id: String(chapter?.id || ""), source_path: String(chapter?.file || ""), registry_path: "data/fagverk/fagverk_registry.json", manifest_path: "data/fag/fag_manifest.json", package_field: "chapter_registry", minimum_matched_terms: 2, term_source: "history_go_registry_chapter_metadata_v2", generation_mode: "canonical_history_go_runtime_projection_v2" }
    }));
  }
  async function listSubjects() { return loadIndex(); }
  async function loadSubject(subjectId) {
    const id = String(subjectId || "").trim(); if (!id) return null; if (cache.subjects[id]) return cache.subjects[id];
    const meta = (await loadIndex()).find((s) => s.subject_id === id); if (!meta) return null;
    const [pkg, overlays] = await Promise.all([loadPackage(id, "emner"), localEmner(id)]); const raw = Array.isArray(pkg?.data) ? pkg.data : Array.isArray(pkg?.data?.emner) ? pkg.data.emner : [];
    const seen = new Set(); const emner = [...raw.map((e, i) => canonicalEmne(e, meta, pkg?.source_path || "", i)), ...chapterEmner(meta), ...overlays].filter((e) => { const key = `${e.emne_id}|${normalize(e.title)}`; if (seen.has(key)) return false; seen.add(key); return true; });
    return (cache.subjects[id] = { ...meta, authority: "history_go_canonical_fagverk", emner });
  }
  async function loadAllSubjects() { return (await Promise.all((await loadIndex()).map((s) => loadSubject(s.subject_id)))).filter(Boolean); }
  function containsSubjectTerm(text, term) { const h = normalize(text), n = normalize(term); return Boolean(h && n && ` ${h} `.includes(` ${n} `)); }
  function matched(text, values) { return unique(Array.isArray(values) ? values : [values]).filter((v) => v.length <= 180 && containsSubjectTerm(text, v)); }
  function relevant(values) { return unique(values).filter((v) => { const n = normalize(v); return n.length >= 3 && !NOISE.has(n); }); }
  function buildMatchProvenance(subject, emne) {
    if (emne?.fagverk) return { kind: "canonical_fagverk", evidence_role: "reference_support_not_source_evidence", canonical_subject_id: String(emne.fagverk.canonical_subject_id || subject.subject_id), chapter_id: String(emne.fagverk.chapter_id || ""), source_repo: String(emne.fagverk.source_repo || "Paradispartiet/History-Go"), source_ref: String(emne.fagverk.source_ref || subject.source_ref || ""), source_path: String(emne.fagverk.source_path || ""), registry_path: String(emne.fagverk.registry_path || ""), manifest_path: String(emne.fagverk.manifest_path || ""), package_field: String(emne.fagverk.package_field || ""), term_source: String(emne.fagverk.term_source || ""), generation_mode: String(emne.fagverk.generation_mode || "") };
    if (emne?.local_knowledge) return { kind: "aha_local_overlay", evidence_role: "local_reference_support_not_source_evidence", classification: String(emne.local_knowledge.classification || ""), canonical_subject_ids: unique(emne.local_knowledge.canonical_subject_ids || []), revalidate_on_runtime_change: true };
    return null;
  }
  async function matchText(text, options = {}) {
    const target = cleanText(text).trim(); if (!target) return []; let subjects;
    try { subjects = await loadAllSubjects(); } catch (err) { console.warn("AHASubjectEngine: canonical Fagverk unavailable; fail closed", err); return []; }
    const out = [];
    for (const subject of subjects) {
      const subjectHits = relevant([...matched(target, subject.subject_label), ...matched(target, subject.description)]);
      if (subjectHits.length) out.push({ subject_id: subject.subject_id, subject_label: subject.subject_label, emne_id: null, title: subject.subject_label, type: subject.kind || "subject", score: 2 + subjectHits.length, matched_terms: subjectHits, source: options.source || "text", provenance: { kind: "canonical_fagverk_subject", evidence_role: "reference_support_not_source_evidence", source_repo: "Paradispartiet/History-Go", source_ref: subject.source_ref, canonical_subject_id: subject.subject_id, registry_path: "data/fagverk/fagverk_registry.json", manifest_path: "data/fag/fag_manifest.json" } });
      for (const emne of subject.emner || []) {
        const fields = [
          ["title", emne.title, 4], ["core", emne.core_concepts, 4], ["keywords", emne.keywords, 2.5], ["thinkers", emne.thinkers, 3], ["summary", emne.summary, 1], ["description", emne.description, 1], ["goals", emne.learning_goals, 1], ["checkpoints", emne.checkpoints, 1]
        ];
        let score = 0, strong = false; const terms = [];
        for (const [name, values, weight] of fields) { const hits = relevant(matched(target, values)); if (hits.length) { score += hits.length * weight; terms.push(...hits); if (name === "title" || name === "core") strong = true; } }
        const found = relevant(terms); if (!found.length) continue;
        const minimum = Math.max(1, Number(emne?.fagverk?.minimum_matched_terms || emne?.local_knowledge?.minimum_matched_terms || 1)); if (found.length < minimum && !strong) continue;
        score += Math.max(0, found.length - 1) * 1.25 + (strong ? 1.5 : 0);
        out.push({ subject_id: subject.subject_id, subject_label: subject.subject_label, emne_id: emne.emne_id, title: emne.title, type: (emne.thinkers || []).some((v) => found.includes(v)) ? "thinker" : (emne.core_concepts || []).some((v) => found.includes(v)) ? "concept" : "emne", score, matched_terms: found, strong, source: options.source || "text", provenance: buildMatchProvenance(subject, emne) });
      }
    }
    out.sort((a, b) => b.score - a.score); if (!out.length) return [];
    const best = out[0].score, floor = Math.max(best * 0.45, best - 4), limit = Math.min(8, Number(options.maxResults || options.limit) || 8), seen = new Set();
    return out.filter((m) => m.score >= floor && (m.strong || m.matched_terms.length >= 2)).filter((m) => { const key = `${m.subject_id}|${m.emne_id || ""}|${normalize(m.title)}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, limit);
  }
  function flatten(value) { if (Array.isArray(value)) return value.map(flatten).join(" "); if (value && typeof value === "object") return Object.values(value).map(flatten).join(" "); return String(value || ""); }
  async function matchInsight(insight, options) { return matchText(flatten(insight), { ...(options || {}), source: "insight" }); }
  function resetCacheForTests() { Object.assign(cache, { bridge: null, release: null, inventory: null, registry: null, manifest: null, index: null, packages: {}, subjects: {}, overlays: null }); }

  global.AHASubjectEngine = { listSubjects, loadSubject, loadAllSubjects, loadPackage, matchText, matchInsight };
  global.AHASubjectEngineTestHooks = { normalizeSubjectMatchText: normalize, containsSubjectTerm, buildMatchProvenance, inventoryEntries, resolveManifestFilePath: resolveManifestPath, resetCacheForTests };
})(window);
