const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createChatContext, readFixtures } = require('../scripts/compare-aha-engine-fixtures.cjs');

const ROOT = path.resolve(__dirname, '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
const evaluatorCode = fs.readFileSync(path.join(ROOT, 'js/ahaAnalysisQualityEvaluator.js'), 'utf8');
const contract = readJson('data/evaluation/aha-analysis-quality-contract.v1.json');
const stress = readJson('tests/fixtures/aha-analysis-quality-stress.v1.json');
const production = readJson('tests/fixtures/aha-production-analysis-quality-matrix.v1.json');
const goldenFixtures = readFixtures();

const isolated = { window: null, globalThis: null };
isolated.window = isolated;
isolated.globalThis = isolated;
vm.createContext(isolated);
vm.runInContext(evaluatorCode, isolated, { filename: 'js/ahaAnalysisQualityEvaluator.js' });
const evaluator = isolated.AHAAnalysisQualityEvaluator;

assert.equal(contract.schema, evaluator.VERSION);
assert.deepEqual(JSON.parse(JSON.stringify(evaluator.THRESHOLDS)), Object.fromEntries(
  Object.entries(contract.dimensions).map(([key, value]) => [key, value.minimum])
));
assert.equal(goldenFixtures.length + production.cases.length + stress.cases.length, contract.review_population.total);
assert.equal(contract.review_population.total, 30, 'quality gate must keep an explicit 30-case review population');

const context = createChatContext();
vm.runInContext(evaluatorCode, context, { filename: 'js/ahaAnalysisQualityEvaluator.js' });
const hooks = context.AHATestHooks;
let goldenPassed = 0;
for (const fixture of goldenFixtures) {
  const payload = hooks.buildAutoOutputs(fixture.inputText, '');
  payload.canonicalAnalysis = hooks.buildCanonicalAnalysis(payload, fixture.inputText);
  const report = context.AHAAnalysisQualityEvaluator.evaluateAnalysis(payload, fixture.inputText);
  assert.notEqual(report.status, 'blocked', `${fixture.id}: human-reviewed golden output hit a critical quality block`);
  assert.equal(report.dimensions.uncertaintyHonesty, 1, `${fixture.id}: confidence warning contract failed`);
  assert.ok(report.claims.some((claim) => claim.kind === 'interpretation'), `${fixture.id}: interpretation register missing`);
  assert.ok(report.claims.some((claim) => claim.kind === 'proposed_action'), `${fixture.id}: action register missing`);
  goldenPassed += 1;
}

for (const item of stress.cases) {
  const report = evaluator.evaluateAnalysis(item.payload, item.sourceText);
  assert.equal(report.status, item.expectedStatus, `${item.id}: expected ${item.expectedStatus}, got ${report.status} (${JSON.stringify(report.failures)})`);
}

const duplicateSelection = evaluator.selectBestCandidates([
  'Bemanningen gjør fredagslansering til en risikobeslutning.',
  'Fredagslanseringen blir en risikobeslutning på grunn av bemanningen.',
  'Full beredskap mandag gir tid til å verifisere datamigreringen.'
], stress.cases[0].sourceText, { limit: 3, minimumScore: 0.3 });
assert.equal(duplicateSelection.selected.length, 2, 'candidate selector must remove semantic near-duplicates');
assert.ok(duplicateSelection.rejected.some((item) => item.reason === 'duplicate'));

const revisionSource = 'Kommunen vil innføre en digital søknadsordning i september. Eldrerådet advarer om at innbyggere uten BankID kan falle utenfor. Kommunen lover fysisk veiledning på biblioteket.';
const weakPayload = {
  canonicalAnalysis: {
    theme: 'Digital søknadsordning',
    mainTension: 'Innbyggere uten BankID kan falle utenfor',
    keyInsight: 'Fysisk veiledning på biblioteket kan dempe utenforskap.',
    suggestedActions: ['Undersøk temaet videre.'],
    confidence: { theme: 0.7, mainTension: 0.5, keyInsight: 0.5 }
  },
  sortItems: [{ label: 'Ubekreftet', text: 'Alle eldre vil bli utestengt.' }]
};
const revision = evaluator.improveAnalysisOnce(weakPayload, revisionSource);
assert.equal(revision.attempted, true, 'a weak analysis with enough source must receive one controlled improvement pass');
assert.equal(revision.payload.qualityRevision.attempts, 1, 'the automatic pass must never loop');
assert.ok(revision.payload.sortItems.length >= 1);
for (const item of revision.payload.sortItems) {
  assert.ok(revisionSource.includes(item.text), 'every added evidence quote must be copied exactly from the active source');
}
assert.doesNotMatch(JSON.stringify(revision.payload), /Alle eldre vil bli utestengt/, 'unverified evidence must be removed during revision');
assert.ok(revision.finalReport.claims.some((claim) => claim.kind === 'interpretation' && claim.evidenceStatus === 'source_quote'), 'interpretations must expose linked evidence');

const thinRevision = evaluator.improveAnalysisOnce(weakPayload, 'Kort notat uten nok sammenheng.');
assert.equal(thinRevision.attempted, false);
assert.equal(thinRevision.needsMoreSource, true, 'thin source must ask for more material instead of inventing a better analysis');

console.log(`AHA analysis quality contract: ${goldenPassed} golden + ${production.cases.length} runtime subject + ${stress.cases.length} stress cases = ${contract.review_population.total}`);
