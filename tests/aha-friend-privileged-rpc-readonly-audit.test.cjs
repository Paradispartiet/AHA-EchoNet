// AHA privileged-RPC status check must remain read-only and privacy-preserving.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");

const file = "supabase/audits/aha_friend_privileged_rpc_readonly_status.sql";
const sql = fs.readFileSync(file,"utf8");
assert.match(sql,/BEGIN READ ONLY;/i);
assert.match(sql,/COMMIT;/i);
for (const name of ["aha_open_social_meet_chat","aha_report_direct_chat"]) {
  assert.ok(sql.includes(name), "Missing protected RPC audit: "+name);
}
for (const name of ["chat_reports","invite_quotas","meet_links"]) {
  assert.ok(sql.includes(name), "Missing private table audit: "+name);
}
assert.match(sql,/has_function_privilege\('anon'/i);
assert.match(sql,/has_function_privilege\('authenticated'/i);
assert.match(sql,/aclexplode\(/i);
assert.match(sql,/pg_get_functiondef\(/i);
assert.match(sql,/AUTH_ONLY_PRIVILEGED_REVIEW/);
assert.match(sql,/PRIVATE_TABLE_DIRECT_ACCESS_DENIED/);
assert.match(sql,/BLOCK_ANONYMOUS_OR_PUBLIC_EXECUTE/);
assert.match(sql,/BLOCK_DIRECT_TABLE_ACCESS/);
assert.match(sql,/REVIEW_UNPINNED_SEARCH_PATH/);
assert.doesNotMatch(sql, /\b(?:ALTER|CREATE|DROP|TRUNCATE|UPDATE|INSERT|DELETE|GRANT|REVOKE)\s+(?:TABLE|FUNCTION|POLICY|SCHEMA|ROLE|ON|INTO|EXTENSION|INDEX|public\.|aha_friend_private\.)/i,
  "This audit cannot modify deployed objects");
assert.doesNotMatch(sql,/\bFROM\s+(?:public\.(?:aha_friend_requests|aha_profiles|hg_spotmeeting_invites)|aha_friend_private\.(?:chat_reports|invite_quotas|meet_links))\b/i,
  "Audit must not read person or private table rows");
console.log("AHA privileged RPC and private table audit contract: PASS");
