const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function makeStorage() {
  const store = new Map();
  const writes = [];
  return {
    store,
    writes,
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { writes.push(key); store.set(key, String(value)); },
    removeItem(key) { writes.push(key); store.delete(key); },
    seed(key, value) { store.set(key, typeof value === 'string' ? value : JSON.stringify(value)); },
    snapshot(keys) { return Object.fromEntries(keys.map((key) => [key, store.get(key)])); }
  };
}

function makeElement() {
  return {
    innerHTML: '',
    textContent: '',
    onclick: null,
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; }
  };
}

function loadProfile(storage = makeStorage()) {
  const elements = new Map();
  const context = {
    console,
    localStorage: storage,
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, makeElement());
        return elements.get(id);
      },
      createElement: makeElement,
      body: makeElement()
    },
    window: null,
    Date,
    Math,
    Number,
    String,
    Object,
    Array,
    JSON,
    setTimeout,
    clearTimeout
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/ahaProfile.js', 'utf8'), context, { filename: 'js/ahaProfile.js' });
  return { AHAProfile: context.AHAProfile, storage, elements };
}

const html = fs.readFileSync('profile.html', 'utf8');
assert.ok(html.includes('js/ahaProfile.js'), 'profile.html includes js/ahaProfile.js');
assert.ok(html.includes('lokal statusflate'), 'profile.html states local status/profile boundary');
assert.ok(html.includes('Ingen profil deles eksternt'), 'profile.html states no external profile sharing');
assert.ok(html.includes('Ingen EchoNet-identitet er aktivert'), 'profile.html states no EchoNet identity');
assert.ok(html.includes('History Go-statusen vises som lokal read-only importstatus'), 'profile.html states History Go read-only status');
assert.ok(html.includes('AHA Profil skriver ikke tilbake til History Go'), 'profile.html states no History Go write-back');

const { AHAProfile } = loadProfile();
[
  'profileBoundaryMeta',
  'profileBoundaryResult',
  'isUnavailableRecord',
  'collectProfileStatus',
  'collectRecentActivity',
  'collectHistoryGoStatus',
  'collectPrivacyStatus',
  'collectAfterworkArchive',
  'collectAhaMetaProfile'
].forEach((name) => assert.equal(typeof AHAProfile[name], 'function', `${name} exported`));

for (const obj of [
  AHAProfile.collectProfileStatus(),
  AHAProfile.collectHistoryGoStatus(),
  AHAProfile.collectPrivacyStatus(),
  AHAProfile.collectAhaMetaProfile()
]) {
  assert.equal(obj.local_only, true);
  assert.equal(obj.read_only, true);
  assert.equal(obj.echonet_shared, false);
  assert.equal(obj.sync_enabled, false);
  assert.equal(obj.backend_enabled, false);
}

{
  const storage = makeStorage();
  const keys = ['aha_import_payload_v1', 'hg_unlocks_v1', 'visited_places', 'people_collected', 'historygo_progress'];
  storage.seed('aha_import_payload_v1', { exported_at: '2026-01-01T00:00:00.000Z' });
  storage.seed('hg_unlocks_v1', [{ id: 'u1' }]);
  storage.seed('visited_places', [{ id: 'p1' }, { id: 'p2', archived: true }]);
  storage.seed('people_collected', [{ id: 'person1' }]);
  storage.seed('historygo_progress', { level: 2 });
  const before = storage.snapshot(keys);
  const { AHAProfile: Profile } = loadProfile(storage);
  const status = Profile.collectHistoryGoStatus();
  assert.equal(status.hasImportPayload, true);
  assert.equal(status.visitedPlacesCount, 1);
  assert.equal(status.peopleCollectedCount, 1);
  assert.equal(status.unlocksCount, 1);
  assert.deepEqual(storage.snapshot(keys), before, 'History Go keys are not written');
  assert.equal(status.historygo_read_only, true);
  assert.equal(status.historygo_writeback_enabled, false);
}

{
  const storage = makeStorage();
  const mixed = [
    { id: 'active', title: 'Active', updatedAt: '2026-01-04T00:00:00.000Z' },
    { id: 'deleted_at', title: 'Deleted A', deleted_at: '2026-01-01T00:00:00.000Z' },
    { id: 'deletedAt', title: 'Deleted B', deletedAt: '2026-01-02T00:00:00.000Z' },
    { id: 'archived', title: 'Archived', archived: true }
  ];
  storage.seed('aha_notes_v1', mixed);
  storage.seed('aha_afterwork_v1', mixed.map((item) => ({ ...item, reflection: item.title })));
  const { AHAProfile: Profile } = loadProfile(storage);
  assert.equal(Profile.collectProfileStatus().notesCount, 1, 'counts only active notes');
  assert.deepEqual(Profile.collectRecentActivity().filter((item) => item.source === 'aha_notes').map((item) => item.id), ['active']);
  assert.deepEqual(Profile.collectAfterworkArchive(10).map((item) => item.id), ['active']);
}

{
  const storage = makeStorage();
  storage.seed('aha_notes_v1', [{ id: 'n1', title: 'Note' }]);
  const { AHAProfile: Profile } = loadProfile(storage);
  storage.writes.length = 0;
  Profile.collectProfileStatus();
  Profile.collectRecentActivity();
  Profile.collectHistoryGoStatus();
  Profile.collectPrivacyStatus();
  Profile.collectAfterworkArchive();
  Profile.collectAhaMetaProfile();
  Profile.render();
  assert.deepEqual(storage.writes, [], 'collectors/render do not write localStorage');
  Profile.savePendingChatPrompt('Bygg videre');
  assert.deepEqual(storage.writes, ['aha_pending_chat_prompt_v1'], 'only pending chat prompt write is allowed');
}

const js = fs.readFileSync('js/ahaProfile.js', 'utf8');
[
  /fetch\s*\(/,
  /AHARepository/,
  /Supabase/,
  /createClient/,
  /EchoNet/,
  /AHASyncHub/,
  /SyncHub/,
  /AHAIngest\.ingest/,
  /createSignalFromMessage/,
  /addSignalToChamber/,
  /localStorage\.setItem\(["']aha_insight_chamber_v1["']/,
  /localStorage\.setItem\(["']aha_source_events_v1["']/,
  /localStorage\.setItem\(["']visited_places["']/,
  /localStorage\.setItem\(["']hg_learning_log_v1["']/,
  /localStorage\.setItem\(["']knowledge_universe["']/,
  /localStorage\.setItem\(["']trivia_universe["']/,
  /localStorage\.setItem\(["']people_collected["']/,
  /localStorage\.setItem\(["']historygo_progress["']/,
  /localStorage\.setItem\(["']aha_import_payload_v1["']/
].forEach((pattern) => assert.ok(!pattern.test(js), `forbidden pattern absent: ${pattern}`));

const privacyJs = fs.readFileSync('js/ahaPrivacy.js', 'utf8');
['aha_profile_name', 'aha_profile_id', 'aha_pending_chat_prompt_v1'].forEach((key) => {
  assert.ok(privacyJs.includes(key), `privacy covers ${key}`);
});
assert.ok(!/external profile sharing/i.test(privacyJs), 'privacy does not imply external profile sharing');

const matrix = fs.readFileSync('docs/AHA_MODULE_MATURITY_MATRIX.md', 'utf8');
assert.match(matrix, /\| profile \|[^\n]*\| ready \|/, 'profile maturity is ready');

console.log('aha-profile-boundary passed');
