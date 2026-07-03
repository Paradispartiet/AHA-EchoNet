const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const instaCode = fs.readFileSync('js/ahaInsta.js', 'utf8');
const searchCode = fs.readFileSync('js/ahaSearch.js', 'utf8');

function makeLocalStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    readJson: (key) => JSON.parse(map.get(key) || 'null'),
    writeJson: (key, value) => map.set(key, JSON.stringify(value))
  };
}

function makeDocument() {
  return {
    readyState: 'loading',
    addEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

function loadInsta() {
  const ingestCalls = [];
  const repositoryCalls = [];
  const shareCalls = [];
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    String,
    Array,
    Set,
    Number,
    localStorage: makeLocalStorage(),
    document: makeDocument(),
    HTMLElement: function HTMLElement() {},
    addEventListener: () => {},
    navigator: {
      share: () => { shareCalls.push('navigator.share'); throw new Error('native share must not be used'); },
      clipboard: { writeText: async () => {} }
    },
    AHA_CONFIG: { insta: { enableDatabaseSync: false } },
    AHARepository: new Proxy({}, {
      get(_target, prop) {
        if (String(prop) === 'then') return undefined;
        return async (...args) => { repositoryCalls.push({ method: String(prop), args }); return { ok: true, data: [] }; };
      }
    }),
    AHAIngest: { ingest: async (payload) => { ingestCalls.push(payload); return { ok: true, sourceEvent: { id: `source-${ingestCalls.length}` } }; } },
    AHAContracts: { createBaseItem: (input) => ({ id: input.id, type: input.type, source: input.source, meta: input.meta }) }
  };
  sandbox.window = sandbox;
  sandbox.__ingestCalls = ingestCalls;
  sandbox.__repositoryCalls = repositoryCalls;
  sandbox.__shareCalls = shareCalls;
  vm.createContext(sandbox);
  vm.runInContext(instaCode, sandbox, { filename: 'js/ahaInsta.js' });
  return sandbox;
}

function loadSearch(localStorage) {
  const sandbox = {
    console,
    Date,
    JSON,
    localStorage,
    document: makeDocument(),
    addEventListener: () => {},
    HTMLElement: function HTMLElement() {},
    AHAContracts: {
      normalizeTags: (tags) => Array.isArray(tags) ? tags.map(String).filter(Boolean) : [],
      normalizeBaseItem: (item, defaults) => ({
        id: item.id,
        title: item.title || '',
        type: defaults.type,
        source: defaults.source,
        createdAt: item.created_at || '2026-01-01T00:00:00.000Z',
        updatedAt: item.updated_at || item.created_at || '2026-01-01T00:00:00.000Z',
        tags: item.tags || [],
        meta: item.meta || {}
      })
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(searchCode, sandbox, { filename: 'js/ahaSearch.js' });
  return sandbox;
}

(async () => {
  const ctx = loadInsta();
  const Insta = ctx.AHAInsta;
  assert.ok(Insta, 'AHAInsta should be exported');
  assert.equal(typeof Insta.syncFromDatabase, 'function', 'syncFromDatabase should remain explicitly exported');
  assert.equal(typeof Insta.syncSocialFromDatabase, 'function', 'syncSocialFromDatabase should remain explicitly exported');
  assert.deepEqual(ctx.__repositoryCalls, [], 'syncFromDatabase and syncSocialFromDatabase must not auto-run at init');

  const mediaOnly = await Insta.addPost({ src: 'local-only.jpg' });
  assert.ok(mediaOnly, 'media-only post should still be saved locally');
  assert.equal(ctx.localStorage.readJson('aha_insta_posts_v1').length, 1, 'media-only post should be in local storage');
  assert.equal(ctx.__ingestCalls.length, 0, 'media-only post without title/caption/note should not be ingested');

  const captioned = await Insta.addPost({ src: 'captioned.jpg', caption: 'Lokal caption' });
  assert.ok(captioned, 'captioned post should be saved');
  assert.equal(ctx.__ingestCalls.length, 1, 'captioned post should be sent to AHAIngest');
  assert.equal(ctx.__ingestCalls[0].source_type, 'aha_insta_post');
  assert.equal(ctx.__ingestCalls[0].meta.local_only, true);
  assert.equal(ctx.__ingestCalls[0].meta.published_external, false);
  assert.equal(ctx.__ingestCalls[0].meta.echonet_shared, false);

  const beforePreviewIngest = ctx.__ingestCalls.length;
  const beforePreviewRepo = ctx.__repositoryCalls.length;
  const file = { name: 'posts.json', type: 'application/json', text: async () => JSON.stringify({ posts: [{ id: 'ig1', uri: 'ig.jpg', caption: 'IG caption', timestamp: 1700000000 }] }) };
  const previewResult = await Insta.parseInstagramExport([file]);
  assert.equal(previewResult.items.length, 1, 'import-preview should parse items');
  assert.equal(ctx.__ingestCalls.length, beforePreviewIngest, 'import-preview should not write to AHAIngest');
  assert.equal(ctx.__repositoryCalls.length, beforePreviewRepo, 'import-preview should not write to database');

  await Insta.completeInstagramImport({ selectedIds: [previewResult.items[0].id], connectIngest: false, sessionId: previewResult.sessionId });
  assert.equal(ctx.__ingestCalls.length, beforePreviewIngest, 'completed import without connectIngest should not write to AHAIngest');

  const file2 = { name: 'posts2.json', type: 'application/json', text: async () => JSON.stringify({ posts: [
    { id: 'ig2', uri: 'text.jpg', caption: 'Import caption', timestamp: 1700000001 },
    { id: 'ig3', uri: 'media-only.jpg', timestamp: 1700000002 }
  ] }) };
  const previewResult2 = await Insta.parseInstagramExport([file2]);
  await Insta.completeInstagramImport({ selectedIds: previewResult2.items.map((item) => item.id), connectIngest: true, sessionId: previewResult2.sessionId });
  const importCalls = ctx.__ingestCalls.slice(beforePreviewIngest);
  assert.equal(importCalls.length, 1, 'completed import with connectIngest should only ingest captions/title');
  assert.equal(importCalls[0].source_type, 'aha_insta_imported_post');
  assert.equal(importCalls[0].meta.local_only, true);
  assert.equal(importCalls[0].meta.import_session_id, previewResult2.sessionId);

  await Insta.copyPostText(captioned.id);
  assert.deepEqual(ctx.__shareCalls, [], 'native navigator.share should not be used');

  ctx.localStorage.writeJson('aha_insta_posts_v1', [
    { id: 'insta-live', title: 'Synlig Insta', caption: 'vis meg', created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'insta-deleted', title: 'Skjult Insta', caption: 'skjul meg', deleted_at: '2026-01-02T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z' }
  ]);
  const search = loadSearch(ctx.localStorage);
  const ids = new Set(search.AHASearch.collectSearchItems().map((item) => item.id));
  assert.equal(ids.has('insta_insta-live'), true, 'active Insta post should be searchable');
  assert.equal(ids.has('insta_insta-deleted'), false, 'tombstoned Insta post should not be searchable');

  console.log('aha-insta local-only boundary tests passed');
})();
