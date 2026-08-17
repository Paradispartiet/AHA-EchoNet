const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const PAGE = "canonical-sync-staging.html";
const BRIDGE = "js/ahaCanonicalSyncStagingBridge.js";
const HYDRATOR = "js/ahaCanonicalStagingSourceHydrator.js";
const HOME = "index.html";

for (const file of [PAGE, BRIDGE, HYDRATOR, HOME]) {
  assert.equal(fs.existsSync(file), true, `${file} mangler`);
}

const page = fs.readFileSync(PAGE, "utf8");
const bridgeSource = fs.readFileSync(BRIDGE, "utf8");
const hydratorSource = fs.readFileSync(HYDRATOR, "utf8");
const home = fs.readFileSync(HOME, "utf8");

// Home remains the read-only legacy Sync Hub/status surface. Canonical staging is direct-URL only.
for (const stagingOnly of [PAGE, BRIDGE, HYDRATOR]) {
  assert.equal(home.includes(stagingOnly), false, `Home must not load/link ${stagingOnly}`);
}
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

// The staging page loads only the canonical chain plus minimal Supabase bootstrap and the staging hydrator.
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
  HYDRATOR,
  BRIDGE
]) {
  assert.ok(page.includes(required), `staging page must load ${required}`);
}
for (const forbidden of [
  "js/ahaAuth.js",
  "js/ahaSyncHub.js",
  "js/ahaManualSyncAdapter.js",
  "js/ahaManualSyncStateMachine.js",
  "js/ahaRepository.js",
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
assert.match(page, /read-only-modus/);
assert.match(page, /Notes, Gallery, Feed, Insta, Music, Training, Personal AI, Workbench/);
assert.doesNotMatch(page, /name=["'](?:accessToken|bearerToken|jwt)["']/i, "staging page must not ask operator to paste bearer tokens");

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
  HYDRATOR,
  BRIDGE
];
for (let index = 1; index < orderedScripts.length; index += 1) {
  assert.ok(page.indexOf(orderedScripts[index - 1]) < page.indexOf(orderedScripts[index]), `${orderedScripts[index - 1]} must load before ${orderedScripts[index]}`);
}

// Both staging modules are passive until explicit submit.
assert.match(bridgeSource, /explicitUserAction:\s*true/);
assert.match(bridgeSource, /AHACanonicalStagingSourceHydrator/);
assert.match(bridgeSource, /RUN_AHA_CANONICAL_STAGING_SYNC/);
assert.match(hydratorSource, /writesPrimaryDatabase:\s*false/);
assert.match(hydratorSource, /executesOnLoad:\s*false/);
for (const source of [bridgeSource, hydratorSource]) {
  assert.doesNotMatch(source, /aha:auth-ready|onAuthStateChange|SIGNED_IN|TOKEN_REFRESHED/);
  assert.doesNotMatch(source, /addEventListener\s*\(\s*["'](?:storage|visibilitychange)["']/);
  assert.doesNotMatch(source, /\bsetInterval\s*\(|\bsetTimeout\s*\(/);
  assert.doesNotMatch(source, /console\.(?:log|warn|error)\s*\(/);
}
assert.doesNotMatch(hydratorSource, /\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(/);

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
  let hydratorTouches = 0;
  const hydratedStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  };
  const session = {
    access_token: "TOKEN_MUST_NOT_RENDER",
    user: { id: "user-123" }
  };
  const client = {
    auth: {
      async getSession() {
        return { data: { session }, error: null };
      }
    }
  };
  const db = {
    getClient() {
      dbTouches += 1;
      return client;
    }
  };
  const hydrator = {
    async hydrateStorage(options) {
      hydratorTouches += 1;
      assert.equal(options.client, client);
      assert.equal(options.session.user.id, "user-123");
      return {
        storage: hydratedStorage,
        stats: { fetched: 87, included: 85, excluded: 2, localSourceEvents: 0, mergedSourceEvents: 85 }
      };
    }
  };
  const runner = {
    async run(options) {
      runnerTouches += 1;
      assert.equal(options.explicitUserAction, true);
      assert.equal(options.workspaceId, "workspace-personal-1");
      assert.equal(options.apiBaseUrl, "https://aha-api-staging.example");
      assert.equal(options.storage, hydratedStorage, "runner must receive the hydrated virtual staging storage");
      assert.equal(typeof options.auth?.getSession, "function");
      const cachedSession = await options.auth.getSession();
      assert.equal(cachedSession.user.id, "user-123");
      return {
        workspaceId: options.workspaceId,
        deviceId: "device-1",
        local: { prepared: 85, changed: 85, blockedByExistingConflict: 0 },
        enqueue: { enqueued: 85, superseded: 0 },
        push: { synced: 85, conflicts: 1, rejected: 0, retry: 0 },
        bootstrap: { pages: 1, applied: 85 },
        pull: { pages: 1, applied: 0 },
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

  const openLocation = { search: "?ahaCanonicalStaging=1", origin: "https://paradispartiet.github.io" };
  const closedLocation = { search: "", origin: "https://paradispartiet.github.io" };
  const context = loadBridge({ location: closedLocation, AHACanonicalStagingSourceHydrator: hydrator });
  const bridge = context.AHACanonicalSyncStagingBridge;
  assert.ok(bridge);
  assert.equal(runnerTouches, 0, "loading staging bridge must not touch runner");
  assert.equal(dbTouches, 0, "loading staging bridge must not touch auth/session provider");
  assert.equal(hydratorTouches, 0, "loading staging bridge must not hydrate primary AHA");
  assert.equal(bridge.getStatus({ location: closedLocation }).gateOpen, false);
  assert.equal(bridge.getStatus({ location: openLocation }).gateOpen, true);
  assert.equal(bridge.getStatus({ location: openLocation }).loginTriggersSync, false);
  assert.equal(bridge.getStatus({ location: openLocation }).authReadyTriggersSync, false);
  assert.equal(bridge.getStatus({ location: openLocation }).executesOnLoad, false);
  assert.equal(bridge.getStatus({ location: openLocation }).primarySourceHydration, "explicit_run_only");

  const validInput = {
    apiBaseUrl: "https://aha-api-staging.example",
    workspaceId: "workspace-personal-1",
    confirmation: bridge.CONFIRMATION_PHRASE,
    explicitConsent: true
  };

  await assert.rejects(() => bridge.execute(validInput, { location: closedLocation, runner, db }), /staging URL gate is closed/);
  await assert.rejects(() => bridge.execute({ ...validInput, confirmation: "WRONG" }, { location: openLocation, runner, db }), /confirmation phrase is incorrect/);
  await assert.rejects(() => bridge.execute({ ...validInput, explicitConsent: false }, { location: openLocation, runner, db }), /explicit staging consent is required/);
  await assert.rejects(() => bridge.execute({ ...validInput, apiBaseUrl: "http://remote.example" }, { location: openLocation, runner, db }), /must use HTTPS/);
  await assert.rejects(() => bridge.execute({ ...validInput, apiBaseUrl: "https://paradispartiet.github.io" }, { location: openLocation, runner, db }), /separate origin/);
  await assert.rejects(() => bridge.execute({ ...validInput, apiBaseUrl: "https://user:pass@aha-api-staging.example" }, { location: openLocation, runner, db }), /must not contain credentials/);
  assert.equal(runnerTouches, 0);
  assert.equal(dbTouches, 0, "invalid/gated requests must not touch auth");
  assert.equal(hydratorTouches, 0, "invalid/gated requests must not read primary AHA");

  const lazy = bridge.createLazySessionProvider({ db });
  assert.equal(lazy.touched, false);
  assert.equal(dbTouches, 0, "creating the session provider must remain lazy");
  assert.equal((await lazy.getSession()).user.id, "user-123");
  assert.equal(lazy.touched, true);
  assert.equal(dbTouches, 1);
  assert.equal((await lazy.getSession()).user.id, "user-123");
  assert.equal(dbTouches, 1, "session provider must cache the same authenticated session for hydration and API auth");

  const summary = await bridge.execute({ ...validInput, apiBaseUrl: "https://aha-api-staging.example/" }, { location: openLocation, runner, db });
  assert.equal(runnerTouches, 1);
  assert.equal(hydratorTouches, 1);
  assert.equal(dbTouches, 2, "explicit execution may resolve the primary AHA client exactly once");
  assert.equal(summary.ok, true);
  assert.equal(summary.primarySourceEventsFetched, 87);
  assert.equal(summary.primarySourceEventsIncluded, 85);
  assert.equal(summary.primarySourceEventsExcluded, 2);
  assert.equal(summary.hydratedSourceEventsMerged, 85);
  assert.equal(summary.localPrepared, 85);
  assert.equal(summary.localChanged, 85);
  assert.equal(summary.pushed, 85);
  assert.equal(summary.bootstrapApplied, 85);
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
  const first = bridge.execute(validInput, { location: openLocation, runner: slowRunner, db });
  await assert.rejects(() => bridge.execute(validInput, { location: openLocation, runner: slowRunner, db }), /already running/);
  while (typeof releaseRun !== "function") await Promise.resolve();
  releaseRun({ workspaceId: "workspace-personal-1", deviceId: "device-1", local: {}, enqueue: {}, push: {}, pull: {}, conflicts: [] });
  await first;

  console.log("aha-canonical-sync-staging-activation-v1.test.cjs passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
