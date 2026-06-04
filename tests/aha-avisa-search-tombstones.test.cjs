const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const avisaCode = fs.readFileSync('js/ahaAvisa.js', 'utf8');
const searchCode = fs.readFileSync('js/ahaSearch.js', 'utf8');

function createLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    writeJson: (key, value) => store.set(key, JSON.stringify(value))
  };
}

function createForbiddenApi(name, calls) {
  return new Proxy({}, {
    get(_target, prop) {
      calls.push(`${name}.${String(prop)}`);
      throw new Error(`Unexpected ${name}.${String(prop)} access`);
    }
  });
}

function buildContext(code, filename) {
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
        return Array.isArray(tags) ? tags.filter(Boolean) : [];
      }
    },
    AHAIngest: createForbiddenApi('AHAIngest', forbiddenCalls),
    AHASources: createForbiddenApi('AHASources', forbiddenCalls),
    AHARepository: createForbiddenApi('AHARepository', forbiddenCalls),
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Set
  };
  context.window = context;
  context.__forbiddenCalls = forbiddenCalls;
  vm.createContext(context);
  vm.runInContext(code, context, { filename });
  return context;
}

const avisa = buildContext(avisaCode, 'js/ahaAvisa.js');
avisa.localStorage.writeJson('aha_insight_chamber_v1', { insights: [
  { id: 'insight-active', title: 'Aktiv innsikt' },
  { id: 'insight-deleted-at', title: 'Skjult innsikt deletedAt', deletedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'insight-deleted-snake', title: 'Skjult innsikt deleted_at', deleted_at: '2026-01-02T00:00:00.000Z' }
] });
avisa.localStorage.writeJson('aha_lists_v1', [
  { id: 'list-active', title: 'Aktiv liste' },
  { id: 'list-deleted-snake', title: 'Skjult liste deleted_at', deleted_at: '2026-01-03T00:00:00.000Z' }
]);
avisa.localStorage.writeJson('aha_paths_v1', [
  { id: 'path-active', title: 'Aktiv sti' },
  { id: 'path-deleted-snake', title: 'Skjult sti deleted_at', deleted_at: '2026-01-04T00:00:00.000Z' }
]);
avisa.localStorage.writeJson('aha_notes_v1', [
  { id: 'note-active', title: 'Aktivt notat' },
  { id: 'note-deleted-at', title: 'Skjult notat deletedAt', deletedAt: '2026-01-05T00:00:00.000Z' }
]);

const sourceIds = new Set(avisa.AHAAvisa.collectAvailableArticleSources().map((source) => `${source.source}::${source.refId}`));
for (const expected of [
  'aha_insights::insight-active',
  'aha_lists::list-active',
  'aha_paths::path-active',
  'aha_notes::note-active'
]) {
  assert.ok(sourceIds.has(expected), `${expected} should remain available as an article source`);
}
for (const deleted of [
  'aha_insights::insight-deleted-at',
  'aha_insights::insight-deleted-snake',
  'aha_lists::list-deleted-snake',
  'aha_paths::path-deleted-snake',
  'aha_notes::note-deleted-at'
]) {
  assert.equal(sourceIds.has(deleted), false, `${deleted} should be filtered from article sources`);
}

const search = buildContext(searchCode, 'js/ahaSearch.js');
search.localStorage.writeJson('aha_articles_v1', [
  { id: 'article-active', title: 'Aktiv artikkel', summary: 'Synlig artikkel' },
  { id: 'article-deleted-at', title: 'Skjult artikkel deletedAt', deletedAt: '2026-01-06T00:00:00.000Z' },
  { id: 'article-deleted-snake', title: 'Skjult artikkel deleted_at', deleted_at: '2026-01-07T00:00:00.000Z' }
]);
const searchIds = new Set(search.AHASearch.collectSearchItems().map((item) => item.id));
assert.ok(searchIds.has('article_article-active'), 'active article should remain searchable');
assert.equal(searchIds.has('article_article-deleted-at'), false, 'article with deletedAt should not be searchable');
assert.equal(searchIds.has('article_article-deleted-snake'), false, 'article with deleted_at should not be searchable');

assert.deepEqual(avisa.__forbiddenCalls, [], 'AHAAvisa should not call ingest, sources, or repository APIs');
assert.deepEqual(search.__forbiddenCalls, [], 'AHASearch should not call ingest, sources, or repository APIs');

console.log('aha-avisa-search-tombstones tests passed');
