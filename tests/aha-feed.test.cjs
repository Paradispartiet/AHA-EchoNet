const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const feedCode = fs.readFileSync('js/ahaFeed.js', 'utf8');

function makeLocalStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    raw: (key) => (map.has(key) ? map.get(key) : null)
  };
}

function createForbiddenApi(name, calls) {
  return new Proxy({}, {
    get(_target, prop) {
      calls.push(`${name}.${String(prop)}`);
      throw new Error(`AHA Feed local-only boundary violated by ${name}.${String(prop)}`);
    }
  });
}

function buildContext() {
  const ingestCalls = [];
  const forbiddenCalls = [];
  const repositoryCalls = [];
  const context = {
    window: null,
    console,
    Date,
    Math,
    JSON,
    String,
    Array,
    Set,
    Number,
    localStorage: makeLocalStorage(),
    document: {
      readyState: 'loading',
      addEventListener: () => {},
      getElementById: () => null
    },
    addEventListener: () => {},
    fetch: (...args) => {
      forbiddenCalls.push(`fetch:${args[0]}`);
      throw new Error('AHA Feed must not call external fetch');
    },
    EchoNet: createForbiddenApi('EchoNet', forbiddenCalls),
    AHASyncHub: createForbiddenApi('AHASyncHub', forbiddenCalls),
    AHAChamberSync: createForbiddenApi('AHAChamberSync', forbiddenCalls),
    AHAIngest: {
      ingest: async (payload) => {
        ingestCalls.push(payload);
        return { ok: true, sourceEvent: { id: `source-${ingestCalls.length}` } };
      }
    },
    AHAContracts: {
      createBaseItem: (input) => ({ id: input.id, type: input.type, source: input.source, meta: input.meta })
    },
    // A repository is intentionally available even for a locally flagged post.
    // Writing by default would leak content to Supabase despite local_only metadata.
    AHARepository: {
      saveFeedPost: async (post) => {
        repositoryCalls.push({ method: 'saveFeedPost', id: post.id });
        return { ok: true, data: post };
      },
      loadFeedPosts: async () => {
        repositoryCalls.push({ method: 'loadFeedPosts' });
        return { ok: true, data: [] };
      }
    }
  };
  context.window = context;
  context.HTMLElement = function HTMLElement() {};
  context.__ingestCalls = ingestCalls;
  context.__forbiddenCalls = forbiddenCalls;
  context.__repositoryCalls = repositoryCalls;
  vm.createContext(context);
  vm.runInContext(feedCode, context, { filename: 'js/ahaFeed.js' });
  return context;
}

