const assert = require("node:assert/strict");
const fs = require("node:fs");

const workflowPath = ".github/workflows/aha-canonical-sync-production-pilot-code-refresh.yml";
const appPath = "infra/azure/production/app.bicep";
const policyPath = "ops/canonical-sync-production-rollout-v1.json";

for (const path of [workflowPath, appPath, policyPath]) {
  assert.equal(fs.existsSync(path), true, `${path} mangler`);
}

const workflow = fs.readFileSync(workflowPath, "utf8");
const app = fs.readFileSync(appPath, "utf8");
const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));

// This is an explicit code-refresh primitive, never an automatic deploy or an expansion path.
assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /^\s{2}(push|schedule):/m);
assert.match(workflow, /RUN_AHA_CANONICAL_PRODUCTION_PILOT_CODE_REFRESH/);
assert.match(workflow, /environment:\s*aha-canonical-production-infra/);
assert.match(workflow, /id-token:\s*write/);
assert.match(workflow, /group:\s*aha-canonical-production-pilot-control/);
assert.match(workflow, /Production pilot code refresh only runs from main/);

// Same-SHA verification runs inside the deploy workflow before any Azure application mutation.
const nodeTestIndex = workflow.indexOf("Run same-SHA deterministic repository tests");
const apiTestIndex = workflow.indexOf("Install and test the same-SHA NestJS API");
const bicepIndex = workflow.indexOf("Compile the same-SHA production app template before Azure mutation");
const apiTouchIndex = workflow.indexOf("AHA_REFRESH_API_TOUCHED=1");
assert.ok(nodeTestIndex >= 0 && apiTestIndex > nodeTestIndex && bicepIndex > apiTestIndex && apiTouchIndex > bicepIndex);
assert.match(workflow, /npm test/);
assert.match(workflow, /npm ci --prefix backend\/api/);
assert.match(workflow, /npm test --prefix backend\/api/);
assert.match(workflow, /az bicep build --file infra\/azure\/production\/app\.bicep/);

// Refresh starts only from the already-active, exact two-profile protected allowlist.
assert.match(workflow, /current_sync[\s\S]*?'true'/);
assert.match(workflow, /current_runtime[\s\S]*?'true'/);
assert.match(workflow, /length == 2/);
assert.match(workflow, /profileLimitMode == "protected_allowlist"/);
assert.match(workflow, /allowedProfileCount == 2/);
assert.match(workflow, /version-pinned two-profile allowlist secret URI/);
assert.match(workflow, /aha-production-pilot-profile-ids-json/);
assert.match(workflow, /AHA_REFRESH_ALLOWLIST_SECRET_URI/);
assert.match(workflow, /post_allowlist_uri[\s\S]*?AHA_REFRESH_ALLOWLIST_SECRET_URI/);

// The operation must not mutate pilot identities, database roles, credentials, or allowlist contents.
assert.doesNotMatch(workflow, /mode=(?:activate_pilot|deactivate_pilot|add_pilot_profile)/);
assert.doesNotMatch(workflow, /db-init-job\.bicep/);
assert.doesNotMatch(workflow, /az keyvault secret set/);
assert.doesNotMatch(workflow, /AHA_PRODUCTION_PILOT_EXPANSION_PROFILE_ID/);
assert.doesNotMatch(workflow, /\. \+ \[\$candidate\]|new_allowlist|NEW_ALLOWLIST/i);
assert.match(workflow, /profileAdded:\s*false/);
assert.match(workflow, /allowlistChanged:\s*false/);
assert.match(workflow, /databaseCredentialChanged:\s*false/);
assert.match(workflow, /productionCanonicalDataMutated:\s*false/);

// The new immutable image keeps the existing active pilot boundary and explicitly enables Fysen.
assert.match(workflow, /aha-canonical-api:\$\{GITHUB_SHA\}/);
assert.match(workflow, /deployRevision="\$GITHUB_SHA"/);
assert.match(workflow, /allowedProfileIdsSecretUri="\$AHA_REFRESH_ALLOWLIST_SECRET_URI"/);
assert.match(workflow, /canonicalSyncEnabled=true/);
assert.match(workflow, /runtimeActivated=true/);
assert.match(workflow, /fysenIntegrationEnabled=true/);
assert.match(workflow, /fysenAuthorizationTtlSeconds=180/);
assert.match(workflow, /https:\/\/fysen\.vercel\.app\/api\/aha\/callback/);
assert.doesNotMatch(workflow, /fysen-matsgran-8572s-projects\.vercel\.app/);
assert.match(workflow, /\/v1\/integrations\/fysen\/exchange/);
assert.match(workflow, /exchange_status[\s\S]*?'409'/);
assert.match(workflow, /COMMITTED_TWO_PROFILE_BOUNDARY_UNCHANGED/);

// Incomplete refresh is API-only rollback to the previous immutable image and revision.
const rollback = workflow.slice(workflow.indexOf("Restore the previous API revision if refresh verification is incomplete"));
assert.match(rollback, /image="\$AHA_REFRESH_PREVIOUS_IMAGE"/);
assert.match(rollback, /deployRevision="\$AHA_REFRESH_PREVIOUS_REVISION"/);
assert.match(rollback, /allowedProfileIdsSecretUri="\$AHA_REFRESH_ALLOWLIST_SECRET_URI"/);
assert.match(rollback, /canonicalSyncEnabled=true/);
assert.match(rollback, /runtimeActivated=true/);
assert.match(rollback, /fysenIntegrationEnabled=false/);
assert.match(rollback, /allowedProfileCount == 2/);
assert.match(rollback, /ROLLED_BACK_PREVIOUS_API_REVISION_TWO_PROFILE_BOUNDARY_PRESERVED/);
assert.doesNotMatch(rollback, /delete\s+from\s+aha\.|truncate\s+aha\.|drop\s+table/i);

// The shared app template remains fail-closed by default; refresh must opt in explicitly.
assert.match(app, /param canonicalSyncEnabled bool = false/);
assert.match(app, /param runtimeActivated bool = false/);
assert.match(app, /param fysenIntegrationEnabled bool = true/);
assert.match(app, /param allowedProfileIdsSecretUri string = ''/);
assert.match(app, /AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON/);
assert.match(app, /AHA_FYSEN_INTEGRATION_ENABLED/);

// Refresh is allowed during the stability gate only because it cannot expand the fleet.
assert.equal(policy.status, "active_bounded_manual_pilot");
assert.equal(policy.pilot.currentVerifiedProfileCount, 2);
assert.equal(policy.pilot.nextExpansionPaused, true);
assert.equal(policy.pilot.automaticExpansionAllowed, false);
assert.equal(policy.activation.automaticSyncEnabled, false);
assert.equal(policy.activation.loginTriggeredSyncEnabled, false);
assert.equal(policy.activation.backgroundSyncEnabled, false);

console.log("aha-canonical-sync-production-pilot-code-refresh-v1.test.cjs passed");
