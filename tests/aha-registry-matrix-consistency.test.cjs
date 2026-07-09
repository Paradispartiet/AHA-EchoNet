#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const registryPath = path.join(ROOT, 'js', 'ahaModules.js');
const matrixPath = path.join(ROOT, 'docs', 'AHA_MODULE_MATURITY_MATRIX.md');
const docsPath = path.join(ROOT, 'docs', 'AHA_REGISTRY_MATRIX_CONSISTENCY.md');
const readmePath = path.join(ROOT, 'README.md');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function duplicates(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes];
}

function loadRegistry() {
  const source = fs.readFileSync(registryPath, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: registryPath });
  return { source, modules: sandbox.window.AHA_MODULES };
}

function extractPreferredOrder(source) {
  const match = source.match(/const\s+PREFERRED_ORDER\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(match, 'PREFERRED_ORDER must be declared as a literal array.');
  const ids = [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
  assert.ok(ids.length > 0, 'PREFERRED_ORDER must contain module IDs.');
  return ids;
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
      type: cells[2],
      registry_status: cells[3],
      phase: cells[4],
      maturity: cells[14]
    });
  }
  return rows;
}

function assertSetEqual(actual, expected, message) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), message);
}

function hasSafeNegative(text, index) {
  const prefix = text.slice(Math.max(0, index - 90), index).toLowerCase();
  const sentencePrefix = prefix.split(/[.!?]/).pop() || prefix;
  return /(?:ingen|ikke|no|not|uten|does not|must not|don't|do not)/.test(sentencePrefix);
}

function assertNoUnsafePhrase(text, patterns, label) {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match && !hasSafeNegative(text, match.index)) {
      assert.fail(`${label} contains unsafe unnegated phrase matching ${pattern}: ${match[0]}`);
    }
  }
}

const { source: registrySource, modules } = loadRegistry();
assert.ok(Array.isArray(modules), 'AHA_MODULES must parse as an array.');

const allowedStatuses = new Set(['active', 'shell', 'planned']);
const requiredModuleFields = ['id', 'title', 'type', 'status', 'href', 'description', 'phase'];
const registryIds = modules.map((module) => module.id);
assert.deepEqual(duplicates(registryIds), [], 'Registry module IDs must be unique.');
for (const module of modules) {
  for (const field of requiredModuleFields) {
    assert.ok(module[field] !== undefined && module[field] !== '', `${module.id || 'unknown'} must have ${field}.`);
  }
  assert.ok(allowedStatuses.has(module.status), `${module.id} has invalid registry status: ${module.status}`);
}

const allowedMaturity = new Set(['ready', 'partial', 'shell', 'planned', 'broken', 'unknown']);
const matrixRows = extractMatrixRows();
const matrixIds = matrixRows.map((row) => row.module_id);
assert.deepEqual(duplicates(matrixIds), [], 'Matrix module IDs must be unique.');
for (const row of matrixRows) {
  assert.ok(row.maturity, `${row.module_id} must have matrix maturity.`);
  assert.ok(allowedMaturity.has(row.maturity), `${row.module_id} has invalid maturity: ${row.maturity}`);
}

const registryIdSet = new Set(registryIds);
const matrixIdSet = new Set(matrixIds);
assertSetEqual(registryIdSet, matrixIdSet, 'Registry IDs and matrix module IDs must match exactly.');
const modulesById = new Map(modules.map((module) => [module.id, module]));
const matrixById = new Map(matrixRows.map((row) => [row.module_id, row]));
for (const id of registryIds) {
  assert.equal(modulesById.get(id).status, matrixById.get(id).registry_status, `${id} registry status must match matrix registry_status.`);
}

assert.equal(modulesById.get('meet')?.status, 'shell', 'meet registry status must be shell.');
assert.equal(matrixById.get('meet')?.maturity, 'shell', 'meet matrix maturity must be shell.');
assert.equal(modulesById.get('sync-hub')?.status, 'planned', 'sync-hub registry status must be planned.');
assert.equal(matrixById.get('sync-hub')?.maturity, 'planned', 'sync-hub matrix maturity must be planned.');
const activeNonReadyAllowlist = new Set();
for (const module of modules) {
  const maturity = matrixById.get(module.id).maturity;
  if (module.status === 'active' && ['partial', 'broken', 'unknown'].includes(maturity)) {
    assert.ok(activeNonReadyAllowlist.has(module.id), `${module.id} is active but has non-ready maturity ${maturity}.`);
  }
}

