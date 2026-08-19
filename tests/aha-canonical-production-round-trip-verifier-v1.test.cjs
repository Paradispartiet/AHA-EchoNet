const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = process.cwd();
const verifierPath = "js/ahaCanonicalProductionRoundTripVerifier.js";
const pagePath = "canonical-sync-production-roundtrip.html";
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

for (const file of [verifierPath, pagePath]) {
  assert.equal(fs.existsSync(path.join(root, file)), true, `${file} mangler`);
}

const source = read(verifierPath);
const page = read(pagePath);

assert.match(page, /<meta name="robots" content="noindex,nofollow"/);
assert.match(page, /Canonical Sync · Two-profile round-trip/);
assert.match(page, /RUN_AHA_CANONICAL_TWO_PROFILE_ROUND_TRIP/);
assert.match(page, /aha-canonical-production-roundtrip-form/);
assert.match(page, /aha-canonical-production-roundtrip-first/);
assert.match(page, /aha-canonical-production-roundtrip-replay/);
assert.match(page, /aha-canonical-production-roundtrip-status/);
assert.match(page, /aha-canonical-production-roundtrip-output/);
assert.match(page, /ahaCanonicalProductionHomeSync\.js/);
assert.match(page, /ahaCanonicalProductionRoundTripVerifier\.js/);
assert.match(page, /AHACanonicalProductionRoundTripVerifier\?\.bind\(\)/);
assert.doesNotMatch(page, /name=["']apiBaseUrl["']/i);
assert.match(page, /begge eksisterende profiler/);
assert.match(page, /profil #3/);

assert.match(source, /ahaCanonicalProductionRoundTrip/);
assert.match(source, /RUN_AHA_CANONICAL_TWO_PROFILE_ROUND_TRIP/);
assert.match(source, /explicit_manual_two_profile_round_trip_proof/);
assert.match(source, /PRODUCTION_API_ORIGIN/);
assert.match(source, /requiresExplicitUserAction:\s*true/);
assert.match(source, /requiresExplicitConsent:\s*true/);
assert.match(source, /automaticSync:\s*false/);
assert.match(source, /loginTriggeredSync:\s*false/);
assert.match(source, /backgroundSync:\s*false/);
assert.match(source, /rawPayloadIncluded:\s*false/);
assert.match(source, /profileSubjectIncluded:\s*false/);
assert.match(source, /workspaceIdIncluded:\s*false/);
assert.match(source, /accessTokenIncluded:\s*false/);
assert.doesNotMatch(source, /setInterval|setTimeout|requestIdleCallback|addEventListener\(["']load["']/);

// Loading the verifier must be side-effect free.
const touches = { auth: 0, storageRead: 0, storageWrite: 0, fetch: 0, runner: 0 };
const inertWindow = {
  location: { search: "", origin: "https://paradispartiet.github.io" },
  localStorage: {
    getItem() { touches.storageRead += 1; return null; },
    setItem() { touches.storageWrite += 1; }
  },
  fetch() { touches.fetch += 1; throw new Error("fetch must not run on load"); }
};
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
assert.deepEqual(touches, { auth: 0, storageRead: 0, storageWrite: 0, fetch: 0, runner: 0 });

assert.equal(verifier.getStatus({ location: { search: "", origin: "https://paradispartiet.github.io" } }).gateOpen, false);
assert.equal(verifier.getStatus({ location: { search: "?ahaCanonicalProductionRoundTrip=1", origin: "https://paradispartiet.github.io" } }).gateOpen, true);
assert.throws(
  () => verifier.assertExplicitExecution({ confirmation: verifier.CONFIRMATION_PHRASE, explicitConsent: true }, { location: { search: "" } }),
  /URL gate is closed/
);
assert.throws(
  () => verifier.assertExplicitExecution({ confirmation: "wrong", explicitConsent: true }, { location: { search: "?ahaCanonicalProductionRoundTrip=1" } }),
  /confirmation phrase is incorrect/
);

const hashAudit = Object.freeze({
  stateCount: 2,
  comparable: 2,
  matches: 2,
  mismatches: 0,
  serverOnly: 0,
  localOnly: 0,
  deleted: 0,
  batchDigestSha256: "a".repeat(64),
  objectIdentifiersIncluded: false,
  payloadIncluded: false
});
const firstEvidence = verifier.safeRunEvidence({
  local: { prepared: 2, changed: 1, blockedByExistingConflict: 0 },
  enqueue: { enqueued: 1, superseded: 0 },
  push: { synced: 1, conflicts: 0, rejected: 0, retry: 0 },
  bootstrap: null,
  pull: { pages: 1, applied: 1 },
  conflicts: []
}, {
  pushCursor: 4,
  pullCursor: 10,
  bootstrapCompleted: true,
  bootstrapHighWatermark: 10
}, {
  pushCursor: 5,
  pullCursor: 11,
  bootstrapCompleted: true,
  bootstrapHighWatermark: 10
}, hashAudit);

assert.equal(firstEvidence.roundTripPass, true);
assert.equal(firstEvidence.pushed, 1);
assert.equal(firstEvidence.pullApplied, 1);
assert.equal(firstEvidence.cursorAdvanced, true);
assert.equal(firstEvidence.hashAudit.mismatches, 0);
assert.equal(firstEvidence.rawPayloadIncluded, false);
assert.equal(firstEvidence.profileSubjectIncluded, false);
assert.equal(firstEvidence.workspaceIdIncluded, false);
assert.equal(firstEvidence.accessTokenIncluded, false);

const replayEvidence = {
  ...firstEvidence,
  localChanged: 0,
  enqueued: 0,
  pushed: 0,
  pushConflicts: 0,
  pushRejected: 0,
  conflictCount: 0,
  cursorBefore: firstEvidence.cursorAfter,
  cursorAfter: firstEvidence.cursorAfter,
  cursorAdvanced: false,
  hashAudit
};
const replay = verifier.evaluateReplay(firstEvidence, replayEvidence);
assert.equal(replay.pass, true);
assert.equal(replay.hashDigestStable, true);

// Real runOnce orchestration is tested with a fake authenticated pilot. The
// access token and derived identifiers must be used internally but never appear
// in the returned evidence.
const subject = "22222222-2222-4222-8222-222222222222";
const token = "candidate-token-must-never-appear-in-evidence";
const workspaceId = `personal-${subject}`;
const productionApiOrigin = "https://aha-canonical-api-production.example";
const storage = {
  values: new Map(),
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; },
  setItem(key, value) { this.values.set(key, String(value)); }
};
let runnerInput = null;
const bridge = {
  async readAuthenticatedSession() {
    touches.auth += 1;
    return { access_token: token, user: { id: subject } };
  },
  resolvePilotIdentity(session) {
    return { subject: session.user.id, workspaceId: `personal-${session.user.id}` };
  }
};
const runner = {
  resolveDeviceId() { return "browser-device-roundtrip"; },
  async run(input) {
    touches.runner += 1;
    runnerInput = input;
    return {
      workspaceId,
      local: { prepared: 1, changed: 1, blockedByExistingConflict: 0 },
      enqueue: { enqueued: 1, superseded: 0 },
      push: { synced: 1, conflicts: 0, rejected: 0, retry: 0 },
      bootstrap: null,
      pull: { pages: 1, applied: 1 },
      conflicts: [],
      cursor: {
        workspaceId,
        deviceId: "browser-device-roundtrip",
        pushCursor: 8,
        pullCursor: 8,
        bootstrapCompleted: true,
        bootstrapHighWatermark: 6
      }
    };
  }
};
const store = {
  async getCursor() {
    return {
      workspaceId,
      deviceId: "browser-device-roundtrip",
      pushCursor: 7,
      pullCursor: 7,
      bootstrapCompleted: true,
      bootstrapHighWatermark: 6
    };
  },
  async listObjectStates() {
    return [
      {
        workspaceId,
        objectType: "insight",
        objectId: "local-sensitive-object-id",
        revision: 3,
        serverPayloadHash: "b".repeat(64),
        localPayloadHash: "b".repeat(64),
        deletedAt: null
      }
    ];
  }
};
const hash = {
  async canonicalSyncPayloadHash() { return "c".repeat(64); }
};
const home = { PRODUCTION_API_ORIGIN: productionApiOrigin };

(async () => {
  const evidence = await verifier.runOnce({
    confirmation: verifier.CONFIRMATION_PHRASE,
    explicitConsent: true
  }, {
    location: { search: "?ahaCanonicalProductionRoundTrip=1", origin: "https://paradispartiet.github.io" },
    bridge,
    runner,
    store,
    hash,
    home,
    storage,
    crypto: {},
    indexedDB: {},
    fetch: async () => { throw new Error("fake runner owns network"); }
  });

  assert.equal(touches.auth, 1);
  assert.equal(touches.runner, 1);
  assert.ok(runnerInput);
  assert.equal(runnerInput.workspaceId, workspaceId);
  assert.equal(runnerInput.apiBaseUrl, productionApiOrigin);
  assert.equal(runnerInput.accessToken, token);
  assert.equal(runnerInput.explicitUserAction, true);
  assert.equal(evidence.roundTripPass, true);
  assert.equal(evidence.hashAudit.comparable, 1);
  assert.equal(evidence.hashAudit.matches, 1);
  assert.equal(evidence.hashAudit.mismatches, 0);
  assert.equal(evidence.hashAudit.batchDigestSha256, "c".repeat(64));

  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, new RegExp(subject));
  assert.doesNotMatch(serialized, /personal-22222222/);
  assert.doesNotMatch(serialized, /candidate-token-must-never-appear/);
  assert.doesNotMatch(serialized, /local-sensitive-object-id/);

  console.log("aha-canonical-production-round-trip-verifier-v1.test.cjs passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
