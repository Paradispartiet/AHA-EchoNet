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
    'const kind = matchClass(emne), fields = fieldsForClass(emne, kind); let strong = false; const termScores = new Map(); const chapterSpecificHits = kind === "chapter" ? relevant(matchedNormalized(target, emne.chapter_specific_terms || [])) : []; const chapterSupervisionHits = kind === "chapter" ? chapterSupervisionMatches(targetTokens, emne.chapter_supervision_terms || []) : [];'
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

const enginePath = path.join(root, "js/ahaSubjectEngine.js");
const legacySubjectAnchor = `    const primarySupportBySubject = new Map();
    for (const match of out) {
      if (!["emne", "concept", "thinker", "overlay"].includes(match.type) || !match.emne_id) continue;
      primarySupportBySubject.set(match.subject_id, Math.max(primarySupportBySubject.get(match.subject_id) || 0, Number(match.score || 0)));
    }
    const maxPrimarySupport = Math.max(0, ...primarySupportBySubject.values());
    if (maxPrimarySupport >= 8) {
      const derivedFloor = maxPrimarySupport * 0.5;
      for (let index = out.length - 1; index >= 0; index -= 1) {
        const match = out[index];
        if (!["chapter", "supplement", "method"].includes(match.type)) continue;
        if ((primarySupportBySubject.get(match.subject_id) || 0) < derivedFloor) out.splice(index, 1);
      }
    }

`;
let engineSource = fs.readFileSync(enginePath, "utf8");
let anchorCleanupChanged = false;
if (engineSource.includes("chapterSpecificityEligibleSubjects") && engineSource.includes(legacySubjectAnchor)) {
  engineSource = engineSource.replace(legacySubjectAnchor, "");
  anchorCleanupChanged = true;
}
let rankingCleanupChanged = false;
const legacyDecisiveChapter = 'const decisiveChapter = (match) => match.type === "chapter" && (match._chapter_specific_hits || []).length >= 3 && chapterSpecificityRank(match) >= 8;';
const intermediateDecisiveChapter = 'const decisiveChapter = (match) => match.type === "chapter" && (match._chapter_specific_hits || []).length >= 2 && chapterSpecificityRank(match) >= 8;';
const decisiveChapter = 'const decisiveChapter = (match) => match.type === "chapter" && (match._chapter_specific_hits || []).length >= 2 && chapterSpecificityRank(match) >= 4;';
if (!engineSource.includes(decisiveChapter) && engineSource.includes(legacyDecisiveChapter)) {
  engineSource = engineSource.replace(legacyDecisiveChapter, decisiveChapter);
  rankingCleanupChanged = true;
}
if (!engineSource.includes(decisiveChapter) && engineSource.includes(intermediateDecisiveChapter)) {
  engineSource = engineSource.replace(intermediateDecisiveChapter, decisiveChapter);
  rankingCleanupChanged = true;
}
const globalDecisiveChapter = 'const globallyDecisiveChapter = (match) => match.type === "chapter" && (match._chapter_specific_hits || []).length >= 3 && chapterSpecificityRank(match) >= 12;';
if (!engineSource.includes(globalDecisiveChapter) && engineSource.includes(decisiveChapter)) {
  engineSource = engineSource.replace(decisiveChapter, `${decisiveChapter}\n    ${globalDecisiveChapter}`);
  rankingCleanupChanged = true;
}
const oldSubjectFirstSort = '      if (subjectFirst) {\n        const aDecisive = decisiveChapter(a);';
const primarySubjectFirstSort = '      if (subjectFirst) {\n        const primarySubjectDelta = subjectSupport(b) - subjectSupport(a);\n        if (Math.abs(primarySubjectDelta) > 1e-9) return primarySubjectDelta;\n        const aDecisive = decisiveChapter(a);';
if (!engineSource.includes(primarySubjectFirstSort) && engineSource.includes(oldSubjectFirstSort)) {
  engineSource = engineSource.replace(oldSubjectFirstSort, primarySubjectFirstSort);
  rankingCleanupChanged = true;
}
const globalSubjectFirstSort = '      if (subjectFirst) {\n        const aGlobalDecisive = globallyDecisiveChapter(a);\n        const bGlobalDecisive = globallyDecisiveChapter(b);\n        if (aGlobalDecisive !== bGlobalDecisive) return aGlobalDecisive ? -1 : 1;\n        if (aGlobalDecisive && bGlobalDecisive) {\n          const globalSpecificityDelta = chapterSpecificityRank(b) - chapterSpecificityRank(a);\n          if (Math.abs(globalSpecificityDelta) > 1e-9) return globalSpecificityDelta;\n          if (b.score !== a.score) return b.score - a.score;\n        }\n        const primarySubjectDelta = subjectSupport(b) - subjectSupport(a);\n        if (Math.abs(primarySubjectDelta) > 1e-9) return primarySubjectDelta;\n        const aDecisive = decisiveChapter(a);';
if (!engineSource.includes(globalSubjectFirstSort) && engineSource.includes(primarySubjectFirstSort)) {
  engineSource = engineSource.replace(primarySubjectFirstSort, globalSubjectFirstSort);
  rankingCleanupChanged = true;
}

