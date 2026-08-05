const assert = require('assert');
const fs = require('fs');

const auditPath = 'data/integrations/review/history-go-fagverk-politikk.audit-report.v1.json';
const policyPath = 'data/integrations/review/history-go-fagverk-politikk.term-policy.v1.json';
const matrixPath = 'data/evaluation/aha-politics-fagverk-evaluation-matrix.v1.json';
const reportPath = 'data/evaluation/aha-politics-fagverk-evaluation-report.v1.json';
const runtimePath = 'backend/aha_engine/app/engine/fagverk_grounding.py';

[auditPath, policyPath, matrixPath, reportPath].forEach((filePath) => assert.equal(fs.existsSync(filePath), true, `${filePath} exists`));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

assert.equal(policy.schema, 'aha_politics_fagverk_term_policy_v1');
assert.equal(policy.version, '1.1.0');
assert.equal(policy.status, 'review_policy_correction_candidate_not_runtime_active');
assert.equal(policy.activation_allowed, false);
assert.equal(policy.source_ref, audit.source_ref);
assert.equal(policy.corpus_sha256, '981ab3ad25f972bd13c70a0247f26b8796e43b8cd3cde7282b7d073bfcc79dec');
assert.deepEqual(policy.summary, {
  total: 143,
  non_scoring: 84,
  down_weight: 55,
  context_only: 4,
  categories: {
    subject_wide_or_multi_chapter: 29,
    generic_language: 55,
    cross_chapter: 55,
    shared_phrase: 4
  }
});

const auditTerms = [...audit.term_collisions.map((item) => item.term)].sort();
const policyTerms = [...policy.terms.map((item) => item.term)].sort();
assert.deepEqual(policyTerms, auditTerms);
assert.equal(new Set(policyTerms).size, 143);
const policyByTerm = new Map(policy.terms.map((item) => [item.term, item]));

audit.term_collisions.forEach((collision) => {
  const classified = policyByTerm.get(collision.term);
  assert.ok(classified, collision.term);
  assert.equal(classified.risk, collision.risk);
  if (collision.risk === 'high') {
    assert.equal(classified.action, 'non_scoring', collision.term);
    assert.equal(classified.multiplier, 0, collision.term);
  } else if (collision.risk === 'medium') {
    assert.ok(['non_scoring', 'down_weight'].includes(classified.action), collision.term);
  } else {
    assert.equal(classified.action, 'context_only', collision.term);
    assert.equal(classified.multiplier, 0, collision.term);
  }
});

['derfor', 'men', 'hvem', 'analyse', 'utfall', 'norsk', 'over', 'saken', 'tiltak', 'var'].forEach((term) => {
  assert.equal(policy.global_non_scoring_terms.includes(term), true, term);
});
['makt', 'institusjoner', 'politikk', 'regler', 'representasjon', 'ressurser'].forEach((term) => {
  assert.equal(policyByTerm.get(term)?.action, 'non_scoring', term);
});

const parliamentRule = policy.chapter_rules.parlamentarisme;
assert.ok(parliamentRule.required_anchor_terms.includes('mistillit'));
assert.ok(parliamentRule.required_anchor_terms.includes('stortinget'));
assert.ok(parliamentRule.required_anchor_terms.includes('regjering'));
assert.ok(parliamentRule.required_anchor_terms.includes('representasjon'));
const adminTerms = new Set(policy.chapter_rules.forvaltning.supplemental_evidence_terms.map((item) => item.term));
['velferdsforvaltningen', 'etatskulturer', 'ansvarsforhold', 'styringslinjer', 'byråkratisk kompleksitet', 'ett kontaktpunkt'].forEach((term) => assert.equal(adminTerms.has(term), true, term));
const lawTerms = new Set(policy.chapter_rules['rett-lov-rettssikkerhet'].supplemental_evidence_terms.map((item) => item.term));
['hjemmel i lov', 'legitimt formål', 'forholdsmessig', 'individets rettigheter', 'mindre inngripende tiltak'].forEach((term) => assert.equal(lawTerms.has(term), true, term));

assert.equal(policy.chapters.length, 13);
assert.equal(policy.chapters.every((chapter) => chapter.unique_evidence_terms.length > 0), true);
assert.equal(new Set(policy.chapters.map((chapter) => chapter.chapter_id)).size, 13);

assert.equal(matrix.positive_cases.length, 13);
assert.equal(matrix.confusion_cases.length, 13);
assert.equal(matrix.ambiguity_cases.length, 8);
assert.equal(report.schema, 'aha_politics_fagverk_evaluation_report_v1');
assert.equal(report.version, '1.1.0');
assert.equal(report.policy_version, '1.1.0');
assert.equal(report.status, 'passed_review_gate');
assert.equal(report.runtime_activation_allowed, false);
assert.deepEqual(report.summary, {
  total: 34,
  passed: 34,
  failed: 0,
  positive: 13,
  confusion: 13,
  ambiguity: 8,
  chapters_covered: 13,
  evidence_errors: 0
});
assert.deepEqual(report.evidence_errors, []);
assert.deepEqual(report.failures, []);
assert.equal(report.cases.every((item) => item.passed === true), true);

const parliamentPositive = report.cases.find((item) => item.id === 'politics-positive-parlamentarisme');
assert.equal(parliamentPositive.result.status, 'grounded');
assert.equal(parliamentPositive.result.selected_chapter_id, 'parlamentarisme');
assert.ok(parliamentPositive.result.ranking.find((item) => item.chapter_id === 'parlamentarisme').matched_anchor_terms.length > 0);

const runtimeCode = fs.readFileSync(runtimePath, 'utf8');
assert.equal(runtimeCode.includes('history-go-fagverk-politikk.term-policy.v1.json'), false);
assert.equal(runtimeCode.includes('aha-politics-fagverk-evaluation-report.v1.json'), false);
assert.equal(runtimeCode.includes('data/integrations/review'), false);
assert.match(runtimeCode, /history-go-fagverk-corpus\.v1\.json/);

console.log('aha-politics-fagverk-term-policy tests passed');
