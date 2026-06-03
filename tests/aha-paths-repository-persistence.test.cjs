const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PATHS_KEY = 'aha_paths_v1';

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
    },
    writeJson(key, value) {
      store.set(key, JSON.stringify(value));
    }
  };
}

function forbiddenApi(name, calls) {
  return new Proxy({}, {
    get(_target, prop) {
      calls.push(`${name}.${String(prop)}`);
      throw new Error(`${name} must not be used by AHAPaths`);
    }
  });
}

function makeRepository(calls, sequence, mode = 'ok') {
  return {
    savePath(pathRecord) {
      calls.push({ method: 'savePath', pathRecord });
      sequence.push({ type: 'AHARepository.savePath', pathRecord });
      if (mode === 'throw') throw new Error('repository unavailable');
      return Promise.resolve({ ok: true, data: pathRecord });
    },
    get loadPaths() {
      calls.push({ method: 'loadPaths' });
      throw new Error('AHARepository.loadPaths must not be used by AHAPaths');
    }
  };
}

function makeSandbox({ repository, seed = {} } = {}) {
  const forbiddenCalls = [];
  const repositoryCalls = [];
  const sequence = [];
  const context = {
    console,
    Date,
    Math,
    JSON,
    Promise,
    localStorage: makeLocalStorage(seed, sequence),
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; }
    },
    AHAContracts: { normalizeTags(value) { return Array.isArray(value) ? value : []; } },
    AHARepository: repository === undefined ? undefined : repository(repositoryCalls, sequence),
    AHAIngest: forbiddenApi('AHAIngest', forbiddenCalls),
    AHASources: forbiddenApi('AHASources', forbiddenCalls),
    AHAGroups: {
      getActiveGroups() { return []; },
      addReferenceToGroupByObject() { throw new Error('group add should not be invoked by this test'); }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaPaths.js'), 'utf8'),
    context,
    { filename: 'js/ahaPaths.js' }
  );
  return { ...context, repositoryCalls, forbiddenCalls, sequence };
}

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaPaths.js'), 'utf8');
assert.doesNotMatch(source, /syncFromDatabase/, 'AHAPaths should not define syncFromDatabase');
assert.doesNotMatch(source, /AHARepository\?\.loadPaths|AHARepository\.loadPaths/, 'AHAPaths should not call AHARepository.loadPaths');

{
  const sandbox = makeSandbox({ repository: makeRepository });
  const Paths = sandbox.AHAPaths;
  assert.ok(Paths, 'AHAPaths should be exported');

  const created = Paths.createPath({ title: 'Repository-sti', type: 'process', description: 'best effort' });
  assert.ok(created?.id, 'createPath should return the created path');

  const stored = sandbox.localStorage.readJson(PATHS_KEY, []);
  assert.equal(stored.length, 1, 'createPath should save one path to localStorage');
  assert.equal(stored[0].id, created.id, 'createPath should save the created path locally');
  assert.equal(sandbox.repositoryCalls.length, 1, 'createPath should call AHARepository.savePath when available');
  assert.deepEqual(sandbox.repositoryCalls[0].pathRecord, created, 'createPath should persist the created path');
  assert.equal(sandbox.sequence[0].type, 'localStorage.setItem', 'createPath should write localStorage before repository persistence');
  assert.equal(sandbox.sequence[1].type, 'AHARepository.savePath', 'createPath should persist after localStorage write');
}

{
  const sandbox = makeSandbox({ repository: makeRepository });
  const Paths = sandbox.AHAPaths;
  const created = Paths.createPath({ title: 'Original' });
  sandbox.repositoryCalls.length = 0;
  sandbox.sequence.length = 0;

  const updated = Paths.updatePath(created.id, { title: 'Oppdatert', description: 'ny' });
  assert.equal(updated.title, 'Oppdatert', 'updatePath should return the updated path');
  assert.equal(sandbox.localStorage.readJson(PATHS_KEY, [])[0].title, 'Oppdatert', 'updatePath should save the updated path locally');
  assert.equal(sandbox.repositoryCalls.length, 1, 'updatePath should call AHARepository.savePath');
  assert.equal(sandbox.repositoryCalls[0].pathRecord.title, 'Oppdatert', 'updatePath should persist the updated path');
  assert.equal(sandbox.sequence[0].type, 'localStorage.setItem', 'updatePath should write localStorage before repository persistence');
}

{
  const sandbox = makeSandbox({ repository: makeRepository });
  const Paths = sandbox.AHAPaths;
  const created = Paths.createPath({ title: 'Slett meg' });
  sandbox.repositoryCalls.length = 0;

  const deleted = Paths.deletePath(created.id);
  assert.ok(deleted.deletedAt, 'deletePath should set deletedAt');
  assert.ok(sandbox.localStorage.readJson(PATHS_KEY, [])[0].deletedAt, 'deletePath should save the tombstone locally');
  assert.equal(sandbox.repositoryCalls.length, 1, 'deletePath should persist once through updatePath');
  assert.equal(sandbox.repositoryCalls[0].pathRecord.id, created.id, 'deletePath should persist the deleted path');
  assert.ok(sandbox.repositoryCalls[0].pathRecord.deletedAt, 'deletePath should persist deletedAt tombstone');
}

