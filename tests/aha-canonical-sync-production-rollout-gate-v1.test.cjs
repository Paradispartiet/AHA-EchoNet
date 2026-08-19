const assert = require("node:assert/strict");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const POLICY = "ops/canonical-sync-production-rollout-v1.json";
const EVIDENCE = "ops/evidence/canonical-sync-browser-staging-proof-v1.json";
const GATE = "scripts/aha-canonical-sync-production-rollout-gate.cjs";
const DB_GATE = "scripts/aha-canonical-sync-production-db-readiness.sh";
const WORKFLOW = ".github/workflows/aha-canonical-sync-production-rollout-gate.yml";
const ADR = "docs/adr/ADR-006-azure-container-apps-before-aks.md";

for (const file of [POLICY, EVIDENCE, GATE, DB_GATE, WORKFLOW, ADR]) {
  assert.equal(fs.existsSync(file), true, `${file} mangler`);
}

const policy = JSON.parse(fs.readFileSync(POLICY, "utf8"));
const evidence = JSON.parse(fs.readFileSync(EVIDENCE, "utf8"));
const gate = fs.readFileSync(GATE, "utf8");
const dbGate = fs.readFileSync(DB_GATE, "utf8");
const workflow = fs.readFileSync(WORKFLOW, "utf8");

assert.equal(policy.productionActivationEnabled, false);
assert.equal(policy.activation.enabled, false);
assert.equal(policy.status, "blocked_until_remote_readiness");
assert.equal(policy.hosting.target, "azure_container_apps");
assert.equal(policy.hosting.renderProductionAllowed, false);
assert.equal(policy.database.target, "dedicated_production_postgresql");
assert.equal(policy.database.stagingReuseAllowed, false);
assert.equal(policy.database.legacyPrimaryReuseAllowed, false);
assert.equal(policy.database.tlsMode, "verify-full");
assert.equal(policy.database.runtimeRole, "aha_canonical_production_runtime");
assert.equal(policy.pilot.mode, "bounded_manual_allowlist");
assert.equal(policy.pilot.maxProfiles, 10);
assert.equal(policy.pilot.profilesAddedPerActivation, 1);
assert.equal(policy.pilot.automaticExpansionAllowed, false);
assert.equal(policy.frontend.automaticSync, false);
assert.equal(policy.frontend.loginTriggeredSync, false);
assert.equal(policy.frontend.authReadyTriggeredSync, false);
assert.equal(policy.frontend.backgroundSync, false);
assert.equal(policy.migration.backupBeforeMigrationRequired, true);
assert.equal(policy.migration.restoreTestRequired, true);
assert.equal(policy.migration.rollback.databaseCredentialCutoffRequired, true);
assert.equal(policy.observability.required, true);
assert.equal(policy.observability.rawConversationTextInDefaultTelemetryAllowed, false);
assert.equal(policy.privateDatabaseReadiness.githubEnvironment, "aha-canonical-production-infra");
assert.equal(policy.privateDatabaseReadiness.executionBoundary, "production_vnet");
assert.equal(policy.privateDatabaseReadiness.verificationMode, "verify_restore");
assert.equal(policy.privateDatabaseReadiness.liveSyncMustRemainDisabled, true);
assert.equal(policy.privateDatabaseReadiness.adminCredentialSource, "operations_key_vault");
assert.equal(policy.privateDatabaseReadiness.publicRunnerDirectDatabaseAccessAllowed, false);
assert.equal(policy.remoteReadiness.requiredProtectedValues.includes("AHA_PRODUCTION_ADMIN_DATABASE_URL"), false);
assert.equal(policy.remoteReadiness.requiredProtectedValues.includes("AHA_PRODUCTION_DATABASE_CA_CERT"), false);

assert.equal(evidence.browserRun.primarySourceEventsFetched, 87);
assert.equal(evidence.browserRun.canonicalEligibleIncluded, 85);
assert.equal(evidence.browserRun.localDeferredExcluded, 2);
assert.equal(evidence.browserRun.pushed, 85);
assert.equal(evidence.browserRun.conflicts, 0);
assert.equal(evidence.idempotentReplay.changed, 0);
assert.equal(evidence.idempotentReplay.enqueued, 0);
assert.equal(evidence.idempotentReplay.pushed, 0);
assert.equal(evidence.idempotentReplay.serverSyncChangeCountBefore, 85);
assert.equal(evidence.idempotentReplay.serverSyncChangeCountAfter, 85);
assert.equal(evidence.databaseAfterReplay.syncConflicts, 0);
assert.equal(evidence.securityBoundaries.productionDatabaseTouched, false);

