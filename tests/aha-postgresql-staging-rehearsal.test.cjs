const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

for (const file of [
  '.github/workflows/aha-postgresql-staging-rehearsal.yml',
  'scripts/aha-postgresql-staging-rehearsal.sh',
  'supabase/tests/aha_postgresql_staging_rehearsal_v1.sql',
  'docs/AHA_POSTGRESQL_STAGING_REHEARSAL_V1.md'
]) {
  assert.equal(fs.existsSync(path.join(root, file)), true, `${file} mangler`);
}

const workflow = read('.github/workflows/aha-postgresql-staging-rehearsal.yml');
assert.match(workflow, /postgres:16/);
assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
assert.match(workflow, /aha-postgresql-staging-rehearsal\.sh/);
assert.doesNotMatch(workflow, /secrets\.|contents:\s*write|pull-requests:\s*write/);

const runner = read('scripts/aha-postgresql-staging-rehearsal.sh');
assert.match(runner, /find supabase\/migrations[^\n]+20\*\.sql[^\n]+sort/);
assert.match(runner, /NOSUPERUSER/);
assert.match(runner, /NOBYPASSRLS/);
assert.match(runner, /NOINHERIT/);
assert.match(runner, /GRANT EXECUTE ON FUNCTION aha\.commit_local_import_v1/);
assert.match(runner, /has_function_privilege\('aha_runtime_rehearsal', 'aha\.record_local_import_item_v1/);
assert.doesNotMatch(runner, /GRANT\s+(INSERT|UPDATE|DELETE|ALL)\s+ON\s+(ALL\s+TABLES|aha\.)/i);

const sql = read('supabase/tests/aha_postgresql_staging_rehearsal_v1.sql');
assert.match(sql, /set_config\(\s*'request\.jwt\.claims'/);
assert.match(sql, /tenant A can read tenant B workspace/);
assert.match(sql, /tenant B can read tenant A workspace/);
assert.match(sql, /idempotentReplay/);
assert.match(sql, /cross-tenant collision unexpectedly succeeded/);
assert.match(sql, /should_not_survive_collision/);
assert.match(sql, /insufficient_privilege/);

console.log('aha-postgresql-staging-rehearsal.test.cjs passed');
