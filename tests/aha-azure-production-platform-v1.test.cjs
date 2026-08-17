const assert = require("node:assert/strict");
const fs = require("node:fs");

const files = {
  main: "infra/azure/production/main.bicep",
  platform: "infra/azure/production/platform.bicep",
  operations: "infra/azure/production/operations.bicep",
  app: "infra/azure/production/app.bicep",
  job: "infra/azure/production/db-init-job.bicep",
  pgConfig: "infra/azure/production/postgres-config.bicep",
  roles: "infra/azure/production/db-init/roles.sql",
  runner: "infra/azure/production/db-init/run.sh",
  apiDocker: "backend/api/Dockerfile",
  dbDocker: "infra/azure/production/db-init/Dockerfile",
  workflow: ".github/workflows/aha-azure-production-platform-deploy.yml",
  validation: ".github/workflows/aha-azure-production-iac-validation.yml",
  health: "backend/api/src/health.controller.ts",
  rollout: "ops/canonical-sync-production-rollout-v1.json"
};

for (const path of Object.values(files)) {
  assert.equal(fs.existsSync(path), true, `${path} mangler`);
}

const source = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, fs.readFileSync(path, "utf8")]));
const rollout = JSON.parse(source.rollout);

assert.equal(rollout.productionActivationEnabled, false);
assert.equal(rollout.activation.enabled, false);
assert.equal(rollout.hosting.target, "azure_container_apps");
assert.equal(rollout.database.stagingReuseAllowed, false);
assert.equal(rollout.database.legacyPrimaryReuseAllowed, false);

// Production foundation must be isolated, private at the database boundary and
// reconstructable from reviewed Bicep.
assert.match(source.main, /targetScope = 'subscription'/);
assert.match(source.main, /Microsoft\.Resources\/resourceGroups/);
assert.match(source.platform, /Microsoft\.App\/managedEnvironments@2025-01-01/);
assert.match(source.platform, /Microsoft\.DBforPostgreSQL\/flexibleServers@2025-08-01/);
assert.match(source.platform, /publicNetworkAccess:\s*'Disabled'/);
assert.match(source.platform, /delegatedSubnetResourceId/);
assert.match(source.platform, /privateDnsZoneArmResourceId/);
assert.match(source.platform, /backupRetentionDays:\s*35/);
assert.match(source.platform, /Microsoft\.KeyVault\/vaults@2025-05-01/);
assert.match(source.platform, /enablePurgeProtection:\s*true/);
assert.match(source.platform, /enableRbacAuthorization:\s*true/);
assert.match(source.platform, /adminUserEnabled:\s*false/);
assert.match(source.pgConfig, /name:\s*'azure\.extensions'/);
assert.match(source.pgConfig, /value:\s*'pgcrypto'/);

// Runtime and migration credentials must live behind different identities and vaults.
assert.match(source.operations, /migrationIdentityName/);
assert.match(source.operations, /operationsKeyVaultName/);
assert.match(source.main, /operationsKeyVaultName/);
assert.match(source.main, /migrationIdentityName/);
assert.doesNotMatch(source.app, /admin-database-url|POSTGRES_ADMIN|readiness-password/i);
assert.match(source.job, /admin-database-url/);
assert.match(source.workflow, /AHA_PRODUCTION_RUNTIME_KEYVAULT/);
assert.match(source.workflow, /AHA_PRODUCTION_OPS_KEYVAULT/);
assert.match(source.workflow, /aha-production-admin-database-url/);
assert.match(source.workflow, /aha-production-database-url/);

// The API deploy is production-shaped but canonical sync remains disabled.
assert.match(source.app, /AHA_DATABASE_ENABLED/);
assert.match(source.app, /AHA_DATABASE_SSL_MODE/);
assert.match(source.app, /value:\s*'verify-full'/);
assert.match(source.app, /AHA_CANONICAL_SYNC_ENABLED/);
assert.match(source.app, /AHA_CANONICAL_SYNC_ENABLED'[\s\S]*?value:\s*'false'/);
assert.match(source.app, /AHA_LOCAL_IMPORT_ENABLED'[\s\S]*?value:\s*'false'/);
assert.doesNotMatch(source.app, /onrender\.com/i);
assert.doesNotMatch(source.workflow, /RUN_AHA_CANONICAL_PRODUCTION_PILOT_ACTIVATION/);

// Database initialization applies the canonical migration set in deterministic
// order over verify-full and creates a separate health identity plus a NOLOGIN runtime.
assert.match(source.runner, /PGSSLMODE=verify-full/);
assert.match(source.runner, /find \/aha\/migrations[\s\S]*sort/);
assert.match(source.runner, /aha_canonical_production_readiness/);
assert.match(source.runner, /aha_canonical_production_runtime/);
assert.match(source.roles, /aha_canonical_production_readiness[\s\S]*login nosuperuser nobypassrls nocreatedb nocreaterole noinherit/i);
assert.match(source.roles, /aha_canonical_production_runtime[\s\S]*nologin nosuperuser nobypassrls nocreatedb nocreaterole noinherit/i);
assert.match(source.roles, /revoke execute on all functions in schema aha from public/i);
assert.match(source.roles, /bootstrap_sync_snapshot_v1\(text,text,bigint,integer\)/);
assert.match(source.roles, /pull_sync_changes_v1\(text,bigint,integer\)/);
assert.match(source.roles, /push_sync_change_v1\(text,text,text,text,text,text,bigint,text,jsonb\)/);
assert.doesNotMatch(source.roles, /grant\s+(insert|update|delete|truncate)/i);

// Production images run without root and pin the Node major/minor patch used by the tested build.
assert.match(source.apiDocker, /FROM node:22\.23\.2-alpine/);
assert.match(source.apiDocker, /USER aha/);
assert.match(source.dbDocker, /FROM postgres:16-alpine/);
assert.match(source.dbDocker, /USER postgres/);

// Health must actively prove live database safety; rollout readiness cannot rely
// on a stale in-process snapshot after a new Container App revision starts.
assert.match(source.health, /await this\.database\.probe\(\)/);

// Deploy is explicit and OIDC-scoped. Validation is credential-free and runs on PRs.
assert.match(source.workflow, /workflow_dispatch:/);
assert.doesNotMatch(source.workflow, /^\s{2}(push|schedule):/m);
assert.match(source.workflow, /RUN_AHA_AZURE_PRODUCTION_PLATFORM_DEPLOY/);
assert.match(source.workflow, /id-token:\s*write/);
assert.match(source.workflow, /environment:\s*aha-canonical-production-infra/);
assert.match(source.workflow, /AHA canonical production sync: DISABLED/);
assert.match(source.validation, /pull_request:/);
assert.doesNotMatch(source.validation, /id-token:\s*write/);
assert.match(source.validation, /az bicep build/);

console.log("aha-azure-production-platform-v1.test.cjs passed");
