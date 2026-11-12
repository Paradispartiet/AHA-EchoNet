"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const librarySource = fs.readFileSync(path.join(root, "js/ahaParadisavisa.js"), "utf8");
const mindmapSource = fs.readFileSync(path.join(root, "js/ahaMindmap.js"), "utf8");
const page = fs.readFileSync(path.join(root, "paradisavisa.html"), "utf8");
const ID = "/Paradisavisa/artikler/privat.html";
const article = {
  id: ID, url: "https://paradispartiet.github.io" + ID, title: "Privat leselogg",
  summary: "Dette er ikke offentlig på nettleseren", savedAt: "2026-11-12T10:00:00Z"
};
function boot() {
  const store = new Map([
    ["aha_paradisavisa_cloud_owner_v1", "11111111-1111-4111-8111-111111111111"],
    ["aha_paradisavisa_library_v1", JSON.stringify({ version: 1, trackingEnabled: true, articles: [article] })]
  ]);
  let writes = 0;
  const env = {
    URL, Date, console, Math, Array,
    localStorage: {
      getItem: key => store.get(key) || null,
      setItem: (key, val) => { writes++; store.set(key, val); }
    },
    location: { origin: "https://paradispartiet.github.io" },
    document: {
      readyState: "loading", addEventListener() {},
      getElementById() { return null; }
    }
  };
  env.window = env;
  vm.runInNewContext(librarySource, env);
  vm.runInNewContext(mindmapSource, env);
  return { env, store, writes: () => writes };
}

test("AHA library hides owner-bound article records until the account has been verified", () => {
  const h = boot();
  assert.equal(h.env.AHAParadisavisa.load().articles.length, 0);
  assert.equal(h.env.AHAParadisavisa.localAccessAllowed(), false);
  assert.equal(h.writes(), 0);
  assert.equal(h.env.AHAMindmap.collectGraphData().nodes.some(n => n.source === "paradisavisa"), false,
    "The mindmap must also suppress nodes until the same owner is verified");
  assert.match(page, /id="aha-avisa-owner-notice"/);
});

test("No imported article can overwrite a locked local library", () => {
  const h = boot();
  const original = h.store.get("aha_paradisavisa_library_v1");
  const out = h.env.AHAParadisavisa.importData({ version: 1, articles: [article] });
  assert.equal(out.ok, false);
  assert.equal(h.store.get("aha_paradisavisa_library_v1"), original);
  assert.equal(h.writes(), 0);
});

test("Verified owner can view original local records; later logout re-locks them", () => {
  const h = boot();
  h.env.AHAParadisavisa.setOwnerAccess(true);
  assert.equal(h.env.AHAParadisavisa.load().articles.length, 1);
  h.env.AHAParadisavisa.setOwnerAccess(false);
  assert.equal(h.env.AHAParadisavisa.load().articles.length, 0);
  assert.equal(h.writes(), 0);
});

test("Unbound guest library remains usable, without mandatory AHA login", () => {
  const h = boot();
  h.store.delete("aha_paradisavisa_cloud_owner_v1");
  assert.equal(h.env.AHAParadisavisa.localAccessAllowed(), true);
  assert.equal(h.env.AHAParadisavisa.load().articles.length, 1);
});
