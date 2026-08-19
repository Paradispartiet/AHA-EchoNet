const assert = require("node:assert/strict");
const fs = require("node:fs");

const paths = {
  syncConfig: "backend/api/src/sync/sync.config.ts",
  syncService: "backend/api/src/sync/sync.service.ts",
  health: "backend/api/src/health.controller.ts",
  app: "infra/azure/production/app.bicep",
  dbJob: "infra/azure/production/db-init-job.bicep",
  dbRunner: "infra/azure/production/db-init/run.sh",
  validation: ".github/workflows/aha-canonical-sync-production-pilot-expansion-validation.yml",
  gate: ".github/workflows/aha-canonical-sync-production-pilot-expansion-gate.yml",
  policy: "ops/canonical-sync-production-rollout-v1.json"
};
for (const path of Object.values(paths)) assert.equal(fs.existsSync(path), true, `${path} mangler`);
const source = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, fs.readFileSync(path, "utf8")]));
const policy = JSON.parse(source.policy);

function shellFunctionBlock(shellSource, functionName, nextFunctionName) {
  const startMarker = `${functionName}() {`;
  const start = shellSource.indexOf(startMarker);
  assert.ok(start >= 0, `${functionName} shell function is required`);
  const end = nextFunctionName ? shellSource.indexOf(`${nextFunctionName}() {`, start + startMarker.length) : shellSource.length;
  assert.ok(end > start, `${functionName} shell function boundary is required`);
  return shellSource.slice(start, end);
}

// API foundation accepts a bounded protected set, while the legacy one-profile
// secret remains a valid exact fallback for the already activated pilot.
assert.match(source.syncConfig, /allowedProfileIds:\s*readonly string\[\]/);
assert.match(source.syncConfig, /allowedProfileCount:\s*number/);
assert.match(source.syncConfig, /MAX_PRODUCTION_PILOT_PROFILES = 10/);
assert.match(source.syncConfig, /AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON/);
assert.match(source.syncConfig, /AHA_CANONICAL_SYNC_PILOT_PROFILE_ID/);
assert.match(source.syncConfig, /must not contain duplicate profile IDs/);
assert.match(source.syncConfig, /legacy production pilot profile must remain present/i);
assert.match(source.syncService, /config\.allowedProfileIds\.includes\(subject\)/);
assert.match(source.syncService, /CANONICAL_SYNC_PILOT_FORBIDDEN/);
assert.match(source.health, /profileLimitMode:\s*"protected_allowlist"/);
assert.match(source.health, /allowedProfileCount/);
assert.doesNotMatch(source.health, /allowedProfileIds/);

