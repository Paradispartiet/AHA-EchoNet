const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const contractSource = fs.readFileSync('js/ahaHistoryGoImportContract.js', 'utf8');
const importSource = fs.readFileSync('js/ahaHistoryGoImport.js', 'utf8');
const fixtureText = fs.readFileSync('docs/fixtures/historygo-import/history-go-export-array-visited-v1.json', 'utf8');
const fixture = JSON.parse(fixtureText);

function makeRuntime() {
  const values = new Map([['aha_import_payload_v1', fixtureText]]);
  const reads = [];
  const writes = [];
  const ingestCalls = [];
  const saveCalls = [];
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
      getItem(key) { reads.push(key); return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { writes.push(key); values.set(key, String(value)); },
      removeItem(key) { writes.push(key); values.delete(key); }
    },
    AHAIngest: {
      ingest(input) {
        ingestCalls.push(input);
        return { ok: true, id: `signal_${ingestCalls.length}` };
      }
    },
    AHARepository: {
      saveImport(input) { saveCalls.push(input); return Promise.resolve({ ok: true }); }
    },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    dispatchEvent() {}
  };
  context.window = context;
  vm.runInNewContext(contractSource, context, { filename: 'js/ahaHistoryGoImportContract.js' });
  vm.runInNewContext(importSource, context, { filename: 'js/ahaHistoryGoImport.js' });
  return { context, values, reads, writes, ingestCalls, saveCalls };
}

for (const page of ['historygo.html', 'index.html', 'chat.html', 'status.html']) {
  const html = fs.readFileSync(page, 'utf8');
  const contractIndex = html.indexOf('js/ahaHistoryGoImportContract.js');
  const importIndex = html.indexOf('js/ahaHistoryGoImport.js');
  assert.ok(contractIndex >= 0, `${page} must load the History Go contract`);
  assert.ok(importIndex > contractIndex, `${page} must load the contract before the importer`);
}

const runtime = makeRuntime();
assert.deepEqual(runtime.reads, [], 'loading the contract/importer must not read the payload');
assert.deepEqual(runtime.writes, [], 'loading the contract/importer must not write or import');
assert.deepEqual(runtime.ingestCalls, [], 'loading modules must not create hidden signals');

const blocked = runtime.context.AHAHistoryGoImport.importHistoryGoDataFromSharedStorage();
assert.equal(blocked.error_code, 'explicit_consent_required');
assert.deepEqual(runtime.reads, [], 'the shared-storage entry must not read before consent');
assert.deepEqual(runtime.writes, [], 'consent rejection must be side-effect free');

const sourceStorageSnapshot = new Map(runtime.values);
const imported = runtime.context.AHAHistoryGoImport.importHistoryGoDataFromSharedStorage({
  confirmed: true,
  consent_method: 'e2e_fixture_confirmation'
});

assert.equal(imported.importedSignals, 6);
assert.equal(imported.nextup, 1);
assert.equal(imported.learning_log, 1);
assert.equal(imported.insight_events, 1);
assert.equal(imported.knowledge, 1);
assert.equal(imported.notes, 1);
assert.equal(imported.dialogs, 1);
assert.equal(imported.storage_keys_applied, 0);
assert.match(imported.payload_fingerprint, /^aha_historygo_payload_v1_[0-9a-f]{16}$/);
assert.deepEqual(runtime.ingestCalls.map((call) => call.source_type), [
  'historygo_nextup_profile',
  'quiz',
  'historygo_concept_event',
  'historygo_knowledge_item_v2',
  'historygo_note',
  'historygo_dialog'
]);
for (const call of runtime.ingestCalls) {
  assert.equal(call.source_app, 'historygo');
  assert.equal(call.imported, true);
  assert.equal(call.meta.import_id, imported.import_id);
  assert.equal(call.meta.local_only, true);
}

const sourceOwnedKeys = Object.keys(fixture).filter((key) => ![
  'schema_version', 'contract_version', 'source', 'exported_at', 'privacy'
].includes(key));
for (const key of sourceOwnedKeys) {
  assert.equal(runtime.values.get(key), sourceStorageSnapshot.get(key), `${key} must not be written back`);
}
assert.deepEqual([...new Set(runtime.writes)], ['aha_historygo_imports_v1'], 'default import may only write its compact AHA import log');
assert.equal(runtime.saveCalls.length, 0, 'default import must not persist remotely');

const logBeforeDuplicate = runtime.values.get('aha_historygo_imports_v1');
const writesBeforeDuplicate = runtime.writes.length;
const signalsBeforeDuplicate = runtime.ingestCalls.length;
const reorderedFixture = Object.fromEntries(Object.entries(fixture).reverse());
const duplicate = runtime.context.AHAHistoryGoImport.importHistoryGoData(reorderedFixture, {
  confirmed: true,
  consent_method: 'e2e_duplicate_confirmation'
});
assert.equal(duplicate.duplicate, true);
assert.equal(duplicate.duplicate_of_import_id, imported.import_id);
assert.equal(duplicate.importedSignals, 0);
assert.equal(duplicate.import_log_written, false);
assert.equal(runtime.ingestCalls.length, signalsBeforeDuplicate, 'duplicate payload must create zero signals');
assert.equal(runtime.writes.length, writesBeforeDuplicate, 'duplicate payload must create zero writes');
assert.equal(runtime.values.get('aha_historygo_imports_v1'), logBeforeDuplicate, 'duplicate payload must not duplicate the audit log');

console.log('aha-historygo-import-e2e.test.cjs passed');
