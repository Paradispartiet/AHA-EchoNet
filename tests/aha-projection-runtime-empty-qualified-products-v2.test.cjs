const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sha = 'd'.repeat(64);
const identity = {
  analysis_id: 'analysis_conflict_tourism',
  analysis_run_id: 'run_conflict_tourism',
  source_id: 'source_conflict_tourism',
  source_sha256: sha,
  topic_label: 'turisme og boligpress',
  created_at: '2026-08-23T13:10:07.855Z'
};
const evidence = [
  { excerpt: 'Turismen gir lokale inntekter, men presser boligmarkedet i høysesongen.', start: 0, end: 71 },
  { excerpt: 'Begge effektene er sterkest i de samme sentrumsområdene.', start: 72, end: 128 }
];
const bundle = {
  schema: 'aha_analysis_bundle_v2',
  version: 2,
  bundle_id: 'analysis_bundle_conflict_tourism',
  identity,
  semantic_document: {
    candidate_insight_ids: ['ins_conflict_tourism'],
    approved_insight_ids: ['ins_conflict_tourism'],
    approved_insight_records: [{
      id: 'ins_conflict_tourism',
      insight: 'Sentrumsområder bærer både turismeinntekter og boligpress.',
      type: 'generalization',
      causal_status: 'not_causal',
      quality_score: 0.72,
      evidence
    }]
  },
  surfaces: {
    concepts: [{
      schema: 'aha_analysis_field_v2',
      item_id: 'concept_sentrum',
      value: 'sentrumsområder',
      semantic_ids: ['concept_sentrum'],
      source_sha256: sha,
      analysis_run_id: identity.analysis_run_id,
      source_id: identity.source_id,
      topic: { status: 'verified' },
      quality: { status: 'passed' },
      provenance: { evidence }
    }]
  }
};
const cache = {
  analysisId: identity.analysis_id,
  analysisRunId: identity.analysis_run_id,
  sourceId: identity.source_id,
  sourceSha256: sha,
  payload: { analysisBundleV2: bundle }
};
const storage = new Map([['aha_chat_auto_outputs_v1', JSON.stringify(cache)]]);
let writes = 0;
const context = {
  console,
  URLSearchParams,
  location: { search: '' },
  localStorage: {
    getItem(key) { return storage.get(key) || null; },
    setItem() { writes += 1; },
    removeItem() { writes += 1; }
  },
  AHAAnalysisBundleV2: {
    hydrate(value) { return value?.schema === 'aha_analysis_bundle_v2' ? JSON.parse(JSON.stringify(value)) : null; }
  },
  AHAProjectionProductReadModelV2: {
    build(input) {
      assert.equal(input.legacy_insights.length, 1, 'fixture must contain one projection-ready insight');
      return {
        schema: 'aha_projection_product_read_model_v2',
        version: 2,
        mode: 'read_only',
        status: 'ready',
        projection_id: 'projection_conflict_tourism',
        surfaces: {
          insights: input.legacy_insights,
          concepts: [],
          lists: [],
          paths: [],
          mindmap: {
            nodes: [],
            edges: [],
            read_only: true,
            quality: {
              schema: 'aha_projection_artifact_quality_v2',
              artifact_type: 'mindmap',
              score: 0.65,
              passed: false,
              reasons: ['mindmap_too_small', 'mindmap_has_too_few_branches']
            }
          }
        },
        artifact_quality: {
          lists: [],
          paths: [],
          mindmap: { passed: false, reasons: ['mindmap_too_small', 'mindmap_has_too_few_branches'] }
        },
        validation: { valid: true, errors: [] },
        policy: { persistent_write: false, remote_write: false }
      };
    }
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/ahaProjectionRuntimeSourceV2.js', 'utf8'), context, { filename: 'js/ahaProjectionRuntimeSourceV2.js' });

const model = context.AHAProjectionRuntimeSourceV2.build();
assert.equal(model.status, 'blocked', 'a model with no surviving qualified product must fail closed');
assert.equal(model.validation.valid, false);
assert.ok(model.blocking_reasons.includes('integration_not_ready'));
assert.ok(model.validation.errors.includes('integration_not_ready'));
assert.deepEqual(
  Object.values(model.product_states).map((state) => state.status),
  ['needs_evidence', 'needs_evidence', 'needs_evidence'],
  'product-specific states must preserve the quality hold-back explanation'
);
assert.ok(model.product_states.mindmap.reason.includes('mindmap_too_small'));
assert.equal(context.AHAProjectionRuntimeSourceV2.surface('lists'), null, 'blocked readiness must not expose a product surface');
assert.equal(model.policy.product_store_write, false);
assert.equal(model.policy.automatic_product_write, false);
assert.equal(model.policy.remote_write, false);
assert.equal(writes, 0, 'readiness diagnostics must never write storage');

console.log('aha-projection-runtime-empty-qualified-products-v2.test.cjs: OK');
