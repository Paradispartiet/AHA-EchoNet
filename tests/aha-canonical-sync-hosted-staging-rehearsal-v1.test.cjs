const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const WORKFLOW = ".github/workflows/aha-canonical-sync-hosted-staging-rehearsal.yml";
const PREPARE = "scripts/aha-canonical-sync-hosted-staging-prepare.sh";
const E2E = "scripts/aha-canonical-sync-hosted-staging-e2e.cjs";
const DOC = "docs/AHA_CANONICAL_SYNC_HOSTED_STAGING_REHEARSAL_V1.md";

for (const file of [WORKFLOW, PREPARE, E2E, DOC]) {
  assert.equal(fs.existsSync(file), true, `${file} mangler`);
}

execFileSync("bash", ["-n", PREPARE], { stdio: "pipe" });
execFileSync(process.execPath, ["--check", E2E], { stdio: "pipe" });

const workflow = fs.readFileSync(WORKFLOW, "utf8");
const prepare = fs.readFileSync(PREPARE, "utf8");
const e2e = fs.readFileSync(E2E, "utf8");
const docs = fs.readFileSync(DOC, "utf8");

// Manual staging-only dispatch. Never push/PR/schedule and never a production environment.
assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|schedule):/m);
assert.match(workflow, /environment:\s*aha-postgresql-staging/);
assert.doesNotMatch(workflow, /environment:\s*(?:production|prod)\b/i);
assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
assert.doesNotMatch(workflow, /contents:\s*write|pull-requests:\s*write|actions:\s*write/);
assert.match(workflow, /RUN_AHA_CANONICAL_SYNC_HOSTED_STAGING_REHEARSAL/);
assert.match(workflow, /AHA_STAGING_PROJECT_REF:\s*sstuzwppsheivczyqrim/);
assert.match(workflow, /AHA_DATABASE_ENABLED:\s*["']true["']/);
assert.match(workflow, /AHA_CANONICAL_SYNC_ENABLED:\s*["']true["']/);
assert.match(workflow, /AHA_LOCAL_IMPORT_ENABLED:\s*["']false["']/);
assert.match(workflow, /AHA_DATABASE_SSL_MODE:\s*verify-full/);
assert.match(workflow, /AHA_STAGING_SYNC_BEARER_TOKEN:\s*\$\{\{\s*secrets\.AHA_STAGING_SYNC_BEARER_TOKEN\s*\}\}/);
assert.match(workflow, /AHA_STAGING_AUDIT_HASH_SALT:\s*\$\{\{\s*secrets\.AHA_STAGING_AUDIT_HASH_SALT\s*\}\}/);
for (const variable of ["AHA_STAGING_AUTH_ISSUER", "AHA_STAGING_AUTH_AUDIENCE", "AHA_STAGING_AUTH_JWKS_URL"]) {
  assert.match(workflow, new RegExp(`vars\\.${variable}`));
}
assert.doesNotMatch(workflow, /AHA_PRODUCTION|PRODUCTION_DATABASE|PROD_DATABASE|production.*secret/i);
assert.match(workflow, /127\.0\.0\.1:3100/);
assert.doesNotMatch(workflow, /vercel|render\.com|kubectl|docker\s+push|az\s+webapp|azure\/webapps-deploy/i, "hosted rehearsal must not deploy a public API");
assert.match(workflow, /aha-postgresql-hosted-staging-preflight\.sh/);
assert.match(workflow, /aha-canonical-sync-hosted-staging-prepare\.sh/);
assert.match(workflow, /aha-canonical-sync-hosted-staging-e2e\.cjs/);

// Preparation may use admin only for the three top-level grants + a dedicated fixture.
assert.match(prepare, /set -euo pipefail/);
assert.doesNotMatch(prepare, /\bset\s+-x\b/);
assert.doesNotMatch(prepare, /^\s*(?:env|printenv)(?:\s|$)/m);
assert.match(prepare, /aha-staging-sync-e2e-profile-v1/);
assert.match(prepare, /aha-staging-sync-e2e-workspace-v1/);
assert.match(prepare, /auth_provider='supabase'/);
assert.match(prepare, /non-fixture canonical profile; refusing rehearsal/);
assert.match(prepare, /different auth subject; refusing rehearsal/);
assert.match(prepare, /direct canonical table-write grants/);
assert.match(prepare, /Runtime role acquired a forbidden canonical table-write grant/);

const grants = [...prepare.matchAll(/grant execute on function\s+([^;]+?)\s+to\s+/gi)].map((match) => match[1].trim());
assert.deepEqual(grants, ["${fn}"], "grants must be emitted only through the explicit three-function loop");
for (const functionSignature of [
  "aha.bootstrap_sync_snapshot_v1(text,text,bigint,integer)",
  "aha.pull_sync_changes_v1(text,bigint,integer)",
  "aha.push_sync_change_v1(text,text,text,text,text,text,bigint,text,jsonb)"
]) {
  assert.ok(prepare.includes(functionSignature), `missing top-level grant signature ${functionSignature}`);
}
for (const helperSignature of [
  "aha.sync_object_snapshot_v1(text,text,text)",
  "aha.record_sync_conflict_v1(text,text,text,text,text,text,bigint,bigint,text,text,text,text,jsonb)",
  "aha.sync_apply_upsert_v1(text,text,text,text,jsonb,boolean)",
  "aha.sync_apply_delete_v1(text,text,text)"
]) {
  assert.ok(prepare.includes(helperSignature), `internal helper privilege check missing: ${helperSignature}`);
}
assert.doesNotMatch(prepare, /grant\s+(?:insert|update|delete|truncate|references|trigger|all)\s+on\s+(?:table|all\s+tables)/i);
assert.doesNotMatch(prepare, /grant\s+execute\s+on\s+(?:all\s+functions|function\s+aha\.(?:sync_object_snapshot|record_sync_conflict|sync_apply_))/i);

for (const secretVar of ["AHA_STAGING_ADMIN_DATABASE_URL", "AHA_STAGING_RUNTIME_DATABASE_URL", "AHA_STAGING_SYNC_BEARER_TOKEN"]) {
  const expanded = String.raw`(?:\$${secretVar}|\$\{${secretVar}\})`;
  assert.doesNotMatch(prepare, new RegExp(String.raw`(?:echo|printf)[^\n]*${expanded}`));
}
assert.doesNotMatch(e2e, /console\.log\s*\([^\n]*(?:TOKEN|Bearer|authorization|serverState|payload\s*:)/i);

// The HTTP rehearsal must prove the real state machine, not just health/readiness.
for (const marker of [
  "/v1/health",
  "/v1/sync/bootstrap",
  "/v1/sync/pull",
  "/v1/sync/push",
  "idempotentReplay",
  "stale_base_revision",
  'operation: "delete"',
  "hashPayload(null)",
  "bootstrap must retain the deleted canonical object as a tombstone"
]) {
  assert.ok(e2e.includes(marker), `hosted HTTP rehearsal must retain marker: ${marker}`);
}
assert.match(e2e, /initial\.highWatermark/);
assert.match(e2e, /upsertCursor/);
assert.match(e2e, /deleteCursor/);
assert.match(e2e, /payload:\s*null/);
assert.doesNotMatch(e2e, /syncFromDatabase\s*\(/);
assert.doesNotMatch(e2e, /localStorage|indexedDB|AHARepository/);

for (const evidence of [
  "ingen production activation",
  "workflow_dispatch",
  "AHA_STAGING_SYNC_BEARER_TOKEN",
  "aha-staging-sync-e2e-workspace-v1",
  "stale_base_revision",
  "payload=null",
  "ingen offentlig URL"
]) {
  assert.ok(docs.includes(evidence), `hosted rehearsal docs must retain: ${evidence}`);
}

console.log("aha-canonical-sync-hosted-staging-rehearsal-v1.test.cjs passed");