const primaryTermsAnchor = '    const rankedSubjectSupportBySubject = new Map();';
const primaryTermsBlock = [
  '    const primaryTermsBySubject = new Map();',
  '    for (const [subjectId, matches] of primaryRowsBySubject.entries()) {',
  '      const ranked = matches.slice().sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).slice(0, 3);',
  '      const terms = new Set();',
  '      for (const match of ranked) for (const term of match.matched_terms || []) { const key = normalize(term); if (key) terms.add(key); }',
  '      primaryTermsBySubject.set(subjectId, terms);',
  '    }',
  '    const rankedSubjectSupportBySubject = new Map();'
].join('\n');
if (!engineSource.includes('const primaryTermsBySubject = new Map();') && engineSource.includes(primaryTermsAnchor)) {
  engineSource = engineSource.replace(primaryTermsAnchor, primaryTermsBlock);
  rankingCleanupChanged = true;
}

const alignmentFunctionAnchor = `    ${decisiveChapter}`;
const alignmentFunctionBlock = [
  '    const chapterPrimaryAlignment = (match) => {',
  '      if (match.type !== "chapter") return 0;',
  '      const primaryTerms = primaryTermsBySubject.get(match.subject_id);',
  '      if (!primaryTerms?.size) return 0;',
  '      let aligned = 0;',
  '      for (const term of match._chapter_specific_hits || []) if (primaryTerms.has(normalize(term))) aligned += 1;',
  '      return aligned;',
  '    };',
  `    ${decisiveChapter}`
].join('\n');
if (!engineSource.includes('const chapterPrimaryAlignment = (match) => {') && engineSource.includes(alignmentFunctionAnchor)) {
  engineSource = engineSource.replace(alignmentFunctionAnchor, alignmentFunctionBlock);
  rankingCleanupChanged = true;
}

const decisiveComparatorAnchor = [
  '        if (aDecisive && bDecisive) {',
  '          const specificityDelta = chapterSpecificityRank(b) - chapterSpecificityRank(a);'
].join('\n');
const decisiveComparatorBlock = [
  '        if (aDecisive && bDecisive) {',
  '          const alignmentDelta = chapterPrimaryAlignment(b) - chapterPrimaryAlignment(a);',
  '          if (alignmentDelta !== 0) return alignmentDelta;',
  '          const specificityDelta = chapterSpecificityRank(b) - chapterSpecificityRank(a);'
].join('\n');
if (!engineSource.includes('const alignmentDelta = chapterPrimaryAlignment(b) - chapterPrimaryAlignment(a);') && engineSource.includes(decisiveComparatorAnchor)) {
  engineSource = engineSource.replace(decisiveComparatorAnchor, decisiveComparatorBlock);
  rankingCleanupChanged = true;
}

const chapterFallbackAnchor = [
  '          if (Math.max(aHits, bHits) >= 2) {',
  '            const specificityDelta = chapterSpecificityRank(b) - chapterSpecificityRank(a);'
].join('\n');
const chapterFallbackBlock = [
  '          if (Math.max(aHits, bHits) >= 2) {',
  '            const alignmentDelta = chapterPrimaryAlignment(b) - chapterPrimaryAlignment(a);',
  '            if (alignmentDelta !== 0) return alignmentDelta;',
  '            const specificityDelta = chapterSpecificityRank(b) - chapterSpecificityRank(a);'
].join('\n');
if ((engineSource.match(/const alignmentDelta = chapterPrimaryAlignment\(b\) - chapterPrimaryAlignment\(a\);/g) || []).length < 2 && engineSource.includes(chapterFallbackAnchor)) {
  engineSource = engineSource.replace(chapterFallbackAnchor, chapterFallbackBlock);
  rankingCleanupChanged = true;
}

if (mode === "write" && (anchorCleanupChanged || rankingCleanupChanged)) fs.writeFileSync(enginePath, engineSource);
if (mode === "check" && anchorCleanupChanged) throw new Error("js/ahaSubjectEngine.js: duplicate legacy subject-anchor block detected.");
if (mode === "check" && rankingCleanupChanged) throw new Error("js/ahaSubjectEngine.js: subject-first chapter ranking drift detected.");

