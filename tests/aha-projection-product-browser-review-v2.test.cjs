const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const document = {
  getElementById: () => null,
  querySelector: () => null
};
const context = {
  window: null,
  globalThis: null,
  document,
  console,
  Date,
  JSON,
  Object,
  Array,
  Set,
  String,
  Number,
  Promise,
  setTimeout,
  clearTimeout
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('ops/evaluation/ahaProjectionProductBrowserReviewV2.js', 'utf8'), context, {
  filename: 'ops/evaluation/ahaProjectionProductBrowserReviewV2.js'
});

const compare = context.AHAProjectionProductReviewV2.compareReplay;
const validateArchive = context.AHAProjectionProductReviewV2.validateArchivedLiveEvaluation;
const validateDraft = context.AHAProjectionProductReviewV2.validateHumanReviewDraft;
const baseline = context.AHAProjectionProductReviewV2.ARCHIVED_LIVE_BASELINE;
const fingerprint = { semantic_document: 1, analysis_bundle: 2, projection_runtime: 2, product_contract: 2 };
const result = (sourceId, sourceSha256 = 'a'.repeat(64), insight = 'Kildebeviset består.') => ({
  runtime_fingerprint: fingerprint,
  model: {
    surfaces: {
      insights: [{
        insight,
        source_id: sourceId,
        source_sha256: sourceSha256,
        provenance: {
          source_refs: [
            { value: sourceId, field: 'source_id' },
            { value: sourceSha256, field: 'source_text_hash' }
          ]
        }
      }],
      lists: []
    }
  }
});

assert.deepEqual(
  JSON.parse(JSON.stringify(compare(result('chat_message_first'), result('chat_message_replay')))),
  { comparable: true, deterministic: true },
  'run-local source event ids must not make an identical SHA-bound analysis nondeterministic'
);

const changedSource = compare(result('chat_message_first'), result('chat_message_replay', 'b'.repeat(64)));
assert.equal(changedSource.comparable, true);
assert.equal(changedSource.deterministic, false);
assert.equal(changedSource.difference.path, 'surfaces.insights[0].provenance.source_refs[1].value');

const changedInsight = compare(result('chat_message_first'), result('chat_message_replay', 'a'.repeat(64), 'Et annet innhold.'));
assert.equal(changedInsight.deterministic, false);
assert.equal(changedInsight.difference.path, 'surfaces.insights[0].insight');

const changedRuntime = compare(result('chat_message_first'), {
  ...result('chat_message_replay'),
  runtime_fingerprint: { ...fingerprint, projection_runtime: 3 }
});
assert.deepEqual(JSON.parse(JSON.stringify(changedRuntime)), { comparable: false, reason: 'runtime_version_changed' });

const corpus = JSON.parse(fs.readFileSync('tests/fixtures/aha-projection-product-evaluation-v2.json', 'utf8'));
const archivedResult = (caseId) => ({
  case_id: caseId,
  model: { surfaces: { lists: [], paths: [], mindmap: { nodes: [], edges: [] } }, product_states: { list: {}, path: {}, mindmap: {} } },
  critical_provenance_errors: []
});
const archivedLive = {
  schema: 'aha_projection_product_browser_evaluation_v2',
  version: 2,
  generated_at: baseline.generated_at,
  corpus_cases: 27,
  results: corpus.cases.map((entry) => archivedResult(entry.id)),
  live_transport: { successful_chat_count: 29, backend_http_failures: [], critical_failures: [] }
};
assert.deepEqual(
  JSON.parse(JSON.stringify(validateArchive(archivedLive, corpus))),
  { valid: true, cases: 27, generated_at: baseline.generated_at, successful_chat_count: 29, critical_transport_failures: 0 }
);
assert.throws(
  () => validateArchive({ ...archivedLive, generated_at: '2026-09-01T00:00:00.000Z' }, corpus),
  /godkjente arkiverte baseline-runnen/
);
assert.throws(
  () => validateArchive({ ...archivedLive, results: archivedLive.results.slice(1) }, corpus),
  /nøyaktig 27 cases/
);

const draft = {
  schema: 'aha_projection_product_human_review_v2',
  version: 2,
  reviewer: { name: 'Reviewer', reviewed_at: '2026-09-15', human_attestation: true },
  browser_evaluation: {
    source: {
      mode: 'archived_live',
      workflow_run_id: baseline.workflow_run_id,
      artifact_id: baseline.artifact_id
    }
  },
  case_reviews: corpus.cases.map((entry, index) => ({
    case_id: entry.id,
    lists: index === 0 ? 4 : null,
    paths: index === 0 ? 5 : null,
    mindmap: index === 0 ? 4 : null,
    critical_provenance_error: false,
    notes: index === 0 ? 'Første case vurdert.' : ''
  }))
};
const normalizedDraft = JSON.parse(JSON.stringify(validateDraft(draft, {
  results: archivedLive.results,
  corpus,
  review_source: {
    mode: 'archived_live',
    workflow_run_id: baseline.workflow_run_id,
    artifact_id: baseline.artifact_id
  }
})));
assert.equal(normalizedDraft.reviewer.name, 'Reviewer');
assert.equal(normalizedDraft.reviewer.reviewed_at, '2026-09-15');
assert.equal(Object.prototype.hasOwnProperty.call(normalizedDraft.reviewer, 'human_attestation'), false);
assert.equal(normalizedDraft.case_reviews[0].lists, 4);
assert.equal(normalizedDraft.case_reviews[0].paths, 5);
assert.equal(normalizedDraft.case_reviews[0].mindmap, 4);
assert.equal(normalizedDraft.case_reviews[0].notes, 'Første case vurdert.');
assert.throws(
  () => validateDraft({
    ...draft,
    browser_evaluation: { source: { mode: 'archived_live', workflow_run_id: 1, artifact_id: 2 } }
  }, {
    results: archivedLive.results,
    corpus,
    review_source: { mode: 'archived_live' }
  }),
  /samme arkiverte live-baselinen/
);
assert.throws(
  () => validateDraft({
    ...draft,
    case_reviews: draft.case_reviews.map((entry, index) => index === 0 ? { ...entry, lists: 6 } : entry)
  }, {
    results: archivedLive.results,
    corpus,
    review_source: { mode: 'archived_live', workflow_run_id: baseline.workflow_run_id, artifact_id: baseline.artifact_id }
  }),
  /ugyldig lists-score/
);

const html = fs.readFileSync('projection-product-review-v2.html', 'utf8');
assert.match(html, /id="live-import"/);
assert.match(html, /id="review-import"/);
assert.match(html, /review-progress/);
assert.match(html, /Eksporter review \/ utkast/);
assert.match(html, /run 32630087938 \/ artifact 9490861618/);
assert.match(html, /ingen nye modellkall|arkivert live-evaluering/i);
const reviewRuntime = fs.readFileSync('ops/evaluation/ahaProjectionProductBrowserReviewV2.js', 'utf8');
assert.match(reviewRuntime, /attestation"\)\) byId\("attestation"\)\.checked = false/);
assert.match(reviewRuntime, /Menneskelig attestasjon må bekreftes på nytt/);

console.log('aha-projection-product-browser-review-v2.test.cjs: OK');
