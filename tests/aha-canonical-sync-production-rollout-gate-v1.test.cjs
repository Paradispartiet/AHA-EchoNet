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
assert.equal(policy.pilot.mode, "single_profile_allowlist");
assert.equal(policy.pilot.maxProfiles, 1);
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

// The workflow is a read-only, explicit dispatch gate. It must not activate or deploy production.
assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /^\s{2}(push|schedule):/m);
assert.match(workflow, /environment:\s*aha-canonical-production-readiness/);
assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/);
assert.match(workflow, /RUN_AHA_CANONICAL_PRODUCTION_ROLLOUT_GATE/);
assert.match(workflow, /AHA_PRODUCTION_SYNC_RUNTIME_STATE/);
assert.match(workflow, /AHA canonical production activation: DISABLED/);
assert.doesNotMatch(workflow, /AHA_CANONICAL_SYNC_ENABLED\s*=\s*true/i);
assert.doesNotMatch(workflow, /RUN_AHA_CANONICAL_PRODUCTION_PILOT_ACTIVATION/);
assert.doesNotMatch(workflow, /azure\/login|az containerapp update|render\.com\/v1\/services/i);

// DB gate must force verify-full + read-only and refuse both known non-production database refs.
assert.match(dbGate, /PGSSLMODE=verify-full/);
assert.match(dbGate, /default_transaction_read_only=on/);
assert.match(dbGate, /aha_canonical_production_runtime/);
assert.match(dbGate, /sstuzwppsheivczyqrim/);
assert.match(dbGate, /wshmybqyksrwkawqleiz/);
assert.match(dbGate, /bootstrap_sync_snapshot_v1,pull_sync_changes_v1,push_sync_change_v1/);
assert.doesNotMatch(dbGate, /\b(?:insert\s+into|update\s+aha\.|delete\s+from|truncate\s+|alter\s+role|create\s+role|drop\s+role)\b/i);

// Readiness code must insist that sync is still disabled and a safe runtime role is visible in health.
assert.match(gate, /AHA_PRODUCTION_SYNC_RUNTIME_STATE/);
assert.match(gate, /must still be disabled/);
assert.match(gate, /safeRuntimeRole/);
assert.match(gate, /runtimeActivated === true/);
assert.match(gate, /onrender\.com/);

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
