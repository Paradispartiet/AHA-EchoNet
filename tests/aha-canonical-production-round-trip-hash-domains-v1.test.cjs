const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = process.cwd();
const verifierPath = "js/ahaCanonicalProductionRoundTripVerifier.js";
const source = fs.readFileSync(path.join(root, verifierPath), "utf8");

const inertWindow = { location: { search: "", origin: "https://paradispartiet.github.io" } };
const context = vm.createContext({
  window: inertWindow,
  globalThis: inertWindow,
  URL,
  URLSearchParams,
  Array,
  Object,
  String,
  Number,
  Boolean,
  Error,
  Set,
  Map,
  console,
  TextEncoder
});
vm.runInContext(source, context, { filename: verifierPath });
const verifier = inertWindow.AHACanonicalProductionRoundTripVerifier;
assert.ok(verifier);

const fakeHash = {
  async canonicalSyncPayloadHash() { return "d".repeat(64); }
};

(async () => {
  // Reproduce the first live production symptom: every active object has both
  // valid hashes, but the server snapshot hash differs from the local frontend
  // projection hash. These are separate hash domains and must not be compared
  // as if they represented identical payloads.
  const states = Array.from({ length: 19 }, (_, index) => ({
    objectType: index % 2 === 0 ? "conversation" : "message",
    objectId: `object-${index + 1}`,
    revision: 1,
    serverPayloadHash: "a".repeat(63) + (index % 10),
    localPayloadHash: "b".repeat(63) + (index % 10),
    deletedAt: null
  }));

  const audit = await verifier.buildStateHashAudit(states, fakeHash, {});
  assert.equal(audit.stateCount, 19);
  assert.equal(audit.activeStateCount, 19);
  assert.equal(audit.activeHashPairs, 19);
  assert.equal(audit.comparable, 19);
  assert.equal(audit.matches, 0);
  assert.equal(audit.mismatches, 19);
  assert.equal(audit.missingServerHashes, 0);
  assert.equal(audit.missingLocalHashes, 0);
  assert.equal(audit.invalidServerHashes, 0);
  assert.equal(audit.invalidLocalHashes, 0);
  assert.equal(audit.hashDomainsComplete, true);
  assert.equal(audit.crossDomainEqualityRequired, false);

  const first = verifier.safeRunEvidence({
    local: { prepared: 19, changed: 19, blockedByExistingConflict: 0 },
    enqueue: { enqueued: 19, superseded: 0 },
    push: { synced: 19, conflicts: 0, rejected: 0, retry: 0 },
    bootstrap: { applied: 19, highWatermark: 19 },
    pull: { applied: 0 },
    conflicts: []
  }, {
    pushCursor: 0,
    pullCursor: 0,
    bootstrapCompleted: false,
    bootstrapHighWatermark: 0
  }, {
    pushCursor: 19,
    pullCursor: 19,
    bootstrapCompleted: true,
    bootstrapHighWatermark: 19
  }, audit);

  assert.equal(first.roundTripPass, true, "cross-domain hash inequality must not create a false round-trip failure");

  const replayEvidence = {
    ...first,
    localChanged: 0,
    enqueued: 0,
    pushed: 0,
    pushConflicts: 0,
    pushRejected: 0,
    conflictCount: 0,
    cursorBefore: first.cursorAfter,
    cursorAfter: first.cursorAfter,
    cursorAdvanced: false,
    hashAudit: audit
  };
  const replay = verifier.evaluateReplay(first, replayEvidence);
  assert.equal(replay.pass, true);
  assert.equal(replay.hashDomainsComplete, true);
  assert.equal(replay.hashDigestStable, true);

  const incompleteAudit = await verifier.buildStateHashAudit([
    {
      objectType: "conversation",
      objectId: "missing-local-hash",
      revision: 1,
      serverPayloadHash: "a".repeat(64),
      localPayloadHash: null,
      deletedAt: null
    }
  ], fakeHash, {});
  assert.equal(incompleteAudit.hashDomainsComplete, false);
  const incomplete = verifier.safeRunEvidence({
    local: { prepared: 1, changed: 1 },
    enqueue: { enqueued: 1 },
    push: { synced: 1, conflicts: 0, rejected: 0 },
    bootstrap: { applied: 1, highWatermark: 1 },
    pull: { applied: 0 },
    conflicts: []
  }, { pushCursor: 0, pullCursor: 0 }, { pushCursor: 1, pullCursor: 1 }, incompleteAudit);
  assert.equal(incomplete.roundTripPass, false, "missing active hash-domain evidence must still fail closed");

  console.log("aha-canonical-production-round-trip-hash-domains-v1.test.cjs passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
