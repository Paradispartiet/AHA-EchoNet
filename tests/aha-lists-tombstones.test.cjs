const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function forbiddenApi(name, calls) {
  return new Proxy({}, {
    get(_target, prop) {
      calls.push(`${name}.${String(prop)}`);
      throw new Error(`${name} must not be used by AHALists`);
    }
  });
}

function makeLocalStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
    readJson(key, fallback) {
      return store.has(key) ? JSON.parse(store.get(key)) : fallback;
    },
    writeJson(key, value) {
      store.set(key, JSON.stringify(value));
    }
  };
}

function makeElement() {
  return {
    textContent: '',
    innerHTML: '',
    addEventListener() {},
    reset() {}
  };
}

const forbiddenCalls = [];
const localStorage = makeLocalStorage();
const elements = {
  'lists-count': makeElement(),
  'list-items-count': makeElement(),
  'lists-list': makeElement(),
  'lists-refresh': makeElement(),
  'list-create-form': makeElement()
};

const context = {
  console,
  Date,
  Math,
  JSON,
  localStorage,
  document: {
    readyState: 'loading',
    addEventListener() {},
    getElementById(id) { return elements[id] || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  },
  addEventListener() {},
  AHAIngest: forbiddenApi('AHAIngest', forbiddenCalls),
  AHASources: forbiddenApi('AHASources', forbiddenCalls),
  AHARepository: undefined,
  AHAGroups: {
    getActiveGroups() { return []; },
    addReferenceToGroupByObject() { throw new Error('group add should not be invoked by this test'); }
  }
};
context.window = context;
vm.createContext(context);

vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaContracts.js'), 'utf8'), context, { filename: 'js/ahaContracts.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaLists.js'), 'utf8'), context, { filename: 'js/ahaLists.js' });

const Lists = context.AHALists;
assert.ok(Lists, 'AHALists should be exported');

const created = Lists.createList({ title: 'Ny trygg liste', type: 'todo', description: 'write module' });
assert.ok(created?.id, 'createList should return a created list');
let storedLists = localStorage.readJson('aha_lists_v1', []);
assert.equal(storedLists.length, 1, 'createList should write one list to localStorage');
assert.equal(storedLists[0].title, 'Ny trygg liste', 'created list should be persisted under aha_lists_v1');

const deleted = Lists.deleteList(created.id);
assert.ok(deleted.deletedAt, 'deleteList should set deletedAt');
assert.ok(deleted.updatedAt, 'deleteList should keep updatedAt populated');
storedLists = localStorage.readJson('aha_lists_v1', []);
assert.ok(storedLists[0].deletedAt, 'deleteList tombstone should be saved in localStorage');

localStorage.writeJson('aha_lists_v1', [
  { id: 'list-live', title: 'Live list', items: [{ id: 'item-live', title: 'Live item', source: 'aha_notes', refId: 'note-live' }] },
  { id: 'list-deleted-at', title: 'Deleted list camel', deletedAt: '2026-01-01T00:00:00.000Z', items: [] },
  { id: 'list-deleted-snake', title: 'Deleted list snake', deleted_at: '2026-01-02T00:00:00.000Z', items: [] }
]);
Lists.render();
assert.equal(elements['lists-count'].textContent, '1', 'render should count only active lists');
assert.match(elements['lists-list'].innerHTML, /Live list/, 'render should include active list');
assert.doesNotMatch(elements['lists-list'].innerHTML, /Deleted list camel/, 'render should filter deletedAt lists');
assert.doesNotMatch(elements['lists-list'].innerHTML, /Deleted list snake/, 'render should filter deleted_at lists');

localStorage.writeJson('aha_insight_chamber_v1', { insights: [
  { id: 'insight-live', title: 'Live insight' },
  { id: 'insight-deleted-at', title: 'Deleted insight camel', deletedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'insight-deleted-snake', title: 'Deleted insight snake', deleted_at: '2026-01-02T00:00:00.000Z' }
] });
localStorage.writeJson('aha_notes_v1', [
  { id: 'note-live', title: 'Live note' },
  { id: 'note-deleted-at', title: 'Deleted note camel', deletedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'note-deleted-snake', title: 'Deleted note snake', deleted_at: '2026-01-02T00:00:00.000Z' }
]);
localStorage.writeJson('aha_feed_posts_v1', [
  { id: 'feed-live', text: 'Live feed' },
  { id: 'feed-deleted-at', text: 'Deleted feed camel', deletedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'feed-deleted-snake', text: 'Deleted feed snake', deleted_at: '2026-01-02T00:00:00.000Z' }
]);
localStorage.writeJson('aha_gallery_v1', [
  { id: 'gallery-live', title: 'Live gallery' },
  { id: 'gallery-deleted-at', title: 'Deleted gallery camel', deletedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'gallery-deleted-snake', title: 'Deleted gallery snake', deleted_at: '2026-01-02T00:00:00.000Z' }
]);
localStorage.writeJson('aha_insta_posts_v1', [
  { id: 'insta-live', caption: 'Live insta' },
  { id: 'insta-deleted-at', caption: 'Deleted insta camel', deletedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'insta-deleted-snake', caption: 'Deleted insta snake', deleted_at: '2026-01-02T00:00:00.000Z' }
]);

const availableIds = new Set(Lists.collectAvailableItems().map((item) => `${item.source}::${item.refId}`));
for (const expected of [
  'aha_insights::insight-live',
  'aha_notes::note-live',
  'aha_feed::feed-live',
  'aha_gallery::gallery-live',
  'aha_insta::insta-live'
]) {
  assert.ok(availableIds.has(expected), `${expected} should be available`);
}
for (const deletedId of [
  'aha_insights::insight-deleted-at',
  'aha_insights::insight-deleted-snake',
  'aha_notes::note-deleted-at',
  'aha_notes::note-deleted-snake',
  'aha_feed::feed-deleted-at',
  'aha_feed::feed-deleted-snake',
  'aha_gallery::gallery-deleted-at',
  'aha_gallery::gallery-deleted-snake',
  'aha_insta::insta-deleted-at',
  'aha_insta::insta-deleted-snake'
]) {
  assert.equal(availableIds.has(deletedId), false, `${deletedId} should be filtered`);
}

localStorage.writeJson('aha_lists_v1', [
  { id: 'active-list', title: 'Active list', items: [] },
  { id: 'deleted-at-list', title: 'Deleted at list', deletedAt: '2026-01-01T00:00:00.000Z', items: [] },
  { id: 'deleted-snake-list', title: 'Deleted snake list', deleted_at: '2026-01-02T00:00:00.000Z', items: [] }
]);
assert.ok(Lists.addItemToList('active-list', { title: 'Live note', source: 'aha_notes', refId: 'note-live', type: 'note' }), 'addItemToList should still update active lists');
assert.equal(Lists.addItemToList('deleted-at-list', { title: 'Blocked', source: 'aha_notes', refId: 'note-live', type: 'note' }), null, 'addItemToList should reject deletedAt lists');
assert.equal(Lists.addItemToList('deleted-snake-list', { title: 'Blocked', source: 'aha_notes', refId: 'note-live', type: 'note' }), null, 'addItemToList should reject deleted_at lists');
storedLists = localStorage.readJson('aha_lists_v1', []);
assert.equal(storedLists.find((list) => list.id === 'active-list').items.length, 1, 'active list should receive the item');
assert.equal(storedLists.find((list) => list.id === 'deleted-at-list').items.length, 0, 'deletedAt list should not change');
assert.equal(storedLists.find((list) => list.id === 'deleted-snake-list').items.length, 0, 'deleted_at list should not change');

localStorage.writeJson('aha_lists_v1', [
  { id: 'active-list', title: 'Active list', items: [{ id: 'remove-me', source: 'aha_notes', refId: 'note-live' }] },
  { id: 'deleted-at-list', title: 'Deleted at list', deletedAt: '2026-01-01T00:00:00.000Z', items: [{ id: 'keep-me-at', source: 'aha_notes', refId: 'note-live' }] },
  { id: 'deleted-snake-list', title: 'Deleted snake list', deleted_at: '2026-01-02T00:00:00.000Z', items: [{ id: 'keep-me-snake', source: 'aha_notes', refId: 'note-live' }] }
]);
assert.ok(Lists.removeItemFromList('active-list', 'remove-me'), 'removeItemFromList should still update active lists');
assert.equal(Lists.removeItemFromList('deleted-at-list', 'keep-me-at'), null, 'removeItemFromList should reject deletedAt lists');
assert.equal(Lists.removeItemFromList('deleted-snake-list', 'keep-me-snake'), null, 'removeItemFromList should reject deleted_at lists');
storedLists = localStorage.readJson('aha_lists_v1', []);
assert.equal(storedLists.find((list) => list.id === 'active-list').items.length, 0, 'active list item should be removed');
assert.equal(storedLists.find((list) => list.id === 'deleted-at-list').items.length, 1, 'deletedAt list should not change on remove');
assert.equal(storedLists.find((list) => list.id === 'deleted-snake-list').items.length, 1, 'deleted_at list should not change on remove');

assert.equal(forbiddenCalls.length, 0, 'AHALists should not call AHAIngest or AHASources');

function makeListsContext(repository) {
  const calls = [];
  const storage = makeLocalStorage();
  const testContext = {
    console,
    Date,
    Math,
    JSON,
    localStorage: storage,
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; }
    },
    addEventListener() {},
    AHAIngest: forbiddenApi('AHAIngest', calls),
    AHASources: forbiddenApi('AHASources', calls),
    AHARepository: repository,
    AHAGroups: {
      getActiveGroups() { return []; },
      addReferenceToGroupByObject() { throw new Error('group add should not be invoked by this test'); }
    }
  };
  testContext.window = testContext;
  vm.createContext(testContext);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaContracts.js'), 'utf8'), testContext, { filename: 'js/ahaContracts.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaLists.js'), 'utf8'), testContext, { filename: 'js/ahaLists.js' });
  return { calls, storage, Lists: testContext.AHALists };
}

