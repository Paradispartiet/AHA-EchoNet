const assert = require('node:assert/strict');

const {
  readFixtures,
  runJavaScriptEngine,
  runPythonEngine,
} = require('../scripts/compare-aha-engine-fixtures.cjs');

const fixtures = readFixtures();
const javascriptOutputs = runJavaScriptEngine(fixtures);
let pythonOutputs = null;
try {
  pythonOutputs = runPythonEngine(fixtures);
} catch (error) {
  if (!/ModuleNotFoundError: No module named ['"]pydantic['"]/.test(String(error?.message || error))) throw error;
}

for (const fixture of fixtures) {
  const expected = fixture.expectedCanonicalAnalysis;
  const javascript = javascriptOutputs.get(fixture.id);
  const python = pythonOutputs?.get(fixture.id);

  for (const field of ['contentType', 'domain']) {
    assert.equal(
      javascript[field],
      expected[field],
      `${fixture.id}.${field} must match the reviewed fixture expectation`,
    );
    if (python) {
      assert.equal(
        javascript[field],
        python[field],
        `${fixture.id}.${field} must have exact JavaScript/Python parity`,
      );
    }
  }

  const javascriptHistoryContract = JSON.parse(JSON.stringify(javascript.historyGoLinks))
    .map(({ type, id, title }) => ({ type, id, title }));
  const expectedHistoryContract = expected.historyGoLinks
    .map(({ type, id, title }) => ({ type, id, title }));
  assert.deepEqual(javascriptHistoryContract, expectedHistoryContract, `${fixture.id}.historyGoLinks must match the reviewed link contract`);
  if (python) {
    assert.deepEqual(
      JSON.parse(JSON.stringify(javascript.historyGoLinks)),
      python.historyGoLinks,
      `${fixture.id}.historyGoLinks must have exact JavaScript/Python parity`,
    );
  }
}

console.log(`aha-engine-semantic-parity passed (${fixtures.length}/${fixtures.length} fixtures; ${pythonOutputs ? 'JS/Python parity' : 'JS contract, Python dependencies unavailable'})`);
