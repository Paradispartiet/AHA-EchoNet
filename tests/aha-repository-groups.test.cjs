const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const calls = [];

function forbiddenApi(name) {
  return new Proxy({}, {
    get(_target, prop) {
      calls.push(`${name}.${String(prop)}`);
      throw new Error(`${name} must not be used by AHARepository Groups methods`);
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

  assert.equal(typeof Repository.saveGroup, 'function', 'AHARepository.saveGroup should exist');
  assert.equal(typeof Repository.loadGroups, 'function', 'AHARepository.loadGroups should exist');

  const members = [{ id: 'member-1', name: 'Lokal medlem', role: 'member', status: 'local', addedAt: '2026-01-01T00:00:00.000Z', meta: { local: true } }];
  const references = [{ id: 'reference-1', title: 'Notat', type: 'note', source: 'aha_notes', refId: 'note-1', addedAt: '2026-01-01T00:00:00.000Z', meta: { pinned: true } }];

  const result = await Repository.saveGroup({
    id: 'group-1',
    title: 'Trygg gruppe',
    type: 'circle',
    description: 'Repository contract only',
    tags: ['aha', 'groups'],
    members,
    references,
    meta: { localOnly: false },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    deletedAt: '2026-01-03T00:00:00.000Z'
  });

  assert.equal(result.ok, true, 'saveGroup should persist when signed in');
  const upsertCall = calls.find((call) => call.type === 'upsert');
  assert.equal(upsertCall.table, 'aha_groups', 'saveGroup should use the aha_groups table');
  assert.equal(upsertCall.record.profile_id, 'profile-1', 'saveGroup should attach the active profile id');
  assert.equal(upsertCall.record.created_at, '2026-01-01T00:00:00.000Z', 'createdAt should map to created_at');
  assert.equal(upsertCall.record.updated_at, '2026-01-02T00:00:00.000Z', 'updatedAt should map to updated_at');
  assert.equal(upsertCall.record.deleted_at, '2026-01-03T00:00:00.000Z', 'deletedAt should map to deleted_at');
  assert.deepEqual(upsertCall.record.members, members, 'saveGroup should preserve embedded members as an array');
  assert.deepEqual(upsertCall.record.references, references, 'saveGroup should preserve embedded references as an array');
  assert.equal(upsertCall.record.source, 'aha_groups', 'saveGroup should default source to aha_groups');

  calls.length = 0;
  await Repository.loadGroups({ limit: 25 });
  assert.ok(calls.some((call) => call.type === 'list' && call.table === 'aha_groups'), 'loadGroups should query the aha_groups table');
  assert.ok(calls.some((call) => call.type === 'order' && call.table === 'aha_groups' && call.col === 'created_at'), 'loadGroups should order by created_at');
  assert.ok(calls.some((call) => call.type === 'limit' && call.table === 'aha_groups' && call.limit === 25), 'loadGroups should apply the requested limit');

  const missingId = await Repository.saveGroup({ title: 'Mangler id' });
  assert.equal(missingId.ok, false, 'saveGroup should fallback when id is missing');
  assert.equal(missingId.fallback, 'missing_id', 'saveGroup should return missing_id fallback');

  const { Repository: signedOutRepository } = await makeRepository(async () => null);
  const signedOut = await signedOutRepository.saveGroup({ id: 'group-signed-out' });
  assert.equal(signedOut.ok, false, 'saveGroup should fallback when profile id is missing');
  assert.equal(signedOut.fallback, 'not_signed_in', 'saveGroup should return not_signed_in fallback');

  assert.equal(calls.filter((call) => typeof call === 'string' && /AHAIngest|AHASources/.test(call)).length, 0, 'saveGroup/loadGroups should not call AHAIngest or AHASources');

  console.log('aha-repository-groups.test.cjs passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