const persistedLists = [];
const repository = {
  saveList(list) {
    const stored = persistStorage.readJson('aha_lists_v1', []);
    assert.ok(stored.some((storedList) => storedList.id === list.id), 'localStorage should be written before repository saveList');
    persistedLists.push(JSON.parse(JSON.stringify(list)));
    return { ok: true, id: list.id };
  },
  loadLists() {
    throw new Error('AHARepository.loadLists must not be used by AHALists');
  }
};
const { calls: persistForbiddenCalls, storage: persistStorage, Lists: PersistLists } = makeListsContext(repository);

const persistedCreate = PersistLists.createList({ title: 'Repository-backed list', type: 'todo' });
assert.equal(persistStorage.readJson('aha_lists_v1', []).length, 1, 'createList should still write to localStorage when repository exists');
assert.equal(persistedLists.length, 1, 'createList should call AHARepository.saveList when available');
assert.equal(persistedLists[0].id, persistedCreate.id, 'createList should persist the created list');

const persistedUpdate = PersistLists.updateList(persistedCreate.id, { title: 'Oppdatert liste' });
assert.equal(persistedLists.length, 2, 'updateList should call AHARepository.saveList');
assert.equal(persistedLists[1].title, 'Oppdatert liste', 'updateList should persist the updated list');
assert.equal(persistedLists[1].id, persistedUpdate.id, 'updateList should persist the same list id');

