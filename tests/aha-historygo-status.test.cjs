const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/ahaHistoryGoStatus.js', 'utf8');

function makeLocalStorage() {
  const writes = [];
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { writes.push([key, String(value)]); map.set(key, String(value)); },
    seed: (key, value) => map.set(key, JSON.stringify(value)),
    writes
  };
}

const localStorage = makeLocalStorage();
localStorage.seed('aha_import_payload_v1', { exported_at: '2026-07-07T00:00:00.000Z', hg_learning_log_v1: [{ id: 1 }], hg_insights_events_v1: [{ id: 2 }], knowledge_universe: { a: { b: [1] } }, notes: [{}], dialogs: [{}], nextup_learning_signal: {} });
localStorage.seed('visited_places', [{ id: 'oslo' }]);
localStorage.seed('people_collected', [{ id: 'person' }]);
localStorage.seed('hg_unlocks_v1', { byQuiz: { q1: true, q2: true } });
localStorage.seed('aha_source_events_v1', [
  { id: 'e1', source_app: 'historygo', source_type: 'historygo_note', imported: true, title: 'HG', text: 'text' },
  { id: 'e2', source_app: 'notes', source_type: 'note' }
]);
localStorage.seed('aha_insight_chamber_v1', { insights: [{ id: 'i1', source_event_ids: ['e1'] }] });
localStorage.seed('aha_historygo_imports_v1', [{ id: 'historygo_import_1', imported_at: '2026-07-07T01:00:00.000Z', historygo_storage_apply_enabled: false, database_persist_enabled: false, historygo_storage_apply_result: { skipped: true, reason: 'historygo_storage_apply_disabled' } }]);

const context = { console, localStorage, document: { getElementById: () => null }, window: null };
context.window = context;
vm.runInNewContext(source, context, { filename: 'js/ahaHistoryGoStatus.js' });
const status = context.AHAHistoryGoStatus;

assert.equal(status.collectHistoryGoStatus().hasImportPayload, true);
assert.equal(status.collectHistoryGoStatus().visitedPlacesCount, 1);
const payload = status.collectImportPayloadSummary();
assert.equal(payload.learningLogCount, 1);
assert.equal(payload.insightEventsCount, 1);
assert.ok(payload.payloadKeys.includes('hg_learning_log_v1'));
const imported = status.collectImportedAhaEvents();
assert.equal(imported.totalCount, 1);
assert.equal(imported.importedInsightsCount, 1);
const log = status.collectImportLogSummary();
assert.equal(log.totalCount, 1);
assert.equal(log.lastImportId, 'historygo_import_1');
assert.equal(log.storageApplySkipped, true);
assert.equal(log.storageApplyReason, 'historygo_storage_apply_disabled');
assert.equal(log.databasePersistEnabled, false);
assert.equal(log.historygoStorageApplyEnabled, false);
assert.equal(localStorage.writes.length, 0, 'status collection should not write localStorage');

for (const forbidden of ['fetch(', 'createClient', 'supabase']) {
  assert.equal(source.includes(forbidden), false, `status should not include ${forbidden}`);
}

console.log('aha-historygo-status.test.cjs passed');
