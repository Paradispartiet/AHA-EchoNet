#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const markdownPath = path.join(ROOT, 'docs', 'AHA_RELEASE_READINESS_SNAPSHOT.md');
const jsonPath = path.join(ROOT, 'docs', 'AHA_RELEASE_READINESS_SNAPSHOT.json');
const registryPath = path.join(ROOT, 'js', 'ahaModules.js');
const matrixPath = path.join(ROOT, 'docs', 'AHA_MODULE_MATURITY_MATRIX.md');
const readmePath = path.join(ROOT, 'README.md');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function loadRegistry() {
  const source = fs.readFileSync(registryPath, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: registryPath });
  assert.ok(Array.isArray(sandbox.window.AHA_MODULES), 'AHA_MODULES must parse as an array.');
  return sandbox.window.AHA_MODULES;
}

function extractMatrixRows() {
  const matrix = fs.readFileSync(matrixPath, 'utf8');
  const rows = [];
  for (const line of matrix.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    if (/^\|\s*-+/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells[0] === 'module_id') continue;
    if (cells.length < 16 || !cells[0]) continue;
    rows.push({
      module_id: cells[0].replace(/`/g, ''),
      title: cells[1],
      registry_status: cells[3],
      maturity: cells[14]
    });
  }
  return rows;
}

function assertSetEqual(actual, expected, message) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), message);
}

function hasSafeNegative(text, index) {
  const prefix = text.slice(Math.max(0, index - 140), index).toLowerCase();
  const sentencePrefix = prefix.split(/[.!?\n]/).pop() || prefix;
  return /(?:not active|does not|do not|must not|no|not|ikke|ingen|uten|false|planned\/no-op|not_safe_yet)/i.test(sentencePrefix);
}

function assertNoUnsafePhrase(text, patterns, label) {
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (!hasSafeNegative(text, match.index)) {
        assert.fail(`${label} contains unsafe unnegated phrase matching ${pattern}: ${match[0]}`);
      }
    }
  }
}

assert.ok(fs.existsSync(markdownPath), 'Snapshot markdown must exist.');
assert.ok(fs.existsSync(jsonPath), 'Snapshot JSON must exist.');

const snapshot = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
assert.equal(snapshot.snapshot_id, 'aha_release_readiness_snapshot_v1');
assert.equal(snapshot.repo, 'Paradispartiet/AHA-EchoNet');
assert.equal(snapshot.status, 'local_only_ready_baseline');

for (const flag of [
  'backend_enabled',
  'sync_enabled',
  'echonet_enabled',
  'external_sharing_enabled',
  'model_training_enabled',
  'fine_tuning_enabled',
  'historygo_writeback_enabled',
  'hidden_auto_discovery_enabled'
]) {
  assert.equal(snapshot.global_boundaries?.[flag], false, `${flag} must be false.`);
}

const registry = loadRegistry();
const matrixRows = extractMatrixRows();
const registryById = new Map(registry.map((module) => [module.id, module]));
const matrixById = new Map(matrixRows.map((row) => [row.module_id, row]));
const snapshotById = new Map(snapshot.modules.map((module) => [module.id, module]));

assertSetEqual(new Set(snapshotById.keys()), new Set(registryById.keys()), 'Snapshot modules must exactly match registry IDs.');
assertSetEqual(new Set(snapshotById.keys()), new Set(matrixById.keys()), 'Snapshot modules must exactly match matrix IDs.');

for (const [id, module] of snapshotById) {
  const registryModule = registryById.get(id);
  const matrixRow = matrixById.get(id);
  assert.equal(module.registry_status, registryModule.status, `${id} registry_status must match registry status.`);
  assert.equal(module.maturity, matrixRow.maturity, `${id} maturity must match matrix maturity.`);
  const expectedReleaseState = { ready: 'ready', shell: 'shell', planned: 'planned' }[matrixRow.maturity];
  assert.equal(module.release_state, expectedReleaseState, `${id} release_state must map from matrix maturity.`);
}

const nonReadyById = new Map(snapshot.intentional_non_ready.map((module) => [module.id, module]));
assert.equal(nonReadyById.get('meet')?.release_state, 'shell', 'meet must be intentional shell.');
assert.equal(nonReadyById.get('sync-hub')?.release_state, 'planned', 'sync-hub must be intentional planned.');
assert.deepEqual([...nonReadyById.keys()].sort(), ['meet', 'sync-hub'], 'Only meet and sync-hub may be intentional non-ready.');

const unsafePatterns = [
  /backend\s+(?:is\s+)?active/i,
  /EchoNet\s+(?:is\s+)?active/i,
  /Sync Hub\s+(?:is\s+)?active/i,
  /external publishing\s+(?:is\s+)?active/i,
  /model training\s+(?:is\s+)?active/i,
  /fine-tuning\s+(?:is\s+)?active/i,
  /login\/account identity\s+(?:is\s+)?active/i,
  /History Go write-back\s+(?:is\s+)?active/i,
  /payment\/subscription system\s+(?:is\s+)?active/i,
  /backend enabled/i,
  /echonet enabled/i,
  /sync enabled/i,
  /external sharing enabled/i,
  /model training enabled/i,
  /fine tuning enabled/i,
  /historygo writeback enabled/i
];
assertNoUnsafePhrase(fs.readFileSync(markdownPath, 'utf8'), unsafePatterns, 'Snapshot markdown');
assertNoUnsafePhrase(fs.readFileSync(jsonPath, 'utf8'), unsafePatterns, 'Snapshot JSON');

const readme = fs.readFileSync(readmePath, 'utf8');
for (const pattern of [
  /Release readiness snapshot/,
  /docs\/AHA_RELEASE_READINESS_SNAPSHOT\.md/,
  /docs\/AHA_RELEASE_READINESS_SNAPSHOT\.json/,
  /`meet`: shell/,
  /`sync-hub`: planned\/no-op/,
  /does not activate backend, account login, EchoNet, social sharing, active sync, external publishing, model training, fine-tuning or History Go write-back/
]) {
  assert.match(readme, pattern, `README must mention ${pattern}.`);
}

assert.equal(matrixById.get('meet')?.maturity, 'shell', 'meet matrix maturity must remain shell.');
assert.equal(matrixById.get('sync-hub')?.maturity, 'planned', 'sync-hub matrix maturity must remain planned.');
for (const module of registry) {
  const maturity = matrixById.get(module.id)?.maturity;
  if (module.status === 'active') {
    assert.ok(!['partial', 'broken', 'unknown'].includes(maturity), `${module.id} active module must not be ${maturity}.`);
  }
}

console.log(`AHA release readiness snapshot audit passed for ${snapshot.modules.length} modules.`);