{
  const sandbox = makeSandbox({ repository: makeRepository });
  const Paths = sandbox.AHAPaths;
  const created = Paths.createPath({ title: 'Steg-sti' });
  sandbox.repositoryCalls.length = 0;

  const step = Paths.addStepToPath(created.id, { source: 'aha_notes', refId: 'note-1', title: 'Notatsteg', type: 'note' });
  assert.ok(step?.id, 'addStepToPath should return the added step');
  assert.equal(sandbox.localStorage.readJson(PATHS_KEY, [])[0].steps.length, 1, 'addStepToPath should save the step locally');
  assert.equal(sandbox.repositoryCalls.length, 1, 'addStepToPath should call AHARepository.savePath');
  assert.equal(sandbox.repositoryCalls[0].pathRecord.steps.length, 1, 'addStepToPath should persist the updated steps array');
  assert.equal(sandbox.repositoryCalls[0].pathRecord.steps[0].refId, 'note-1', 'addStepToPath should persist the new step refId');
}

{
  const sandbox = makeSandbox({ repository: makeRepository });
  const Paths = sandbox.AHAPaths;
  const created = Paths.createPath({ title: 'Fjern-sti' });
  const step = Paths.addStepToPath(created.id, { source: 'aha_notes', refId: 'note-2', title: 'Fjernes', type: 'note' });
  sandbox.repositoryCalls.length = 0;

  const pathAfterRemove = Paths.removeStepFromPath(created.id, step.id);
  assert.ok(pathAfterRemove, 'removeStepFromPath should return the path');
  assert.equal(sandbox.localStorage.readJson(PATHS_KEY, [])[0].steps.length, 0, 'removeStepFromPath should save the updated steps array locally');
  assert.equal(sandbox.repositoryCalls.length, 1, 'removeStepFromPath should call AHARepository.savePath');
  assert.deepEqual(sandbox.repositoryCalls[0].pathRecord.steps, [], 'removeStepFromPath should persist the updated steps array');
}

{
  const sandbox = makeSandbox();
  const Paths = sandbox.AHAPaths;
  const created = Paths.createPath({ title: 'Kun lokal' });
  assert.ok(created?.id, 'createPath should work without AHARepository');
  const updated = Paths.updatePath(created.id, { title: 'Kun lokal oppdatert' });
  assert.equal(updated.title, 'Kun lokal oppdatert', 'updatePath should work without AHARepository');
  const step = Paths.addStepToPath(created.id, { source: 'aha_notes', refId: 'note-local', title: 'Lokal steg' });
  assert.ok(step?.id, 'addStepToPath should work without AHARepository');
  assert.ok(Paths.removeStepFromPath(created.id, step.id), 'removeStepFromPath should work without AHARepository');
  assert.ok(Paths.deletePath(created.id).deletedAt, 'deletePath should work without AHARepository');
  assert.equal(sandbox.localStorage.readJson(PATHS_KEY, []).length, 1, 'localStorage should remain the primary storage without AHARepository');
}

{
  const sandbox = makeSandbox({ repository: (calls, sequence) => makeRepository(calls, sequence, 'throw') });
  const Paths = sandbox.AHAPaths;

  let created;
  assert.doesNotThrow(() => { created = Paths.createPath({ title: 'Feiler remote' }); }, 'createPath should not throw when savePath throws');
  assert.doesNotThrow(() => Paths.updatePath(created.id, { title: 'Lokal først' }), 'updatePath should not throw when savePath throws');
  assert.doesNotThrow(() => Paths.addStepToPath(created.id, { source: 'aha_notes', refId: 'note-throw', title: 'Steg' }), 'addStepToPath should not throw when savePath throws');
  const stepId = sandbox.localStorage.readJson(PATHS_KEY, [])[0].steps[0].id;
  assert.doesNotThrow(() => Paths.removeStepFromPath(created.id, stepId), 'removeStepFromPath should not throw when savePath throws');
  assert.doesNotThrow(() => Paths.deletePath(created.id), 'deletePath should not throw when savePath throws');
  assert.equal(sandbox.localStorage.readJson(PATHS_KEY, []).length, 1, 'localStorage should survive repository savePath failures');
}

{
  const sandbox = makeSandbox({ repository: makeRepository });
  const Paths = sandbox.AHAPaths;
  Paths.createPath({ title: 'Forbudte API-er' });
  assert.deepEqual(sandbox.forbiddenCalls, [], 'AHAPaths should not call AHAIngest or AHASources');
  assert.equal(sandbox.repositoryCalls.filter((call) => call.method === 'loadPaths').length, 0, 'AHAPaths should not call AHARepository.loadPaths');
}

console.log('aha-paths-repository-persistence.test.cjs passed');
