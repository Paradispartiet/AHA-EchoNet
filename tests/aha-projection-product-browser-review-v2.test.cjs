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

console.log('aha-projection-product-browser-review-v2.test.cjs: OK');
