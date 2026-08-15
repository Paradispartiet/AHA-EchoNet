const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = 'supabase/migrations/20260815124000_aha_canonical_sync_read_v1.sql';
assert.equal(fs.existsSync(migration), true, `${migration} missing`);
const sql = fs.readFileSync(migration, 'utf8');

assert.match(sql, /create or replace function aha\.sync_object_snapshot_v1/i);
assert.match(sql, /create or replace function aha\.pull_sync_changes_v1/i);
assert.match(sql, /create or replace function aha\.bootstrap_sync_snapshot_v1/i);
assert.match(sql, /security definer[\s\S]*set search_path = pg_catalog, aha/i);

assert.match(sql, /if not aha\.can_read_workspace\(p_workspace_id\)/i);
assert.match(sql, /p_after_cursor < 0/i);
assert.match(sql, /p_limit < 1 or p_limit > 500/i);
assert.match(sql, /p_high_watermark > v_current_high_watermark/i);
assert.match(sql, /bootstrap high watermark cannot exceed current journal watermark/i);
assert.match(sql, /highWatermark/i);
assert.match(sql, /nextCursor/i);
assert.match(sql, /nextKey/i);
assert.match(sql, /hasMore/i);

assert.match(sql, /when r\.operation = 'delete' then null else r\.snapshot end/i, 'delta tombstones must not carry raw payload');
assert.match(sql, /when r\.deleted then null else r\.snapshot end/i, 'bootstrap tombstones must not carry raw payload');
assert.match(sql, /to_jsonb\(i\)[\s\S]*insight_versions/i, 'insight snapshot must include current version atomically');
assert.match(sql, /to_jsonb\(a\)[\s\S]*article_versions/i, 'article snapshot must include current version atomically');

for (const type of ['conversation','message','source_event','insight','concept_list','concept_list_item','knowledge_path','knowledge_path_step','article','article_reference']) {
  assert.match(sql, new RegExp(`'${type}'`), `${type} missing from canonical sync read contract`);
}
for (const forbidden of ['note','gallery_item','feed_post','insta_post','music_item','training_item','personal_ai_state','workbench_state']) {
  assert.doesNotMatch(sql, new RegExp(`'${forbidden}'`), `${forbidden} must not enter canonical sync read contract`);
}

assert.match(sql, /revoke all on function aha\.sync_object_snapshot_v1\(text,text,text\) from public/i);
assert.match(sql, /revoke all on function aha\.pull_sync_changes_v1\(text,bigint,integer\) from public/i);
assert.match(sql, /revoke all on function aha\.bootstrap_sync_snapshot_v1\(text,text,bigint,integer\) from public/i);
assert.doesNotMatch(sql, /^\s*grant\s+/im, 'read migration must not grant runtime privileges');

const domainTables = [
  'conversations','messages','source_events','insights','insight_versions',
  'concept_lists','concept_list_items','knowledge_paths','knowledge_path_steps',
  'articles','article_versions','article_references','sync_changes','sync_conflicts'
];
for (const table of domainTables) {
  assert.doesNotMatch(sql, new RegExp(`\\b(?:insert\\s+into|update|delete\\s+from)\\s+aha\\.${table}\\b`, 'i'), `read boundary must not mutate aha.${table}`);
}

assert.match(sql, /'runtime_activated'\s*,\s*false/i);
assert.match(sql, /'frontend_sync_activated'\s*,\s*false/i);
assert.match(sql, /'auto_sync'\s*,\s*false/i);
assert.match(sql, /'login_triggers_sync'\s*,\s*false/i);
assert.match(sql, /'raw_deleted_payload_returned'\s*,\s*false/i);
assert.match(sql, /'canonical_system_of_record'\s*,\s*'domain_tables'/i);

const rehearsal = fs.readFileSync('scripts/aha-postgresql-staging-rehearsal.sh', 'utf8');
assert.match(rehearsal, /GRANT EXECUTE ON FUNCTION aha\.bootstrap_sync_snapshot_v1\(text,text,bigint,integer\)/);
assert.match(rehearsal, /GRANT EXECUTE ON FUNCTION aha\.pull_sync_changes_v1\(text,bigint,integer\)/);
assert.match(rehearsal, /has_function_privilege\('aha_runtime_rehearsal', 'aha\.sync_object_snapshot_v1\(text,text,text\)', 'EXECUTE'\)/);

const runtimeTest = fs.readFileSync('supabase/tests/aha_postgresql_staging_rehearsal_v1.sql', 'utf8');
assert.match(runtimeTest, /bootstrap should return imported conversation \+ message/i);
assert.match(runtimeTest, /tenant A was allowed to bootstrap tenant B/i);
assert.match(runtimeTest, /bootstrap accepted a watermark beyond current journal state/i);
assert.match(runtimeTest, /delta pull should be empty before explicit push exists/i);

console.log('aha-canonical-sync-read-v1.test.cjs passed');
