const assert = require("assert");
const fs = require("fs");

const DOC_FILE = "docs/AHA_PERSONAL_AI_LOOP_META_INSIGHTS_RECOMMENDATION_SURFACE.md";
const STATUS_FILE = "docs/AHA_IMPLEMENTATION_STATUS.md";
const META_FILE = "js/metaInsightsAgent.js";
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
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`could not extract ${name}`);
}

assert.ok(fs.existsSync(DOC_FILE), `${DOC_FILE} must exist`);

includesAll(DOC_FILE, "current locked state", [
  "Personal AI Loop Audit is **local-first**",
  "read-only boundary is test-locked",
  "Privacy/operator visibility is test-locked",
  "next activation surface is reviewed and test-locked",
  "Operator recommendations UX is reviewed",
  "Operator recommendations behavior is test-locked",
  "Chat readiness surface is reviewed",
  "Chat readiness behavior is test-locked",
  "Audit run is **explicit-action only**",
  "Meta Insights must not run audit automatically",
  "Meta Insights must not write audit data or domain data",
  "Meta Insights must not trigger Sync Hub",
  "Meta Insights must not trigger auto-sync",
  "Meta Insights must not publish or share",
  "Meta Insights must not use raw audit payload"
]);

includesAll(DOC_FILE, "purpose", [
  "provide safe, high-level insight about Personal AI Loop readiness",
  "use operator recommendations as a compact/redacted summary",
  "show readiness blockers and warnings without private details",
  "help the operator understand what must be done manually",
  "support Chat and Training status without taking over execution",
  "prevent Meta Insights from becoming hidden automation, sync, publish, share, or writeback infrastructure"
]);

includesAll(DOC_FILE, "allowed input", [
  "compact/redacted recommendation summary", "counts by severity", "top blocker titles",
  "top warning titles", "one compact operator next step", "compact Chat readiness state",
  "compact Chat readiness message", "last audit status from a cached summary",
  "manual review required flag", "redacted/compact Personal AI Loop readiness"
]);

includesAll(DOC_FILE, "forbidden input", [
  "raw audit payload", "full private corpus", "full memory dump", "full chat history",
  "raw source content", "raw retrieval index", "raw approved examples", "raw consent metadata",
  "unredacted recommendation evidence", "hidden prompt payload with private data",
  "secrets, tokens, API keys", "raw user identifiers beyond safe display labels"
]);

includesAll(DOC_FILE, "forbidden behavior", [
  "run audit automatically on page load", "run audit automatically on render",
  "run audit automatically when insights are built", "write `localStorage`", "write domain data",
  "write remote data", "write Supabase/database data", "refresh or persist a retrieval index automatically",
  "trigger Sync Hub", "trigger manual sync", "trigger auto-sync", "publish AHAavisa",
  "post or share in Groups", "send source events", "send publish/share events",
  "perform background sync", "create tasks or automation without explicit action"
]);

includesAll(DOC_FILE, "surface states", [
  "### A. `ready`", "compact recommendation summary exists", "no blockers exist",
  "Chat readiness is `ready` or a safe `partially_ready` state", "Meta Insights can show a compact ready insight",
  "### B. `attention_needed`", "warnings exist", "no fatal blockers exist", "manual next step",
  "### C. `blocked`", "missing consent", "missing approved material", "missing retrieval index",
  "missing audit summary", "Meta Insights must show a compact blocked insight", "must not auto-fix",
  "### D. `unknown`", "cached summary is missing", "cached summary is invalid", "Meta Insights must fail-closed",
  "manual audit/review"
]);

includesAll(DOC_FILE, "fail closed", [
  "cached summary is missing or invalid", "Meta Insights shows `unknown` or `blocked`",
  "Meta Insights shows a manual next step", "Meta Insights does not run audit",
  "Meta Insights does not write data", "Meta Insights does not trigger sync",
  "Meta Insights does not show raw payload", "Meta Insights may point to Training Dashboard/operator review"
]);

includesAll(DOC_FILE, "relationships", [
  "buildCompactOperatorRecommendationSummary", "must not use full recommendation objects as raw data",
  "counts, severity, titles, and `nextStep`", "must not use recommendation evidence as hidden prompt payload",
  "must not auto-handle recommendations", "must not start audit from recommendations",
  "Chat readiness and Meta Insights must both use compact/redacted summaries",
  "Chat readiness is a user/status surface", "Meta Insights is a high-level insight/status surface",
  "No raw private data may be injected into Chat prompts", "No raw private data may be injected into Meta Insights prompts or context",
  "Chat must not execute audit", "Meta Insights must not execute audit", "must not write back",
  "Training Dashboard is the primary operator surface", "Meta Insights is a secondary summary/insight surface",
  "Meta Insights may point the operator to the Training Dashboard", "must not take over the audit-run UI",
  "must not auto-run audit when Training status is missing"
]);