(async () => {
  const ctx = buildContext();
  const Feed = ctx.AHAFeed;
  assert.ok(Feed, 'AHAFeed should be exported');

  const blank = await Feed.addPost({ text: '   \n\t  ' });
  assert.equal(blank, null, 'blank feed post should not be saved');
  assert.equal(ctx.localStorage.raw('aha_feed_posts_v1'), null, 'blank feed post should not touch feed storage');
  assert.equal(ctx.__ingestCalls.length, 0, 'blank feed post should not be ingested');

  const post = await Feed.addPost({ id: ' unsafe id! ', text: '  Dette er en lokal AHA-post.  ', tags: [' AHA ', 'aha', 'lokal'] });
  assert.ok(post, 'valid feed post should be returned');
  assert.equal(post.id, 'unsafe_id', 'feed post id should be normalized safely');
  assert.equal(post.text, 'Dette er en lokal AHA-post.', 'feed post text should be normalized');
  assert.equal(post.local_only, true, 'feed post should be marked local_only');
  assert.equal(post.external_published, false, 'feed post should not be externally published');
  assert.equal(post.echonet_shared, false, 'feed post should not be EchoNet shared');

  const stored = JSON.parse(ctx.localStorage.raw('aha_feed_posts_v1'));
  assert.equal(stored.length, 1, 'valid feed post should be stored in aha_feed_posts_v1');
  assert.equal(stored[0].id, 'unsafe_id', 'stored post should use safe id');
  assert.equal(stored[0].last_source_event_id, undefined, 'new post must not be ingested automatically');

  assert.equal(ctx.__ingestCalls.length, 0, 'adding a local Feed post must not trigger AHA ingest or embeddings');
  assert.deepEqual(ctx.__repositoryCalls, [], 'adding a local post must not touch database even if a repository exists');

  const manuallyIngested = await Feed.ingestPost('unsafe_id');
  assert.equal(manuallyIngested.ok, true, 'explicit Send til AHA action should ingest the post');
  assert.equal(ctx.__ingestCalls.length, 1, 'manual ingestion must occur exactly once');
  const storedAfterManualIngest = JSON.parse(ctx.localStorage.raw('aha_feed_posts_v1'));
  assert.equal(storedAfterManualIngest[0].last_source_event_id, 'source-1', 'manual ingestion must retain source event trace');
  const payload = ctx.__ingestCalls[0];
  assert.equal(payload.source_app, 'aha', 'feed ingest payload should use AHA source app');
  assert.equal(payload.source_type, 'aha_feed_post', 'feed ingest payload should use feed source type');
  assert.equal(payload.content_type, 'text', 'feed ingest payload should declare text content');
  assert.equal(payload.user_created, true, 'feed ingest payload should be user-created');
  assert.equal(payload.imported, false, 'feed ingest payload should not be imported');
  assert.equal(payload.local_only, true, 'feed ingest payload should be local_only');
  assert.equal(payload.meta.feed_post_id, 'unsafe_id', 'feed ingest metadata should include feed post id');
  assert.equal(payload.meta.local_only, true, 'feed ingest metadata should include local_only');
  assert.deepEqual(payload.tags, ['AHA', 'lokal'], 'feed ingest payload should preserve normalized tags');
  assert.ok(payload.created_at, 'feed ingest payload should include created_at');
  assert.ok(payload.updated_at, 'feed ingest payload should include updated_at');

  const duplicate = await Feed.ingestPost('unsafe_id');
  assert.equal(duplicate.skipped, true, 're-ingest of same post should be skipped when source event exists');
  assert.equal(ctx.__ingestCalls.length, 1, 're-ingest should not create an obvious duplicate ingest event');

  // Default local-only behavior must hold even with Supabase repository connected.
  assert.deepEqual(ctx.__repositoryCalls, [], 'local-only post and AHA ingest must not write to Supabase by default');
  const blockedSync = await Feed.syncFromDatabase();
  assert.equal(blockedSync.database_sync_disabled, true, 'remote sync must be disabled by default');
  assert.deepEqual(ctx.__repositoryCalls, [], 'syncFromDatabase must not read or write when not explicitly enabled');

  const deleted = await Feed.deletePost('unsafe_id');
  assert.ok(deleted?.deleted_at, 'local delete must retain tombstone');
  assert.deepEqual(ctx.__repositoryCalls, [], 'local deletion must not write to Supabase by default');
  assert.deepEqual(ctx.__forbiddenCalls, [], 'feed flow should not fetch externally or activate sync/EchoNet');

  // Explicit opt-in allows only a scoped read, never automatic uploads.
  const enabledCtx = buildContext();
  enabledCtx.AHA_CONFIG = { feed: { enableDatabaseSync: true } };
  const profileA = '11111111-1111-4111-8111-111111111111';
  const profileB = '22222222-2222-4222-8222-222222222222';
  enabledCtx.AHADb = {
    getConfig: () => ({ url: 'https://wshmybqyksrwkawqleiz.supabase.co' }),
    getClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: profileA } }, error: null }) } })
  };
  enabledCtx.AHAAuth = { getProfileId: async () => profileA };
  enabledCtx.AHARepository.loadFeedPosts = async (options) => {
    enabledCtx.__repositoryCalls.push({ method: 'loadFeedPosts', profile_id: options.profile_id });
    return { ok: true, data: [{
      id: 'remote-A', profile_id: profileA, text: 'Kun konto A',
      created_at: '2026-11-18T11:00:00.000Z'
    }] };
  };
  const oldLocalPost = await enabledCtx.AHAFeed.addPost({ id: 'account-owned-local', text: 'Skal aldri autoimporteres' });
  assert.ok(oldLocalPost);
  assert.deepEqual(enabledCtx.__repositoryCalls, [], 'opt-in alone must not write a local post');
  const remoteResult = await enabledCtx.AHAFeed.syncFromDatabase();
  assert.equal(remoteResult.ok, true, 'owner-scoped explicit read should succeed');
  assert.equal(remoteResult.read_only, true);
  assert.equal(remoteResult.data.length, 2, 'account-owned local posts can join a read-only cloud view');
  assert.equal(remoteResult.data.some((item) => item.id === 'remote-A'), true);
  assert.equal(enabledCtx.__repositoryCalls.length, 1, 'one owner-scoped read, no hidden writes');
  assert.equal(enabledCtx.__repositoryCalls[0].method, 'loadFeedPosts');
  assert.equal(enabledCtx.__repositoryCalls[0].profile_id, profileA);
  const accountArchive = JSON.parse(enabledCtx.localStorage.raw('aha_feed_accounts_v1'));
  assert.equal(accountArchive.accounts[profileA].length, 1,
    'Account-local post must remain in its isolated partition');
  assert.equal(enabledCtx.localStorage.raw('aha_feed_posts_v1'), null,
    'Cloud rows and account-owned rows must not be written into the legacy key');

  const maliciousCtx = buildContext();
  maliciousCtx.AHA_CONFIG = { feed: { enableDatabaseSync: true } };
  maliciousCtx.AHADb = {
    getConfig: () => ({ url: 'https://wshmybqyksrwkawqleiz.supabase.co' }),
    getClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: profileB } }, error: null }) } })
  };
  maliciousCtx.AHAAuth = { getProfileId: async () => profileB };
  maliciousCtx.AHARepository.loadFeedPosts = async () => ({
    ok: true, data: [{ id: 'remote-A', profile_id: profileA, text: 'A only' }]
  });
  const mismatch = await maliciousCtx.AHAFeed.syncFromDatabase();
  assert.equal(mismatch.ok, false, 'unexpected cross-account data must fail closed');
  assert.equal(mismatch.reason, 'remote_profile_mismatch');

  const anonymousCtx = buildContext();
  anonymousCtx.AHA_CONFIG = { feed: { enableDatabaseSync: true } };
  const noAuth = await anonymousCtx.AHAFeed.syncFromDatabase();
  assert.equal(noAuth.reason, 'not_signed_in', 'flag cannot bypass Auth');
  assert.deepEqual(anonymousCtx.__repositoryCalls, []);
  assert.deepEqual(enabledCtx.__forbiddenCalls, [], 'synthetic test must never fetch externally');

  // A user-controlled/remote post ID must never break out of data-* attributes.
  let rendered = '';
  enabledCtx.document.getElementById = (id) => id === 'feed-list'
    ? { set innerHTML(value) { rendered = value; } }
    : null;
  enabledCtx.AHAFeed.render([{ id: 'remote" onmouseover="alert(1)', text: 'A record' }]);
  assert.ok(rendered.includes('data-feed-delete="remote&quot; onmouseover=&quot;alert(1)"'),
    'remote IDs must be escaped in HTML attributes');
  assert.equal(rendered.includes('data-feed-delete="remote" onmouseover='), false,
    'remote IDs must not be able to insert extra event attributes');

  console.log('aha-feed tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
