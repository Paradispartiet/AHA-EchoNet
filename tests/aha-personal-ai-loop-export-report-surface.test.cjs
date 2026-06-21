const assert = require("assert");
const fs = require("fs");

const DOC_FILE = "docs/AHA_PERSONAL_AI_LOOP_EXPORT_REPORT_SURFACE.md";
const STATUS_FILE = "docs/AHA_IMPLEMENTATION_STATUS.md";
const JS_FILES = [
  "js/ahaPersonalAiLoopAudit.js",
  "js/ahaChat.js",
  "js/metaInsightsAgent.js",
  "js/ahaTrainingDashboard.js"
];
const HOME_FILE = "index.html";

function read(file) { return fs.readFileSync(file, "utf8"); }
function normalize(value) {
  return String(value).toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
}
function includesAll(file, label, terms) {
  const text = normalize(read(file));
  for (const term of terms) assert.ok(text.includes(normalize(term)), `${label}: missing ${term}`);
}
function matchesAll(file, label, patterns) {
  const text = read(file);
  for (const pattern of patterns) assert.match(text, pattern, `${label}: missing ${pattern}`);
}
function combinedJs() { return JS_FILES.map((file) => `\n/* ${file} */\n${read(file)}`).join("\n"); }
function matchingLines(source, regex) {
  return source.split(/\r?\n/).filter((line) => regex.test(line));
}

assert.ok(fs.existsSync(DOC_FILE), `${DOC_FILE} must exist`);

includesAll(DOC_FILE, "current locked state", [
  "Personal AI Loop Audit is **local-first**",
  "read-only boundary is test-locked",
  "Privacy/operator visibility is reviewed", "test-locked",
  "next activation surface is reviewed", "test-locked",
  "Operator recommendations UX and behavior are reviewed", "test-locked",
  "Chat readiness surface and behavior are reviewed", "test-locked",
  "Meta Insights recommendation surface and behavior are reviewed", "test-locked",
  "Audit run is **explicit-action only**",
  "Export/report must be **explicit-action only**",
  "Export/report must not run audit automatically",
  "Export/report must not write data",
  "Export/report must not trigger Sync Hub",
  "Export/report must not trigger auto-sync",
  "Export/report must not publish or share",
  "Export/report must not contain raw audit payload or private payload"
]);

includesAll(DOC_FILE, "purpose", [
  "give the user/operator a safe local report about Personal AI Loop readiness",
  "summarize blockers, warnings, and next steps",
  "show compact/redacted status from audit, Chat readiness, and Meta Insights",
  "support manual review",
  "provide a documentable overview without private raw data",
  "prevent export/report from becoming hidden sync, publish, or share behavior"
]);

includesAll(DOC_FILE, "allowed report content", [
  "compact readiness state", "compact audit status", "blocker count", "warning count",
  "top blocker titles", "top warning titles", "compact operator next step",
  "compact Meta Insights recommendation summary", "compact Chat readiness summary",
  "timestamp for last cached audit", "manual review required", "safe status labels",
  "redacted summary text", "local-only report metadata"
]);

includesAll(DOC_FILE, "forbidden report content", [
  "raw audit payload", "full private corpus", "full memory dump", "full chat history",
  "raw source content", "raw retrieval index", "raw approved examples", "raw consent metadata",
  "unredacted recommendation evidence", "hidden prompt payload with private data",
  "secrets, tokens, API keys", "raw user identifiers beyond safe display labels",
  "private source URLs unless explicitly redacted and approved", "unredacted email addresses"
]);

includesAll(DOC_FILE, "forbidden report behavior", [
  "run audit automatically", "write `localStorage`", "write domain data", "write remote data",
  "write Supabase/database data", "trigger Sync Hub", "trigger manual sync", "trigger auto-sync",
  "publish AHAavisa", "post or share in Groups", "send source events", "send publish/share events",
  "perform background sync", "create tasks or automation without explicit action",
  "start download/export without explicit user action", "send the report to a network, email, or external service"
]);

includesAll(DOC_FILE, "report states", [
  "### A. `ready`", "cached compact summaries exist", "no blockers exist",
  "report can be generated locally after explicit user action",
  "### B. `attention_needed`", "warnings exist", "no fatal blockers exist",
  "report can be generated with a clear manual next step",
  "### C. `blocked`", "one or more blockers exist", "missing consent", "material", "retrieval index", "audit summary",
  "compact blocked reason", "must not auto-fix",
  "### D. `unknown`", "cached summary is missing", "cached summary is invalid", "fail-closed", "manual audit/review required"
]);

includesAll(DOC_FILE, "fail closed", [
  "cached summary is missing or invalid", "report shows `unknown` or `blocked`",
  "report shows a manual next step", "report does not run audit", "report does not write data",
  "report does not trigger sync", "report does not show raw payload", "report may point to Training Dashboard/operator review"
]);

includesAll(DOC_FILE, "Chat readiness relationship", [
  "Chat readiness is a runtime status surface", "Export/report is an explicit local report surface",
  "Both surfaces use compact/redacted summaries", "report may refer to Chat readiness state",
  "must not use Chat prompts or raw conversations as export content", "must not inject private data into Chat prompts"
]);

