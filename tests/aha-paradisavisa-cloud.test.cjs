"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const cloudJs = fs.readFileSync(path.join(root, "js/ahaParadisavisaCloud.js"), "utf8");
const page = fs.readFileSync(path.join(root, "paradisavisa.html"), "utf8");
const sql = fs.readFileSync(path.join(root, "supabase/legacy-paradisavisa-reading-library-v1.sql"), "utf8");
const article = (id = "/Paradisavisa/artikler/en-test.html") => ({
  id, url: "https://paradispartiet.github.io" + id,
  title: "Samfunn og kultur", summary: "En inngress", excerpt: "Artikkelen", category: "Kultur",
  savedAt: "2026-11-12T08:00:00Z", readAt: null, openedAt: null,
  trackingEnabled: true, tags: ["Oslo", "byhistorie"]
});

function mock(options = {}) {
  const local = new Map();
  const uid = options.uid || "44444444-4444-4444-8444-444444444444";
  const articles = options.articles || [article()];
  const calls = { remote: 0, reads: 0, writes: 0, deletes: 0, verified: 0, confirms: 0, imports: 0 };
  const remote = options.remote || [];
  let tracking = options.tracking ?? false;
  let authChange = null;
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    order() { return chain; },
    range(start = 0, end = 99) {
      calls.reads++;
      calls.remote++;
      return Promise.resolve({ data: remote.slice(start, end + 1), error: null });
    },
    upsert(rows, { onConflict }) {
      assert.equal(onConflict, "profile_id,article_id");
      calls.writes++;
      calls.remote++;
      calls.upserted = rows;
      calls.ownerAtWrite = local.get("aha_paradisavisa_cloud_owner_v1") || "";
      return Promise.resolve({ error: options.sqlError || null });
    },
    delete() {
      return {
        eq(column, id) {
          assert.equal(column, "profile_id");
          assert.equal(id, uid);
          calls.deletes++; calls.remote++;
          return Promise.resolve({ error: options.sqlError || null });
        }
      };
    }
  };
  const client = {
    auth: {
      onAuthStateChange(callback) {
        authChange = callback;
        calls.authSubscriptions = (calls.authSubscriptions || 0) + 1;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async getUser() {
        calls.verified++;
        return options.guest ? { data: { user: null }, error: null }
          : { data: { user: { id: uid, is_anonymous: false } }, error: null };
      }
    },
    from(table) { assert.equal(table, "aha_paradisavisa_reading_library"); return chain; }
  };
  const env = {
    URL, Date, Promise, console, Array,
    setTimeout: (fn) => setImmediate(fn),
    localStorage: {
      getItem: (key) => local.get(key) || null,
      setItem: (key, val) => {
        if (options.refuseOwnerWrite && key === "aha_paradisavisa_cloud_owner_v1") {
          throw Error("Browser profile is read only");
        }
        local.set(key, val);
      },
      removeItem: (key) => local.delete(key)
    },
    document: { readyState: "loading", addEventListener() {}, getElementById() { return null; } },
    AHADb: { getClient: () => client },
    AHAParadisavisa: {
      setOwnerAccess(allowed) { calls.localOwnerAllowed = allowed; },
      load() { return { articles, trackingEnabled: tracking }; },
      importData(payload) {
        calls.imports++;
        assert.equal(payload.trackingEnabled, false);
        assert.ok(payload.articles.every(a => a.source === "paradisavisa" && a.url.includes("paradispartiet.github.io")));
        tracking = tracking;
        return { ok: true, added: payload.articles.length };
      }
    },
    confirm() { calls.confirms++; return options.decline ? false : true; }
  };
  env.window = env;
  vm.runInNewContext(cloudJs, env, { filename: "ahaParadisavisaCloud.js" });
  return {
    api: env.AHAParadisavisaCloud, calls, local, uid,
    emitAuth: event => { if (!authChange) throw Error("No auth listener attached"); authChange(event, null); },
    getTracking: () => tracking
  };
}

test("page contains manual cloud actions and loads existing Aha authentication", () => {
  assert.match(page, /id="aha-avisa-cloud-upload"/);
  assert.match(page, /id="aha-avisa-cloud-download"/);
  assert.match(page, /id="aha-avisa-cloud-erase"/);
  assert.match(page, /js\/ahaAuth\.js/);
  assert.match(page, /js\/ahaParadisavisaCloud\.js/);
  assert.match(page, /Ingenting overføres automatisk/);
});

