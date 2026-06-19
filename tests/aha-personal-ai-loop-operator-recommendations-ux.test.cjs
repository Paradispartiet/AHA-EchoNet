const assert = require("assert");
const fs = require("fs");

const DOC_FILE = "docs/AHA_PERSONAL_AI_LOOP_OPERATOR_RECOMMENDATIONS_UX.md";
const STATUS_FILE = "docs/AHA_IMPLEMENTATION_STATUS.md";
const AUDIT_KEY = "aha_personal_ai_loop_audit_v1";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function normalize(value) {
  return value.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
}

function assertIncludes(source, label, expected) {
  const normalized = normalize(source);
  for (const item of expected) {
    assert.ok(normalized.includes(normalize(item)), `${label} must include: ${item}`);
  }
}

function assertDocIncludes(label, expected) {
  assertIncludes(read(DOC_FILE), label, expected);
}

function assertStatusIncludes(label, expected) {
  assertIncludes(read(STATUS_FILE), label, expected);
}

assert.ok(fs.existsSync(DOC_FILE), "operator recommendations UX document must exist");

assertDocIncludes("current locked state", [
  "Personal AI Loop Audit is **local-first**",
  "read-only boundary is test-locked",
  "Privacy/operator visibility is test-locked",
  "next activation surface is reviewed and test-locked",
  "Audit run is **explicit-action only**",
  "Render paths read cached summary only",
  "Meta Insights receives a compact/redacted pack only",
  "Chat receives compact readiness/status only",
  "no domain writes",
  "no remote writes",
  "no Sync Hub trigger",
  "no auto-sync",
  "no publishing or social sharing"
]);

assertDocIncludes("UX goals", [
  "make audit results easier to understand",
  "explain why the system is ready or not ready",
  "provide clear, manual next steps",
  "distinguish between warning, blocker, and suggestion",
  "help the operator without automating actions",
  "make privacy/safety status visible",
  "never hide that something is blocked"
]);

assertDocIncludes("readiness recommendations", [
  "Readiness recommendations", "`ready`", "`partially ready`", "`blocked`", "`stale`",
  "`missing material`", "`missing consent`", "`missing retrieval index`"
]);
assertDocIncludes("privacy recommendations", [
  "Privacy recommendations", "`consent missing`", "`unapproved material found`", "`redaction needed`",
  "`raw payload must not be shown`", "`compact summary only`"
]);
assertDocIncludes("content quality recommendations", [
  "Content quality recommendations", "`too few approved corpus items`", "`too few approved examples`",
  "`too few confirmed/important memory claims`", "`weak source coverage`", "`stale training material`"
]);
assertDocIncludes("retrieval recommendations", [
  "Retrieval recommendations", "`retrieval index missing`", "`retrieval index stale`", "`sample query failed`",
  "`low explainability`", "`source mismatch`"
]);
assertDocIncludes("UX/operator recommendations", [
  "UX/operator recommendations", "`run audit manually`", "`review consent`", "`add approved examples`",
  "`confirm important memory`", "`refresh only through explicit future design`", "`review warnings before implementation`"
]);

assertDocIncludes("severity model", [
  "`ok`", "`info`", "`suggestion`", "`warning`", "`blocker`",
  "`blocker` must not be hidden", "`warning` must be visible",
  "`info` and `suggestion` must not trigger actions",
  "All severity levels must be operator-visible", "No severity level may start sync, write domain data, write remote data, publish"
]);

assertDocIncludes("plan-only object contract", [
  "review/plan only", "does not implement it", "id", "severity", "title", "message", "reason", "evidenceType",
  "relatedSurface", "allowedNextStep", "forbiddenAutomation", "privacyRisk", "requiresExplicitAction"
]);

assertDocIncludes("allowed UX behavior", [
  "show compact readiness", "show grouped recommendations", "show warning/blocker badges", "show manual next steps",
  "show a why-not-ready explanation", "show counts/status", "show stale/missing index warnings",
  "show consent/material warnings", "link to relevant local operator sections", "use cached audit summary",
  "require explicit user action for audit run"
]);

