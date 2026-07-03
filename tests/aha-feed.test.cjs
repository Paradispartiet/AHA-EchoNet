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
    }
  };
  context.window = context;
  context.HTMLElement = function HTMLElement() {};
  context.__ingestCalls = ingestCalls;
  context.__forbiddenCalls = forbiddenCalls;
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
  assert.equal(stored[0].last_source_event_id, 'source-1', 'stored post should keep AHAIngest source event trace');

  assert.equal(ctx.__ingestCalls.length, 1, 'valid feed post should be sent to AHAIngest exactly once');
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

  assert.deepEqual(ctx.__forbiddenCalls, [], 'feed flow should not fetch externally or activate sync/EchoNet');

  console.log('aha-feed tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
