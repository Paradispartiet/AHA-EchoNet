const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const calls = [];

function forbiddenApi(name) {
  return new Proxy({}, {
    get(_target, prop) {
      calls.push(`${name}.${String(prop)}`);
      throw new Error(`${name} must not be used by AHARepository Lists methods`);
    }
  });
}

function makeSupabase() {
  const rowsByTable = {};

  return {
    rowsByTable,
    from(table) {
      rowsByTable[table] = rowsByTable[table] || [];
      const state = { table, orderBy: null, limit: null, eqs: [] };
      const builder = {
        upsert(record, opts) {
          calls.push({ type: 'upsert', table, record, opts });
          rowsByTable[table].push({ ...record });
          return {
            select: () => ({
              single: async () => ({ data: { ...record }, error: null })
            })
          };
        },
        select(select) { state.select = select; return builder; },
        eq(col, val) { state.eqs.push([col, val]); return builder; },
        order(col, opts) { state.orderBy = { col, opts }; calls.push({ type: 'order', table, col, opts }); return builder; },
        limit(limit) { state.limit = limit; calls.push({ type: 'limit', table, limit }); return builder; },
        then(resolve, reject) {
          calls.push({ type: 'list', ...state });
          try { resolve({ data: rowsByTable[table].slice(), error: null }); }
          catch (error) { if (reject) reject(error); }
        }
      };
      return builder;
    }
  };
}

async function makeRepository(getProfileId = async () => 'profile-1') {
  calls.length = 0;
  const supabase = makeSupabase();
  const context = {
    console,
    Date,
    Math,
    JSON,
    AHADb: { getClient: () => supabase },
    AHAAuth: { getProfileId },
    AHAIngest: forbiddenApi('AHAIngest'),
    AHASources: forbiddenApi('AHASources')
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaRepository.js'), 'utf8'),
    context,
    { filename: 'js/ahaRepository.js' }
  );
  return { Repository: context.AHARepository, supabase };
}

(async () => {
  const { Repository } = await makeRepository();

  assert.equal(typeof Repository.saveList, 'function', 'AHARepository.saveList should exist');
  assert.equal(typeof Repository.loadLists, 'function', 'AHARepository.loadLists should exist');

  const result = await Repository.saveList({
    id: 'list-1',
    title: 'Trygg liste',
    type: 'todo',
    description: 'Repository contract only',
    tags: ['aha', 'lists'],
    items: [{ id: 'item-1', source: 'aha_notes', refId: 'note-1' }],
    meta: { localOnly: false },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    deletedAt: '2026-01-03T00:00:00.000Z'
  });

  assert.equal(result.ok, true, 'saveList should persist when signed in');
  const upsertCall = calls.find((call) => call.type === 'upsert');
  assert.equal(upsertCall.table, 'aha_lists', 'saveList should use the aha_lists table');
  assert.equal(upsertCall.record.profile_id, 'profile-1', 'saveList should attach the active profile id');
  assert.equal(upsertCall.record.created_at, '2026-01-01T00:00:00.000Z', 'createdAt should map to created_at');
  assert.equal(upsertCall.record.updated_at, '2026-01-02T00:00:00.000Z', 'updatedAt should map to updated_at');
  assert.equal(upsertCall.record.deleted_at, '2026-01-03T00:00:00.000Z', 'deletedAt should map to deleted_at');
  assert.deepEqual(upsertCall.record.items, [{ id: 'item-1', source: 'aha_notes', refId: 'note-1' }], 'saveList should preserve embedded items as an array');
  assert.equal(upsertCall.record.source, 'aha_lists', 'saveList should default source to aha_lists');

  calls.length = 0;
  await Repository.loadLists({ limit: 25 });
  assert.ok(calls.some((call) => call.type === 'list' && call.table === 'aha_lists'), 'loadLists should query the aha_lists table');
  assert.ok(calls.some((call) => call.type === 'order' && call.table === 'aha_lists' && call.col === 'created_at'), 'loadLists should order by created_at');
  assert.ok(calls.some((call) => call.type === 'limit' && call.table === 'aha_lists' && call.limit === 25), 'loadLists should apply the requested limit');

  const missingId = await Repository.saveList({ title: 'Mangler id' });
  assert.equal(missingId.ok, false, 'saveList should fallback when id is missing');
  assert.equal(missingId.fallback, 'missing_id', 'saveList should return missing_id fallback');

  const { Repository: signedOutRepository } = await makeRepository(async () => null);
  const signedOut = await signedOutRepository.saveList({ id: 'list-signed-out' });
  assert.equal(signedOut.ok, false, 'saveList should fallback when profile id is missing');
  assert.equal(signedOut.fallback, 'not_signed_in', 'saveList should return not_signed_in fallback');

  assert.equal(calls.filter((call) => typeof call === 'string' && /AHAIngest|AHASources/.test(call)).length, 0, 'saveList/loadLists should not call AHAIngest or AHASources');

  console.log('aha-repository-lists.test.cjs passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
