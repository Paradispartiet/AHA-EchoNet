const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('js/ahaSyncHub.js', 'utf8');
const values = new Map();
const storageCalls = [];
const localStorage = {
  getItem(key) {
    storageCalls.push(['getItem', key]);
    return values.has(key) ? values.get(key) : null;
  },
  setItem(key, value) {
    storageCalls.push(['setItem', key, value]);
  },
  removeItem(key) {
    storageCalls.push(['removeItem', key]);
  }
};
const repositoryCalls = [];
const context = vm.createContext({
  window: {
    localStorage,
    AHARepository: new Proxy({}, {
      get(_target, property) {
        repositoryCalls.push(property);
        return () => repositoryCalls.push(`${String(property)}:called`);
      }
    })
  },
  console
});

vm.runInContext(code, context, { filename: 'js/ahaSyncHub.js' });
const hub = context.window.AHASyncHub;

assert.ok(hub, 'adapter should export window.AHASyncHub');
assert.equal(typeof hub.inspectAll, 'function', 'adapter should expose inspectAll');

values.set('invalid', '{invalid json');
assert.equal(hub.safeReadArray('invalid').length, 0, 'invalid JSON should safely return an empty array');

values.set('records', JSON.stringify([
  { id: 'active' },
  { id: 'camel-tombstone', deletedAt: '2026-01-01T00:00:00Z' },
  { id: 'snake-tombstone', deleted_at: '2026-01-01T00:00:00Z' }
]));
assert.equal(hub.countActiveRecords('records'), 1, 'both tombstone variants should be excluded');

const missingRuntime = hub.inspectModule(hub.modules[0]);
assert.equal(missingRuntime.status, 'klarlagt');
assert.equal(missingRuntime.fallback, 'module_not_loaded_on_home');
assert.equal(missingRuntime.canSyncHere, false);

let syncCalls = 0;
context.window.AHALists = {
  syncFromDatabase() {
    syncCalls += 1;
  }
};
const readyRuntime = hub.inspectModule(hub.modules[0]);
assert.equal(readyRuntime.status, 'sync_klar');
assert.equal(readyRuntime.fallback, null);
assert.equal(readyRuntime.canSyncHere, false);
assert.equal(readyRuntime.deprecatedCanSyncHere, true);
assert.equal(syncCalls, 0, 'runtime inspection must not call syncFromDatabase');

context.window.AHAPaths = {};
const missingSync = hub.inspectModule(hub.modules[1]);
assert.equal(missingSync.status, 'mangler_sync');
assert.equal(missingSync.fallback, 'missing_sync_function');
assert.equal(missingSync.canSyncHere, false);

storageCalls.length = 0;
const inspection = hub.inspectAll();
assert.equal(inspection.ok, true);
assert.equal(inspection.mode, 'planned_noop');
assert.equal(inspection.autoSync, false);
assert.equal(inspection.modules.length, 4);
assert.deepEqual(
  inspection.modules.map((item) => item.key).join(','),
  'aha_lists_v1,aha_paths_v1,aha_groups_v1,aha_articles_v1'
);
assert.equal(syncCalls, 0, 'inspectAll must not call syncFromDatabase');
assert.equal(repositoryCalls.length, 0, 'inspectAll must not access AHARepository');
assert.equal(storageCalls.some(([method]) => method !== 'getItem'), false, 'inspectAll must only read localStorage');
assert.equal(/syncFromDatabase\s*\(/.test(code), false, 'adapter source must not call syncFromDatabase');
assert.equal(/AHARepository/.test(code), false, 'adapter source must not access AHARepository');
assert.equal(/localStorage\s*\.\s*(setItem|removeItem|clear)\s*\(/.test(code), false, 'adapter source must not write localStorage');

console.log('aha-sync-hub-runtime-adapter.test.cjs passed');