const engine = fs.readFileSync(enginePath, "utf8");
const chapterStart = engine.indexOf("  function chapterEmne(raw, subject) {");
const chapterEnd = engine.indexOf("  function supplementEmne(raw, subject, index) {", chapterStart);
if (chapterStart < 0 || chapterEnd < 0) throw new Error("js/ahaSubjectEngine.js: chapter loader boundary missing.");
const chapterBlock = engine.slice(chapterStart, chapterEnd);
if (!chapterBlock.includes('chapter_specific_terms: unique([')) throw new Error("js/ahaSubjectEngine.js: chapter specificity channel missing from chapter loader.");
if (!chapterBlock.includes('...(item.semantic_terms || [])')) throw new Error("js/ahaSubjectEngine.js: canonical semantic terms missing from chapter specificity supervision.");
if (!chapterBlock.includes('const chapterSupervisionTerms = unique([...titleTokens(item.title || id), ...titleTokens(item.subtitle || "")])')) throw new Error("js/ahaSubjectEngine.js: canonical chapter title/subtitle supervision missing.");
if (!chapterBlock.includes('chapter_supervision_terms: chapterSupervisionTerms')) throw new Error("js/ahaSubjectEngine.js: canonical chapter supervision channel missing.");
if ((engine.match(/const primarySupportBySubject = new Map\(\);/g) || []).length !== 1) throw new Error("js/ahaSubjectEngine.js: subject-anchor block must be unique.");
if (!engine.includes('chapterSpecificityEligibleSubjects')) throw new Error("js/ahaSubjectEngine.js: anchored chapter-specificity gate missing.");
if (!engine.includes('chapterSpecificEntriesWithinSubject')) throw new Error("js/ahaSubjectEngine.js: within-subject chapter specificity index missing.");
if (!engine.includes('Math.min(12, chapterSpecificity)')) throw new Error("js/ahaSubjectEngine.js: bounded chapter specificity score missing.");
if (!engine.includes(decisiveChapter)) throw new Error("js/ahaSubjectEngine.js: within-subject chapter ranking must accept two independently supported terms without requiring both to be globally unique.");
if (!engine.includes(globalDecisiveChapter)) throw new Error("js/ahaSubjectEngine.js: global chapter evidence must require at least three highly specific terms.");
const supervisionSortIndex = engine.indexOf('const aSupervision = a.type === "chapter" ? (a._chapter_supervision_hits || []).length : 0;');
const globalSortIndex = engine.indexOf('const aGlobalDecisive = globallyDecisiveChapter(a);');
if (supervisionSortIndex < 0 || globalSortIndex < 0 || supervisionSortIndex > globalSortIndex) throw new Error("js/ahaSubjectEngine.js: title/subtitle chapter supervision must run within-subject before global chapter evidence.");
if (!engine.includes('function lexicalFamily(leftValue, rightValue)')) throw new Error("js/ahaSubjectEngine.js: generic lexical-family supervision missing.");
if (!engine.includes('function chapterSupervisionMatches(targetTokens, values)')) throw new Error("js/ahaSubjectEngine.js: pre-normalized chapter supervision matcher missing.");
if (!engine.includes('function containsNormalizedSubjectTerm(haystack, term)')) throw new Error("js/ahaSubjectEngine.js: canonical matching must normalize the long source once per run.");
if (!engine.includes('const target = normalize(cleanText(text));')) throw new Error("js/ahaSubjectEngine.js: canonical matching must pre-normalize the active source.");
if (!engine.includes('const primaryTermsBySubject = new Map();')) throw new Error("js/ahaSubjectEngine.js: top-primary subject term anchor missing.");
if (!engine.includes('const chapterPrimaryAlignment = (match) => {')) throw new Error("js/ahaSubjectEngine.js: chapter-primary alignment function missing.");
if ((engine.match(/const alignmentDelta = chapterPrimaryAlignment\(b\) - chapterPrimaryAlignment\(a\);/g) || []).length < 2) throw new Error("js/ahaSubjectEngine.js: chapter-primary alignment must govern decisive and fallback within-subject ordering.");
if (!engine.includes('const termScores = new Map()')) throw new Error("js/ahaSubjectEngine.js: per-term max-weight scoring missing.");
if (!engine.includes('.map(({ _chapter_specific_hits, _chapter_supervision_hits, ...match }) => match)')) throw new Error("js/ahaSubjectEngine.js: internal chapter ranking evidence must not leak from matcher output.");

console.log(`Canonical Fagverk contracts: ${mode === "write" ? "updated" : "verified"}${qualityChanged || pipelineChanged || engineChanged || anchorCleanupChanged || rankingCleanupChanged ? " with changes" : ""}.`);
