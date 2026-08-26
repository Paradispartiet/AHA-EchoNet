const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let forbiddenWrites = 0;
const context = {
  window: null,
  globalThis: null,
  console,
  Date,
  Math,
  JSON,
  Object,
  Array,
  Set,
  Map,
  localStorage: {
    getItem() { throw new Error('live semantic bridge must not read Chamber or local storage'); },
    setItem() { forbiddenWrites += 1; throw new Error('live semantic bridge must not write local storage'); }
  },
  fetch() { forbiddenWrites += 1; throw new Error('live semantic bridge must not call remote services'); },
  AHALists: { add() { forbiddenWrites += 1; } },
  AHAPaths: { add() { forbiddenWrites += 1; } },
  AHAMindmap: { add() { forbiddenWrites += 1; } }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const file of [
  'js/ahaModuleApi.js',
  'js/ahaChatIngestRuntime.js',
  'js/ahaSemanticModelShadowBridge.js',
  'js/ahaChatAnalysisRunContract.js'
]) vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });

const sourceText = 'Et prosjekt brukte én felles mal for alle rapporter. Det gjorde sammenligning enklere, men tvang også svært ulike saker inn i samme struktur. Da malen fikk noen faste felt og noen valgfrie felt, beholdt rapportene en felles kjerne samtidig som de kunne tilpasses saken.';
const sourceSha256 = context.AHASemanticDocument.sha256Hex(sourceText);
const activeRun = {
  analysisId: 'analysis_live_semantic',
  analysisRunId: 'run_live_semantic',
  runId: 'run_live_semantic',
  sourceId: 'source_live_semantic',
  sourceSha256,
  source_sha256: sourceSha256,
  sourceTextHash: sourceSha256,
  createdAt: '2026-08-21T12:00:00.000Z'
};
const approvedCandidate = {
  insight: 'Delvis standardisering kan bevare sammenlignbarhet samtidig som ulike saker får nødvendig fleksibilitet.',
  type: 'tension',
  abstraction: 'Kobler ulempen ved én fast struktur med løsningen der noen felt er faste og andre valgfrie.',
  evidence: [
    { quote: 'Det gjorde sammenligning enklere, men tvang også svært ulike saker inn i samme struktur.', role: 'supports' },
    { quote: 'Da malen fikk noen faste felt og noen valgfrie felt, beholdt rapportene en felles kjerne samtidig som de kunne tilpasses saken.', role: 'limits' }
  ],
  why_it_matters: 'Prinsippet kan brukes når et system må kombinere en felles kjerne med lokal tilpasning.',
  confidence: 'high',
  uncertainty: '',
  causal_status: 'not_causal'
};
const blockedCandidate = {
  ...approvedCandidate,
  insight: 'Det gjorde sammenligning enklere, men tvang også svært ulike saker inn i samme struktur.'
};
const liveApiCandidate = {
  title: 'Felles kjerne med lokal tilpasning',
  summary: 'Delvis standardisering balanserer sammenlignbarhet mot behovet for lokal fleksibilitet i ulike saker.',
  functional_type: 'pattern',
  evidence_quotes: [
    'Det gjorde sammenligning enklere, men tvang også svært ulike saker inn i samme struktur.',
    'Da malen fikk noen faste felt og noen valgfrie felt, beholdt rapportene en felles kjerne samtidig som de kunne tilpasses saken.'
  ],
  why_it_matters: 'Modellen viser hvordan styringssystemer kan kombinere felles krav med nødvendig lokal tilpasning.',
  uncertainty: 'interpretive',
  claim_kind: 'interpretation',
  candidate_type: 'ai'
};
const sparseEvidenceCandidate = {
  title: 'Fast mal avløst av kontrollert fleksibilitet',
  summary: 'Erfaringen med én rigid rapportmal peker mot kontrollert fleksibilitet som et bedre kompromiss mellom sammenligning og sakstilpasning.',
  functional_type: 'learning_point',
  evidence_quotes: [
    'Det gjorde sammenligning enklere, men tvang også svært ulike saker inn i samme struktur.'
  ],
  why_it_matters: 'Skillet hjelper systemeiere å beholde sammenlignbare kjernefelt uten å presse ulike saker inn i identiske rapporter.',
  uncertainty: 'interpretive',
  claim_kind: 'interpretation',
  candidate_type: 'ai'
};
const payload = {
  ...activeRun,
  source_binding: { valid: true },
  concepts: ['felles mal', 'sammenligning', 'faste felt', 'valgfrie felt'],
  canonicalAnalysis: {
    theme: 'Standardisering og fleksibilitet',
    mainTension: 'Det gjorde sammenligning enklere, men tvang også svært ulike saker inn i samme struktur.',
    keyInsight: 'Eldre canonical-tekst skal ikke slås sammen med den autoritative kandidatlisten.'
  },
  ahaSer: { viktigsteInnsikt: 'Eldre afterwork-tekst skal ikke slås sammen med den autoritative kandidatlisten.' },
  reflection: approvedCandidate.why_it_matters,
  insightCandidatesV2: [approvedCandidate, blockedCandidate, liveApiCandidate, sparseEvidenceCandidate, { insight: 'Kilde registrert', type: 'pattern' }]
};

