const assert = require('assert');
const fs = require('fs');

const correctionsPath = 'data/evaluation/aha-politics-fixture-corrections.v1.json';
const reportPath = 'data/evaluation/aha-politics-fixture-correction-report.v1.json';
const runtimePath = 'backend/aha_engine/app/engine/fagverk_grounding.py';

assert.equal(fs.existsSync(correctionsPath), true);
assert.equal(fs.existsSync(reportPath), true);

const corrections = JSON.parse(fs.readFileSync(correctionsPath, 'utf8'));
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

assert.equal(corrections.schema, 'aha_politics_fixture_corrections_v1');
assert.equal(corrections.status, 'human_review_baseline_not_runtime_active');
assert.equal(corrections.runtime_activation_allowed, false);
assert.equal(corrections.cases.length, 8);
assert.equal(new Set(corrections.cases.map((item) => item.id)).size, 8);
assert.equal(corrections.cases.filter((item) => item.fixture_role === 'legacy_exact_baseline').length, 6);
assert.equal(corrections.cases.filter((item) => item.fixture_role === 'qualitative_target_fixture').length, 2);

for (const correction of corrections.cases) {
  assert.equal(fs.existsSync(correction.fixture_path), true, correction.fixture_path);
  const fixture = JSON.parse(fs.readFileSync(correction.fixture_path, 'utf8'));
  const source = fixture.inputText.toLowerCase().replace(/\s+/g, ' ');
  assert.ok(fixture.id);
  assert.ok(fixture.expectedCanonicalAnalysis?.domain);
  assert.ok(correction.source_evidence.length >= 3, correction.id);
  correction.source_evidence.forEach((evidence) => {
    assert.equal(source.includes(evidence.toLowerCase()), true, `${correction.id}: ${evidence}`);
  });
  assert.ok(correction.unsupported_interpretations.length > 0, correction.id);
  assert.ok(correction.required_uncertainty.length > 0, correction.id);
  if (correction.expected_politics_status === 'grounded') {
    assert.ok(correction.expected_chapter_id, correction.id);
    assert.ok(correction.supported_concepts.length > 0, correction.id);
  } else {
    assert.equal(correction.expected_chapter_id, null, correction.id);
  }
}

assert.equal(report.schema, 'aha_politics_fixture_correction_report_v1');
assert.equal(report.status, 'correction_required');
assert.equal(report.runtime_activation_allowed, false);
assert.deepEqual(report.summary, {
  total: 8,
  passed: 3,
  failed: 5,
  exact_legacy_baselines: 6,
  qualitative_targets: 2,
  comparisons: {
    correct: 3,
    false_positive: 2,
    false_negative: 3
  },
  validation_errors: 0
});
assert.deepEqual(report.validation_errors, []);
assert.equal(report.cases.length, 8);
assert.equal(report.failures.length, 5);

const caseById = new Map(report.cases.map((item) => [item.id, item]));
[
  'correction-pinse-non-politics',
  'correction-diary-non-politics',
  'correction-unclear-non-politics'
].forEach((id) => {
  const item = caseById.get(id);
  assert.equal(item.comparison, 'correct', id);
  assert.equal(item.policy_grounding.status, 'unsupported', id);
  assert.equal(item.passed, true, id);
});

[
  'correction-morgenbladet-media-non-politics',
  'correction-morgenbladet-public-sphere-non-politics'
].forEach((id) => {
  const item = caseById.get(id);
  assert.equal(item.comparison, 'false_positive', id);
  assert.equal(item.policy_grounding.status, 'grounded', id);
  assert.equal(item.policy_grounding.selected_chapter_id, 'parlamentarisme', id);
  assert.equal(item.forbidden_chapter_selected, true, id);
  assert.equal(item.passed, false, id);
});

[
  ['correction-nav-reform-forvaltning', 'forvaltning'],
  ['correction-nav-user-meeting-forvaltning', 'forvaltning'],
  ['correction-legal-rights', 'rett-lov-rettssikkerhet']
].forEach(([id, expectedChapter]) => {
  const item = caseById.get(id);
  assert.equal(item.comparison, 'false_negative', id);
  assert.equal(item.human_review.expected_chapter_id, expectedChapter, id);
  assert.equal(item.policy_grounding.status, 'unsupported', id);
  assert.equal(item.passed, false, id);
});

const runtimeCode = fs.readFileSync(runtimePath, 'utf8');
assert.equal(runtimeCode.includes('aha-politics-fixture-corrections.v1.json'), false);
assert.equal(runtimeCode.includes('aha-politics-fixture-correction-report.v1.json'), false);
assert.equal(runtimeCode.includes('data/evaluation/aha-politics-fixture'), false);

console.log('aha-politics-fixture-corrections tests passed');
