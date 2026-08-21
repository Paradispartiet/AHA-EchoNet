const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { window: null, globalThis: null, console, Date, Math, Object, Array, Set, Map, JSON };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/ahaModuleApi.js', 'utf8'), context, { filename: 'js/ahaModuleApi.js' });
vm.runInContext(fs.readFileSync('js/ahaChatAnalysisRunContract.js', 'utf8'), context, { filename: 'js/ahaChatAnalysisRunContract.js' });
vm.runInContext(fs.readFileSync('js/ahaChatExport.js', 'utf8'), context, { filename: 'js/ahaChatExport.js' });

const api = context.AHAAnalysisBundleV2;
const registeredApi = context.AHAModuleApi.get('chat.analysisBundleV2', { version: 2 });
assert.equal(Object.isFrozen(registeredApi), true);
assert.equal(registeredApi.SCHEMA, api.SCHEMA);
const schema = JSON.parse(fs.readFileSync('schemas/aha-analysis-bundle-v2.schema.json', 'utf8'));
assert.equal(schema.properties.schema.const, api.SCHEMA);
assert.equal(schema.properties.version.const, api.VERSION);
assert.deepEqual(Array.from(api.SURFACES), ['overview', 'insights', 'concepts', 'conversation_tracks', 'subjects', 'sources', 'source_structure', 'afterwork']);

const sourceText = 'Livsarket organiserer erfaringer, kilder og ideer. Kildebelegg må spores. Tolkning må skilles fra sikre innsikter. https://example.invalid/livsarket';
const sourceSha = 'b'.repeat(64);
const run = {
  analysisId: 'analysis_livsarket',
  analysisRunId: 'run_livsarket',
  runId: 'run_livsarket',
  sourceId: 'source_livsarket',
  sourceSha256: sourceSha,
  source_sha256: sourceSha,
  sourceTextHash: sourceSha,
  createdAt: '2026-08-21T08:00:00.000Z',
  sourceText
};
const payload = {
  ...run,
  source_binding: { valid: true },
  canonicalAnalysis: {
    theme: 'Livsarket organiserer erfaringer, kilder og ideer.',
    mainTension: 'Tolkning må skilles fra sikre innsikter.',
    keyInsight: 'Kildebelegg må spores.',
    suggestedActions: ['Undersøk hvilke åpne spørsmål teksten etterlater.']
  },
  ahaSer: {
    tema: 'Livsarket organiserer erfaringer, kilder og ideer.',
    hovedspenning: 'Tolkning må skilles fra sikre innsikter.',
    viktigsteInnsikt: 'Kildebelegg må spores.',
    nesteSteg: 'Undersøk hvilke åpne spørsmål teksten etterlater.'
  },
  insightCards: [{ text: 'Kildebelegg må spores.', evidence: 'Kildebelegg må spores.' }, { label: 'Tolkning må skilles fra sikre innsikter.' }],
  keywords: [{ label: 'Livsarket', evidence: 'Livsarket' }, 'kildebelegg'],
  subjectMatches: [{ subject_id: 'sub_kunnskap', title: 'Kunnskapsorganisering', score: 0.74, explanation: 'Kilden handler om å organisere kunnskap.', evidence: 'organiserer erfaringer, kilder og ideer' }],
  summary: 'Livsarket organiserer erfaringer, kilder og ideer.',
  reflection: 'Tolkning må skilles fra sikre innsikter.',
  thoughts: { hovedspor: 'Livsarket', lose_tanker: 'Tolkning må skilles fra sikre innsikter.', neste_steg: 'Undersøk åpne spørsmål.' },
  sortItems: [{ label: 'Belegg', text: 'Kildebelegg må spores.' }]
};

