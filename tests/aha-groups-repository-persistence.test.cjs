const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const GROUPS_KEY = 'aha_groups_v1';

function makeLocalStorage(seed = {}, sequence = []) {
  const store = new Map(Object.entries(seed));
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) {
      sequence.push({ type: 'localStorage.setItem', key, value: String(value) });
      store.set(key, String(value));
    },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
    readJson(key, fallback) {
      return store.has(key) ? JSON.parse(store.get(key)) : fallback;
    }
  };
}

function forbiddenApi(name, calls) {
  return new Proxy({}, {
    get(_target, prop) {
      calls.push(`${name}.${String(prop)}`);
      throw new Error(`${name} must not be used by AHAGroups`);
    }
  });
}

function makeRepository(calls, sequence, mode = 'ok') {
  return {
    saveGroup(groupRecord) {
      calls.push({ method: 'saveGroup', groupRecord });
      sequence.push({ type: 'AHARepository.saveGroup', groupRecord });
      if (mode === 'throw') throw new Error('repository unavailable');
      return Promise.resolve({ ok: true, data: groupRecord });
    },
    get loadGroups() {
      calls.push({ method: 'loadGroups' });
      throw new Error('AHARepository.loadGroups must not be used by AHAGroups');
    }
  };
}


function makeSyncRepository({ remote = [], saveMode = 'ok', loadMode = 'ok' } = {}) {
  return (calls, sequence) => ({
    saveGroup(groupRecord) {
      calls.push({ method: 'saveGroup', groupRecord });
      sequence.push({ type: 'AHARepository.saveGroup', groupRecord });
      if (saveMode === 'throw') throw new Error('repository save unavailable');
      return Promise.resolve({ ok: true, data: groupRecord });
    },
    loadGroups() {
      calls.push({ method: 'loadGroups' });
      sequence.push({ type: 'AHARepository.loadGroups' });
      if (loadMode === 'throw') throw new Error('repository load unavailable');
      if (loadMode === 'not-ok') return Promise.resolve({ ok: false, error: 'load failed' });
      return Promise.resolve({ ok: true, data: remote });
    }
  });
}

function makeAvisa(calls) {
  return {
    createArticle(input) {
      calls.push({ method: 'createArticle', input });
      return { id: 'article-1', ...input };
    },
    updateArticle(id, changes) {
      calls.push({ method: 'updateArticle', id, changes });
      return { id, ...changes };
    },
    addReferenceToArticle(id, reference) {
      calls.push({ method: 'addReferenceToArticle', id, reference });
      return reference;
    },
    loadArticles() {
      calls.push({ method: 'loadArticles' });
      return [{ id: 'article-1', title: 'Avisa-gruppe' }];
    }
  };
}

function makeSandbox({ repository, seed = {}, avisa, config } = {}) {
  const forbiddenCalls = [];
  const repositoryCalls = [];
  const avisaCalls = [];
  const sequence = [];
  const context = {
    console,
    Date,
    Math,
    JSON,
    Promise,
    FormData: function FormData() {},
    localStorage: makeLocalStorage(seed, sequence),
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; }
    },
    location: { hash: '' },
    AHA_CONFIG: config,
    AHARepository: repository === undefined ? undefined : repository(repositoryCalls, sequence),
    AHAIngest: forbiddenApi('AHAIngest', forbiddenCalls),
    AHASources: forbiddenApi('AHASources', forbiddenCalls),
    AHAAvisa: avisa ? makeAvisa(avisaCalls) : undefined
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaGroups.js'), 'utf8'),
    context,
    { filename: 'js/ahaGroups.js' }
  );
  return { ...context, repositoryCalls, forbiddenCalls, avisaCalls, sequence };
}

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaGroups.js'), 'utf8');
assert.match(source, /syncFromDatabase/, 'AHAGroups should define syncFromDatabase');

