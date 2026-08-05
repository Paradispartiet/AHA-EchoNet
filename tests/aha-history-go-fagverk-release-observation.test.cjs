const assert = require('assert');
const fs = require('fs');

const observedPath = 'data/integrations/history-go-fagverk-release.observed.json';
const approvedPath = 'data/integrations/history-go-fagverk-release.approved.json';
const reportPath = 'data/integrations/review/history-go-fagverk-release-update.v1.json';
const runtimeCorpusPath = 'data/integrations/history-go-fagverk-corpus.v1.json';
const runtimePath = 'backend/aha_engine/app/engine/fagverk_grounding.py';

for (const filePath of [observedPath, approvedPath, reportPath, runtimeCorpusPath]) {
  assert.equal(fs.existsSync(filePath), true, filePath);
}

const observed = JSON.parse(fs.readFileSync(observedPath, 'utf8'));
const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8'));
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const runtimeCorpus = JSON.parse(fs.readFileSync(runtimeCorpusPath, 'utf8'));

assert.equal(observed.schema, 'aha_history_go_fagverk_observed_release_v1');
assert.equal(observed.runtime_activation_allowed, false);
assert.match(observed.source_commit, /^[0-9a-f]{40}$/);
assert.match(observed.release_sha256, /^[0-9a-f]{64}$/);
assert.equal(observed.summary.subject_count, Object.keys(observed.subjects).length);
assert.equal(observed.summary.missing_file_count, 0);

assert.equal(approved.schema, 'aha_history_go_fagverk_approved_runtime_v1');
assert.equal(approved.status, 'seed_runtime_approved');
assert.equal(approved.full_release_approved, false);
assert.equal(approved.approved_source_commit, runtimeCorpus.source_ref);
assert.equal(approved.approved_corpus.path, runtimeCorpusPath);
assert.equal(approved.approved_corpus.entry_count, runtimeCorpus.entries.length);
assert.deepEqual(
  approved.approved_corpus.entries,
  runtimeCorpus.entries.map((entry) => ({ subject_id: entry.subject_id, chapter_id: entry.chapter_id }))
);
assert.notEqual(observed.source_commit, approved.approved_source_commit, 'observed and approved source refs must remain distinct until activation');
assert.equal(approved.activation_rules.observed_release_is_not_approved, true);
assert.equal(approved.activation_rules.candidate_corpora_are_not_runtime_inputs, true);
assert.equal(approved.activation_rules.explicit_activation_pull_request_required, true);

assert.equal(report.schema, 'aha_history_go_fagverk_release_update_v1');
assert.equal(report.runtime_activation_allowed, false);
assert.equal(report.next.source_commit, observed.source_commit);
assert.equal(report.next.release_sha256, observed.release_sha256);
assert.equal(report.next.registry_version, observed.registry.version);
assert.equal(report.approval_boundary, 'observation_and_candidate_generation_only');
assert.deepEqual([...report.changed_subjects].sort(), Object.keys(observed.subjects).sort());

for (const subjectId of report.changed_subjects) {
  const corpusPath = `data/integrations/candidates/history-go-fagverk-${subjectId}.candidate.v1.json`;
  const auditPath = `data/integrations/candidates/history-go-fagverk-${subjectId}.candidate-audit.v1.json`;
  assert.equal(fs.existsSync(corpusPath), true, corpusPath);
  assert.equal(fs.existsSync(auditPath), true, auditPath);
  const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  const expected = observed.subjects[subjectId];
  assert.equal(corpus.source_ref, observed.source_commit, subjectId);
  assert.equal(corpus.entries.length, expected.chapter_count, subjectId);
  assert.equal(audit.gate.passed, true, subjectId);
  assert.equal(audit.coverage.registered, expected.chapter_count, subjectId);
  assert.equal(audit.coverage.materialized, expected.chapter_count, subjectId);
  assert.equal(audit.chapters.reduce((sum, chapter) => sum + chapter.module_file_count, 0), expected.module_file_count, subjectId);
  assert.equal(new Set(corpus.entries.map((entry) => entry.chapter_id)).size, expected.chapter_count, subjectId);
}

const runtimeCode = fs.readFileSync(runtimePath, 'utf8');
assert.equal(runtimeCode.includes('history-go-fagverk-release.observed.json'), false);
assert.equal(runtimeCode.includes('data/integrations/candidates'), false);
assert.equal(runtimeCode.includes('history-go-fagverk-release-update.v1.json'), false);
assert.match(runtimeCode, /history-go-fagverk-corpus\.v1\.json/);

console.log(`Observed Fagverk release contract passed: ${observed.summary.subject_count} subjects, ${observed.summary.chapter_count} chapters; runtime remains ${runtimeCorpus.entries.length}-entry seed.`);
