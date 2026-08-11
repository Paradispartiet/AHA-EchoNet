const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('js/ahaProfileOverview.js', 'utf8');
const html = fs.readFileSync('profile.html', 'utf8');

function loadContext({ root = { innerHTML: '' }, profileApi } = {}) {
  const document = {
    readyState: 'complete',
    getElementById(id) { return id === 'aha-profile-overview' ? root : null; },
    addEventListener() {}
  };
  const context = {
    console,
    Number,
    String,
    Array,
    Object,
    JSON,
    document,
    AHAProfile: profileApi
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'js/ahaProfileOverview.js' });
  return { context, root };
}

const profileApi = {
  collectProfileStatus() {
    return {
      insightsCount: 12,
      sourceEventsCount: 8,
      notesCount: 4,
      listsCount: 3,
      pathsCount: 2,
      afterworkCount: 5,
      lastActivityAt: '2026-08-11T14:05:00.000Z',
      secret_run_id: 'run_secret_must_not_render'
    };
  },
  collectAhaMetaProfile() {
    return {
      topThemes: [{ label: 'Byutvikling' }, { label: 'Makt' }, { label: 'Arkitektur' }, { label: 'Skjult fjerde' }],
      topConcepts: [{ label: 'Institusjoner' }, { label: 'Transformasjon' }],
      raw_source_text: 'PRIVATE RAW SOURCE MUST NOT RENDER'
    };
  },
  collectHistoryGoStatus() {
    return {
      hasImportPayload: true,
      visitedPlacesCount: 7,
      peopleCollectedCount: 2,
      unlocksCount: 4
    };
  },
  collectPrivacyStatus() { return { localOnly: true }; }
};

const loaded = loadContext({ profileApi });
const api = loaded.context.AHAProfileOverview;
assert.ok(api, 'Profile overview should export an API');
assert.equal(typeof api.buildOverviewModel, 'function');
assert.equal(typeof api.renderOverview, 'function');
assert.equal(typeof api.install, 'function');

const model = api.buildOverviewModel(profileApi);
assert.equal(model.total, 34, 'overview total should derive from the six existing Profile counters');
assert.deepEqual(Array.from(model.footprint, (item) => item.count), [12, 8, 4, 3, 2, 5]);
assert.deepEqual(Array.from(model.themes), ['Byutvikling', 'Makt', 'Arkitektur'], 'overview should keep the compact top-three Profile themes');
assert.equal(model.historyGoCount, 13);
assert.equal(model.historyGoConnected, true);
assert.equal(model.localOnly, true);
assert.equal(model.read_only, true);
assert.equal(model.profile_overview_only, true);
assert.equal(model.social_profile_enabled, false);
assert.equal(model.echonet_shared, false);
assert.equal(model.sync_enabled, false);
assert.equal(model.backend_enabled, false);
assert.equal(model.writes_to_insight_chamber, false);

const serializedModel = JSON.stringify(model);
assert.doesNotMatch(serializedModel, /run_secret_must_not_render|PRIVATE RAW SOURCE MUST NOT RENDER|secret_run_id|raw_source_text/);

const markup = loaded.root.innerHTML;
assert.match(markup, /34 lokale arbeidsobjekter/);
assert.match(markup, /12<\/strong><span>Innsikter/);
assert.match(markup, /8<\/strong><span>Kilder/);
assert.match(markup, /Temaer: Byutvikling · Makt · Arkitektur/);
assert.match(markup, /Begreper: Institusjoner · Transformasjon/);
assert.match(markup, /History Go: 13 lokale progresjonssignaler/);
assert.match(markup, /href="search\.html"[^>]*>Søk i mitt AHA/);
assert.match(markup, /href="knowledge-workbench\.html"[^>]*>Kunnskapsverksted/);
assert.match(markup, /href="personal-ai\.html"[^>]*>Spør min AHA/);
assert.match(markup, /href="insights\.html"[^>]*>Se innsikter/);
assert.doesNotMatch(markup, /run_secret_must_not_render|PRIVATE RAW SOURCE MUST NOT RENDER/);

const emptyModel = api.buildOverviewModel({});
assert.equal(emptyModel.total, 0, 'missing Profile APIs should fail soft');
assert.equal(emptyModel.historyGoConnected, false);
assert.equal(emptyModel.localOnly, true);

let profileReads = 0;
const guardedProfile = new Proxy({}, {
  get() {
    profileReads += 1;
    throw new Error('AHAProfile must not be read outside the Profile surface');
  }
});
const nonProfileContext = {
  console,
  Number,
  String,
  Array,
  Object,
  JSON,
  AHAProfile: guardedProfile,
  document: {
    readyState: 'complete',
    getElementById() { return null; },
    addEventListener() {}
  }
};
nonProfileContext.window = nonProfileContext;
vm.createContext(nonProfileContext);
vm.runInContext(code, nonProfileContext, { filename: 'js/ahaProfileOverview.js' });
assert.equal(profileReads, 0, 'Profile-only DOM guard must run before reading AHAProfile');

assert.match(html, /<title>Mitt AHA<\/title>/);
assert.match(html, /<h1>Mitt AHA<\/h1>/);
assert.match(html, /id="aha-profile-overview"/);
assert.doesNotMatch(html, /id="aha-profile-status-grid"/, 'the raw counter grid should not duplicate the curated Mitt AHA footprint');
assert.ok(html.indexOf('js/ahaProfile.js') < html.indexOf('js/ahaProfileOverview.js'), 'overview adapter must load after canonical AHAProfile');
assert.match(html, /Det AHA ser i materialet ditt/);

assert.equal(/localStorage\s*\.\s*(setItem|removeItem|clear)\s*\(/.test(code), false, 'Profile overview must remain read-only');
assert.equal(/\bfetch\s*\(/.test(code), false, 'Profile overview must not fetch');
assert.equal(/AHAIngest|InsightsEngine|InsightChamber/.test(code), false, 'Profile overview must not create or touch an insight engine');
assert.equal(/global\.(?:EchoNet|AHARepository|supabase)\s*=|syncFromDatabase\s*\(|autoSync\s*\(/.test(code), false, 'Profile overview must not activate backend, sync or EchoNet');

console.log('aha-profile-overview.test.cjs passed');
