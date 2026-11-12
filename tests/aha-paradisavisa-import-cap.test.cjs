"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "js", "ahaParadisavisa.js"), "utf8");
const PREFIX = "https://paradispartiet.github.io";
const KEY = "aha_paradisavisa_library_v1";
const makeArticle = (id) => ({
  id: "/Paradisavisa/artikler/" + id + ".html",
  url: PREFIX + "/Paradisavisa/artikler/" + id + ".html",
  title: "Tittel " + id, savedAt: "2026-11-12T10:00:00.000Z"
});
function harness(articles) {
  const storage = new Map([[KEY, JSON.stringify({ version: 1, trackingEnabled: false, articles })]]);
  let writes = 0;
  const ctx = {
    URL, Date, console,
    location: { origin: PREFIX },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => { writes++; storage.set(key, value); }
    },
    document: {
      readyState: "loading",
      getElementById() { return null; },
      addEventListener() {}
    }
  };
  ctx.window = ctx;
  vm.runInNewContext(source, ctx, { filename: "ahaParadisavisa.js" });
  return { api: ctx.AHAParadisavisa, storage, writes: () => writes };
}

test("merge does not silently delete old saves if imported plus local rows exceed 5000", () => {
  const local = Array.from({ length: 3000 }, (_, i) => makeArticle("local-" + i));
  const incoming = Array.from({ length: 2500 }, (_, i) => makeArticle("remote-" + i));
  const h = harness(local);
  const oldValue = h.storage.get(KEY);
  const result = h.api.importData({ version: 1, articles: incoming, trackingEnabled: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "too_many_articles");
  assert.equal(h.storage.get(KEY), oldValue);
  assert.equal(h.writes(), 0);
  assert.equal(h.api.load().articles.length, 3000);
  assert.equal(h.api.load().trackingEnabled, false);
});

test("merge at the 5000 article limit keeps every saved row and does not enable tracking", () => {
  const local = Array.from({ length: 2500 }, (_, i) => makeArticle("local-" + i));
  const incoming = Array.from({ length: 2500 }, (_, i) => makeArticle("remote-" + i));
  const h = harness(local);
  const result = h.api.importData({ version: 1, articles: incoming, trackingEnabled: true });
  assert.equal(result.ok, true);
  assert.equal(result.added, 2500);
  assert.equal(h.api.load().articles.length, 5000);
  assert.equal(h.api.load().trackingEnabled, false);
  assert.equal(h.writes(), 1);
});
