const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PATHS_KEY = 'aha_paths_v1';
const INSIGHTS_KEY = 'aha_insight_chamber_v1';
const LISTS_KEY = 'aha_lists_v1';
const NOTES_KEY = 'aha_notes_v1';

function makeStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    readJson(key, fallback) { return store.has(key) ? JSON.parse(store.get(key)) : fallback; },
    writeJson(key, value) { store.set(key, JSON.stringify(value)); }
  };
}

function makeElement() { return { textContent: '', innerHTML: '', addEventListener() {}, focus() {}, reset() {} }; }

function makeContext({ seed = {}, repository, config } = {}) {
  const repoCalls = [];
  const storage = makeStorage(seed);
  const elements = { 'paths-count': makeElement(), 'path-steps-count': makeElement(), 'paths-list': makeElement() };
  const context = {
    console, Date, Intl, Math, JSON, Promise, localStorage: storage,
    document: { readyState: 'loading', addEventListener() {}, getElementById(id) { return elements[id] || null; }, querySelector() { return null; }, querySelectorAll() { return []; } },
    addEventListener() {}, fetch() { throw new Error('fetch must not be used by Paths'); },
    EchoNet: new Proxy({}, { get() { throw new Error('EchoNet must not be used by Paths'); } }),
    AHASyncHub: new Proxy({}, { get() { throw new Error('Sync Hub must not be used by Paths'); } }),
    AHA_CONFIG: config,
    AHARepository: repository || { savePath(pathRecord) { repoCalls.push(['savePath', pathRecord]); return { ok: true, data: pathRecord }; }, loadPaths() { repoCalls.push(['loadPaths']); return { ok: true, data: [] }; } },
    AHAContracts: { normalizeTags(value) { return Array.isArray(value) ? value : []; } },
    AHAGroups: { getActiveGroups() { return []; } },
    AHAModules: { localPageHealth(input) { return { status: input.count ? 'ready' : 'empty' }; }, updatePageHealth() {}, buildModuleEmptyState({ title, message, hint }) { return `<h2>${title}</h2><p>${message}</p><p>${hint}</p>`; } }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaPaths.js'), 'utf8'), context, { filename: 'js/ahaPaths.js' });
  return { Paths: context.AHAPaths, storage, repoCalls, elements };
}

(async () => {
  const seedRefs = {
    [INSIGHTS_KEY]: JSON.stringify({ insights: [{ id: 'ins-1', title: 'Insight' }, { id: 'ins-deleted', title: 'Deleted', deletedAt: '2026-01-01' }, { id: 'ins-arch', title: 'Archived', archived: true }] }),
    [LISTS_KEY]: JSON.stringify([{ id: 'list-1', title: 'List' }, { id: 'list-deleted', title: 'Deleted', deleted_at: '2026-01-01' }, { id: 'list-arch', title: 'Archived', archived: true }]),
    [NOTES_KEY]: JSON.stringify([{ id: 'note-1', title: 'Note' }, { id: 'note-deleted', title: 'Deleted', deletedAt: '2026-01-01' }, { id: 'note-arch', title: 'Archived', archived: true }])
  };

  const { Paths, storage, repoCalls, elements } = makeContext({ seed: seedRefs });
  const created = Paths.createPath({ title: 'Local sequence', type: 'process' });
  assert.ok(created.id, 'createPath should create an id');
  assert.equal(storage.readJson(PATHS_KEY, []).length, 1, 'createPath should save locally');
  assert.equal(created.local_only, true, 'new path should be local_only');
  assert.equal(created.published_external, false, 'new path should not be externally published');
  assert.equal(created.echonet_shared, false, 'new path should not be EchoNet shared');
  assert.equal(created.sync_enabled, false, 'new path should not have sync enabled');
  assert.equal(created.meta.automation_enabled, false, 'new path should not enable automation');
  assert.equal(repoCalls.length, 0, 'createPath should not call repository without explicit database sync flag');
  Paths.updatePath(created.id, { title: 'Updated sequence' });
  assert.equal(repoCalls.length, 0, 'updatePath should not call repository without explicit database sync flag');
  const deleted = Paths.deletePath(created.id);
  assert.ok(deleted.deletedAt, 'deletePath should soft-delete with deletedAt');
  Paths.render();
  assert.equal(elements['paths-count'].textContent, '0', 'deleted paths should not count as active');

  const items = Paths.collectAvailablePathItems();
  const keys = new Set(items.map((item) => `${item.source}::${item.refId}`));
  for (const key of ['aha_insights::ins-1', 'aha_lists::list-1', 'aha_notes::note-1']) assert.ok(keys.has(key), `${key} should be collected`);
  for (const key of ['aha_insights::ins-deleted', 'aha_insights::ins-arch', 'aha_lists::list-deleted', 'aha_lists::list-arch', 'aha_notes::note-deleted', 'aha_notes::note-arch']) assert.equal(keys.has(key), false, `${key} should be ignored`);
  assert.equal(Paths.validatePathStepReference({ source: 'aha_notes', refId: 'note-1' }).ok, true, 'valid local reference should pass');
  assert.equal(Paths.validatePathStepReference({ source: 'web', refId: 'note-1' }).reason, 'unknown_source', 'unknown source should fail');
  assert.equal(Paths.validatePathStepReference({ source: 'aha_notes' }).reason, 'missing_refId', 'missing refId should fail');

  const active = Paths.createPath({ title: 'Active path' });
  assert.equal(Paths.addStepToPath(active.id, { source: 'aha_notes', refId: 'missing' }).ok, false, 'invalid reference should be rejected');
  const addOk = Paths.addStepToPath(active.id, { source: 'aha_notes', refId: 'note-1' });
  assert.equal(addOk.ok, true, 'valid add should return ok:true');
  assert.ok(addOk.step.id, 'valid add should return step');
  assert.equal(Paths.addStepToPath(active.id, { source: 'aha_notes', refId: 'note-1' }).reason, 'duplicate', 'duplicate add should be rejected');
  const second = Paths.addStepToPath(active.id, { source: 'aha_lists', refId: 'list-1' });
  const removed = Paths.removeStepFromPath(active.id, addOk.step.id);
  assert.equal(removed.steps.length, 1, 'removeStepFromPath should remove one step');
  assert.equal(removed.steps[0].id, second.step.id, 'remaining step should be kept');
  assert.equal(removed.steps[0].order, 0, 'removeStepFromPath should renumber order');

  const syncDisabled = await Paths.syncFromDatabase();
  assert.equal(syncDisabled.fallback, 'localOnly', 'syncFromDatabase should fall back to localOnly by default');
  assert.equal(syncDisabled.database_sync_disabled, true, 'syncFromDatabase should say database sync is disabled');
  assert.equal(repoCalls.length, 0, 'Paths should not use repository, fetch, EchoNet or Sync Hub by default');

  const enabledRepoCalls = [];
  const enabledRepo = { savePath(pathRecord) { enabledRepoCalls.push(['savePath', pathRecord.id]); return { ok: true, data: pathRecord }; }, loadPaths() { enabledRepoCalls.push(['loadPaths']); return { ok: true, data: [] }; } };
  const enabled = makeContext({ seed: seedRefs, repository: enabledRepo, config: { paths: { enableDatabaseSync: true } } });
  const enabledPath = enabled.Paths.createPath({ title: 'Explicit sync' });
  enabled.Paths.updatePath(enabledPath.id, { title: 'Explicit sync updated' });
  await enabled.Paths.syncFromDatabase();
  assert.ok(enabledRepoCalls.some(([name]) => name === 'savePath'), 'repository savePath should work when database sync flag is true');
  assert.ok(enabledRepoCalls.some(([name]) => name === 'loadPaths'), 'repository loadPaths should work when database sync flag is true');

  console.log('aha-paths.test.cjs passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
