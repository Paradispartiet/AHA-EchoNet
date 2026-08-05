const assert = require('assert');
const fs = require('fs');

const correctionsPath = 'data/evaluation/aha-politics-fixture-corrections.v1.json';
const reportPath = 'data/evaluation/aha-politics-fixture-correction-report.v1.json';
const runtimePath = 'backend/aha_engine/app/engine/fagverk_grounding.py';

const corrections = JSON.parse(fs.readFileSync(correctionsPath, 'utf8'));
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
assert.equal(corrections.schema, 'aha_politics_fixture_corrections_v1');
assert.equal(corrections.runtime_activation_allowed, false);
assert.equal(corrections.cases.length, 8);
assert.equal(new Set(corrections.cases.map((item) => item.id)).size, 8);

for (const correction of corrections.cases) {
  assert.equal(fs.existsSync(correction.fixture_path), true, correction.fixture_path);
  const fixture = JSON.parse(fs.readFileSync(correction.fixture_path, 'utf8'));
  const source = fixture.inputText.toLowerCase().replace(/\s+/g, ' ');
  correction.source_evidence.forEach((evidence) => assert.equal(source.includes(evidence.toLowerCase()), true, `${correction.id}: ${evidence}`));
  assert.ok(correction.unsupported_interpretations.length > 0, correction.id);
  assert.ok(correction.required_uncertainty.length > 0, correction.id);
}

assert.equal(report.schema, 'aha_politics_fixture_correction_report_v1');
assert.equal(report.version, '1.1.0');
assert.equal(report.policy_version, '1.1.0');
assert.equal(report.status, 'passed_correction_gate');
assert.equal(report.runtime_activation_allowed, false);
assert.deepEqual(report.summary, {
  total: 8,
  passed: 8,
  failed: 0,
  exact_legacy_baselines: 6,
  qualitative_targets: 2,
  comparisons: { correct: 8 },
  validation_errors: 0
});
assert.deepEqual(report.validation_errors, []);
assert.deepEqual(report.failures, []);
assert.equal(report.cases.every((item) => item.passed === true), true);

const caseById = new Map(report.cases.map((item) => [item.id, item]));
[
  'correction-pinse-non-politics',
  'correction-diary-non-politics',
  'correction-unclear-non-politics',
  'correction-morgenbladet-media-non-politics',
  'correction-morgenbladet-public-sphere-non-politics'
].forEach((id) => {
  const item = caseById.get(id);
  assert.equal(item.comparison, 'correct', id);
  assert.equal(item.policy_grounding.status, 'unsupported', id);
  assert.equal(item.policy_grounding.selected_chapter_id, null, id);
  assert.equal(item.forbidden_chapter_selected, false, id);
});

[
  ['correction-nav-reform-forvaltning', 'forvaltning'],
  ['correction-nav-user-meeting-forvaltning', 'forvaltning'],
  ['correction-legal-rights', 'rett-lov-rettssikkerhet']
].forEach(([id, expectedChapter]) => {
  const item = caseById.get(id);
  assert.equal(item.comparison, 'correct', id);
  assert.equal(item.policy_grounding.status, 'grounded', id);
  assert.equal(item.policy_grounding.selected_chapter_id, expectedChapter, id);
});

for (const id of ['correction-morgenbladet-media-non-politics', 'correction-morgenbladet-public-sphere-non-politics']) {
  const parliament = caseById.get(id).policy_grounding.ranking.find((item) => item.chapter_id === 'parlamentarisme');
  assert.ok(parliament, id);
  assert.equal(parliament.eligible, false, id);
  assert.equal(parliament.eligibility_reason, 'missing_required_anchor', id);
}

const navTerms = new Set(caseById.get('correction-nav-reform-forvaltning').policy_grounding.ranking.find((item) => item.chapter_id === 'forvaltning').matched_terms.map((item) => item.term));
assert.equal(navTerms.has('velferdsforvaltningen'), true);
assert.equal(navTerms.has('etatskulturer'), true);
assert.equal(navTerms.has('ansvarsforhold'), true);
const legalTerms = new Set(caseById.get('correction-legal-rights').policy_grounding.ranking.find((item) => item.chapter_id === 'rett-lov-rettssikkerhet').matched_terms.map((item) => item.term));
assert.equal(legalTerms.has('hjemmel i lov'), true);
assert.equal(legalTerms.has('forholdsmessig'), true);
assert.equal(legalTerms.has('individets rettigheter'), true);

const runtimeCode = fs.readFileSync(runtimePath, 'utf8');
assert.equal(runtimeCode.includes('aha-politics-fixture-corrections.v1.json'), false);
assert.equal(runtimeCode.includes('aha-politics-fixture-correction-report.v1.json'), false);
assert.equal(runtimeCode.includes('history-go-fagverk-politikk.term-policy.v1.json'), false);

console.log('aha-politics-fixture-corrections tests passed');
