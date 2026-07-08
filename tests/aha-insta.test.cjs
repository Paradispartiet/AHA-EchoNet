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
  for (const key of ['local_only']) assert.equal(mediaOnly[key], true, `post should set ${key}`);
  for (const key of ['published_external', 'echonet_shared', 'sync_enabled', 'external_share_enabled']) assert.equal(mediaOnly[key], false, `post should keep ${key} false`);
  assert.equal(mediaOnly.meta.local_only, true, 'post meta should be local-only');
  assert.equal(mediaOnly.meta.published_external, false, 'post meta should not be externally published');
  assert.equal(mediaOnly.meta.echonet_shared, false, 'post meta should not be EchoNet-shared');
  assert.equal(mediaOnly.meta.sync_enabled, false, 'post meta sync flag should be false');
  assert.equal(mediaOnly.meta.external_share_enabled, false, 'post meta external share flag should be false');
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
  const session = ctx.localStorage.readJson('aha_insta_import_sessions_v1')[0];
  assert.equal(session.local_only, true, 'import session should be local-only');
  assert.equal(session.import_preview_only, true, 'import session should be preview-only before consent');
  assert.equal(session.published_external, false, 'import session should not publish externally');
  assert.equal(session.echonet_shared, false, 'import session should not share to EchoNet');
  assert.equal(session.sync_enabled, false, 'import session should not enable sync');
  assert.equal(previewResult.items[0].local_only, true, 'preview item should be local-only');
  assert.equal(previewResult.items[0].import_preview_only, true, 'preview item should be preview-only');
  assert.equal(previewResult.items[0].published_external, false, 'preview item should not publish externally');
  assert.equal(previewResult.items[0].echonet_shared, false, 'preview item should not share to EchoNet');
  assert.equal(previewResult.items[0].sync_enabled, false, 'preview item should not sync');
  assert.equal(previewResult.items[0].visibility, 'private', 'preview item should remain private');
  assert.equal(previewResult.items.length, 1, 'import-preview should parse items');
  assert.equal(ctx.__ingestCalls.length, beforePreviewIngest, 'import-preview should not write to AHAIngest');
  assert.equal(ctx.__repositoryCalls.length, beforePreviewRepo, 'import-preview should not write to database');

  await Insta.completeInstagramImport({ selectedIds: [previewResult.items[0].id], connectIngest: false, sessionId: previewResult.sessionId });
  const importedPost = Insta.load().find((post) => post.caption === 'IG caption');
  assert.equal(importedPost.local_only, true, 'imported post should be local-only');
  assert.equal(importedPost.published_external, false, 'imported post should not publish externally');
  assert.equal(importedPost.echonet_shared, false, 'imported post should not share to EchoNet');
  assert.equal(importedPost.sync_enabled, false, 'imported post should not enable sync');
  assert.equal(importedPost.external_share_enabled, false, 'imported post should not enable external share');
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

  const profile = Insta.ensureProfile();
  assert.equal(profile.local_only, true, 'profile should be local-only');
  assert.equal(profile.external_identity, false, 'profile should not create external identity');
  assert.equal(profile.account_linked, false, 'profile should not link accounts');
  assert.equal(profile.meta.origin_app, 'aha_insta', 'profile meta should identify AHA Insta');

  Insta.toggleLike(captioned.id);
  const like = Insta.loadLikes()[0];
  assert.equal(like.local_only, true, 'like should be local-only');
  assert.equal(like.social_local_only, true, 'like should be local social data');
  assert.equal(like.meta.social_local_only, true, 'like meta should be local social data');
  const comment = Insta.addComment(captioned.id, 'lokal kommentar');
  assert.equal(comment.local_only, true, 'comment should be local-only');
  assert.equal(comment.published_external, false, 'comment should not publish externally');
  const deletedComment = Insta.deleteComment(comment.id);
  assert.ok(deletedComment.deleted_at, 'deleteComment should tombstone locally');
  Insta.toggleFollow('venn');
  const follow = Insta.loadFollows()[0];
  assert.equal(follow.local_only, true, 'follow should be local-only');
  assert.equal(follow.follow_type, 'local_filter', 'follow should be local filter data');
  assert.equal(follow.external_follow, false, 'follow should not be external social graph');

  assert.deepEqual(await Insta.syncFromDatabase(), { ok: false, fallback: 'localOnly', database_sync_disabled: true }, 'post sync should be disabled by default');
  assert.deepEqual(await Insta.syncSocialFromDatabase(), { ok: false, fallback: 'localOnly', database_sync_disabled: true }, 'social sync should be disabled by default');
  assert.deepEqual(await Insta.pushLocalToDatabase(Insta.load()), { ok: false, fallback: 'localOnly', database_sync_disabled: true }, 'push should be disabled by default');
  assert.equal(ctx.__repositoryCalls.length, beforePreviewRepo, 'repository should not be called while database sync is disabled');
  ctx.AHA_CONFIG.insta.enableDatabaseSync = true;
  await Insta.pushLocalToDatabase([captioned]);
  assert.equal(ctx.__repositoryCalls.some((call) => call.method === 'saveInstaPost'), true, 'repository may be used when database sync is explicitly enabled');
  ctx.AHA_CONFIG.insta.enableDatabaseSync = false;

  await Insta.copyPostText(captioned.id);
  assert.deepEqual(ctx.__shareCalls, [], 'native navigator.share should not be used');

  ctx.localStorage.writeJson('aha_insta_posts_v1', [
    { id: 'insta-live', title: 'Synlig Insta', caption: 'vis meg', created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'insta-deleted', title: 'Skjult Insta', caption: 'skjul meg', deleted_at: '2026-01-02T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'insta-deleted-camel', title: 'Skjult camel', caption: 'skjul meg', deletedAt: '2026-01-02T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'insta-archived', title: 'Arkivert Insta', caption: 'skjul meg', archived: true, created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'insta-preview', title: 'Preview Insta', import_preview_only: true, created_at: '2026-01-01T00:00:00.000Z' }
  ]);
  const search = loadSearch(ctx.localStorage);
  const ids = new Set(search.AHASearch.collectSearchItems().map((item) => item.id));
  assert.equal(ids.has('insta_insta-live'), true, 'active Insta post should be searchable');
  assert.equal(ids.has('insta_insta-deleted'), false, 'tombstoned Insta post should not be searchable');
  assert.equal(ids.has('insta_insta-deleted-camel'), false, 'camelCase tombstoned Insta post should not be searchable');
  assert.equal(ids.has('insta_insta-archived'), false, 'archived Insta post should not be searchable');
  assert.equal(ids.has('insta_insta-preview'), false, 'import preview should not be searchable as finished content');

  ctx.localStorage.writeJson('aha_insta_posts_v1', [{ id: 'legacy', title: 'Legacy', created_at: '2026-01-01T00:00:00.000Z' }]);
  const legacy = Insta.load()[0];
  assert.equal(legacy.local_only, true, 'legacy post should normalize to local-only');
  assert.equal(legacy.published_external, false, 'legacy post should normalize published_external false');
  assert.equal(legacy.meta.local_only, true, 'legacy post meta should normalize to local-only');

  assert.equal(/navigator\.share/.test(instaCode), false, 'runtime should not contain navigator.share');
  assert.equal(/\bfetch\s*\(/.test(instaCode), false, 'runtime should not call fetch');
  assert.equal(/EchoNet/.test(instaCode), false, 'runtime should not reference EchoNet');
  assert.equal(/SyncHub|AHASyncHub/.test(instaCode), false, 'runtime should not reference Sync Hub');
  assert.equal(/Supabase|createClient/.test(instaCode), false, 'runtime should not reference Supabase clients');
  assert.equal(/publishExternal|externalPublish|shareExternal|externalShareApi/i.test(instaCode), false, 'runtime should not define external publish/share API');

  console.log('aha-insta local-only boundary tests passed');
})();
