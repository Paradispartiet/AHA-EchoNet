const assert = require('assert');
const fs = require('fs');

const corrections = JSON.parse(fs.readFileSync('data/evaluation/aha-politics-fixture-corrections.v1.json', 'utf8'));
const report = JSON.parse(fs.readFileSync('data/evaluation/aha-politics-fixture-correction-report.v1.json', 'utf8'));
const runtimeCode = fs.readFileSync('backend/aha_engine/app/engine/fagverk_grounding.py', 'utf8');

assert.equal(corrections.schema, 'aha_politics_fixture_corrections_v1');
assert.equal(corrections.version, '1.1.0');
assert.equal(corrections.status, 'full_fixture_review_baseline_not_runtime_active');
assert.equal(corrections.policy_version, '1.1.0');
assert.equal(corrections.runtime_activation_allowed, false);
assert.equal(corrections.cases.length, 16);
assert.equal(new Set(corrections.cases.map((item) => item.id)).size, 16);
assert.equal(new Set(corrections.cases.map((item) => item.fixture_path)).size, 16);
assert.equal(corrections.cases.filter((item) => item.fixture_role === 'legacy_exact_baseline').length, 8);
assert.equal(corrections.cases.filter((item) => item.fixture_role === 'qualitative_target_fixture').length, 8);

for (const correction of corrections.cases) {
  assert.equal(fs.existsSync(correction.fixture_path), true, correction.fixture_path);
  const fixture = JSON.parse(fs.readFileSync(correction.fixture_path, 'utf8'));
  const source = fixture.inputText.toLowerCase().replace(/\s+/g, ' ');
  assert.ok(correction.source_evidence.length >= 3, correction.id);
  correction.source_evidence.forEach((evidence) => assert.equal(source.includes(evidence.toLowerCase()), true, `${correction.id}: ${evidence}`));
  assert.ok(correction.unsupported_interpretations.length > 0, correction.id);
  assert.ok(correction.required_uncertainty.length > 0, correction.id);
}

assert.equal(report.schema, 'aha_politics_fixture_correction_report_v1');
assert.equal(report.version, '1.1.0');
assert.equal(report.policy_version, '1.2.0');
assert.equal(report.correction_version, '1.1.0');
assert.equal(report.status, 'passed_correction_gate');
assert.equal(report.runtime_activation_allowed, false);
assert.deepEqual(report.summary, {
  total: 16,
  passed: 16,
  failed: 0,
  exact_legacy_baselines: 8,
  qualitative_targets: 8,
  comparisons: { correct: 16 },
  validation_errors: 0
});
assert.deepEqual(report.validation_errors, []);
assert.deepEqual(report.failures, []);
assert.equal(report.cases.every((item) => item.passed === true), true);

const caseById = new Map(report.cases.map((item) => [item.id, item]));
const grounded = [
  ['correction-nav-reform-forvaltning', 'forvaltning'],
  ['correction-nav-user-meeting-forvaltning', 'forvaltning'],
  ['correction-legal-rights', 'rett-lov-rettssikkerhet']
];
grounded.forEach(([id, expectedChapter]) => {
  const item = caseById.get(id);
  assert.equal(item.policy_grounding.status, 'grounded', id);
  assert.equal(item.policy_grounding.selected_chapter_id, expectedChapter, id);
});

const unsupportedIds = corrections.cases
  .filter((item) => item.expected_politics_status === 'unsupported')
  .map((item) => item.id);
assert.equal(unsupportedIds.length, 13);
unsupportedIds.forEach((id) => {
  const item = caseById.get(id);
  assert.equal(item.policy_grounding.status, 'unsupported', id);
  assert.equal(item.policy_grounding.selected_chapter_id, null, id);
  assert.equal(item.forbidden_chapter_selected, false, id);
});

for (const id of ['correction-morgenbladet-media-non-politics', 'correction-morgenbladet-public-sphere-non-politics']) {
  const parliament = caseById.get(id).policy_grounding.ranking.find((item) => item.chapter_id === 'parlamentarisme');
  assert.equal(parliament.eligible, false, id);
  assert.equal(parliament.eligibility_reason, 'missing_required_anchor', id);
}

const literaryConflict = caseById.get('correction-literary-attachment-non-politics').policy_grounding.ranking.find((item) => item.chapter_id === 'konflikt-makt-sivilsamfunn');
assert.ok(literaryConflict);
assert.equal(literaryConflict.eligible, false);
assert.equal(literaryConflict.eligibility_reason, 'missing_required_anchor');

['correction-eidsvoll-history-non-politics', 'correction-bislett-sport-non-politics', 'correction-ai-learning-non-politics', 'correction-technical-project-non-politics'].forEach((id) => {
  assert.equal(caseById.get(id).policy_grounding.status, 'unsupported', id);
});

assert.equal(runtimeCode.includes('aha-politics-fixture-corrections.v1.json'), false);
assert.equal(runtimeCode.includes('aha-politics-fixture-correction-report.v1.json'), false);
assert.equal(runtimeCode.includes('history-go-fagverk-politikk.term-policy.v1.json'), false);

console.log('aha-politics-fixture-corrections tests passed');
