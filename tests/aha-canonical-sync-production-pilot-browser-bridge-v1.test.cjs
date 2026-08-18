const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const bridgePath = "js/ahaCanonicalSyncProductionPilotBridge.js";
const pagePath = "canonical-sync-production-pilot.html";

assert.equal(fs.existsSync(path.join(root, bridgePath)), true, `${bridgePath} mangler`);
assert.equal(fs.existsSync(path.join(root, pagePath)), true, `${pagePath} mangler`);

const bridgeSource = read(bridgePath);
const page = read(pagePath);

// The production pilot has its own isolated operator surface; staging semantics
// must never be reused against production.
assert.match(page, /<meta name="robots" content="noindex,nofollow"/);
assert.match(page, /Canonical Sync · Production pilot/);
assert.match(page, /ahaCanonicalProductionPilot=1/);
assert.match(page, /RUN_AHA_CANONICAL_PRODUCTION_PILOT_SYNC/);
assert.match(page, /ahaCanonicalSyncProductionPilotBridge\.js/);
assert.doesNotMatch(page, /ahaCanonicalSyncStagingBridge\.js|ahaCanonicalStagingSourceHydrator\.js/);
assert.doesNotMatch(page, /<input[^>]+name=["']workspaceId["']/i);
assert.match(page, /Workspace kan ikke skrives inn/);
assert.match(page, /ekte lokale canonical-lageret/);
assert.match(page, /Rå payload, JWT-subjekt, workspace-ID og serverState vises ikke/);

assert.match(bridgeSource, /explicit_manual_canonical_sync_production_pilot/);
assert.match(bridgeSource, /workspaceId: `personal-\$\{subject\}`/);
assert.match(bridgeSource, /explicitUserAction:\s*true/);
assert.match(bridgeSource, /accessToken:\s*session\.access_token/);
assert.match(bridgeSource, /pilotIdentityEnforcedServerSide:\s*true/);
assert.match(bridgeSource, /autoSync:\s*false/);
assert.match(bridgeSource, /loginTriggersSync:\s*false/);
assert.match(bridgeSource, /authReadyTriggersSync:\s*false/);
assert.match(bridgeSource, /backgroundSync:\s*false/);
assert.match(bridgeSource, /executesOnLoad:\s*false/);
assert.doesNotMatch(bridgeSource, /AHA_PRODUCTION_PILOT_PROFILE_ID|AHA_CANONICAL_SYNC_PILOT_PROFILE_ID/);
assert.doesNotMatch(bridgeSource, /RUN_AHA_CANONICAL_STAGING_SYNC|ahaCanonicalStaging/);

// Loading the bridge itself must be side-effect free. Auth, storage and fetch
// are wired with counters that would fail this test if page load touched them.
const touches = { auth: 0, storageRead: 0, storageWrite: 0, fetch: 0, runner: 0 };
const inertStorage = {
  getItem() { touches.storageRead += 1; return null; },
  setItem() { touches.storageWrite += 1; }
};
const windowObject = {
  location: { search: "", origin: "https://aha.example" },
  AHADb: {
    getClient() {
      touches.auth += 1;
      throw new Error("auth must not be touched on load");
    }
  },
  localStorage: inertStorage,
  fetch() {
    touches.fetch += 1;
    throw new Error("fetch must not be touched on load");
  }
};
const context = vm.createContext({
  window: windowObject,
  globalThis: windowObject,
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
  console
});
vm.runInContext(bridgeSource, context, { filename: bridgePath });
const bridge = windowObject.AHACanonicalSyncProductionPilotBridge;
assert.ok(bridge);
assert.deepEqual(touches, { auth: 0, storageRead: 0, storageWrite: 0, fetch: 0, runner: 0 });

const status = bridge.getStatus({ location: { search: "", origin: "https://aha.example" } });
assert.equal(status.gateOpen, false);
assert.equal(status.autoSync, false);
assert.equal(status.loginTriggersSync, false);
assert.equal(status.authReadyTriggersSync, false);
assert.equal(status.backgroundSync, false);
assert.equal(status.executesOnLoad, false);
assert.equal(status.requiresExplicitUserAction, true);
assert.equal(status.requiresExplicitConsent, true);
assert.equal(status.requiresExplicitApiBaseUrl, true);
assert.equal(status.workspaceDerivedFromAuthenticatedSubject, true);
assert.equal(status.userSelectableWorkspace, false);
assert.equal(status.primarySourceHydration, false);
assert.equal(status.appliesServerStateToRealLocalCanonicalStorage, true);
assert.equal(status.pilotIdentityEnforcedServerSide, true);

assert.throws(
  () => bridge.assertExecutionInput({
    apiBaseUrl: "https://api.example",
    confirmation: bridge.CONFIRMATION_PHRASE,
    explicitConsent: true
  }, { location: { search: "", origin: "https://aha.example" } }),
  /URL gate is closed/
);
assert.deepEqual(touches, { auth: 0, storageRead: 0, storageWrite: 0, fetch: 0, runner: 0 });

assert.throws(
  () => bridge.assertExecutionInput({
    apiBaseUrl: "https://api.example/v1",
    confirmation: bridge.CONFIRMATION_PHRASE,
    explicitConsent: true
  }, { location: { search: "?ahaCanonicalProductionPilot=1", origin: "https://aha.example" } }),
  /origin, not an API path/
);
assert.throws(
  () => bridge.assertExecutionInput({
    apiBaseUrl: "https://aha.example",
    confirmation: bridge.CONFIRMATION_PHRASE,
    explicitConsent: true
  }, { location: { search: "?ahaCanonicalProductionPilot=1", origin: "https://aha.example" } }),
  /separate origin/
);

const pilotSubject = "11111111-1111-4111-8111-111111111111";
const session = {
  access_token: "pilot-access-token-not-rendered",
  user: { id: pilotSubject }
};
const executionStorage = {
  values: new Map(),
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; },
  setItem(key, value) { this.values.set(key, String(value)); }
};
let runnerInput = null;
const runner = {
  async run(input) {
    touches.runner += 1;
    runnerInput = input;
    return {
      workspaceId: `personal-${pilotSubject}`,
      local: { prepared: 4, changed: 2, blockedByExistingConflict: 0 },
      enqueue: { enqueued: 2, superseded: 0 },
      push: { synced: 2, conflicts: 0, rejected: 0, retry: 0 },
      bootstrap: { pages: 1, applied: 1 },
      pull: { pages: 1, applied: 1 },
      conflicts: []
    };
  }
};
const db = {
  getClient() {
    touches.auth += 1;
    return {
      auth: {
        async getSession() {
          return { data: { session }, error: null };
        }
      }
    };
  }
};

(async () => {
  const summary = await bridge.execute({
    apiBaseUrl: "https://api.example",
    confirmation: bridge.CONFIRMATION_PHRASE,
    explicitConsent: true
  }, {
    location: { search: "?ahaCanonicalProductionPilot=1", origin: "https://aha.example" },
    db,
    runner,
    storage: executionStorage,
    fetch: async () => { throw new Error("fake runner must own fetch"); },
    crypto: {},
    indexedDB: {}
  });

  assert.equal(touches.auth, 1, "auth must be read exactly once after explicit execution");
  assert.equal(touches.runner, 1);
  assert.ok(runnerInput);
  assert.equal(runnerInput.explicitUserAction, true);
  assert.equal(runnerInput.workspaceId, `personal-${pilotSubject}`);
  assert.equal(runnerInput.apiBaseUrl, "https://api.example");
  assert.equal(runnerInput.accessToken, session.access_token);
  assert.equal(runnerInput.storage, executionStorage, "production pilot must use real supplied local storage, not a staging overlay");

  assert.equal(summary.ok, true);
  assert.equal(summary.mode, "explicit_manual_canonical_sync_production_pilot");
  assert.equal(summary.workspaceDerivedFromAuthenticatedSubject, true);
  assert.equal(summary.localPrepared, 4);
  assert.equal(summary.pushed, 2);
  assert.equal(summary.bootstrapApplied, 1);
  assert.equal(summary.pullApplied, 1);
  assert.equal(summary.rawPayloadIncluded, false);
  assert.equal(summary.serverStateIncluded, false);
  assert.equal(summary.profileSubjectIncluded, false);
  assert.equal(summary.workspaceIdIncluded, false);
  assert.equal(Object.prototype.hasOwnProperty.call(summary, "workspaceId"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(summary, "subject"), false);
  assert.doesNotMatch(JSON.stringify(summary), new RegExp(pilotSubject));
  assert.doesNotMatch(JSON.stringify(summary), /pilot-access-token-not-rendered/);

  assert.throws(
    () => bridge.resolvePilotIdentity({ user: { id: "not-a-uuid" } }),
    /must be a UUID/
  );

  console.log("aha-canonical-sync-production-pilot-browser-bridge-v1.test.cjs passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
