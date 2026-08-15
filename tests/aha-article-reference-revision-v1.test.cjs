const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = 'supabase/migrations/20260815123000_aha_article_reference_revision_v1.sql';
assert.equal(fs.existsSync(migration), true, `${migration} missing`);
const sql = fs.readFileSync(migration, 'utf8');

assert.match(sql, /alter table aha\.article_references[\s\S]*add column if not exists updated_at timestamptz/i);
assert.match(sql, /set updated_at = added_at/i, 'existing rows must preserve their original chronology');
assert.match(sql, /alter column updated_at set default now\(\)/i);
assert.match(sql, /alter column updated_at set not null/i);
assert.match(sql, /add column if not exists revision bigint/i);
assert.match(sql, /set revision = 1/i);
assert.match(sql, /alter column revision set default 1/i);
assert.match(sql, /alter column revision set not null/i);
assert.match(sql, /check \(revision > 0\)/i);
assert.match(sql, /aha_article_reference_revision_v1/i);
assert.match(sql, /timestamp_conflict_fallback'\s*,\s*false/i);
assert.doesNotMatch(sql, /grant\s+(?:insert|update|delete|all)/i, 'migration must not open a direct browser write path');

const store = fs.readFileSync('js/ahaCanonicalSyncStore.js', 'utf8');
assert.match(store, /"article_reference"/, 'article references remain in the canonical sync allow-list');

console.log('aha-article-reference-revision-v1.test.cjs passed');