const persistedDelete = PersistLists.deleteList(persistedCreate.id);
assert.equal(persistedLists.length, 3, 'deleteList should persist through updateList only once');
assert.ok(persistedDelete.deletedAt, 'deleteList should return a tombstone with deletedAt set');
assert.equal(persistedLists[2].deletedAt, persistedDelete.deletedAt, 'deleteList should persist the tombstone deletedAt');

const itemList = PersistLists.createList({ title: 'Items list', type: 'favorites' });
const addedItem = PersistLists.addItemToList(itemList.id, { title: 'Note ref', source: 'aha_notes', refId: 'note-1', type: 'note' });
assert.equal(persistedLists.length, 5, 'addItemToList should call AHARepository.saveList after the createList save');
assert.equal(persistedLists[4].items.length, 1, 'addItemToList should persist the updated items array');
assert.equal(persistedLists[4].items[0].id, addedItem.id, 'addItemToList should persist the added item');

const removedList = PersistLists.removeItemFromList(itemList.id, addedItem.id);
assert.equal(persistedLists.length, 6, 'removeItemFromList should call AHARepository.saveList');
assert.equal(persistedLists[5].id, removedList.id, 'removeItemFromList should persist the updated list');
assert.equal(persistedLists[5].items.length, 0, 'removeItemFromList should persist the updated items array');
assert.equal(persistForbiddenCalls.length, 0, 'AHALists should not call AHAIngest or AHASources while persisting lists');

