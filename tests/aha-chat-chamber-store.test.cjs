const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { console, Map, Object, String, JSON, Date };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/ahaModuleApi.js', 'utf8'), context, { filename: 'js/ahaModuleApi.js' });
vm.runInContext(fs.readFileSync('js/ahaChatChamberStore.js', 'utf8'), context, { filename: 'js/ahaChatChamberStore.js' });

const facade = context.AHAModuleApi.get('chat.chamberStore', { version: 1 });
assert.equal(Object.isFrozen(facade), true, 'chamber store facade must be frozen');
assert.equal(facade.STORAGE_KEY, 'aha_insight_chamber_v1');
assert.equal(facade.SAVED_EVENT, 'aha:chamber-saved');
assert.equal(typeof facade.create, 'function');
assert.throws(() => facade.create(), /createEmptyChamber/);

function createStorage() {
  const values = new Map();
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

const storage = createStorage();
const warnings = [];
const events = [];
let emptyCount = 0;
const store = facade.create({
  storage,
  createEmptyChamber() { emptyCount += 1; return { insights: [], emptyCount }; },
  now: () => '2026-08-13T22:00:00.000Z',
  warn(...args) { warnings.push(args); },
  createSavedEvent(detail) { return { type: facade.SAVED_EVENT, detail }; },
  dispatchEvent(event) { events.push(event); }
});
assert.equal(Object.isFrozen(store), true, 'chamber store instance must be frozen');

assert.deepEqual(JSON.parse(JSON.stringify(store.load())), { insights: [], emptyCount: 1 });
storage.setItem(facade.STORAGE_KEY, JSON.stringify({ insights: [{ id: 'insight_1' }], version: 'v1' }));
assert.deepEqual(JSON.parse(JSON.stringify(store.load())), { insights: [{ id: 'insight_1' }], version: 'v1' });
storage.setItem(facade.STORAGE_KEY, 'null');
assert.equal(store.load(), null, 'valid legacy JSON shapes must remain unchanged');
storage.setItem(facade.STORAGE_KEY, '{broken');
assert.deepEqual(JSON.parse(JSON.stringify(store.load())), { insights: [], emptyCount: 2 });
assert.match(String(warnings.at(-1)?.[0]), /Kunne ikke laste innsiktskammer/);

const chamber = { insights: [{ id: 'insight_1' }, { id: 'insight_2' }] };
assert.equal(store.save(chamber), undefined, 'save return value must remain backward compatible');
assert.equal(chamber._local_updated_at, '2026-08-13T22:00:00.000Z');
assert.deepEqual(JSON.parse(storage.getItem(facade.STORAGE_KEY)), chamber);
assert.deepEqual(JSON.parse(JSON.stringify(events.at(-1))), {
  type: 'aha:chamber-saved',
  detail: { source: 'ahaChat', insight_count: 2 }
});

storage.setItem('aha_afterwork_v1', 'keep');
assert.equal(store.clear(), true);
assert.equal(storage.getItem(facade.STORAGE_KEY), null);
assert.equal(storage.getItem('aha_afterwork_v1'), 'keep', 'chamber clear must not delete adjacent Chat state');

let blockedEvents = 0;
const blocked = facade.create({
  createEmptyChamber: () => ({ insights: [] }),
  storage: {
    getItem() { throw new Error('blocked read'); },
    setItem() { throw new Error('blocked write'); },
    removeItem() { throw new Error('blocked clear'); }
  },
  warn(...args) { warnings.push(args); },
  createSavedEvent(detail) { return { detail }; },
  dispatchEvent() { blockedEvents += 1; }
});
assert.deepEqual(JSON.parse(JSON.stringify(blocked.load())), { insights: [] });
assert.equal(blocked.save({ insights: [] }), undefined);
assert.equal(blockedEvents, 0, 'failed writes must not emit a saved event');
assert.equal(blocked.clear(), false);
assert.match(String(warnings.at(-1)?.[0]), /Kunne ikke lagre innsiktskammer/);

console.log('aha-chat-chamber-store tests passed');
