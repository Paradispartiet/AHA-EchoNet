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
  deploy: ".github/workflows/aha-azure-production-platform-deploy.yml",
  migrationRehearsal: ".github/workflows/aha-azure-production-migration-rehearsal.yml",
  restoreRehearsal: ".github/workflows/aha-azure-production-backup-restore-rehearsal.yml",
  observability: ".github/workflows/aha-azure-production-observability-readiness.yml",
  rollback: ".github/workflows/aha-azure-production-api-rollback.yml",
  rolloutGate: ".github/workflows/aha-canonical-sync-production-rollout-gate.yml",
  rolloutGateScript: "scripts/aha-canonical-sync-production-rollout-gate.cjs",
  rolloutGateDoc: "docs/AHA_CANONICAL_SYNC_PRODUCTION_ROLLOUT_GATE_V1.md",
  validation: ".github/workflows/aha-azure-production-iac-validation.yml",
  health: "backend/api/src/health.controller.ts",
  docs: "docs/AHA_AZURE_PRODUCTION_PLATFORM_V1.md",
  infraReadme: "infra/azure/production/README.md",
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
assert.match(source.deploy, /AHA_PRODUCTION_RUNTIME_KEYVAULT/);
assert.match(source.deploy, /AHA_PRODUCTION_OPS_KEYVAULT/);
assert.match(source.deploy, /aha-production-admin-database-url/);
assert.match(source.deploy, /aha-production-database-url/);

