const assert = require("node:assert/strict");
const fs = require("node:fs");

const paths = {
  activation: ".github/workflows/aha-canonical-sync-production-pilot-activation.yml",
  rollback: ".github/workflows/aha-canonical-sync-production-pilot-rollback.yml",
  app: "infra/azure/production/app.bicep",
  dbJob: "infra/azure/production/db-init-job.bicep",
  dbRunner: "infra/azure/production/db-init/run.sh",
  syncConfig: "backend/api/src/sync/sync.config.ts",
  syncService: "backend/api/src/sync/sync.service.ts",
  appConfig: "backend/api/src/config/app-config.ts",
  policy: "ops/canonical-sync-production-rollout-v1.json",
  docs: "docs/AHA_CANONICAL_SYNC_PRODUCTION_ROLLOUT_GATE_V1.md"
};

for (const path of Object.values(paths)) {
  assert.equal(fs.existsSync(path), true, `${path} mangler`);
}

const source = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, fs.readFileSync(path, "utf8")]));
const policy = JSON.parse(source.policy);

// Activation remains an explicit, isolated production operation.
assert.match(source.activation, /workflow_dispatch:/);
assert.doesNotMatch(source.activation, /^\s{2}(push|schedule):/m);
assert.match(source.activation, /RUN_AHA_CANONICAL_PRODUCTION_PILOT_ACTIVATION/);
assert.match(source.activation, /environment:\s*aha-canonical-production-infra/);
assert.match(source.activation, /actions:\s*read/);
assert.match(source.activation, /id-token:\s*write/);
assert.match(source.activation, /group:\s*aha-canonical-production-pilot-control/);
assert.match(source.activation, /AHA_PRODUCTION_PILOT_PROFILE_ID:\s*\$\{\{\s*secrets\.AHA_PRODUCTION_PILOT_PROFILE_ID\s*\}\}/);
assert.doesNotMatch(source.activation, /AHA_PRODUCTION_PILOT_PROFILE_ID:\s*[0-9a-f]{8}-[0-9a-f-]{27,}/i);

// A stale rollout gate must never authorize activation.
assert.match(source.activation, /aha-canonical-sync-production-rollout-gate\.yml/);
assert.match(source.activation, /--status success/);
assert.match(source.activation, /\.headSha == \\"\$\{GITHUB_SHA\}\\"/);
assert.match(source.activation, /successful rollout gate on this exact main SHA/i);

