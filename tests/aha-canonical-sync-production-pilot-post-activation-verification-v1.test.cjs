const assert = require("node:assert/strict");
const fs = require("node:fs");

const paths = {
  verify: ".github/workflows/aha-canonical-sync-production-pilot-post-activation-verification.yml",
  activation: ".github/workflows/aha-canonical-sync-production-pilot-expansion-activation.yml",
  rollback: ".github/workflows/aha-canonical-sync-production-pilot-profile-rollback.yml",
  databaseService: "backend/api/src/database/canonical-database.service.ts",
  databaseErrors: "backend/api/src/database/database.errors.ts",
  apiFilter: "backend/api/src/api/api-exception.filter.ts",
  databaseAuthorizationTest: "backend/api/test/database-authorization.test.mjs",
  policy: "ops/canonical-sync-production-rollout-v1.json",
  docs: "docs/AHA_CANONICAL_PRODUCTION_PILOT_POST_ACTIVATION_VERIFICATION_V1.md"
};
for (const path of Object.values(paths)) assert.equal(fs.existsSync(path), true, `${path} mangler`);
const source = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, fs.readFileSync(path, "utf8")]));
const policy = JSON.parse(source.policy);

// Verification is explicit, serialized with other production pilot controls and
// can never trigger automatically from push, schedule or another workflow.
assert.match(source.verify, /workflow_dispatch:/);
assert.doesNotMatch(source.verify, /^\s{2}(push|schedule|workflow_run):/m);
assert.match(source.verify, /RUN_AHA_CANONICAL_PRODUCTION_PILOT_POST_ACTIVATION_VERIFY/);
assert.match(source.verify, /environment:\s*aha-canonical-production-infra/);
assert.match(source.verify, /actions:\s*read/);
assert.match(source.verify, /id-token:\s*write/);
assert.match(source.verify, /group:\s*aha-canonical-production-pilot-control/);

// The exact candidate ID and a real candidate token stay protected. Neither may
// be committed or written to evidence.
assert.match(source.verify, /AHA_PRODUCTION_PILOT_EXPANSION_PROFILE_ID:\s*\$\{\{\s*secrets\.AHA_PRODUCTION_PILOT_EXPANSION_PROFILE_ID\s*\}\}/);
assert.match(source.verify, /AHA_PRODUCTION_PILOT_EXPANSION_ACCESS_TOKEN:\s*\$\{\{\s*secrets\.AHA_PRODUCTION_PILOT_EXPANSION_ACCESS_TOKEN\s*\}\}/);
assert.match(source.verify, /add-mask[^\n]*AHA_PRODUCTION_PILOT_EXPANSION_PROFILE_ID/);
assert.match(source.verify, /add-mask[^\n]*AHA_PRODUCTION_PILOT_EXPANSION_ACCESS_TOKEN/);
assert.match(source.verify, /candidateFingerprintSha256/);
assert.match(source.verify, /candidateIdentityRendered[^\n]*false/);
assert.match(source.verify, /accessTokenRendered[^\n]*false/);

// A successful candidate-bound activation artifact is mandatory. The artifact's
// immutable Git SHA must equal the originating workflow head SHA.
assert.match(source.verify, /aha-canonical-sync-production-pilot-expansion-activation\.yml/);
assert.match(source.verify, /gh run list/);
assert.match(source.verify, /gh run download/);
assert.match(source.verify, /aha-production-pilot-expansion-activation-\$\{activation_run\}/);
assert.match(source.verify, /aha_canonical_production_pilot_expansion_activation_v1/);
assert.match(source.verify, /candidateFingerprintSha256 == \$fingerprint/);
assert.match(source.verify, /activationGitSha/);
assert.match(source.verify, /newAllowedProfileCount/);
assert.match(source.verify, /gh run view[^\n]*--json headSha/);
assert.match(source.verify, /run_head_sha[^\n]*==[^\n]*activation_sha/);

// Live production must still be the exact immutable activation revision and use
// the version-pinned protected allowlist containing both anchor and candidate.
assert.match(source.verify, /current_revision[^\n]*==[^\n]*AHA_POST_VERIFY_ACTIVATION_SHA/);
assert.match(source.verify, /aha-canonical-api:\$\{AHA_POST_VERIFY_ACTIVATION_SHA\}/);
assert.match(source.verify, /aha-production-pilot-profile-ids-json\/\*/);
assert.match(source.verify, /index\(\$anchor\) != null/);
assert.match(source.verify, /index\(\$candidate\) != null/);
assert.match(source.verify, /allowedProfileCount == \$count/);
assert.match(source.verify, /database\.safeRuntimeRole == true/);
assert.match(source.verify, /database\.canonicalSchema == "present"/);

