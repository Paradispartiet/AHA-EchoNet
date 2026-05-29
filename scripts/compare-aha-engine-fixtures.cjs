const assert = require('node:assert');
const { readdirSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixturesDir = path.join(repoRoot, 'docs', 'fixtures', 'aha-analysis');
const reportPath = path.join(repoRoot, 'docs', 'reports', 'aha-engine-fixture-comparison.md');

const canonicalFields = [
  'contentType',
  'domain',
  'theme',
  'mainTension',
  'keyInsight',
  'fieldConnections',
  'historyGoLinks',
  'suggestedActions',
  'confidence',
  'warnings',
];

const nextPhaseFixtureIds = new Set([
  'morgenbladet-offentlighet-002',
  'nav-reform-brukermoete-002',
  'refleksjon-laering-feil-001',
  'refleksjon-byrom-uro-001',
  'historygo-eidsvoll-grunnloven-001',
  'historygo-bislett-stadion-001',
  'uklar-fragmentert-002',
  'tverrfaglig-ai-laering-001',
]);

function readFixtures() {
  const files = readdirSync(fixturesDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort();

  return files.map((fileName) => {
    const filePath = path.join(fixturesDir, fileName);
    const fixture = JSON.parse(readFileSync(filePath, 'utf8'));
    return { fileName, ...fixture };
  });
}

function createChatContext() {
  const store = new Map();
  const context = {
    window: null,
    console,
    navigator: { clipboard: { writeText: async () => {} } },
    document: {
      readyState: 'loading',
      addEventListener: () => {},
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null,
      body: { appendChild: () => {} },
      createElement: () => ({ click: () => {}, remove: () => {} }),
    },
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    setTimeout,
    clearTimeout,
    URL: { createObjectURL: () => 'blob:dummy', revokeObjectURL: () => {} },
    Blob: function Blob() {},
    Date,
    Math,
    JSON,
    InsightsEngine: {
      createEmptyChamber: () => ({ insights: [], chatLog: [] }),
      buildMetaProfile: () => ({ profile: 'CHAMBER_META_PROFILE' }),
    },
  };
  context.window = context;
  context.addEventListener = () => {};

  vm.createContext(context);
  for (const fileName of ['ahaChatTextUtils.js', 'ahaChatSignals.js', 'ahaChatExport.js', 'ahaChat.js']) {
    const code = readFileSync(path.join(repoRoot, fileName), 'utf8');
    vm.runInContext(code, context, { filename: fileName });
  }

  assert.ok(context.AHATestHooks, 'AHA Chat test hooks were not registered');
  assert.equal(typeof context.AHATestHooks.buildAutoOutputs, 'function');
  assert.equal(typeof context.AHATestHooks.buildCanonicalAnalysis, 'function');

  return context;
}

function runJavaScriptEngine(fixtures) {
  const context = createChatContext();
  const hooks = context.AHATestHooks;
  const outputs = new Map();

  for (const fixture of fixtures) {
    const payload = hooks.buildAutoOutputs(fixture.inputText, '');
    const analysis = hooks.buildCanonicalAnalysis(payload, fixture.inputText);
    outputs.set(fixture.id, analysis);
  }

  return outputs;
}

function runPythonEngine(fixtures) {
  const pythonCode = String.raw`
import json
import sys
from app.engine.analyzer import analyze_message
from app.schemas import AnalyzeRequest

fixtures = json.load(sys.stdin)
outputs = {}
for fixture in fixtures:
    request = AnalyzeRequest(message=fixture["inputText"], assistantReply=None, historyGoContext={})
    analysis = analyze_message(request)
    if hasattr(analysis, "model_dump"):
        outputs[fixture["id"]] = analysis.model_dump(mode="json")
    else:
        outputs[fixture["id"]] = json.loads(analysis.json())
print(json.dumps(outputs, ensure_ascii=False, sort_keys=True))
`;

  const result = spawnSync('python3', ['-c', pythonCode], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PYTHONPATH: path.join(repoRoot, 'backend', 'aha_engine'),
    },
    input: JSON.stringify(fixtures.map(({ id, inputText }) => ({ id, inputText }))),
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(`Python Engine fixture comparison failed:\n${result.stderr || result.stdout}`);
  }

  const parsed = JSON.parse(result.stdout);
  return new Map(Object.entries(parsed));
}

function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeValue).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = normalizeValue(value[key]);
      return acc;
    }, {});
  }
  if (typeof value === 'string') {
    return value.trim().replace(/\s+/g, ' ');
  }
  if (typeof value === 'number') {
    return Number(value.toFixed(3));
  }
  return value;
}

