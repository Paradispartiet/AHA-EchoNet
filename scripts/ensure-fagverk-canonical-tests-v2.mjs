#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--check") ? "check" : "";
if (!mode) throw new Error("Use --write or --check.");

function migrate(relativePath, replacements) {
  const file = path.join(root, relativePath);
  const current = fs.readFileSync(file, "utf8");
  let next = current;
  for (const [before, after] of replacements) {
    if (next.includes(before)) next = next.replace(before, after);
  }
  if (/history-go-fagverk-runtime-registry\.v1\.json/.test(next)) {
    throw new Error(`${relativePath}: active quality test still references the legacy partial runtime registry.`);
  }
  if (mode === "write") {
    if (next !== current) fs.writeFileSync(file, next);
    return next !== current;
  }
  if (next !== current) throw new Error(`${relativePath}: canonical Fagverk test migration drift.`);
  return false;
}

const qualityChanged = migrate("tests/aha-production-analysis-quality-matrix.test.cjs", [
  [
    "const REGISTRY_PATH = path.join(ROOT, 'data/integrations/runtime/history-go-fagverk-runtime-registry.v1.json');",
    "const CANONICAL_INDEX_PATH = path.join(ROOT, 'data/integrations/runtime/history-go-fagverk-canonical-index.v2.json');"
  ],
  [
`const fixture = readJson(FIXTURE_PATH);
const registry = readJson(REGISTRY_PATH);
assert.equal(fixture.version, 'aha_production_analysis_quality_matrix_v1');
assert.ok(Array.isArray(fixture.cases) && fixture.cases.length > 0, 'quality matrix must contain reviewed cases');

const activeSubjectIds = Object.keys(registry.active_subjects || {}).sort();
const fixtureSubjectIds = fixture.cases.map((item) => item.canonicalSubjectId).sort();
assert.deepEqual(fixtureSubjectIds, activeSubjectIds, 'quality matrix must track every runtime-active subject exactly once');`,
`const fixture = readJson(FIXTURE_PATH);
const canonicalIndex = readJson(CANONICAL_INDEX_PATH);
assert.equal(fixture.version, 'aha_production_analysis_quality_matrix_v1');
assert.ok(Array.isArray(fixture.cases) && fixture.cases.length > 0, 'quality matrix must contain reviewed cases');
assert.equal(canonicalIndex.schema, 'aha_history_go_fagverk_canonical_index_v2');
assert.equal(canonicalIndex.summary.subject_count, 20, 'canonical History-Go subject inventory must remain complete');
const canonicalSubjectIds = new Set(canonicalIndex.subjects.map((item) => item.subject_id));
fixture.cases.forEach((item) => {
  assert.ok(canonicalSubjectIds.has(item.canonicalSubjectId), \`${'${item.id}'}: reviewed subject is not in canonical History-Go index\`);
  assert.equal(item.ahaSubjectId, item.canonicalSubjectId, \`${'${item.id}'}: reviewed AHA subject must use canonical History-Go ID\`);
});`
  ]
]);

const pipelineChanged = migrate("tests/aha-production-analysis-pipeline-audit.test.cjs", [
  [
    "const REGISTRY_PATH = 'data/integrations/runtime/history-go-fagverk-runtime-registry.v1.json';",
    "const CANONICAL_INDEX_PATH = 'data/integrations/runtime/history-go-fagverk-canonical-index.v2.json';"
  ],
  [
`const registry = readJson(REGISTRY_PATH);
const subjectIndex = readJson('data/subjects/subjects_index.json');
const metaById = new Map((subjectIndex.subjects || []).map((item) => [item.subject_id, item]));
assert.equal(cases.length, Object.keys(registry.active_subjects || {}).length, 'Audit matrix must track every runtime-active canonical subject.');`,
`const canonicalIndex = readJson(CANONICAL_INDEX_PATH);
assert.equal(canonicalIndex.schema, 'aha_history_go_fagverk_canonical_index_v2');
assert.equal(canonicalIndex.summary.subject_count, 20, 'Canonical History-Go deployment index must expose all 19 root subjects + technology specialization.');
const canonicalById = new Map((canonicalIndex.subjects || []).map((item) => [item.subject_id, item]));
cases.forEach(([canonicalSubjectId, ahaSubjectId]) => {
  assert.ok(canonicalById.has(canonicalSubjectId), \`${'${canonicalSubjectId}'}: reviewed subject missing from canonical index\`);
  assert.equal(ahaSubjectId, canonicalSubjectId, \`${'${canonicalSubjectId}'}: AHA calibration case must use canonical subject ID\`);
});`
  ],
  [
`    const runtime = registry.active_subjects[canonicalSubjectId];
    const corpus = readJson(runtime.runtime_corpus_path);
    const meta = metaById.get(ahaSubjectId);
    const subject = readJson(\`data/subjects/${'${meta.file}'}\`);
    const emne = (subject.emner || []).find((item) => item.emne_id === emneId);

    assert.ok(emne); checks += 1;
    assert.equal(emne.fagverk.canonical_subject_id, canonicalSubjectId); checks += 1;
    assert.equal(emne.fagverk.chapter_id, chapterId); checks += 1;
    assert.equal(emne.fagverk.source_ref, corpus.source_ref); checks += 1;
    assert.ok(emne.fagverk.source_path && emne.fagverk.corpus_path && emne.fagverk.policy_path); checks += 1;`,
`    const canonicalSubject = canonicalById.get(canonicalSubjectId);
    const chapter = (canonicalSubject.chapters || []).find((item) => item.chapter_id === chapterId);

    assert.ok(chapter, \`${'${canonicalSubjectId}'}: reviewed chapter missing from canonical History-Go index\`); checks += 1;
    assert.equal(ahaSubjectId, canonicalSubjectId); checks += 1;
    assert.equal(chapter.chapter_id, chapterId); checks += 1;
    assert.equal(chapter.source_ref, canonicalIndex.canonical_source.source_ref); checks += 1;
    assert.ok(chapter.source_path); checks += 1;`
  ],
  [
    "        source_ref: corpus.source_ref,",
    "        source_ref: canonicalIndex.canonical_source.source_ref,"
  ]
]);

console.log(`Canonical Fagverk test contracts: ${mode === "write" ? "updated" : "verified"}${qualityChanged || pipelineChanged ? " with changes" : ""}.`);
