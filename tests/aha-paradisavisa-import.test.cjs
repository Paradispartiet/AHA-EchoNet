"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "..", "js", "ahaParadisavisa.js"), "utf8");
const key = "aha_paradisavisa_library_v1";
const id = "/Paradisavisa/artikler/kultur.html";
const url = "https://paradispartiet.github.io" + id;
const store = new Map();
const env = {
  document: { readyState: "loading", addEventListener() {} },
  localStorage: { getItem(k) { return store.get(k) || null; }, setItem(k, v) { store.set(k, v); } },
  location: { origin: "https://aha-annen-adresse.example.org" },
  URL, Date, console
};
env.window = env;
vm.createContext(env);
vm.runInContext(source, env);
const lib = env.AHAParadisavisa;
const input = { version: 1, trackingEnabled: true, articles: [
  { id, url, title: "Teater og kultur", summary: "Kultur i byen", excerpt: "Hovedscene", category: "Kultur",
    readAt: "2026-11-12T08:00:00Z", savedAt: "2026-11-12T08:05:00Z", tags: ["Kultur"] },
  { id: "/Paradisavisa/artikler/evil.html", url: "https://foreign.example.org/evil",
    title: "Falsk artikkel", readAt: "2026-11-12T08:00:00Z" }
] };
let result = lib.importData(input);
assert.equal(result.ok, true);
assert.equal(result.added, 1);
assert.equal(result.rejected, 1);
assert.equal(lib.load().articles.length, 1);
assert.equal(lib.load().articles[0].url, url);
assert.equal(lib.load().trackingEnabled, false, "Import must not enable monitoring");
result = lib.importData({ ...input, articles: [
  { ...input.articles[0], title: "Ny utgave", tags: ["Oppdatert"], savedAt: null }
] });
assert.equal(result.added, 0);
assert.equal(result.updated, 1);
assert.equal(lib.load().articles[0].savedAt, "2026-11-12T08:05:00Z", "Existing saved status is preserved");
assert.equal(lib.load().articles[0].title, "Teater og kultur", "Existing title is preserved");
assert.equal(new Set(lib.load().articles[0].tags).size, 2);
assert.equal(lib.importData({ version: 2, articles: input.articles }).ok, false);
assert.equal(lib.load().articles.length, 1);
console.log("PASS: explicit cross-origin import preserves local consent and rejects foreign sources");