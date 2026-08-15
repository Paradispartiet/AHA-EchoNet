const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const PAGE = "canonical-sync-staging.html";
const BRIDGE = "js/ahaCanonicalSyncStagingBridge.js";
const HOME = "index.html";
const DOC = "docs/AHA_CANONICAL_SYNC_STAGING_ACTIVATION_V1.md";

for (const file of [PAGE, BRIDGE, HOME]) {
  assert.equal(fs.existsSync(file), true, `${file} mangler`);
}

const page = fs.readFileSync(PAGE, "utf8");
const bridgeSource = fs.readFileSync(BRIDGE, "utf8");
const home = fs.readFileSync(HOME, "utf8");

// Home remains the old read-only Sync Hub/status surface. Canonical staging is direct-URL only.
assert.equal(home.includes(PAGE), false, "Home must not link to canonical staging execution");
assert.equal(home.includes(BRIDGE), false, "Home must not load canonical staging bridge");
for (const runtime of [
  "ahaCanonicalSyncHash.js",
  "ahaCanonicalSyncStore.js",
  "ahaCanonicalFrontendSyncAdapter.js",
  "ahaCanonicalLocalApplyAdapter.js",
  "ahaCanonicalSyncApiClient.js",
  "ahaCanonicalManualSyncRunner.js"
]) {
  assert.equal(home.includes(runtime), false, `Home must not load ${runtime}`);
}

