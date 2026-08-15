const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const migrationPath = 'supabase/migrations/20260815113000_aha_function_search_path_hardening_v1.sql';
assert.equal(fs.existsSync(path.join(root, migrationPath)), true, `${migrationPath} mangler`);

const sql = fs.readFileSync(path.join(root, migrationPath), 'utf8');
for (const fn of ['aha.new_id()', 'aha.bump_revision()']) {
  const escaped = fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(sql, new RegExp(`create or replace function\\s+${escaped}[\\s\\S]*?set search_path\\s*=\\s*pg_catalog, aha`, 'i'));
  assert.match(sql, new RegExp(`revoke all on function\\s+${escaped}\\s+from public`, 'i'));
}
assert.doesNotMatch(sql, /set search_path\s*=\s*[^;\n]*public/i);
assert.match(sql, /aha_function_search_path_hardening_v1/);
assert.match(sql, /runtime_activated'\s*,\s*false/i);

console.log('aha-postgresql-function-search-path-hardening.test.cjs passed');
