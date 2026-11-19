// Synthetic two-device AHA private Feed round-trip. No production calls or secrets.
// The genuine two-user RLS test and backup/restore approval remain separate gates.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("js/ahaFeed.js", "utf8");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const sharedRows = new Map();
const writes = [];
function storage() {
  const map = new Map();
  return {
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    get raw() { return map; }
  };
}
const clone = x => JSON.parse(JSON.stringify(x));

function device(userId, { cloudRead = true, cloudWrite = true, failWrite = false } = {}) {
  const local = storage();
  const calls = [];
  const context = {
    window: null, localStorage: local, console, Date, Math, JSON, String, Array, Set, Number,
    HTMLElement: function HTMLElement() {},
    document: {
      readyState: "loading",
      addEventListener() {},
      getElementById() { return null; }
    },
    addEventListener() {},
    AHA_CONFIG: { feed: { enableDatabaseSync: cloudRead, enablePrivateCloudWrite: cloudWrite } },
    AHAAuth: { async getProfileId() { return userId; } },
    AHADb: {
      getConfig: () => ({ url: "https://wshmybqyksrwkawqleiz.supabase.co" }),
      getClient: () => ({ auth: {
        async getSession() { return { data: { session: { access_token: "synthetic" } }, error: null }; },
        async getUser() { return { data: { user: { id: userId } }, error: null }; }
      } })
    },
    AHARepository: {
      async saveFeedPost(post) {
        calls.push("save");
        if (!cloudWrite || failWrite) return { ok: false, error: { code: "AHA_PREVIEW_READ_ONLY" } };
        if (post.profile_id !== userId) return { ok: false, error: { code: "42501" } };
        const previous = sharedRows.get(post.id);
        if (previous && previous.profile_id !== userId) return { ok: false, error: { code: "42501" } };
        sharedRows.set(post.id, clone(post));
        writes.push({ owner: userId, id: post.id, deleted: Boolean(post.deleted_at) });
        return { ok: true, data: clone(post) };
      },
      async loadFeedPosts({ profile_id }) {
        calls.push("read");
        assert.equal(profile_id, userId, "Never query another profile");
        return { ok: true, data: [...sharedRows.values()]
          .filter(post => post.profile_id === userId).map(clone) };
      }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "js/ahaFeed.js" });
  return { feed: context.AHAFeed, context, local, calls };
}

(async () => {
  const ipad = device(A);
  const mobile = device(A);
  const other = device(B);

  // Exactly one new private post: the older local archive is not bulk-uploaded.
  const p = await ipad.feed.addPost({ id: "device-one-post", text: "Kun privat på min konto." });
  assert.ok(p);
  assert.equal(p.meta.private_cloud_synced, true);
  assert.equal(p.external_published, false);
  assert.equal(p.echonet_shared, false);
  assert.equal(writes.length, 1);
  assert.equal(sharedRows.size, 1);
  assert.equal(ipad.feed.load().length, 1);
  assert.equal(mobile.feed.load().length, 0);
  const fetched = await mobile.feed.syncFromDatabase();
  assert.equal(fetched.ok, true);
  assert.equal(mobile.feed.load().length, 1);
  assert.equal(mobile.feed.load()[0].text, "Kun privat på min konto.");
  // Remote read is deliberately not persisted to a browser archive.
  assert.equal(mobile.local.raw.has("aha_feed_accounts_v1"), false);
  assert.equal(writes.length, 1, "Reading must not create a duplicate");

  assert.equal((await other.feed.syncFromDatabase()).data.length, 0);
  assert.equal(other.feed.load().length, 0);
  assert.equal(await other.feed.deletePost(p.id), null);
  assert.equal(writes.length, 1);

  const deletion = await mobile.feed.deletePost(p.id);
  assert.ok(deletion.deleted_at, "Owner may soft-delete a remotely loaded post");
  assert.equal(writes.length, 2);
  assert.equal(sharedRows.get(p.id).deleted_at, deletion.deleted_at);
  await ipad.feed.syncFromDatabase();
  assert.ok(ipad.feed.load()[0].deleted_at, "Deletion tombstone must reach the original device");
  assert.equal(sharedRows.size, 1, "Soft deletion preserves tombstone until retention policy");
  assert.equal(writes[1].owner, A);
  assert.equal(other.calls.includes("save"), false, "Other account cannot delete foreign post");

  // A read-only preview cannot accidentally save when the write switch is off.
  const readonly = device(A, { cloudRead: true, cloudWrite: false });
  const localOnly = await readonly.feed.addPost({ id: "not-uploaded", text: "Local by default" });
  assert.ok(localOnly);
  assert.equal(localOnly.local_only, true);
  assert.equal(readonly.calls.includes("save"), false);
  await readonly.feed.syncFromDatabase();
  assert.equal(sharedRows.has("not-uploaded"), false, "Reading cannot bulk-import local posts");

  // Even with a mistakenly enabled frontend flag, server rejection is safe.
  const blocked = device(B, { cloudRead: true, cloudWrite: true, failWrite: true });
  assert.equal(await blocked.feed.addPost({ id: "fail-closed", text: "Do not claim saved" }), null);
  assert.equal(blocked.feed.load().length, 0);
  assert.equal(blocked.local.raw.has("aha_feed_accounts_v1"), false);
  assert.equal(sharedRows.has("fail-closed"), false);

  assert.equal(writes.length, 2, "Only A's explicit create and delete may write");
  console.log("AHA private Feed synthetic two-device create/read/delete gate: PASS");
})().catch(error => { console.error(error); process.exitCode = 1; });