{
  const sandbox = makeSandbox({ config: { groups: { enableDatabaseSync: true } }, repository: makeRepository });
  const Groups = sandbox.AHAGroups;
  assert.ok(Groups, 'AHAGroups should be exported');

  const created = Groups.createGroup({ title: 'Repository-gruppe', type: 'project', description: 'best effort' });
  assert.ok(created?.id, 'createGroup should return the created group');

  const stored = sandbox.localStorage.readJson(GROUPS_KEY, []);
  assert.equal(stored.length, 1, 'createGroup should save one group to localStorage');
  assert.equal(stored[0].id, created.id, 'createGroup should save the created group locally');
  assert.equal(sandbox.repositoryCalls.length, 1, 'createGroup should call AHARepository.saveGroup when available');
  assert.deepEqual(sandbox.repositoryCalls[0].groupRecord, created, 'createGroup should persist the created group');
  assert.equal(sandbox.sequence[0].type, 'localStorage.setItem', 'createGroup should write localStorage before repository persistence');
  assert.equal(sandbox.sequence[1].type, 'AHARepository.saveGroup', 'createGroup should persist after localStorage write');
}

{
  const sandbox = makeSandbox({ config: { groups: { enableDatabaseSync: true } }, repository: makeRepository });
  const Groups = sandbox.AHAGroups;
  const created = Groups.createGroup({ title: 'Original' });
  sandbox.repositoryCalls.length = 0;
  sandbox.sequence.length = 0;

  const updated = Groups.updateGroup(created.id, { title: 'Oppdatert', description: 'ny' });
  assert.equal(updated.title, 'Oppdatert', 'updateGroup should return the updated group');
  assert.equal(sandbox.localStorage.readJson(GROUPS_KEY, [])[0].title, 'Oppdatert', 'updateGroup should save the updated group locally');
  assert.equal(sandbox.repositoryCalls.length, 1, 'updateGroup should call AHARepository.saveGroup');
  assert.equal(sandbox.repositoryCalls[0].groupRecord.title, 'Oppdatert', 'updateGroup should persist the updated group');
  assert.equal(sandbox.sequence[0].type, 'localStorage.setItem', 'updateGroup should write localStorage before repository persistence');
}

{
  const sandbox = makeSandbox({ config: { groups: { enableDatabaseSync: true } }, repository: makeRepository });
  const Groups = sandbox.AHAGroups;
  const created = Groups.createGroup({ title: 'Slett meg' });
  sandbox.repositoryCalls.length = 0;

  const deleted = Groups.deleteGroup(created.id);
  assert.ok(deleted.deletedAt, 'deleteGroup should set deletedAt');
  assert.ok(sandbox.localStorage.readJson(GROUPS_KEY, [])[0].deletedAt, 'deleteGroup should save the tombstone locally');
  assert.equal(sandbox.repositoryCalls.length, 1, 'deleteGroup should persist once through updateGroup');
  assert.equal(sandbox.repositoryCalls[0].groupRecord.id, created.id, 'deleteGroup should persist the deleted group');
  assert.ok(sandbox.repositoryCalls[0].groupRecord.deletedAt, 'deleteGroup should persist deletedAt tombstone');
}

{
  const sandbox = makeSandbox({ config: { groups: { enableDatabaseSync: true } }, repository: makeRepository });
  const Groups = sandbox.AHAGroups;
  const created = Groups.createGroup({ title: 'Medlemmer' });
  sandbox.repositoryCalls.length = 0;

  const member = Groups.addMemberToGroup(created.id, { name: 'Ada', role: 'editor' });
  assert.ok(member?.member?.id, 'addMemberToGroup should return the added member');
  assert.equal(sandbox.repositoryCalls.length, 1, 'addMemberToGroup should call AHARepository.saveGroup');
  assert.equal(sandbox.repositoryCalls[0].groupRecord.members.length, 1, 'addMemberToGroup should persist the updated members array');
  assert.equal(sandbox.repositoryCalls[0].groupRecord.members[0].name, 'Ada', 'addMemberToGroup should persist the new member');

  sandbox.repositoryCalls.length = 0;
  const removed = Groups.removeMemberFromGroup(created.id, member.member.id);
  assert.ok(removed, 'removeMemberFromGroup should return the updated group');
  assert.equal(sandbox.repositoryCalls.length, 1, 'removeMemberFromGroup should call AHARepository.saveGroup');
  assert.equal(sandbox.repositoryCalls[0].groupRecord.members.length, 0, 'removeMemberFromGroup should persist the updated members array');
}

