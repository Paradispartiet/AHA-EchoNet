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
  sourceTextHash: 'a'.repeat(64),
  createdAt: '2026-08-13T18:00:00.000Z',
  memoryAllowed: true
});

assert.equal(run.contractVersion, 'aha_analysis_run_v1');
assert.equal(run.analysisRunId, 'run_1');
assert.equal(run.sourceType, 'pasted_text');
assert.equal(run.memoryMode, 'allowed');
assert.equal(run.analysisBinding.valid, true);
assert.deepEqual(Array.from(run.invalidationReasons), []);

const canonical = { theme: 'Aktivt tema' };
api.bindArtifact(canonical, run, 'canonicalAnalysis', { producer: 'current_analysis_run' });
assert.equal(canonical.analysisRunId, 'run_1');
assert.equal(run.canonicalAnalysis.theme, 'Aktivt tema');

const identity = run;
const ahaSer = { tema: 'Aktivt tema' };
api.bindArtifact(ahaSer, run, 'ahaSer', { producer: 'current_analysis_run' });
api.update(run, {
  ahaSer,
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
  sourceTextHash: 'b'.repeat(64),
  canonicalAnalysis: { theme: 'Gammel analyse', analysisRunId: 'run_old', sourceTextHash: 'c'.repeat(64) },
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

const unbound = { theme: 'Skal ikke omstemples' };
api.bindArtifact(unbound, run, 'canonicalAnalysis');
assert.equal(unbound.sourceTextHash, undefined);
assert.equal(unbound.source_binding.status, 'invalid_unbound_artifact');

assert.equal(api.validate({ analysisRunId: 'run_3', sourceTextHash: 'short_hash' }).valid, false);
assert.ok(Array.from(api.validate({ analysisRunId: 'run_3', sourceTextHash: 'short_hash' }).errors).includes('invalid_source_sha256'));

console.log('aha-chat-analysis-run-contract passed');
