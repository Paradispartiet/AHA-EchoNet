const assert = require("assert");
const fs = require("fs");

const DOC_FILE = "docs/AHA_PERSONAL_AI_LOOP_CHAT_READINESS_SURFACE.md";
const STATUS_FILE = "docs/AHA_IMPLEMENTATION_STATUS.md";
const CHAT_FILE = "js/ahaChat.js";
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
  "next activation surface is test-locked",
  "Operator recommendations UX is reviewed",
  "test-locked by `tests/aha-personal-ai-loop-operator-recommendations-ux.test.cjs`",
  "Operator recommendations behavior is test-locked",
  "Audit run is **explicit-action only**",
  "Chat must not run audit automatically",
  "Chat must not write audit data or domain data",
  "Chat must not trigger Sync Hub",
  "Chat must not trigger auto-sync",
  "Chat must not publish, share",
  "Chat must not inject raw audit payload into the chat prompt"
]);

includesAll(DOC_FILE, "purpose", [
  "show whether Personal AI Loop is ready for use in chat",
  "explain why personal context is ready, partially ready, blocked, or unknown",
  "provide short, safe, manual next steps",
  "show blockers and warnings without leaking private data",
  "make readiness understandable to the user/operator",
  "prevent Chat from behaving like an execution, write, sync, publish, or share surface"
]);

includesAll(DOC_FILE, "allowed display", [
  "compact readiness status", "`ready`, `partially_ready`, `blocked`, or `unknown`",
  "blocker count", "warning count", "top blocker titles", "top warning titles",
  "one compact operator next step", "last audit status", "cached summary",
  "needs manual audit/review", "Training Dashboard/operator surface",
  "redacted/compact Personal AI Loop readiness"
]);

includesAll(DOC_FILE, "forbidden display", [
  "raw audit payload", "full private corpus", "full memory dump", "full chat history",
  "secrets, tokens, API keys", "raw source content", "unredacted recommendation evidence",
  "raw retrieval index", "raw approved examples", "raw consent metadata",
  "hidden prompt payload", "hidden system prompt injection with private data"
]);

includesAll(DOC_FILE, "forbidden behavior", [
  "run audit automatically on page load", "run audit automatically on render",
  "run audit automatically on chat message", "run audit automatically when the user opens Chat",
  "write `localStorage` outside", "write domain data", "write remote data",
  "write Supabase/database data", "refresh or persist a retrieval index automatically",
  "trigger Sync Hub", "trigger manual sync", "trigger auto-sync", "publish AHAavisa",
  "post or share in Groups", "send source events", "send publish/share events",
  "perform background sync"
]);

includesAll(DOC_FILE, "readiness states", [
  "### A. `ready`", "a cached audit summary exists", "approved/consented material is sufficient",
  "no blockers exist", "compact recommendation summary is available", "Chat can show a compact ready status",
  "### B. `partially_ready`", "warnings exist", "no fatal blockers exist", "Chat may show warnings",
  "### C. `blocked`", "missing consent", "insufficient approved material", "missing or unusable retrieval index",
  "missing audit summary", "Chat must explain why personal context is not ready", "Chat must not attempt auto-fix",
  "### D. `unknown`", "cached summary is missing", "cached summary is invalid", "Chat must fail closed",
  "manual audit/review is needed"
]);

includesAll(DOC_FILE, "fail closed", [
  "cached summary is missing or invalid", "Chat shows `unknown` or blocked readiness",
  "Chat shows a manual next step", "Chat does not run audit", "Chat does not write data",
  "Chat does not trigger sync", "Chat does not show raw payload",
  "Chat may point to Training Dashboard/operator review"
]);

includesAll(DOC_FILE, "operator recommendations relationship", [
  "Chat readiness may use compact output from operator recommendations",
  "show full recommendation objects as raw data", "use recommendation evidence as hidden prompt payload",
  "auto-handle recommendations", "start audit from recommendations", "status", "severity", "counts", "titles", "nextStep"
]);

includesAll(DOC_FILE, "Meta Insights relationship", [
  "Chat readiness and Meta Insights must both use compact/redacted summaries",
  "No raw private data may be sent to Meta Insights", "No raw private data may be injected into a chat prompt",
  "Neither Meta Insights nor Chat may execute audit", "Neither Meta Insights nor Chat may write back"
]);

