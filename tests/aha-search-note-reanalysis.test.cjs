const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const searchCode = fs.readFileSync('js/ahaSearch.js', 'utf8');

class TestElement {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.innerHTML = '';
    this.listeners = {};
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }
}

function createForbiddenApi(name, calls) {
  return new Proxy({}, {
    get(_target, prop) {
      calls.push(`${name}.${String(prop)}`);
      throw new Error(`AHA Search must stay read-only; attempted to access ${name}.${String(prop)}`);
    }
  });
}

function buildContext() {
  const store = new Map();
  const elements = new Map([
    ['search-query', new TestElement('search-query')],
    ['search-source-filter', new TestElement('search-source-filter')],
    ['search-type-filter', new TestElement('search-type-filter')],
    ['search-refresh', new TestElement('search-refresh')],
    ['search-stats', new TestElement('search-stats')],
    ['search-results', new TestElement('search-results')]
  ]);
  const forbiddenCalls = [];

  const context = {
    window: null,
    console,
    document: {
      addEventListener: () => {},
      getElementById: (id) => elements.get(id) || null
    },
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key)
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
  context.__store = store;
  context.__elements = elements;
  context.__forbiddenCalls = forbiddenCalls;

  vm.createContext(context);
  vm.runInContext(searchCode, context, { filename: 'js/ahaSearch.js' });
  return context;
}

const ctx = buildContext();

ctx.localStorage.setItem('aha_notes_v1', JSON.stringify([
  {
    id: 'old-reanalyzed-note',
    title: 'Gammelt reanalysert notat',
    text: 'Kort notat uten eksplisitt reanalyseord i brødteksten.',
    created_at: '2024-01-01T00:00:00.000Z',
    last_reanalyzed_at: '2026-02-03T04:05:06.000Z'
  },
  {
    id: 'updated-note',
    title: 'Nyere ordinært notat',
    text: 'Ordinært notat.',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z'
  }
]));
ctx.localStorage.setItem('aha_source_events_v1', JSON.stringify([
  {
    id: 'source-event-note-reanalysis',
    source_type: 'note_reanalysis',
    source_app: 'aha_notes',
    text: 'Source event fra Notes reanalysis.',
    created_at: '2024-02-01T00:00:00.000Z'
  }
]));
ctx.localStorage.setItem('aha_paths_v1', JSON.stringify([
  {
    id: 'active-path',
    title: 'Aktiv teststi',
    description: 'Synlig aktiv sti.',
    createdAt: '2024-03-01T00:00:00.000Z'
  },
  {
    id: 'deleted-at-path',
    title: 'Skjult deletedAt-sti',
    deletedAt: '2024-03-02T00:00:00.000Z'
  },
  {
    id: 'deleted-underscore-path',
    title: 'Skjult deleted_at-sti',
    deleted_at: '2024-03-03T00:00:00.000Z'
  }
]));

const collected = ctx.AHASearch.collectSearchItems();
const reanalyzedNote = collected.find((item) => item.id === 'note_old-reanalyzed-note');
assert.ok(reanalyzedNote, 'reanalyzed note should be indexed');
assert.equal(reanalyzedNote.meta.lastReanalyzedAt, '2026-02-03T04:05:06.000Z', 'note search item should expose lastReanalyzedAt metadata');
assert.equal(reanalyzedNote.last_reanalyzed_at, '2026-02-03T04:05:06.000Z', 'note search item should preserve last_reanalyzed_at for date normalization');

const noteReanalysisEvent = collected.find((item) => item.id === 'source_event_source-event-note-reanalysis');
assert.ok(noteReanalysisEvent, 'note_reanalysis source event should still be indexed from aha_source_events_v1');
assert.equal(noteReanalysisEvent.type, 'note_reanalysis', 'source event type should stay source_type');
assert.equal(noteReanalysisEvent.source, 'aha_source_events', 'source event should stay in source-events index');

assert.ok(collected.some((item) => item.id === 'path_active-path'), 'active path should be indexed');
assert.ok(!collected.some((item) => item.id === 'path_deleted-at-path'), 'path with deletedAt should not be indexed');
assert.ok(!collected.some((item) => item.id === 'path_deleted-underscore-path'), 'path with deleted_at should not be indexed');

ctx.AHASearch.refresh();
const sorted = ctx.AHASearch.searchItems('', {});
assert.equal(sorted[0].id, 'note_old-reanalyzed-note', 'last_reanalyzed_at should affect search sorting when updated fields are absent');

const reanalyzeHits = ctx.AHASearch.searchItems('reanalyze', {});
assert.ok(reanalyzeHits.some((item) => item.id === 'note_old-reanalyzed-note'), 'reanalyzed note should be searchable with reanalyze');

const analysertHits = ctx.AHASearch.searchItems('analysert', {});
assert.ok(analysertHits.some((item) => item.id === 'note_old-reanalyzed-note'), 'reanalyzed note should be searchable with analysert');

ctx.__elements.get('search-query').value = 'analysert';
ctx.AHASearch.render();
assert.match(ctx.__elements.get('search-results').innerHTML, /Analysert på nytt: 2026-02-03T04:05:06\.000Z/, 'render should show the last reanalysis timestamp');

assert.deepEqual(ctx.__forbiddenCalls, [], 'AHA Search should not call ingest, source, or repository APIs');

console.log('aha-search-note-reanalysis tests passed');
