const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const contractSource = fs.readFileSync('js/ahaHistoryGoImportContract.js', 'utf8');
const importSource = fs.readFileSync('js/ahaHistoryGoImport.js', 'utf8');
const pageSource = fs.readFileSync('historygo.html', 'utf8');
const dashboardSource = fs.readFileSync('js/ahaDashboard.js', 'utf8');
const payload = fs.readFileSync('docs/fixtures/historygo-import/valid-v1.json', 'utf8');

function makeContext() {
  const reads = [];
  const writes = [];
  const ingestCalls = [];
  const values = new Map([['aha_import_payload_v1', payload]]);
  const context = {
    console,
    Date,
    Math,
    JSON,
    String,
    Object,
    Array,
    Number,
    localStorage: {
      getItem(key) { reads.push(key); return values.get(key) || null; },
      setItem(key, value) { writes.push(key); values.set(key, String(value)); }
    },
    AHAIngest: { ingest(input) { ingestCalls.push(input); return { ok: true }; } },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    dispatchEvent() {}
  };
  context.window = context;
  vm.runInNewContext(contractSource, context, { filename: 'js/ahaHistoryGoImportContract.js' });
  vm.runInNewContext(importSource, context, { filename: 'js/ahaHistoryGoImport.js' });
  return { context, reads, writes, ingestCalls };
}

let runtime = makeContext();
const blocked = runtime.context.AHAHistoryGoImport.importHistoryGoDataFromSharedStorage();
assert.equal(blocked.error_code, 'explicit_consent_required');
assert.equal(blocked.importedSignals, 0);
assert.deepEqual(runtime.reads, [], 'shared payload must not be read before explicit consent');
assert.deepEqual(runtime.writes, [], 'consent rejection must not write storage or audit state');
assert.deepEqual(runtime.ingestCalls, [], 'consent rejection must not ingest signals');

runtime = makeContext();
const imported = runtime.context.AHAHistoryGoImport.importHistoryGoDataFromSharedStorage({
  confirmed: true,
  consent_method: 'historygo_page_checkbox'
});
assert.equal(imported.consent_confirmed, true);
assert.equal(imported.consent_method, 'historygo_page_checkbox');
assert.ok(imported.importedSignals > 0);
assert.ok(runtime.reads.includes('aha_import_payload_v1'));
assert.ok(runtime.writes.includes('aha_historygo_imports_v1'));
assert.ok(runtime.ingestCalls.length > 0);

assert.match(pageSource, /id="hg-import-consent"[^>]*type="checkbox"/);
assert.match(pageSource, /id="btn-hg-import"[^>]*disabled/);
assert.match(pageSource, /confirmed:\s*true/);
assert.match(pageSource, /historygo_page_checkbox/);
assert.match(pageSource, /consent\.checked\s*=\s*false/);
assert.match(pageSource, /aktiverer ikke offentlig deling eller modelltrening/);

const bindImportButtons = dashboardSource.match(/function bindImportButtons\(\)[\s\S]*?\n  \}/u)?.[0] || '';
assert.match(bindImportButtons, /historygo\.html/);
assert.doesNotMatch(bindImportButtons, /importHistoryGoData/);

console.log('aha-historygo-import-consent.test.cjs passed');
