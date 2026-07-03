const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    readJson(key, fallback) { return store.has(key) ? JSON.parse(store.get(key)) : fallback; },
    writeJson(key, value) { store.set(key, JSON.stringify(value)); }
  };
}

function makeElement() { return { textContent: '', innerHTML: '', addEventListener() {}, focus() {}, reset() {} }; }

function makeContext({ seed = {}, repository, config } = {}) {
  const repoCalls = [];
  const storage = makeStorage(seed);
  const elements = { 'lists-count': makeElement(), 'list-items-count': makeElement(), 'lists-list': makeElement() };
  const context = {
    console, Date, Intl, Math, JSON, localStorage: storage,
    document: { readyState: 'loading', addEventListener() {}, getElementById(id) { return elements[id] || null; }, querySelector() { return null; }, querySelectorAll() { return []; } },
    addEventListener() {}, fetch() { throw new Error('fetch must not be used by Lists'); },
    EchoNet: new Proxy({}, { get() { throw new Error('EchoNet must not be used by Lists'); } }),
    AHASyncHub: new Proxy({}, { get() { throw new Error('Sync Hub must not be used by Lists'); } }),
    AHA_CONFIG: config,
    AHARepository: repository || { saveList(list) { repoCalls.push(['saveList', list]); return { ok: true }; }, loadLists() { repoCalls.push(['loadLists']); return { ok: true, data: [] }; } },
    AHAGroups: { getActiveGroups() { return []; } },
    AHAModules: { localPageHealth(input) { return { status: input.count ? 'ready' : 'empty' }; }, updatePageHealth() {}, buildModuleEmptyState({ title, message, hint }) { return `<h2>${title}</h2><p>${message}</p><p>${hint}</p>`; } }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaContracts.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaLists.js'), 'utf8'), context);
  return { Lists: context.AHALists, storage, repoCalls, elements };
}

(async () => {
  const { Lists, storage, repoCalls, elements } = makeContext();
  const created = Lists.createList({ title: 'Local refs', type: 'todo' });
  assert.ok(created.id, 'createList should create an id');
  assert.equal(storage.readJson('aha_lists_v1', []).length, 1, 'createList should save locally');
  assert.equal(created.local_only, true, 'new list should be local_only');
  assert.equal(created.published_external, false, 'new list should not be externally published');
  assert.equal(created.echonet_shared, false, 'new list should not be EchoNet shared');
  assert.equal(created.sync_enabled, false, 'new list should not have sync enabled');
  assert.equal(created.meta.local_only, true, 'new list meta should be local_only');
  assert.equal(repoCalls.length, 0, 'createList should not call repository without explicit database sync flag');
  Lists.updateList(created.id, { title: 'Updated refs' });
  assert.equal(repoCalls.length, 0, 'updateList should not call repository without explicit database sync flag');
  const deleted = Lists.deleteList(created.id);
  assert.ok(deleted.deletedAt, 'deleteList should soft-delete with deletedAt');
  Lists.render();
  assert.equal(elements['lists-count'].textContent, '0', 'deleted lists should not count as active');

  storage.writeJson('aha_insight_chamber_v1', { insights: [{ id: 'ins-1', title: 'Insight' }, { id: 'ins-deleted', title: 'Deleted', deletedAt: '2026-01-01' }] });
  storage.writeJson('aha_notes_v1', [{ id: 'note-1', title: 'Note' }, { id: 'note-arch', title: 'Archived', archived: true }]);
  storage.writeJson('aha_feed_posts_v1', [{ id: 'feed-1', text: 'Feed' }]);
  storage.writeJson('aha_gallery_v1', [{ id: 'gallery-1', title: 'Gallery' }]);
  storage.writeJson('aha_insta_posts_v1', [{ id: 'insta-1', caption: 'Insta' }]);
  const keys = new Set(Lists.collectAvailableItems().map((item) => `${item.source}::${item.refId}`));
  for (const key of ['aha_insights::ins-1', 'aha_notes::note-1', 'aha_feed::feed-1', 'aha_gallery::gallery-1', 'aha_insta::insta-1']) assert.ok(keys.has(key), `${key} should be collected`);
  assert.equal(keys.has('aha_insights::ins-deleted'), false, 'deleted object should be ignored');
  assert.equal(keys.has('aha_notes::note-arch'), false, 'archived object should be ignored');
  assert.equal(Lists.validateListReference({ source: 'aha_notes', refId: 'note-1' }).ok, true, 'valid local reference should pass');
  assert.equal(Lists.validateListReference({ source: 'web', refId: 'note-1' }).reason, 'unknown_source', 'unknown source should fail');
  assert.equal(Lists.validateListReference({ source: 'aha_notes' }).reason, 'missing_refId', 'missing refId should fail');

  const active = Lists.createList({ title: 'Active', type: 'favorites' });
  assert.equal(Lists.addItemToList(active.id, { source: 'aha_notes', refId: 'missing' }).ok, false, 'invalid reference should be rejected');
  const addOk = Lists.addItemToList(active.id, { source: 'aha_notes', refId: 'note-1' });
  assert.equal(addOk.ok, true, 'valid add should return ok:true');
  assert.ok(addOk.item.id, 'valid add should return item');
  assert.equal(Lists.addItemToList(active.id, { source: 'aha_notes', refId: 'note-1' }).reason, 'duplicate', 'duplicate add should be rejected');
  const syncDisabled = await Lists.syncFromDatabase();
  assert.equal(syncDisabled.fallback, 'localOnly', 'syncFromDatabase should fall back to localOnly by default');
  assert.equal(syncDisabled.database_sync_disabled, true, 'syncFromDatabase should say database sync is disabled');
  assert.equal(repoCalls.length, 0, 'Lists should not use repository, fetch, EchoNet or Sync Hub by default');

  const enabledRepoCalls = [];
  const enabledRepo = { saveList(list) { enabledRepoCalls.push(['saveList', list.id]); return { ok: true }; }, loadLists() { enabledRepoCalls.push(['loadLists']); return { ok: true, data: [] }; } };
  const enabled = makeContext({ repository: enabledRepo, config: { lists: { enableDatabaseSync: true } } });
  const enabledList = enabled.Lists.createList({ title: 'Explicit sync', type: 'todo' });
  enabled.Lists.updateList(enabledList.id, { title: 'Explicit sync updated' });
  await enabled.Lists.syncFromDatabase();
  assert.ok(enabledRepoCalls.some(([name]) => name === 'saveList'), 'repository saveList should work when database sync flag is true');
  assert.ok(enabledRepoCalls.some(([name]) => name === 'loadLists'), 'repository loadLists should work when database sync flag is true');

  console.log('aha-lists.test.cjs passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
