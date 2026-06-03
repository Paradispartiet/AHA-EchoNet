const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function makeLocalStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    raw: (key) => (map.has(key) ? map.get(key) : null)
  };
}

function makeSandbox({ repository = {}, ingest } = {}) {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    localStorage: makeLocalStorage(),
    document: {
      readyState: 'loading',
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    addEventListener: () => {},
    AHARepository: repository,
    AHAIngest: ingest || { ingest: async () => ({ ok: true, sourceEvent: { id: 'source-event-1' } }) },
    AHAContracts: { createBaseItem: () => null },
    prompt: () => null
  };
  sandbox.window = sandbox;
  sandbox.HTMLElement = function HTMLElement() {};
  vm.createContext(sandbox);
  return sandbox;
}

function loadModule(filename, options) {
  const sandbox = makeSandbox(options);
  vm.runInContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  return sandbox;
}

function byId(items, id) {
  return items.find((item) => item.id === id);
}

async function testNotesSyncRegressions() {
  const savedNotes = [];
  const ingestCalls = [];
  const sandbox = loadModule('js/ahaNotes.js', {
    repository: {
      saveNote: async (note) => { savedNotes.push(note); return { ok: true, data: note }; },
      loadNotes: async () => ({
        ok: true,
        data: [
          {
            id: 'note_deleted_local',
            title: 'Remote stale active note',
            text: 'remote should lose',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z'
          },
          {
            id: 'note_remote_newer',
            title: 'Remote newer note',
            text: 'remote should win',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-05T00:00:00.000Z'
          }
        ]
      })
    },
    ingest: { ingest: async (payload) => { ingestCalls.push(payload); return { ok: true, sourceEvent: { id: 'source-event-1' } }; } }
  });

  const Notes = sandbox.AHANotes;
  assert.ok(Notes, 'AHANotes should be exported');
  Notes.save([
    {
      id: 'note_deleted_local',
      title: 'Local deleted note',
      text: 'local tombstone should win',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-10T00:00:00.000Z',
      deleted_at: '2026-01-10T00:00:00.000Z'
    },
    {
      id: 'note_remote_newer',
      title: 'Local stale note',
      text: 'local should lose',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-03T00:00:00.000Z'
    },
    {
      id: 'note_to_edit',
      title: 'Old title',
      text: 'Old text',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    }
  ]);

  const result = await Notes.syncFromDatabase();
  assert.equal(result.merged, true, 'notes sync should report merged data');
  assert.ok(savedNotes.some((note) => note.id === 'note_deleted_local' && note.deleted_at), 'notes sync should push local tombstone before pull');
  const merged = Notes.load();
  assert.ok(byId(merged, 'note_deleted_local').deleted_at, 'newer local note tombstone should beat older remote active note');
  assert.equal(byId(merged, 'note_remote_newer').title, 'Remote newer note', 'newer remote note should beat older local note');

  await Notes.updateNote('note_to_edit', { title: 'New title', text: 'New text' });
  assert.equal(ingestCalls.at(-1).source_type, 'note_edit', 'updateNote should ingest note_edit');
  assert.equal(ingestCalls.at(-1).skip_insight, true, 'note_edit ingest should keep skip_insight true');

  const editedNote = byId(Notes.load(), 'note_to_edit');
  const editedUpdatedAt = editedNote.updated_at;
  const reanalyzed = await Notes.reanalyzeNote('note_to_edit');
  const reanalyzePayload = ingestCalls.at(-1);
  assert.equal(typeof Notes.reanalyzeNote, 'function', 'AHANotes.reanalyzeNote should be exported');
  assert.equal(reanalyzePayload.source_type, 'note_reanalysis', 'reanalyzeNote should ingest note_reanalysis');
  assert.equal(reanalyzePayload.source_app, 'aha_notes', 'reanalyzeNote should ingest from aha_notes');
  assert.equal(reanalyzePayload.meta.reanalyze, true, 'reanalyzeNote payload should mark explicit reanalysis');
  assert.notEqual(reanalyzePayload.skip_insight, true, 'reanalyzeNote should not set skip_insight true');
  assert.equal(reanalyzed.last_source_event_id, 'source-event-1', 'reanalyzeNote should store returned source event id');
  assert.ok(reanalyzed.last_reanalyzed_at, 'reanalyzeNote should set last_reanalyzed_at');
  assert.equal(reanalyzed.updated_at, editedUpdatedAt, 'reanalyzeNote should not change updated_at');
  assert.equal(reanalyzed.title, editedNote.title, 'reanalyzeNote should not change title');
  assert.equal(reanalyzed.text, editedNote.text, 'reanalyzeNote should not change text');

  Notes.save([
    ...Notes.load(),
    {
      id: 'note_deleted_for_reanalysis',
      title: 'Deleted note',
      text: 'Should not reanalyze',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
      deleted_at: '2026-01-02T00:00:00.000Z'
    }
  ]);
  const ingestCallCountBeforeDeleted = ingestCalls.length;
  const deletedReanalysis = await Notes.reanalyzeNote('note_deleted_for_reanalysis');
  assert.equal(deletedReanalysis, null, 'reanalyzeNote should return null for deleted notes');
  assert.equal(ingestCalls.length, ingestCallCountBeforeDeleted, 'reanalyzeNote should not ingest deleted notes');

  const invalidSandbox = loadModule('js/ahaNotes.js', {
    repository: {
      saveNote: async (note) => ({ ok: true, data: note }),
      loadNotes: async () => ({ ok: true, data: { invalid: true } })
    }
  });
  const invalidNotes = invalidSandbox.AHANotes;
  const local = [{ id: 'note_local_fallback', title: 'Keep me', created_at: '2026-01-01T00:00:00.000Z' }];
  invalidNotes.save(local);
  const before = invalidSandbox.localStorage.raw('aha_notes_v1');
  const fallback = await invalidNotes.syncFromDatabase();
  assert.equal(fallback.ok, false, 'invalid notes remote payload should fail safely');
  assert.equal(fallback.fallback, 'localStorage', 'invalid notes remote payload should use localStorage fallback');
  assert.equal(invalidSandbox.localStorage.raw('aha_notes_v1'), before, 'invalid notes remote payload should not rewrite localStorage');
  assert.deepEqual(fallback.data, local, 'invalid notes remote payload should return local data');
}