assertDocIncludes("forbidden UX behavior", [
  "run audit automatically on page load", "run audit automatically on render", "run audit automatically on chat message",
  "write domain data", "write remote data", "write Supabase/database data", "refresh or persist a retrieval index automatically",
  "trigger Sync Hub", "trigger auto-sync", "publish", "share socially", "send source events",
  "show full raw payload by default", "show full private corpus by default", "show full memory dump", "show full chat history",
  "send raw private data to Meta Insights", "inject raw audit payload into a chat prompt"
]);

assertDocIncludes("Training Dashboard rules", [
  "Training Dashboard is the primary operator surface", "show grouped recommendations", "show a manual audit button",
  "auto-run audit", "auto-build or auto-refresh a retrieval index", "write domain data", "trigger Sync Hub"
]);
assertDocIncludes("Chat rules", [
  "Chat may", "show compact readiness/status", "explain that personal context is not ready", "run audit automatically",
  "inject raw audit payload", "mutate audit data", "mutate domain data", "trigger sync", "trigger publish", "trigger share"
]);
assertDocIncludes("Meta Insights rules", [
  "compact recommendation summary only", "status", "counts", "severity", "recommendations", "warnings",
  "raw corpus", "raw memory", "full chat history", "secrets", "tokens", "API keys", "run audit", "write audit results"
]);
assertDocIncludes("Export/report rules", [
  "local/manual only", "explicit user action", "redacted by default", "automatic publishing", "social sharing"
]);

for (const failure of [
  "Missing audit API", "Missing cached summary", "Missing consent", "Missing approved corpus", "Missing approved examples",
  "Missing confirmed/important memory", "Stale retrieval index", "Failed sample query", "Unknown audit status",
  "Privacy warning", "Redaction warning"
]) {
  assertDocIncludes(`failure mode ${failure}`, [failure]);
}
assertDocIncludes("fail-closed behavior", [
  "operator-visible", "fail-closed", "no write", "no sync", "no auto-fix", "no publish", "manual next step"
]);

assertDocIncludes("required gates", [
  "docs review merged", "test-lock PR merged", "read-only boundary tests green", "privacy/operator visibility tests green",
  "next activation surface tests green", "new UX behavior has specific tests", "no automatic audit run", "no domain write",
  "no remote write", "no Sync Hub trigger", "no auto-sync", "compact pack remains redacted",
  `\`${AUDIT_KEY}\` remains the only audit cache key`, "`npm test` green", "`git diff --check` green"
]);

assertDocIncludes("future PR sequence", [
  "`test: lock Personal AI Loop operator recommendations UX`",
  "`feat: improve Personal AI Loop operator recommendations`",
  "`test: lock Personal AI Loop operator recommendations behavior`",
  "`docs: review Personal AI Loop Chat readiness surface`",
  "`test: lock Personal AI Loop Chat readiness surface`"
]);

assertDocIncludes("Sync Hub relationship", [
  "Operator recommendations are not Sync Hub", "Operator recommendations must not trigger Sync Hub",
  "Sync Hub execution remains **NO-GO**", "`sync.html` remains outside this workstream",
  "Auto-sync remains **permanently forbidden**"
]);
assertDocIncludes("AHAavisa and Groups relationship", [
  "Recommendations must not publish AHAavisa", "Recommendations must not post or share in Groups",
  "Recommendations must not generate social sharing events", "Recommendations may only suggest manual local next steps"
]);

assertStatusIncludes("status document", [
  "Personal AI Loop operator recommendations UX: reviewed", "Personal AI Loop operator recommendations UX: test-locked",
  "Recommendation categories: documented", "Severity model: documented", "Allowed/forbidden UX behavior: documented",
  "Surface-specific UX rules: documented", "Required gates before implementation: documented",
  "Sync Hub execution: NO-GO", "Auto-sync: permanently forbidden",
  "feat: improve Personal AI Loop operator recommendations"
]);

assert.equal(fs.existsSync("sync.html"), false, "sync.html must still not exist");
assertStatusIncludes("Sync Hub safety", ["Sync Hub execution: NO-GO", "Auto-sync: permanently forbidden"]);
const home = read("index.html");
for (const moduleFile of ["js/ahaLists.js", "js/ahaPaths.js", "js/ahaGroups.js", "js/ahaAvisa.js"]) {
  assert.equal(home.includes(moduleFile), false, `Home/module boundary must not load ${moduleFile}`);
}

console.log("aha-personal-ai-loop-operator-recommendations-ux.test.cjs passed");
