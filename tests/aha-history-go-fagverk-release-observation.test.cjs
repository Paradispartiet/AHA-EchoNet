const assert = require('assert');
const fs = require('fs');

const observedPath = 'data/integrations/history-go-fagverk-release.observed.json';
const approvedPath = 'data/integrations/history-go-fagverk-release.approved.json';
const runtimeActivePath = 'data/integrations/history-go-fagverk-release.runtime-active.json';
const reportPath = 'data/integrations/review/history-go-fagverk-release-update.v1.json';
const runtimeCorpusPath = 'data/integrations/history-go-fagverk-corpus.v1.json';
const subjectBaselinePath = 'data/integrations/review/history-go-fagverk-subject-content-baseline.v1.json';
const runtimePath = 'backend/aha_engine/app/engine/fagverk_grounding.py';

for (const filePath of [observedPath, approvedPath, runtimeActivePath, reportPath, runtimeCorpusPath, subjectBaselinePath]) {
  assert.equal(fs.existsSync(filePath), true, filePath);
}

const observed = JSON.parse(fs.readFileSync(observedPath, 'utf8'));
const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8'));
const runtimeActive = JSON.parse(fs.readFileSync(runtimeActivePath, 'utf8'));
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const runtimeCorpus = JSON.parse(fs.readFileSync(runtimeCorpusPath, 'utf8'));
const subjectBaseline = JSON.parse(fs.readFileSync(subjectBaselinePath, 'utf8'));
const isObservedV2 = observed.schema === 'aha_history_go_fagverk_observed_release_v2';
const isRuntimeV2 = approved.schema === 'aha_history_go_fagverk_approved_runtime_v2';

assert.ok(['aha_history_go_fagverk_observed_release_v1', 'aha_history_go_fagverk_observed_release_v2'].includes(observed.schema));
assert.equal(observed.runtime_activation_allowed, false);
assert.match(observed.source_commit, /^[0-9a-f]{40}$/);
assert.match(observed.release_sha256, /^[0-9a-f]{64}$/);
assert.equal(observed.summary.subject_count, Object.keys(observed.subjects).length);
assert.equal(observed.summary.missing_file_count, 0);
if (isObservedV2) {
  assert.equal(observed.lifecycle_stage, 'observed_upstream_release');
  assert.equal(observed.producer_release_schema, 'history_go_fagverk_release_v2');
  assert.equal(observed.summary.root_subject_count + observed.summary.specialization_count, observed.summary.subject_count);
  assert.equal(Object.values(observed.subjects).reduce((sum, subject) => sum + subject.optional_gap_count, 0), observed.summary.optional_gap_count);
}

assert.ok(['aha_history_go_fagverk_release_update_v1', 'aha_history_go_fagverk_release_update_v2'].includes(report.schema));
assert.equal(report.runtime_activation_allowed, false);
assert.equal(report.next.source_commit, observed.source_commit);
assert.equal(report.next.release_sha256, observed.release_sha256);
assert.equal(report.next.registry_version, observed.registry.version);
assert.equal(report.approval_boundary, 'observation_and_candidate_generation_only');
if (isObservedV2) {
  assert.equal(report.schema, 'aha_history_go_fagverk_release_update_v2');
  assert.equal(report.lifecycle_stage, 'candidate_import_review');
  assert.equal(report.activation_boundary.observed_release_is_not_approved, true);
  assert.equal(report.activation_boundary.imported_candidates_are_not_approved, true);
  assert.equal(report.activation_boundary.approved_release_is_not_runtime_active_without_explicit_pointer_update, true);
}
const changes = new Map((report.subjects || []).map((item) => [item.subject_id, item]));

assert.equal(runtimeCorpus.schema, 'aha_history_go_fagverk_corpus_v1');
assert.equal(runtimeCorpus.entries.length, 3, 'legacy seed corpus must remain unchanged');
assert.equal(subjectBaseline.schema, 'aha_history_go_fagverk_subject_content_baseline_v1');
assert.equal(subjectBaseline.runtime_activation_allowed, false);

