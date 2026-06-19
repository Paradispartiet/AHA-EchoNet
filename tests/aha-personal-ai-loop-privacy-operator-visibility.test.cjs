const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const DOC_FILE = "docs/AHA_PERSONAL_AI_LOOP_AUDIT_PRIVACY_OPERATOR_VISIBILITY.md";
const STATUS_FILE = "docs/AHA_IMPLEMENTATION_STATUS.md";
const AUDIT_FILE = "js/ahaPersonalAiLoopAudit.js";
const TRAINING_FILE = "js/ahaTrainingDashboard.js";
const CHAT_FILE = "js/ahaChat.js";
const META_FILE = "js/metaInsightsAgent.js";
const AUDIT_KEY = "aha_personal_ai_loop_audit_v1";

function read(file) { return fs.readFileSync(file, "utf8"); }
function lower(text) { return text.toLowerCase(); }
function assertDocIncludes(label, terms) {
  const text = lower(read(DOC_FILE));
  for (const term of terms) assert.ok(text.includes(lower(term)), `${label}: missing ${term}`);
}
function assertStatusIncludes(label, terms) {
  const text = lower(read(STATUS_FILE));
  for (const term of terms) assert.ok(text.includes(lower(term)), `${label}: missing ${term}`);
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
function makeContext() {
  const context = { console, Date, Math, JSON, localStorage: { getItem: () => null, setItem: () => assert.fail("pack build must not write"), removeItem: () => assert.fail("pack build must not remove") } };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  return context;
}

// A. Privacy review document exists and contains the expected review structure.
assert.ok(fs.existsSync(DOC_FILE), "privacy/operator visibility review document must exist");
assertDocIncludes("review sections", [
  "current decision", "approved material boundary", "operator visibility", "Training UI boundary",
  "Chat UI boundary", "Meta Insights boundary", "localStorage", "cache boundary", "failure modes",
  "security and no-go list", "test coverage", "required before next implementation", "next recommended PR"
]);

// B. Current decision is locked.
assertDocIncludes("current decision", [
  "local-first", "read-only against domain data", "must not mutate", AUDIT_KEY,
  "must not perform Supabase or other database writes", "must not trigger Sync Hub",
  "manual sync", "auto-sync", "must not publish content", "social sharing"
]);

// C. Approved/forbidden material boundary.
assertDocIncludes("allowed material", [
  "confirmed memory claims", "important memory claims", "approved corpus where `consent.useforknowledge === true` or `consent.useformemory === true`",
  "approved training examples"
]);
assertDocIncludes("forbidden material", [
  "draft or rejected corpus", "corpus without knowledge or memory consent", "draft or rejected training examples",
  "unconfirmed memory claims unless", "raw `localstorage` dump", "full chat history",
  "secrets", "tokens", "passwords", "API keys", "connection strings"
]);

// D. Operator visibility boundary.
assertDocIncludes("operator may see", [
  "audit status", "audit score", "approved corpus count", "approved training example count",
  "memory claim count", "indexed item count", "sample-query status", "recommendations",
  "privacy warnings", "stale or missing retrieval index warning", "missing consent warning", "missing approved material warning"
]);
assertDocIncludes("operator must not see", [
  "full raw payloads", "full corpus body by default", "full memory raw dump", "full chat history",
  "credentials or secrets", "hidden source events", "hidden sync results"
]);

// E-G. UI/agent boundaries.
assertDocIncludes("Training UI", [
  "explicit user action", "cached summary only", "must not build or refresh a retrieval index",
  "must not run the audit automatically", "must not write domain data", "must not perform a remote write", "must not trigger Sync Hub"
]);
assertDocIncludes("Chat UI", [
  "compact status", "cached audit summary", "must not run the audit automatically", "must not write audit data or domain data",
  "must not trigger retrieval build, refresh, or persistence", "must not include the full audit raw payload"
]);
assertDocIncludes("Meta Insights", [
  "compact, redacted `personalAiLoopPack`", "status", "counts", "recommendations", "readiness signals",
  "raw corpus text", "raw memory dump", "full chat history", "credentials", "secrets", "tokens",
  "cached summary or another safe, read-only status", "must not run an audit", "write audit/domain data", "build or refresh an index", "trigger sync"
]);

// H. LocalStorage/cache boundary.
assertDocIncludes("cache contract", [
  `Allowed key: \`${AUDIT_KEY}\``, "last audit summary only", "not a source-of-truth domain store",
  "must not call `removeitem` or `clear`", "must not write other domain keys", "must not persist a retrieval index",
  "must not mutate chat history", "must not mutate Sync Hub audit or history state"
]);

// I. Failure modes are fail-closed and manual.
assertDocIncludes("failure modes", [
  "Missing audit API", "Missing personal context API", "Missing retrieval API", "Missing approved corpus",
  "Missing approved examples", "Missing confirmed/important memory", "Missing retrieval index", "Stale retrieval index",
  "Disallowed or unconsented material found", "Redaction/privacy warning", "Unknown status",
  "operator-visible", "No write, no auto-fix, no sync, no publish", "Recommended manual next step"
]);

// J. Security/no-go list.
assertDocIncludes("no-go list", [
  "supabase.from", ".insert", ".upsert", ".delete", ".update", "fetch", "XMLHttpRequest", "sendBeacon",
  "AHARepository.save", "AHARepository.load", "syncFromDatabase", "executeSync", "runSync", "performSync", "startSync",
  "rollback", "source events", "create insights automatically", "publish", "share", "timers or intervals for auto-audit"
]);

// K. Runtime static enforcement for the audit/privacy path.
const forbiddenStatic = [
  /\bsupabase\s*\.\s*from/i, /\.(?:insert|upsert|delete|update)\s*\(/, /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/, /\bnavigator\s*\.\s*sendBeacon\b/, /\bsendBeacon\b/,
  /\bAHARepository\s*\.\s*(?:save|load)\b/, /\bsyncFromDatabase\b/, /\b(?:executeSync|runSync|performSync|startSync)\b/,
  /\b(?:executeRollback|performRollback)\b/, /dispatchEvent\s*\(\s*new\s+CustomEvent/, /\bsource_events\b/, /\bsetInterval\s*\(/
];
const auditSource = read(AUDIT_FILE);
for (const pattern of forbiddenStatic) assert.equal(pattern.test(auditSource), false, `${AUDIT_FILE} must not contain ${pattern}`);
assert.equal(/DOMContentLoaded[\s\S]*runAudit|runAudit\s*\([\s\S]*DOMContentLoaded/.test(auditSource), false, "audit must not auto-run via DOMContentLoaded");
assert.equal(/function\s+render[\s\S]*runAudit\s*\(/.test(auditSource), false, "audit must not auto-run via render");
const trainingHandler = extractFunction(read(TRAINING_FILE), "handleAiLoopAudit");
const renderTraining = extractFunction(read(TRAINING_FILE), "renderAiLoopAudit");
const chatStatus = extractFunction(read(CHAT_FILE), "renderAhaPersonalAiLoopStatus");
const packBuilder = extractFunction(read(META_FILE), "buildPersonalAiLoopPackSafe");
for (const [label, source] of [["Training audit handler", trainingHandler], ["Training render", renderTraining], ["Chat status", chatStatus], ["Meta Insights pack", packBuilder]]) {
  for (const pattern of forbiddenStatic) assert.equal(pattern.test(source), false, `${label} must not contain ${pattern}`);
}
const trainingKeys = [...trainingHandler.matchAll(/setItem\s*\(\s*["']([^"']+)/g)].map((match) => match[1]);
assert.deepEqual(trainingKeys, [AUDIT_KEY], "explicit audit handler may write only the audit summary cache key");
assert.equal(/removeItem\s*\(|\.clear\s*\(/.test(trainingHandler), false, "audit handler must not remove/clear storage");
assert.equal(/runAudit\s*\(/.test(renderTraining), false, "Training render must not run audit");
assert.equal(/runAudit\s*\(|setItem\s*\(|refreshRetrievalIndex|buildRetrievalIndex/.test(chatStatus), false, "Chat status render must stay cached/read-only");
assert.equal(/runAudit\s*\(|setItem\s*\(|refreshRetrievalIndex|buildRetrievalIndex/.test(packBuilder), false, "Meta Insights pack must stay cached/read-only");

// L. Compact pack redaction.
{
  const context = makeContext();
  context.AHAPersonalAiLoopAudit = {
    loadLastAudit: () => ({
      status: "working", score: 88,
      checks: { approvedMaterial: { approvedCorpus: 2, approvedExamples: 4 } },
      retrieval: { available: true, indexedItems: 9 },
      recommendations: ["manual review only"],
      readiness: { level: "ready" },
      corpus: [{ text: "FULL CORPUS TEXT password token secret api_key apikey connectionString" }],
      memory: { rawPayload: { text: "FULL MEMORY RAW PAYLOAD" } },
      chatHistory: [{ role: "user", text: "FULL CHAT HISTORY" }]
    }),
    runAudit: () => assert.fail("Meta Insights must not run audit while building pack")
  };
  vm.runInContext(read(META_FILE), context, { filename: META_FILE });
  const pack = context.AHAMetaInsightsAgent.buildAgentContext({ meta_insight: {}, temporal: {} }).personalAiLoopPack;
  for (const key of ["status", "score", "approvedCorpus", "approvedExamples", "indexedItems", "retrievalAvailable", "recommendations"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(pack, key), `personalAiLoopPack may include ${key}`);
  }
  const serialized = JSON.stringify(pack).toLowerCase();
  for (const forbidden of ["full corpus", "full memory", "full chat", "password", "token", "secret", "api_key", "apikey", "connectionstring"]) {
    assert.equal(serialized.includes(forbidden), false, `personalAiLoopPack must not expose ${forbidden}`);
  }
}

// M. Existing test coverage is referenced.
assertDocIncludes("test references", [
  "tests/aha-personal-ai-loop-audit.test.cjs", "tests/aha-personal-ai-loop-read-only-boundary.test.cjs"
]);

// N. Status document updated with locked state and next PR.
assertStatusIncludes("implementation status", [
  "privacy/operator visibility: test-locked", "read-only boundary: test-locked", "compact pack: redacted/test-locked",
  "audit cache key: narrowly test-locked", "Sync Hub execution: NO-GO", "Auto-sync: permanently forbidden",
  "docs: review Personal AI Loop audit next activation surface"
]);

// O. Sync Hub/Home boundary remains safe.
{
  const status = read(STATUS_FILE);
  const home = read("index.html");
  assert.equal(fs.existsSync("sync.html"), false, "sync.html must still not exist");
  assert.match(status, /Sync Hub execution:\s*NO-GO|Execution:\s*NO-GO/);
  assert.match(status, /Auto-sync:\s*permanently forbidden|Auto-sync is permanently forbidden|auto-sync er permanent forbudt/i);
  for (const moduleFile of ["js/ahaLists.js", "js/ahaPaths.js", "js/ahaGroups.js", "js/ahaAvisa.js"]) {
    assert.equal(home.includes(moduleFile), false, `Home must not load ${moduleFile}`);
  }
}

console.log("aha-personal-ai-loop-privacy-operator-visibility.test.cjs passed");
