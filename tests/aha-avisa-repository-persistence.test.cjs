const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const avisaCode = fs.readFileSync('js/ahaAvisa.js', 'utf8');

function createLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    readJson: (key, fallback = null) => (store.has(key) ? JSON.parse(store.get(key)) : fallback)
  };
}

function forbiddenApi(name, calls) {
  return new Proxy({}, {
    get(_target, prop) {
      calls.push(`${name}.${String(prop)}`);
      throw new Error(`Unexpected ${name}.${String(prop)} access`);
    }
  });
}

function buildContext(repository) {
  const forbiddenCalls = [];
  const context = {
    window: null,
    console,
    document: {
      addEventListener() {},
      getElementById() { return null; },
      querySelectorAll() { return []; }
    },
    localStorage: createLocalStorage(),
    AHAContracts: {
      normalizeTags(tags) {
        if (Array.isArray(tags)) return tags.filter(Boolean);
        return String(tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
      }
    },
    AHAIngest: forbiddenApi('AHAIngest', forbiddenCalls),
    AHASources: forbiddenApi('AHASources', forbiddenCalls),
    AHAGroups: {
      addReferenceToGroupByObject() {
        forbiddenCalls.push('AHAGroups.addReferenceToGroupByObject');
        return true;
      }
    },
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Set,
    CSS: { escape: (value) => String(value) },
    HTMLElement: function HTMLElement() {},
    HTMLSelectElement: function HTMLSelectElement() {}
  };
  if (repository !== undefined) context.AHARepository = repository;
  context.window = context;
  context.__forbiddenCalls = forbiddenCalls;
  vm.createContext(context);
  vm.runInContext(avisaCode, context, { filename: 'js/ahaAvisa.js' });
  return context;
}

function createRepository(calls, saveArticle = async (article) => ({ ok: true, article })) {
  return {
    saveArticle(article) {
      calls.push(JSON.parse(JSON.stringify(article)));
      return saveArticle(article);
    },
    get loadArticles() {
      throw new Error('AHARepository.loadArticles must not be used by AHAAvisa push-on-write');
    }
  };
}

function assertStored(context, expectedLength) {
  const articles = context.localStorage.readJson('aha_articles_v1', []);
  assert.equal(articles.length, expectedLength, 'articles should be stored in localStorage first/fallback');
  return articles;
}

const calls = [];
const context = buildContext(createRepository(calls));
const api = context.AHAAvisa;

const created = api.createArticle({ title: 'Lokal artikkel', section: 'aha', summary: 'Lagres lokalt' });
assert.ok(created, 'createArticle should return the created article');
assert.equal(assertStored(context, 1)[0].id, created.id, 'createArticle should save the article to localStorage');
assert.equal(calls.length, 1, 'createArticle should call AHARepository.saveArticle when available');
assert.equal(calls[0].id, created.id, 'createArticle should persist the created article');

calls.length = 0;
const updated = api.updateArticle(created.id, { body: 'Oppdatert brødtekst' });
assert.equal(updated.body, 'Oppdatert brødtekst', 'updateArticle should return the updated article');
assert.equal(assertStored(context, 1)[0].body, 'Oppdatert brødtekst', 'updateArticle should save to localStorage');
assert.equal(calls.length, 1, 'updateArticle should call AHARepository.saveArticle once');
assert.equal(calls[0].body, 'Oppdatert brødtekst', 'updateArticle should persist the updated article');

calls.length = 0;
const status = api.setArticleStatus(created.id, 'review');
assert.equal(status.status, 'review', 'setArticleStatus should return the updated status article');
assert.equal(calls.length, 1, 'setArticleStatus should persist through updateArticle without an extra write');
assert.equal(calls[0].status, 'review', 'setArticleStatus should persist the normalized status');

calls.length = 0;
const layered = api.setArticlePublicationLayer(created.id, 'public_candidate');
assert.equal(layered.publicationLayer, 'public_candidate', 'setArticlePublicationLayer should keep public_candidate as a local marker');
assert.equal(assertStored(context, 1)[0].publicationLayer, 'public_candidate', 'setArticlePublicationLayer should save locally');
assert.equal(calls.length, 1, 'setArticlePublicationLayer should call AHARepository.saveArticle once');
assert.equal(calls[0].publicationLayer, 'public_candidate', 'setArticlePublicationLayer should persist the updated publicationLayer');

calls.length = 0;
const ref = api.addReferenceToArticle(created.id, { title: 'Notat', type: 'note', source: 'aha_notes', refId: 'note-1' });
assert.ok(ref, 'addReferenceToArticle should return the new reference');
assert.equal(assertStored(context, 1)[0].references.length, 1, 'addReferenceToArticle should store the updated references locally');
assert.equal(calls.length, 1, 'addReferenceToArticle should call AHARepository.saveArticle once');
assert.deepEqual(calls[0].references.map((item) => item.refId), ['note-1'], 'addReferenceToArticle should persist the updated references array');

calls.length = 0;
const duplicate = api.addReferenceToArticle(created.id, { title: 'Notat duplikat', type: 'note', source: 'aha_notes', refId: 'note-1' });
assert.equal(duplicate.id, created.id, 'duplicate addReferenceToArticle should return the unchanged article');
assert.equal(calls.length, 0, 'duplicate addReferenceToArticle should not perform an extra repository write');

calls.length = 0;
const withoutRef = api.removeReferenceFromArticle(created.id, ref.id);
assert.ok(withoutRef, 'removeReferenceFromArticle should return the updated article');
assert.equal(assertStored(context, 1)[0].references.length, 0, 'removeReferenceFromArticle should save the updated references locally');
assert.equal(calls.length, 1, 'removeReferenceFromArticle should call AHARepository.saveArticle once');
assert.deepEqual(calls[0].references, [], 'removeReferenceFromArticle should persist the updated references array');

calls.length = 0;
const deleted = api.deleteArticle(created.id);
assert.ok(deleted.deletedAt, 'deleteArticle should set deletedAt tombstone');
assert.equal(assertStored(context, 1)[0].deletedAt, deleted.deletedAt, 'deleteArticle should store the tombstone locally');
assert.equal(calls.length, 1, 'deleteArticle should persist through updateArticle without an extra write');
assert.equal(calls[0].deletedAt, deleted.deletedAt, 'deleteArticle should persist the deletedAt tombstone');

const noRepository = buildContext(undefined);
const localOnly = noRepository.AHAAvisa.createArticle({ title: 'Kun lokal' });
assert.ok(localOnly, 'createArticle should work without AHARepository');
assert.equal(assertStored(noRepository, 1)[0].title, 'Kun lokal', 'AHAAvisa should remain localStorage-first without AHARepository');

const throwing = buildContext(createRepository([], () => { throw new Error('repository unavailable'); }));
const throwingArticle = throwing.AHAAvisa.createArticle({ title: 'Feil tåles' });
assert.doesNotThrow(() => throwing.AHAAvisa.updateArticle(throwingArticle.id, { body: 'fortsatt lokal' }), 'updateArticle should not throw when AHARepository.saveArticle throws');
assert.doesNotThrow(() => throwing.AHAAvisa.setArticleStatus(throwingArticle.id, 'ready'), 'setArticleStatus should not throw when AHARepository.saveArticle throws');
assert.doesNotThrow(() => throwing.AHAAvisa.setArticlePublicationLayer(throwingArticle.id, 'group'), 'setArticlePublicationLayer should not throw when AHARepository.saveArticle throws');
const throwingRef = throwing.AHAAvisa.addReferenceToArticle(throwingArticle.id, { source: 'aha_notes', refId: 'note-2', title: 'Ref' });
assert.doesNotThrow(() => throwing.AHAAvisa.removeReferenceFromArticle(throwingArticle.id, throwingRef.id), 'removeReferenceFromArticle should not throw when AHARepository.saveArticle throws');
assert.doesNotThrow(() => throwing.AHAAvisa.deleteArticle(throwingArticle.id), 'deleteArticle should not throw when AHARepository.saveArticle throws');
assert.equal(assertStored(throwing, 1)[0].deletedAt.length > 0, true, 'localStorage flow should survive repository errors');

assert.deepEqual(context.__forbiddenCalls, [], 'AHAAvisa write persistence should not call AHAIngest, AHASources, or Groups');
assert.deepEqual(noRepository.__forbiddenCalls, [], 'local-only AHAAvisa should not call AHAIngest, AHASources, or Groups');
assert.deepEqual(throwing.__forbiddenCalls, [], 'repository-error AHAAvisa should not call AHAIngest, AHASources, or Groups');
assert.equal(/AHARepository\s*\?\.\s*loadArticles/.test(avisaCode), true, 'AHAAvisa syncFromDatabase should call AHARepository.loadArticles');
assert.equal(/syncFromDatabase/.test(avisaCode), true, 'AHAAvisa should define syncFromDatabase');
assert.ok(avisaCode.includes('addReferenceToGroupByObject'), 'existing Groups linking path should remain present');
assert.ok(avisaCode.includes('published_local'), 'published_local should remain a local status value');
assert.ok(avisaCode.includes('public_candidate'), 'public_candidate should remain a local candidate marker');
assert.equal(/AHAIngest|AHASources/.test(avisaCode), false, 'AHAAvisa should not reference AHAIngest or AHASources');


function createSyncRepository({ remote = [], onSave, onLoad, loadResult, saveArticle } = {}) {
  const events = [];
  const saves = [];
  const repository = {
    events,
    saves,
    saveArticle(article) {
      events.push(`save:${article.id}`);
      saves.push(JSON.parse(JSON.stringify(article)));
      if (onSave) return onSave(article, events);
      if (saveArticle) return saveArticle(article, events);
      return Promise.resolve({ ok: true, article });
    },
    loadArticles() {
      events.push('load');
      if (onLoad) return onLoad(events);
      if (loadResult) return loadResult;
      return Promise.resolve({ ok: true, data: remote });
    }
  };
  return repository;
}

function seedArticles(context, articles) {
  context.localStorage.setItem('aha_articles_v1', JSON.stringify(articles));
}

(async () => {
  const syncRepository = createSyncRepository({
    remote: [
      {
        id: 'remote-newer',
        title: 'Nyere remote',
        section: 'nyheter',
        status: 'ready',
        summary: 'remote summary',
        body: 'remote body',
        tags: ['remote'],
        references: [{ id: 'r1', title: 'Remote ref', type: 'note', source: 'aha_notes', ref_id: 'note-remote', added_at: '2026-01-03T00:00:00.000Z' }],
        source: 'aha_avisa',
        publication_layer: 'public_candidate',
        meta: { remote: true },
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-04T00:00:00.000Z',
        deleted_at: ''
      },
      {
        id: 'local-tombstone',
        title: 'Eldre remote aktiv',
        section: 'kultur',
        status: 'draft',
        publication_layer: 'personal',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
        deleted_at: ''
      },
      {
        id: 'equal-time',
        title: 'Remote vinner lik tid',
        section: 'aha',
        status: 'review',
        publication_layer: 'group',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-05T00:00:00.000Z',
        deleted_at: ''
      }
    ]
  });
  const syncContext = buildContext(syncRepository);
  assert.equal(typeof syncContext.AHAAvisa.syncFromDatabase, 'function', 'AHAAvisa.syncFromDatabase should be exported');
  assert.deepEqual(syncRepository.events, [], 'syncFromDatabase should not auto-run during init/bind');
  seedArticles(syncContext, [
    {
      id: 'local-tombstone',
      title: 'Nyere lokal tombstone',
      section: 'kultur',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
      deletedAt: '2026-01-06T00:00:00.000Z',
      publicationLayer: 'personal',
      references: []
    },
    {
      id: 'remote-newer',
      title: 'Eldre lokal',
      section: 'nyheter',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      deletedAt: '',
      publicationLayer: 'personal',
      references: []
    },
    {
      id: 'equal-time',
      title: 'Lokal lik tid',
      section: 'aha',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-05T00:00:00.000Z',
      deletedAt: '',
      publicationLayer: 'personal',
      references: []
    }
  ]);

  const syncResult = await syncContext.AHAAvisa.syncFromDatabase();
  assert.equal(syncResult.ok, true, 'syncFromDatabase should return the repository ok result');
  assert.equal(syncResult.merged, true, 'syncFromDatabase should mark successful merges');
  assert.deepEqual(syncRepository.events, ['save:local-tombstone', 'save:remote-newer', 'save:equal-time', 'load'], 'syncFromDatabase should push every local article before remote pull');
  assert.equal(syncRepository.saves.some((article) => article.id === 'local-tombstone' && article.deletedAt), true, 'syncFromDatabase should push local tombstones before pull');

  const merged = assertStored(syncContext, 3);
  const remoteNewer = merged.find((article) => article.id === 'remote-newer');
  assert.equal(remoteNewer.title, 'Nyere remote', 'newer remote article should win over older local article');
  assert.equal(remoteNewer.createdAt, '2026-01-01T00:00:00.000Z', 'remote created_at should normalize to createdAt');
  assert.equal(remoteNewer.updatedAt, '2026-01-04T00:00:00.000Z', 'remote updated_at should normalize to updatedAt');
  assert.equal(remoteNewer.deletedAt, '', 'remote deleted_at should normalize to deletedAt');
  assert.equal(remoteNewer.publicationLayer, 'public_candidate', 'remote publication_layer should normalize to publicationLayer');
  assert.equal(remoteNewer.references[0].refId, 'note-remote', 'remote reference ref_id should normalize to refId');
  assert.equal(remoteNewer.references[0].addedAt, '2026-01-03T00:00:00.000Z', 'remote reference added_at should normalize to addedAt');

  const tombstone = merged.find((article) => article.id === 'local-tombstone');
  assert.equal(tombstone.title, 'Nyere lokal tombstone', 'newer local tombstone should win over older active remote article');
  assert.equal(tombstone.deletedAt, '2026-01-06T00:00:00.000Z', 'deletedAt should count as the latest action time');

  const equalTime = merged.find((article) => article.id === 'equal-time');
  assert.equal(equalTime.title, 'Remote vinner lik tid', 'remote article should win on equal action time');

  const invalidRepository = createSyncRepository({ loadResult: Promise.resolve({ ok: true, data: { invalid: true } }) });
  const invalidContext = buildContext(invalidRepository);
  seedArticles(invalidContext, [{ id: 'local-only', title: 'Behold lokal', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]);
  const invalidResult = await invalidContext.AHAAvisa.syncFromDatabase();
  assert.equal(invalidResult.ok, false, 'invalid remote payload should return a failed fallback result');
  assert.equal(invalidResult.fallback, 'localStorage', 'invalid remote payload should fall back to localStorage');
  assert.equal(assertStored(invalidContext, 1)[0].title, 'Behold lokal', 'invalid remote payload should not delete local data');

  const missingRepository = buildContext({ saveArticle: async () => ({ ok: true }) });
  seedArticles(missingRepository, [{ id: 'missing-load', title: 'Mangler load', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]);
  const missingResult = await missingRepository.AHAAvisa.syncFromDatabase();
  assert.equal(missingResult.ok, false, 'missing AHARepository.loadArticles should return fallback result');
  assert.equal(missingResult.fallback, 'localStorage', 'missing AHARepository.loadArticles should fall back to localStorage');
  assert.equal(assertStored(missingRepository, 1)[0].title, 'Mangler load', 'missing loadArticles should keep local data');

  const loadErrorRepository = createSyncRepository({ onLoad: () => { throw new Error('load failed'); } });
  const loadErrorContext = buildContext(loadErrorRepository);
  seedArticles(loadErrorContext, [{ id: 'load-error', title: 'Load feil lokal', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]);
  const loadErrorResult = await loadErrorContext.AHAAvisa.syncFromDatabase();
  assert.equal(loadErrorResult.ok, false, 'repository load errors should return fallback result');
  assert.equal(loadErrorResult.fallback, 'localStorage', 'repository load errors should fall back to localStorage');
  assert.equal(assertStored(loadErrorContext, 1)[0].title, 'Load feil lokal', 'repository load errors should keep local data');

  const saveErrorRepository = createSyncRepository({
    remote: [{ id: 'after-save-error', title: 'Remote etter save-feil', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-03T00:00:00.000Z' }],
    saveArticle: () => { throw new Error('save failed'); }
  });
  const saveErrorContext = buildContext(saveErrorRepository);
  seedArticles(saveErrorContext, [{ id: 'save-error-local', title: 'Save feil lokal', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }]);
  const saveErrorResult = await saveErrorContext.AHAAvisa.syncFromDatabase();
  assert.equal(saveErrorResult.ok, true, 'repository save errors should not break remote pull and merge');
  assert.equal(assertStored(saveErrorContext, 2).some((article) => article.id === 'save-error-local'), true, 'repository save errors should keep local data');

  assert.deepEqual(syncContext.__forbiddenCalls, [], 'syncFromDatabase should not call AHAIngest, AHASources, or Groups');
  assert.deepEqual(invalidContext.__forbiddenCalls, [], 'invalid sync fallback should not call AHAIngest, AHASources, or Groups');
  assert.deepEqual(missingRepository.__forbiddenCalls, [], 'missing repository sync fallback should not call AHAIngest, AHASources, or Groups');
  assert.deepEqual(loadErrorContext.__forbiddenCalls, [], 'repository load-error sync should not call AHAIngest, AHASources, or Groups');
  assert.deepEqual(saveErrorContext.__forbiddenCalls, [], 'repository save-error sync should not call AHAIngest, AHASources, or Groups');
  assert.equal(/AHAIngest|AHASources/.test(avisaCode), false, 'AHAAvisa sync should not reference AHAIngest or AHASources');
  assert.equal(/publishArticle|externalPublish|publishTo/i.test(avisaCode), false, 'syncFromDatabase should not introduce external publishing calls');
  assert.ok(avisaCode.includes('published_local'), 'published_local should remain a local status value after sync addition');
  assert.ok(avisaCode.includes('public_candidate'), 'public_candidate should remain a local candidate marker after sync addition');

  console.log('aha-avisa-repository-persistence.test.cjs passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