// The real candidate token must prove the actual API + DB read path: own private
// bootstrap succeeds, while legacy pilot workspace access is denied with 403.
assert.match(source.verify, /authorization: Bearer \$\{AHA_PRODUCTION_PILOT_EXPANSION_ACCESS_TOKEN\}/);
assert.match(source.verify, /\/v1\/sync\/bootstrap/);
assert.match(source.verify, /own_status[^\n]*== '200'/);
assert.match(source.verify, /\.data\.workspaceId == \$workspace/);
assert.match(source.verify, /denied_status[^\n]*== '403'/);
assert.match(source.verify, /\.error\.status == 403/);
assert.match(source.verify, /crossProfileReadDenied[^\n]*true/);

// PostgreSQL tenancy denials remain authoritative but are normalized to a safe
// generic HTTP 403. Only the known canonical 42501 messages are mapped; unrelated
// PostgreSQL privilege failures must continue to fail closed as unavailable.
assert.match(source.databaseErrors, /DATABASE_FORBIDDEN/);
assert.match(source.databaseService, /CANONICAL_AUTHORIZATION_DENIALS/);
assert.match(source.databaseService, /authenticated canonical profile required/);
assert.match(source.databaseService, /workspace access denied/);
assert.match(source.databaseService, /workspace edit denied/);
assert.match(source.databaseService, /candidate\.code !== "42501"/);
assert.match(source.databaseService, /CanonicalDatabaseError\("DATABASE_FORBIDDEN"/);
assert.match(source.databaseService, /CanonicalDatabaseError\("DATABASE_UNAVAILABLE"/);
assert.match(source.apiFilter, /code === "DATABASE_FORBIDDEN"/);
assert.match(source.apiFilter, /status: 403, code: "FORBIDDEN"/);
assert.match(source.apiFilter, /requested canonical workspace is not permitted/i);
assert.match(source.databaseAuthorizationTest, /workspace access denied/);
assert.match(source.databaseAuthorizationTest, /workspace edit denied/);
assert.match(source.databaseAuthorizationTest, /permission denied for function unexpected_future_function/);
assert.match(source.databaseAuthorizationTest, /DATABASE_UNAVAILABLE/);
assert.match(source.databaseAuthorizationTest, /body\.error\.code, "FORBIDDEN"/);
assert.match(source.databaseAuthorizationTest, /body\.error\.status, 403/);

// Rollback readiness is only calculated in memory. This workflow must never
// create a Key Vault version, deploy an API revision, run a DB-control job or push
// canonical data.
assert.match(source.verify, /map\(select\(\. != \$target\)\)/);
assert.match(source.verify, /rollback dry-run: READY_REMOVE_ONE_PROFILE_NO_MUTATION/);
assert.match(source.verify, /productionMutationPerformed[^\n]*false/);
assert.match(source.verify, /keyVaultWritten[^\n]*false/);
assert.match(source.verify, /apiDeploymentChanged[^\n]*false/);
assert.match(source.verify, /canonicalDataMutated[^\n]*false/);
assert.doesNotMatch(source.verify, /az keyvault secret set/);
assert.doesNotMatch(source.verify, /az deployment group create/);
assert.doesNotMatch(source.verify, /az containerapp job/);
assert.doesNotMatch(source.verify, /\/v1\/sync\/push/);
assert.doesNotMatch(source.verify, /mode=(?:add_pilot_profile|activate_pilot|deactivate_pilot)/);

const expansion = policy.activation.expansion;
assert.equal(expansion.postActivationVerificationWorkflowImplemented, true);
assert.equal(expansion.postActivationVerificationRequiredBeforePilotApproval, true);
assert.equal(expansion.postActivationVerificationRequiresProtectedCandidateToken, true);
assert.equal(expansion.postActivationVerificationCandidateBoundActivationEvidenceRequired, true);
assert.equal(expansion.postActivationVerificationLiveRevisionMustMatchActivation, true);
assert.equal(expansion.postActivationVerificationOwnBootstrapRequired, true);
assert.equal(expansion.postActivationVerificationCrossProfileReadDenialRequired, true);
assert.equal(expansion.postActivationRollbackDryRunRequired, true);
assert.equal(expansion.postActivationVerificationMutationAllowed, false);
assert.equal(expansion.postActivationVerificationAutomaticExecutionAllowed, false);
assert.equal(expansion.exactPostActivationVerificationConfirmation, "RUN_AHA_CANONICAL_PRODUCTION_PILOT_POST_ACTIVATION_VERIFY");

assert.match(source.docs, /read-only/i);
assert.match(source.docs, /candidate access token/i);
assert.match(source.docs, /403/);
assert.match(source.docs, /rollback dry-run/i);
assert.match(source.docs, /ingen production-mutasjon/i);

// No known real profile identity, token or database DSN may be committed here.
const combined = [source.verify, source.docs].join("\n");
assert.doesNotMatch(combined, /e59cf60f-74e4-4db4-98c7-5c35bddfed48/i);
assert.doesNotMatch(combined, /postgres(?:ql)?:\/\//i);
assert.doesNotMatch(combined, /bearer\s+[a-z0-9._-]{20,}/i);

console.log("aha-canonical-sync-production-pilot-post-activation-verification-v1.test.cjs passed");
