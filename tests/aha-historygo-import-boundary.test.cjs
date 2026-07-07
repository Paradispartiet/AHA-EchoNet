const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/ahaHistoryGoImport.js', 'utf8');

function makeLocalStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    has: (key) => map.has(key),
    keys: () => [...map.keys()]
  };
}

function loadContext(overrides = {}) {
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
    localStorage: makeLocalStorage(),
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    dispatchEvent: () => {},
    AHAIngest: { ingest: (input) => { ingestCalls.push(input); return { ok: true, id: `event_${ingestCalls.length}` }; } },
    AHARepository: { saveImport: async (input) => { saveCalls.push(input); return { ok: true }; } },
    ...overrides
  };
  context.window = context;
  context.__ingestCalls = ingestCalls;
  context.__saveCalls = saveCalls;
  vm.runInNewContext(source, context, { filename: 'js/ahaHistoryGoImport.js' });
  return context;
}

(async () => {
const payload = {
  exported_at: '2026-07-07T00:00:00.000Z',
  nextup_learning_signal: { learning_style: 'utforskende', inferred_interests: ['historie'] },
  hg_learning_log_v1: [{ type: 'quiz', name: 'Quiz', note: 'Bra', concepts: ['kilde'] }],
  hg_insights_events_v1: [{ concepts: ['demokrati'], categoryId: 'samfunn' }],
  knowledge_universe: { historie: { folk: [{ id: 'k1', topic: 'Tema', text: 'Tekst' }] } },
  notes: [{ title: 'Notat', text: 'tekst' }],
  dialogs: [{ title: 'Dialog', text: 'tekst' }],
  merits_by_category: { history: ['badge'] },
  people_collected: [{ id: 'p1' }]
};

let ctx = loadContext();
const invalid = ctx.AHAHistoryGoImport.importHistoryGoData(null);
assert.equal(invalid.error, 'Ugyldig payload.');
assert.equal(invalid.importedSignals, 0);
ctx = loadContext({ AHAIngest: null });
assert.equal(ctx.AHAHistoryGoImport.importHistoryGoData(payload).error, 'AHAIngest mangler.');

ctx = loadContext();
const counts = ctx.AHAHistoryGoImport.importHistoryGoData(payload);
assert.equal(counts.local_only, true);
assert.equal(counts.source_app, 'historygo');
assert.equal(counts.database_persist_enabled, false);
assert.equal(counts.historygo_storage_apply_enabled, false);
assert.equal(counts.historygo_storage_apply_result.skipped, true);
assert.equal(counts.storage_keys_applied, 0);
assert.equal(counts.import_log_written, true);
assert.equal(ctx.__saveCalls.length, 0, 'saveImport should not run without database flag');
assert.ok(ctx.__ingestCalls.length >= 6, 'payload should create AHA ingest calls');
for (const call of ctx.__ingestCalls) {
  assert.equal(call.source_app, 'historygo');
  assert.equal(call.imported, true);
  assert.equal(call.meta.source_app, 'historygo');
  assert.equal(call.meta.import_source, 'historygo');
  assert.equal(call.meta.local_only, true);
  assert.equal(call.meta.import_id, counts.import_id);
}
assert.equal(new Set(ctx.__ingestCalls.map((call) => call.meta.import_id)).size, 1);
for (const key of ['knowledge_universe', 'hg_learning_log_v1', 'hg_insights_events_v1', 'merits_by_category', 'people_collected']) {
  assert.equal(ctx.localStorage.has(key), false, `${key} should not be written by default`);
}
const logEntries = JSON.parse(ctx.localStorage.getItem('aha_historygo_imports_v1'));
assert.equal(logEntries.length, 1);
assert.equal(logEntries[0].id, counts.import_id);
assert.equal(logEntries[0].local_only, true);
assert.deepEqual(logEntries[0].payload_keys.sort(), Object.keys(payload).sort());
assert.equal(Object.prototype.hasOwnProperty.call(logEntries[0], 'knowledge_universe'), false);
assert.equal(JSON.stringify(logEntries).includes('people_collected'), true, 'payload key names are okay');
assert.equal(JSON.stringify(logEntries).includes('"p1"'), false, 'full payload data should not be stored in import log');

ctx = loadContext({ AHA_CONFIG: { historygo: { enableDatabasePersist: true } } });
ctx.AHAHistoryGoImport.importHistoryGoData(payload);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(ctx.__saveCalls.length, 1, 'saveImport should run when database flag is true');

ctx = loadContext({ AHA_CONFIG: { historygo: { allowApplyToHistoryGoStorage: true } } });
const appliedCounts = ctx.AHAHistoryGoImport.importHistoryGoData(payload);
assert.equal(appliedCounts.storage_keys_applied, 5);
for (const key of ['knowledge_universe', 'hg_learning_log_v1', 'hg_insights_events_v1', 'merits_by_category', 'people_collected']) {
  assert.equal(ctx.localStorage.has(key), true, `${key} should be written only when apply flag is true`);
}

ctx = loadContext();
assert.equal(ctx.__ingestCalls.length, 0, 'no auto-import at module load');
assert.equal(ctx.__saveCalls.length, 0, 'no repository save at module load');

assert.equal(source.includes('ahaEmneMatcher'), false, 'History Go import should not use ahaEmneMatcher');
for (const forbidden of ['fetch(', 'EchoNet', 'Sync Hub', 'createClient', 'supabase']) {
  assert.equal(source.includes(forbidden), false, `import boundary should not include ${forbidden}`);
}

console.log('aha-historygo-import-boundary.test.cjs passed');
})();