function valuesEqual(a, b) {
  return JSON.stringify(normalizeValue(a)) === JSON.stringify(normalizeValue(b));
}

function hasArrayOverlap(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) {
    return false;
  }
  const normalizedB = new Set(b.map((item) => JSON.stringify(normalizeValue(item))));
  return a.some((item) => normalizedB.has(JSON.stringify(normalizeValue(item))));
}

function isPartial(field, jsValue, pythonValue, expectedValue) {
  if (valuesEqual(jsValue, expectedValue) || valuesEqual(pythonValue, expectedValue)) {
    return true;
  }
  if (['fieldConnections', 'historyGoLinks', 'suggestedActions', 'warnings'].includes(field)) {
    return hasArrayOverlap(jsValue, pythonValue) || hasArrayOverlap(jsValue, expectedValue) || hasArrayOverlap(pythonValue, expectedValue);
  }
  if (field === 'confidence' && jsValue && pythonValue && typeof jsValue === 'object' && typeof pythonValue === 'object') {
    return Object.keys(expectedValue || {}).some((key) => valuesEqual(jsValue[key], pythonValue[key]));
  }
  return false;
}

function fieldStatus(field, jsValue, pythonValue, expectedValue) {
  if (valuesEqual(jsValue, pythonValue)) {
    return 'match';
  }
  if (isPartial(field, jsValue, pythonValue, expectedValue)) {
    return 'partial';
  }
  return 'mismatch';
}

function fieldNotes(field, jsValue, pythonValue, expectedValue) {
  const notes = [];
  if (valuesEqual(jsValue, expectedValue)) notes.push('JS=expected');
  if (valuesEqual(pythonValue, expectedValue)) notes.push('Python=expected');
  if (valuesEqual(jsValue, pythonValue)) notes.push('JS=Python');
  if (notes.length === 0) notes.push(`${field}: JS/Python/expected differ`);
  return notes;
}

function compareFixtures(fixtures, jsOutputs, pythonOutputs) {
  return fixtures.map((fixture) => {
    const jsOutput = jsOutputs.get(fixture.id);
    const pythonOutput = pythonOutputs.get(fixture.id);
    if (!jsOutput) throw new Error(`Missing JavaScript output for ${fixture.id}`);
    if (!pythonOutput) throw new Error(`Missing Python output for ${fixture.id}`);

    const fields = {};
    const noteParts = [];
    for (const field of canonicalFields) {
      const status = fieldStatus(field, jsOutput[field], pythonOutput[field], fixture.expectedCanonicalAnalysis[field]);
      fields[field] = status;
      if (status !== 'match') {
        noteParts.push(...fieldNotes(field, jsOutput[field], pythonOutput[field], fixture.expectedCanonicalAnalysis[field]));
      }
    }

    const allMatch = canonicalFields.every((field) => fields[field] === 'match');
    return {
      id: fixture.id,
      fileName: fixture.fileName,
      group: nextPhaseFixtureIds.has(fixture.id) ? 'next-phase' : 'baseline',
      fields,
      notes: allMatch ? 'full JS/Python parity on checked fields' : [...new Set(noteParts)].slice(0, 4).join('; '),
    };
  });
}

