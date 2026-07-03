const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function makeLocalStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    writeJson: (key, value) => map.set(key, JSON.stringify(value)),
    readJson: (key) => JSON.parse(map.get(key) || 'null')
  };
}

function makeDocument() {
  return {
    readyState: 'loading',
    getElementById: () => null,
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

function loadGallery(extra = {}) {
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    localStorage: makeLocalStorage(),
    document: makeDocument(),
    addEventListener: () => {},
    dispatchEvent: () => {},
    CustomEvent: function CustomEvent(type, init) { return { type, detail: init && init.detail }; },
    HTMLElement: function HTMLElement() {},
    AHAContracts: {
      createBaseItem: (input) => ({ id: input.id, type: input.type, source: input.source, tags: input.tags, meta: input.meta })
    },
    ...extra
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('js/ahaGallery.js', 'utf8'), sandbox, { filename: 'js/ahaGallery.js' });
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
  vm.runInContext(fs.readFileSync('js/ahaSearch.js', 'utf8'), sandbox, { filename: 'js/ahaSearch.js' });
  return sandbox;
}

(async () => {
  const ingestCalls = [];
  let fetchCalled = false;
  let repoCalled = false;
  const ctx = loadGallery({
    fetch: () => { fetchCalled = true; throw new Error('fetch should not be called'); },
    AHARepository: {
      saveGalleryItem: async () => { repoCalled = true; return { ok: true }; },
      loadGalleryItems: async () => { repoCalled = true; return { ok: true, data: [] }; }
    },
    AHAIngest: { ingest: async (payload) => { ingestCalls.push(payload); return { ok: true, sourceEvent: { id: payload.id } }; } },
    AHAChamberSync: { sync: () => { throw new Error('sync should not be called'); } },
    EchoNet: { share: () => { throw new Error('EchoNet should not be called'); } }
  });

  const blank = await ctx.AHAGallery.addItem({ id: 'blank-item', src: 'local-only.png', title: '   ', description: '   ' });
  assert.ok(blank, 'blank image reference should still save as local user data');
  assert.equal(ingestCalls.length, 0, 'blank item without title/caption/note should not be ingested as meaningless insight');

  const valid = await ctx.AHAGallery.addItem({
    id: 'summer memory 1',
    src: '/local/sommer.jpg',
    title: 'Sommerminne',
    caption: 'Bilde fra en lokal tur',
    note: 'Rolig kveld',
    tags: ['minne', ' lokalt ', 'minne']
  });

  assert.equal(valid.id, 'summer_memory_1', 'gallery item id should be normalized safely');
  assert.equal(valid.local_only, true, 'gallery item should be marked local_only');
  assert.equal(valid.source_type, 'aha_gallery_item', 'gallery item should use gallery source_type');
  assert.equal(valid.source_app, 'aha', 'gallery item should use AHA source_app');
  assert.equal(valid.imported, false, 'gallery item should not be imported');
  assert.equal(valid.meta.echonet_shared, false, 'gallery item should not be EchoNet-shared');

  const stored = ctx.localStorage.readJson('aha_gallery_v1');
  assert.equal(stored.length, 2, 'valid and blank gallery items should be stored in aha_gallery_v1');
  assert.equal(stored[0].id, valid.id, 'newest valid gallery item should be first in local storage');

  assert.equal(ingestCalls.length, 1, 'valid text context should be sent once to AHAIngest');
  const payload = ingestCalls[0];
  assert.equal(payload.source_type, 'aha_gallery_item', 'ingest input should identify gallery items');
  assert.equal(payload.source_app, 'aha', 'ingest input should identify AHA as source app');
  assert.equal(payload.content_type, 'image_reference', 'image gallery items should ingest as image references');
  assert.equal(payload.local_only, true, 'ingest input should be local_only');
  assert.equal(payload.meta.local_only, true, 'ingest metadata should be local_only');
  assert.equal(payload.meta.gallery_item_id, valid.id, 'ingest metadata should include gallery item id');
  assert.equal(payload.meta.created_at, valid.created_at, 'ingest metadata should include created_at');
  assert.equal(payload.meta.updated_at, valid.updated_at, 'ingest metadata should include updated_at');
  assert.deepEqual(payload.tags, ['minne', 'lokalt'], 'ingest input should include normalized tags');
  assert.ok(!JSON.stringify(payload).includes('/local/sommer.jpg'), 'ingest payload should not send image path/content as text metadata');

  const repeatPayload = ctx.AHAGallery.buildIngestPayload(valid);
  assert.equal(repeatPayload.id, payload.id, 're-ingest source id should be stable for the same gallery item');

  const syncResult = await ctx.AHAGallery.syncFromDatabase();
  assert.equal(syncResult.local_only, true, 'syncFromDatabase should remain a local-only fallback');
  assert.equal(fetchCalled, false, 'gallery flow should not call external fetch');
  assert.equal(repoCalled, false, 'gallery flow should not call repository/database sync APIs');

  const searchCtx = loadSearch(ctx.localStorage);
  searchCtx.AHASearch.refresh();
  const hits = searchCtx.AHASearch.searchItems('Sommerminne', {});
  assert.ok(hits.some((item) => item.id === `gallery_${valid.id}`), 'AHA search should find stored gallery items');

  console.log('aha-gallery tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
