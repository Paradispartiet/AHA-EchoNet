#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--check") ? "check" : "";
if (!mode) throw new Error("Use --write or --check.");

function migrate(relativePath, replacements, options = {}) {
  const file = path.join(root, relativePath);
  const current = fs.readFileSync(file, "utf8");
  let next = current;
  for (const [before, after] of replacements) {
    if (next.includes(after)) continue;
    if (next.includes(before)) next = next.replace(before, after);
  }
  if (options.rejectLegacyRegistry !== false && /history-go-fagverk-runtime-registry\.v1\.json/.test(next)) throw new Error(`${relativePath}: active contract still references the legacy partial runtime registry.`);
  if (mode === "write") { if (next !== current) fs.writeFileSync(file, next); return next !== current; }
  if (next !== current) throw new Error(`${relativePath}: canonical Fagverk migration drift.`);
  return false;
}

const qualityChanged = migrate("tests/aha-production-analysis-quality-matrix.test.cjs", [
  ["const REGISTRY_PATH = path.join(ROOT, 'data/integrations/runtime/history-go-fagverk-runtime-registry.v1.json');", "const CANONICAL_INDEX_PATH = path.join(ROOT, 'data/integrations/runtime/history-go-fagverk-canonical-index.v2.json');"]
]);
const pipelineChanged = migrate("tests/aha-production-analysis-pipeline-audit.test.cjs", [
  ["const REGISTRY_PATH = 'data/integrations/runtime/history-go-fagverk-runtime-registry.v1.json';", "const CANONICAL_INDEX_PATH = 'data/integrations/runtime/history-go-fagverk-canonical-index.v2.json';"],
  ["        source_ref: corpus.source_ref,", "        source_ref: canonicalIndex.canonical_source.source_ref,"]
]);
const engineChanged = migrate("js/ahaSubjectEngine.js", [
  [
    'const NOISE = new Set(["og","eller","som","det","den","de","til","fra","for","med","på","av","i","om","at","er","var","kan","fag","emne","tekst","tema","analyse","canonical","active"]);',
    'const NOISE = new Set(["og","eller","som","det","den","de","til","fra","for","med","på","av","i","om","at","er","var","kan","fag","emne","tekst","tema","analyse","canonical","active","hvordan","hvem","hva","hvorfor","får","få","styring","makt","samfunn","institusjon","institusjoner"]);'
  ],
  [
    'return { emne_id: `fagverk_${subject.subject_id}_${id}`, title: String(item.title || id), core_concepts: unique(item.core_concepts || []), keywords: unique(item.keywords || []), thinkers: unique(item.thinkers || []), methods: unique(item.methods || []), learning_goals: [], checkpoints: [], summary:',
    'return { emne_id: `fagverk_${subject.subject_id}_${id}`, title: String(item.title || id), core_concepts: unique(item.core_concepts || []), keywords: unique(item.keywords || []), thinkers: unique(item.thinkers || []), methods: unique(item.methods || []), chapter_specific_terms: unique(item.semantic_terms || []), learning_goals: [], checkpoints: [], summary:'
  ],
  [
    'if (kind === "chapter") return [["title", emne.title, 5], ["title_tokens", titleTokens(emne.title), 4.5], ["core", emne.core_concepts, 4.5], ["keywords", emne.keywords, 2.5], ["thinkers", emne.thinkers, 2.5], ["methods", emne.methods, 1], ["summary", emne.summary, 1]];',
    'if (kind === "chapter") return [["title", emne.title, 5], ["title_tokens", titleTokens(emne.title), 4.5], ["core", emne.core_concepts, 4.5], ["keywords", emne.keywords, 2.5], ["thinkers", emne.thinkers, 2.5], ["specific", emne.chapter_specific_terms, 2], ["methods", emne.methods, 1], ["summary", emne.summary, 1]];'
  ],
  [
    'const kind = matchClass(emne), fields = fieldsForClass(emne, kind); let strong = false; const termScores = new Map();',
    'const kind = matchClass(emne), fields = fieldsForClass(emne, kind); let strong = false; const termScores = new Map(); const chapterSpecificHits = kind === "chapter" ? relevant(matched(target, emne.chapter_specific_terms || [])) : [];'
  ],
  [
    'score += Math.max(0, found.length - 1) * (kind === "method" ? 0.25 : 1.5) + (strong ? 2 : 0) + (kind === "overlay" && strong ? 1 : 0);',
    'const phraseBonus = kind === "method" ? 0 : found.reduce((sum, term) => sum + (normalize(term).includes(" ") ? 3 : 0), 0);\n        score += Math.max(0, found.length - 1) * (kind === "method" ? 0.25 : 1.5) + (strong ? 2 : 0) + (kind === "overlay" && strong ? 1 : 0) + phraseBonus;'
  ],
  [
    'out.push({ subject_id: subject.subject_id, subject_label: subject.subject_label, emne_id: emne.emne_id, title: emne.title, type, score, matched_terms: found, strong, source: options.source || "text", provenance: buildMatchProvenance(subject, emne) });',
    'out.push({ subject_id: subject.subject_id, subject_label: subject.subject_label, emne_id: emne.emne_id, title: emne.title, type, score, matched_terms: found, strong, source: options.source || "text", provenance: buildMatchProvenance(subject, emne), _chapter_specific_hits: chapterSpecificHits });'
  ],
  [
    '    const termSubjects = new Map();',
    '    const primarySupportBySubject = new Map();\n    for (const match of out) {\n      if (!["emne", "concept", "thinker", "overlay"].includes(match.type) || !match.emne_id) continue;\n      primarySupportBySubject.set(match.subject_id, Math.max(primarySupportBySubject.get(match.subject_id) || 0, Number(match.score || 0)));\n    }\n    const maxPrimarySupport = Math.max(0, ...primarySupportBySubject.values());\n    const chapterSpecificityEligibleSubjects = new Set();\n    if (maxPrimarySupport >= 8) {\n      const derivedFloor = maxPrimarySupport * 0.5;\n      for (const [subjectId, support] of primarySupportBySubject.entries()) if (support >= derivedFloor) chapterSpecificityEligibleSubjects.add(subjectId);\n      for (let index = out.length - 1; index >= 0; index -= 1) {\n        const match = out[index];\n        if (!["chapter", "supplement", "method"].includes(match.type)) continue;\n        if ((primarySupportBySubject.get(match.subject_id) || 0) < derivedFloor) out.splice(index, 1);\n      }\n    }\n\n    const termSubjects = new Map();'
  ],
  [
    '    const substantiveCounts = new Map();',
    '    const chapterSpecificEntriesWithinSubject = new Map();\n    for (const match of out) {\n      if (match.type !== "chapter" || !match.emne_id || !chapterSpecificityEligibleSubjects.has(match.subject_id)) continue;\n      for (const term of match._chapter_specific_hits || []) {\n        const key = `${match.subject_id}|${normalize(term)}`;\n        if (!chapterSpecificEntriesWithinSubject.has(key)) chapterSpecificEntriesWithinSubject.set(key, new Set());\n        chapterSpecificEntriesWithinSubject.get(key).add(match.emne_id);\n      }\n    }\n    const substantiveCounts = new Map();'
  ],
  [
    '        match.score += Math.min(5, rarity) + Math.min(6, specificity);',
    '        let chapterSpecificity = 0;\n        if (match.type === "chapter" && chapterSpecificityEligibleSubjects.has(match.subject_id)) {\n          for (const term of match._chapter_specific_hits || []) {\n            const entryCount = chapterSpecificEntriesWithinSubject.get(`${match.subject_id}|${normalize(term)}`)?.size || 0;\n            chapterSpecificity += entryCount === 1 ? 4 : entryCount === 2 ? 2 : entryCount === 3 ? 0.75 : 0;\n          }\n        }\n        match.score += Math.min(5, rarity) + Math.min(6, specificity) + Math.min(12, chapterSpecificity);'
  ],
  [
    'return out.filter((match) => match.score >= floor && (match.strong || match.matched_terms.length >= 2)).filter((match) => { const key = `${match.subject_id}|${match.emne_id || ""}|${normalize(match.title)}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, limit);',
    'return out.filter((match) => match.score >= floor && (match.strong || match.matched_terms.length >= 2)).filter((match) => { const key = `${match.subject_id}|${match.emne_id || ""}|${normalize(match.title)}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, limit).map(({ _chapter_specific_hits, ...match }) => match);'
  ]
]);

