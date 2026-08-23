const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sourceText = [
  'Livsarket er et personlig kunnskapsark som organiserer erfaringer, kilder og ideer.',
  'Hver påstand skal kunne spores til konkret kildebelegg, mens åpne spørsmål skal holdes adskilt fra sikre innsikter.',
  'Når et notat blir lest på nytt, skal tidligere analyser ikke overstyre den teksten som faktisk ligger foran leseren.',
  'Systemet kan foreslå forbindelser mellom erfaringer, men forbindelsen må forklares og usikkerheten må være synlig.',
  'Målet er ikke å gjøre minner til medisinske diagnoser eller å presentere metadata som kunnskap.',
  'Målet er å hjelpe brukeren med å undersøke mønstre uten å miste skillet mellom dokumentasjon, tolkning og spørsmål som fortsatt står åpne.'
].join(' ');

const context = {
  console,
  AHA_AGENT_API: 'https://example.invalid',
  AHAModuleApi: { register() {} },
  AHAAnalysisQualityEvaluator: null
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/ahaChatInsightPipeline.js', 'utf8'), context, { filename: 'js/ahaChatInsightPipeline.js' });

const identity = (value) => Array.isArray(value) ? value.filter(Boolean).map(String) : [];
const pipeline = context.AHAChatInsightPipeline.create({
  filterConceptLabels: identity,
  normalizeSimpleStringList: (value, limit) => identity(value).slice(0, limit),
  normalizeTheoreticalLinks: () => [],
  extractAcademicPhraseConcepts: () => [],
  normalizeAfterworkConcept: (value) => String(value || '').toLowerCase(),
  weakConceptWords: new Set()
});

const crossClaimCandidate = {
  title: 'Spenning mellom dokumentasjon og tolkning',
  summary: 'Livsarket søker å bevare skillet mellom dokumentasjon og tolkning slik at tidligere analyser ikke forvrenger den aktive teksten.',
  concepts: [],
  thinkers: [], theories: [], traditions: [], theoretical_links: [],
  evidence_quotes: [
    'å undersøke mønstre uten å miste skillet mellom dokumentasjon, tolkning og spørsmål som fortsatt står åpne',
    'tidligere analyser ikke overstyre den teksten som faktisk ligger foran leseren'
  ],
  why_it_matters: 'Skillet avgjør om nye analyser forblir etterprøvbare mot den teksten brukeren faktisk leser.'
};

assert.equal(
  pipeline.isWeakInsightCandidate(crossClaimCandidate, sourceText),
  false,
  'two distinct exact source quotes must reach the authoritative V2 gate even when optional concepts are empty'
);

const oneQuoteCandidate = {
  ...crossClaimCandidate,
  evidence_quotes: [crossClaimCandidate.evidence_quotes[0]]
};
assert.equal(
  pipeline.isWeakInsightCandidate(oneQuoteCandidate, sourceText),
  true,
  'conceptless candidates with only one grounded quote remain blocked by the pre-filter'
);

const noEvidenceCandidate = { ...crossClaimCandidate, evidence_quotes: [] };
assert.equal(
  pipeline.isWeakInsightCandidate(noEvidenceCandidate, sourceText),
  true,
  'conceptless candidates without source grounding remain blocked'
);

console.log('aha-insight-pipeline-source-grounded-conceptless-v2.test.cjs: OK');
