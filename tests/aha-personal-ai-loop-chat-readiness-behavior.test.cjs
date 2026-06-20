const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const CHAT_FILE = "js/ahaChat.js";
const source = fs.readFileSync(CHAT_FILE, "utf8");

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

function loadChatApi({ auditApi, host } = {}) {
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
    localStorage: { getItem() { return null; }, setItem() { throw new Error("readiness must not write"); } },
    addEventListener() {},
    dispatchEvent() {},
    AHAPersonalAiLoopAudit: auditApi
  };
  window.window = window;
  vm.runInNewContext(source, { window, document, console, setTimeout, clearTimeout, URLSearchParams, CustomEvent: function CustomEvent() {} }, { filename: CHAT_FILE });
  return window.AHAChat;
}

const compactSummary = {
  status: "working",
  countsBySeverity: { ok: 1, info: 1, suggestion: 0, warning: 0, blocker: 0 },
  topBlockerWarningTitles: [],
  operatorNextStep: "Manual review in Training Dashboard.",
  compactOnly: true,
  redacted: true
};
const auditApi = {
  buildCompactOperatorRecommendationSummary(input) {
    return input.compactOperatorRecommendationSummary || compactSummary;
  },
  loadLastAudit() { return null; }
};
const api = loadChatApi({ auditApi });
assert.equal(typeof api.buildAhaPersonalAiLoopChatReadinessStatus, "function", "readiness helper must be exported");

for (const input of [null, undefined, "invalid", 123, []]) {
  const status = api.buildAhaPersonalAiLoopChatReadinessStatus(input);
  assert.ok(["unknown", "blocked"].includes(status.state), "missing/invalid input must fail closed");
  assert.equal(status.requiresManualReview, true);
  assert.equal(status.compactOnly, true);
  assert.equal(status.redacted, true);
  assert.deepEqual(status.topBlockers, []);
  assert.deepEqual(status.topWarnings, []);
}

const ready = api.buildAhaPersonalAiLoopChatReadinessStatus({
  status: "working",
  checks: { approvedMaterial: { approvedCorpus: 2, approvedExamples: 1, confirmedClaims: 1, importantClaims: 0 } },
  compactOperatorRecommendationSummary: compactSummary,
  rawAuditPayload: "do not expose",
  fullPrivateCorpus: "private corpus",
  fullMemoryDump: "memory dump",
  fullChatHistory: "chat history"
});
assert.equal(ready.state, "ready");
assert.equal(ready.blockerCount, 0);
assert.equal(ready.compactOnly, true);
assert.equal(ready.redacted, true);

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
  }
});
assert.equal(partial.state, "partially_ready");
assert.ok(partial.warningCount > 0);
assert.ok(partial.topWarnings.length > 0);
assert.ok(partial.operatorNextStep.includes("Manual") || partial.operatorNextStep.includes("manual"));

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
assert.equal(/auto[- ]?fix/i.test(JSON.stringify(blocked)), false, "blocked status must not suggest auto-fix");

const privacy = api.buildAhaPersonalAiLoopChatReadinessStatus({
  status: "working",
  checks: { approvedMaterial: { approvedCorpus: 1 } },
  compactOperatorRecommendationSummary: {
    status: "working",
    countsBySeverity: { warning: 1, blocker: 0 },
    topBlockerWarningTitles: ["Token ghp_1234567890abcdef must stay hidden", "api_key=secret123456"],
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
  apiKeys: "api_key=abcdef123456"
});
const serialized = JSON.stringify(privacy).toLowerCase();
for (const forbidden of ["rawauditpayload", "fullprivatecorpus", "fullmemorydump", "fullchathistory", "sourcecontent", "rawretrievalindex", "sk-test", "ghp_", "api_key", "secret123456"]) {
  assert.equal(serialized.includes(forbidden.toLowerCase()), false, `privacy-safe output must not expose ${forbidden}`);
}

const helperSource = extractFunction("buildAhaPersonalAiLoopChatReadinessStatus");
const renderSource = extractFunction("renderAhaPersonalAiLoopStatus");
for (const scopedSource of [helperSource, renderSource]) {
  for (const forbidden of ["runAudit(", "fetch(", "XMLHttpRequest", "sendBeacon", "supabase", ".insert(", ".update(", ".upsert(", ".delete(", "AHASyncHub", "manualSync", "autoSync", "setItem("]) {
    assert.equal(scopedSource.includes(forbidden), false, `readiness path must not include ${forbidden}`);
  }
}
assert.equal(/AHAPersonalAiLoopAudit[\s\S]{0,120}runAudit/.test(source), false, "Chat must not call audit run API");

const host = { textContent: "" };
const renderApi = loadChatApi({
  host,
  auditApi: {
    loadLastAudit() { return null; },
    buildCompactOperatorRecommendationSummary(input) { return input?.compactOperatorRecommendationSummary || null; }
  }
});
const renderedMissing = renderApi.renderAhaPersonalAiLoopStatus();
assert.ok(["unknown", "blocked"].includes(renderedMissing.state));
assert.match(host.textContent, /Chat readiness: Unknown|Chat readiness: Blocked/);
assert.match(host.textContent, /Manual audit\/review required/);

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
    buildCompactOperatorRecommendationSummary(input) { return input.compactOperatorRecommendationSummary; }
  }
});
const renderedBlocked = renderApi2.renderAhaPersonalAiLoopStatus();
assert.equal(renderedBlocked.state, "blocked");
assert.match(host2.textContent, /Blockers: 1/);
assert.match(host2.textContent, /Warnings: 1/);
assert.match(host2.textContent, /Retrieval index missing/);

console.log("aha-personal-ai-loop-chat-readiness-behavior.test.cjs passed");