function markdownTable(rows) {
  const headers = ['id', 'group', ...canonicalFields, 'notes'];
  const escapeCell = (value) => String(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${headers.map((header) => escapeCell(header === 'notes' ? row.notes : header === 'id' ? row.id : header === 'group' ? row.group : row.fields[header])).join(' | ')} |`),
  ].join('\n');
}

function renderReport(fixtures, rows) {
  const baseline = rows.filter((row) => row.group === 'baseline');
  const nextPhase = rows.filter((row) => row.group === 'next-phase');
  const fullParityCount = rows.filter((row) => canonicalFields.every((field) => row.fields[field] === 'match')).length;

  return `# AHA Engine fixture comparison report

## Summary

- fixture count: ${fixtures.length}
- baseline fixtures: ${baseline.length}
- next-phase fixtures: ${nextPhase.length}
- JavaScript Engine default: yes
- Python Engine default: no
- runtime changed: no
- full JS/Python parity fixtures on checked fields: ${fullParityCount}
- generated by: \`npm run compare:aha-engines\`

This report compares local deterministic JavaScript Engine output and local in-process Python Engine output for the same fixture inputs. It does not call Render staging and does not require production or staging secrets.

Status values:

- \`match\`: JavaScript and Python values are equal after deterministic normalization.
- \`partial\`: JavaScript and Python differ, but at least one engine matches the fixture expectation or an array/confidence subfield overlaps.
- \`mismatch\`: JavaScript, Python, and fixture expectation differ on the checked field.
- \`not_checked\`: reserved for future fields that cannot be checked deterministically.

## Fixture groups

### Baseline parity fixtures

${baseline.map((row) => `- ${row.id}`).join('\n')}

### Next-phase quality fixtures

${nextPhase.map((row) => `- ${row.id}`).join('\n')}

## Field comparison

${markdownTable(rows)}

## Prioritized follow-up areas

1. domain detection
2. fieldConnections
3. History Go-linking
4. suggestedActions
5. warnings/confidence
6. text quality for theme/mainTension/keyInsight

These follow-up areas are intentionally documented only. This report does not implement runtime changes, UI changes, backend API changes, canonical contract changes, Python Engine improvements, JavaScript Engine changes, fallback changes, Render config changes, database changes, embeddings, or external AI/API integrations.
`;
}

function main() {
  const fixtures = readFixtures();
  if (fixtures.length !== 16) {
    throw new Error(`Expected 16 AHA analysis fixtures, found ${fixtures.length}`);
  }

  const missingNextPhase = [...nextPhaseFixtureIds].filter((id) => !fixtures.some((fixture) => fixture.id === id));
  if (missingNextPhase.length > 0) {
    throw new Error(`Missing next-phase fixtures: ${missingNextPhase.join(', ')}`);
  }

  const jsOutputs = runJavaScriptEngine(fixtures);
  const pythonOutputs = runPythonEngine(fixtures);
  const rows = compareFixtures(fixtures, jsOutputs, pythonOutputs);
  const report = renderReport(fixtures, rows);

  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report, 'utf8');

  const baselineCount = rows.filter((row) => row.group === 'baseline').length;
  const nextPhaseCount = rows.filter((row) => row.group === 'next-phase').length;
  const fullParityCount = rows.filter((row) => canonicalFields.every((field) => row.fields[field] === 'match')).length;
  console.log(`✅ Compared ${rows.length} AHA fixtures (${baselineCount} baseline, ${nextPhaseCount} next-phase).`);
  console.log(`✅ Full JS/Python parity on checked fields: ${fullParityCount}/${rows.length}.`);
  console.log(`✅ Wrote ${path.relative(repoRoot, reportPath)}.`);
}

try {
  main();
} catch (error) {
  console.error(`❌ AHA Engine fixture comparison failed: ${error.message}`);
  process.exitCode = 1;
}