{
  const sandbox = makeSandbox({ config: { groups: { enableDatabaseSync: true } }, repository: makeRepository });
  const Groups = sandbox.AHAGroups;
  const created = Groups.createGroup({ title: 'Referanser' });
  sandbox.repositoryCalls.length = 0;

  sandbox.localStorage.setItem('aha_notes_v1', JSON.stringify([{ id: 'note-1', title: 'Note' }, { id: 'note-local', title: 'Lokal ref' }, { id: 'note-throw', title: 'Ref' }, { id: 'note-avisa', title: 'Note' }]));
  sandbox.localStorage.setItem('aha_paths_v1', JSON.stringify([{ id: 'path-1', title: 'Path' }]));
  const reference = Groups.addReferenceToGroup(created.id, { title: 'Note', type: 'note', source: 'aha_notes', refId: 'note-1' });
  assert.ok(reference?.reference?.id, 'addReferenceToGroup should return the added reference');
  assert.equal(sandbox.repositoryCalls.length, 1, 'addReferenceToGroup should call AHARepository.saveGroup');
  assert.equal(sandbox.repositoryCalls[0].groupRecord.references.length, 1, 'addReferenceToGroup should persist the updated references array');
  assert.equal(sandbox.repositoryCalls[0].groupRecord.references[0].refId, 'note-1', 'addReferenceToGroup should persist the new reference');

  sandbox.repositoryCalls.length = 0;
  const objectReference = Groups.addReferenceToGroupByObject(created.id, { title: 'Path', type: 'path', source: 'aha_paths', refId: 'path-1' });
  assert.ok(objectReference?.reference?.id, 'addReferenceToGroupByObject should return the added reference');
  assert.equal(sandbox.repositoryCalls.length, 1, 'addReferenceToGroupByObject should persist exactly once through addReferenceToGroup');
  assert.equal(sandbox.repositoryCalls[0].groupRecord.references.length, 2, 'addReferenceToGroupByObject should persist the updated references array');

  sandbox.repositoryCalls.length = 0;
  const duplicate = Groups.addReferenceToGroupByObject(created.id, { title: 'Path duplicate', type: 'path', source: 'aha_paths', refId: 'path-1' });
  assert.ok(duplicate, 'duplicate addReferenceToGroupByObject should still return the group as before');
  assert.equal(sandbox.repositoryCalls.length, 0, 'duplicate addReferenceToGroupByObject should not write the repository unnecessarily');

  const storedReference = sandbox.localStorage.readJson(GROUPS_KEY, [])[0].references[0];
  const removed = Groups.removeReferenceFromGroup(created.id, storedReference.id);
  assert.ok(removed, 'removeReferenceFromGroup should return the updated group');
  assert.equal(sandbox.repositoryCalls.length, 1, 'removeReferenceFromGroup should call AHARepository.saveGroup');
  assert.equal(sandbox.repositoryCalls[0].groupRecord.references.length, 1, 'removeReferenceFromGroup should persist the updated references array');
}

