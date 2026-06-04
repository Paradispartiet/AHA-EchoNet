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
assert.equal(/AHARepository\s*\.\s*loadArticles/.test(avisaCode), false, 'AHAAvisa should not call AHARepository.loadArticles');
assert.equal(/syncFromDatabase/.test(avisaCode), false, 'AHAAvisa should not define syncFromDatabase');
assert.ok(avisaCode.includes('addReferenceToGroupByObject'), 'existing Groups linking path should remain present');
assert.ok(avisaCode.includes('published_local'), 'published_local should remain a local status value');
assert.ok(avisaCode.includes('public_candidate'), 'public_candidate should remain a local candidate marker');
assert.equal(/AHAIngest|AHASources/.test(avisaCode), false, 'AHAAvisa should not reference AHAIngest or AHASources');

console.log('aha-avisa-repository-persistence.test.cjs passed');
