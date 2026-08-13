const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const registrations = [];
const context = {
  window: null,
  console,
  Date,
  Object,
  Array,
  String,
  Set,
  AHAModuleApi: {
    register(name, api, options) { registrations.push({ name, api, options }); }
  }
};
context.window = context;
vm.runInNewContext(fs.readFileSync('js/ahaChatAnalysisRunContract.js', 'utf8'), context, {
  filename: 'js/ahaChatAnalysisRunContract.js'
});

assert.equal(registrations.length, 1);
assert.equal(registrations[0].name, 'chat.analysisRunContract');
assert.equal(registrations[0].options.version, 1);

const api = context.AHAChatAnalysisRunContract;
const run = api.create({
  analysisId: 'analysis_1',
  runId: 'run_1',
  sourceId: 'source_1',
  sourceKind: 'pasted_text',
  sourceText: 'Dette er den aktive kildeteksten.',
  sourceTextHash: 'hash_1',
  createdAt: '2026-08-13T18:00:00.000Z',
  memoryAllowed: true
});

assert.equal(run.contractVersion, 'aha_analysis_run_v1');
assert.equal(run.analysisRunId, 'run_1');
assert.equal(run.sourceType, 'pasted_text');
assert.equal(run.memoryMode, 'allowed');
assert.equal(run.analysisBinding.valid, true);
assert.deepEqual(Array.from(run.invalidationReasons), []);

const canonical = { theme: 'Aktivt tema', sourceTextHash: 'hash_1' };
api.bindArtifact(canonical, run, 'canonicalAnalysis');
assert.equal(canonical.analysisRunId, 'run_1');
assert.equal(run.canonicalAnalysis.theme, 'Aktivt tema');

const identity = run;
api.update(run, {
  ahaSer: { tema: 'Aktivt tema', sourceTextHash: 'hash_1' },
  concepts: ['kildebinding'],
  subjectMatches: [{ title: 'Analyse' }]
});
assert.equal(run, identity, 'updates must preserve the active run object identity');
assert.equal(run.ahaSer.tema, 'Aktivt tema');
assert.deepEqual(Array.from(run.concepts), ['kildebinding']);

const stale = api.finalizeExport({
  version: 'aha_analysis_export_v1',
  analysisRunId: 'run_2',
  sourceText: 'Ny kilde',
  sourceTextHash: 'hash_new',
  canonicalAnalysis: { theme: 'Gammel analyse', sourceTextHash: 'hash_old' },
  quality: { status: 'valid', failClosed: false, sourceBinding: { invalidFields: [] } }
});
assert.equal(stale.analysisBinding.valid, false);
assert.equal(stale.quality.failClosed, false, 'the contract must not rewrite the producer quality report');
assert.ok(stale.invalidFields.some((item) => item.field === 'canonicalAnalysis' && item.status === 'invalid_hash_mismatch'));
assert.ok(stale.invalidationReasons.includes('canonicalAnalysis:invalid_hash_mismatch'));
assert.equal(api.validate(stale).valid, false);

const missingIdentity = api.validate({ sourceText: 'Kilde uten identitet' });
assert.equal(missingIdentity.valid, false);
assert.ok(Array.from(missingIdentity.errors).includes('missing_run_id'));
assert.ok(Array.from(missingIdentity.errors).includes('missing_source_text_hash'));

console.log('aha-chat-analysis-run-contract passed');
