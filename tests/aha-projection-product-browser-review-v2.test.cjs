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
for (const file of [
  'js/ahaInsightRelationClassifierV2.js',
  'js/ahaInsightSaturationV2.js',
  'js/ahaSemanticProjectionsV2.js',
  'js/ahaProjectionArtifactQualityV2.js',
  'ops/evaluation/ahaProjectionProductBrowserReviewV2.js'
]) vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });

const compare = context.AHAProjectionProductReviewV2.compareReplay;
const validateArchive = context.AHAProjectionProductReviewV2.validateArchivedLiveEvaluation;
const validateDraft = context.AHAProjectionProductReviewV2.validateHumanReviewDraft;
const rubricModel = context.AHAProjectionProductReviewV2.rubricModel;
const baseline = context.AHAProjectionProductReviewV2.ARCHIVED_LIVE_BASELINE;
const reprojectArchivedResult = context.AHAProjectionProductReviewV2.reprojectArchivedResult;
const requiresProductScores = context.AHAProjectionProductReviewV2.requiresProductScores;
assert.equal(typeof requiresProductScores, 'function', 'review must expose product-score applicability');
assert.equal(typeof reprojectArchivedResult, 'function', 'archived live review must expose current-code reprojection');

function archivedProjectedInsight(id, insight, conceptKeys) {
  return {
    id,
    insight,
    summary: insight,
    title: insight,
    type: 'generalization',
    causal_status: 'not_causal',
    concept_keys: conceptKeys,
    quality: { representative_score: 0.82, mean_score: 0.82, min_score: 0.82, max_score: 0.82 },
    provenance: {
      evidence: [
        { quote: `${insight} Kildebelegg A.`, role: 'supports' },
        { quote: `${insight} Kildebelegg B.`, role: 'context' }
      ],
      source_refs: [
        { field: 'source_id', value: 'archived_source' },
        { field: 'source_text_hash', value: 'c'.repeat(64) }
      ],
      source_member_ids: [id]
    },
    member_ids: [id],
    meta: { read_only: true, projection_candidate: true }
  };
}

const staleArchivedResult = {
  case_id: 'data_energy',
  model: {
    schema: 'aha_projection_product_read_model_v2',
    version: 2,
    mode: 'read_only',
    status: 'ready',
    projection_id: 'projection_v2_archived',
    gate_id: 'v2_active_bundle_gate_projection_v2_archived',
    validation: { valid: true, errors: [] },
    policy: { persistent_write: false, remote_write: false },
    product_states: {
      list: { status: 'ready', href: 'lists.html?projection_id=projection_v2_archived' },
      path: { status: 'ready', href: 'paths.html?projection_id=projection_v2_archived' },
      mindmap: { status: 'ready', href: 'mindmap.html?projection_id=projection_v2_archived' }
    },
    surfaces: {
      insights: [
        archivedProjectedInsight('old_a', 'Strømbruken falt etter oppgraderingen.', ['grader', 'strømbruk']),
        archivedProjectedInsight('old_b', 'Vinteren var tre grader mildere enn referanseåret.', ['grader', 'vinter']),
        archivedProjectedInsight('old_c', 'Reduksjonen i strømbruk må vurderes mot været.', ['prosent', 'strømbruk'])
      ],
      concepts: [],
      lists: [{ id: 'old_list', title: 'Utforsk grader', items: [], meta: {} }],
      paths: [],
      mindmap: { nodes: [], edges: [], read_only: true }
    }
  },
  critical_provenance_errors: []
};
const reprojected = JSON.parse(JSON.stringify(reprojectArchivedResult(staleArchivedResult)));
assert.equal(reprojected.review_reprojection.mode, 'current_read_only_projection_from_archived_live_insights');
assert.equal(reprojected.review_reprojection.archived_projection_id, 'projection_v2_archived');
assert.notEqual(reprojected.model.projection_id, 'projection_v2_archived');
assert.equal(Object.prototype.hasOwnProperty.call(reprojected.model, 'gate_id'), false, 'review-only reprojection must not retain stale archived gate_id');
assert.equal(Object.prototype.hasOwnProperty.call(reprojected.model, 'product_states'), false, 'review-only reprojection must not retain stale archived product states or preview hrefs');
assert.ok(reprojected.model.surfaces.lists.every((list) => list.title !== 'Utforsk grader'), 'stale low-information list title must not survive review reprojection');
assert.ok(reprojected.model.surfaces.lists.some((list) => /strømbruk/i.test(list.title)), 'meaningful current source theme must remain reviewable');
assert.equal(baseline.workflow_run_id, 32633381518);
assert.equal(baseline.artifact_id, 9491725428);
assert.equal(baseline.head_sha, '5aab589eed30012c349f4679c201ee87f0a27602');
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
assert.equal(requiresProductScores({ model: { status: 'blocked' } }, { expected_visible: false }), false, 'correctly suppressed cases must not require nonexistent product scores');
assert.equal(requiresProductScores({ model: { status: 'blocked' } }, { expected_visible: true }), true, 'expected-visible misses must remain score-required');
assert.equal(requiresProductScores({ model: { status: 'ready' } }, { expected_visible: false }), true, 'unexpectedly visible suppression cases must remain score-required');
const humanReviewContract = JSON.parse(fs.readFileSync('ops/evaluation/aha-projection-product-human-review-v2.json', 'utf8'));
const canonicalRubric = JSON.parse(JSON.stringify(rubricModel(humanReviewContract)));
assert.deepEqual(canonicalRubric, {
  scale: '1-5',
  acceptable_score_minimum: 4,
  criteria: {
    lists: ['tematisk_koherens', 'ikke_triviell', 'begrunnet_medlemskap', 'kildebevaring'],
    paths: ['progresjon', 'overganger', 'laeringsutbytte', 'aapent_spoersmaal'],
    mindmap: ['hierarki', 'meningsfulle_grener', 'stoeykontroll', 'resonans_semantikk']
  }
});
assert.throws(
  () => rubricModel({ ...humanReviewContract, rubric: { ...humanReviewContract.rubric, acceptable_score_minimum: 6 } }),
  /ugyldig skala eller terskel/
);
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
      projection_mode: 'current_read_only_projection_from_archived_live_insights',
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
    projection_mode: 'current_read_only_projection_from_archived_live_insights',
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
const suppressedDraftEntry = normalizedDraft.case_reviews.find((entry) => entry.case_id === 'weak_slogan');
assert.equal(suppressedDraftEntry.product_scores_required, false);
assert.equal(suppressedDraftEntry.lists, null);
assert.equal(suppressedDraftEntry.paths, null);
assert.equal(suppressedDraftEntry.mindmap, null);
assert.throws(
  () => validateDraft({
    ...draft,
    browser_evaluation: { source: { mode: 'archived_live', workflow_run_id: 1, artifact_id: 2 } }
  }, {
    results: archivedLive.results,
    corpus,
    review_source: { mode: 'archived_live', projection_mode: 'current_read_only_projection_from_archived_live_insights' }
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
    review_source: { mode: 'archived_live', projection_mode: 'current_read_only_projection_from_archived_live_insights', workflow_run_id: baseline.workflow_run_id, artifact_id: baseline.artifact_id }
  }),
  /ugyldig lists-score/
);

