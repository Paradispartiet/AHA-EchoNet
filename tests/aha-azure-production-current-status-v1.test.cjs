const assert = require("node:assert/strict");
const fs = require("node:fs");

const path = "docs/AHA_AZURE_PRODUCTION_PLATFORM_V1.md";
assert.equal(fs.existsSync(path), true, `${path} mangler`);
const source = fs.readFileSync(path, "utf8");

assert.match(source, /deployet i Azure North Europe/i);
assert.match(source, /bounded manual production-pilot med nøyaktig 2 verifiserte profiler/i);
assert.match(source, /AHA_CANONICAL_PRODUCTION_PILOT_STATUS\.md/);
assert.match(source, /canonical-sync-production-pilot-proof-v1\.json/);
assert.match(source, /northeurope/i);
assert.match(source, /aha-canonical-sync-production-pilot-activation\.yml/);
assert.match(source, /aha-canonical-sync-production-pilot-expansion-activation\.yml/);
assert.match(source, /aha-canonical-sync-production-pilot-post-activation-verification\.yml/);
assert.match(source, /aha-canonical-sync-production-pilot-profile-rollback\.yml/);
assert.match(source, /aha-canonical-sync-production-pilot-rollback\.yml/);
assert.match(source, /COMMITTED_ONE_PROFILE/);
assert.match(source, /ikke dagens fleet-status/i);
assert.match(source, /automatic sync[\s\S]*login-triggered sync[\s\S]*auth-ready-triggered sync[\s\S]*background sync/i);
assert.match(source, /Profil #3 er pauset/i);
assert.match(source, /real-data roundtrip for BOTH profiles/i);
assert.match(source, /readiness-runneren får ikke production admin-DSN eller database-CA/i);
assert.match(source, /Offentlig GitHub-runner kobler aldri direkte til private PostgreSQL/i);
assert.match(source, /AHA_PRODUCTION_PILOT_EXPANSION_ACCESS_TOKEN/);
assert.match(source, /skal fjernes fra alle environments/i);

assert.doesNotMatch(source, /Status:\s*\*\*produksjonsplattform definert i kode; ikke deployet/i);
assert.doesNotMatch(source, /Status:[^\n]*én-profil canonical pilot er aktiv/i);
assert.doesNotMatch(source, /Sync er server-side begrenset til én protected pilotprofil/i);
assert.doesNotMatch(source, /Denne leveransen oppretter \*\*ikke\*\* `RUN_AHA_CANONICAL_PRODUCTION_PILOT_ACTIVATION`-workflowen/i);
assert.doesNotMatch(source, /Der legges API-origin, production admin DSN\/CA for read-only readiness/i);
assert.doesNotMatch(source, /FØRST DA:\s*separat one-profile pilot activation/i);

// The current-state runbook must not materialize protected identity or credentials.
assert.doesNotMatch(source, /e59cf60f-74e4-4db4-98c7-5c35bddfed48/i);
assert.doesNotMatch(source, /postgres(?:ql)?:\/\//i);
assert.doesNotMatch(source, /bearer\s+[a-z0-9._-]+/i);

console.log("aha-azure-production-current-status-v1.test.cjs passed");
