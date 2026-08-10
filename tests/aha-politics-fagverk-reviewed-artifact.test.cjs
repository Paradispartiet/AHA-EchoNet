const assert = require('assert');
const fs = require('fs');

const corpusPath = 'data/integrations/review/history-go-fagverk-politikk.audit.v1.json';
const auditPath = 'data/integrations/review/history-go-fagverk-politikk.audit-report.v1.json';
const candidatePath = 'data/integrations/candidates/history-go-fagverk-politikk.candidate.v1.json';
const observedPath = 'data/integrations/history-go-fagverk-release.observed.json';
const subjectBaselinePath = 'data/integrations/review/history-go-fagverk-subject-content-baseline.v1.json';
const runtimePath = 'backend/aha_engine/app/engine/fagverk_grounding.py';

assert.equal(fs.existsSync(corpusPath), true, 'checked-in Politics review corpus exists');
assert.equal(fs.existsSync(auditPath), true, 'checked-in Politics audit report exists');

const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
const observed = JSON.parse(fs.readFileSync(observedPath, 'utf8'));
const subjectBaseline = JSON.parse(fs.readFileSync(subjectBaselinePath, 'utf8')).subjects.politikk;

const expectedChapterIds = [
  'fordeling-velferd-ulikhet',
  'forvaltning',
  'internasjonal-politikk-sikkerhet-samarbeid',
  'konflikt-makt-sivilsamfunn',
  'normer-identitet-hverdagsliv',
  'norsk-politikk-eos-eu-flernivastyring',
  'offentlig-politikk-beslutning-implementering',
  'parlamentarisme',
  'politisk-okonomi-stat-marked',
  'regimer-og-institusjoner',
  'rett-lov-rettssikkerhet',
  'statsvitenskapelig-metode-og-sammenligning',
  'valg-partier-velgeratferd'
];

assert.equal(corpus.schema, 'aha_history_go_fagverk_corpus_v1');
assert.equal(corpus.version, '1.1.0');
assert.equal(corpus.status, 'generated_subject_audit_corpus');
assert.equal(corpus.source_repo, 'Paradispartiet/History-Go');
assert.equal(corpus.source_ref, subjectBaseline.approved_source_ref);
assert.equal(corpus.source_ref, candidate.source_ref);
assert.equal(observed.subjects.politikk.content_sha256, subjectBaseline.subject_content_sha256, 'current observed Politics content remains compatible with reviewed corpus');
assert.equal(corpus.registry_version, '2.19.0');
assert.equal(corpus.subject_filter, 'politikk');
assert.equal(corpus.content_sha256, '981ab3ad25f972bd13c70a0247f26b8796e43b8cd3cde7282b7d073bfcc79dec');
assert.equal(corpus.content_sha256, candidate.content_sha256);
assert.deepEqual(corpus.entries.map((entry) => entry.chapter_id), expectedChapterIds);
assert.equal(corpus.entries.every((entry) => entry.subject_id === 'politikk'), true);
assert.equal(corpus.entries.every((entry) => entry.source_path === `data/fagverk/politikk/${entry.chapter_id}.json`), true);
assert.equal(corpus.entries.every((entry) => entry.provenance.source_kind === 'canonical_fagverk_chapter'), true);
assert.equal(corpus.entries.every((entry) => entry.provenance.module_file_count === 3), true, 'all three registered chapter modules must be represented');
assert.equal(corpus.entries.every((entry) => entry.module_source_paths.length === 3), true);
assert.equal(corpus.entries.every((entry) => entry.module_source_paths.every((sourcePath) => sourcePath.startsWith(`data/fagverk/politikk/${entry.chapter_id}/`))), true);
assert.equal(corpus.entries.every((entry) => entry.support_terms.length === 48), true, 'module text must supply the reviewed support-term window');
assert.equal(corpus.entries.every((entry) => entry.concept_terms.length > 0), true);
assert.equal(candidate.approval_required, true);
assert.equal(candidate.runtime_activation_allowed, false);

assert.equal(audit.schema, 'aha_fagverk_corpus_audit_v1');
assert.equal(audit.source_ref, corpus.source_ref);
assert.deepEqual(audit.subject_filter, ['politikk']);
assert.deepEqual(audit.coverage, {
  expected: 13,
  registered: 13,
  materialized: 13,
  missing: [],
  unexpected: [],
  duplicate_chapter_ids: []
});
assert.equal(audit.gate.passed, true);
assert.deepEqual(audit.gate.errors, []);
assert.equal(audit.chapters.length, 13);
assert.equal(audit.chapters.every((chapter) => chapter.module_file_count === 3), true);
assert.equal(audit.chapters.every((chapter) => chapter.module_source_paths.length === 3), true);
assert.equal(audit.chapters.every((chapter) => chapter.support_term_count === 48), true);
assert.deepEqual(audit.term_collision_summary, { total: 143, high_risk: 64, medium_risk: 75, low_risk: 4 });
assert.equal(audit.activation_recommendation, 'review_required_before_runtime_activation');

const highRiskTerms = new Set(audit.high_risk_terms.map((item) => item.term));
['derfor', 'men', 'hvem', 'institusjoner', 'makt', 'politikk', 'regler', 'representasjon', 'ressurser', 'prosessporing']
  .forEach((term) => assert.equal(highRiskTerms.has(term), true, `audit must expose high-risk term: ${term}`));

const runtimeCode = fs.readFileSync(runtimePath, 'utf8');
assert.equal(runtimeCode.includes('data/integrations/review'), false, 'review corpus must not be active in runtime');
assert.equal(runtimeCode.includes('data/integrations/candidates'), false, 'candidate corpus must not be active in runtime');
assert.match(runtimeCode, /history-go-fagverk-corpus\.v1\.json/);

console.log('aha-politics-fagverk-reviewed-artifact tests passed');
