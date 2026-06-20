const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const CHAT_FILE = "js/ahaChat.js";
const source = fs.readFileSync(CHAT_FILE, "utf8");
const REQUIRED_KEYS = [
  "state", "label", "message", "blockerCount", "warningCount", "topBlockers", "topWarnings",
  "operatorNextStep", "source", "compactOnly", "redacted", "requiresManualReview"
];
const FORBIDDEN_OUTPUT_TERMS = [
  "rawAuditPayload", "fullPrivateCorpus", "fullMemoryDump", "fullChatHistory", "sourceContent",
  "rawRetrievalIndex", "private corpus", "memory dump", "chat history", "sk-test", "ghp_",
  "api_key", "secret", "token", "person@example.com", "raw evidence string"
];

function extractFunction(name) {
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

function loadChatApi({ auditApi, host, storage } = {}) {
  const listeners = {};
  const document = {
    readyState: "loading",
    addEventListener(name, fn) { listeners[name] = fn; },
    getElementById(id) { return id === "aha-personal-ai-loop-status" ? host : null; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const window = {
    document,
    localStorage: storage || { getItem() { return null; }, setItem() { throw new Error("readiness must not write"); } },
    addEventListener() {},
    dispatchEvent() {},
    AHAPersonalAiLoopAudit: auditApi
  };
  window.window = window;
  vm.runInNewContext(source, { window, document, console, setTimeout, clearTimeout, URLSearchParams, CustomEvent: function CustomEvent() {} }, { filename: CHAT_FILE });
  return window.AHAChat;
}

function assertCompactContract(status, label = "status") {
  assert.deepEqual(Object.keys(status).sort(), REQUIRED_KEYS.slice().sort(), `${label} must expose only the compact readiness contract`);
  assert.equal(status.compactOnly, true, `${label} must be compact only`);
  assert.equal(status.redacted, true, `${label} must be redacted`);
  assert.equal(status.source, "cached_audit_summary", `${label} must be sourced from cached summary only`);
  assert.ok(Array.isArray(status.topBlockers), `${label} topBlockers must be an array`);
  assert.ok(Array.isArray(status.topWarnings), `${label} topWarnings must be an array`);
  for (const item of status.topBlockers.concat(status.topWarnings)) {
    assert.equal(typeof item, "string", `${label} blockers/warnings must be compact strings`);
    assert.ok(item.length <= 120, `${label} blocker/warning strings must be bounded`);
    assert.doesNotMatch(item, /[\r\n]/, `${label} blocker/warning strings must not include raw multiline evidence`);
  }
  const serialized = JSON.stringify(status).toLowerCase();
  for (const forbidden of FORBIDDEN_OUTPUT_TERMS) {
    assert.equal(serialized.includes(forbidden.toLowerCase()), false, `${label} must not expose ${forbidden}`);
  }
}

const compactSummary = {
  status: "working",
  countsBySeverity: { ok: 1, info: 1, suggestion: 0, warning: 0, blocker: 0 },
  topBlockerWarningTitles: [],
  operatorNextStep: "Manual review in Training Dashboard.",
  compactOnly: true,
  redacted: true
};
let buildSummaryCalls = 0;
let runAuditCalls = 0;
const auditApi = {
  buildCompactOperatorRecommendationSummary(input) {
    buildSummaryCalls += 1;
    return input.compactOperatorRecommendationSummary || compactSummary;
  },
  loadLastAudit() { return null; },
  runAudit() { runAuditCalls += 1; throw new Error("readiness must not run audit"); }
};
const api = loadChatApi({ auditApi });
assert.equal(typeof api.buildAhaPersonalAiLoopChatReadinessStatus, "function", "readiness helper must be exported");

for (const input of [null, undefined, "invalid", 123, [], NaN]) {
  const status = api.buildAhaPersonalAiLoopChatReadinessStatus(input);
  assert.ok(["unknown", "blocked"].includes(status.state), "missing/invalid input must fail closed");
  assert.equal(status.requiresManualReview, true);
  assert.equal(status.blockerCount, 0);
  assert.equal(status.warningCount, 0);
  assert.deepEqual(status.topBlockers, []);
  assert.deepEqual(status.topWarnings, []);
  assert.match(status.operatorNextStep, /manual audit\/review|training dashboard/i);
  assertCompactContract(status, `fail-closed ${String(input)}`);
}
assert.equal(runAuditCalls, 0, "fail-closed helper path must not run audit");

const readyInput = {
  status: "working",
  checks: { approvedMaterial: { approvedCorpus: 2, approvedExamples: 1, confirmedClaims: 1, importantClaims: 0 } },
  compactOperatorRecommendationSummary: compactSummary,
  rawAuditPayload: "do not expose",
  fullPrivateCorpus: "private corpus",
  fullMemoryDump: "memory dump",
  fullChatHistory: "chat history"
};
const beforeReady = JSON.stringify(readyInput);
const ready = api.buildAhaPersonalAiLoopChatReadinessStatus(readyInput);
assert.equal(JSON.stringify(readyInput), beforeReady, "readiness helper must not mutate ready input");
assert.equal(ready.state, "ready");
assert.equal(ready.blockerCount, 0);
assert.equal(ready.warningCount, 0);
assert.equal(ready.requiresManualReview, false);
assertCompactContract(ready, "ready");

const partial = api.buildAhaPersonalAiLoopChatReadinessStatus({
  status: "working",
  checks: { approvedMaterial: { approvedCorpus: 1 } },
  compactOperatorRecommendationSummary: {
    status: "working",
    countsBySeverity: { warning: 2, blocker: 0 },
    topBlockerWarningTitles: ["Retrieval index may be stale", "Sample query failed"],
    operatorNextStep: "Review warnings manually in Training Dashboard.",
    compactOnly: true,
    redacted: true
  },
  autoFix: "must not leak"
});
assert.equal(partial.state, "partially_ready");
assert.equal(partial.blockerCount, 0);
assert.ok(partial.warningCount > 0);
assert.ok(partial.topWarnings.length > 0);
assert.match(partial.operatorNextStep, /manual|Training Dashboard/i);
assert.equal(/auto[- ]?fix/i.test(JSON.stringify(partial)), false, "partially_ready must not suggest auto-fix");
assertCompactContract(partial, "partially_ready");

const blocked = api.buildAhaPersonalAiLoopChatReadinessStatus({
  status: "partial",
  checks: { approvedMaterial: { approvedCorpus: 1 } },
  compactOperatorRecommendationSummary: {
    status: "partial",
    countsBySeverity: { warning: 1, blocker: 2 },
    topBlockerWarningTitles: ["Review privacy and consent", "Retrieval index missing"],
    operatorNextStep: "Review consent manually.",
    compactOnly: true,
    redacted: true
  }
});
assert.equal(blocked.state, "blocked");
assert.ok(blocked.blockerCount > 0);
assert.ok(blocked.topBlockers.length > 0);
assert.equal(blocked.requiresManualReview, true);
assert.match(blocked.operatorNextStep, /manual/i);
assert.equal(/auto[- ]?fix/i.test(JSON.stringify(blocked)), false, "blocked status must not suggest auto-fix");
assertCompactContract(blocked, "blocked");

const unknown = api.buildAhaPersonalAiLoopChatReadinessStatus({
  status: "working",
  checks: { approvedMaterial: { approvedCorpus: 4 } },
  compactOperatorRecommendationSummary: { compactOnly: false, redacted: false, countsBySeverity: { blocker: 0, warning: 0 } }
});
assert.ok(["unknown", "blocked"].includes(unknown.state), "invalid compact summary must fail closed");
assert.equal(unknown.requiresManualReview, true);
assert.match(unknown.operatorNextStep, /manual audit\/review|training dashboard/i);
assertCompactContract(unknown, "unknown");

const privacy = api.buildAhaPersonalAiLoopChatReadinessStatus({
  status: "working",
  checks: { approvedMaterial: { approvedCorpus: 1 } },
  compactOperatorRecommendationSummary: {
    status: "working",
    countsBySeverity: { warning: 1, blocker: 0 },
    topBlockerWarningTitles: ["Token ghp_1234567890abcdef must stay hidden", "api_key=secret123456", "person@example.com"],
    operatorNextStep: "Manual review only.",
    compactOnly: true,
    redacted: true
  },
  rawAuditPayload: { sourceContent: "full raw source content" },
  fullPrivateCorpus: ["private item"],
  fullMemoryDump: "memory",
  fullChatHistory: "chat",
  rawRetrievalIndex: [{ content: "secret" }],
  secrets: "sk-test123456789",
  tokens: "ghp_abcdef123456",
  apiKeys: "api_key=abcdef123456",
  evidence: "raw evidence string ".repeat(40)
});
assertCompactContract(privacy, "privacy");

const helperSource = extractFunction("buildAhaPersonalAiLoopChatReadinessStatus");
const renderSource = extractFunction("renderAhaPersonalAiLoopStatus");
assert.match(renderSource, /loadLastAudit\(\)/, "render must read cached summary only via loadLastAudit()");
for (const [name, scopedSource] of [["helper", helperSource], ["render", renderSource]]) {
  for (const forbidden of ["runAudit(", "fetch(", "XMLHttpRequest", "sendBeacon", "supabase", ".insert(", ".update(", ".upsert(", ".delete(", "localStorage.setItem", "setItem(", "AHASyncHub", "manualSync", "autoSync", "publish", "share", "source event", "source-event", "sourceEvent"]) {
    assert.equal(scopedSource.includes(forbidden), false, `${name} readiness path must not include ${forbidden}`);
  }
}
assert.equal(/AHAPersonalAiLoopAudit[\s\S]{0,120}runAudit/.test(source), false, "Chat must not call audit run API");

const writes = [];
const host = { textContent: "" };
const renderApi = loadChatApi({
  host,
  storage: { getItem() { return null; }, setItem(key, value) { writes.push([key, value]); throw new Error("readiness must not write localStorage"); } },
  auditApi: {
    loadLastAudit() { return null; },
    runAudit() { throw new Error("render must not run audit"); },
    buildCompactOperatorRecommendationSummary(input) { return input?.compactOperatorRecommendationSummary || null; }
  }
});
const renderedMissing = renderApi.renderAhaPersonalAiLoopStatus();
assert.ok(["unknown", "blocked"].includes(renderedMissing.state));
assert.match(host.textContent, /Chat readiness: Unknown|Chat readiness: Blocked/);
assert.match(host.textContent, /Manual audit\/review required/);
assert.deepEqual(writes, [], "render must not write localStorage");
assertCompactContract(renderedMissing, "render missing cache");

const host2 = { textContent: "" };
const renderApi2 = loadChatApi({
  host: host2,
  auditApi: {
    loadLastAudit() { return {
      status: "partial",
      checks: { approvedMaterial: { approvedCorpus: 1 } },
      compactOperatorRecommendationSummary: {
        status: "partial",
        countsBySeverity: { blocker: 1, warning: 1 },
        topBlockerWarningTitles: ["Retrieval index missing", "Sample query failed"],
        operatorNextStep: "Review manually.",
        compactOnly: true,
        redacted: true
      }
    }; },
    runAudit() { throw new Error("render must not run audit"); },
    buildCompactOperatorRecommendationSummary(input) { return input.compactOperatorRecommendationSummary; }
  }
});
const renderedBlocked = renderApi2.renderAhaPersonalAiLoopStatus();
assert.equal(renderedBlocked.state, "blocked");
assert.match(host2.textContent, /Blockers: 1/);
assert.match(host2.textContent, /Warnings: 1/);
assert.match(host2.textContent, /Retrieval index missing/);
assertCompactContract(renderedBlocked, "render cached blocked");
assert.equal(runAuditCalls, 0, "readiness behavior must never run audit");
assert.ok(buildSummaryCalls >= 0, "summary builder is only used for compact/redacted normalization when needed");

console.log("aha-personal-ai-loop-chat-readiness-behavior.test.cjs passed");
