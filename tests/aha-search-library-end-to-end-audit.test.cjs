const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function storage(seed = {}) {
  const map = new Map(Object.entries(seed).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
  const reads = [];
  return {
    reads,
    getItem(key) {
      reads.push(key);
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key) { throw new Error(`Search/Library must stay read-only; attempted write ${key}`); },
    removeItem(key) { throw new Error(`Search/Library must stay read-only; attempted remove ${key}`); },
    clear() { throw new Error('Search/Library must stay read-only; attempted clear'); }
  };
}

function load(file, context) {
  context.module = { exports: {} };
  context.exports = context.module.exports;
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  return context.module.exports;
}

const localStorage = storage({
  aha_notes_v1: [
    {
      id: 'note_active',
      title: 'Aktivt AHA-notat',
      text: 'Dette er et søkbart lokalt notat om kunnskapsarbeid.',
      created_at: '2026-08-01T10:00:00.000Z',
      last_reanalyzed_at: '2026-08-11T10:00:00.000Z'
    },
    {
      id: 'note_deleted',
      title: 'Skal aldri vises',
      text: 'Tombstoned note body',
      deleted_at: '2026-08-10T10:00:00.000Z'
    }
  ],
  aha_paths_v1: [
    {
      id: 'path_active',
      title: 'Aktiv sti',
      description: 'En lokal læringssti.',
      createdAt: '2026-08-09T10:00:00.000Z'
    },
    {
      id: 'path_deleted',
      title: 'Slettet sti',
      deletedAt: '2026-08-10T11:00:00.000Z'
    }
  ],
  aha_music_library_v1: {
    tracks: [{
      id: 'track_safe',
      title: 'Trygg sang',
      artist: 'Trygg artist',
      token: 'DO_NOT_LEAK_MUSIC_TOKEN',
      updatedAt: '2026-08-08T10:00:00.000Z'
    }],
    artists: [],
    albums: [],
    playlists: []
  },
  aha_training_corpus_v1: [
    {
      id: 'corpus_active',
      title: 'Godkjent kunnskapsgrunnlag',
      text: 'Lokalt review-materiale for Personal AI.',
      status: 'approved',
      apiKey: 'DO_NOT_LEAK_API_KEY',
      updatedAt: '2026-08-07T10:00:00.000Z'
    }
  ],
  aha_personal_answer_evaluations_v1: [
    {
      id: 'eval_active',
      query: 'Hvordan bruker AHA materialet mitt?',
      summary: 'Personlig grunnlag ble brukt.',
      score: 91,
      updatedAt: '2026-08-06T10:00:00.000Z'
    }
  ],
  aha_music_spotify_token_v1: {
    access_token: 'RAW_SPOTIFY_SECRET',
    refresh_token: 'RAW_REFRESH_SECRET',
    pkce: 'RAW_PKCE_SECRET'
  }
});

const context = {
  console,
  Date,
  JSON,
  Math,
  Number,
  String,
  Array,
  Object,
  Set,
  Map,
  localStorage,
  document: {
    readyState: 'loading',
    addEventListener() {},
    getElementById() { return null; },
    querySelectorAll() { return []; }
  },
  HTMLElement: function HTMLElement() {}
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

load('js/ahaSearch.js', context);
const library = load('js/ahaSearchLibraryExperience.js', context);

assert.ok(context.AHASearch, 'canonical Search must load');
assert.ok(context.AHASearchLibraryExperience, 'Library experience must load');

const items = context.AHASearch.collectSearchItems();
assert.ok(items.length >= 5, 'real storage should produce a multi-source Search index');
assert.ok(items.every((item) => item.local_only === true && item.read_only === true), 'canonical Search items must stay local/read-only');

const ids = new Set(items.map((item) => item.id));
assert.ok(ids.has('note_note_active'), 'active note should be searchable');
assert.ok(ids.has('path_path_active'), 'active path should be searchable');
assert.ok(!ids.has('note_note_deleted'), 'deleted_at note must be filtered before Library');
assert.ok(!ids.has('path_path_deleted'), 'deletedAt path must be filtered before Library');

const json = JSON.stringify(items);
for (const secret of ['DO_NOT_LEAK_MUSIC_TOKEN', 'DO_NOT_LEAK_API_KEY', 'RAW_SPOTIFY_SECRET', 'RAW_REFRESH_SECRET', 'RAW_PKCE_SECRET']) {
  assert.equal(json.includes(secret), false, `secret leaked into Search index: ${secret}`);
}
assert.equal(localStorage.reads.includes('aha_music_spotify_token_v1'), false, 'Search must never read secret token storage');

const model = library.buildLibraryModel(items);
assert.equal(model.total, items.length, 'Library must derive from the exact canonical Search items');
assert.equal(model.recent[0].id, 'note_note_active', 'last_reanalyzed_at must drive Library recency');
assert.ok(model.groups.find((group) => group.id === 'thoughts')?.items.some((item) => item.id === 'note_note_active'));
assert.ok(model.groups.find((group) => group.id === 'collections')?.items.some((item) => item.id === 'path_path_active'));
assert.ok(model.groups.find((group) => group.id === 'media')?.items.some((item) => item.source === 'aha_music_library'));
assert.ok(model.groups.find((group) => group.id === 'knowledge')?.items.some((item) => item.source === 'aha_training_corpus'));
assert.ok(model.groups.find((group) => group.id === 'personal_ai')?.items.some((item) => item.source === 'aha_personal_answer_evaluations'));

context.AHASearch.refresh();
const searchHits = context.AHASearch.searchItems('kunnskapsarbeid', {});
assert.ok(searchHits.some((item) => item.id === 'note_note_active'), 'active note must be retrievable through canonical Search');
assert.ok(searchHits.every((item) => !String(item.id).includes('deleted')), 'tombstones must stay absent from active Search results');

assert.equal(library.humanizeSearchMetaText('note · aha_notes'), 'Notat · Notater');
assert.equal(library.humanizeSearchMetaText('personal_answer_evaluation · aha_personal_answer_evaluations'), 'Svar-evaluering · Svar-evalueringer');
assert.equal(library.humanizeSearchMetaText('note_reanalysis · aha_source_events'), 'Reanalyse · Analysespor');

const adapterSource = fs.readFileSync('js/ahaSearchLibraryExperience.js', 'utf8');
for (const forbidden of ['localStorage.setItem', 'localStorage.removeItem', 'fetch(', 'AHARepository', 'Supabase', 'AHASyncHub', 'AHAIngest']) {
  assert.equal(adapterSource.includes(forbidden), false, `Library adapter must not introduce ${forbidden}`);
}

console.log('aha-search-library end-to-end audit passed');
