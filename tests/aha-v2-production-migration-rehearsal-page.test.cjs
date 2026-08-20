const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("v2-production-migration-rehearsal.html", "utf8");

assert.match(html, /ahaV2ProductionRehearsal=1/);
assert.match(html, /RUN_AHA_V2_PRODUCTION_MIGRATION_REHEARSAL/);
assert.match(html, /localStorage\.getItem\("aha_insight_chamber_v1"\)/);
assert.match(html, /AHAV2BackfillStagingStore\.create/);
assert.match(html, /AHAV2ProductionMigrationRehearsal\.preview/);
assert.match(html, /AHAV2ProductionMigrationRehearsal\.rehearse/);
assert.match(html, /dry_run_reviewed:/);
assert.match(html, /explicit_authorization:/);
assert.match(html, /raw_insight_text_in_evidence: false/);
assert.match(html, /chamber_payload_in_evidence: false/);

assert.doesNotMatch(html, /localStorage\.(?:setItem|removeItem)\s*\(/, "operator page must never write product localStorage");
assert.doesNotMatch(html, /\bfetch\s*\(/, "operator page must not call network APIs");
assert.doesNotMatch(html, /AHARepository/, "operator page must not use repository persistence");
assert.doesNotMatch(html, /supabase/i, "operator page must not use Supabase");
assert.doesNotMatch(html, /saveChamber|saveChamberToStorage/, "operator page must not expose Chamber writes");

const previewButton = html.match(/<button id="preview-btn"([^>]*)>/)?.[1] || "";
const rehearseButton = html.match(/<button id="rehearse-btn"([^>]*)>/)?.[1] || "";
assert.match(previewButton, /disabled/, "dry-run must not auto-start before operator gate");
assert.match(rehearseButton, /disabled/, "apply+rollback must require explicit operator review and token");

console.log("aha-v2-production-migration-rehearsal-page.test.cjs: OK");
