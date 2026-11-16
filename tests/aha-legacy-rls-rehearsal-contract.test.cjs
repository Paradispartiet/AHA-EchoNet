// Verifies that the *hosted* preflight remains strictly read-only and the
// synthetic RLS rehearsal cannot silently point at real Supabase/Azure.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");

const audit = read("supabase/audits/aha_legacy_readonly_preflight.sql");
assert.match(audit, /BEGIN READ ONLY\s*;/i);
assert.match(audit, /COMMIT\s*;/i);
const executable = audit.split("\n").filter(x => !/^\s*--/.test(x)).join("\n");
assert.doesNotMatch(executable, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|EXECUTE|CALL|COPY)\s+(?:INTO\s+|TABLE\s+|FUNCTION\s+|SCHEMA\s+)?/i, "No writes / DDL allowed in hosted catalog preflight");
for (const table of ["aha_profiles","aha_notes","aha_source_events","aha_feed_posts","aha_insta_posts","aha_insight_chambers","aha_insight_embeddings"]) {
  assert.ok(audit.includes("'" + table + "'"), "Audit must cover " + table);
}
assert.match(audit, /pg_policies/);
assert.match(audit, /pg_class/);
assert.match(audit, /relrowsecurity/);

const fixture = read("supabase/tests/aha_legacy_rls_rehearsal_v1.sql");
assert.ok(fixture.includes("SET LOCAL ROLE authenticated"));
assert.ok(fixture.includes("SET LOCAL ROLE anon"));
assert.ok(fixture.includes("11111111-1111-4111-8111-111111111111"));
assert.ok(fixture.includes("22222222-2222-4222-8222-222222222222"));
assert.match(fixture, /insufficient_privilege/);
assert.match(fixture, /A was able to UPDATE B/);
assert.match(fixture, /A was able to DELETE B/);

const workflow = read(".github/workflows/aha-legacy-rls-rehearsal.yml");
assert.match(workflow, /postgres:16/);
assert.match(workflow, /aha_legacy_rehearsal/);
assert.match(workflow, /bash scripts\/aha-legacy-rls-rehearsal\.sh/);
assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./, "Isolated test may not use production secrets");
const runner = read("scripts/aha-legacy-rls-rehearsal.sh");
assert.doesNotMatch(runner, /\.supabase\.co|azure\.com|https?:\/\//i, "Runner must not connect to hosted providers");
assert.match(runner, /psql.*supabase\/schema\.sql/);
assert.match(runner, /psql.*supabase\/policies\.sql/);
assert.match(runner, /psql.*supabase\/chamber\.sql/);
console.log("AHA legacy hosted read-only audit + isolated RLS test contract: PASS");
