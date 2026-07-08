const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const groupsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaGroups.js'), 'utf8');
const avisaCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaAvisa.js'), 'utf8');

function makeStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    readJson(key, fallback) { return store.has(key) ? JSON.parse(store.get(key)) : fallback; },
    writeJson(key, value) { store.set(key, JSON.stringify(value)); }
  };
}

function makeElement() { return { innerHTML: '', textContent: '', hidden: false, value: '', getAttribute() { return null; }, setAttribute() {}, addEventListener() {}, classList: { toggle() {} } }; }

function makeContext({ seed = {}, repository, config, includeAvisa = true } = {}) {
  const storage = makeStorage(seed);
  const repoCalls = [];
  const elements = { 'groups-root': makeElement() };
  const context = {
    console, Date, Intl, Math, JSON, localStorage: storage,
    document: { readyState: 'complete', addEventListener() {}, getElementById(id) { return elements[id] || null; }, querySelector() { return null; }, querySelectorAll() { return []; } },
    location: { hash: '' },
    addEventListener() {},
    FormData: function FormData() {},
    fetch() { throw new Error('fetch must not be used by Groups'); },
    EchoNet: new Proxy({}, { get() { throw new Error('EchoNet must not be used by Groups'); } }),
    AHASyncHub: new Proxy({}, { get() { throw new Error('Sync Hub must not be used by Groups'); } }),
    AHA_CONFIG: config,
    AHARepository: repository || { saveGroup(group) { repoCalls.push(['saveGroup', group.id]); return { ok: true }; }, loadGroups() { repoCalls.push(['loadGroups']); return { ok: true, data: [] }; } },
    AHAContracts: { normalizeTags(tags) { return Array.isArray(tags) ? tags : String(tags || '').split(',').map((tag) => tag.trim()).filter(Boolean); } },
    AHAPrivacy: { loadSettings() { return {}; } },
    AHAModules: { localPageHealth(input) { return { status: input.count ? 'ready' : 'empty' }; }, updatePageHealth() {}, buildModuleEmptyState({ type, moduleId, hint }) { return `<h2>${type}:${moduleId}</h2><p>${hint}</p>`; } },
    CSS: { escape(value) { return String(value); } },
    HTMLElement: function HTMLElement() {},
    HTMLSelectElement: function HTMLSelectElement() {}
  };
  context.window = context;
  vm.createContext(context);
  if (includeAvisa) vm.runInContext(avisaCode, context, { filename: 'js/ahaAvisa.js' });
  vm.runInContext(groupsCode, context, { filename: 'js/ahaGroups.js' });
  return { Groups: context.AHAGroups, Avisa: context.AHAAvisa, storage, repoCalls, elements };
}

