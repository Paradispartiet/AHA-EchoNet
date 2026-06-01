const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

// Verifies that AHA Insta persists profile/likes/comments/follows through
// AHARepository (best-effort), and that syncSocialFromDatabase merges remote
// rows back into the localStorage-canonical store.

function makeLocalStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key)
  };
}

function makeSupabase(store) {
  return {
    from(table) {
      store[table] = store[table] || [];
      const state = { eqs: [] };
      const rows = () => {
        let result = store[table].slice();
        state.eqs.forEach(([col, val]) => {
          result = result.filter((row) => row[col] === val);
        });
        return result;
      };
      const builder = {
        upsert(record, opts) {
          const conflict = (opts && opts.onConflict) || 'id';
          const arr = store[table];
          const idx = arr.findIndex((row) => row[conflict] === record[conflict]);
          if (idx >= 0) arr[idx] = { ...arr[idx], ...record };
          else arr.push({ ...record });
          const saved = { ...record };
          return { select: () => ({ single: async () => ({ data: saved, error: null }) }) };
        },
        select() { return builder; },
        eq(col, val) { state.eqs.push([col, val]); return builder; },
        is(col, val) { state.eqs.push([col, val]); return builder; },
        order() { return builder; },
        limit() { return builder; },
        maybeSingle: async () => ({ data: rows()[0] || null, error: null }),
        then(resolve, reject) {
          try { resolve({ data: rows(), error: null }); }
          catch (error) { if (reject) reject(error); }
        }
      };
      return builder;
    }
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const store = {};
const supa = makeSupabase(store);

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  Date,
  Math,
  JSON,
  localStorage: makeLocalStorage(),
  document: {
    readyState: 'loading',
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  },
  addEventListener: () => {},
  AHADb: { getClient: () => supa },
  AHAAuth: { getProfileId: async () => 'profile-1' }
};
sandbox.window = sandbox;

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('ahaRepository.js', 'utf8'), sandbox, { filename: 'ahaRepository.js' });
vm.runInContext(fs.readFileSync('ahaInsta.js', 'utf8'), sandbox, { filename: 'ahaInsta.js' });

const Insta = sandbox.AHAInsta;
assert.ok(Insta, 'AHAInsta should be exported');

(async () => {
  // 1) Profile persistence
  Insta.saveProfile({
    id: 'user_x',
    username: 'meg',
    displayName: 'Meg',
    bio: 'hei',
    avatar: '',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  });
  await flush();
  const profileRow = (store['aha_insta_profiles'] || [])[0];
  assert.ok(profileRow, 'profile should be persisted');
  assert.equal(profileRow.profile_id, 'profile-1');
  assert.equal(profileRow.username, 'meg');
  assert.equal(profileRow.local_id, 'user_x');

  // 2) Like persistence with stable id + soft-delete on toggle off
  Insta.toggleLike('post1');
  await flush();
  let likeRow = (store['aha_insta_likes'] || []).find((row) => row.id === 'like_post1_user_x');
  assert.ok(likeRow, 'like should be persisted with stable id');
  assert.equal(likeRow.deleted_at, null);
  assert.equal(Insta.hasLiked('post1'), true);

  Insta.toggleLike('post1');
  await flush();
  likeRow = (store['aha_insta_likes'] || []).find((row) => row.id === 'like_post1_user_x');
  assert.ok(likeRow.deleted_at, 'unlike should soft-delete the same row');
  assert.equal(Insta.hasLiked('post1'), false, 'localStorage like should be removed on unlike');

  // 3) Comment persistence + soft-delete
  const comment = Insta.addComment('post1', 'fin post');
  await flush();
  let commentRow = (store['aha_insta_comments'] || []).find((row) => row.id === comment.id);
  assert.ok(commentRow, 'comment should be persisted');
  assert.equal(commentRow.text, 'fin post');
  assert.equal(commentRow.deleted_at, null);

  Insta.deleteComment(comment.id);
  await flush();
  commentRow = (store['aha_insta_comments'] || []).find((row) => row.id === comment.id);
  assert.ok(commentRow.deleted_at, 'deleted comment should be soft-deleted in db');

  // 4) Follow persistence with stable id
  Insta.toggleFollow('bob');
  await flush();
  const followRow = (store['aha_insta_follows'] || []).find((row) => row.id === 'follow_user_x_bob');
  assert.ok(followRow, 'follow should be persisted with stable id');
  assert.equal(followRow.following_username, 'bob');
  assert.equal(followRow.deleted_at, null);

  // 5) Sync from database merges remote rows into localStorage.
  //    localStorage stays canonical for this device; a remote-only like is
  //    pulled in, while a remote row marked deleted (not held locally) stays out.
  sandbox.localStorage.setItem('aha_insta_likes_v1', '[]');
  store['aha_insta_likes'] = [
    { id: 'like_remote', profile_id: 'profile-1', post_id: 'p9', user_id: 'user_x', deleted_at: null, created_at: '2026-02-01T00:00:00.000Z' },
    { id: 'like_gone', profile_id: 'profile-1', post_id: 'p8', user_id: 'user_x', deleted_at: '2026-02-02T00:00:00.000Z', created_at: '2026-02-01T00:00:00.000Z' }
  ];

  await Insta.syncSocialFromDatabase();
  const localLikes = Insta.loadLikes();
  assert.ok(localLikes.some((like) => like.id === 'like_remote'), 'remote like should merge into local store');
  assert.ok(!localLikes.some((like) => like.id === 'like_gone'), 'remote-deleted like should not be added locally');

  console.log('aha-insta-social-persistence test passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