// The rollout gate remains explicit and sync-disabled. Remote/API readiness has
// only read access; the private DB verification gets Azure OIDC only in the
// protected infra job so PostgreSQL can remain private/VNet-only.
assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /^\s{2}(push|schedule):/m);
assert.match(workflow, /production-readiness:/);
assert.match(workflow, /environment:\s*aha-canonical-production-readiness/);
assert.match(workflow, /production-readiness:[\s\S]*?permissions:\s*\n\s+contents:\s+read/);
assert.match(workflow, /private-database-readiness:/);
assert.match(workflow, /private-database-readiness:[\s\S]*?environment:\s*aha-canonical-production-infra/);
assert.match(workflow, /private-database-readiness:[\s\S]*?id-token:\s*write/);
assert.match(workflow, /private-database-readiness:[\s\S]*?uses:\s*azure\/login@v2/);
assert.match(workflow, /RUN_AHA_CANONICAL_PRODUCTION_ROLLOUT_GATE/);
assert.match(workflow, /AHA_PRODUCTION_SYNC_RUNTIME_STATE/);
assert.match(workflow, /AHA_CANONICAL_SYNC_ENABLED/);
assert.match(workflow, /sync_enabled[\s\S]*?!= 'false'/);
assert.match(workflow, /infra\/azure\/production\/db-init-job\.bicep/);
assert.match(workflow, /mode=verify_restore/);
assert.match(workflow, /migration-operations-only/);
assert.match(workflow, /aha-production-admin-database-url/);
assert.match(workflow, /aha-production-database-ca/);
assert.match(workflow, /aha-canonical-db-init:\$\{AHA_ROLLOUT_DEPLOY_REVISION\}/);
assert.match(workflow, /Cleanup short-lived rollout verification job/);
assert.match(workflow, /Microsoft\.App\/jobs/);
assert.match(workflow, /PRIVATE_VNET_READ_ONLY_VERIFY_FULL/);
assert.match(workflow, /AHA canonical production activation: DISABLED/);
assert.doesNotMatch(workflow, /AHA_CANONICAL_SYNC_ENABLED\s*=\s*true/i);
assert.doesNotMatch(workflow, /RUN_AHA_CANONICAL_PRODUCTION_PILOT_ACTIVATION/);
assert.doesNotMatch(workflow, /az containerapp update|render\.com\/v1\/services/i);
assert.doesNotMatch(workflow, /scripts\/aha-canonical-sync-production-db-readiness\.sh/);
assert.doesNotMatch(workflow, /AHA_PRODUCTION_ADMIN_DATABASE_URL:\s*\$\{\{\s*secrets\./);
assert.doesNotMatch(workflow, /AHA_PRODUCTION_DATABASE_CA_CERT:\s*\$\{\{\s*secrets\./);

// The standalone DB diagnostic remains read-only and rejects known non-production
// database refs. It is no longer executed by the public rollout runner.
assert.match(dbGate, /PGSSLMODE=verify-full/);
assert.match(dbGate, /default_transaction_read_only=on/);
assert.match(dbGate, /aha_canonical_production_runtime/);
assert.match(dbGate, /sstuzwppsheivczyqrim/);
assert.match(dbGate, /wshmybqyksrwkawqleiz/);
assert.match(dbGate, /bootstrap_sync_snapshot_v1,pull_sync_changes_v1,push_sync_change_v1/);
assert.doesNotMatch(dbGate, /\b(?:insert\s+into|update\s+aha\.|delete\s+from|truncate\s+|alter\s+role|create\s+role|drop\s+role)\b/i);

// Remote readiness must insist that both the protected operator state and live
// API say sync is disabled, while production DB credentials stay out of this code.
assert.match(gate, /AHA_PRODUCTION_SYNC_RUNTIME_STATE/);
assert.match(gate, /must still be disabled/);
assert.match(gate, /safeRuntimeRole/);
assert.match(gate, /runtimeActivated === true/);
assert.match(gate, /canonicalSync\?\.enabled !== false/);
assert.match(gate, /must be explicitly disabled in live health/);
assert.match(gate, /onrender\.com/);
assert.doesNotMatch(gate, /AHA_PRODUCTION_ADMIN_DATABASE_URL/);
assert.doesNotMatch(gate, /AHA_PRODUCTION_DATABASE_CA_CERT/);

const contractRun = spawnSync(process.execPath, [GATE, "contract"], { encoding: "utf8" });
assert.equal(contractRun.status, 0, contractRun.stderr || contractRun.stdout);
assert.match(contractRun.stdout, /production rollout contract: READY/);
assert.match(contractRun.stdout, /production activation: DISABLED/);

const blockedReadiness = spawnSync(process.execPath, [GATE, "readiness"], {
  encoding: "utf8",
  env: {
    ...process.env,
    AHA_CANONICAL_PRODUCTION_ROLLOUT_CONFIRMATION: "RUN_AHA_CANONICAL_PRODUCTION_ROLLOUT_GATE",
    AHA_PRODUCTION_SYNC_RUNTIME_STATE: "disabled"
  }
});
assert.notEqual(blockedReadiness.status, 0, "remote readiness must fail closed when protected production values are absent");
assert.match(blockedReadiness.stderr, /missing protected production readiness value/);

console.log("aha-canonical-sync-production-rollout-gate-v1.test.cjs passed");