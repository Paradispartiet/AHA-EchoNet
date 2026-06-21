const assert = require("assert");
const fs = require("fs");

const DOC_FILE = "docs/AHA_PERSONAL_AI_LOOP_SOURCE_APPROVAL_SURFACE.md";
const STATUS_FILE = "docs/AHA_IMPLEMENTATION_STATUS.md";
const JS_FILES = [
  "js/ahaPersonalAiLoopAudit.js",
  "js/ahaTrainingDashboard.js",
  "js/ahaChat.js",
  "js/metaInsightsAgent.js"
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
  "Export/report surface and behavior are reviewed", "test-locked",
  "Audit run is **explicit-action only**",
  "Source approval must be **explicit-action only**",
  "Source approval must not run audit automatically",
  "Source approval must not write data",
  "Source approval must not trigger Sync Hub",
  "Source approval must not trigger auto-sync",
  "Source approval must not publish or share",
  "Source approval must not expose raw private source content"
]);

includesAll(DOC_FILE, "purpose", [
  "give the operator a safe way to review suggested sources",
  "distinguish between `suggested`, `review_needed`, `approved`, `rejected`, `blocked`, and `unknown`",
  "prevent private or raw sources from being used in training or audit without explicit approval",
  "prevent source approval from becoming hidden ingestion, sync, or publishing",
  "support future manual source approval",
  "keep Personal AI Loop local-first and privacy-safe"
]);

includesAll(DOC_FILE, "allowed source approval content", [
  "compact source title", "redacted source label", "source type/category",
  "short redacted reason", "approval state", "risk level", "manual next step",
  "linked readiness blocker/warning title", "timestamp for local suggestion/review",
  "operator-visible safe summary", "local-only metadata"
]);

includesAll(DOC_FILE, "forbidden source approval content", [
  "raw source content", "full private corpus", "full memory dump", "full chat history",
  "raw retrieval index", "raw approved examples", "raw consent metadata",
  "secrets, tokens, or API keys", "private source URLs unless explicitly redacted or approved",
  "unredacted email addresses", "hidden prompt payload with private source data",
  "raw audit payload", "unredacted recommendation evidence"
]);

includesAll(DOC_FILE, "forbidden source approval behavior", [
  "approve sources automatically", "import sources automatically", "run audit automatically",
  "write `localStorage` in the review phase", "write domain data", "write remote data",
  "write Supabase/database data", "trigger Sync Hub", "trigger manual sync", "trigger auto-sync",
  "publish AHAavisa", "post or share in Groups", "send source events", "send publish/share events",
  "perform background sync", "create tasks or automation without explicit action"
]);

includesAll(DOC_FILE, "source approval states", [
  "### A. `suggested`", "the source cannot be used as an approved source",
  "### B. `review_needed`", "the source needs manual operator review",
  "### C. `approved`", "the source is explicitly approved by the operator",
  "### D. `rejected`", "the source must not be used in audit or training",
  "### E. `blocked`", "the source cannot be approved until the blocker is resolved",
  "### F. `unknown`", "source state is missing or invalid", "fail closed", "manual review is required"
]);

includesAll(DOC_FILE, "fail closed", [
  "source state is missing or invalid", "surface shows `unknown` or `blocked`",
  "surface shows a manual next step", "surface does not approve the source",
  "surface does not import the source", "surface does not run audit", "surface does not write data",
  "surface does not trigger sync", "surface does not show raw source payload"
]);

includesAll(DOC_FILE, "relationships", [
  "Relationship to Training Dashboard", "Training Dashboard is the natural future operator surface", "auto-approve sources", "auto-import sources",
  "Relationship to audit", "Audit may point to missing or unapproved sources", "approve sources automatically", "import raw source content",
  "Relationship to Meta Insights", "Meta Insights may show compact count/status", "show raw source content",
  "Relationship to Chat readiness", "Chat may show a compact source approval blocker/status", "inject source content into a prompt",
  "Relationship to export/report", "Export/report may show compact source approval status/counts", "include raw source content",
  "Relationship to Sync Hub", "Sync Hub execution remains **NO-GO**",
  "Relationship to AHAavisa / Groups", "publish AHAavisa", "post or share in Groups"
]);

