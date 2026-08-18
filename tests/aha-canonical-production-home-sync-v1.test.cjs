const assert = require("node:assert/strict");
const fs = require("node:fs");

const controlPath = "js/ahaCanonicalProductionHomeSync.js";
const hubPath = "js/ahaSyncHub.js";
assert.equal(fs.existsSync(controlPath), true, `${controlPath} mangler`);
assert.equal(fs.existsSync(hubPath), true, `${hubPath} mangler`);

const source = fs.readFileSync(controlPath, "utf8");
const hubSource = fs.readFileSync(hubPath, "utf8");

assert.match(source, /aha_canonical_production_home_sync_v1/);
assert.match(source, /https:\/\/aha-canonical-api-production\.redground-9c6e20c2\.northeurope\.azurecontainerapps\.io/);
assert.match(source, /https:\/\/paradispartiet\.github\.io/);
assert.doesNotMatch(source, /aha-echonet\.vercel\.app/);
assert.doesNotMatch(source, /setInterval\s*\(/);
assert.doesNotMatch(source, /onAuthStateChange|SIGNED_IN|TOKEN_REFRESHED/);
assert.match(source, /explicitUserAction !== true/);
assert.match(source, /explicitConsent !== true/);
assert.match(source, /workspaceDerivedFromAuthenticatedSubject:\s*true/);
assert.match(source, /userSelectableWorkspace:\s*false/);
assert.match(source, /pilotIdentityEnforcedServerSide:\s*true/);
assert.match(source, /rawPayloadRendered:\s*false/);
assert.match(source, /serverStateRendered:\s*false/);
assert.match(source, /AHACanonicalManualSyncRunner/);
assert.match(source, /AHACanonicalSyncProductionPilotBridge/);
assert.match(source, /Synkroniser nå/);
assert.match(source, /Bekreft og synkroniser/);

const startup = source.slice(source.lastIndexOf("if (global.document)"));
assert.doesNotMatch(startup, /execute\s*\(/, "Home-load must not execute canonical sync");
assert.doesNotMatch(startup, /ensureCanonicalDependencies\s*\(/, "Home-load must not load canonical sync stack");

assert.match(hubSource, /js\/ahaCanonicalProductionHomeSync\.js/);
assert.match(hubSource, /DOMContentLoaded/);
assert.doesNotMatch(hubSource, /AHACanonicalManualSyncRunner\.run/);
assert.doesNotMatch(hubSource, /AHA_CANONICAL_SYNC_ENABLED\s*=\s*true/);

const api = require(`../${controlPath}`);
assert.equal(api.PRODUCTION_API_ORIGIN, "https://aha-canonical-api-production.redground-9c6e20c2.northeurope.azurecontainerapps.io");
assert.equal(api.PRODUCTION_FRONTEND_ORIGIN, "https://paradispartiet.github.io");
assert.equal(api.isAllowedFrontendOrigin("https://paradispartiet.github.io"), true);
assert.equal(api.isAllowedFrontendOrigin("https://aha-echonet.vercel.app"), false);
assert.equal(api.isAllowedFrontendOrigin("http://localhost:3000"), true);

const status = api.getStatus({ origin: "https://paradispartiet.github.io" });
assert.equal(status.autoSync, false);
assert.equal(status.loginTriggersSync, false);
assert.equal(status.authReadyTriggersSync, false);
assert.equal(status.backgroundSync, false);
assert.equal(status.executesOnLoad, false);
assert.equal(status.requiresExplicitUserAction, true);
assert.equal(status.requiresExplicitConsent, true);
assert.equal(status.userSelectableWorkspace, false);
assert.equal(status.workspaceDerivedFromAuthenticatedSubject, true);
assert.equal(status.pilotIdentityEnforcedServerSide, true);

let authReads = 0;
let runnerCalls = 0;
const subject = "e59cf60f-74e4-4db4-98c7-5c35bddfed48";
const expectedWorkspace = `personal-${subject}`;
const storage = {
  data: new Map(),
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; },
  setItem(key, value) { this.data.set(key, String(value)); }
};
const bridge = {
  async readAuthenticatedSession() {
    authReads += 1;
    return { access_token: "test-token", user: { id: subject } };
  },
  resolvePilotIdentity(session) {
    assert.equal(session.user.id, subject);
    return Object.freeze({ subject, workspaceId: expectedWorkspace });
  },
  summarizeResult(result) {
    return Object.freeze({
      ok: true,
      localPrepared: result.localPrepared,
      localChanged: result.localChanged,
      enqueued: result.enqueued,
      pushed: result.pushed,
      bootstrapApplied: result.bootstrapApplied,
      pullApplied: result.pullApplied,
      conflictCount: result.conflictCount,
      conflictReasons: {}
    });
  }
};
const runner = {
  async run(options) {
    runnerCalls += 1;
    assert.equal(options.explicitUserAction, true);
    assert.equal(options.workspaceId, expectedWorkspace);
    assert.equal(options.apiBaseUrl, api.PRODUCTION_API_ORIGIN);
    assert.equal(options.accessToken, "test-token");
    assert.equal(options.storage, storage);
    return {
      workspaceId: expectedWorkspace,
      localPrepared: 1,
      localChanged: 0,
      enqueued: 0,
      pushed: 0,
      bootstrapApplied: 0,
      pullApplied: 0,
      conflictCount: 0
    };
  }
};

(async () => {
  await assert.rejects(
    api.execute({ explicitUserAction: false, explicitConsent: true, origin: "https://paradispartiet.github.io" }, { bridge, runner, storage }),
    /explicit production sync user action is required/
  );
  assert.equal(authReads, 0);
  assert.equal(runnerCalls, 0);

  await assert.rejects(
    api.execute({ explicitUserAction: true, explicitConsent: false, origin: "https://paradispartiet.github.io" }, { bridge, runner, storage }),
    /explicit production sync consent is required/
  );
  assert.equal(authReads, 0);
  assert.equal(runnerCalls, 0);

  await assert.rejects(
    api.execute({ explicitUserAction: true, explicitConsent: true, origin: "https://aha-echonet.vercel.app" }, { bridge, runner, storage }),
    /production sync frontend origin is not allowed/
  );
  assert.equal(authReads, 0);
  assert.equal(runnerCalls, 0);

  const result = await api.execute(
    { explicitUserAction: true, explicitConsent: true, origin: "https://paradispartiet.github.io" },
    { bridge, runner, storage, fetch: async () => { throw new Error("test fetch should be owned by mocked runner"); } }
  );
  assert.equal(authReads, 1);
  assert.equal(runnerCalls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.localPrepared, 1);
  assert.equal(result.localChanged, 0);
  assert.equal(result.pushed, 0);
  assert.equal(result.conflictCount, 0);

  assert.equal(api.safeErrorMessage({ status: 403, message: "CANONICAL_SYNC_PILOT_FORBIDDEN" }), "Production-sync er foreløpig bare tilgjengelig for den godkjente pilotprofilen.");
  assert.equal(api.safeErrorMessage(new Error("Load failed")), "Kunne ikke nå production-sync akkurat nå. Ingen automatisk retry kjøres.");

  const rendered = api.renderResult({ localPrepared: 1, localChanged: 0, enqueued: 0, pushed: 0, bootstrapApplied: 0, pullApplied: 0, conflictCount: 0 });
  assert.match(rendered, /Lokale canonical objekter: 1/);
  assert.match(rendered, /Synkronisert til server: 0/);
  assert.match(rendered, /Konflikter: 0/);
  assert.doesNotMatch(rendered, new RegExp(subject));
  assert.doesNotMatch(rendered, /test-token/);

  console.log("aha-canonical-production-home-sync-v1.test.cjs passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