if (!isRuntimeV2) {
  assert.equal(approved.schema, 'aha_history_go_fagverk_approved_runtime_v1');
  assert.equal(approved.status, 'seed_runtime_approved');
  assert.equal(approved.full_release_approved, false);
  assert.equal(approved.approved_source_commit, runtimeCorpus.source_ref);
  assert.equal(runtimeActive.schema, 'aha_history_go_fagverk_runtime_active_v1');
  assert.equal(runtimeActive.status, 'seed_runtime_active');
  assert.equal(runtimeActive.active_source_commit, approved.approved_source_commit);
} else {
  assert.equal(approved.status, 'partial_subject_runtime_approved');
  assert.equal(approved.full_release_approved, false);
  assert.equal(approved.approved_source_commit, runtimeCorpus.source_ref, 'legacy compatibility pointer remains seed-bound');
  assert.equal(runtimeActive.schema, 'aha_history_go_fagverk_runtime_active_v2');
  assert.equal(runtimeActive.status, 'partial_subject_runtime_active');
  assert.equal(runtimeActive.active_source_commit, runtimeCorpus.source_ref, 'legacy compatibility pointer remains seed-bound');

  const activeIds = ['historie', 'naeringsliv', 'natur', 'politikk', 'subkultur'];
  const expectedCounts = { historie: 23, naeringsliv: 12, natur: 11, politikk: 13, subkultur: 8 };
  assert.deepEqual(approved.legacy_seed.overridden_subject_ids, activeIds);
  assert.deepEqual(runtimeActive.legacy_seed.overridden_subject_ids, activeIds);
  assert.deepEqual(Object.keys(approved.approved_subjects), activeIds);
  assert.deepEqual(Object.keys(runtimeActive.active_subjects), activeIds);
  for (const subjectId of activeIds) {
    const baseline = subjectBaseline.subjects[subjectId];
    const observedSubject = observed.subjects[subjectId];
    const approvedSubject = approved.approved_subjects[subjectId];
    const activeSubject = runtimeActive.active_subjects[subjectId];
    assert.ok(baseline, `${subjectId}: approved subject-content baseline exists`);
    assert.equal(observedSubject.content_sha256, baseline.subject_content_sha256, `${subjectId}: observed content remains approved`);
    assert.equal(approvedSubject.source_commit, baseline.approved_source_ref, `${subjectId}: runtime approval keeps reviewed source provenance`);
    assert.equal(activeSubject.source_commit, approvedSubject.source_commit, `${subjectId}: runtime active source matches approval`);
    assert.equal(activeSubject.corpus_path, approvedSubject.corpus_path);
    assert.equal(activeSubject.policy_path, approvedSubject.policy_path);
    assert.equal(activeSubject.chapter_count, expectedCounts[subjectId]);
    assert.equal(activeSubject.scoring_mode, 'subject_policy_v1');
    assert.equal(approvedSubject.corpus_path.startsWith('data/integrations/runtime/'), true);
    assert.equal(approvedSubject.policy_path.startsWith('data/integrations/runtime/'), true);
  }
  assert.equal(runtimeActive.effective_entry_count, 67);
  assert.equal(runtimeActive.activation_rules.active_subjects_override_legacy_subject_entries, true);
  assert.equal(runtimeActive.activation_rules.unregistered_candidates_are_not_runtime, true);
  assert.equal(runtimeActive.activation_rules.no_runtime_network_fetch, true);
  assert.equal(runtimeActive.activation_rules.no_history_go_writeback, true);
  assert.equal(approved.activation_rules.approval_does_not_activate_unregistered_subjects, true);
  assert.equal(approved.activation_rules.subject_review_approval_required, true);
}

assert.equal(runtimeActive.full_release_active, false);
assert.notEqual(observed.source_commit, approved.approved_source_commit, 'whole observed release must remain distinct from the legacy compatibility pointer');
assert.notEqual(observed.source_commit, runtimeActive.active_source_commit, 'whole observed release must remain distinct from the legacy compatibility pointer');
assert.equal(approved.activation_rules.explicit_activation_pull_request_required, true);

for (const [subjectId, expected] of Object.entries(observed.subjects)) {
  const candidatePath = `data/integrations/candidates/history-go-fagverk-${subjectId}.candidate.v1.json`;
  const auditPath = `data/integrations/candidates/history-go-fagverk-${subjectId}.candidate-audit.v1.json`;
  assert.equal(fs.existsSync(candidatePath), true, candidatePath);
  assert.equal(fs.existsSync(auditPath), true, auditPath);
  const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  const change = changes.get(subjectId);
  if (change && change.status !== 'unchanged') assert.equal(candidate.source_ref, observed.source_commit, `${subjectId}: changed candidate must bind current observed source`);
  assert.equal(audit.source_ref, candidate.source_ref, `${subjectId}: candidate and audit provenance match`);
  assert.equal(audit.gate.passed, true, subjectId);
  assert.equal(candidate.runtime_activation_allowed, false, subjectId);
  assert.equal(audit.runtime_activation_allowed, false, subjectId);

  if (!isObservedV2 || expected.chapter_status === 'materialized') {
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
  }
}

const runtimeCode = fs.readFileSync(runtimePath, 'utf8');
assert.equal(runtimeCode.includes('history-go-fagverk-release.observed.json'), false);
assert.equal(runtimeCode.includes('data/integrations/candidates'), false);
assert.equal(runtimeCode.includes('data/integrations/review'), false);
assert.equal(runtimeCode.includes('data/integrations/approvals'), false);
assert.equal(runtimeCode.includes('history-go-fagverk-release-update.v1.json'), false);
assert.match(runtimeCode, /history-go-fagverk-corpus\.v1\.json/);
if (isRuntimeV2) assert.match(runtimeCode, /history-go-fagverk-release\.runtime-active\.json/);

console.log(`Observed Fagverk release contract passed: ${observed.summary.subject_count} packages, ${observed.summary.chapter_count} upstream chapters; runtime is ${isRuntimeV2 ? `${runtimeActive.effective_entry_count}-entry partial activation` : `${runtimeCorpus.entries.length}-entry seed`}.`);
