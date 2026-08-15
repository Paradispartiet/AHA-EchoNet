const assert = require('node:assert/strict');
const fs = require('node:fs');

const helpersPath = 'supabase/migrations/20260815125000_aha_canonical_sync_write_helpers_v1.sql';
const pushPath = 'supabase/migrations/20260815125100_aha_canonical_sync_push_v1.sql';
for (const path of [helpersPath, pushPath]) assert.equal(fs.existsSync(path), true, `${path} missing`);

const helpers = fs.readFileSync(helpersPath, 'utf8');
const push = fs.readFileSync(pushPath, 'utf8');
const combined = `${helpers}\n${push}`;

assert.match(helpers, /create trigger aha_bump_revision[\s\S]*on aha\.article_references[\s\S]*aha\.bump_revision\(\)/i);
assert.match(helpers, /create or replace function aha\.sync_lock_object_state_v1/i);
assert.match(helpers, /for update/i, 'sync write path must row-lock existing objects before revision decisions');
assert.match(helpers, /create or replace function aha\.assert_sync_private_scope_v1/i);
assert.match(helpers, /create or replace function aha\.assert_sync_upsert_payload_v1/i);
assert.match(helpers, /create or replace function aha\.sync_apply_upsert_v1/i);
assert.match(helpers, /create or replace function aha\.sync_apply_delete_v1/i);
assert.match(helpers, /create or replace function aha\.sync_server_payload_hash_v1/i);
assert.doesNotMatch(helpers, /execute\s+format\s*\(/i, 'typed sync writes must not use dynamic SQL');

assert.match(push, /create or replace function aha\.push_sync_change_v1/i);
assert.match(push, /aha\.can_edit_workspace\(p_workspace_id\)/i);
assert.match(push, /workspace_type='personal'/i);
assert.match(push, /'canonical_sync_push_v1'/i);
assert.match(push, /database_payload_hash/i);
assert.match(push, /request_hash/i);
assert.match(push, /sync idempotency key reused for another request/i);
assert.match(push, /stale_base_revision/i);
assert.match(push, /server_tombstone/i);
assert.match(push, /already_absent/i);
assert.match(push, /already_deleted/i);
assert.match(push, /identity_or_unique_conflict/i);
assert.match(push, /insert into aha\.sync_changes/i);
assert.match(push, /insert into aha\.audit_events/i);
assert.match(push, /record_sync_conflict_v1/i);
assert.match(push, /journal_is_system_of_record'\s*,\s*false/i);
assert.match(push, /canonical_system_of_record'\s*,\s*'domain_tables'/i);
assert.match(push, /client_payload_hash_verifier'\s*,\s*'nest_api_boundary'/i);
assert.match(push, /tombstone_resurrection_automatic'\s*,\s*false/i);

for (const type of ['conversation','message','source_event','insight','concept_list','concept_list_item','knowledge_path','knowledge_path_step','article','article_reference']) {
  assert.match(combined, new RegExp(`'${type}'`), `${type} missing from canonical sync push contract`);
}
for (const forbidden of ['note','gallery_item','feed_post','insta_post','music_item','training_item','personal_ai_state','workbench_state']) {
  assert.doesNotMatch(combined, new RegExp(`'${forbidden}'`), `${forbidden} must not enter canonical sync write contract`);
}

assert.match(helpers, /sharing_scope='private'/i);
assert.match(helpers, /publication_scope='personal'/i);
assert.match(helpers, /conversation_type[\s\S]*not in\s*\('personal_ai','reflection','imported'\)/i);
assert.match(helpers, /status[\s\S]*not in\s*\('draft','review','ready','published_local'\)/i);
assert.doesNotMatch(helpers, /publication_scope='public'/i);

assert.match(helpers, /insert into aha\.insight_versions/i);
assert.match(helpers, /current_version=v_next_version/i);
assert.match(helpers, /insert into aha\.article_versions/i);
assert.match(helpers, /select a\.current_version\+1 into v_next_version/i);

const helperSignatures = [
  'sync_lock_object_state_v1\\(text,text,text\\)',
  'assert_sync_private_scope_v1\\(text,text,jsonb\\)',
  'assert_sync_upsert_payload_v1\\(text,text,bigint,jsonb\\)',
  'sync_server_payload_hash_v1\\(text,text,text\\)',
  'sync_apply_upsert_v1\\(text,text,text,text,jsonb,boolean\\)',
  'sync_apply_delete_v1\\(text,text,text\\)'
];
for (const signature of helperSignatures) {
  assert.match(helpers, new RegExp(`revoke all on function aha\\.${signature} from public`, 'i'));
}
assert.match(push, /revoke all on function aha\.record_sync_conflict_v1\(text,text,text,text,text,text,bigint,bigint,text,text,text,text,jsonb\) from public/i);
assert.match(push, /revoke all on function aha\.push_sync_change_v1\(text,text,text,text,text,text,bigint,text,jsonb\) from public/i);
assert.doesNotMatch(combined, /^\s*grant\s+/im, 'sync migrations must not grant runtime privileges');

const idempotencyIndex = push.indexOf('insert into aha.idempotency_keys');
const lockIndex = push.indexOf('v_state:=aha.sync_lock_object_state_v1');
const applyIndex = push.indexOf('v_new_revision:=aha.sync_apply_upsert_v1');
const journalIndex = push.indexOf('insert into aha.sync_changes');
assert.ok(idempotencyIndex >= 0 && lockIndex > idempotencyIndex, 'idempotency must be established before object lock/write');
assert.ok(applyIndex > lockIndex, 'canonical write must happen after row lock/revision decision');
assert.ok(journalIndex > applyIndex, 'journal entry must be written only after canonical write succeeds');

const runtimeScript = fs.readFileSync('scripts/aha-postgresql-staging-rehearsal.sh', 'utf8');
assert.match(runtimeScript, /GRANT EXECUTE ON FUNCTION aha\.push_sync_change_v1\(text,text,text,text,text,text,bigint,text,jsonb\)/);
assert.match(runtimeScript, /sync_apply_upsert_v1\(text,text,text,text,jsonb,boolean\)/);
assert.match(runtimeScript, /aha_postgresql_sync_push_rehearsal_v1\.sql/);
assert.match(runtimeScript, /aha_postgresql_sync_scope_rehearsal_v1\.sql/);

const pushRehearsal = fs.readFileSync('supabase/tests/aha_postgresql_sync_push_rehearsal_v1.sql', 'utf8');
assert.match(pushRehearsal, /exact sync retry failed/i);
assert.match(pushRehearsal, /stale conflict failed/i);
assert.match(pushRehearsal, /tombstone resurrection was not blocked/i);
assert.match(pushRehearsal, /article_reference monotone revision failed/i);
assert.match(pushRehearsal, /delta pull should collapse to ten latest object states/i);

const scopeRehearsal = fs.readFileSync('supabase/tests/aha_postgresql_sync_scope_rehearsal_v1.sql', 'utf8');
assert.match(scopeRehearsal, /group conversation entered personal sync v1/i);
assert.match(scopeRehearsal, /workspace-shared list entered personal sync v1/i);
assert.match(scopeRehearsal, /public article entered personal sync v1/i);
assert.match(scopeRehearsal, /local-only note entered canonical sync v1/i);

console.log('aha-canonical-sync-push-v1.test.cjs passed');
