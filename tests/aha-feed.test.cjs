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

  const deleted = Feed.deletePost('unsafe_id');
  assert.ok(deleted?.deleted_at, 'local delete must retain tombstone');
  assert.deepEqual(ctx.__repositoryCalls, [], 'local deletion must not write to Supabase by default');
  assert.deepEqual(ctx.__forbiddenCalls, [], 'feed flow should not fetch externally or activate sync/EchoNet');

  // Explicit flag is the only intentional legacy/dev path to database sync.
  const enabledCtx = buildContext();
  enabledCtx.AHA_CONFIG = { feed: { enableDatabaseSync: true } };
  const optedPost = await enabledCtx.AHAFeed.addPost({ id: 'opted_in', text: 'Syntetisk testinnlegg' });
  assert.ok(optedPost, 'opt-in test post should exist locally');
  assert.equal(enabledCtx.__ingestCalls.length, 0, 'database opt-in must not silently opt into AHA insight processing');
  assert.ok(enabledCtx.__repositoryCalls.some((c) => c.method === 'saveFeedPost'), 'explicit opt-in should enable repository writes');
  const remoteResult = await enabledCtx.AHAFeed.syncFromDatabase();
  assert.equal(remoteResult.ok, true, 'explicit opt-in should permit repository sync');
  assert.ok(enabledCtx.__repositoryCalls.some((c) => c.method === 'loadFeedPosts'), 'explicit opt-in should permit repository reads');
  assert.deepEqual(enabledCtx.__forbiddenCalls, [], 'opt-in test must remain synthetic without external fetch');

  console.log('aha-feed tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
