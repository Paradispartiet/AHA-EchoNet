const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const importerPath = "supabase/migrations/20260815065000_aha_local_import_v1.sql";
const guardPath = "supabase/migrations/20260815065100_aha_local_import_sha256_guard_v1.sql";
assert.equal(fs.existsSync(path.join(root, importerPath)), true, `${importerPath} mangler`);
assert.equal(fs.existsSync(path.join(root, guardPath)), true, `${guardPath} mangler`);

const importer = read(importerPath);
const guard = read(guardPath);

assert.match(importer, /create or replace function aha\.commit_local_import_v1/);
assert.match(importer, /security definer[\s\S]*set search_path = pg_catalog, aha/i);
assert.match(importer, /\bdigest\s*\(/, "importfunksjonen bruker en låst SHA-256-helper");

assert.match(guard, /create or replace function aha\.digest\s*\(\s*p_input text,\s*p_algorithm text\s*\)/i);
assert.match(guard, /pg_catalog\.sha256\s*\(\s*pg_catalog\.convert_to\s*\(/i);
assert.match(guard, /pg_catalog\.lower\(p_algorithm\) <> 'sha256'/i);
assert.match(guard, /set search_path = pg_catalog, aha/i);
assert.match(guard, /security invoker/i);
assert.match(guard, /revoke all on function aha\.digest\(text, text\) from public/i);
assert.doesNotMatch(guard, /^\s*grant\s+/gmi);
assert.doesNotMatch(guard, /create\s+policy/i);
assert.doesNotMatch(guard, /public\.aha_|public\.music_/i);
assert.doesNotMatch(guard, /extensions\.digest|public\.digest/i);

console.log("aha-local-import-digest-search-path.test.cjs passed");
