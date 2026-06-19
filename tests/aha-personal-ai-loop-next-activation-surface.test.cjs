const assert = require("assert");
const fs = require("fs");

const DOC_FILE = "docs/AHA_PERSONAL_AI_LOOP_AUDIT_NEXT_ACTIVATION_SURFACE.md";
const STATUS_FILE = "docs/AHA_IMPLEMENTATION_STATUS.md";

function read(file) { return fs.readFileSync(file, "utf8"); }
function lower(value) { return value.toLowerCase(); }
function includesAll(file, label, terms) {
  const text = lower(read(file));
  for (const term of terms) assert.ok(text.includes(lower(term)), `${label}: missing ${term}`);
}
function matchesAll(file, label, patterns) {
  const text = read(file);
  for (const pattern of patterns) assert.match(text, pattern, `${label}: missing ${pattern}`);
}

// 1. The next activation surface review exists.
assert.ok(fs.existsSync(DOC_FILE), `${DOC_FILE} must exist`);

// 2. Current locked state is documented.
includesAll(DOC_FILE, "current locked state", [
  "end-to-end implemented",
  "read-only boundary test-locked",
  "privacy/operator visibility test-locked",
  "local-first",
  "approved/consented material-only",
  "compact/redacted for Meta Insights",
  "explicit-action only",
  "not automatic",
  "not a domain source-of-truth",
  "not a Sync Hub surface"
]);

// 3. Activation surface definition is locked.
includesAll(DOC_FILE, "activation surface definition", [
  "An **activation surface** is a safe point",
  "change read-only or domain boundaries",
  "create automatic writes",
  "create remote writes",
  "trigger Sync Hub",
  "publish or socially share content",
  "introduce hidden source events"
]);

// 4. Allowed next surfaces are documented and constrained.
includesAll(DOC_FILE, "operator review surface", [
  "Operator review surface",
  "better explanation of audit status",
  "clearer warnings",
  "clearer “why not ready” explanations",
  "better next-step recommendations",
  "continued use of cached summary only",
  "continued prohibition on domain writes"
]);
includesAll(DOC_FILE, "Training Dashboard surface", [
  "Training Dashboard surface",
  "better visual status",
  "grouped warnings",
  "a manual refresh button",
  "no auto-run",
  "no auto-index-build",
  "no remote or domain write"
]);
includesAll(DOC_FILE, "Chat context surface", [
  "Chat context surface",
  "ready or not ready",
  "automatically inject the raw audit payload",
  "hide audit results inside a prompt",
  "compact status unless a later reviewed design explicitly allows it"
]);
includesAll(DOC_FILE, "Meta Insights surface", [
  "Meta Insights surface",
  "compact `personalAiLoopPack`",
  "counts",
  "status",
  "recommendations",
  "raw corpus",
  "memory",
  "chat history",
  "secret-bearing values",
  "Agent context building must not trigger audit execution"
]);
includesAll(DOC_FILE, "Export/report surface", [
  "Export/report surface",
  "local/manual export or report surface",
  "requires explicit user action",
  "does not include raw secrets",
  "does not include the full private corpus by default",
  "does not publish automatically"
]);

// 5. Forbidden activation surfaces are documented.
includesAll(DOC_FILE, "forbidden activation surfaces", [
  "automatic audit on page load",
  "automatic audit on render",
  "automatic audit on chat message",
  "automatic retrieval-index refresh or persist",
  "automatic Supabase/database write",
  "background sync",
  "Sync Hub execution",
  "auto-sync",
  "source events",
  "publishing",
  "social sharing",
  "full raw payload exposure",
  "full chat history exposure",
  "full corpus dump in Meta Insights",
  "full memory dump in Meta Insights",
  "secret, token, or API key exposure"
]);

// 6. Required gates before implementation are documented.
includesAll(DOC_FILE, "required gates", [
  "read-only boundary tests remain green",
  "privacy/operator visibility tests remain green",
  "no automatic audit run is introduced",
  "no domain data write is introduced",
  "no remote write is introduced",
  "no Sync Hub trigger is introduced",
  "no auto-sync is introduced",
  "compact pack remains redacted",
  "localStorage key remains limited to `aha_personal_ai_loop_audit_v1`",
  "`npm test` is green",
  "the new implementation has its own specific test"
]);

// 7. Future PR sequence is documented in the safe order.
includesAll(DOC_FILE, "future PR sequence", [
  "1. `test: lock Personal AI Loop audit next activation surface`",
  "2. `docs: review Personal AI Loop operator recommendations UX`",
  "3. `test: lock Personal AI Loop operator recommendations UX`",
  "4. `feat: improve Personal AI Loop operator recommendations`",
  "5. `test: lock Personal AI Loop operator recommendations behavior`"
]);

// 8-11. Relationships to Sync Hub, Meta Insights, Chat, and Training are locked.
includesAll(DOC_FILE, "Sync Hub relationship", [
  "Personal AI Loop Audit is not Sync Hub",
  "Personal AI Loop Audit must not trigger Sync Hub",
  "Sync Hub execution remains **NO-GO**",
  "`sync.html` remains outside this workstream",
  "Auto-sync remains **permanently forbidden**"
]);
includesAll(DOC_FILE, "Meta Insights relationship", [
  "Meta Insights may receive a compact summary only",
  "cannot receive raw private data",
  "cannot run the audit",
  "cannot write audit results",
  "cannot refresh or persist a retrieval index"
]);
includesAll(DOC_FILE, "Chat relationship", [
  "Chat may show compact readiness/status",
  "Chat must not run the audit automatically",
  "Chat must not mutate audit data or domain data",
  "Chat must not inject the raw audit payload into a prompt",
  "Chat must not trigger sync, publish, or share flows"
]);
includesAll(DOC_FILE, "Training relationship", [
  "Training Dashboard may remain the primary operator surface",
  "Audit run must remain an explicit user action",
  "Render must read cached summary only",
  "There must be no auto-run",
  "There must be no auto-index build",
  "There must be no remote write or domain write"
]);

// 12. Implementation status is narrowly updated.
includesAll(STATUS_FILE, "implementation status", [
  "next activation surface: reviewed",
  "next activation surface: test-locked",
  "allowed future surfaces: documented",
  "forbidden surfaces: documented",
  "gates before implementation: documented",
  "Sync Hub execution: NO-GO",
  "Auto-sync: permanently forbidden",
  "docs: review Personal AI Loop operator recommendations UX"
]);

// 13. Sync Hub remains safe and Home/module boundaries are not weakened.
assert.equal(fs.existsSync("sync.html"), false, "sync.html must still not exist");
matchesAll(STATUS_FILE, "Sync Hub safety", [
  /Sync Hub execution:\s*NO-GO|Execution:\s*NO-GO/,
  /Auto-sync:\s*permanently forbidden|auto-sync er permanent forbudt/i
]);
{
  const home = read("index.html");
  for (const moduleFile of ["js/ahaLists.js", "js/ahaPaths.js", "js/ahaGroups.js", "js/ahaAvisa.js"]) {
    assert.equal(home.includes(moduleFile), false, `Home must not load ${moduleFile}`);
  }
}

console.log("aha-personal-ai-loop-next-activation-surface.test.cjs passed");