includesAll(DOC_FILE, "sync publish relationships", [
  "Meta Insights recommendation surface is not Sync Hub", "Meta Insights must not trigger Sync Hub",
  "Sync Hub execution remains **NO-GO**", "`sync.html` remains outside this workstream",
  "Auto-sync remains **permanently forbidden**", "publish AHAavisa", "post or share in Groups",
  "generate social sharing events", "manual local next steps"
]);

includesAll(DOC_FILE, "required gates", [
  "docs review must be merged", "test-lock PR must be merged", "read-only boundary tests must be green",
  "privacy/operator visibility tests must be green", "next activation surface tests must be green",
  "operator recommendations UX tests must be green", "operator recommendations behavior tests must be green",
  "Chat readiness surface tests must be green", "Chat readiness behavior tests must be green",
  "no automatic audit run", "no raw audit payload in Meta Insights", "no raw audit payload in Chat prompt",
  "no domain write", "no remote write", "no Sync Hub trigger", "no auto-sync",
  "no publish/share/source events", "compact/redacted output only", "`npm test` must be green",
  "`git diff --check` must be green", "implementation PR must have its own specific behavior test"
]);

includesAll(DOC_FILE, "future PR sequence", [
  "1. `test: lock Personal AI Loop Meta Insights recommendation surface`",
  "2. `feat: add Personal AI Loop Meta Insights recommendation summary`",
  "3. `test: lock Personal AI Loop Meta Insights recommendation behavior`",
  "4. `docs: review Personal AI Loop export/report surface`",
  "5. `test: lock Personal AI Loop export/report surface`"
]);

includesAll(STATUS_FILE, "implementation status", [
  "Personal AI Loop Meta Insights recommendation surface: reviewed",
  "Personal AI Loop Meta Insights recommendation surface: test-locked",
  "Allowed compact/redacted recommendation summary: documented",
  "Forbidden raw payload/private context/prompt injection: documented",
  "No-auto-run/no-write/no-sync/no-publish: documented",
  "Relationship to operator recommendations / Chat readiness / Training / Sync Hub: documented",
  "Required gates before implementation: documented",
  "Sync Hub execution: NO-GO", "Auto-sync: permanently forbidden",
  "feat: add Personal AI Loop Meta Insights recommendation summary"
]);

const metaCode = read(META_FILE);
const personalAiLoopPack = extractFunction(metaCode, "buildPersonalAiLoopPackSafe");
assert.match(personalAiLoopPack, /loadLastAudit/);
assert.match(personalAiLoopPack, /buildCompactOperatorRecommendationSummary/);
assert.match(personalAiLoopPack, /recommendations: recommendationSummary/);
for (const forbidden of [
  "runAudit", "rawPayload", "auditPayload", "privateCorpus", "memoryDump", "chatHistory",
  "setItem", "removeItem", "clear(", "fetch(", "XMLHttpRequest", "sendBeacon", "supabase",
  ".insert(", ".upsert(", ".update(", ".delete(", "AHASyncHub", "manualSync", "autoSync",
  "publishAHAavisa", "shareToGroups", "dispatchEvent", "refreshRetrievalIndex", "buildRetrievalIndex",
  "backgroundSync"
]) {
  assert.equal(personalAiLoopPack.includes(forbidden), false, `Meta Insights recommendation pack must not include ${forbidden}`);
}

for (const forbidden of [
  /AHAPersonalAiLoopAudit[\s\S]{0,160}runAudit/, /raw audit payload|full private corpus|full memory dump|full chat history/i,
  /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /sendBeacon/, /supabase\s*\./i,
  /\.(?:insert|update|upsert|delete)\s*\(/, /executeSync|runSync|performSync|startSync|autoSync|auto-sync/i,
  /dispatchEvent\s*\([^)]*(?:sync|publish|share|source)/i, /publishAHAavisa|shareToGroups|backgroundSync/i
]) {
  assert.equal(forbidden.test(metaCode), false, `Meta Insights must not contain forbidden boundary pattern ${forbidden}`);
}

assert.equal(fs.existsSync("sync.html"), false, "sync.html must still not exist");
matchesAll(STATUS_FILE, "Sync Hub safety", [/Sync Hub execution:\s*NO-GO/, /Auto-sync:\s*permanently forbidden/]);
assert.equal(/import.*sync|SyncHub|executeSync|runSync|performSync|startSync/.test(personalAiLoopPack), false, "Meta Insights recommendation surface must not import/call Sync Hub execution");
const home = read(HOME_FILE);
for (const moduleFile of ["js/ahaLists.js", "js/ahaPaths.js", "js/ahaGroups.js", "js/ahaAvisa.js"]) {
  assert.equal(home.includes(moduleFile), false, `Home/module boundary must not load ${moduleFile}`);
}

console.log("aha-personal-ai-loop-meta-insights-recommendation-surface.test.cjs passed");
