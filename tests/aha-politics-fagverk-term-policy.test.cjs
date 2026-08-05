const assert = require('assert');
const fs = require('fs');

const audit = JSON.parse(fs.readFileSync('data/integrations/review/history-go-fagverk-politikk.audit-report.v1.json', 'utf8'));
const policy = JSON.parse(fs.readFileSync('data/integrations/review/history-go-fagverk-politikk.term-policy.v1.json', 'utf8'));
const matrix = JSON.parse(fs.readFileSync('data/evaluation/aha-politics-fagverk-evaluation-matrix.v1.json', 'utf8'));
const report = JSON.parse(fs.readFileSync('data/evaluation/aha-politics-fagverk-evaluation-report.v1.json', 'utf8'));
const runtimeCode = fs.readFileSync('backend/aha_engine/app/engine/fagverk_grounding.py', 'utf8');

assert.equal(policy.schema, 'aha_politics_fagverk_term_policy_v1');
assert.equal(policy.version, '1.2.0');
assert.equal(policy.status, 'review_policy_full_fixture_candidate_not_runtime_active');
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
  if (collision.risk === 'high') assert.equal(classified.action, 'non_scoring', collision.term);
  else if (collision.risk === 'medium') assert.ok(['non_scoring', 'down_weight'].includes(classified.action), collision.term);
  else assert.equal(classified.action, 'context_only', collision.term);
});

['derfor', 'men', 'hvem', 'analyse', 'utfall', 'norsk', 'over', 'saken', 'tiltak', 'var'].forEach((term) => {
  assert.equal(policy.global_non_scoring_terms.includes(term), true, term);
});
['makt', 'institusjoner', 'politikk', 'regler', 'representasjon', 'ressurser'].forEach((term) => {
  assert.equal(policyByTerm.get(term)?.action, 'non_scoring', term);
});

const parliamentAnchors = new Set(policy.chapter_rules.parlamentarisme.required_anchor_terms);
['mistillit', 'stortinget', 'regjering', 'representasjon'].forEach((term) => assert.equal(parliamentAnchors.has(term), true, term));
const conflictAnchors = new Set(policy.chapter_rules['konflikt-makt-sivilsamfunn'].required_anchor_terms);
['protest', 'sivilsamfunn', 'handlingsrepertoar', 'dagsordenmakt', 'motoffentlighet', 'mobilisering'].forEach((term) => assert.equal(conflictAnchors.has(term), true, term));
const adminTerms = new Set(policy.chapter_rules.forvaltning.supplemental_evidence_terms.map((item) => item.term));
['velferdsforvaltningen', 'etatskulturer', 'ansvarsforhold', 'styringslinjer', 'byråkratisk kompleksitet', 'ett kontaktpunkt'].forEach((term) => assert.equal(adminTerms.has(term), true, term));
const lawTerms = new Set(policy.chapter_rules['rett-lov-rettssikkerhet'].supplemental_evidence_terms.map((item) => item.term));
['hjemmel i lov', 'legitimt formål', 'forholdsmessig', 'individets rettigheter', 'mindre inngripende tiltak'].forEach((term) => assert.equal(lawTerms.has(term), true, term));

assert.equal(policy.chapters.length, 13);
assert.equal(matrix.positive_cases.length, 13);
assert.equal(matrix.confusion_cases.length, 13);
assert.equal(matrix.ambiguity_cases.length, 8);
assert.equal(report.schema, 'aha_politics_fagverk_evaluation_report_v1');
assert.equal(report.policy_version, '1.2.0');
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

const conflictPositive = report.cases.find((item) => item.id === 'politics-positive-konflikt');
assert.equal(conflictPositive.result.status, 'grounded');
assert.equal(conflictPositive.result.selected_chapter_id, 'konflikt-makt-sivilsamfunn');
assert.ok(conflictPositive.result.ranking.find((item) => item.chapter_id === 'konflikt-makt-sivilsamfunn').matched_anchor_terms.length > 0);

assert.equal(runtimeCode.includes('history-go-fagverk-politikk.term-policy.v1.json'), false);
assert.equal(runtimeCode.includes('data/integrations/review'), false);
assert.match(runtimeCode, /history-go-fagverk-corpus\.v1\.json/);

console.log('aha-politics-fagverk-term-policy tests passed');
