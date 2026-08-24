const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CANONICAL_INDEX_PATH = 'data/integrations/runtime/history-go-fagverk-canonical-index.v2.json';
const QUALITY_MATRIX_PATH = 'tests/fixtures/aha-production-analysis-quality-matrix.v1.json';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function localFetch() {
  return async (url) => {
    const relativePath = String(url || '').replace(/^\/+/, '');
    const absolutePath = path.resolve(ROOT, relativePath);
    if (!absolutePath.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(absolutePath)) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(absolutePath, 'utf8')) };
  };
}

const qualityMatrix = readJson(QUALITY_MATRIX_PATH);
assert.equal(qualityMatrix.version, 'aha_production_analysis_quality_matrix_v1');
const cases = qualityMatrix.cases.map((item) => [
  item.canonicalSubjectId,
  item.ahaSubjectId,
  item.chapterId,
  item.emneId,
  item.sourceText
]);

const canonicalIndex = readJson(CANONICAL_INDEX_PATH);
assert.equal(canonicalIndex.schema, 'aha_history_go_fagverk_canonical_index_v2');
assert.equal(canonicalIndex.summary.subject_count, 20, 'Canonical History-Go deployment index must expose all 19 root subjects + technology specialization.');
const canonicalById = new Map((canonicalIndex.subjects || []).map((item) => [item.subject_id, item]));
cases.forEach(([canonicalSubjectId, ahaSubjectId]) => {
  assert.ok(canonicalById.has(canonicalSubjectId), `${canonicalSubjectId}: reviewed subject missing from canonical index`);
  assert.equal(ahaSubjectId, canonicalSubjectId, `${canonicalSubjectId}: AHA calibration case must use canonical subject ID`);
});

const subjectContext = { window: null, globalThis: null, console, fetch: localFetch() };
subjectContext.window = subjectContext;
subjectContext.globalThis = subjectContext;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/ahaSubjectEngine.js'), 'utf8'), subjectContext, { filename: 'js/ahaSubjectEngine.js' });

(async () => {
  let checks = 0;
  for (const [canonicalSubjectId, ahaSubjectId, chapterId, emneId, text] of cases) {
    const canonicalSubject = canonicalById.get(canonicalSubjectId);
    const chapter = (canonicalSubject.chapters || []).find((item) => item.chapter_id === chapterId);

    assert.ok(chapter, `${canonicalSubjectId}: reviewed chapter missing from canonical History-Go index`); checks += 1;
    assert.equal(ahaSubjectId, canonicalSubjectId); checks += 1;
    assert.equal(chapter.chapter_id, chapterId); checks += 1;
    assert.equal(chapter.source_ref, canonicalIndex.canonical_source.source_ref); checks += 1;
    assert.ok(chapter.source_path); checks += 1;

    const matches = await subjectContext.AHASubjectEngine.matchText(text, { source: 'production_pipeline_audit', maxResults: 8 });
    assert.ok(matches.length > 0); checks += 1;
    if (matches[0].subject_id !== ahaSubjectId || matches[0].emne_id !== emneId) {
      console.error('FAGVERK_RANK_DIAGNOSTIC', JSON.stringify({
        case: canonicalSubjectId,
        expected: { subject_id: ahaSubjectId, emne_id: emneId },
        top: matches.slice(0, 8).map((match) => ({ subject_id: match.subject_id, emne_id: match.emne_id, title: match.title, type: match.type, score: match.score, strong: match.strong, matched_terms: match.matched_terms }))
      }));
    }
    assert.equal(matches[0].subject_id, ahaSubjectId); checks += 1;
    assert.equal(matches[0].emne_id, emneId); checks += 1;
    assert.equal(matches[0].provenance?.kind, 'canonical_fagverk'); checks += 1;
    assert.deepEqual(
      {
        canonical_subject_id: matches[0].provenance?.canonical_subject_id,
        chapter_id: matches[0].provenance?.chapter_id,
        source_ref: matches[0].provenance?.source_ref,
        evidence_role: matches[0].provenance?.evidence_role
      },
      {
        canonical_subject_id: canonicalSubjectId,
        chapter_id: chapterId,
        source_ref: canonicalIndex.canonical_source.source_ref,
        evidence_role: 'reference_support_not_source_evidence'
      }
    ); checks += 1;
  }

  const expectedChecks = cases.length * 10;
  assert.equal(checks, expectedChecks, `Expected ${expectedChecks} production assertions, got ${checks}`);

  const first = cases[0];
  const wrongSubjectMatches = await subjectContext.AHASubjectEngine.matchText(first[4], { source: 'wrong_subject_probe', maxResults: 8 });
  assert.ok(wrongSubjectMatches.length > 0);
  assert.equal(wrongSubjectMatches[0].subject_id, first[1]);

  console.log(`Production analysis pipeline audit: ${checks} checks across ${cases.length} canonical Fagverk calibration cases.`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
