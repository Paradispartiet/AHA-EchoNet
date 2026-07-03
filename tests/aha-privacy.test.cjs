const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const privacyCode = fs.readFileSync('js/ahaPrivacy.js', 'utf8');

function makeLocalStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    has: (key) => map.has(key),
    writeJson: (key, value) => map.set(key, JSON.stringify(value))
  };
}

function makeDocument(downloads) {
  return {
    readyState: 'loading',
    addEventListener: () => {},
    getElementById: () => null,
    createElement: (tag) => {
      assert.equal(tag, 'a');
      return {
        href: '',
        download: '',
        click() { downloads.push({ href: this.href, download: this.download }); },
        remove() {}
      };
    },
    body: { appendChild: () => {} }
  };
}

function loadPrivacy() {
  const downloads = [];
  const blobs = [];
  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.options = options;
      blobs.push(this);
    }
  }
  const sandbox = {
    console,
    Date,
    JSON,
    String,
    Array,
    Number,
    Boolean,
    Object,
    localStorage: makeLocalStorage(),
    document: makeDocument(downloads),
    HTMLElement: function HTMLElement() {},
    HTMLInputElement: function HTMLInputElement() {},
    HTMLFormElement: function HTMLFormElement() {},
    Blob: FakeBlob,
    URL: {
      createObjectURL: () => 'blob:aha-export',
      revokeObjectURL: () => {}
    }
  };
  sandbox.window = sandbox;
  sandbox.__downloads = downloads;
  sandbox.__blobs = blobs;
  vm.createContext(sandbox);
  vm.runInContext(privacyCode, sandbox, { filename: 'js/ahaPrivacy.js' });
  return sandbox;
}

const ctx = loadPrivacy();
const Privacy = ctx.AHAPrivacy;
assert.ok(Privacy, 'AHAPrivacy should be exported');

const requiredKeys = [
  'aha_insta_posts_v1',
  'aha_insta_stories_v1',
  'aha_insta_import_sessions_v1',
  'aha_insta_import_preview_v1',
  'aha_insta_profile_v1',
  'aha_insta_likes_v1',
  'aha_insta_comments_v1',
  'aha_insta_follows_v1'
];
let report = Privacy.collectStorageReport();
for (const key of requiredKeys) {
  assert.ok(report.some((item) => item.key === key), `collectStorageReport should include ${key}`);
}

ctx.localStorage.writeJson('aha_insta_posts_v1', [
  { id: 'active', local_only: true },
  { id: 'deleted', deleted_at: '2026-01-01T00:00:00.000Z' },
  { id: 'sync', sync_enabled: true },
  { id: 'echo', echonet_shared: true },
  { id: 'published', published_external: true }
]);
ctx.localStorage.writeJson('aha_insta_stories_v1', [
  { id: 'story-archived', archived: true }
]);
ctx.localStorage.writeJson('aha_insta_import_sessions_v1', [
  { id: 'session-imported', imported: true }
]);
ctx.localStorage.writeJson('aha_insta_import_preview_v1', [
  { id: 'preview', preview_data: { count: 1 } }
]);
ctx.localStorage.writeJson('aha_insta_profile_v1', { id: 'profile', local_only: true });
ctx.localStorage.writeJson('aha_insta_likes_v1', [{ id: 'like-1' }]);
ctx.localStorage.writeJson('aha_insta_comments_v1', [{ id: 'comment-1' }]);
ctx.localStorage.writeJson('aha_insta_follows_v1', [{ id: 'follow-1' }]);
ctx.localStorage.writeJson('visited_places', [{ id: 'history-go-place' }]);

report = Privacy.collectStorageReport();
const posts = report.find((item) => item.key === 'aha_insta_posts_v1');
assert.equal(posts.activeCount, 4, 'active post should count as active and tombstoned post should not');
assert.equal(posts.deletedCount, 1, 'post with deleted_at should count as deleted/tombstoned');
assert.equal(posts.localOnlyCount, 1, 'local_only object should count as localOnly');
assert.equal(posts.syncEnabledCount, 1, 'sync_enabled object should count as syncEnabled');
assert.equal(posts.echonetSharedCount, 1, 'echonet_shared object should count as echonetShared');
assert.equal(posts.externalPublishedCount, 1, 'published_external object should count as externalPublished');

const stories = report.find((item) => item.key === 'aha_insta_stories_v1');
assert.equal(stories.archivedCount, 1, 'story with archived: true should count as archived');
const sessions = report.find((item) => item.key === 'aha_insta_import_sessions_v1');
assert.equal(sessions.importedCount, 1, 'imported object should count as imported');
assert.equal(sessions.hasImportData, true, 'import session storage should be marked as import data');
const preview = report.find((item) => item.key === 'aha_insta_import_preview_v1');
assert.equal(preview.hasPreviewData, true, 'import preview storage should be marked as preview data');
const profile = report.find((item) => item.key === 'aha_insta_profile_v1');
assert.equal(profile.itemCount, 1, 'object storage should have safe fallback count of 1');
assert.equal(profile.localOnlyCount, 1, 'object local_only flag should count as localOnly');

const payload = Privacy.exportAllData();
for (const key of requiredKeys) {
  assert.ok(Object.prototype.hasOwnProperty.call(payload.data, key), `exportAllData should include ${key}`);
}
assert.ok(Array.isArray(payload.privacyReport), 'exportAllData should include privacyReport');
assert.equal(Object.prototype.hasOwnProperty.call(payload.data, 'visited_places'), false, 'exportAllData should not include History Go keys as raw AHA data');
assert.equal(ctx.__downloads.length, 1, 'exportAllData should trigger one download');

assert.equal(Privacy.clearStorageKey('aha_insta_stories_v1', 'SLETT').ok, true, 'new AHA Insta key should delete with SLETT');
assert.equal(ctx.localStorage.has('aha_insta_stories_v1'), false, 'deleted AHA Insta key should be removed');
assert.deepEqual(Privacy.clearStorageKey('visited_places', 'SLETT'), { ok: false, reason: 'not_allowed' }, 'History Go key cannot be deleted from Privacy');
assert.deepEqual(Privacy.clearStorageKey('aha_insta_posts_v1', 'slett'), { ok: false, reason: 'missing_confirmation' }, 'delete without exact SLETT should fail');
assert.equal(ctx.localStorage.has('aha_insta_posts_v1'), true, 'failed delete should keep data');

console.log('aha-privacy data report v2 tests passed');