const preferredOrder = extractPreferredOrder(registrySource);
assert.deepEqual(duplicates(preferredOrder), [], 'PREFERRED_ORDER must not contain duplicates.');
assertSetEqual(new Set(preferredOrder), registryIdSet, 'PREFERRED_ORDER must contain every and only registry module ID.');

const forbiddenDescriptionPatterns = [
  /innlogging/i,
  /login/i,
  /kontoidentitet/i,
  /account identity/i,
  /kollektiv EchoNet/i,
  /EchoNet-bygging/i,
  /ekte sync/i,
  /auto-sync/i,
  /backend-sync/i,
  /ekstern publisering/i,
  /sosial deling/i,
  /invitasjoner/i,
  /kalender/i,
  /trener en modell/i,
  /modelltrening/i,
  /starter fine-tuning/i,
  /fine-tuning startet/i,
  /laster opp/i,
  /upload/i,
  /skriver tilbake til History Go/i
];
for (const module of modules) {
  assertNoUnsafePhrase(module.description, forbiddenDescriptionPatterns, `${module.id}.description`);
}

assertNoUnsafePhrase(modulesById.get('profile').description, [/login/i, /innlogging/i], 'profile.description');
assert.doesNotMatch(modulesById.get('groups').description, /kollektiv EchoNet|EchoNet-bygging/i);
assert.match(modulesById.get('training').description, /Trener ikke modell/i);
assert.match(modulesById.get('training').description, /starter ikke fine-tuning/i);
assert.match(modulesById.get('training').description, /laster ikke opp data/i);
assert.match(modulesById.get('personal-ai').description, /Ingen modelltrening, API-kall, backend/i);
assert.match(modulesById.get('sync-hub').description, /Planlagt.*no-op/i);
assert.match(modulesById.get('sync-hub').description, /Ingen auto-sync/i);
assert.match(modulesById.get('meet').description, /Shell/i);
assert.match(modulesById.get('meet').description, /Ingen runtime-lagring, invitasjoner, kalender, backend, sync, EchoNet/i);
assert.match(modulesById.get('music').description, /Metadata-only/i);
assert.match(modulesById.get('music').description, /Ingen lydlagring/i);
assert.match(modulesById.get('search').description, /Read-only eksplisitt local-only/i);
assert.match(modulesById.get('search').description, /tokenindeksering/i);
assert.match(modulesById.get('privacy').description, /hemmeligheter eksporteres ikke/i);

const emptyStateMatch = registrySource.match(/const\s+MODULE_EMPTY_STATE_COPY\s*=\s*\{([\s\S]*?)\n\s*\};/);
assert.ok(emptyStateMatch, 'MODULE_EMPTY_STATE_COPY must be present.');
assertNoUnsafePhrase(emptyStateMatch[0], [/sync groups/i, /sync notes/i, /connect backend/i, /publish externally/i, /invite/i, /calendar/i, /EchoNet/i], 'MODULE_EMPTY_STATE_COPY');

const consistencyDoc = read('docs/AHA_REGISTRY_MATRIX_CONSISTENCY.md');
for (const pattern of [/registry/i, /matrix/i, /one matrix row|matching row/i, /PREFERRED_ORDER/, /boundary-safe/i, /meet`? is a shell/i, /sync-hub`? is planned\/no-op/i, /backend/i, /EchoNet/i, /model training/i, /History Go write-back/i]) {
  assert.match(consistencyDoc, pattern, `Consistency doc must mention ${pattern}.`);
}

const readme = read('README.md');
for (const pattern of [/Registry and maturity matrix consistency/, /js\/ahaModules\.js/, /docs\/AHA_MODULE_MATURITY_MATRIX\.md/, /`meet`: shell/, /`sync-hub`: planned\/no-op/]) {
  assert.match(readme, pattern, `README must mention ${pattern}.`);
}

console.log(`AHA registry/matrix consistency audit passed for ${modules.length} modules.`);