includesAll(DOC_FILE, "Meta Insights relationship", [
  "compact/redacted Meta Insights recommendation summary", "severity counts, top titles, and next step",
  "must not include raw Meta Insights prompt or context", "must not include raw evidence", "must not perform writeback"
]);

includesAll(DOC_FILE, "Training relationship", [
  "Training Dashboard is the primary operator surface", "report may point to the Training Dashboard for manual review",
  "must not take over the audit-run UI", "must not auto-run audit when Training status is missing"
]);

includesAll(DOC_FILE, "Sync Hub relationship", [
  "Export/report surface is not Sync Hub", "Export/report must not trigger Sync Hub",
  "Sync Hub execution remains **NO-GO**", "`sync.html` remains outside this workstream",
  "Auto-sync remains **permanently forbidden**"
]);

includesAll(DOC_FILE, "AHAavisa Groups relationship", [
  "publish AHAavisa", "post or share in Groups", "generate social sharing events",
  "future export is local and explicit-user-action only", "Sharing or publishing requires its own documentation review and test-lock before implementation"
]);

includesAll(DOC_FILE, "required gates", [
  "docs review merged", "test-lock PR merged", "read-only boundary tests green", "privacy/operator visibility tests green",
  "next activation surface tests green", "operator recommendations tests green", "Chat readiness tests green",
  "Meta Insights recommendation tests green", "no automatic audit run", "no raw export payload", "no domain write",
  "no remote write", "no Sync Hub trigger", "no auto-sync", "no publish/share/source events",
  "compact/redacted output only", "local-only explicit action only", "`npm test` green", "`git diff --check` green",
  "implementation PR has its own specific behavior test"
]);

includesAll(DOC_FILE, "future PR sequence", [
  "1. `test: lock Personal AI Loop export/report surface`",
  "2. `feat: add Personal AI Loop local readiness report`",
  "3. `test: lock Personal AI Loop local readiness report behavior`",
  "4. `docs: review Personal AI Loop source approval surface`",
  "5. `test: lock Personal AI Loop source approval surface`"
]);

includesAll(STATUS_FILE, "implementation status", [
  "Personal AI Loop export/report surface: reviewed", "Personal AI Loop export/report surface: test-locked",
  "Allowed compact/redacted local report content: documented", "Forbidden raw/private export payload: documented",
  "No-auto-run/no-write/no-sync/no-publish/share: documented",
  "Relationship to Chat readiness / Meta Insights / Training / Sync Hub: documented",
  "Required gates before implementation: documented", "Sync Hub execution: NO-GO", "Auto-sync: permanently forbidden",
  "feat: add Personal AI Loop local readiness report"
]);

const js = combinedJs();
for (const forbidden of [
  /exportReport|reportExport|generateReport|downloadReport|personalAiLoopReport/i,
  /AHAPersonalAiLoopAudit[\s\S]{0,160}runAudit[\s\S]{0,160}(?:load|render|init|ready|report|export)/i,
  /rawAuditPayload|auditPayload|privateCorpus|memoryDump|chatHistory|rawRetrievalIndex/i,
  /\bfetch\s*\([^)]*(?:report|export)/i, /\bXMLHttpRequest\b[\s\S]{0,120}(?:report|export)/i, /sendBeacon[\s\S]{0,120}(?:report|export)/i,
  /supabase\s*\.[\s\S]{0,160}(?:report|export|insert|update|upsert|delete)/i,
  /\.(?:insert|update|upsert|delete)\s*\([\s\S]{0,120}(?:report|export)/i,
  /(?:executeSync|runSync|performSync|startSync|manualSync|autoSync|auto-sync)[\s\S]{0,160}(?:report|export)/i,
  /(?:publishAHAavisa|shareToGroups|backgroundSync)[\s\S]{0,160}(?:report|export)/i,
  /dispatchEvent\s*\([^)]*(?:sync|publish|share|source)[^)]*(?:report|export)/i,
  /localStorage\.(?:setItem|removeItem|clear)\s*\([\s\S]{0,120}(?:report|export)/i
]) {
  assert.equal(forbidden.test(js), false, `Export/report runtime boundary must not contain forbidden pattern ${forbidden}`);
}

for (const line of matchingLines(js, /report|export/i)) {
  assert.equal(/setItem|removeItem|clear\(|fetch\(|XMLHttpRequest|sendBeacon|supabase\.|\.insert\(|\.update\(|\.upsert\(|\.delete\(|SyncHub|manualSync|autoSync|publish|share|source event/i.test(line), false, `report/export line must not write/sync/publish/share: ${line}`);
}

assert.equal(fs.existsSync("sync.html"), false, "sync.html must still not exist");
matchesAll(STATUS_FILE, "Sync Hub safety", [/Sync Hub execution:\s*NO-GO/, /Auto-sync:\s*permanently forbidden/]);
assert.equal(/import.*sync|SyncHub|executeSync|runSync|performSync|startSync/.test(read(DOC_FILE)), false, "Export/report surface doc must not import/call Sync Hub execution");
const home = read(HOME_FILE);
for (const moduleFile of ["js/ahaLists.js", "js/ahaPaths.js", "js/ahaGroups.js", "js/ahaAvisa.js"]) {
  assert.equal(home.includes(moduleFile), false, `Home/module boundary must not load ${moduleFile}`);
}

console.log("aha-personal-ai-loop-export-report-surface.test.cjs passed");