const bridge = context.AHALiveSemanticBridgeV2;
const semantic = bridge.build({ activeRun, payload, sourceText });
assert.equal(semantic.schema, 'aha_semantic_document_v2');
assert.equal(semantic.validation.valid, true);
assert.equal(semantic.source_sha256, sourceSha256);
assert.equal(semantic.analysis_run_id, activeRun.analysisRunId);
assert.equal(Object.isFrozen(semantic), true);
assert.ok(semantic.concepts.length >= 4);
assert.ok(semantic.claims.length >= 3);
assert.ok(semantic.relations.length >= 4);
assert.ok(semantic.tensions.length >= 1);
assert.equal(semantic.candidate_insights.length, 4, 'metadata candidates must be excluded before semantic insight creation');
assert.equal(semantic.candidate_insights.filter((item) => item.status === 'approved').length, 3);
assert.equal(semantic.candidate_insights.filter((item) => item.status === 'blocked').length, 1);
assert.equal(semantic.candidate_insights.find((item) => item.insight === liveApiCandidate.summary).origin, 'live_analysis_candidate');
assert.equal(semantic.candidate_insights[0].evidence[1].role, 'limits',
  'the live semantic bridge must not flatten limiting evidence into supporting evidence');
const sparseSemanticCandidate = semantic.candidate_insights.find((item) => item.insight === sparseEvidenceCandidate.summary);
assert.equal(sparseSemanticCandidate.status, 'approved', 'the bridge must complete sparse exact evidence across distinct source claims');
assert.ok(sparseSemanticCandidate.quality_metrics.evidence_sentence_count >= 2);
assert.equal(JSON.stringify(semantic.candidate_insights).includes('Eldre canonical-tekst'), false);
assert.equal(JSON.stringify(semantic.candidate_insights).includes('Eldre afterwork-tekst'), false);
assert.equal(semantic.synthesis_gate.authoritative, true);
assert.equal(semantic.synthesis_gate.approved_count, 3);
assert.equal(semantic.synthesis_gate.blocked_count, 1);
assert.equal(semantic.policy.legacy_chamber_dependency, false);
assert.equal(semantic.policy.ungated_heuristic_synthesis, false);
bridge.CLOSED_WRITE_POLICY.forEach((key) => assert.equal(semantic.policy[key], false));

const emptyAuthoritative = bridge.build({
  activeRun,
  sourceText,
  payload: { ...payload, insightCandidatesV2: [] }
});
assert.equal(emptyAuthoritative.candidate_insights.length, 0,
  'an explicitly empty authoritative list must not fall back to canonical or afterwork candidates');

const changedLegacy = bridge.build({
  activeRun,
  sourceText,
  payload: {
    ...payload,
    concepts: ['rapporter', 'prosjekt'],
    canonicalAnalysis: {
      ...payload.canonicalAnalysis,
      concepts: ['rapporter', 'prosjekt'],
      mainTension: 'Et prosjekt brukte én felles mal for alle rapporter.'
    },
    ahaSer: {
      viktigsteInnsikt: 'En annen legacy-innsikt.',
      begreper: ['rapporter'],
      hovedspenning: 'Et prosjekt brukte én felles mal for alle rapporter.'
    },
    reflection: 'En annen legacy-refleksjon.'
  }
});
assert.deepEqual(JSON.parse(JSON.stringify(changedLegacy.concepts)), JSON.parse(JSON.stringify(semantic.concepts)),
  'authoritative concepts must be independent of legacy canonical and afterwork ordering');
assert.deepEqual(JSON.parse(JSON.stringify(changedLegacy.tensions)), JSON.parse(JSON.stringify(semantic.tensions)),
  'authoritative tensions must be derived from the source rather than legacy canonical fields');
assert.deepEqual(JSON.parse(JSON.stringify(changedLegacy.candidate_insights)), JSON.parse(JSON.stringify(semantic.candidate_insights)),
  'authoritative candidates must be independent of legacy reflection and canonical fallbacks');