test("boot never fetches a session or uploads or downloads reading history", () => {
  const h = mock();
  assert.equal(h.calls.verified, 0);
  assert.equal(h.calls.remote, 0);
});

test("no account or explicit confirmation means no cloud writes", async () => {
  const guest = mock({ guest: true });
  assert.equal((await guest.api.upload()).ok, false);
  assert.equal(guest.calls.remote, 0);
  const declined = mock({ decline: true });
  assert.equal((await declined.api.upload()).ok, false);
  assert.equal(declined.calls.remote, 0);
});

test("verified owner can explicitly upload only metadata of valid articles", async () => {
  const h = mock({ articles: [article(), { ...article("/Paradisavisa/artikler/evil.html"), url: "https://evil.example/Paradisavisa/artikler/evil.html" }] });
  const result = await h.api.upload();
  assert.equal(result.ok, true);
  assert.equal(h.calls.writes, 1);
  assert.equal(h.calls.upserted.length, 1);
  assert.equal(h.calls.upserted[0].profile_id, h.uid);
  assert.deepEqual(Array.from(h.calls.upserted[0].tags), ["Oslo", "byhistorie"]);
  assert.equal(h.local.get("aha_paradisavisa_cloud_owner_v1"), h.uid);
  assert.equal(h.calls.confirms, 1);
});

test("stale-device uploads preserve existing cloud saves, reads and topic tags", async () => {
  const h = mock({ remote: [{
    article_id: "/Paradisavisa/artikler/en-test.html",
    saved_at: null, read_at: "2026-11-10T12:00:00Z",
    opened_at: null, open_count: 5, tags: ["Fra annen enhet"]
  }] });
  const result = await h.api.upload();
  assert.equal(result.ok, true);
  assert.equal(h.calls.upserted[0].read_at, "2026-11-10T12:00:00Z");
  assert.equal(h.calls.upserted[0].open_count, 5);
  assert.ok(h.calls.upserted[0].tags.includes("Fra annen enhet"));
  assert.ok(h.calls.upserted[0].tags.includes("Oslo"));
});

test("a previously owned device cannot upload another user's private local entries", async () => {
  const h = mock({ uid: "55555555-5555-4555-8555-555555555555" });
  h.local.set("aha_paradisavisa_cloud_owner_v1", "44444444-4444-4444-8444-444444444444");
  const upload = await h.api.upload();
  const download = await h.api.download();
  assert.equal(upload.ok, false);
  assert.equal(download.ok, false);
  assert.equal(h.calls.remote, 0);
});

test("download imports valid rows but cannot switch on automatic tracking", async () => {
  const h = mock({ tracking: false, articles: [], remote: [{
    article_id: "/Paradisavisa/artikler/en-test.html", title: "Samfunn og kultur",
    saved_at: "2026-11-12T08:00:00Z", read_at: null, opened_at: null,
    tags: ["Oslo"], open_count: 0
  }] });
  const result = await h.api.download();
  assert.equal(result.ok, true);
  assert.equal(h.calls.imports, 1);
  assert.equal(h.getTracking(), false);
  assert.equal(h.local.get("aha_paradisavisa_cloud_owner_v1"), h.uid);
});

test("explicit delete sends account-scoped delete only and retains local data", async () => {
  const h = mock();
  const result = await h.api.eraseCloud();
  assert.equal(result.ok, true);
  assert.equal(h.calls.deletes, 1);
  assert.equal(h.calls.remote, 1);
  assert.equal(h.calls.imports, 0);
});

test("owner verification never fetches the cloud library and rejects a different signed-in user", async () => {
  const h = mock({ uid: "55555555-5555-4555-8555-555555555555" });
  h.local.set("aha_paradisavisa_cloud_owner_v1", "44444444-4444-4444-8444-444444444444");
  const result = await h.api.checkLocalOwner();
  assert.equal(result.ok, false);
  assert.equal(h.calls.localOwnerAllowed, false);
  assert.equal(h.calls.remote, 0);
});

