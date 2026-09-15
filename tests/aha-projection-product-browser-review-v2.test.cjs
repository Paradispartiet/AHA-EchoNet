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
const html = fs.readFileSync('projection-product-review-v2.html', 'utf8');
assert.match(html, /id="live-import"/);
assert.match(html, /run 32633381518 \/ artifact 9491725428/);
assert.match(html, /ingen nye modellkall|arkivert live-evaluering/i);

console.log('aha-projection-product-browser-review-v2.test.cjs: OK');