assert.throws(
  () => validateDraft({
    ...draft,
    case_reviews: draft.case_reviews.map((entry) => entry.case_id === 'weak_slogan' ? { ...entry, lists: 5 } : entry)
  }, {
    results: archivedLive.results,
    corpus,
    review_source: { mode: 'archived_live', projection_mode: 'current_read_only_projection_from_archived_live_insights', workflow_run_id: baseline.workflow_run_id, artifact_id: baseline.artifact_id }
  }),
  /score er ikke relevant for korrekt undertrykt output/
);

assert.throws(
  () => validateDraft({
    ...draft,
    browser_evaluation: {
      source: {
        mode: 'archived_live',
        workflow_run_id: baseline.workflow_run_id,
        artifact_id: baseline.artifact_id
      }
    }
  }, {
    results: archivedLive.results,
    corpus,
    review_source: {
      mode: 'archived_live',
      projection_mode: 'current_read_only_projection_from_archived_live_insights',
      workflow_run_id: baseline.workflow_run_id,
      artifact_id: baseline.artifact_id
    }
  }),
  /current-code reprojeksjonsmodus/
);


const html = fs.readFileSync('projection-product-review-v2.html', 'utf8');
assert.match(html, /id="live-import"/);
assert.match(html, /id="review-import"/);
assert.match(html, /id="rubric"/);
assert.match(html, /review-progress/);
assert.match(html, /Eksporter review \/ utkast/);
assert.match(html, /run 32633381518 \/ artifact 9491725428/);
assert.match(html, /ingen nye modellkall|arkivert live-evaluering/i);
assert.match(html, /ahaSemanticProjectionsV2\.js/);
assert.match(html, /ahaProjectionArtifactQualityV2\.js/);
assert.match(html, /byg(g|ger).*på nytt lokalt|byg(g|ger).*lokalt/i);
assert.doesNotMatch(html, /0\/81 produktscorer/);
const reviewRuntime = fs.readFileSync('ops/evaluation/ahaProjectionProductBrowserReviewV2.js', 'utf8');
assert.match(reviewRuntime, /attestation"\)\) byId\("attestation"\)\.checked = false/);
assert.match(reviewRuntime, /Menneskelig attestasjon må bekreftes på nytt/);
assert.match(reviewRuntime, /HUMAN_REVIEW_URL/);
assert.match(reviewRuntime, /data-rubric-product/);
assert.match(reviewRuntime, /acceptable_score_minimum/);

console.log('aha-projection-product-browser-review-v2.test.cjs: OK');
