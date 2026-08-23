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
  let subjectEngineFinished = false;
  let forwarded = null;
  const clientContext = {
    window: null,
    globalThis: null,
    console,
    JSON,
    String,
    Number,
    Array,
    Object,
    TypeError,
    AbortController,
    setTimeout,
    clearTimeout,
    location: { hostname: 'localhost' },
    localStorage: { getItem: () => null },
    AHASubjectEngine: {
      async matchText(message, options) {
        assert.equal(subjectEngineFinished, false);
        assert.equal(options.source, 'agent_preflight');
        await Promise.resolve();
        subjectEngineFinished = true;
        return [{
          subject_id: first[1], subject_label: 'By og samfunnsrom', emne_id: first[3], title: 'Datastyring', type: 'concept', score: 12,
          matched_terms: ['algoritmisk styring', 'datastyring'],
          provenance: { kind: 'canonical_fagverk', canonical_subject_id: first[0], chapter_id: first[2], source_ref: 'source-sha', evidence_role: 'reference_support_not_source_evidence' }
        }];
      }
    },
    fetch: async (url, init) => {
      assert.equal(subjectEngineFinished, true, 'Subject Engine must finish before the agent network request.');
      forwarded = { url, init, body: JSON.parse(init.body) };
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
  };
  clientContext.window = clientContext;
  clientContext.globalThis = clientContext;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/ahaEngineClient.js'), 'utf8'), clientContext, { filename: 'js/ahaEngineClient.js' });

  await clientContext.fetch('https://example.test/api/aha-agent/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: first[4], ai_state: { mode: 'assistant' } })
  });

  assert.ok(forwarded);
  assert.equal(forwarded.body.subject_context.role, 'fagverk_reference_support');
  assert.equal(forwarded.body.subject_context.evidence_policy.source_evidence, 'user_message_only');
  assert.equal(forwarded.body.subject_context.evidence_policy.fagverk, 'reference_support_not_source_evidence');
  assert.equal(forwarded.body.ai_state.subject_context.matches[0].provenance.chapter_id, first[2]);

  const pythonGrounding = fs.readFileSync(path.join(ROOT, 'backend/aha_engine/app/engine/fagverk_grounding.py'), 'utf8');
  assert.match(pythonGrounding, /Mer detaljert tolkning må fortsatt dokumenteres direkte i kildeteksten/);
  assert.match(pythonGrounding, /Fagverk-grounding er referansestøtte, ikke automatisk sannhet eller modelltrening/);

  console.log(`AHA production analysis pipeline audit: PASS (${checks}/${expectedChecks} dynamic subject checks; ${cases.length} subjects)`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