// IaC can expose the allowlist only through a Key Vault-backed secret.
assert.match(source.app, /param allowedProfileIdsSecretUri string = ''/);
assert.match(source.app, /pilot-profile-ids-json/);
assert.match(source.app, /AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON/);
assert.match(source.app, /secretRef:\s*'pilot-profile-ids-json'/);
assert.doesNotMatch(source.app, /AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON'[\s\S]{0,100}value:/);

// Database control supports a read-only preflight and one-profile idempotent add,
// but neither mode changes runtime credentials or broad grants.
assert.match(source.dbJob, /'verify_pilot_expansion'/);
assert.match(source.dbJob, /'add_pilot_profile'/);
assert.match(source.dbRunner, /verify_pilot_expansion\(\)/);
assert.match(source.dbRunner, /add_pilot_profile\(\)/);
assert.match(source.dbRunner, /default_transaction_read_only=on/);
assert.match(source.dbRunner, /READY_ADD_ONE_PROFILE/);
assert.match(source.dbRunner, /ADDED_PROFILE_NO_RUNTIME_CREDENTIAL_CHANGE/);
assert.match(source.dbRunner, /PROFILE_ALREADY_PRESENT_IDEMPOTENT/);
assert.match(source.dbRunner, /refuses more than 10 active profiles/);
assert.match(source.dbRunner, /personal-\$\{AHA_PRODUCTION_PILOT_PROFILE_ID\}/);
assert.match(source.dbRunner, /auth_provider='supabase'/);
assert.match(source.dbRunner, /auth_subject=p\.id/);
const addPilotProfileBlock = shellFunctionBlock(source.dbRunner, "add_pilot_profile", "deactivate_pilot");
assert.doesNotMatch(addPilotProfileBlock, /AHA_PRODUCTION_RUNTIME_PASSWORD/);
assert.doesNotMatch(addPilotProfileBlock, /alter role aha_canonical_production_runtime/);
assert.doesNotMatch(addPilotProfileBlock, /password\s+/i);
assert.doesNotMatch(addPilotProfileBlock, /grant\s+(insert|update|delete|truncate)/i);
assert.doesNotMatch(source.dbRunner, /grant\s+(insert|update|delete|truncate)/i);

// The new PostgreSQL 16 test proves private workspace isolation in both directions.
assert.match(source.validation, /postgres:16/);
assert.match(source.validation, /own_workspace_bootstrap=PASS/);
assert.match(source.validation, /cross_profile_read=DENIED/);
assert.match(source.validation, /cross_profile_write=DENIED/);
assert.match(source.validation, /workspace access denied/);
assert.match(source.validation, /workspace edit denied/);
assert.match(source.validation, /postgreSQL 16/i);

// Expansion gate is strictly read-only: it may inspect production but cannot add
// a profile, mutate the allowlist, redeploy the API or rotate runtime credentials.
assert.match(source.gate, /workflow_dispatch:/);
assert.doesNotMatch(source.gate, /^\s{2}(push|schedule):/m);
assert.match(source.gate, /RUN_AHA_CANONICAL_PRODUCTION_PILOT_EXPANSION_GATE/);
assert.match(source.gate, /environment:\s*aha-canonical-production-infra/);
assert.match(source.gate, /id-token:\s*write/);
assert.match(source.gate, /group:\s*aha-canonical-production-pilot-control/);
assert.match(source.gate, /AHA_PRODUCTION_PILOT_EXPANSION_PROFILE_ID:\s*\$\{\{\s*secrets\.AHA_PRODUCTION_PILOT_EXPANSION_PROFILE_ID\s*\}\}/);
assert.match(source.gate, /candidateFingerprintSha256/);
assert.match(source.gate, /sha256sum/);
assert.match(source.gate, /mode=verify_pilot_expansion/);
assert.match(source.gate, /verificationReadOnly[^\n]*true/);
assert.match(source.gate, /productionCanonicalDataMutated[^\n]*false/);
assert.match(source.gate, /profileAdded[^\n]*false/);
assert.match(source.gate, /allowlistChanged[^\n]*false/);
assert.match(source.gate, /apiDeploymentChanged[^\n]*false/);
assert.doesNotMatch(source.gate, /mode=add_pilot_profile/);
assert.doesNotMatch(source.gate, /allowedProfileIdsSecretUri=/);
assert.doesNotMatch(source.gate, /canonicalSyncEnabled=true/);
assert.doesNotMatch(source.gate, /runtimeActivated=true/);
assert.doesNotMatch(source.gate, /aha-production-pilot-profile-ids-json/);
assert.doesNotMatch(source.gate, /az containerapp update/);

// A failed VNet database execution must emit that exact execution's container
// logs before cleanup deletes the short-lived job. This is observability only.
assert.match(source.gate, /az containerapp job logs show/);
assert.match(source.gate, /--execution "\$execution"/);
assert.match(source.gate, /--container canonical-db-init/);
assert.match(source.gate, /capturing execution logs before cleanup/i);

// The repository policy now authorizes only bounded, explicitly dispatched
// expansion. Merging this code still does not mutate the live Azure allowlist.
assert.equal(policy.productionActivationEnabled, false);
assert.equal(policy.pilot.mode, "bounded_manual_allowlist");
assert.equal(policy.pilot.maxProfiles, 10);
assert.equal(policy.pilot.profilesAddedPerActivation, 1);
assert.equal(policy.pilot.automaticExpansionAllowed, false);
assert.equal(policy.activation.automaticSyncEnabled, false);
assert.equal(policy.activation.loginTriggeredSyncEnabled, false);
assert.equal(policy.activation.backgroundSyncEnabled, false);
assert.equal(policy.activation.expansion.workflowImplemented, true);
assert.equal(policy.activation.expansion.sameShaExpansionGateRequired, true);
assert.equal(policy.activation.expansion.candidateBoundGateEvidenceRequired, true);
assert.equal(policy.activation.expansion.runtimeCredentialRotationAllowed, false);
assert.equal(policy.activation.expansion.sharedRuntimeRoleMutationAllowed, false);
assert.equal(policy.activation.expansion.automaticExecutionAllowed, false);
assert.equal(policy.activation.expansion.destructiveExpandedProfileRollbackAllowed, false);

// Protected identities must never be hardcoded into the foundation or gate.
const combined = [source.syncConfig, source.syncService, source.app, source.dbJob, source.dbRunner, source.gate].join("\n");
assert.doesNotMatch(combined, /e59cf60f-74e4-4db4-98c7-5c35bddfed48/i);
assert.doesNotMatch(combined, /postgres(?:ql)?:\/\//i);
assert.doesNotMatch(combined, /bearer\s+[a-z0-9._-]+/i);

console.log("aha-canonical-sync-production-pilot-expansion-v1.test.cjs passed");