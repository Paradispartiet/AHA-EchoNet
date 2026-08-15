const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/ahaCanonicalSyncStore.js', 'utf8');
assert.doesNotMatch(source, /\bfetch\s*\(/, 'sync store must not call network');
assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|sendBeacon/, 'sync store must not contain alternate network clients');
assert.doesNotMatch(source, /(?:login|auth|session)[\s\S]{0,120}(?:enqueue|listPending|openDatabase)\s*\(/i, 'login/auth/session must not trigger sync store work');
assert.doesNotMatch(source, /localStorage\s*\.\s*(?:setItem|removeItem|clear)\s*\(/, 'canonical sync state must not be written to localStorage');

const context = vm.createContext({ window: {}, module: { exports: {} }, exports: {}, console, Date, JSON, String, Number, Object, Array, RegExp, Error, Promise });
vm.runInContext(source, context, { filename: 'js/ahaCanonicalSyncStore.js' });
const store = context.window.AHACanonicalSyncStore;
assert.ok(store, 'AHACanonicalSyncStore should be exported');

const status = store.getStatus();
assert.equal(status.networkEnabled, false);
assert.equal(status.autoSync, false);
assert.equal(status.loginTriggersSync, false);
assert.equal(status.database, 'aha_canonical_sync_v1');
assert.deepEqual(Array.from(status.allowedObjectTypes), [
  'conversation','message','source_event','insight','concept_list','concept_list_item','knowledge_path','knowledge_path_step','article','article_reference'
]);

const hash = 'a'.repeat(64);
const input = {
  id: 'event-1', workspaceId: 'workspace-1', deviceId: 'device-1', objectType: 'insight', objectId: 'insight-1',
  operation: 'upsert', baseRevision: 3, payloadHash: hash, payload: { id: 'insight-1', title: 'Trygg innsikt' }, createdAt: '2026-08-15T10:00:00.000Z'
};
const before = JSON.stringify(input);
const normalized = store.normalizeOutboxEvent(input);
assert.equal(JSON.stringify(input), before, 'normalizer must not mutate input');
assert.equal(normalized.status, 'pending');
assert.equal(normalized.retryCount, 0);
assert.notEqual(normalized.payload, input.payload, 'payload must be cloned');
assert.equal(normalized.baseRevision, 3);

const deletion = store.normalizeOutboxEvent({
  workspaceId: 'workspace-1', deviceId: 'device-1', objectType: 'article', objectId: 'article-1', operation: 'delete', baseRevision: 4, payloadHash: 'b'.repeat(64)
});
assert.equal(deletion.payload, null);

for (const objectType of ['note','gallery_item','feed_post','insta_post','music_item','training_item','personal_ai_state','workbench_state']) {
  assert.throws(() => store.normalizeOutboxEvent({ workspaceId:'w', deviceId:'d', objectType, objectId:'1', operation:'delete', payloadHash:hash }), /local-only object type cannot enter sync outbox/);
}
assert.throws(() => store.normalizeOutboxEvent({ workspaceId:'w', deviceId:'d', objectType:'unknown', objectId:'1', operation:'delete', payloadHash:hash }), /unsupported canonical sync object type/);
assert.throws(() => store.normalizeOutboxEvent({ workspaceId:'w', deviceId:'d', objectType:'insight', objectId:'1', operation:'upsert', payloadHash:hash }), /requires an object payload/);
assert.throws(() => store.normalizeOutboxEvent({ workspaceId:'w', deviceId:'d', objectType:'insight', objectId:'1', operation:'delete', payloadHash:hash, payload:{} }), /must not carry object payload/);
assert.throws(() => store.normalizeOutboxEvent({ workspaceId:'w', deviceId:'d', objectType:'insight', objectId:'1', operation:'delete', payloadHash:'bad' }), /sha256/);
assert.throws(() => store.normalizeOutboxEvent({ workspaceId:'w', deviceId:'d', objectType:'insight', objectId:'1', operation:'delete', payloadHash:hash, baseRevision:-1 }), /baseRevision/);

const cursor = store.normalizeCursor({ workspaceId:'w', deviceId:'d', pullCursor:9, pushCursor:5 });
assert.equal(cursor.id, 'd:w');
assert.equal(cursor.pullCursor, 9);
assert.equal(cursor.pushCursor, 5);
assert.throws(() => store.normalizeCursor({ workspaceId:'w', deviceId:'d', pullCursor:-1 }), /non-negative/);

const tombstone = store.normalizeTombstone({ workspaceId:'w', objectType:'message', objectId:'m1', revision:7, deletedAt:'2026-08-15T10:00:00Z', source:'server' });
assert.equal(tombstone.id, 'w:message:m1');
assert.equal(tombstone.revision, 7);
assert.equal(tombstone.source, 'server');

console.log('aha-canonical-sync-store.test.cjs passed');
