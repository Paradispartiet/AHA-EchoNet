const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const evidencePath = path.join(root, "ops/evidence/canonical-sync-production-two-profile-roundtrip-v1.json");
const rolloutPath = path.join(root, "ops/canonical-sync-production-rollout-v1.json");
const runbookPath = path.join(root, "docs/AHA_CANONICAL_PRODUCTION_TWO_PROFILE_ROUND_TRIP_V1.md");
const statusPath = path.join(root, "docs/AHA_CANONICAL_PRODUCTION_PILOT_STATUS.md");

assert.equal(fs.existsSync(evidencePath), true, "two-profile round-trip evidence file is missing");

const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
const rollout = JSON.parse(fs.readFileSync(rolloutPath, "utf8"));
const runbook = fs.readFileSync(runbookPath, "utf8");
const status = fs.readFileSync(statusPath, "utf8");

assert.equal(evidence.version, "aha_canonical_sync_production_two_profile_roundtrip_evidence_v1");
assert.equal(evidence.status, "two_of_two_profiles_verified_roundtrip_closeout_complete");
assert.equal(evidence.requiredProfileSlots, 2);
assert.equal(evidence.verifiedProfileSlots, 2);
assert.equal(evidence.closeoutComplete, true);
assert.equal(evidence.profile3ExpansionUnlocked, false);
assert.equal(evidence.verifier.build, "hash-domains-v2");
assert.equal(evidence.verifier.operatorSurface, "canonical-sync-production-roundtrip.html");
assert.match(evidence.verifier.firstProfileMainRevisionAtEvidence, /^[a-f0-9]{40}$/);
assert.match(evidence.verifier.secondProfileMainRevisionAtEvidence, /^[a-f0-9]{40}$/);

assert.equal(evidence.profiles.length, 2);
for (const slot of ["pilot_slot_1", "pilot_slot_2"]) {
  const profile = evidence.profiles.find((item) => item.slot === slot);
  assert.ok(profile, `${slot} missing`);
  assert.equal(profile.status, "verified");
  assert.equal(profile.identityIncluded, false);
  assert.equal(profile.firstRoundTrip.pass, true);
  assert.ok(profile.firstRoundTrip.pushed > 0);
  assert.ok(profile.firstRoundTrip.bootstrapApplied + profile.firstRoundTrip.pullApplied > 0);
  assert.equal(profile.firstRoundTrip.conflicts, 0);
  assert.equal(profile.firstRoundTrip.rejected, 0);
  assert.equal(profile.firstRoundTrip.cursorAdvanced, true);
  assert.equal(profile.firstRoundTrip.hashDomainsComplete, true);
  assert.equal(profile.firstRoundTrip.activeHashPairs, profile.firstRoundTrip.activeStateCount);
  assert.equal(profile.firstRoundTrip.missingActiveHashValues, 0);
  assert.equal(profile.firstRoundTrip.invalidHashValues, 0);
  assert.match(profile.firstRoundTrip.batchDigestSha256, /^[a-f0-9]{64}$/);

  assert.equal(profile.idempotentReplay.pass, true);
  assert.equal(profile.idempotentReplay.localChanged, 0);
  assert.equal(profile.idempotentReplay.enqueued, 0);
  assert.equal(profile.idempotentReplay.pushed, 0);
  assert.equal(profile.idempotentReplay.conflicts, 0);
  assert.equal(profile.idempotentReplay.hashDomainsComplete, true);
  assert.equal(profile.idempotentReplay.hashDigestStable, true);
}

for (const value of Object.values(evidence.privacyBoundary)) assert.equal(value, false);
assert.equal(evidence.nextBoundary.secondProfileRoundTripRequired, false);
assert.equal(evidence.nextBoundary.secondProfileIdempotentReplayRequired, false);
assert.equal(evidence.nextBoundary.twoProfileRoundTripCloseoutComplete, true);
assert.equal(evidence.nextBoundary.stabilityObservationRequired, true);
assert.equal(evidence.nextBoundary.stabilityObservationComplete, false);
assert.equal(evidence.nextBoundary.nextExpansionPaused, true);
assert.equal(evidence.nextBoundary.profile3Approved, false);
assert.equal(evidence.nextBoundary.automaticSync, false);
assert.equal(evidence.nextBoundary.loginTriggeredSync, false);
assert.equal(evidence.nextBoundary.backgroundSync, false);

const serialized = JSON.stringify(evidence);
assert.doesNotMatch(serialized, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
assert.doesNotMatch(serialized, /workspace[-_ ]?id/i);
assert.doesNotMatch(serialized, /access[-_ ]?token/i);

assert.equal(rollout.pilot.currentVerifiedProfileCount, 2);
assert.equal(rollout.pilot.nextExpansionPaused, true);
assert.equal(rollout.pilot.nextExpansionRequiresTwoProfileRoundTripEvidence, true);
assert.equal(rollout.pilot.twoProfileRoundTripEvidenceComplete, true);
assert.equal(rollout.pilot.nextExpansionRequiresStabilityObservation, true);
assert.equal(rollout.pilot.stabilityObservationComplete, false);
assert.equal(rollout.activation.roundTrip.requiredVerifiedProfiles, 2);
assert.equal(rollout.activation.roundTrip.verifiedProfileSlots, 2);
assert.equal(rollout.activation.roundTrip.closeoutComplete, true);
assert.equal(rollout.activation.roundTrip.evidencePath, "ops/evidence/canonical-sync-production-two-profile-roundtrip-v1.json");

assert.match(runbook, /LIVE EVIDENCE:\s*2 AV 2 PROFILER BESTÅTT/i);
assert.match(runbook, /pilot_slot_1\s*=\s*VERIFIED/i);
assert.match(runbook, /pilot_slot_2\s*=\s*VERIFIED/i);
assert.match(runbook, /closeoutComplete\s*=\s*true/i);
assert.match(runbook, /stabilitets/i);
assert.match(runbook, /profil #3[^\n]*pauset/i);

assert.match(status, /To-profil round-trip closeout er FULLFØRT 2 av 2/i);
assert.match(status, /Neste obligatoriske gate:\s*stabilitet/i);
assert.match(status, /stabilityObservationComplete\s*=\s*false/i);
assert.match(status, /profil #3\s*=\s*IKKE GODKJENT/i);

console.log("aha-canonical-production-two-profile-roundtrip-evidence-v1.test.cjs passed");
