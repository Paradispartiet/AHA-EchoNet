// Guard the single-function, read-only hosted audit. No Supabase API calls.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const source = fs.readFileSync("supabase/audits/aha_match_insights_readonly_status.sql", "utf8");
assert.match(source, /BEGIN READ ONLY;/i);
assert.match(source, /COMMIT;/i);
assert.match(source, /to_regprocedure\(\s*'public\.aha_match_insights\(public\.vector, integer, double precision, text, text\)'/i);
assert.match(source, /pg_get_functiondef/);
assert.match(source, /prosecdef/);
assert.match(source, /proconfig/);
assert.match(source, /REVIEW_MUTABLE_SEARCH_PATH/);
assert.match(source, /BLOCK_SECURITY_DEFINER/);
assert.match(source, /REVIEW_UNQUALIFIED_VECTOR_OPERATOR/);
assert.match(source, /RPC_METADATA_PREFLIGHT_OK/);
assert.doesNotMatch(source, /\b(?:ALTER|CREATE|DROP|TRUNCATE|UPDATE|INSERT|DELETE|GRANT|REVOKE|CALL|EXECUTE)\s+(?:TABLE|FUNCTION|POLICY|ROLE|SCHEMA|INTO|ON|EXTENSION|INDEX|public\.)/i,
  "This audit may not mutate production");
assert.doesNotMatch(source, /\b(?:auth\.users|SELECT\s+\*|from\s+public\.aha_insight_embeddings\b)\b/i,
  "No personal rows or Auth identities");
console.log("AHA hosted insight RPC read-only status audit: PASS");