const bundle = api.build({ activeRun: run, payload, sourceText, primarySourceKind: 'pasted_text' });
assert.equal(bundle.schema, 'aha_analysis_bundle_v2');
assert.equal(bundle.version, 2);
assert.equal(bundle.validation.valid, true);
assert.notEqual(bundle.status, 'invalid');
assert.equal(bundle.identity.source_sha256, sourceSha);
assert.equal(bundle.identity.analysis_run_id, run.analysisRunId);
assert.equal(bundle.identity.analysis_id, run.analysisId);
assert.equal(bundle.identity.source_id, run.sourceId);
assert.equal(Object.isFrozen(bundle), true);
assert.equal(Object.isFrozen(bundle.surfaces), true);
assert.equal(Object.isFrozen(bundle.surfaces.overview.theme), true);
assert.equal(JSON.stringify(bundle).includes(sourceText), false, 'raw source text must remain outside the durable bundle');
assert.equal(JSON.stringify(bundle).includes('[object Object]'), false);
assert.equal(JSON.stringify(bundle).includes('historical Morgenbladet afterwork'), false);

function fields(value, out = []) {
  if (!value || typeof value !== 'object') return out;
  if (value.schema === api.FIELD_SCHEMA) { out.push(value); return out; }
  if (Array.isArray(value)) value.forEach((item) => fields(item, out));
  else Object.values(value).forEach((item) => fields(item, out));
  return out;
}
const allFields = fields(bundle.surfaces);
assert.ok(allFields.length >= 12);
allFields.forEach((field) => {
  assert.equal(field.source_sha256, sourceSha);
  assert.equal(field.analysis_run_id, run.analysisRunId);
  assert.equal(field.source_id, run.sourceId);
  assert.equal(field.provenance.source_sha256, sourceSha);
  assert.equal(field.provenance.analysis_run_id, run.analysisRunId);
  assert.equal(Array.isArray(field.provenance.evidence), true);
  if (field.topic.status === 'unknown') assert.notEqual(field.quality.status, 'passed');
});
assert.equal(bundle.surfaces.overview.strongest_insight.quality.status, 'passed');
assert.notEqual(bundle.surfaces.overview.next_inquiry.quality.status, 'passed', 'identity-only field cannot pass');
assert.equal(bundle.surfaces.sources[0].value.role, 'primary');
assert.equal(bundle.surfaces.sources[0].value.kind, 'pasted_text');
assert.ok(bundle.surfaces.sources.some((item) => item.value.url === 'https://example.invalid/livsarket'));
api.CLOSED_WRITE_POLICY.forEach((key) => assert.equal(bundle.policy[key], false));

const same = api.build({ activeRun: run, payload, sourceText, primarySourceKind: 'pasted_text' });
assert.equal(same.bundle_id, bundle.bundle_id, 'same run identity must produce the same bundle id');
assert.deepEqual(JSON.parse(JSON.stringify(same.surfaces)), JSON.parse(JSON.stringify(bundle.surfaces)));

const tampered = JSON.parse(JSON.stringify(bundle));
tampered.surfaces.overview.theme.source_sha256 = 'c'.repeat(64);
assert.equal(api.validate(tampered).valid, false);
assert.ok(api.validate(tampered).errors.some((error) => error.endsWith(':source_mismatch')));
assert.equal(api.hydrate(tampered), null, 'stale field must fail closed during reload hydration');

const runWithBundle = context.AHAChatAnalysisRunContract.create({ ...run, analysisBundleV2: bundle });
assert.equal(runWithBundle.analysisBinding.valid, true);
const wrongAnalysisIdentity = JSON.parse(JSON.stringify(bundle));
wrongAnalysisIdentity.identity.analysis_id = 'analysis_other';
wrongAnalysisIdentity.validation = { valid: true, errors: [] };
const rejectedRun = context.AHAChatAnalysisRunContract.create({ ...run, analysisBundleV2: wrongAnalysisIdentity });
assert.equal(rejectedRun.analysisBinding.valid, false);
assert.ok(rejectedRun.invalidFields.some((item) => item.field === 'analysisBundleV2' && item.status === 'invalid_analysis_id_mismatch'));

const falsePass = JSON.parse(JSON.stringify(bundle));
falsePass.surfaces.overview.next_inquiry.quality.status = 'passed';
assert.equal(api.validate(falsePass).valid, false);
assert.ok(api.validate(falsePass).errors.some((error) => error.endsWith(':false_quality_pass')));

