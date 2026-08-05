const assert = require('assert');
const fs = require('fs');

const observedPath = 'data/integrations/history-go-fagverk-release.observed.json';
const approvedPath = 'data/integrations/history-go-fagverk-release.approved.json';
const runtimeActivePath = 'data/integrations/history-go-fagverk-release.runtime-active.json';
const reportPath = 'data/integrations/review/history-go-fagverk-release-update.v1.json';
const runtimeCorpusPath = 'data/integrations/history-go-fagverk-corpus.v1.json';
const runtimePath = 'backend/aha_engine/app/engine/fagverk_grounding.py';

for (const filePath of [observedPath, approvedPath, runtimeActivePath, reportPath, runtimeCorpusPath]) {
  assert.equal(fs.existsSync(filePath), true, filePath);
}

const observed = JSON.parse(fs.readFileSync(observedPath, 'utf8'));
const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8'));
const runtimeActive = JSON.parse(fs.readFileSync(runtimeActivePath, 'utf8'));
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const runtimeCorpus = JSON.parse(fs.readFileSync(runtimeCorpusPath, 'utf8'));
const isV2 = observed.schema === 'aha_history_go_fagverk_observed_release_v2';

assert.ok(['aha_history_go_fagverk_observed_release_v1', 'aha_history_go_fagverk_observed_release_v2'].includes(observed.schema));
assert.equal(observed.runtime_activation_allowed, false);
assert.match(observed.source_commit, /^[0-9a-f]{40}$/);
assert.match(observed.release_sha256, /^[0-9a-f]{64}$/);
assert.equal(observed.summary.subject_count, Object.keys(observed.subjects).length);
assert.equal(observed.summary.missing_file_count, 0);
if (isV2) {
  assert.equal(observed.lifecycle_stage, 'observed_upstream_release');
  assert.equal(observed.producer_release_schema, 'history_go_fagverk_release_v2');
  assert.equal(observed.summary.root_subject_count + observed.summary.specialization_count, observed.summary.subject_count);
  assert.equal(
    Object.values(observed.subjects).reduce((sum, subject) => sum + subject.optional_gap_count, 0),
    observed.summary.optional_gap_count
  );
}

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

assert.equal(runtimeActive.schema, 'aha_history_go_fagverk_runtime_active_v1');
assert.equal(runtimeActive.status, 'seed_runtime_active');
assert.equal(runtimeActive.approved_contract, approvedPath);
assert.equal(runtimeActive.active_source_commit, approved.approved_source_commit);
assert.equal(runtimeActive.active_corpus.path, approved.approved_corpus.path);
assert.equal(runtimeActive.active_corpus.entry_count, approved.approved_corpus.entry_count);
assert.equal(runtimeActive.full_release_active, false);
assert.equal(runtimeActive.activation_rules.observed_release_is_not_runtime, true);
assert.equal(runtimeActive.activation_rules.candidate_release_is_not_runtime, true);
assert.equal(runtimeActive.activation_rules.approved_release_requires_explicit_pointer_update, true);
assert.equal(runtimeActive.activation_rules.explicit_activation_pull_request_required, true);

assert.notEqual(observed.source_commit, approved.approved_source_commit, 'observed and approved source refs must remain distinct until activation');
assert.notEqual(observed.source_commit, runtimeActive.active_source_commit, 'observed and runtime-active source refs must remain distinct until activation');
assert.equal(approved.activation_rules.observed_release_is_not_approved, true);
assert.equal(approved.activation_rules.candidate_corpora_are_not_runtime_inputs, true);
assert.equal(approved.activation_rules.explicit_activation_pull_request_required, true);

assert.ok(['aha_history_go_fagverk_release_update_v1', 'aha_history_go_fagverk_release_update_v2'].includes(report.schema));
assert.equal(report.runtime_activation_allowed, false);
assert.equal(report.next.source_commit, observed.source_commit);
assert.equal(report.next.release_sha256, observed.release_sha256);
assert.equal(report.next.registry_version, observed.registry.version);
assert.equal(report.approval_boundary, 'observation_and_candidate_generation_only');
if (isV2) {
  assert.equal(report.schema, 'aha_history_go_fagverk_release_update_v2');
  assert.equal(report.lifecycle_stage, 'candidate_import_review');
  assert.equal(report.activation_boundary.observed_release_is_not_approved, true);
  assert.equal(report.activation_boundary.imported_candidates_are_not_approved, true);
  assert.equal(report.activation_boundary.approved_release_is_not_runtime_active_without_explicit_pointer_update, true);
}

for (const [subjectId, expected] of Object.entries(observed.subjects)) {
  const candidatePath = `data/integrations/candidates/history-go-fagverk-${subjectId}.candidate.v1.json`;
  const auditPath = `data/integrations/candidates/history-go-fagverk-${subjectId}.candidate-audit.v1.json`;
  assert.equal(fs.existsSync(candidatePath), true, candidatePath);
  assert.equal(fs.existsSync(auditPath), true, auditPath);
  const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  assert.equal(candidate.source_ref, observed.source_commit, subjectId);
  assert.equal(audit.gate.passed, true, subjectId);

  if (!isV2 || expected.chapter_status === 'materialized') {
    assert.equal(candidate.schema, 'aha_history_go_fagverk_corpus_v1', subjectId);
    assert.equal(candidate.entries.length, expected.chapter_count, subjectId);
    assert.equal(audit.coverage.registered, expected.chapter_count, subjectId);
    assert.equal(audit.coverage.materialized, expected.chapter_count, subjectId);
    assert.equal(audit.chapters.reduce((sum, chapter) => sum + chapter.module_file_count, 0), expected.module_file_count, subjectId);
    assert.equal(new Set(candidate.entries.map((entry) => entry.chapter_id)).size, expected.chapter_count, subjectId);
  } else {
    assert.equal(candidate.schema, 'aha_history_go_fagverk_package_candidate_v1', subjectId);
    assert.equal(candidate.candidate_kind, 'package_inventory', subjectId);
    assert.equal(candidate.chapter_status, 'not_materialized', subjectId);
    assert.equal(candidate.package_file_count, expected.package_file_count, subjectId);
    assert.equal(candidate.existing_package_file_count, expected.package_file_count - expected.optional_gap_count, subjectId);
    assert.equal(candidate.package_content_sha256, expected.package_content_sha256, subjectId);
    assert.equal(candidate.structure_sha256, expected.structure_sha256, subjectId);
    assert.equal(candidate.content_sha256, expected.content_sha256, subjectId);
    assert.deepEqual(candidate.optional_gaps, expected.missing_optional_files, subjectId);
    assert.equal(audit.coverage.declared_package_files, expected.package_file_count, subjectId);
    assert.equal(audit.coverage.materialized_existing_package_files, expected.package_file_count - expected.optional_gap_count, subjectId);
    assert.equal(candidate.runtime_activation_allowed, false, subjectId);
    assert.equal(audit.runtime_activation_allowed, false, subjectId);
  }
}

const runtimeCode = fs.readFileSync(runtimePath, 'utf8');
assert.equal(runtimeCode.includes('history-go-fagverk-release.observed.json'), false);
assert.equal(runtimeCode.includes('data/integrations/candidates'), false);
assert.equal(runtimeCode.includes('history-go-fagverk-release-update.v1.json'), false);
assert.match(runtimeCode, /history-go-fagverk-corpus\.v1\.json/);

console.log(`Observed Fagverk release contract passed: ${observed.summary.subject_count} packages, ${observed.summary.chapter_count} chapters; runtime remains ${runtimeCorpus.entries.length}-entry seed.`);
