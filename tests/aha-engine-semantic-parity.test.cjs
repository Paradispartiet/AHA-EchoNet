const assert = require('node:assert/strict');

const {
  canonicalFields,
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

  for (const field of canonicalFields) {
    const javascriptValue = JSON.parse(JSON.stringify(javascript[field]));
    if (field === 'historyGoLinks') {
      const linkContract = (items) => items.map(({ type, id, title }) => ({ type, id, title }));
      assert.deepEqual(linkContract(javascriptValue), linkContract(expected[field]), `${fixture.id}.${field} must match the reviewed link contract`);
    } else {
      assert.deepEqual(javascriptValue, expected[field], `${fixture.id}.${field} must match the reviewed fixture expectation`);
    }
    if (python) {
      assert.deepEqual(
        javascriptValue,
        python[field],
        `${fixture.id}.${field} must have exact JavaScript/Python parity`,
      );
    }
  }
}

console.log(`aha-engine-semantic-parity passed (${fixtures.length}/${fixtures.length} fixtures; ${pythonOutputs ? 'JS/Python parity' : 'JS contract, Python dependencies unavailable'})`);
