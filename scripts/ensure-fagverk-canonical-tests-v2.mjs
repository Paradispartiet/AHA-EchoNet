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
    'score += Math.max(0, found.length - 1) * (kind === "method" ? 0.25 : 1.5) + (strong ? 2 : 0) + (kind === "overlay" && strong ? 1 : 0);',
    'const phraseBonus = kind === "method" ? 0 : found.reduce((sum, term) => sum + (normalize(term).includes(" ") ? 3 : 0), 0);\n        score += Math.max(0, found.length - 1) * (kind === "method" ? 0.25 : 1.5) + (strong ? 2 : 0) + (kind === "overlay" && strong ? 1 : 0) + phraseBonus;'
  ],
  [
    '    const termSubjects = new Map();',
    '    const primarySupportBySubject = new Map();\n    for (const match of out) {\n      if (!["emne", "concept", "thinker", "overlay"].includes(match.type) || !match.emne_id) continue;\n      primarySupportBySubject.set(match.subject_id, Math.max(primarySupportBySubject.get(match.subject_id) || 0, Number(match.score || 0)));\n    }\n    const maxPrimarySupport = Math.max(0, ...primarySupportBySubject.values());\n    if (maxPrimarySupport >= 8) {\n      const derivedFloor = maxPrimarySupport * 0.5;\n      for (let index = out.length - 1; index >= 0; index -= 1) {\n        const match = out[index];\n        if (!["chapter", "supplement", "method"].includes(match.type)) continue;\n        if ((primarySupportBySubject.get(match.subject_id) || 0) < derivedFloor) out.splice(index, 1);\n      }\n    }\n\n    const termSubjects = new Map();'
  ]
]);

const engine = fs.readFileSync(path.join(root, "js/ahaSubjectEngine.js"), "utf8");
const chapterStart = engine.indexOf("  function chapterEmne(raw, subject) {");
const chapterEnd = engine.indexOf("  function supplementEmne(raw, subject, index) {", chapterStart);
if (chapterStart < 0 || chapterEnd < 0) throw new Error("js/ahaSubjectEngine.js: chapter loader boundary missing.");
const chapterBlock = engine.slice(chapterStart, chapterEnd);
if (!chapterBlock.includes('chapter_specific_terms: unique(item.semantic_terms || [])')) throw new Error("js/ahaSubjectEngine.js: chapter specificity channel missing from chapter loader.");
if (!engine.includes('primarySupportBySubject')) throw new Error("js/ahaSubjectEngine.js: subject-anchor gate missing.");
if (!engine.includes('const termScores = new Map()')) throw new Error("js/ahaSubjectEngine.js: per-term max-weight scoring missing.");

console.log(`Canonical Fagverk contracts: ${mode === "write" ? "updated" : "verified"}${qualityChanged || pipelineChanged || engineChanged ? " with changes" : ""}.`);