async function testFeedSyncRegressions() {
  const sandbox = loadModule('js/ahaFeed.js', {
    repository: {
      saveFeedPost: async (post) => ({ ok: true, data: post }),
      loadFeedPosts: async () => ({
        ok: true,
        data: [
          { id: 'feed_deleted_local', text: 'Remote stale active feed', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z' },
          { id: 'feed_remote_newer', text: 'Remote newer feed', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z' }
        ]
      })
    }
  });

  const Feed = sandbox.AHAFeed;
  assert.ok(Feed, 'AHAFeed should be exported');
  Feed.save([
    { id: 'feed_deleted_local', text: 'Local deleted feed', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-10T00:00:00.000Z', deleted_at: '2026-01-10T00:00:00.000Z' },
    { id: 'feed_remote_newer', text: 'Local stale feed', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-03T00:00:00.000Z' }
  ]);
  await Feed.syncFromDatabase();
  const merged = Feed.load();
  assert.ok(byId(merged, 'feed_deleted_local').deleted_at, 'newer local feed tombstone should beat older remote active post');
  assert.equal(byId(merged, 'feed_remote_newer').text, 'Remote newer feed', 'newer remote feed post should beat older local post');

  const deleted = Feed.deletePost('feed_remote_newer');
  assert.ok(deleted.deleted_at, 'feed deletePost should set deleted_at');
  assert.equal(deleted.updated_at, deleted.deleted_at, 'feed deletePost should set updated_at to deleted_at');

  const invalidSandbox = loadModule('js/ahaFeed.js', {
    repository: {
      saveFeedPost: async (post) => ({ ok: true, data: post }),
      loadFeedPosts: async () => ({ ok: true, data: { invalid: true } })
    }
  });
  const invalidFeed = invalidSandbox.AHAFeed;
  const local = [{ id: 'feed_local_fallback', text: 'Keep me', created_at: '2026-01-01T00:00:00.000Z' }];
  invalidFeed.save(local);
  const before = invalidSandbox.localStorage.raw('aha_feed_posts_v1');
  const fallback = await invalidFeed.syncFromDatabase();
  assert.equal(fallback.ok, false, 'invalid feed remote payload should fail safely');
  assert.equal(fallback.fallback, 'localStorage', 'invalid feed remote payload should use localStorage fallback');
  assert.equal(invalidSandbox.localStorage.raw('aha_feed_posts_v1'), before, 'invalid feed remote payload should not rewrite localStorage');
  assert.deepEqual(fallback.data, local, 'invalid feed remote payload should return local data');
}

async function testGallerySyncRegressions() {
  const ingestCalls = [];
  const sandbox = loadModule('js/ahaGallery.js', {
    repository: {
      saveGalleryItem: async (item) => ({ ok: true, data: item }),
      loadGalleryItems: async () => ({
        ok: true,
        data: [
          { id: 'gallery_deleted_local', title: 'Remote stale active item', src: 'remote.jpg', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z' },
          { id: 'gallery_remote_newer', title: 'Remote newer item', src: 'newer.jpg', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z' }
        ]
      })
    },
    ingest: { ingest: async (payload) => { ingestCalls.push(payload); return { ok: true }; } }
  });

  const Gallery = sandbox.AHAGallery;
  assert.ok(Gallery, 'AHAGallery should be exported');
  Gallery.save([
    { id: 'gallery_deleted_local', title: 'Local deleted item', src: 'local.jpg', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-10T00:00:00.000Z', deleted_at: '2026-01-10T00:00:00.000Z' },
    { id: 'gallery_remote_newer', title: 'Local stale item', src: 'stale.jpg', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-03T00:00:00.000Z' }
  ]);
  await Gallery.syncFromDatabase();
  const merged = Gallery.load();
  assert.ok(byId(merged, 'gallery_deleted_local').deleted_at, 'newer local gallery tombstone should beat older remote active item');
  assert.equal(byId(merged, 'gallery_remote_newer').title, 'Remote newer item', 'newer remote gallery item should beat older local item');

  const deleted = Gallery.deleteItem('gallery_remote_newer');
  assert.ok(deleted.deleted_at, 'gallery deleteItem should set deleted_at');
  assert.equal(deleted.updated_at, deleted.deleted_at, 'gallery deleteItem should set updated_at to deleted_at');

  const added = await Gallery.addItem({ title: 'Gallery source', src: 'source.jpg', description: 'Source type check' });
  assert.equal(added.source_type, 'gallery', 'gallery addItem should keep source_type gallery on saved item');
  assert.equal(ingestCalls.at(-1).source_type, 'gallery', 'gallery addItem should ingest source_type gallery');

  const invalidSandbox = loadModule('js/ahaGallery.js', {
    repository: {
      saveGalleryItem: async (item) => ({ ok: true, data: item }),
      loadGalleryItems: async () => ({ ok: true, data: { invalid: true } })
    }
  });
  const invalidGallery = invalidSandbox.AHAGallery;
  const local = [{ id: 'gallery_local_fallback', title: 'Keep me', src: 'keep.jpg', created_at: '2026-01-01T00:00:00.000Z' }];
  invalidGallery.save(local);
  const before = invalidSandbox.localStorage.raw('aha_gallery_v1');
  const fallback = await invalidGallery.syncFromDatabase();
  assert.equal(fallback.ok, false, 'invalid gallery remote payload should fail safely');
  assert.equal(fallback.fallback, 'localStorage', 'invalid gallery remote payload should use localStorage fallback');
  assert.equal(invalidSandbox.localStorage.raw('aha_gallery_v1'), before, 'invalid gallery remote payload should not rewrite localStorage');
  assert.deepEqual(fallback.data, local, 'invalid gallery remote payload should return local data');
}

async function testInstaSyncRegressions() {
  const saveCalls = [];
  let loadedAfterPush = false;
  const ingestCalls = [];
  const sandbox = loadModule('js/ahaInsta.js', {
    repository: {
      saveInstaProfile: async (profile) => ({ ok: true, data: profile }),
      saveInstaPost: async (post) => { saveCalls.push(post); return { ok: true, data: post }; },
      loadInstaPosts: async () => {
        loadedAfterPush = saveCalls.length === 3;
        return {
          ok: true,
          data: [
            { id: 'insta_remote', title: 'Remote post', src: 'remote.jpg', caption: 'remote', created_at: '2026-01-03T00:00:00.000Z' },
            { id: 'insta_remote_deleted_wins', title: 'Remote deleted post', src: 'deleted-remote.jpg', caption: 'deleted remote', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-04T00:00:00.000Z', deleted_at: '2026-01-04T00:00:00.000Z' }
          ]
        };
      }
    },
    ingest: { ingest: async (payload) => { ingestCalls.push(payload); return { ok: true }; } }
  });

  const Insta = sandbox.AHAInsta;
  assert.ok(Insta, 'AHAInsta should be exported');
  Insta.save([
    { id: 'insta_active_local', title: 'Active local', src: 'active.jpg', caption: 'active', created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'insta_deleted_local', title: 'Deleted local', src: 'deleted.jpg', caption: 'deleted', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z', deleted_at: '2026-01-02T00:00:00.000Z' },
    { id: 'insta_remote_deleted_wins', title: 'Local stale active', src: 'stale-active.jpg', caption: 'local should lose', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z' }
  ]);

  const result = await Insta.syncFromDatabase();
  assert.equal(loadedAfterPush, true, 'insta sync should push local posts before remote pull');
  assert.ok(saveCalls.some((post) => post.id === 'insta_active_local' && !post.deleted_at), 'insta sync should push active local posts');
  assert.ok(saveCalls.some((post) => post.id === 'insta_deleted_local' && post.deleted_at), 'insta sync should push tombstones');
  assert.equal(result.merged, true, 'successful insta sync should report merged true');
  assert.ok(Array.isArray(result.data), 'successful insta sync should return merged data array');
  assert.ok(result.data.some((post) => post.id === 'insta_remote'), 'successful insta sync should include pulled remote data');
  assert.ok(byId(result.data, 'insta_remote_deleted_wins').deleted_at, 'newer remote insta tombstone should beat older local active post');

  const deleted = Insta.deletePost('insta_active_local');
  assert.ok(deleted.deleted_at, 'insta deletePost should set deleted_at');
  assert.equal(deleted.updated_at, deleted.deleted_at, 'insta deletePost should set updated_at to deleted_at');

  const added = await Insta.addPost({ title: 'Insta source', src: 'insta.jpg', caption: 'Source type check' });
  assert.ok(added, 'insta addPost should create a post');
  assert.equal(ingestCalls.at(-1).source_type, 'insta_post', 'insta addPost should ingest source_type insta_post');

  const invalidSandbox = loadModule('js/ahaInsta.js', {
    repository: {
      saveInstaProfile: async (profile) => ({ ok: true, data: profile }),
      saveInstaPost: async (post) => ({ ok: true, data: post }),
      loadInstaPosts: async () => ({ ok: true, data: { invalid: true } })
    }
  });
  const invalidInsta = invalidSandbox.AHAInsta;
  const local = [{ id: 'insta_local_fallback', title: 'Keep me', src: 'keep.jpg', created_at: '2026-01-01T00:00:00.000Z' }];
  invalidInsta.save(local);
  const before = invalidSandbox.localStorage.raw('aha_insta_posts_v1');
  const fallback = await invalidInsta.syncFromDatabase();
  assert.equal(fallback.ok, false, 'invalid insta remote payload should fail safely');
  assert.equal(fallback.fallback, 'localStorage', 'invalid insta remote payload should use localStorage fallback');
  assert.equal(invalidSandbox.localStorage.raw('aha_insta_posts_v1'), before, 'invalid insta remote payload should not rewrite localStorage');
  assert.deepEqual(fallback.data, local, 'invalid insta remote payload should return local data');
}

(async () => {
  await testNotesSyncRegressions();
  await testFeedSyncRegressions();
  await testGallerySyncRegressions();
  await testInstaSyncRegressions();
  console.log('aha-sync-tombstone-regressions test passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
