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

function makeSandbox({ repository, seed = {}, avisa } = {}) {
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
assert.doesNotMatch(source, /syncFromDatabase/, 'AHAGroups should not define syncFromDatabase');
assert.doesNotMatch(source, /AHARepository\?\.loadGroups|AHARepository\.loadGroups/, 'AHAGroups should not use AHARepository.loadGroups');

{
  const sandbox = makeSandbox({ repository: makeRepository });
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
  const sandbox = makeSandbox({ repository: makeRepository });
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
  const sandbox = makeSandbox({ repository: makeRepository });
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
  const sandbox = makeSandbox({ repository: makeRepository });
  const Groups = sandbox.AHAGroups;
  const created = Groups.createGroup({ title: 'Medlemmer' });
  sandbox.repositoryCalls.length = 0;

  const member = Groups.addMemberToGroup(created.id, { name: 'Ada', role: 'editor' });
  assert.ok(member?.id, 'addMemberToGroup should return the added member');
  assert.equal(sandbox.repositoryCalls.length, 1, 'addMemberToGroup should call AHARepository.saveGroup');
  assert.equal(sandbox.repositoryCalls[0].groupRecord.members.length, 1, 'addMemberToGroup should persist the updated members array');
  assert.equal(sandbox.repositoryCalls[0].groupRecord.members[0].name, 'Ada', 'addMemberToGroup should persist the new member');

  sandbox.repositoryCalls.length = 0;
  const removed = Groups.removeMemberFromGroup(created.id, member.id);
  assert.ok(removed, 'removeMemberFromGroup should return the updated group');
  assert.equal(sandbox.repositoryCalls.length, 1, 'removeMemberFromGroup should call AHARepository.saveGroup');
  assert.equal(sandbox.repositoryCalls[0].groupRecord.members.length, 0, 'removeMemberFromGroup should persist the updated members array');
}

{
  const sandbox = makeSandbox({ repository: makeRepository });
  const Groups = sandbox.AHAGroups;
  const created = Groups.createGroup({ title: 'Referanser' });
  sandbox.repositoryCalls.length = 0;

  const reference = Groups.addReferenceToGroup(created.id, { title: 'Note', type: 'note', source: 'aha_notes', refId: 'note-1' });
  assert.ok(reference?.id, 'addReferenceToGroup should return the added reference');
  assert.equal(sandbox.repositoryCalls.length, 1, 'addReferenceToGroup should call AHARepository.saveGroup');
  assert.equal(sandbox.repositoryCalls[0].groupRecord.references.length, 1, 'addReferenceToGroup should persist the updated references array');
  assert.equal(sandbox.repositoryCalls[0].groupRecord.references[0].refId, 'note-1', 'addReferenceToGroup should persist the new reference');

  sandbox.repositoryCalls.length = 0;
  const objectReference = Groups.addReferenceToGroupByObject(created.id, { title: 'Path', type: 'path', source: 'aha_paths', refId: 'path-1' });
  assert.ok(objectReference?.id, 'addReferenceToGroupByObject should return the added reference');
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
  assert.ok(member?.id, 'addMemberToGroup should work without AHARepository');
  assert.ok(Groups.removeMemberFromGroup(created.id, member.id), 'removeMemberFromGroup should work without AHARepository');
  const reference = Groups.addReferenceToGroup(created.id, { title: 'Lokal ref', source: 'aha_notes', refId: 'note-local' });
  assert.ok(reference?.id, 'addReferenceToGroup should work without AHARepository');
  assert.ok(Groups.removeReferenceFromGroup(created.id, reference.id), 'removeReferenceFromGroup should work without AHARepository');
  assert.ok(Groups.deleteGroup(created.id).deletedAt, 'deleteGroup should work without AHARepository');
  assert.equal(sandbox.localStorage.readJson(GROUPS_KEY, []).length, 1, 'localStorage should remain the primary storage without AHARepository');
}

{
  const sandbox = makeSandbox({ repository: (calls, sequence) => makeRepository(calls, sequence, 'throw') });
  const Groups = sandbox.AHAGroups;

  let created;
  assert.doesNotThrow(() => { created = Groups.createGroup({ title: 'Feiler remote' }); }, 'createGroup should not throw when saveGroup throws');
  assert.doesNotThrow(() => Groups.updateGroup(created.id, { title: 'Lokal først' }), 'updateGroup should not throw when saveGroup throws');
  assert.doesNotThrow(() => Groups.addMemberToGroup(created.id, { name: 'Ada' }), 'addMemberToGroup should not throw when saveGroup throws');
  const memberId = sandbox.localStorage.readJson(GROUPS_KEY, [])[0].members[0].id;
  assert.doesNotThrow(() => Groups.removeMemberFromGroup(created.id, memberId), 'removeMemberFromGroup should not throw when saveGroup throws');
  assert.doesNotThrow(() => Groups.addReferenceToGroup(created.id, { title: 'Ref', source: 'aha_notes', refId: 'note-throw' }), 'addReferenceToGroup should not throw when saveGroup throws');
  const referenceId = sandbox.localStorage.readJson(GROUPS_KEY, [])[0].references[0].id;
  assert.doesNotThrow(() => Groups.removeReferenceFromGroup(created.id, referenceId), 'removeReferenceFromGroup should not throw when saveGroup throws');
  assert.doesNotThrow(() => Groups.deleteGroup(created.id), 'deleteGroup should not throw when saveGroup throws');
  assert.equal(sandbox.localStorage.readJson(GROUPS_KEY, []).length, 1, 'localStorage should survive repository saveGroup failures');
}

{
  const sandbox = makeSandbox({ repository: makeRepository });
  const Groups = sandbox.AHAGroups;
  Groups.createGroup({ title: 'Forbudte API-er' });
  assert.deepEqual(sandbox.forbiddenCalls, [], 'AHAGroups should not call AHAIngest or AHASources');
  assert.equal(sandbox.repositoryCalls.filter((call) => call.method === 'loadGroups').length, 0, 'AHAGroups should not auto-call AHARepository.loadGroups');
}

{
  const sandbox = makeSandbox({ repository: makeRepository, avisa: true });
  const Groups = sandbox.AHAGroups;
  const group = Groups.createGroup({ title: 'Avisa-gruppe', tags: ['publisering'] });
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

console.log('aha-groups-repository-persistence.test.cjs passed');
