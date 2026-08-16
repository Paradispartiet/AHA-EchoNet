const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const WORKFLOW = ".github/workflows/aha-canonical-sync-public-staging-activation.yml";
const ROLE = "scripts/aha-canonical-sync-public-staging-activate.sh";
const RENDER = "scripts/aha-canonical-sync-public-staging-render.cjs";
const BLUEPRINT = "deploy/render/canonical-api-staging.yaml";
const DOC = "docs/AHA_CANONICAL_SYNC_PUBLIC_STAGING_DEPLOY_V1.md";

for (const file of [WORKFLOW, ROLE, RENDER, BLUEPRINT, DOC]) {
  assert.equal(fs.existsSync(file), true, `${file} mangler`);
}

execFileSync("bash", ["-n", ROLE], { stdio: "pipe" });
execFileSync(process.execPath, ["--check", RENDER], { stdio: "pipe" });

const workflow = fs.readFileSync(WORKFLOW, "utf8");
const role = fs.readFileSync(ROLE, "utf8");
const render = fs.readFileSync(RENDER, "utf8");
const blueprint = fs.readFileSync(BLUEPRINT, "utf8");
const docs = fs.readFileSync(DOC, "utf8");

// Manual-only, staging-only, least GitHub permissions.
assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|schedule):/m);
assert.match(workflow, /environment:\s*aha-postgresql-staging/);
assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
assert.doesNotMatch(workflow, /contents:\s*write|pull-requests:\s*write|actions:\s*write/);
assert.match(workflow, /RUN_AHA_CANONICAL_PUBLIC_STAGING_ACTIVATION/);
assert.match(workflow, /secrets\.AHA_STAGING_ADMIN_DATABASE_URL/);
assert.match(workflow, /secrets\.AHA_STAGING_DATABASE_CA_CERT/);
assert.match(workflow, /secrets\.RENDER_API_KEY/);
assert.doesNotMatch(workflow, /AHA_PRODUCTION|PRODUCTION_DATABASE|PROD_DATABASE/i);

// The dormant service is verified before the database role can become LOGIN.
const discoverIndex = workflow.indexOf("aha-canonical-sync-public-staging-render.cjs discover");
const activateIndex = workflow.indexOf("aha-canonical-sync-public-staging-activate.sh activate");
const stageIndex = workflow.indexOf("aha-canonical-sync-public-staging-render.cjs stage-runtime");
const deployIndex = workflow.indexOf("aha-canonical-sync-public-staging-render.cjs deploy");
assert.ok(discoverIndex >= 0 && discoverIndex < activateIndex);
assert.ok(activateIndex < stageIndex && stageIndex < deployIndex);
assert.match(workflow, /if:\s*always\(\)[\s\S]*activate\.sh rollback[\s\S]*rollback-runtime/);
assert.match(workflow, /AHA_PUBLIC_STAGING_ACTIVATION_COMMITTED=1/);

// Blueprint creation itself is health-only/dormant and contains no runtime DB secret.
assert.match(blueprint, /AHA_DATABASE_ENABLED[\s\S]*value:\s*["']false["']/);
assert.match(blueprint, /AHA_CANONICAL_SYNC_ENABLED[\s\S]*value:\s*["']false["']/);
assert.doesNotMatch(blueprint, /AHA_DATABASE_URL|AHA_DATABASE_SSL_CA_CERT/);
assert.match(blueprint, /autoDeployTrigger:\s*off/);

// Persistent role activation is one-time and fail-closed. Its EXECUTE check is
// effective, not merely direct: pg_proc + has_function_privilege catches a
// future AHA function accidentally exposed through PUBLIC or role membership.
assert.match(role, /ROLE_NAME='aha_canonical_staging_runtime'/);
assert.match(role, /EXPECTED_ROUTINES='bootstrap_sync_snapshot_v1,pull_sync_changes_v1,push_sync_change_v1'/);
assert.match(role, /rolcanlogin::int, rolsuper::int, rolbypassrls::int, rolcreatedb::int, rolcreaterole::int, rolinherit::int/);
assert.match(role, /pg_has_role\(runtime_role\.oid, privileged_role\.oid, 'member'\)/);
assert.match(role, /direct_write_grants/);
assert.match(role, /owned_objects/);
assert.match(role, /from pg_proc p/);
assert.match(role, /join pg_namespace n on n\.oid=p\.pronamespace/);
assert.match(role, /has_function_privilege\(:'role_name', p\.oid, 'EXECUTE'\)/);
assert.match(role, /accessible_routines/);
assert.match(role, /exact effective canonical-sync function boundary/);
assert.match(role, /alter role :\\"role_name\\" login password :'role_password'/);
assert.match(role, /alter role :\\"role_name\\" nologin password null/);
assert.match(role, /pg_terminate_backend/);
assert.match(role, /active_connections/);
assert.match(role, /PGSSLMODE=verify-full/);
assert.match(role, /PGSSLROOTCERT="\$AHA_POSTGRES_SSL_ROOT_CERT"/);
assert.match(role, /::add-mask::/);
assert.doesNotMatch(role, /\bset\s+-x\b/);
assert.doesNotMatch(role, /^\s*(?:env|printenv)(?:\s|$)/m);

// Render controller refuses a wrong service/config and requires public asymmetric JWKS.
assert.match(render, /SERVICE_NAME = "aha-canonical-api-staging"/);
assert.match(render, /EXPECTED_REPO = "https:\/\/github\.com\/Paradispartiet\/AHA-EchoNet"/);
assert.match(render, /EXPECTED_ROOT_DIR = "backend\/api"/);
assert.match(render, /AHA Auth JWKS has no asymmetric public signing key/);
assert.match(render, /\["RSA", "EC", "OKP"\]/);
assert.match(render, /AHA_DATABASE_ENABLED: "false"/);
assert.match(render, /AHA_CANONICAL_SYNC_ENABLED: "false"/);
assert.match(render, /already contains \$\{key\}; refusing one-time activation/);
assert.match(render, /AHA_DATABASE_URL/);
assert.match(render, /AHA_DATABASE_SSL_CA_CERT/);
assert.match(render, /AHA_DATABASE_ENABLED", "true"/);
assert.match(render, /AHA_CANONICAL_SYNC_ENABLED", "true"/);
assert.match(render, /AHA_CANONICAL_SYNC_ENABLED", "false"/);
assert.match(render, /AHA_DATABASE_ENABLED", "false"/);
assert.match(render, /commitId/);
assert.match(render, /status === "live"/);
assert.match(render, /\/v1\/health/);
assert.doesNotMatch(render, /console\.log\([^\n]*(?:RENDER_API_KEY|runtimeDsn|AHA_STAGING_DATABASE_CA_CERT)/);

for (const evidence of [
  "RUN_AHA_CANONICAL_PUBLIC_STAGING_ACTIVATION",
  "RENDER_API_KEY",
  "NOLOGIN",
  "asymmetrisk",
  "rollback",
  "health-only"
]) {
  assert.ok(docs.includes(evidence), `activation docs mangler: ${evidence}`);
}

console.log("aha-canonical-sync-public-staging-activation-v1.test.cjs passed");
