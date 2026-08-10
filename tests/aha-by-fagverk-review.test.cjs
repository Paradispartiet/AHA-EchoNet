const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aha-by-review-'));
const policyPath = path.join(tmp, 'policy.json');
const reportPath = path.join(tmp, 'evaluation.json');
const fixturePath = path.join(tmp, 'fixtures.json');

function run(script, args) {
  execFileSync(process.execPath, [script, ...args], { stdio: 'inherit' });
}

run('scripts/build-by-fagverk-term-policy.mjs', ['--output', policyPath]);
run('scripts/evaluate-by-fagverk-policy.mjs', ['--policy', policyPath, '--output', reportPath]);
run('scripts/compare-by-full-fixtures.mjs', ['--policy', policyPath, '--output', fixturePath]);

const config = JSON.parse(fs.readFileSync('data/integrations/review/history-go-fagverk-by.review-config.v1.json', 'utf8'));
const candidateAudit = JSON.parse(fs.readFileSync('data/integrations/candidates/history-go-fagverk-by.candidate-audit.v1.json', 'utf8'));
const matrix = JSON.parse(fs.readFileSync('data/evaluation/aha-by-fagverk-evaluation-matrix.v1.json', 'utf8'));
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

assert.equal(candidateAudit.gate.passed, true);
assert.deepEqual(candidateAudit.coverage, { expected: 17, registered: 17, materialized: 17, missing: [], unexpected: [], duplicate_chapter_ids: [] });
assert.equal(Object.keys(config.chapter_rules).length, 17);
assert.equal(policy.schema, 'aha_by_fagverk_term_policy_v1');
assert.equal(policy.status, 'review_policy_full_fixture_candidate_not_runtime_active');
assert.equal(policy.approval_required, true);
assert.equal(policy.activation_allowed, false);
assert.equal(policy.runtime_activation_allowed, false);
assert.equal(policy.chapters.length, 17);
assert.ok(policy.summary.non_scoring > 0, 'expected non-scoring terms');
assert.ok(policy.summary.down_weight > 0, 'expected down-weighted cross-subject or cross-chapter terms');
assert.ok(policy.summary.context_only > 0, 'expected context-only terms');

for (const term of ['plan', 'byrom', 'sted', 'konflikt', 'akse', 'spor', 'arena']) {
  assert.ok(policy.global_non_scoring_terms.includes(term), `${term} must be globally non-scoring`);
  const rule = policy.terms.find((item) => item.term === term);
  if (rule) assert.equal(rule.action, 'non_scoring', `${term} expanded row must be non-scoring`);
}

assert.equal(matrix.positive_cases.length, 34);
assert.equal(new Set(matrix.positive_cases.map((item) => item.expected_chapter_id)).size, 17);
assert.equal(report.status, 'passed_review_gate');
assert.equal(report.summary.positive, 34);
assert.equal(report.summary.abstention, 8);
assert.equal(report.summary.chapters_covered, 17);
assert.equal(report.summary.evidence_errors, 0);
assert.equal(report.summary.failed, 0);

assert.equal(fixtures.status, 'passed_full_fixture_gate');
assert.equal(fixtures.summary.total, 16);
assert.equal(fixtures.summary.passed, 16);
assert.equal(fixtures.summary.false_positives, 0);
assert.equal(fixtures.summary.evidence_errors, 0);
assert.equal(fixtures.runtime_activation_allowed, false);

const runtimeCode = fs.readFileSync('backend/aha_engine/app/engine/fagverk_grounding.py', 'utf8');
assert.equal(runtimeCode.includes('history-go-fagverk-by.term-policy.v1.json'), false);
assert.equal(runtimeCode.includes('history-go-fagverk-by.review-config.v1.json'), false);
assert.equal(runtimeCode.includes('data/integrations/review'), false);
assert.match(runtimeCode, /history-go-fagverk-corpus\.v1\.json/);

console.log(`By review gate passed: ${report.summary.passed}/${report.summary.total} constructed cases and ${fixtures.summary.passed}/${fixtures.summary.total} human-reviewed fixtures.`);
