const assert = require('node:assert/strict');
const fs = require('node:fs');

const journalPath = 'supabase/migrations/20260815120000_aha_canonical_sync_journal_v1.sql';
const indexPath = 'supabase/migrations/20260815120100_aha_canonical_sync_journal_fk_indexes_v1.sql';
for (const path of [journalPath, indexPath]) assert.equal(fs.existsSync(path), true, `${path} mangler`);
const sql = fs.readFileSync(journalPath, 'utf8');
const indexSql = fs.readFileSync(indexPath, 'utf8');

assert.match(sql, /create table if not exists aha\.sync_changes/i);
assert.match(sql, /cursor bigint generated always as identity primary key/i);
assert.match(sql, /unique \(workspace_id, object_type, object_id, revision\)/i);
assert.match(sql, /unique \(workspace_id, idempotency_key\)/i);
assert.match(sql, /operation text not null check \(operation in \('upsert','delete'\)\)/i);
assert.match(sql, /payload_hash.*\^\[a-f0-9\]\{64\}\$/i);
assert.match(sql, /create table if not exists aha\.sync_conflicts/i);
assert.match(sql, /base_revision bigint not null check \(base_revision >= 0\)/i);
assert.match(sql, /server_revision bigint not null check \(server_revision >= 0\)/i);
assert.match(sql, /alter table aha\.sync_changes enable row level security/i);
assert.match(sql, /alter table aha\.sync_conflicts enable row level security/i);
assert.doesNotMatch(sql, /create\s+policy[\s\S]*?sync_(?:changes|conflicts)/i);
assert.doesNotMatch(sql, /grant\s+(?:insert|update|delete|all)[\s\S]*?sync_(?:changes|conflicts)/i);
assert.match(sql, /revoke all on aha\.sync_changes from public/i);
assert.match(sql, /revoke all on aha\.sync_conflicts from public/i);
assert.match(sql, /journal_is_system_of_record'\s*,\s*false/i);
assert.match(sql, /auto_sync'\s*,\s*false/i);
assert.match(sql, /login_triggers_sync'\s*,\s*false/i);

assert.match(indexSql, /aha_sync_changes_changed_by_profile_idx/i);
assert.match(indexSql, /on aha\.sync_changes\(changed_by_profile_id\)/i);
assert.match(indexSql, /aha_sync_conflicts_profile_idx/i);
assert.match(indexSql, /on aha\.sync_conflicts\(profile_id\)/i);
assert.match(indexSql, /advisor_source'\s*,\s*'supabase_hosted_staging'/i);
assert.doesNotMatch(indexSql, /\bgrant\b|\brevoke\b/i);

for (const type of ['conversation','message','source_event','insight','concept_list','concept_list_item','knowledge_path','knowledge_path_step','article','article_reference']) {
  assert.match(sql, new RegExp(`'${type}'`));
}
for (const forbidden of ['note','gallery_item','feed_post','insta_post','music_item','training_item','personal_ai_state','workbench_state']) {
  assert.doesNotMatch(sql, new RegExp(`'${forbidden}'`), `${forbidden} must not become a canonical sync object type`);
}

console.log('aha-canonical-sync-journal.test.cjs passed');
