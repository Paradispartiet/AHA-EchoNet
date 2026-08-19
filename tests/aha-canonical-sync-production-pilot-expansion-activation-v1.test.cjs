const assert = require("node:assert/strict");
const fs = require("node:fs");

const paths = {
  gate: ".github/workflows/aha-canonical-sync-production-pilot-expansion-gate.yml",
  activation: ".github/workflows/aha-canonical-sync-production-pilot-expansion-activation.yml",
  rollback: ".github/workflows/aha-canonical-sync-production-pilot-profile-rollback.yml",
  app: "infra/azure/production/app.bicep",
  dbRunner: "infra/azure/production/db-init/run.sh",
  policy: "ops/canonical-sync-production-rollout-v1.json"
};
for (const path of Object.values(paths)) assert.equal(fs.existsSync(path), true, `${path} mangler`);
const source = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, fs.readFileSync(path, "utf8")]));
const policy = JSON.parse(source.policy);

// The read-only gate binds a protected candidate to the exact Git SHA without
// rendering the UUID in evidence.
assert.match(source.gate, /candidateFingerprintSha256/);
assert.match(source.gate, /sha256sum/);
assert.match(source.gate, /gateGitSha[^\n]*GITHUB_SHA/);
assert.match(source.gate, /candidateIdentityRendered[^\n]*false/);
assert.match(source.gate, /mode=verify_pilot_expansion/);
assert.doesNotMatch(source.gate, /mode=add_pilot_profile/);

// Expansion activation is manual, serialized with the other pilot controls and
// requires both the same SHA and the exact candidate-bound gate artifact.
assert.match(source.activation, /workflow_dispatch:/);
assert.doesNotMatch(source.activation, /^\s{2}(push|schedule):/m);
assert.match(source.activation, /RUN_AHA_CANONICAL_PRODUCTION_PILOT_EXPANSION_ACTIVATION/);
assert.match(source.activation, /environment:\s*aha-canonical-production-infra/);
assert.match(source.activation, /actions:\s*read/);
assert.match(source.activation, /id-token:\s*write/);
assert.match(source.activation, /group:\s*aha-canonical-production-pilot-control/);
assert.match(source.activation, /AHA_PRODUCTION_PILOT_EXPANSION_PROFILE_ID:\s*\$\{\{\s*secrets\.AHA_PRODUCTION_PILOT_EXPANSION_PROFILE_ID\s*\}\}/);
assert.match(source.activation, /aha-canonical-sync-production-pilot-expansion-gate\.yml/);
assert.match(source.activation, /gh run list/);
assert.match(source.activation, /gh run download/);
assert.match(source.activation, /headSha == \\"\$\{GITHUB_SHA\}\\"/);
assert.match(source.activation, /candidateFingerprintSha256/);
assert.match(source.activation, /AHA_EXPANSION_CANDIDATE_FINGERPRINT/);
assert.match(source.activation, /gateGitSha == \$sha/);

// Exactly one DB profile/workspace may be materialized, idempotently, before
// the API gains access. Runtime credentials and the shared runtime role stay put.
assert.match(source.activation, /mode=add_pilot_profile/);
assert.match(source.dbRunner, /add_pilot_profile\(\)/);
assert.match(source.dbRunner, /PROFILE_ALREADY_PRESENT_IDEMPOTENT/);
assert.match(source.activation, /AHA_EXPANSION_CURRENT_COUNT \+ 1/);
assert.match(source.activation, /new_count[^\n]*-le 10/);
assert.doesNotMatch(source.activation, /AHA_PRODUCTION_RUNTIME_PASSWORD/);
assert.doesNotMatch(source.activation, /mode=deactivate_pilot/);
assert.doesNotMatch(source.activation, /alter role aha_canonical_production_runtime/i);

// The allowlist is an immutable Key Vault secret version and the API is rebuilt
// and deployed from the exact activation SHA. No login/background sync is added.
assert.match(source.activation, /aha-production-pilot-profile-ids-json/);
assert.match(source.activation, /--query id -o tsv/);
assert.match(source.activation, /allowedProfileIdsSecretUri="\$AHA_EXPANSION_NEW_ALLOWLIST_SECRET_URI"/);
assert.match(source.activation, /aha-canonical-api:\$\{GITHUB_SHA\}/);
assert.match(source.activation, /deployRevision="\$GITHUB_SHA"/);
assert.match(source.activation, /canonicalSyncEnabled=true/);
assert.match(source.activation, /runtimeActivated=true/);
assert.match(source.activation, /allowedProfileCount == \$count/);
assert.match(source.activation, /runtimeCredentialRotated[^\n]*false/);
assert.match(source.activation, /automaticSyncEnabled[^\n]*false/);
assert.match(source.activation, /loginSyncEnabled[^\n]*false/);
assert.match(source.activation, /backgroundSyncEnabled[^\n]*false/);