{
  const sandbox = makeSandbox();
  const Groups = sandbox.AHAGroups;
  const created = Groups.createGroup({ title: 'Kun lokal' });
  assert.ok(created?.id, 'createGroup should work without AHARepository');
  assert.equal(sandbox.localStorage.readJson(GROUPS_KEY, []).length, 1, 'createGroup should still save locally without AHARepository');
  assert.equal(Groups.updateGroup(created.id, { title: 'Kun lokal oppdatert' }).title, 'Kun lokal oppdatert', 'updateGroup should work without AHARepository');
  const member = Groups.addMemberToGroup(created.id, { name: 'Lokal medlem' });
  assert.ok(member?.member?.id, 'addMemberToGroup should work without AHARepository');
  assert.ok(Groups.removeMemberFromGroup(created.id, member.member.id), 'removeMemberFromGroup should work without AHARepository');
  sandbox.localStorage.setItem('aha_notes_v1', JSON.stringify([{ id: 'note-local', title: 'Lokal ref' }]));
  const reference = Groups.addReferenceToGroup(created.id, { title: 'Lokal ref', source: 'aha_notes', refId: 'note-local' });
  assert.ok(reference?.reference?.id, 'addReferenceToGroup should work without AHARepository');
  assert.ok(Groups.removeReferenceFromGroup(created.id, reference.reference.id), 'removeReferenceFromGroup should work without AHARepository');
  assert.ok(Groups.deleteGroup(created.id).deletedAt, 'deleteGroup should work without AHARepository');
  assert.equal(sandbox.localStorage.readJson(GROUPS_KEY, []).length, 1, 'localStorage should remain the primary storage without AHARepository');
}

{
  const sandbox = makeSandbox({ config: { groups: { enableDatabaseSync: true } }, repository: (calls, sequence) => makeRepository(calls, sequence, 'throw') });
  const Groups = sandbox.AHAGroups;

  let created;
  assert.doesNotThrow(() => { created = Groups.createGroup({ title: 'Feiler remote' }); }, 'createGroup should not throw when saveGroup throws');
  assert.doesNotThrow(() => Groups.updateGroup(created.id, { title: 'Lokal først' }), 'updateGroup should not throw when saveGroup throws');
  assert.doesNotThrow(() => Groups.addMemberToGroup(created.id, { name: 'Ada' }), 'addMemberToGroup should not throw when saveGroup throws');
  const memberId = sandbox.localStorage.readJson(GROUPS_KEY, [])[0].members[0].id;
  assert.doesNotThrow(() => Groups.removeMemberFromGroup(created.id, memberId), 'removeMemberFromGroup should not throw when saveGroup throws');
  sandbox.localStorage.setItem('aha_notes_v1', JSON.stringify([{ id: 'note-throw', title: 'Ref' }]));
  assert.doesNotThrow(() => Groups.addReferenceToGroup(created.id, { title: 'Ref', source: 'aha_notes', refId: 'note-throw' }), 'addReferenceToGroup should not throw when saveGroup throws');
  const referenceId = sandbox.localStorage.readJson(GROUPS_KEY, [])[0].references[0].id;
  assert.doesNotThrow(() => Groups.removeReferenceFromGroup(created.id, referenceId), 'removeReferenceFromGroup should not throw when saveGroup throws');
  assert.doesNotThrow(() => Groups.deleteGroup(created.id), 'deleteGroup should not throw when saveGroup throws');
  assert.equal(sandbox.localStorage.readJson(GROUPS_KEY, []).length, 1, 'localStorage should survive repository saveGroup failures');
}

{
  const sandbox = makeSandbox({ config: { groups: { enableDatabaseSync: true } }, repository: makeRepository });
  const Groups = sandbox.AHAGroups;
  Groups.createGroup({ title: 'Forbudte API-er' });
  assert.deepEqual(sandbox.forbiddenCalls, [], 'AHAGroups should not call AHAIngest or AHASources');
  assert.equal(sandbox.repositoryCalls.filter((call) => call.method === 'loadGroups').length, 0, 'AHAGroups should not auto-call AHARepository.loadGroups');
}

{
  const sandbox = makeSandbox({ config: { groups: { enableDatabaseSync: true } }, repository: makeRepository, avisa: true });
  const Groups = sandbox.AHAGroups;
  const group = Groups.createGroup({ title: 'Avisa-gruppe', tags: ['publisering'] });
  sandbox.localStorage.setItem('aha_notes_v1', JSON.stringify([{ id: 'note-avisa', title: 'Note' }]));
  Groups.addReferenceToGroup(group.id, { title: 'Note', type: 'note', source: 'aha_notes', refId: 'note-avisa' });
  sandbox.repositoryCalls.length = 0;

  const draft = Groups.createArticleDraftFromGroup(group.id);
  assert.ok(draft, 'createArticleDraftFromGroup should still create an AHAavisa draft');
  assert.equal(sandbox.repositoryCalls.length, 0, 'createArticleDraftFromGroup should not write a group to AHARepository when the group is unchanged');
  assert.deepEqual(
    sandbox.avisaCalls.map((call) => call.method),
    ['createArticle', 'updateArticle', 'addReferenceToArticle', 'addReferenceToArticle', 'loadArticles'],
    'createArticleDraftFromGroup should keep the AHAavisa flow intact'
  );
}