test("the original local library unlocks only after verified owner authentication", async () => {
  const h = mock();
  h.local.set("aha_paradisavisa_cloud_owner_v1", h.uid);
  const result = await h.api.checkLocalOwner();
  assert.equal(result.ok, true);
  assert.equal(h.calls.localOwnerAllowed, true);
  assert.equal(h.calls.remote, 0);
});

test("same-tab Supabase logout immediately locks a previously verified library", async () => {
  const h = mock();
  h.local.set("aha_paradisavisa_cloud_owner_v1", h.uid);
  const first = await h.api.checkLocalOwner();
  assert.equal(first.ok, true);
  assert.equal(h.calls.authSubscriptions, 1);
  assert.equal(h.calls.localOwnerAllowed, true);
  h.emitAuth("SIGNED_OUT");
  assert.equal(h.calls.localOwnerAllowed, false);
  h.emitAuth("SIGNED_IN");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.localOwnerAllowed, true);
  assert.equal(h.calls.authSubscriptions, 1, "Auth listener must not be duplicated");
  assert.equal(h.calls.remote, 0);
});

test("manual upload adopts its owner and subscribes to same-tab signout", async () => {
  const h = mock();
  assert.equal((await h.api.upload()).ok, true);
  assert.equal(h.calls.authSubscriptions, 1);
  h.emitAuth("SIGNED_OUT");
  assert.equal(h.calls.localOwnerAllowed, false);
});

test("upload binds the verified owner before the first network write", async () => {
  const h = mock();
  const result = await h.api.upload();
  assert.equal(result.ok, true);
  assert.equal(h.calls.ownerAtWrite, h.uid);
});

test("blocked local ownership storage prevents any cloud write or local import", async () => {
  const upload = mock({ refuseOwnerWrite: true });
  const a = await upload.api.upload();
  assert.equal(a.ok, false);
  assert.equal(upload.calls.writes, 0);
  assert.equal(upload.local.has("aha_paradisavisa_cloud_owner_v1"), false);

  const download = mock({ refuseOwnerWrite: true, articles: [], remote: [{
    article_id: "/Paradisavisa/artikler/en-test.html", title: "En trygg artikkel",
    saved_at: "2026-11-12T10:00:00Z", read_at: null, opened_at: null
  }] });
  const b = await download.api.download();
  assert.equal(b.ok, false);
  assert.equal(download.calls.imports, 0);
  assert.equal(download.local.has("aha_paradisavisa_cloud_owner_v1"), false);
});

test("upload refuses combined local plus cloud collection over 5000 before any write", async () => {
  const localArticles = Array.from({ length: 2700 }, (_, i) => article("/Paradisavisa/artikler/local-" + i + ".html"));
  const remoteArticles = Array.from({ length: 2400 }, (_, i) => ({
    article_id: "/Paradisavisa/artikler/remote-" + i + ".html",
    title: "En annen enhets artikkel " + i,
    saved_at: "2026-11-12T10:00:00Z"
  }));
  const h = mock({ articles: localArticles, remote: remoteArticles });
  const result = await h.api.upload();
  assert.equal(result.ok, false);
  assert.match(result.reason, /5000/);
  assert.equal(h.calls.writes, 0);
  assert.equal(h.local.has("aha_paradisavisa_cloud_owner_v1"), false);
});

test("oversized remote history must not be silently truncated or overwritten", async () => {
  const manyRows = Array.from({ length: 5001 }, (_, i) => ({
    article_id: "/Paradisavisa/artikler/test-" + i + ".html", title: "Artikkel " + i,
    saved_at: "2026-11-12T10:00:00Z"
  }));
  // A real 5001-row remote response must not be truncated at 5000.
  const h = mock({ remote: manyRows });
  const result = await h.api.upload();
  assert.equal(result.ok, false);
  assert.match(result.reason, /5000/);
  assert.equal(h.calls.writes, 0);
});

test("SQL enforces private account-based RLS on all operations", () => {
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /force row level security/i);
  for (const action of ["select", "insert", "update", "delete"]) {
    assert.match(sql, new RegExp("for " + action + " to authenticated", "i"));
  }
  assert.match(sql, /profile_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /revoke all on public\.aha_paradisavisa_reading_library from anon/i);
  assert.doesNotMatch(sql, /grant .* on public\.aha_paradisavisa_reading_library to anon/i);
  assert.doesNotMatch(sql, /grant .* on public\.aha_paradisavisa_reading_library to public/i);
});