const perField = api.build({
  activeRun: run,
  payload,
  sourceText,
  fieldReports: {
    'canonicalAnalysis.theme': { valid: false, status: 'invalid_semantic_topic_mismatch' },
    'canonicalAnalysis.keyInsight': { valid: true, status: 'valid' }
  }
});
assert.equal(perField.surfaces.overview.theme.topic.status, 'rejected');
assert.equal(perField.surfaces.overview.strongest_insight.topic.status, 'verified');
assert.equal(perField.surfaces.overview.strongest_insight.quality.status, 'passed');
assert.notEqual(perField.surfaces.overview.central_tension.topic.status, 'rejected', 'one rejected field must not reject the whole surface');
assert.equal(perField.status, 'incomplete', 'a rejected topic field must not invalidate correctly bound sibling fields');
const perFieldLegacy = api.toLegacyView(perField);
assert.equal(perFieldLegacy.canonicalAnalysis.theme, '', 'rejected field must be absent from typed consumer view');
assert.equal(perFieldLegacy.canonicalAnalysis.keyInsight, 'Kildebelegg må spores.', 'valid sibling field must remain available');

const legacy = api.toLegacyView(bundle);
assert.equal(legacy.canonicalAnalysis.keyInsight, 'Kildebelegg må spores.');
assert.equal(legacy.ahaSer.tema, 'Livsarket organiserer erfaringer, kilder og ideer.');
assert.equal(legacy.afterwork.reflection, 'Tolkning må skilles fra sikre innsikter.');
assert.ok(legacy.insights.every((item) => typeof item === 'string'));

let canonicalBuildCalls = 0;
const exportBundle = context.AHAChatExport.buildAhaAnalysisExportBundle({
  analysisBundleV2: api,
  analysisRunContract: context.AHAChatAnalysisRunContract,
  loadAutoOutputs: () => ({
    activeRun: { ...run, analysisBundleV2: bundle },
    payload: { ...payload, analysisBundleV2: bundle },
    sourceText,
    sourceTextHash: sourceSha,
    sourceSha256: sourceSha,
    source_sha256: sourceSha,
    analysisId: run.analysisId,
    analysisRunId: run.analysisRunId,
    sourceId: run.sourceId
  }),
  getActiveAnalysisRun: () => ({ ...run, analysisBundleV2: bundle }),
  loadAfterworkEntries: () => [{ id: 'old', sourceTextHash: sourceSha, summary: 'historical Morgenbladet afterwork', createdAt: '2026-08-20' }],
  sourceHash: () => sourceSha,
  buildCanonicalAnalysis: () => { canonicalBuildCalls += 1; throw new Error('legacy canonical rebuild is forbidden'); },
  normalizeSubjectLinks: (value) => value,
  normalizeFagkoblinger: (value) => value,
  isAcademicLikeType: () => false,
  loadChamberFromStorage: () => ({ insights: [{ title: 'historical' }], chatLog: [] }),
  buildMetaProfile: () => ({}),
  getLatestAhaReplyFromDom: () => ''
});
assert.equal(canonicalBuildCalls, 0, 'authoritative export must not rebuild or merge canonical analysis');
assert.equal(exportBundle.version, 'aha_analysis_export_v2');
assert.equal(exportBundle.authoritativeAnalysisSchema, api.SCHEMA);
assert.equal(exportBundle.analysisBundleV2.bundle_id, bundle.bundle_id);
assert.equal(exportBundle.analysisBundleV2, bundle, 'export must consume the one immutable run bundle without rebuilding it');
assert.equal(exportBundle.canonicalAnalysis.keyInsight, 'Kildebelegg må spores.');
assert.deepEqual(JSON.parse(JSON.stringify(exportBundle.rawAutoPayload)), {});
assert.equal(exportBundle.rawAutoPayloadStatus, 'excluded_by_analysis_bundle_v2_authority');
assert.equal(exportBundle.selectedAfterworkStatus, 'historical_afterwork_not_merged');
assert.equal(JSON.stringify(exportBundle.relevantAfterworks).includes('Morgenbladet'), false, 'historical content may be related by id but never merged');

console.log('aha-analysis-bundle-v2.test.cjs passed');