(async () => {
  const { Groups, storage, repoCalls } = makeContext();
  const group = Groups.createGroup({ title: 'Lokal gruppe', tags: 'aha, local' });
  assert.equal(storage.readJson('aha_groups_v1', []).length, 1, 'createGroup should save locally');
  assert.equal(group.local_only, true);
  assert.equal(group.shared_external, false);
  assert.equal(group.echonet_shared, false);
  assert.equal(group.sync_enabled, false);
  assert.equal(group.external_share_enabled, false);
  assert.equal(repoCalls.length, 0, 'createGroup should not call repository without explicit database sync flag');

  Groups.updateGroup(group.id, { description: 'Updated' });
  assert.equal(repoCalls.length, 0, 'updateGroup should not call repository without explicit database sync flag');
  const deleted = Groups.deleteGroup(group.id);
  assert.ok(deleted.deletedAt, 'deleteGroup should soft-delete');
  storage.writeJson('aha_groups_v1', [deleted, { id: 'archived-group', title: 'Archived', archived: true }]);
  assert.equal(Groups.getActiveGroups().length, 0, 'deleted/archived groups should not show as active');

  const memberGroup = Groups.createGroup({ title: 'Members' });
  const memberResult = Groups.addMemberToGroup(memberGroup.id, { name: 'Lokal rolle', role: 'editor', status: 'invited_later' });
  assert.equal(memberResult.ok, true, 'addMemberToGroup should return ok:true');
  assert.equal(memberResult.member.local_only, true);
  assert.equal(memberResult.member.invitation_sent, false);
  assert.equal(memberResult.member.external_identity, false);
  assert.equal(Groups.addMemberToGroup(memberGroup.id, { name: 'Lokal rolle', role: 'editor' }).reason, 'duplicate', 'duplicate member should be clear');

  storage.writeJson('aha_insight_chamber_v1', { insights: [{ id: 'ins-1', title: 'Insight' }, { id: 'ins-del', title: 'Deleted insight', deletedAt: 'x' }] });
  storage.writeJson('aha_lists_v1', [{ id: 'list-1', title: 'List' }, { id: 'list-arch', title: 'Archived list', archived: true }]);
  storage.writeJson('aha_paths_v1', [{ id: 'path-1', title: 'Path' }]);
  storage.writeJson('aha_articles_v1', [{ id: 'article-1', title: 'Article' }]);
  storage.writeJson('aha_notes_v1', [{ id: 'note-1', title: 'Note' }]);
  storage.writeJson('aha_feed_posts_v1', [{ id: 'feed-1', title: 'Feed' }, { id: 'feed-arch', title: 'Gone', archived: true }]);
  const keys = new Set(Groups.collectAvailableGroupReferences().map((item) => `${item.source}::${item.refId}`));
  for (const key of ['aha_insights::ins-1', 'aha_lists::list-1', 'aha_paths::path-1', 'aha_avisa::article-1', 'aha_notes::note-1', 'aha_feed::feed-1']) assert.ok(keys.has(key), `${key} should be collected`);
  for (const key of ['aha_insights::ins-del', 'aha_lists::list-arch', 'aha_feed::feed-arch']) assert.equal(keys.has(key), false, `${key} should be ignored`);

  assert.equal(Groups.validateGroupReference({ source: 'aha_notes', refId: 'note-1' }).ok, true, 'valid local reference should pass');
  assert.equal(Groups.validateGroupReference({ source: 'web', refId: 'note-1' }).reason, 'unknown_source', 'unknown source should fail');
  assert.equal(Groups.validateGroupReference({ source: 'aha_notes' }).reason, 'missing_refId', 'missing refId should fail');
  assert.equal(Groups.addReferenceToGroup(memberGroup.id, { source: 'web', refId: 'x' }).reason, 'invalid_reference', 'invalid add should be rejected');
  const addRef = Groups.addReferenceToGroup(memberGroup.id, { source: 'aha_notes', refId: 'note-1' });
  assert.equal(addRef.ok, true, 'valid add should return ok:true');
  assert.ok(addRef.reference.id, 'valid add should return reference');
  assert.equal(Groups.addReferenceToGroup(memberGroup.id, { source: 'aha_notes', refId: 'note-1' }).reason, 'duplicate', 'duplicate ref should be clear');
  storage.writeJson('aha_notes_v1', [{ id: 'note-1', title: 'Note', archived: true }]);
  assert.equal(Groups.resolveReferenceObject({ source: 'aha_notes', refId: 'note-1' }), null, 'deleted/archived target resolves null');
  const report = Groups.buildGroupReport(memberGroup.id);
  assert.ok(report.missingCount >= 1, 'buildGroupReport should count missing refs');

  storage.writeJson('aha_notes_v1', [{ id: 'note-1', title: 'Note' }]);
  const draft = Groups.createArticleDraftFromGroup(memberGroup.id);
  assert.ok(draft?.id, 'createArticleDraftFromGroup should create a local AHAavisa draft');
  assert.equal(draft.publicationLayer, 'group');
  assert.equal(draft.published_external, false);
  assert.equal(draft.external_publish_enabled, false);
  assert.equal(draft.echonet_shared, false);
  assert.equal(draft.sync_enabled, false);
  assert.equal(draft.meta.local_only, true);
  assert.equal(draft.meta.source, 'aha_groups');

  const syncDisabled = await Groups.syncFromDatabase();
  assert.equal(syncDisabled.fallback, 'localOnly');
  assert.equal(syncDisabled.database_sync_disabled, true);
  assert.equal(repoCalls.length, 0, 'default Groups should not use repository, fetch, EchoNet or Sync Hub');

  const enabledRepoCalls = [];
  const enabledRepo = { saveGroup(group) { enabledRepoCalls.push(['saveGroup', group.id]); return { ok: true }; }, loadGroups() { enabledRepoCalls.push(['loadGroups']); return { ok: true, data: [] }; } };
  const enabled = makeContext({ repository: enabledRepo, config: { groups: { enableDatabaseSync: true } }, includeAvisa: false });
  const enabledGroup = enabled.Groups.createGroup({ title: 'Explicit sync' });
  enabled.Groups.updateGroup(enabledGroup.id, { description: 'Explicit update' });
  await enabled.Groups.syncFromDatabase();
  assert.ok(enabledRepoCalls.some(([name]) => name === 'saveGroup'), 'repository saveGroup should work when database sync flag is true');
  assert.ok(enabledRepoCalls.some(([name]) => name === 'loadGroups'), 'repository loadGroups should work when database sync flag is true');

  assert.equal(/\bfetch\s*\(/.test(groupsCode), false, 'Groups runtime should not call fetch');
  assert.equal(/global\.EchoNet|window\.EchoNet|AHAEchoNet/.test(groupsCode), false, 'Groups runtime should not call EchoNet APIs');
  assert.equal(/Sync Hub|AHASyncHub|SyncHub/.test(groupsCode), false, 'Groups runtime should not reference Sync Hub');
  assert.equal(/Supabase|createClient/.test(groupsCode), false, 'Groups runtime should not create Supabase clients');
  assert.equal(/externalShare\s*[:=(]|shareExternal\s*[:=(]|inviteApi|sendInvite|sendInvitation/i.test(groupsCode), false, 'Groups should not define external share/invite APIs');

  console.log('aha-groups.test.cjs passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