// The staging page loads only the canonical chain plus the minimal Supabase client bootstrap.
for (const required of [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "js/ahaConfig.js",
  "js/ahaDb.js",
  "js/ahaCanonicalSyncHash.js",
  "js/ahaCanonicalSyncStore.js",
  "js/ahaLocalAccountImport.js",
  "js/ahaCanonicalFrontendSyncAdapter.js",
  "js/ahaCanonicalLocalApplyAdapter.js",
  "js/ahaCanonicalSyncApiClient.js",
  "js/ahaCanonicalManualSyncRunner.js",
  "js/ahaCanonicalSyncStagingBridge.js"
]) {
  assert.ok(page.includes(required), `staging page must load ${required}`);
}
for (const forbidden of [
  "js/ahaAuth.js",
  "js/ahaSyncHub.js",
  "js/ahaManualSyncAdapter.js",
  "js/ahaManualSyncStateMachine.js",
  "js/ahaLists.js",
  "js/ahaPaths.js",
  "js/ahaGroups.js",
  "js/ahaAvisa.js"
]) {
  assert.equal(page.includes(forbidden), false, `staging page must not load ${forbidden}`);
}
assert.match(page, /name="robots"\s+content="noindex,nofollow"/);
assert.match(page, /\?ahaCanonicalStaging=1/);
assert.match(page, /RUN_AHA_CANONICAL_STAGING_SYNC/);
assert.match(page, /name="explicitConsent"/);
assert.doesNotMatch(page, /name=["'](?:accessToken|bearerToken|jwt)["']/i, "staging page must not ask the operator to paste bearer tokens");

const orderedScripts = [
  "js/ahaConfig.js",
  "js/ahaDb.js",
  "js/ahaCanonicalSyncHash.js",
  "js/ahaCanonicalSyncStore.js",
  "js/ahaLocalAccountImport.js",
  "js/ahaCanonicalFrontendSyncAdapter.js",
  "js/ahaCanonicalLocalApplyAdapter.js",
  "js/ahaCanonicalSyncApiClient.js",
  "js/ahaCanonicalManualSyncRunner.js",
  "js/ahaCanonicalSyncStagingBridge.js"
];
for (let index = 1; index < orderedScripts.length; index += 1) {
  assert.ok(page.indexOf(orderedScripts[index - 1]) < page.indexOf(orderedScripts[index]), `${orderedScripts[index - 1]} must load before ${orderedScripts[index]}`);
}

// The bridge has exactly one passive page-load behavior: bind the form. No auth/storage/timer sync triggers.
assert.match(bridgeSource, /explicitUserAction:\s*true/);
assert.match(bridgeSource, /explicitConsent/);
assert.match(bridgeSource, /ahaCanonicalStaging/);
assert.match(bridgeSource, /RUN_AHA_CANONICAL_STAGING_SYNC/);
assert.match(bridgeSource, /createLazySessionProvider/);
assert.doesNotMatch(bridgeSource, /aha:auth-ready|onAuthStateChange|SIGNED_IN|TOKEN_REFRESHED/);
assert.doesNotMatch(bridgeSource, /addEventListener\s*\(\s*["'](?:storage|visibilitychange)["']/);
assert.doesNotMatch(bridgeSource, /\bsetInterval\s*\(|\bsetTimeout\s*\(/);
assert.doesNotMatch(bridgeSource, /syncFromDatabase\s*\(/);
assert.doesNotMatch(bridgeSource, /console\.(?:log|warn|error)\s*\(/);
assert.doesNotMatch(bridgeSource, /localStorage\s*\.\s*(?:setItem|removeItem)\s*\(/);

function loadBridge(extra = {}) {
  const context = {
    window: null,
    globalThis: null,
    URL,
    URLSearchParams,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Error,
    Promise,
    Map,
    Set,
    console,
    ...extra
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(bridgeSource, context, { filename: BRIDGE });
  return context;
}

async function run() {
  let runnerTouches = 0;
  let dbTouches = 0;
  const runner = {
    async run(options) {
      runnerTouches += 1;
      assert.equal(options.explicitUserAction, true);
      assert.equal(options.workspaceId, "workspace-personal-1");
      assert.equal(options.apiBaseUrl, "https://aha-api-staging.example");
      assert.equal(typeof options.auth?.getSession, "function");
      return {
        workspaceId: options.workspaceId,
        deviceId: "device-1",
        local: { prepared: 10, changed: 2, blockedByExistingConflict: 0 },
        enqueue: { enqueued: 2, superseded: 0 },
        push: { synced: 2, conflicts: 1, rejected: 0, retry: 0 },
        bootstrap: { pages: 1, applied: 4 },
        pull: { pages: 1, applied: 1 },
        conflicts: [{
          objectType: "insight",
          objectId: "secret-object-id-must-not-render",
          reason: "stale_base_revision",
          serverState: { secret: "SERVER_STATE_MUST_NOT_RENDER" },
          localPayload: { secret: "LOCAL_PAYLOAD_MUST_NOT_RENDER" }
        }]
      };
    }
  };
  const db = {
    getClient() {
      dbTouches += 1;
      return {
        auth: {
          async getSession() {
            return { data: { session: { access_token: "TOKEN_MUST_NOT_RENDER" } }, error: null };
          }
        }
      };
    }
  };
  const openLocation = { search: "?ahaCanonicalStaging=1", origin: "https://paradispartiet.github.io" };
  const closedLocation = { search: "", origin: "https://paradispartiet.github.io" };
  const context = loadBridge({ location: closedLocation });
  const bridge = context.AHACanonicalSyncStagingBridge;
  assert.ok(bridge);
  assert.equal(runnerTouches, 0, "loading staging bridge must not touch runner");
  assert.equal(dbTouches, 0, "loading staging bridge must not touch auth/session provider");
  assert.equal(bridge.getStatus({ location: closedLocation }).gateOpen, false);
  assert.equal(bridge.getStatus({ location: openLocation }).gateOpen, true);
  assert.equal(bridge.getStatus({ location: openLocation }).loginTriggersSync, false);
  assert.equal(bridge.getStatus({ location: openLocation }).authReadyTriggersSync, false);
  assert.equal(bridge.getStatus({ location: openLocation }).executesOnLoad, false);

  await assert.rejects(() => bridge.execute({
    apiBaseUrl: "https://aha-api-staging.example",
    workspaceId: "workspace-personal-1",
    confirmation: bridge.CONFIRMATION_PHRASE,
    explicitConsent: true
  }, { location: closedLocation, runner, db }), /URL gate is closed|staging URL gate is closed/);
  assert.equal(runnerTouches, 0);
  assert.equal(dbTouches, 0);

  await assert.rejects(() => bridge.execute({
    apiBaseUrl: "https://aha-api-staging.example",
    workspaceId: "workspace-personal-1",
    confirmation: "WRONG",
    explicitConsent: true
  }, { location: openLocation, runner, db }), /confirmation phrase is incorrect/);
  assert.equal(runnerTouches, 0);
  assert.equal(dbTouches, 0);

  await assert.rejects(() => bridge.execute({
    apiBaseUrl: "https://aha-api-staging.example",
    workspaceId: "workspace-personal-1",
    confirmation: bridge.CONFIRMATION_PHRASE,
    explicitConsent: false
  }, { location: openLocation, runner, db }), /explicit staging consent is required/);
  assert.equal(runnerTouches, 0);

  await assert.rejects(() => bridge.execute({
    apiBaseUrl: "http://remote.example",
    workspaceId: "workspace-personal-1",
    confirmation: bridge.CONFIRMATION_PHRASE,
    explicitConsent: true
  }, { location: openLocation, runner, db }), /must use HTTPS/);
  await assert.rejects(() => bridge.execute({
    apiBaseUrl: "https://paradispartiet.github.io",
    workspaceId: "workspace-personal-1",
    confirmation: bridge.CONFIRMATION_PHRASE,
    explicitConsent: true
  }, { location: openLocation, runner, db }), /separate origin/);
  await assert.rejects(() => bridge.execute({
    apiBaseUrl: "https://user:pass@aha-api-staging.example",
    workspaceId: "workspace-personal-1",
    confirmation: bridge.CONFIRMATION_PHRASE,
    explicitConsent: true
  }, { location: openLocation, runner, db }), /must not contain credentials/);
  assert.equal(runnerTouches, 0);

  const lazy = bridge.createLazySessionProvider({ db });
  assert.equal(lazy.touched, false);
  assert.equal(dbTouches, 0, "creating the session provider must remain lazy");
  const session = await lazy.getSession();
  assert.equal(lazy.touched, true);
  assert.equal(dbTouches, 1);
  assert.equal(session.access_token, "TOKEN_MUST_NOT_RENDER");

  const summary = await bridge.execute({
    apiBaseUrl: "https://aha-api-staging.example/",
    workspaceId: "workspace-personal-1",
    confirmation: bridge.CONFIRMATION_PHRASE,
    explicitConsent: true
  }, { location: openLocation, runner, db });
  assert.equal(runnerTouches, 1);
  assert.equal(summary.ok, true);
  assert.equal(summary.localPrepared, 10);
  assert.equal(summary.localChanged, 2);
  assert.equal(summary.pushed, 2);
  assert.equal(summary.bootstrapApplied, 4);
  assert.equal(summary.pullApplied, 1);
  assert.equal(summary.conflictCount, 1);
  assert.equal(summary.conflictReasons.stale_base_revision, 1);
  assert.equal(summary.rawPayloadIncluded, false);
  assert.equal(summary.serverStateIncluded, false);
  const serializedSummary = JSON.stringify(summary);
  for (const secret of ["SERVER_STATE_MUST_NOT_RENDER", "LOCAL_PAYLOAD_MUST_NOT_RENDER", "TOKEN_MUST_NOT_RENDER", "secret-object-id-must-not-render"]) {
    assert.equal(serializedSummary.includes(secret), false, `summary must not leak ${secret}`);
  }

  let releaseRun;
  const slowRunner = {
    run() {
      return new Promise((resolve) => { releaseRun = resolve; });
    }
  };
  const first = bridge.execute({
    apiBaseUrl: "https://aha-api-staging.example",
    workspaceId: "workspace-personal-1",
    confirmation: bridge.CONFIRMATION_PHRASE,
    explicitConsent: true
  }, { location: openLocation, runner: slowRunner, db });
  await assert.rejects(() => bridge.execute({
    apiBaseUrl: "https://aha-api-staging.example",
    workspaceId: "workspace-personal-1",
    confirmation: bridge.CONFIRMATION_PHRASE,
    explicitConsent: true
  }, { location: openLocation, runner: slowRunner, db }), /already running/);
  releaseRun({ workspaceId: "workspace-personal-1", deviceId: "device-1", local: {}, enqueue: {}, push: {}, pull: {}, conflicts: [] });
  await first;

  console.log("aha-canonical-sync-staging-activation-v1.test.cjs passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