includesAll(DOC_FILE, "Training relationship", [
  "Training Dashboard is the primary operator surface", "Chat is a secondary status surface",
  "Chat may point the user to the Training Dashboard", "Chat must not take over the audit-run UI",
  "Chat must not auto-run audit when Training status is missing"
]);

includesAll(DOC_FILE, "Sync Hub and publishing relationships", [
  "Chat readiness surface is not Sync Hub", "Chat readiness must not trigger Sync Hub",
  "Sync Hub execution remains **NO-GO**", "`sync.html` remains outside this workstream",
  "Auto-sync remains **permanently forbidden**", "publish AHAavisa", "post or share in Groups",
  "generate social sharing events", "manual local next steps"
]);

includesAll(DOC_FILE, "required gates", [
  "this docs review is merged", "`test: lock Personal AI Loop Chat readiness surface` is merged",
  "read-only boundary tests are green", "privacy/operator visibility tests are green",
  "next activation surface tests are green", "operator recommendations UX tests are green",
  "operator recommendations behavior tests are green", "no automatic audit run exists",
  "no raw audit payload is injected into the chat prompt", "no domain write exists", "no remote write exists",
  "no Sync Hub trigger exists", "no auto-sync exists", "no publish/share/source events exist",
  "compact/redacted output only is used", "`npm test` is green", "`git diff --check` is green",
  "implementation PR has its own specific behavior test"
]);

includesAll(DOC_FILE, "future PR sequence", [
  "1. `test: lock Personal AI Loop Chat readiness surface`",
  "2. `feat: add Personal AI Loop Chat readiness status`",
  "3. `test: lock Personal AI Loop Chat readiness behavior`",
  "4. `docs: review Personal AI Loop Meta Insights recommendation surface`",
  "5. `test: lock Personal AI Loop Meta Insights recommendation surface`"
]);

includesAll(STATUS_FILE, "implementation status", [
  "Personal AI Loop Chat readiness surface: reviewed",
  "Personal AI Loop Chat readiness surface: test-locked",
  "Chat allowed compact readiness/status: documented",
  "Chat forbidden raw payload/prompt injection: documented",
  "Chat no-auto-run/no-write/no-sync/no-publish: documented",
  "Relationship to Training / Meta Insights / Sync Hub: documented",
  "Required gates before implementation: documented",
  "Sync Hub execution: NO-GO", "Auto-sync: permanently forbidden",
  "feat: add Personal AI Loop Chat readiness status"
]);

const chatCode = read(CHAT_FILE);
const readinessFunction = extractFunction(chatCode, "renderAhaPersonalAiLoopStatus");
assert.ok(readinessFunction.includes("loadLastAudit"), "Chat status may only read cached audit summary");
for (const forbidden of [
  "runAudit", "setItem", "removeItem", "clear(", "fetch(", "XMLHttpRequest", "sendBeacon",
  "AHASyncHub", "manualSync", "autoSync", "publishAHAavisa", "shareToGroups", "supabase", ".insert(", ".upsert("
]) {
  assert.equal(readinessFunction.includes(forbidden), false, `Chat readiness function must not include ${forbidden}`);
}
assert.equal(/AHAPersonalAiLoopAudit[\s\S]{0,120}runAudit/.test(chatCode), false, "Chat must not call audit run API");
assert.equal(/aha_personal_ai_loop_audit_v1/.test(chatCode), false, "Chat must not directly read/write raw audit cache key");
assert.equal(/raw audit payload|full private corpus|full memory dump|full chat history|hidden system prompt/i.test(chatCode), false, "Chat must not expose raw private readiness payload labels");

assert.equal(fs.existsSync("sync.html"), false, "sync.html must still not exist");
matchesAll(STATUS_FILE, "Sync Hub safety", [/Sync Hub execution:\s*NO-GO/, /Auto-sync:\s*permanently forbidden/]);
assert.equal(/sync hub execution/i.test(chatCode), false, "Chat readiness must not import/call Sync Hub execution");
const home = read(HOME_FILE);
for (const moduleFile of ["js/ahaLists.js", "js/ahaPaths.js", "js/ahaGroups.js", "js/ahaAvisa.js"]) {
  assert.equal(home.includes(moduleFile), false, `Home must not weaken module boundary by loading ${moduleFile}`);
}

console.log("aha-personal-ai-loop-chat-readiness-surface.test.cjs passed");