const engine = fs.readFileSync(path.join(root, "js/ahaSubjectEngine.js"), "utf8");
const chapterStart = engine.indexOf("  function chapterEmne(raw, subject) {");
const chapterEnd = engine.indexOf("  function supplementEmne(raw, subject, index) {", chapterStart);
if (chapterStart < 0 || chapterEnd < 0) throw new Error("js/ahaSubjectEngine.js: chapter loader boundary missing.");
const chapterBlock = engine.slice(chapterStart, chapterEnd);
if (!chapterBlock.includes('chapter_specific_terms: unique(item.semantic_terms || [])')) throw new Error("js/ahaSubjectEngine.js: chapter specificity channel missing from chapter loader.");
if (!engine.includes('primarySupportBySubject')) throw new Error("js/ahaSubjectEngine.js: subject-anchor gate missing.");
if (!engine.includes('chapterSpecificityEligibleSubjects')) throw new Error("js/ahaSubjectEngine.js: anchored chapter-specificity gate missing.");
if (!engine.includes('chapterSpecificEntriesWithinSubject')) throw new Error("js/ahaSubjectEngine.js: within-subject chapter specificity index missing.");
if (!engine.includes('Math.min(12, chapterSpecificity)')) throw new Error("js/ahaSubjectEngine.js: bounded chapter specificity score missing.");
if (!engine.includes('const termScores = new Map()')) throw new Error("js/ahaSubjectEngine.js: per-term max-weight scoring missing.");
if (!engine.includes('.map(({ _chapter_specific_hits, ...match }) => match)')) throw new Error("js/ahaSubjectEngine.js: internal chapter specificity evidence must not leak from matcher output.");

console.log(`Canonical Fagverk contracts: ${mode === "write" ? "updated" : "verified"}${qualityChanged || pipelineChanged || engineChanged ? " with changes" : ""}.`);
