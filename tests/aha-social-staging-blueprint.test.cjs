const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const blueprintPath = "deploy/render/social-api-staging.yaml";
const currentPath = "deploy/render/canonical-api-staging.yaml";
const rootPath = "render.yaml";

function read(path) {
  assert.equal(fs.existsSync(path), true, "Missing " + path);
  return fs.readFileSync(path, "utf8");
}
function parseScalar(text, key) {
  // Only parse the strictly limited env key/value stanza format used by
  // this Blueprint; reject duplicate keys and unset, inherited secrets.
  const lines = text.split(/\r?\n/);
  const values = [];
  for (let i=0; i<lines.length; i++) {
    if (lines[i].trim() === "- key: " + key) {
      const next = lines[i+1] || "";
      const match = next.match(/^\s+value: (.+)$/);
      assert.ok(match, "Missing explicit value for " + key);
      values.push(match[1].replace(/^["']|["']$/g, ""));
    }
  }
  assert.equal(values.length, 1, "Expected unique explicit " + key);
  return values[0];
}

test("dedicated social staging is source-only and does not touch canonical or active Render service", () => {
  const current = read(currentPath);
  const root = read(rootPath);
  const staging = read(blueprintPath);
  assert.match(staging,/name:\s*aha-social-api-staging\b/);
  assert.match(staging,/rootDir:\s*backend\/api/);
  assert.match(staging,/branch:\s*main/);
  assert.match(staging,/autoDeployTrigger:\s*off/);
  assert.doesNotMatch(staging,/^\s*autoDeploy:/m);
  assert.match(staging,/healthCheckPath:\s*\/v1\/health/);
  assert.doesNotMatch(root,/aha-social-api-staging/);
  assert.doesNotMatch(current,/aha-social-api-staging/);
  assert.match(current,/name:\s*aha-canonical-api-staging/);
  assert.equal(parseScalar(staging,"NODE_ENV"),"development");
  assert.equal(parseScalar(current,"NODE_ENV"),"production");
  assert.match(staging,/plan:\s*free/);
});

test("social preview starts database-off, sharing-off and sync-off", () => {
  const staging = read(blueprintPath);
  for (const key of [
    "AHA_SOCIAL_STAGING_ENABLED",
    "AHA_DATABASE_ENABLED",
    "AHA_CANONICAL_SYNC_ENABLED",
    "AHA_LOCAL_IMPORT_ENABLED",
    "AHA_RUNTIME_ACTIVATED"
  ]) {
    assert.equal(parseScalar(staging,key),"false");
  }
  assert.equal(parseScalar(staging,"AHA_DATABASE_SSL_MODE"),"verify-full");
  assert.equal(parseScalar(staging,"AHA_ALLOWED_ORIGINS"),"https://paradispartiet.github.io");
  assert.equal(parseScalar(staging,"AHA_AUTH_PROVIDER"),"supabase");
  assert.match(staging,/AHA_AUDIT_HASH_SALT[\s\S]*generateValue:\s*true/);
  // Staging must not embed an Auth issuer: it cannot verify tokens or
  // share content until a later, explicitly approved setup.
  assert.doesNotMatch(staging,/AHA_AUTH_ISSUER|AHA_AUTH_JWKS_URL|AHA_AUTH_AUDIENCE/);
  // No database hostname or credential or prod rollout override is seeded.
  assert.doesNotMatch(staging,/(?:AHA_DATABASE_URL|AHA_STAGING_ADMIN_DATABASE_URL|AHA_DATABASE_SSL_CA_CERT|AHA_PRODUCTION_|AHA_SOCIAL_MEDIA_ORIGINS|SERVICE_ROLE_KEY)/);
  assert.doesNotMatch(staging,/postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(staging,/-----BEGIN CERTIFICATE-----/);
});

test("API release gate independently refuses production and unknown environments", () => {
  const gate = read("backend/api/src/social/social-shared.ts");
  assert.match(gate,/!\["test", "development"\]\.includes\(String\(process\.env\.NODE_ENV \|\| ""\)\)/);
  assert.match(gate,/process\.env\.AHA_SOCIAL_STAGING_ENABLED !== "true"/);
  const hold = JSON.parse(read("ops/canonical-sync-production-rollout-v1.json"));
  assert.equal(hold.status,"cost_hold_remote_disabled");
  assert.equal(hold.productionActivationEnabled,false);
  assert.equal(hold.frontend.remoteProductionSyncAllowed,false);
  assert.equal(hold.frontend.egressCostHoldActive,true);
  assert.equal(hold.pilot.groupOrPublicSharingAllowed,false);
});