const bundle = context.AHAAnalysisBundleV2.build({ activeRun, payload, sourceText, semanticDocument: semantic });
assert.equal(bundle.validation.valid, true);
assert.equal(bundle.semantic_document.schema, semantic.schema);
assert.equal(bundle.semantic_document.source_sha256, sourceSha256);
assert.equal(bundle.semantic_document.analysis_run_id, activeRun.analysisRunId);
assert.equal(bundle.semantic_document.source_id, activeRun.sourceId);
assert.equal(bundle.semantic_document.approved_insight_ids.length, 3);
assert.equal(bundle.semantic_document.blocked_candidate_insight_ids.length, 1);
assert.equal(bundle.surfaces.insights.length, 3, 'only quality-approved current insights may enter AnalysisBundleV2');
assert.equal(bundle.surfaces.insights[0].value, approvedCandidate.insight);
assert.equal(bundle.surfaces.insights[0].provenance.origin, 'semantic_document_v2_quality_approved');
assert.equal(bundle.surfaces.overview.strongest_insight.value, approvedCandidate.insight);
assert.ok(bundle.surfaces.concepts.every((field) => field.provenance.origin === 'semantic_document_v2_literal_concept'));
assert.equal(JSON.stringify(bundle).includes('Kilde registrert'), false);
assert.equal(forbiddenWrites, 0, 'building the semantic document and bundle must remain read-only');

const rejectedLegacyTopicReports = context.AHAAnalysisBundleV2.build({
  activeRun,
  payload,
  sourceText,
  semanticDocument: semantic,
  fieldReports: {
    'insights.item': { valid: false, status: 'invalid_legacy_topic_report' },
    'concepts.item': { valid: false, status: 'invalid_legacy_topic_report' },
    'canonicalAnalysis.mainTension': { valid: false, status: 'invalid_legacy_topic_report' },
    'canonicalAnalysis.keyInsight': { valid: false, status: 'invalid_legacy_topic_report' }
  }
});
assert.ok(rejectedLegacyTopicReports.surfaces.insights.every((field) => field.topic.status === 'verified' && field.quality.status === 'passed'),
  'legacy topic reports must not override authoritative source-bound insight evidence');
assert.ok(rejectedLegacyTopicReports.surfaces.concepts.every((field) => field.topic.status === 'verified' && field.quality.status === 'passed'),
  'legacy topic reports must not override authoritative source-bound concept evidence');
assert.equal(rejectedLegacyTopicReports.surfaces.overview.central_tension.topic.status, 'verified');
assert.equal(rejectedLegacyTopicReports.surfaces.overview.strongest_insight.topic.status, 'verified');
assert.deepEqual(
  JSON.parse(JSON.stringify(rejectedLegacyTopicReports.surfaces.insights)),
  JSON.parse(JSON.stringify(bundle.surfaces.insights)),
  'authoritative insight fields must be deterministic when unrelated Chat topic reports change'
);
assert.deepEqual(
  JSON.parse(JSON.stringify(rejectedLegacyTopicReports.surfaces.concepts)),
  JSON.parse(JSON.stringify(bundle.surfaces.concepts)),
  'authoritative concept fields must be deterministic when unrelated Chat topic reports change'
);

const reloaded = bridge.hydrate(JSON.parse(JSON.stringify(semantic)), { activeRun, payload, sourceText });
assert.ok(reloaded);
assert.equal(Object.isFrozen(reloaded), true);
assert.deepEqual(JSON.parse(JSON.stringify(reloaded)), JSON.parse(JSON.stringify(semantic)));
assert.equal(bridge.hydrate(semantic, { activeRun: { ...activeRun, analysisRunId: 'stale_run', runId: 'stale_run' }, payload, sourceText }), null);
assert.equal(bridge.hydrate(semantic, { activeRun, payload, sourceText: `${sourceText} stale` }), null);

const staleSemantic = JSON.parse(JSON.stringify(semantic));
staleSemantic.analysis_run_id = 'stale_run';
staleSemantic.validation = { valid: true, errors: [] };
const staleBundle = context.AHAAnalysisBundleV2.build({ activeRun, payload, sourceText, semanticDocument: staleSemantic });
assert.equal(staleBundle.validation.valid, false, 'AnalysisBundleV2 must never restamp a stale SemanticDocument with the active run identity');
assert.equal(staleBundle.status, 'invalid');
assert.ok(staleBundle.validation.errors.includes('semantic_document_analysis_run_id_mismatch'));

console.log('aha-live-semantic-bridge-v2.test.cjs passed');