// An incomplete activation restores the prior API image/revision/allowlist only.
// Candidate canonical data is deliberately retained and never auto-deleted.
assert.match(source.activation, /AHA_EXPANSION_PREVIOUS_IMAGE/);
assert.match(source.activation, /AHA_EXPANSION_PREVIOUS_REVISION/);
assert.match(source.activation, /AHA_EXPANSION_PREVIOUS_ALLOWLIST_SECRET_URI/);
assert.match(source.activation, /ROLLED_BACK_API_ALLOWLIST_ONLY_DATA_RETAINED/);
assert.match(source.activation, /candidate data, if bootstrapped, remains inaccessible and retained/i);
assert.doesNotMatch(source.activation, /delete\s+from\s+aha\./i);

// Per-profile rollback is separate from the emergency global cutoff. It removes
// exactly one non-anchor profile from API eligibility while retaining the shared
// DB runtime role and all canonical profile/workspace/data rows.
assert.match(source.rollback, /workflow_dispatch:/);
assert.doesNotMatch(source.rollback, /^\s{2}(push|schedule):/m);
assert.match(source.rollback, /RUN_AHA_CANONICAL_PRODUCTION_PILOT_PROFILE_ROLLBACK/);
assert.match(source.rollback, /AHA_PRODUCTION_PILOT_ROLLBACK_PROFILE_ID:\s*\$\{\{\s*secrets\.AHA_PRODUCTION_PILOT_ROLLBACK_PROFILE_ID\s*\}\}/);
assert.match(source.rollback, /legacy protected pilot anchor cannot be removed/i);
assert.match(source.rollback, /map\(select\(\. != \$target\)\)/);
assert.match(source.rollback, /current_count - 1/);
assert.match(source.rollback, /image="\$AHA_PROFILE_ROLLBACK_IMAGE"/);
assert.match(source.rollback, /deployRevision="\$AHA_PROFILE_ROLLBACK_REVISION"/);
assert.match(source.rollback, /allowedProfileIdsSecretUri="\$AHA_PROFILE_ROLLBACK_NEW_ALLOWLIST_SECRET_URI"/);
assert.match(source.rollback, /canonicalSyncEnabled=true/);
assert.match(source.rollback, /runtimeActivated=true/);
assert.match(source.rollback, /allowedProfileCount == \$count/);
assert.match(source.rollback, /canonicalProfileDeleted[^\n]*false/);
assert.match(source.rollback, /canonicalWorkspaceDeleted[^\n]*false/);
assert.match(source.rollback, /canonicalDataRetained[^\n]*true/);
assert.doesNotMatch(source.rollback, /db-init-job\.bicep/);
assert.doesNotMatch(source.rollback, /mode=deactivate_pilot/);
assert.doesNotMatch(source.rollback, /az containerapp job/);
assert.doesNotMatch(source.rollback, /AHA_PRODUCTION_RUNTIME_PASSWORD/);
assert.doesNotMatch(source.rollback, /alter role aha_canonical_production_runtime/i);
assert.doesNotMatch(source.rollback, /delete\s+from\s+aha\./i);
assert.doesNotMatch(source.rollback, /update\s+aha\.(profiles|workspaces)/i);

// The public health contract exposes only the protected count; the IaC path is
// still Key Vault-backed, never a plaintext list in the template.
assert.match(source.app, /allowedProfileIdsSecretUri/);
assert.match(source.app, /secretRef:\s*'pilot-profile-ids-json'/);

// Policy permits bounded manual expansion but never automatic expansion, shared
// role mutation, credential rotation, or destructive per-profile rollback.
assert.equal(policy.pilot.mode, "bounded_manual_allowlist");
assert.equal(policy.pilot.maxProfiles, 10);
assert.equal(policy.pilot.profilesAddedPerActivation, 1);
assert.equal(policy.pilot.automaticExpansionAllowed, false);
assert.equal(policy.activation.expansion.workflowImplemented, true);
assert.equal(policy.activation.expansion.sameShaExpansionGateRequired, true);
assert.equal(policy.activation.expansion.candidateBoundGateEvidenceRequired, true);
assert.equal(policy.activation.expansion.versionPinnedAllowlistSecretRequired, true);
assert.equal(policy.activation.expansion.runtimeCredentialRotationAllowed, false);
assert.equal(policy.activation.expansion.sharedRuntimeRoleMutationAllowed, false);
assert.equal(policy.activation.expansion.automaticExecutionAllowed, false);
assert.equal(policy.activation.expansion.perProfileRollbackWorkflowImplemented, true);
assert.equal(policy.activation.expansion.perProfileRollbackRemovesApiAllowlistFirst, true);
assert.equal(policy.activation.expansion.perProfileRollbackMayRemoveLegacyAnchor, false);
assert.equal(policy.activation.expansion.destructiveExpandedProfileRollbackAllowed, false);
assert.equal(policy.activation.expansion.canonicalDataRetainedOnRollback, true);

// No real protected profile identity may be committed in activation/rollback code.
const combined = [source.gate, source.activation, source.rollback].join("\n");
assert.doesNotMatch(combined, /e59cf60f-74e4-4db4-98c7-5c35bddfed48/i);
assert.doesNotMatch(combined, /postgres(?:ql)?:\/\//i);
assert.doesNotMatch(combined, /bearer\s+[a-z0-9._-]+/i);

console.log("aha-canonical-sync-production-pilot-expansion-activation-v1.test.cjs passed");