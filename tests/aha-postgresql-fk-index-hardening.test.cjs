const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const migrationPath = 'supabase/migrations/20260815114500_aha_foreign_key_index_hardening_v1.sql';
assert.equal(fs.existsSync(path.join(root, migrationPath)), true, `${migrationPath} mangler`);

const sql = fs.readFileSync(path.join(root, migrationPath), 'utf8');
assert.match(sql, /c\.contype\s*=\s*'f'/i);
assert.match(sql, /n\.nspname\s*=\s*'aha'/i);
assert.match(sql, /i\.indisvalid/i);
assert.match(sql, /i\.indisready/i);
assert.match(sql, /cardinality\(foreign_keys\.conkey\)/i);
assert.match(sql, /=\s*foreign_keys\.conkey/i);
assert.match(sql, /create index if not exists/i);
assert.match(sql, /substr\(md5\(/i);
assert.match(sql, /aha_foreign_key_index_hardening_v1/i);
assert.match(sql, /runtime_activated'\s*,\s*false/i);
assert.match(sql, /rls_modified'\s*,\s*false/i);
assert.match(sql, /grants_modified'\s*,\s*false/i);
assert.doesNotMatch(sql, /drop\s+(?:index|table|schema)/i);
assert.doesNotMatch(sql, /alter\s+table[\s\S]*?(?:enable|disable|force)\s+row\s+level\s+security/i);
assert.doesNotMatch(sql, /\bgrant\b|\brevoke\b/i);

console.log('aha-postgresql-fk-index-hardening.test.cjs passed');
