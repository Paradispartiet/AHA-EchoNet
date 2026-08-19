const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const evidencePath = path.join(root, "ops/evidence/canonical-sync-production-two-profile-roundtrip-v1.json");
const rolloutPath = path.join(root, "ops/canonical-sync-production-rollout-v1.json");
const runbookPath = path.join(root, "docs/AHA_CANONICAL_PRODUCTION_TWO_PROFILE_ROUND_TRIP_V1.md");

assert.equal(fs.existsSync(evidencePath), true, "two-profile round-trip evidence file is missing");

const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
const rollout = JSON.parse(fs.readFileSync(rolloutPath, "utf8"));
const runbook = fs.readFileSync(runbookPath, "utf8");

assert.equal(evidence.version, "aha_canonical_sync_production_two_profile_roundtrip_evidence_v1");
assert.equal(evidence.status, "one_of_two_profiles_verified");
assert.equal(evidence.requiredProfileSlots, 2);
assert.equal(evidence.verifiedProfileSlots, 1);
assert.equal(evidence.closeoutComplete, false);
assert.equal(evidence.profile3ExpansionUnlocked, false);
assert.equal(evidence.verifier.build, "hash-domains-v2");
assert.equal(evidence.verifier.operatorSurface, "canonical-sync-production-roundtrip.html");
assert.match(evidence.verifier.mainRevisionAtEvidence, /^[a-f0-9]{40}$/);

assert.equal(evidence.profiles.length, 2);
const first = evidence.profiles.find((profile) => profile.slot === "pilot_slot_1");
const second = evidence.profiles.find((profile) => profile.slot === "pilot_slot_2");
assert.ok(first);
assert.ok(second);
assert.equal(first.status, "verified");
assert.equal(first.identityIncluded, false);
assert.equal(first.firstRoundTrip.pass, true);
assert.ok(first.firstRoundTrip.pushed > 0);
assert.ok(first.firstRoundTrip.bootstrapApplied + first.firstRoundTrip.pullApplied > 0);
assert.equal(first.firstRoundTrip.conflicts, 0);
assert.equal(first.firstRoundTrip.rejected, 0);
assert.equal(first.firstRoundTrip.cursorAdvanced, true);
assert.equal(first.firstRoundTrip.hashDomainsComplete, true);
assert.equal(first.firstRoundTrip.activeHashPairs, first.firstRoundTrip.activeStateCount);
assert.equal(first.firstRoundTrip.missingActiveHashValues, 0);
assert.equal(first.firstRoundTrip.invalidHashValues, 0);
assert.match(first.firstRoundTrip.batchDigestSha256, /^[a-f0-9]{64}$/);

assert.equal(first.idempotentReplay.pass, true);
assert.equal(first.idempotentReplay.localChanged, 0);
assert.equal(first.idempotentReplay.enqueued, 0);
assert.equal(first.idempotentReplay.pushed, 0);
assert.equal(first.idempotentReplay.conflicts, 0);
assert.equal(first.idempotentReplay.hashDomainsComplete, true);
assert.equal(first.idempotentReplay.hashDigestStable, true);

assert.equal(second.status, "pending");
assert.equal(second.identityIncluded, false);

for (const value of Object.values(evidence.privacyBoundary)) assert.equal(value, false);
assert.equal(evidence.nextBoundary.secondProfileRoundTripRequired, true);
assert.equal(evidence.nextBoundary.secondProfileIdempotentReplayRequired, true);
assert.equal(evidence.nextBoundary.nextExpansionPaused, true);
assert.equal(evidence.nextBoundary.profile3Approved, false);
assert.equal(evidence.nextBoundary.automaticSync, false);
assert.equal(evidence.nextBoundary.loginTriggeredSync, false);
assert.equal(evidence.nextBoundary.backgroundSync, false);

const serialized = JSON.stringify(evidence);
assert.doesNotMatch(serialized, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

assert.equal(rollout.pilot.currentVerifiedProfileCount, 2);
assert.equal(rollout.pilot.nextExpansionPaused, true);
assert.equal(rollout.pilot.nextExpansionRequiresTwoProfileRoundTripEvidence, true);
assert.equal(rollout.activation.roundTrip.requiredVerifiedProfiles, 2);
assert.match(runbook, /LIVE EVIDENCE:\s*1 AV 2 PROFILER BESTÅTT/i);
assert.match(runbook, /pilot_slot_1/i);
assert.match(runbook, /pilot_slot_2/i);
assert.match(runbook, /profil #3[^\n]*pauset/i);

console.log("aha-canonical-production-two-profile-roundtrip-evidence-v1.test.cjs passed");
