const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { readFixtures } = require('../scripts/compare-aha-engine-fixtures.cjs');

const context = { console, Map, Set, Array, Object, String, Number, JSON, Math };
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/ahaModuleApi.js', 'utf8'), context, { filename: 'js/ahaModuleApi.js' });
vm.runInContext(fs.readFileSync('js/ahaChatTextUtils.js', 'utf8'), context, { filename: 'js/ahaChatTextUtils.js' });

const textUtils = context.AHAModuleApi.get('chat.textUtils', { version: 1 });
assert.equal(Object.isFrozen(textUtils), true, 'source identity must be exposed through the frozen text-utils facade');
for (const name of ['shortHash', 'takeKeywords', 'sourceHash']) {
  assert.equal(typeof textUtils[name], 'function', `chat.textUtils must expose ${name}`);
}

assert.equal(textUtils.sourceHash(''), '', 'empty source text must not get an identity');
assert.equal(
  textUtils.sourceHash('  AHA\n  KILDE  '),
  textUtils.sourceHash('aha kilde'),
  'source identity must normalize case and whitespace'
);
assert.deepEqual(
  Array.from(textUtils.takeKeywords('Journalistikk journalistikk mediepolitikk regjering gjorde viktige saker', 5)),
  ['journalistikk', 'mediepolitikk', 'regjering', 'viktige', 'saker'],
  'keyword ranking must remain deterministic'
);

const golden = JSON.parse(fs.readFileSync('tests/fixtures/aha-chat-golden-output.v1.json', 'utf8'));
const fixtures = new Map(readFixtures().map((fixture) => [fixture.id, fixture]));
const observed = new Set();
for (const goldenCase of golden.cases) {
  const fixture = fixtures.get(goldenCase.fixtureId);
  assert.ok(fixture, `missing source fixture ${goldenCase.fixtureId}`);
  const hash = textUtils.sourceHash(fixture.inputText);
  assert.equal(hash, goldenCase.expectedSourceHash, `${fixture.id} source identity drifted`);
  assert.equal(observed.has(hash), false, `${fixture.id} collided with another locked source identity`);
  observed.add(hash);
}

assert.equal(observed.size, 16);
console.log('aha-chat-source-identity passed: 16/16 source hashes locked');
