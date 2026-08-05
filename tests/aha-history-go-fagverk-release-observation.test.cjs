const assert = require('assert');
const fs = require('fs');

const observedPath = 'data/integrations/history-go-fagverk-release.observed.json';
const reportPath = 'data/integrations/review/history-go-fagverk-release-update.v1.json';
const runtimePath = 'backend/aha_engine/app/engine/fagverk_grounding.py';

assert.equal(fs.existsSync(observedPath), true, 'observed release exists');
assert.equal(fs.existsSync(reportPath), true, 'release update report exists');

const observed = JSON.parse(fs.readFileSync(observedPath, 'utf8'));
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

assert.equal(observed.schema, 'aha_history_go_fagverk_observed_release_v1');
assert.equal(observed.runtime_activation_allowed, false);
assert.match(observed.source_commit, /^[0-9a-f]{40}$/);
assert.match(observed.release_sha256, /^[0-9a-f]{64}$/);
assert.equal(observed.summary.subject_count, Object.keys(observed.subjects).length);
assert.equal(observed.summary.missing_file_count, 0);

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

console.log(`Observed Fagverk release contract passed: ${observed.summary.subject_count} subjects, ${observed.summary.chapter_count} chapters.`);
