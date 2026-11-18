"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(ROOT, "js/ahaDatabaseInventory.js"), "utf8");
const page = fs.readFileSync(path.join(ROOT, "databaser.html"), "utf8");
const modules = fs.readFileSync(path.join(ROOT, "js/ahaModules.js"), "utf8");
const navigation = fs.readFileSync(path.join(ROOT, "js/ahaGlobalNav.js"), "utf8");
const fakeWindow = { document: { readyState: "loading", addEventListener() {} } };
vm.runInNewContext(source, { window: fakeWindow }, { filename: "ahaDatabaseInventory.js" });
const api = fakeWindow.AHAParadisDB;

function fixture() {
  return {
    schema_version: 1, source: "docs/DATABASE_REGISTER.md",
    metadata_only: true, live_paradisdb_sync_verified: false,
    databases: [{ id: "DB-03", system: "AHA", provider_environment: "Supabase", verification: "Dokumentert" }],
    projects: [
      { id: "PRJ-01", name: "AHA", repository: "AHA-EchoNet", database_ids: ["DB-03"] },
      { id: "PRJ-02", name: "Civication", repository: "History-Go", database_ids: [] }
    ]
  };
}
test("validates the canonical metadata schema and counts project links", () => {
  const stats = api.summarize(fixture());
  assert.deepEqual(JSON.parse(JSON.stringify(stats)), { databases: 1, projects: 2, unmapped: 1 });
});
test("rejects invented database links rather than inventing live infrastructure", () => {
  const data = fixture();
  data.projects[0].database_ids.push("DB-99");
  assert.throws(() => api.validateInventory(data), /databasekobling/);
});
test("rejects claimed live sync and non-metadata source", () => {
  const data = fixture();
  data.live_paradisdb_sync_verified = true;
  assert.throws(() => api.validateInventory(data), /registerformat/);
  data.live_paradisdb_sync_verified = false;
  data.source = "local-copy.json";
  assert.throws(() => api.validateInventory(data), /registerformat/);
});
test("rejects duplicate IDs and unsafe repository names", () => {
  const data = fixture();
  data.projects[1].id = "PRJ-01";
  assert.throws(() => api.validateInventory(data), /databasekobling/);
  data.projects[1].id = "PRJ-02";
  data.projects[1].repository = "javascript:alert(1)";
  assert.throws(() => api.validateInventory(data), /databasekobling/);
});
test("AHA menu links to the existing read-only page", () => {
  assert.match(modules, /id: "databaser",[\s\S]*?href: "databaser\.html"/);
  assert.match(navigation, /moduleId: "databaser"/);
  assert.match(page, /js\/ahaDatabaseInventory\.js/);
  assert.match(page, /id="aha-paradisdb-main"/);
  assert.match(page, /ikke direkte kontakt med databasene/);
});
test("source is read-only metadata from the canonical GitHub file", () => {
  assert.match(api.sourceUrl, /Paradispartiet\/Paradispartiet\/main\/docs\/paradisdb-inventory\.json/);
  assert.match(source, /credentials: "omit"/);
  assert.doesNotMatch(source, /\.(?:insert|upsert|update|delete|rpc)\s*\(/);
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
});
