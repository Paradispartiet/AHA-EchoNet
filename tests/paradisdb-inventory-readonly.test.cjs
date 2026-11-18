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


test("scoped provider feed accepts a matching fresh timestamp, not private data", () => {
  const snapshot = {
    schema_version: 1, source: "docs/paradisdb-inventory.json", metadata_only: true,
    provider_checks: { "DB-03": {
      provider: "supabase", result: "verified",
      checked_at: "2026-11-18T13:00:00.000Z", observed_status: "ACTIVE_HEALTHY"
    } }
  };
  assert.equal(api.validateProviderSnapshot(snapshot, fixture()), snapshot);
  const text = api.describeProviderCheck("DB-03", snapshot, Date.parse("2026-11-18T13:10:00.000Z"));
  assert.match(text, /Supabase rapporterer ACTIVE_HEALTHY/);
  assert.match(text, /ikke applikasjonens synk/);
});
test("provider feed refuses invented references and bogus health claims", () => {
  const snapshot = {
    schema_version: 1, source: "docs/paradisdb-inventory.json", metadata_only: true,
    provider_checks: { "DB-99": {
      provider: "supabase", result: "verified",
      checked_at: "2026-11-18T13:00:00Z", observed_status: "ACTIVE_HEALTHY"
    } }
  };
  assert.throws(() => api.validateProviderSnapshot(snapshot, fixture()), /Ugyldig/);
  delete snapshot.provider_checks["DB-99"];
  snapshot.provider_checks["DB-03"] = {
    provider: "supabase", result: "verified", checked_at: null, observed_status: "ACTIVE_HEALTHY"
  };
  assert.throws(() => api.validateProviderSnapshot(snapshot, fixture()), /Ugyldig/);
});
test("stale and missing provider observations never display live health", () => {
  const snapshot = { provider_checks: { "DB-03": {
    provider: "supabase", result: "verified",
    checked_at: "2026-11-15T11:00:00Z", observed_status: "ACTIVE_HEALTHY"
  } } };
  const stale = api.describeProviderCheck("DB-03", snapshot, Date.parse("2026-11-18T13:00:00Z"));
  assert.match(stale, /Foreldet/);
  assert.doesNotMatch(stale, /ACTIVE_HEALTHY/);
  assert.match(api.describeProviderCheck("DB-03", null), /Ingen automatisk/);
  snapshot.provider_checks["DB-03"].result = "lookup_failed";
  assert.match(api.describeProviderCheck("DB-03", snapshot), /ikke bevis på nedetid/);
});
test("public provider fetch stays GET-only and uses no browser credentials", () => {
  assert.match(api.providerStatusUrl, /paradisdb-provider-status\.json$/);
  assert.match(source, /cache: "no-store"/);
  assert.match(source, /credentials: "omit"/);
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
});