// Database activation must happen before the API can expose sync=true.
const dbActivateIndex = source.activation.indexOf("mode=activate_pilot");
const apiEnableIndex = source.activation.indexOf("canonicalSyncEnabled=true");
assert.ok(dbActivateIndex >= 0 && apiEnableIndex > dbActivateIndex, "pilot DB activation must precede API sync enablement");
assert.match(source.activation, /aha-production-pilot-runtime-password-\$\{GITHUB_RUN_ID\}/);
assert.match(source.activation, /aha-production-pilot-profile-id/);
assert.match(source.activation, /aha-production-database-url/);
assert.match(source.activation, /runtimeActivated=true/);
assert.match(source.activation, /AHA_LOCAL_IMPORT_ENABLED=false|AHA_LOCAL_IMPORT_ENABLED'[\s\S]*?'false'/);
assert.match(source.activation, /COMMITTED_ONE_PROFILE/);

// Incomplete activation rollback is database-first and destructive data cleanup is forbidden.
const rollbackBlock = source.activation.slice(source.activation.indexOf("Database-first rollback of an incomplete pilot activation"));
const cutoffIndex = rollbackBlock.indexOf("mode=deactivate_pilot");
const syncDisableIndex = rollbackBlock.indexOf("AHA_CANONICAL_SYNC_ENABLED=false");
assert.ok(cutoffIndex >= 0 && syncDisableIndex > cutoffIndex, "incomplete activation rollback must cut DB access before disabling API sync");
assert.match(rollbackBlock, /pg|database-first|database/i);
assert.doesNotMatch(rollbackBlock, /delete\s+from\s+aha\.|truncate\s+aha\.|drop\s+table/i);
assert.match(source.activation, /Cleanup short-lived pilot control resources/);

// A committed pilot also has a separate emergency database-first cutoff workflow.
assert.match(source.rollback, /workflow_dispatch:/);
assert.match(source.rollback, /RUN_AHA_CANONICAL_PRODUCTION_PILOT_ROLLBACK/);
assert.match(source.rollback, /environment:\s*aha-canonical-production-infra/);
assert.match(source.rollback, /group:\s*aha-canonical-production-pilot-control/);
const committedCutoffIndex = source.rollback.indexOf("mode=deactivate_pilot");
const committedDisableIndex = source.rollback.indexOf("AHA_CANONICAL_SYNC_ENABLED=false");
assert.ok(committedCutoffIndex >= 0 && committedDisableIndex > committedCutoffIndex, "committed pilot rollback must cut DB access before disabling API sync");
assert.match(source.rollback, /database cutoff/i);
assert.match(source.rollback, /AHA_RUNTIME_ACTIVATED=false/);
assert.match(source.rollback, /AHA_LOCAL_IMPORT_ENABLED=false/);
assert.match(source.rollback, /no destructive deletion performed/i);

// The normal app template remains fail-closed; only explicit activation passes true.
assert.match(source.app, /param canonicalSyncEnabled bool = false/);
assert.match(source.app, /param runtimeActivated bool = false/);
assert.match(source.app, /param pilotProfileIdSecretUri string = ''/);
assert.match(source.app, /AHA_CANONICAL_SYNC_ENABLED'[\s\S]*?canonicalSyncEnabled \? 'true' : 'false'/);
assert.match(source.app, /AHA_RUNTIME_ACTIVATED'[\s\S]*?runtimeActivated \? 'true' : 'false'/);
assert.match(source.app, /AHA_CANONICAL_SYNC_PILOT_PROFILE_ID/);
assert.match(source.app, /secretRef:\s*'pilot-profile-id'/);
assert.match(source.app, /AHA_LOCAL_IMPORT_ENABLED'[\s\S]*?value:\s*'false'/);

// Pilot identity is enforced by the server, not by browser UI.
assert.match(source.syncConfig, /pilotProfileId:\s*string \| null/);
assert.match(source.syncConfig, /AHA_CANONICAL_SYNC_PILOT_PROFILE_ID/);
assert.match(source.syncConfig, /required when canonical sync is enabled/);
assert.match(source.syncService, /assertEnabledForPilot\(principal\)/);
assert.match(source.syncService, /principal\.subject/);
assert.match(source.syncService, /CANONICAL_SYNC_PILOT_FORBIDDEN/);
assert.match(source.syncService, /status.*403|ApiException\(403/);
assert.match(source.appConfig, /AHA_RUNTIME_ACTIVATED/);

// Private DB control can only open/cut the exact production runtime role and keeps its function surface narrow.
assert.match(source.dbJob, /'activate_pilot'/);
assert.match(source.dbJob, /'deactivate_pilot'/);
assert.match(source.dbJob, /pilotProfileIdSecretUri/);
assert.match(source.dbJob, /runtimePasswordSecretUri/);
assert.match(source.dbJob, /secretRef:\s*'pilot-profile-id'/);
assert.doesNotMatch(source.dbJob, /pilotProfileId[\s\S]{0,80}value:\s*pilotProfileId/);
assert.match(source.dbRunner, /activate_pilot\(\)/);
assert.match(source.dbRunner, /deactivate_pilot\(\)/);
assert.match(source.dbRunner, /alter role aha_canonical_production_runtime[\s\S]*login noinherit/);
assert.match(source.dbRunner, /alter role aha_canonical_production_runtime nologin noinherit password null/);
assert.match(source.dbRunner, /grant aha_canonical_production_runtime to current_user with inherit false/i);
assert.match(source.dbRunner, /pg_terminate_backend\(pid, 5000\)/);
assert.match(source.dbRunner, /revoke aha_canonical_production_runtime from current_user/i);
assert.match(source.dbRunner, /lingering_admin_membership/);
assert.match(source.dbRunner, /CUT_OFF_NOLOGIN_ZERO_SESSIONS/);
assert.doesNotMatch(source.dbRunner, /grant\s+pg_signal_backend/i);
assert.match(source.dbRunner, /production pilot activation refuses additional canonical profiles/);
assert.match(source.dbRunner, /production pilot activation refuses additional canonical workspaces/);
assert.match(source.dbRunner, /auth_provider = 'supabase'[\s\S]*auth_subject = pilot_profile_id/);
assert.match(source.dbRunner, /personal-\$\{AHA_PRODUCTION_PILOT_PROFILE_ID\}/);
assert.match(source.dbRunner, /bootstrap_sync_snapshot_v1,pull_sync_changes_v1,push_sync_change_v1/);
assert.doesNotMatch(source.dbRunner, /grant\s+(insert|update|delete|truncate)/i);

// Policy stays default-off while proving the guarded workflows exist.
assert.equal(policy.productionActivationEnabled, false);
assert.equal(policy.activation.enabled, false);
assert.equal(policy.activation.workflowImplemented, true);
assert.equal(policy.activation.sameShaRolloutGateRequired, true);
assert.equal(policy.activation.protectedPilotProfileRequired, true);
assert.equal(policy.activation.serverSidePilotAllowlistRequired, true);
assert.equal(policy.activation.databaseFirstActivationRequired, true);
assert.equal(policy.activation.runtimeCredentialRotationRequired, true);
assert.equal(policy.activation.databaseFirstRollbackRequired, true);
assert.equal(policy.activation.activeSessionTerminationOnRollbackRequired, true);
assert.equal(policy.activation.destructivePilotDataRollbackAllowed, false);
assert.equal(policy.activation.emergencyRollbackWorkflowImplemented, true);
assert.equal(policy.activation.automaticSyncEnabled, false);
assert.equal(policy.activation.loginTriggeredSyncEnabled, false);
assert.equal(policy.activation.backgroundSyncEnabled, false);
assert.equal(policy.pilot.maxProfiles, 1);
assert.equal(policy.pilot.serverSideAllowlistRequired, true);
assert.match(source.docs, /same-SHA/i);
assert.match(source.docs, /database-first/i);
assert.match(source.docs, /CANONICAL_SYNC_PILOT_FORBIDDEN/);

console.log("aha-canonical-sync-production-pilot-activation-v1.test.cjs passed");