includesAll(DOC_FILE, "required gates", [
  "docs review merged", "test-lock PR merged", "read-only boundary tests green", "privacy/operator visibility tests green",
  "next activation surface tests green", "operator recommendations tests green", "Chat readiness tests green",
  "Meta Insights recommendation tests green", "export/report tests green", "no automatic source approval",
  "no raw source payload", "no source ingestion", "no audit auto-run", "no domain write", "no remote write",
  "no Sync Hub trigger", "no auto-sync", "no publish/share/source events", "compact/redacted output only",
  "local-only explicit action only", "`npm test` green", "`git diff --check` green",
  "implementation PR has its own specific behavior test"
]);

includesAll(DOC_FILE, "future PR sequence", [
  "1. `test: lock Personal AI Loop source approval surface`",
  "2. `feat: add Personal AI Loop source approval summary`",
  "3. `test: lock Personal AI Loop source approval behavior`",
  "4. `docs: review Personal AI Loop manual audit action surface`",
  "5. `test: lock Personal AI Loop manual audit action surface`"
]);

includesAll(STATUS_FILE, "implementation status", [
  "Personal AI Loop source approval surface: reviewed", "Personal AI Loop source approval surface: test-locked",
  "Allowed compact/redacted source approval content: documented", "Forbidden raw source/private payload: documented",
  "No-auto-approval/no-ingestion/no-auto-run/no-write/no-sync/no-publish/share: documented",
  "Relationship to Training / Audit / Meta Insights / Chat / Export Report / Sync Hub: documented",
  "Required gates before implementation: documented", "Sync Hub execution: NO-GO", "Auto-sync: permanently forbidden",
  "feat: add Personal AI Loop source approval summary"
]);

const js = combinedJs();
for (const forbidden of [
  /sourceApproval|approvalState|approveSource|approvedSource|sourceIngestion|ingestSource|importSource/i,
  /rawSourceContent|privateCorpus|memoryDump|chatHistory|rawRetrievalIndex|rawConsentMetadata/i,
  /\bfetch\s*\([^)]*(?:source|approval)/i, /\bXMLHttpRequest\b[\s\S]{0,120}(?:source|approval)/i, /sendBeacon[\s\S]{0,120}(?:source|approval)/i,
  /supabase\s*\.[\s\S]{0,160}(?:source|approval|insert|update|upsert|delete)/i,
  /\.(?:insert|update|upsert|delete)\s*\([\s\S]{0,120}(?:source|approval)/i,
  /(?:executeSync|runSync|performSync|startSync|manualSync|autoSync|auto-sync)[\s\S]{0,160}(?:source|approval)/i,
  /(?:publishAHAavisa|shareToGroups|backgroundSync)[\s\S]{0,160}(?:source|approval)/i,
  /localStorage\.(?:setItem|removeItem|clear)\s*\([\s\S]{0,120}(?:sourceApproval|approvalState|approveSource)/i
]) {
  assert.equal(forbidden.test(js), false, `Source approval runtime boundary must not contain forbidden pattern ${forbidden}`);
}

for (const line of matchingLines(js, /source approval|sourceApproval|approveSource|approvalState|ingestSource|importSource/i)) {
  assert.equal(/setItem|removeItem|clear\(|fetch\(|XMLHttpRequest|sendBeacon|supabase\.|\.insert\(|\.update\(|\.upsert\(|\.delete\(|SyncHub|manualSync|autoSync|publish|share|dispatchEvent/i.test(line), false, `source approval line must not write/sync/publish/share: ${line}`);
}

assert.equal(fs.existsSync("sync.html"), false, "sync.html must still not exist");
matchesAll(STATUS_FILE, "Sync Hub safety", [/Sync Hub execution:\s*NO-GO/, /Auto-sync:\s*permanently forbidden/]);
assert.equal(/import\s+.*sync|executeSync|runSync|performSync|startSync/.test(read(DOC_FILE)), false, "Source approval surface doc must not import/call Sync Hub execution");
const home = read(HOME_FILE);
for (const moduleFile of ["js/ahaLists.js", "js/ahaPaths.js", "js/ahaGroups.js", "js/ahaAvisa.js"]) {
  assert.equal(home.includes(moduleFile), false, `Home/module boundary must not load ${moduleFile}`);
}

console.log("aha-personal-ai-loop-source-approval-surface.test.cjs passed");
