const assert = require("node:assert/strict");
const fs = require("node:fs");

const BLUEPRINT = "deploy/render/canonical-api-staging.yaml";
const ROOT_BLUEPRINT = "render.yaml";
const DB_CONFIG = "backend/api/src/database/database-config.ts";
const PG_PROVIDER = "backend/api/src/database/pg-connection.provider.ts";
const DOC = "docs/AHA_CANONICAL_SYNC_PUBLIC_STAGING_DEPLOY_V1.md";

for (const file of [BLUEPRINT, ROOT_BLUEPRINT, DB_CONFIG, PG_PROVIDER, DOC]) {
  assert.equal(fs.existsSync(file), true, `${file} mangler`);
}

const blueprint = fs.readFileSync(BLUEPRINT, "utf8");
const rootBlueprint = fs.readFileSync(ROOT_BLUEPRINT, "utf8");
const dbConfig = fs.readFileSync(DB_CONFIG, "utf8");
const pgProvider = fs.readFileSync(PG_PROVIDER, "utf8");
const docs = fs.readFileSync(DOC, "utf8");

// Public staging must be a separate opt-in service definition. The active root
// Render Blueprint is intentionally untouched by this port.
assert.match(blueprint, /name:\s*aha-canonical-api-staging/);
assert.match(blueprint, /rootDir:\s*backend\/api/);
assert.match(blueprint, /branch:\s*main/);
assert.match(blueprint, /healthCheckPath:\s*\/v1\/health/);
assert.match(blueprint, /autoDeployTrigger:\s*off/);
assert.doesNotMatch(blueprint, /\bautoDeploy:\s*/);
assert.doesNotMatch(rootBlueprint, /aha-canonical-api-staging/);

// The staging API runs only canonical sync, never local import or production
// activation, and accepts browser CORS only from the AHA static origin.
assert.match(blueprint, /AHA_CANONICAL_SYNC_ENABLED[\s\S]*value:\s*["']true["']/);
assert.match(blueprint, /AHA_LOCAL_IMPORT_ENABLED[\s\S]*value:\s*["']false["']/);
assert.match(blueprint, /AHA_DATABASE_SSL_MODE[\s\S]*value:\s*verify-full/);
assert.match(blueprint, /AHA_ALLOWED_ORIGINS[\s\S]*value:\s*https:\/\/paradispartiet\.github\.io/);
assert.doesNotMatch(blueprint, /AHA_STAGING_ADMIN_DATABASE_URL|service[_-]?role|AHA_PRODUCTION|PRODUCTION_DATABASE|PROD_DATABASE/i);

// Browser sessions are issued by the existing AHA Supabase Auth project. The
// API must verify signature + exact issuer/audience through its public JWKS.
assert.match(blueprint, /AHA_AUTH_PROVIDER[\s\S]*value:\s*supabase/);
assert.match(blueprint, /AHA_AUTH_ISSUER[\s\S]*wshmybqyksrwkawqleiz\.supabase\.co\/auth\/v1/);
assert.match(blueprint, /AHA_AUTH_AUDIENCE[\s\S]*value:\s*authenticated/);
assert.match(blueprint, /AHA_AUTH_JWKS_URL[\s\S]*wshmybqyksrwkawqleiz\.supabase\.co\/auth\/v1\/\.well-known\/jwks\.json/);

// Long-lived runtime DB credentials and the Supabase root CA stay out of Git.
assert.match(blueprint, /AHA_DATABASE_URL\s*\n\s*sync:\s*false/);
assert.match(blueprint, /AHA_DATABASE_SSL_CA_CERT\s*\n\s*sync:\s*false/);
assert.doesNotMatch(blueprint, /postgres(?:ql)?:\/\//i);
assert.doesNotMatch(blueprint, /-----BEGIN CERTIFICATE-----/);

// The native NestJS pg adapter accepts an explicit CA without weakening
// certificate or hostname verification. With a custom CA, DSN SSL parameters
// that would replace node-postgres' ssl object are rejected.
assert.match(dbConfig, /sslCaCertificate:\s*string \| null/);
assert.match(dbConfig, /AHA_DATABASE_SSL_CA_CERT/);
assert.match(dbConfig, /requires AHA_DATABASE_SSL_MODE=verify-full/);
assert.match(dbConfig, /\["sslmode", "sslcert", "sslkey", "sslrootcert"\]/);
assert.match(dbConfig, /must not contain \$\{key\}/);
assert.match(pgProvider, /rejectUnauthorized:\s*config\.sslMode === "verify-full"/);
assert.match(pgProvider, /config\.sslCaCertificate \? \{ ca: config\.sslCaCertificate \}/);

for (const evidence of [
  "Run #8",
  "browser → NestJS → PostgreSQL → browser",
  "deploy/render/canonical-api-staging.yaml",
  "persistent",
  "NOINHERIT",
  "AHA_DATABASE_SSL_CA_CERT",
  "ingen production activation",
  "ADR-006"
]) {
  assert.ok(docs.includes(evidence), `deploy docs mangler: ${evidence}`);
}

console.log("aha-canonical-sync-public-staging-deploy-v1.test.cjs passed");
