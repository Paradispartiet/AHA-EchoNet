const assert = require("node:assert/strict");
const fs = require("node:fs");

const evidencePath = "ops/evidence/canonical-sync-production-pilot-proof-v1.json";
const statusPath = "docs/AHA_CANONICAL_PRODUCTION_PILOT_STATUS.md";
assert.equal(fs.existsSync(evidencePath), true, `${evidencePath} mangler`);
assert.equal(fs.existsSync(statusPath), true, `${statusPath} mangler`);

const evidenceSource = fs.readFileSync(evidencePath, "utf8");
const evidence = JSON.parse(evidenceSource);
const status = fs.readFileSync(statusPath, "utf8");

// This artifact is intentionally historical: it proves the first production
// pilot profile's activation, real browser round-trip and idempotent replay. It
// must not be rewritten to pretend it was originally a two-profile proof.
assert.equal(evidence.version, "aha_canonical_sync_production_pilot_proof_v1");
assert.equal(evidence.status, "verified_single_profile_manual_sync");
assert.equal(evidence.production.platform, "azure_container_apps");
assert.equal(evidence.production.database, "dedicated_private_postgresql_16");
assert.equal(evidence.production.rolloutGate.conclusion, "success");
assert.equal(evidence.production.activation.conclusion, "success");
assert.equal(evidence.production.rolloutGate.sameShaAsActivation, true);
assert.equal(evidence.production.rolloutGate.gitSha, evidence.production.activation.gitSha);
assert.equal(evidence.production.activation.mode, "single_profile_allowlist");
assert.equal(evidence.production.activation.committed, true);

assert.equal(evidence.browserRoundtrip.firstSuccessfulRun.pushed, 1);
assert.equal(evidence.browserRoundtrip.firstSuccessfulRun.conflicts, 0);
assert.equal(evidence.browserRoundtrip.idempotentRepeat.localChanged, 0);
assert.equal(evidence.browserRoundtrip.idempotentRepeat.enqueued, 0);
assert.equal(evidence.browserRoundtrip.idempotentRepeat.pushed, 0);
assert.equal(evidence.browserRoundtrip.idempotentRepeat.bootstrapApplied, 0);
assert.equal(evidence.browserRoundtrip.idempotentRepeat.pullApplied, 0);
assert.equal(evidence.browserRoundtrip.idempotentRepeat.conflicts, 0);
assert.equal(evidence.browserRoundtrip.homeHydrationRun.bootstrapApplied, 1);
assert.match(evidence.browserRoundtrip.homeHydrationRun.note, /before bootstrap/i);

for (const [key, expected] of Object.entries({
  explicitUserActionRequired: true,
  explicitConsentRequired: true,
  automaticSync: false,
  loginTriggeredSync: false,
  authReadyTriggeredSync: false,
  backgroundSync: false,
  automaticRetry: false
})) {
  assert.equal(evidence.homeIntegration[key], expected, `homeIntegration.${key}`);
}

// These fields describe the historical first-profile boundary at the time that
// evidence was captured. Current bounded-pilot limits live in rollout policy and
// the operative status document, not in this immutable proof artifact.
assert.equal(evidence.securityBoundary.serverSidePilotAllowlist, true);
assert.equal(evidence.securityBoundary.maxProfiles, 1);
assert.equal(evidence.securityBoundary.userSelectableWorkspace, false);
assert.equal(evidence.securityBoundary.localImportEnabled, false);
assert.equal(evidence.nextBoundary.automaticExpansionAllowed, false);
assert.equal(evidence.nextBoundary.multiProfileActivationRequiresSeparateReviewedChange, true);
assert.equal(evidence.nextBoundary.backgroundSyncRequiresSeparateReviewedChange, true);

// Evidence and status docs must never materialize the protected pilot UUID,
// credentials, raw database URLs or bearer tokens.
assert.doesNotMatch(evidenceSource, /e59cf60f-74e4-4db4-98c7-5c35bddfed48/i);
assert.doesNotMatch(status, /e59cf60f-74e4-4db4-98c7-5c35bddfed48/i);
for (const source of [evidenceSource, status]) {
  assert.doesNotMatch(source, /postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(source, /bearer\s+[a-z0-9._-]+/i);
  assert.doesNotMatch(source, /access[_ -]?token\s*[:=]/i);
}

// The operative status has advanced beyond the historical first-profile proof.
assert.match(status, /AKTIV bounded manual production-pilot/i);
assert.match(status, /nøyaktig 2 profiler/i);
assert.match(status, /To-profil round-trip closeout er FULLFØRT 2 av 2/i);
assert.match(status, /pilot_slot_1\s*=\s*VERIFIED/i);
assert.match(status, /pilot_slot_2\s*=\s*VERIFIED/i);
assert.match(status, /Neste obligatoriske gate:\s*stabilitet/i);
assert.match(status, /profil #3\s*=\s*IKKE GODKJENT/i);
assert.match(status, /automatic sync[\s\S]*login-triggered sync[\s\S]*background sync/i);
assert.doesNotMatch(status, /AKTIV én-profil-pilot/i);

console.log("aha-canonical-production-pilot-proof-v1.test.cjs passed");
