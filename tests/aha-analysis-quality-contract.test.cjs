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

console.log(`AHA analysis quality contract: ${goldenPassed} golden + ${production.cases.length} runtime subject + ${stress.cases.length} stress cases = ${contract.review_population.total}`);