const { storage: noRepoStorage, Lists: NoRepoLists } = makeListsContext(undefined);
const noRepoCreated = NoRepoLists.createList({ title: 'Local only list', type: 'todo' });
assert.ok(noRepoCreated?.id, 'createList should work without AHARepository');
assert.equal(noRepoStorage.readJson('aha_lists_v1', []).length, 1, 'createList should persist locally without AHARepository');
assert.ok(NoRepoLists.updateList(noRepoCreated.id, { title: 'Still local' }), 'updateList should work without AHARepository');
assert.ok(NoRepoLists.deleteList(noRepoCreated.id), 'deleteList should work without AHARepository');

const throwingRepository = {
  saveList() {
    throw new Error('repository unavailable');
  },
  loadLists() {
    throw new Error('AHARepository.loadLists must not be used by AHALists');
  }
};
const { storage: throwingStorage, Lists: ThrowingLists } = makeListsContext(throwingRepository);
const throwingCreated = ThrowingLists.createList({ title: 'Throwing repository list', type: 'todo' });
assert.ok(throwingCreated?.id, 'createList should not break when AHARepository.saveList throws');
assert.ok(ThrowingLists.updateList(throwingCreated.id, { title: 'Throwing update' }), 'updateList should not break when AHARepository.saveList throws');
assert.ok(ThrowingLists.deleteList(throwingCreated.id), 'deleteList should not break when AHARepository.saveList throws');
const throwingItemList = ThrowingLists.createList({ title: 'Throwing item list', type: 'favorites' });
const throwingAddedItem = ThrowingLists.addItemToList(throwingItemList.id, { title: 'Note ref', source: 'aha_notes', refId: 'throw-note-1', type: 'note' });
assert.ok(throwingAddedItem, 'addItemToList should not break when AHARepository.saveList throws');
assert.ok(ThrowingLists.removeItemFromList(throwingItemList.id, throwingAddedItem.id), 'removeItemFromList should not break when AHARepository.saveList throws');
assert.equal(throwingStorage.readJson('aha_lists_v1', []).length, 2, 'repository errors should not break localStorage flow');

const ahaListsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaLists.js'), 'utf8');
assert.equal(ahaListsSource.includes('syncFromDatabase'), false, 'AHALists should not define syncFromDatabase');
assert.equal(ahaListsSource.includes('AHARepository.loadLists'), false, 'AHALists should not call AHARepository.loadLists');

console.log('aha-lists-tombstones.test.cjs passed');
