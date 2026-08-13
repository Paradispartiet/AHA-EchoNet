const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { console, Map, Set, Array, Object, String, Number, JSON, Date, Math };
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/ahaModuleApi.js', 'utf8'), context, { filename: 'js/ahaModuleApi.js' });
vm.runInContext(fs.readFileSync('js/ahaChatTextUtils.js', 'utf8'), context, { filename: 'js/ahaChatTextUtils.js' });
vm.runInContext(fs.readFileSync('js/ahaChatAutoOutputView.js', 'utf8'), context, { filename: 'js/ahaChatAutoOutputView.js' });

const facade = context.AHAModuleApi.get('chat.autoOutputStore', { version: 1 });
assert.equal(Object.isFrozen(facade), true, 'auto-output store facade must be frozen');
assert.equal(facade.STORAGE_KEY, 'aha_chat_auto_outputs_v1');
assert.equal(typeof facade.create, 'function');

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
const sourceHash = context.AHAModuleApi.get('chat.textUtils', { version: 1 }).sourceHash;
const store = facade.create({
  storage,
  sourceHash,
  defaultConversationId: 'thread_test',
  now: () => '2026-08-13T20:00:00.000Z'
});
assert.equal(Object.isFrozen(store), true, 'store instance must be frozen');
assert.equal(store.load(), null);

storage.setItem(facade.STORAGE_KEY, '{broken');
assert.equal(store.load(), null, 'malformed cache must fail closed');
storage.setItem(facade.STORAGE_KEY, JSON.stringify('legacy scalar'));
assert.equal(store.load(), null, 'scalar cache must fail closed');

const legacyPayload = { reflection: 'Eldre auto-output', keywords: ['historie'] };
storage.setItem(facade.STORAGE_KEY, JSON.stringify(legacyPayload));
assert.deepEqual(JSON.parse(JSON.stringify(store.load())), { payload: legacyPayload }, 'legacy raw payload must be wrapped on read');

const currentCache = { payload: { reflection: 'Ny cache' }, sourceText: 'Kilde' };
storage.setItem(facade.STORAGE_KEY, JSON.stringify(currentCache));
assert.deepEqual(JSON.parse(JSON.stringify(store.load())), currentCache, 'current cache envelope must remain unchanged');

const payload = {
  analysisId: 'analysis_1',
  analysisRunId: 'run_1',
  conversationId: 'conversation_1',
  turnId: 'turn_1',
  sourceId: 'source_1',
  sourceHash: 'bound_hash',
  sourceFingerprint: 'bound_fingerprint',
  sourceKind: 'url',
  reflection: 'Kildebundet analyse'
};
const activeRun = { analysisRunId: 'run_1', sourceId: 'source_1' };
const saved = store.save({ activeRun, payload, sourceText: '  AHA\n kilde  ', sourceKind: 'pasted_text' });
assert.ok(saved, 'valid cache must be saved');
assert.equal(saved.activeRun, activeRun);
assert.equal(saved.payload, payload);
assert.equal(saved.sourceHash, 'bound_hash');
assert.equal(saved.sourceFingerprint, 'bound_fingerprint');
assert.equal(saved.sourceTextHash, sourceHash('  AHA\n kilde  '));
assert.equal(saved.sourceTextPreview, ' AHA kilde ');
assert.equal(saved.sourceKind, 'url', 'payload source kind must take precedence');
assert.equal(saved.createdAt, '2026-08-13T20:00:00.000Z');
assert.deepEqual(JSON.parse(storage.getItem(facade.STORAGE_KEY)), JSON.parse(JSON.stringify(saved)));

storage.setItem('aha_afterwork_v1', 'keep');
assert.equal(store.clear(), true);
assert.equal(storage.getItem(facade.STORAGE_KEY), null);
assert.equal(storage.getItem('aha_afterwork_v1'), 'keep', 'clearing auto-output must not clear afterwork');

const blocked = facade.create({
  sourceHash,
  storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } }
});
assert.equal(blocked.load(), null);
assert.equal(blocked.save({ payload: {}, sourceText: 'tekst' }), null);
assert.equal(blocked.clear(), false);

console.log('aha-chat-auto-output-store tests passed');