// The API deploy is production-shaped but canonical sync remains disabled.
assert.match(source.app, /AHA_DATABASE_ENABLED/);
assert.match(source.app, /AHA_DATABASE_SSL_MODE/);
assert.match(source.app, /value:\s*'verify-full'/);
assert.match(source.app, /AHA_CANONICAL_SYNC_ENABLED/);
assert.match(source.app, /AHA_CANONICAL_SYNC_ENABLED'[\s\S]*?value:\s*'false'/);
assert.match(source.app, /AHA_LOCAL_IMPORT_ENABLED'[\s\S]*?value:\s*'false'/);
assert.doesNotMatch(source.app, /onrender\.com/i);
for (const workflow of [source.deploy, source.migrationRehearsal, source.restoreRehearsal, source.observability, source.rollback, source.rolloutGate]) {
  assert.doesNotMatch(workflow, /RUN_AHA_CANONICAL_PRODUCTION_PILOT_ACTIVATION/);
  assert.doesNotMatch(workflow, /AHA_CANONICAL_SYNC_ENABLED\s*=\s*true/i);
}

// Database initialization applies the canonical migration set in deterministic
// order over verify-full and creates a separate health identity plus a NOLOGIN runtime.
assert.match(source.runner, /PGSSLMODE=verify-full/);
assert.match(source.runner, /find \/aha\/migrations[\s\S]*sort/);
assert.match(source.runner, /AHA_DB_INIT_MODE/);
assert.match(source.runner, /verify_restore/);
assert.match(source.runner, /default_transaction_read_only=on/);
assert.match(source.runner, /aha_canonical_production_readiness/);
assert.match(source.runner, /aha_canonical_production_runtime/);
assert.match(source.roles, /aha_canonical_production_readiness[\s\S]*login nosuperuser nobypassrls nocreatedb nocreaterole noinherit/i);
assert.match(source.roles, /aha_canonical_production_runtime[\s\S]*nologin nosuperuser nobypassrls nocreatedb nocreaterole noinherit/i);
assert.match(source.roles, /revoke execute on all functions in schema aha from public/i);
assert.match(source.roles, /bootstrap_sync_snapshot_v1\(text,text,bigint,integer\)/);
assert.match(source.roles, /pull_sync_changes_v1\(text,bigint,integer\)/);
assert.match(source.roles, /push_sync_change_v1\(text,text,text,text,text,text,bigint,text,jsonb\)/);
assert.doesNotMatch(source.roles, /grant\s+(insert|update|delete|truncate)/i);
assert.match(source.job, /'apply'[\s\S]*'verify_restore'/);
assert.match(source.job, /AHA_DB_INIT_MODE/);

// Production images run without root and pin the Node major/minor patch used by the tested build.
assert.match(source.apiDocker, /FROM node:22\.23\.2-alpine/);
assert.match(source.apiDocker, /USER aha/);
assert.match(source.dbDocker, /FROM postgres:16-alpine/);
assert.match(source.dbDocker, /USER postgres/);

// Health must actively prove live database safety; rollout readiness cannot rely
// on a stale in-process snapshot after a new Container App revision starts.
assert.match(source.health, /await this\.database\.probe\(\)/);

// Production platform deployment is explicit OIDC and ends with sync disabled.
assert.match(source.deploy, /workflow_dispatch:/);
assert.doesNotMatch(source.deploy, /^\s{2}(push|schedule):/m);
assert.match(source.deploy, /RUN_AHA_AZURE_PRODUCTION_PLATFORM_DEPLOY/);
assert.match(source.deploy, /id-token:\s*write/);
assert.match(source.deploy, /environment:\s*aha-canonical-production-infra/);
assert.match(source.deploy, /AHA canonical production sync: DISABLED/);
assert.match(source.deploy, /azure\/login@v2/);
assert.match(source.deploy, /az acr build/);
assert.match(source.deploy, /AHA_PRODUCTION_MIGRATION_IDENTITY_NAME/);
assert.match(source.deploy, /az deployment sub validate[\s\S]*?--name "aha-production-validate-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/);
assert.match(source.deploy, /--name "aha-production-platform-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/);
assert.match(source.deploy, /--name "aha-production-db-init-job-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/);
assert.match(source.deploy, /--name "aha-production-api-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/);

// Migration rehearsal is an isolated PostgreSQL 16 proof and never touches production.
assert.match(source.migrationRehearsal, /RUN_AHA_AZURE_PRODUCTION_MIGRATION_REHEARSAL/);
assert.match(source.migrationRehearsal, /image:\s*postgres:16/);
assert.match(source.migrationRehearsal, /productionDatabaseTouched:\s*false/);
assert.match(source.migrationRehearsal, /actions\/upload-artifact@v4/);
assert.doesNotMatch(source.migrationRehearsal, /azure\/login/);

// Backup readiness must be a real private PITR plus read-only verification and cleanup.
assert.match(source.restoreRehearsal, /RUN_AHA_AZURE_PRODUCTION_BACKUP_RESTORE_REHEARSAL/);
assert.match(source.restoreRehearsal, /az postgres flexible-server restore/);
assert.match(source.restoreRehearsal, /--subnet/);
assert.match(source.restoreRehearsal, /--private-dns-zone/);
assert.match(source.restoreRehearsal, /mode=verify_restore/);
assert.match(source.restoreRehearsal, /productionSourceMutated:\s*false/);
assert.match(source.restoreRehearsal, /az postgres flexible-server delete/);
assert.match(source.restoreRehearsal, /actions\/upload-artifact@v4/);

// Observability must prove concrete Azure metric definitions plus redacted AHA audit transport.
assert.match(source.observability, /RUN_AHA_AZURE_PRODUCTION_OBSERVABILITY_READINESS/);
for (const metric of ["Requests", "ResponseTime", "active_connections", "connections_failed", "longest_query_time_sec"]) {
  assert.ok(source.observability.includes(metric), `observability workflow missing ${metric}`);
}
assert.match(source.observability, /ContainerAppConsoleLogs_CL/);
assert.match(source.observability, /AhaSafeAudit/);
assert.match(source.observability, /RawBearer/);
assert.match(source.observability, /productionCanonicalSyncEnabled:\s*false/);

// Rollout API checks may run on GitHub-hosted infrastructure, but direct access to
// private production PostgreSQL must remain inside the production VNet. Admin DSN
// and CA therefore stay behind the operations vault / infra environment.
assert.match(source.rolloutGate, /production-readiness:/);
assert.match(source.rolloutGate, /private-database-readiness:/);
assert.match(source.rolloutGate, /environment:\s*aha-canonical-production-readiness/);
assert.match(source.rolloutGate, /environment:\s*aha-canonical-production-infra/);
assert.match(source.rolloutGate, /id-token:\s*write/);
assert.match(source.rolloutGate, /azure\/login@v2/);
assert.match(source.rolloutGate, /infra\/azure\/production\/db-init-job\.bicep/);
assert.match(source.rolloutGate, /mode=verify_restore/);
assert.match(source.rolloutGate, /aha-canonical-db-init:\$\{AHA_ROLLOUT_DEPLOY_REVISION\}/);
assert.match(source.rolloutGate, /AHA_CANONICAL_SYNC_ENABLED/);
assert.match(source.rolloutGate, /migration-operations-only/);
assert.match(source.rolloutGate, /Microsoft\.App\/jobs/);
assert.match(source.rolloutGate, /PRIVATE_VNET_READ_ONLY_VERIFY_FULL/);
assert.doesNotMatch(source.rolloutGate, /scripts\/aha-canonical-sync-production-db-readiness\.sh/);
assert.doesNotMatch(source.rolloutGate, /AHA_PRODUCTION_ADMIN_DATABASE_URL:\s*\$\{\{\s*secrets\./);
assert.doesNotMatch(source.rolloutGate, /AHA_PRODUCTION_DATABASE_CA_CERT:\s*\$\{\{\s*secrets\./);
assert.doesNotMatch(source.rolloutGateScript, /AHA_PRODUCTION_ADMIN_DATABASE_URL/);
assert.doesNotMatch(source.rolloutGateScript, /AHA_PRODUCTION_DATABASE_CA_CERT/);
assert.equal(rollout.remoteReadiness.requiredProtectedValues.includes("AHA_PRODUCTION_ADMIN_DATABASE_URL"), false);
assert.equal(rollout.remoteReadiness.requiredProtectedValues.includes("AHA_PRODUCTION_DATABASE_CA_CERT"), false);
assert.equal(rollout.privateDatabaseReadiness.githubEnvironment, "aha-canonical-production-infra");
assert.equal(rollout.privateDatabaseReadiness.executionBoundary, "production_vnet");
assert.equal(rollout.privateDatabaseReadiness.verificationMode, "verify_restore");
assert.equal(rollout.privateDatabaseReadiness.liveSyncMustRemainDisabled, true);
assert.equal(rollout.privateDatabaseReadiness.adminCredentialSource, "operations_key_vault");
assert.equal(rollout.privateDatabaseReadiness.publicRunnerDirectDatabaseAccessAllowed, false);
assert.match(source.rolloutGateDoc, /production-VNet/i);
assert.match(source.rolloutGateDoc, /operations Key Vault/i);

// Readiness-era rollback is immutable-image based and refuses an active sync runtime.
assert.match(source.rollback, /RUN_AHA_AZURE_PRODUCTION_API_ROLLBACK/);
assert.match(source.rollback, /\^\[0-9a-f\]\{40\}\$/);
assert.match(source.rollback, /Refuse rollback if canonical sync is already activated/);
assert.match(source.rollback, /AHA_CANONICAL_SYNC_ENABLED=false/);
assert.match(source.rollback, /AHA_LOCAL_IMPORT_ENABLED=false/);

// Validation is credential-free and runs before merges that change production IaC.
assert.match(source.validation, /pull_request:/);
assert.doesNotMatch(source.validation, /id-token:\s*write/);
assert.match(source.validation, /az bicep build/);
assert.match(source.validation, /docker build -f backend\/api\/Dockerfile/);
assert.match(source.validation, /docker build -f infra\/azure\/production\/db-init\/Dockerfile/);

// Documentation must stay explicit that merge alone creates no Azure production resources.
assert.match(source.docs, /ikke deployet/i);
assert.match(source.docs, /canonical production sync er AV/i);
assert.match(source.infraReadme, /no Azure production resources are created by merge/i);
assert.match(source.infraReadme, /Mandatory execution order/);

console.log("aha-azure-production-platform-v1.test.cjs passed");
