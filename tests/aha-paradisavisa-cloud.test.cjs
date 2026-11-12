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
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    order() { return chain; },
    range() { calls.reads++; calls.remote++; return Promise.resolve({ data: remote, error: null }); },
    upsert(rows, { onConflict }) {
      assert.equal(onConflict, "profile_id,article_id");
      calls.writes++;
      calls.remote++;
      calls.upserted = rows;
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
    auth: { async getUser() { calls.verified++;
      return options.guest ? { data: { user: null }, error: null }
        : { data: { user: { id: uid, is_anonymous: false } }, error: null };
    } },
    from(table) { assert.equal(table, "aha_paradisavisa_reading_library"); return chain; }
  };
  const env = {
    URL, Date, Promise, console, Array,
    localStorage: {
      getItem: (key) => local.get(key) || null,
      setItem: (key, val) => local.set(key, val),
      removeItem: (key) => local.delete(key)
    },
    document: { readyState: "loading", addEventListener() {}, getElementById() { return null; } },
    AHADb: { getClient: () => client },
    AHAParadisavisa: {
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
  return { api: env.AHAParadisavisaCloud, calls, local, uid, getTracking: () => tracking };
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
