const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  canonicalFields,
  createChatContext,
  readFixtures
} = require('../scripts/compare-aha-engine-fixtures.cjs');

const root = path.join(__dirname, '..');
const golden = JSON.parse(fs.readFileSync(
  path.join(root, 'tests/fixtures/aha-chat-golden-output.v1.json'),
  'utf8'
));
const analysisFixtures = readFixtures();
const fixturesById = new Map(analysisFixtures.map((fixture) => [fixture.id, fixture]));
const context = createChatContext();
const hooks = context.AHATestHooks;
const replyApi = context.AHAChatReplyFormat;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function stripTrailingPunctuation(value) {
  return String(value || '').trim().replace(/[.!?;,:\s…]+$/u, '').trim();
}

function lowerFirst(value) {
  const text = String(value || '').trim();
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : '';
}

function buildRawReply(expected) {
  return [
    'Kort svar',
    expected.keyInsight,
    '',
    'Hva AHA ser',
    `Temaet er ${expected.theme}, med spenningen ${expected.mainTension}.`,
    '',
    'Begreper / mønstre',
    expected.fieldConnections.join(', '),
    '',
    'Neste læringssteg',
    expected.suggestedActions[0]
  ].join('\n');
}

function expectedVisibleReply(expected, mode) {
  const parts = [
    expected.keyInsight,
    `Temaet er ${expected.theme}, med spenningen ${expected.mainTension}.`
  ];
  if (mode === 'detailed' && expected.fieldConnections.length) {
    parts.push(`De viktigste begrepene eller mønstrene her er ${lowerFirst(stripTrailingPunctuation(expected.fieldConnections.join(', ')))}.`);
  }
  parts.push(`Et praktisk neste steg er å ${lowerFirst(stripTrailingPunctuation(expected.suggestedActions[0]))}.`);
  return parts.join('\n\n');
}

assert.equal(golden.version, 'aha_chat_golden_output_v1');
assert.equal(golden.cases.length, 16, 'golden gate must cover all canonical analysis fixtures');
assert.equal(analysisFixtures.length, 16, 'analysis fixture population must remain explicit');
assert.equal(new Set(golden.cases.map((item) => item.fixtureId)).size, golden.cases.length, 'golden fixture IDs must be unique');
assert.deepEqual(
  golden.cases.map((item) => item.fixtureId).sort(),
  analysisFixtures.map((item) => item.id).sort(),
  'golden output cases and analysis fixtures must have identical populations'
);

let previousCanonical = null;
let previousRun = null;
const observedHashes = new Set();

for (const goldenCase of golden.cases) {
  const fixture = fixturesById.get(goldenCase.fixtureId);
  assert.ok(fixture, `missing analysis fixture ${goldenCase.fixtureId}`);
  assert.ok(Array.isArray(goldenCase.requiredTerms) && goldenCase.requiredTerms.length >= 3);
  assert.ok(Array.isArray(goldenCase.forbiddenTerms) && goldenCase.forbiddenTerms.length >= 4);

  const payload = hooks.buildAutoOutputs(fixture.inputText, '');
  const canonical = hooks.buildCanonicalAnalysis(payload, fixture.inputText);
  const canonicalProjection = Object.fromEntries(canonicalFields.map((field) => [field, canonical[field]]));

  assert.deepEqual(
    plain(canonicalProjection),
    fixture.expectedCanonicalAnalysis,
    `${fixture.id} canonical runtime output drifted from the human-reviewed golden object`
  );
  assert.equal(payload.textType, fixture.expectedCanonicalAnalysis.contentType, `${fixture.id} text type drifted`);
  assert.equal(payload.reflection, goldenCase.expectedReflection, `${fixture.id} reflection drifted`);
  assert.equal(payload.day, goldenCase.expectedSummary, `${fixture.id} summary drifted`);

  const completeOutput = normalizeText(JSON.stringify({
    canonical: canonicalProjection,
    reflection: payload.reflection,
    summary: payload.day,
    list: payload.list,
    path: payload.path,
    sortItems: payload.sortItems
  }));
  for (const term of goldenCase.requiredTerms) {
    assert.ok(completeOutput.includes(normalizeText(term)), `${fixture.id} lost required output term: ${term}`);
  }
  for (const term of goldenCase.forbiddenTerms) {
    assert.ok(!completeOutput.includes(normalizeText(term)), `${fixture.id} leaked forbidden output term: ${term}`);
  }

  assert.equal(replyApi.chooseAhaChatReplyMode(fixture.inputText), goldenCase.replyMode, `${fixture.id} reply mode drifted`);
  const rawReply = buildRawReply(fixture.expectedCanonicalAnalysis);
  const visibleReply = replyApi.normalizeAhaVisibleReply(rawReply, fixture.inputText);
  assert.equal(
    visibleReply,
    expectedVisibleReply(fixture.expectedCanonicalAnalysis, goldenCase.replyMode),
    `${fixture.id} visible Chat reply drifted`
  );
  assert.doesNotMatch(visibleReply, /Kort svar|Hva AHA ser|Begreper \/ mønstre|Neste læringssteg/i, `${fixture.id} exposed legacy headings`);

  const run = hooks.createAnalysisRun(fixture.inputText, { sourceKind: 'golden_fixture' });
  assert.equal(run.sourceHash, goldenCase.expectedSourceHash, `${fixture.id} source hash drifted`);
  assert.equal(observedHashes.has(run.sourceHash), false, `${fixture.id} collided with another golden source hash`);
  observedHashes.add(run.sourceHash);
  hooks.bindAnalysisArtifact(payload, run);
  hooks.bindAnalysisArtifact(canonical, run);
  assert.equal(hooks.artifactMatchesActiveRun(payload, run), true, `${fixture.id} payload lost source binding`);
  assert.equal(hooks.artifactMatchesActiveRun(canonical, run), true, `${fixture.id} canonical output lost source binding`);
  if (previousCanonical && previousRun) {
    assert.equal(hooks.artifactMatchesActiveRun(previousCanonical, run), false, `${fixture.id} accepted the previous conversation output`);
    assert.equal(hooks.artifactMatchesActiveRun(canonical, previousRun), false, `${fixture.id} bound backwards to the previous conversation`);
  }
  previousCanonical = canonical;
  previousRun = run;
}

const shortFixture = fixturesById.get('pinse-religion-001');
const shortRawReply = buildRawReply(shortFixture.expectedCanonicalAnalysis);
assert.equal(
  replyApi.normalizeAhaVisibleReply(shortRawReply, 'Hva nå?'),
  shortFixture.expectedCanonicalAnalysis.keyInsight,
  'explicit short prompts must keep only the golden short answer'
);

assert.equal(observedHashes.size, golden.cases.length);
console.log(`aha-chat-golden-output-regression passed: ${golden.cases.length}/${golden.cases.length} complete outputs locked`);