async function runSyncTests() {
  {
    const localGroups = [
      {
        id: 'same-local-deleted',
        title: 'Lokal slettet',
        type: 'project',
        description: 'nyere tombstone',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-04T00:00:00.000Z',
        deletedAt: '2026-01-05T00:00:00.000Z',
        tags: ['lokal'],
        members: [],
        references: [],
        source: 'aha_groups',
        meta: {}
      },
      {
        id: 'remote-newer',
        title: 'Eldre lokal',
        type: 'circle',
        description: '',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        tags: [],
        members: [],
        references: [],
        source: 'aha_groups',
        meta: {},
        deletedAt: ''
      },
      {
        id: 'equal-time',
        title: 'Lokal lik tid',
        type: 'circle',
        description: '',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
        tags: [],
        members: [],
        references: [],
        source: 'aha_groups',
        meta: {},
        deletedAt: ''
      }
    ];
    const remoteRows = [
      {
        id: 'same-local-deleted',
        title: 'Eldre remote aktiv',
        type: 'project',
        description: 'skal tape',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-03T00:00:00.000Z',
        tags: ['remote'],
        members: [],
        references: [],
        source: 'aha_groups',
        meta: {}
      },
      {
        id: 'remote-newer',
        title: 'Nyere remote',
        type: 'learning',
        description: 'snake case',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-06T00:00:00.000Z',
        deleted_at: '',
        tags: ['remote'],
        members: [{ id: 'm1', name: 'Remote medlem', role: 'editor', status: 'local', added_at: '2026-01-06T01:00:00.000Z' }],
        references: [{ id: 'r1', title: 'Remote ref', type: 'note', source: 'aha_notes', ref_id: 'note-remote', added_at: '2026-01-06T02:00:00.000Z' }],
        meta: { remote: true }
      },
      {
        id: 'equal-time',
        title: 'Remote lik tid',
        type: 'circle',
        description: 'remote wins equal',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-03T00:00:00.000Z',
        tags: [],
        members: [],
        references: [],
        source: 'aha_groups',
        meta: {}
      }
    ];
    const sandbox = makeSandbox({
      config: { groups: { enableDatabaseSync: true } },
      repository: makeSyncRepository({ remote: remoteRows }),
      seed: { [GROUPS_KEY]: JSON.stringify(localGroups) },
      avisa: true
    });
    const Groups = sandbox.AHAGroups;
    assert.equal(typeof Groups.syncFromDatabase, 'function', 'syncFromDatabase should be exported');
    assert.equal(sandbox.repositoryCalls.filter((call) => call.method === 'loadGroups').length, 0, 'syncFromDatabase should not auto-run during init/bind');

    const result = await Groups.syncFromDatabase();
    assert.equal(result.ok, true, 'syncFromDatabase should return repository result ok');
    assert.equal(result.merged, true, 'syncFromDatabase should mark merged results');
    assert.deepEqual(
      sandbox.sequence.slice(0, 4).map((entry) => entry.type),
      ['AHARepository.saveGroup', 'AHARepository.saveGroup', 'AHARepository.saveGroup', 'AHARepository.loadGroups'],
      'syncFromDatabase should push every local group before remote pull'
    );
    assert.equal(sandbox.repositoryCalls.filter((call) => call.method === 'saveGroup').length, 3, 'syncFromDatabase should push all local groups');
    assert.ok(sandbox.repositoryCalls.find((call) => call.method === 'saveGroup' && call.groupRecord.id === 'same-local-deleted' && call.groupRecord.deletedAt), 'syncFromDatabase should push local tombstones');

    const stored = sandbox.localStorage.readJson(GROUPS_KEY, []);
    const remoteNewer = stored.find((group) => group.id === 'remote-newer');
    assert.equal(remoteNewer.title, 'Nyere remote', 'newer remote group should win over older local group');
    assert.equal(remoteNewer.createdAt, '2026-01-01T00:00:00.000Z', 'remote created_at should normalize to createdAt');
    assert.equal(remoteNewer.updatedAt, '2026-01-06T00:00:00.000Z', 'remote updated_at should normalize to updatedAt');
    assert.equal(remoteNewer.deletedAt, '', 'remote deleted_at should normalize to deletedAt');
    assert.equal(remoteNewer.members[0].addedAt, '2026-01-06T01:00:00.000Z', 'remote member added_at should normalize to addedAt');
    assert.equal(remoteNewer.references[0].refId, 'note-remote', 'remote reference ref_id should normalize to refId');
    assert.equal(remoteNewer.references[0].addedAt, '2026-01-06T02:00:00.000Z', 'remote reference added_at should normalize to addedAt');
    assert.equal(stored.find((group) => group.id === 'same-local-deleted').title, 'Lokal slettet', 'newer local tombstone should win over older active remote group');
    assert.ok(stored.find((group) => group.id === 'same-local-deleted').deletedAt, 'local tombstone should remain after merge');
    assert.equal(stored.find((group) => group.id === 'equal-time').title, 'Remote lik tid', 'remote should win on equal action time');
    assert.equal(stored[0].id, 'remote-newer', 'merged groups should sort newest action first');
    assert.deepEqual(sandbox.forbiddenCalls, [], 'syncFromDatabase should not call AHAIngest or AHASources');
    assert.deepEqual(sandbox.avisaCalls, [], 'syncFromDatabase should not call AHAAvisa');
  }

  {
    const localGroups = [{ id: 'local-only', title: 'Lokal beholdes', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }];
    const sandbox = makeSandbox({ config: { groups: { enableDatabaseSync: true } },
      repository: makeSyncRepository({ remote: { not: 'array' } }), seed: { [GROUPS_KEY]: JSON.stringify(localGroups) } });
    const result = await sandbox.AHAGroups.syncFromDatabase();
    assert.equal(result.ok, false, 'invalid remote payload should return a failed fallback result');
    assert.equal(result.fallback, 'localOnly', 'invalid remote payload should report localStorage fallback');
    assert.equal(sandbox.localStorage.readJson(GROUPS_KEY, [])[0].title, 'Lokal beholdes', 'invalid remote payload should not delete local data');
  }

  {
    const localGroups = [{ id: 'local-no-repo', title: 'Ingen repo', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }];
    const sandbox = makeSandbox({ seed: { [GROUPS_KEY]: JSON.stringify(localGroups) } });
    const result = await sandbox.AHAGroups.syncFromDatabase();
    assert.equal(result.ok, false, 'missing AHARepository/loadGroups should fall back');
    assert.equal(result.fallback, 'localOnly', 'missing AHARepository/loadGroups should report localStorage fallback');
    assert.equal(sandbox.localStorage.readJson(GROUPS_KEY, [])[0].title, 'Ingen repo', 'missing AHARepository/loadGroups should keep local data');
  }

  {
    const localGroups = [{ id: 'local-error', title: 'Repo feil', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }];
    const sandbox = makeSandbox({ config: { groups: { enableDatabaseSync: true } },
      repository: makeSyncRepository({ saveMode: 'throw', loadMode: 'throw' }), seed: { [GROUPS_KEY]: JSON.stringify(localGroups) } });
    const result = await sandbox.AHAGroups.syncFromDatabase();
    assert.equal(result.ok, false, 'repository errors should return a failed fallback result');
    assert.equal(result.fallback, 'localOnly', 'repository errors should report localStorage fallback');
    assert.equal(sandbox.localStorage.readJson(GROUPS_KEY, [])[0].title, 'Repo feil', 'repository errors should not break local data');
  }
}

runSyncTests().then(() => {
  console.log('aha-groups-repository-persistence.test.cjs passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
