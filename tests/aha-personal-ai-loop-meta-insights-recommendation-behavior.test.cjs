const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const META_FILE = "js/metaInsightsAgent.js";
const source = fs.readFileSync(META_FILE, "utf8");
const REQUIRED_KEYS = [
  "state", "label", "message", "severityCounts", "blockerCount", "warningCount", "topBlockers", "topWarnings",
  "operatorNextStep", "chatReadinessState", "source", "compactOnly", "redacted", "requiresManualReview"
];
const FORBIDDEN_OUTPUT_TERMS = [
  "rawAuditPayload", "fullPrivateCorpus", "fullMemoryDump", "fullChatHistory", "raw source content",
  "rawRetrievalIndex", "private corpus", "memory dump", "chat history", "sourceContent",
  "retrieval index raw", "sk-test", "ghp_", "api_key", "secret", "token", "person@example.com",
  "raw evidence string", "raw approved examples", "raw consent metadata"
];

function loadMetaApi(extra = {}) {
  const context = { console, Date, Math, JSON, ...extra };
  context.window = context;
  context.globalThis = context;
  context.module = { exports: {} };
  context.exports = context.module.exports;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: META_FILE });
  return context.module.exports || context.AHAMetaInsightsAgent;
}

function flatten(value) { return JSON.stringify(value).toLowerCase(); }
function assertCompactContract(summary, label = "summary") {
  assert.deepEqual(Object.keys(summary).sort(), REQUIRED_KEYS.slice().sort(), `${label} must expose only the compact Meta Insights recommendation contract`);
  assert.equal(summary.compactOnly, true, `${label} must be compact only`);
  assert.equal(summary.redacted, true, `${label} must be redacted`);
  assert.equal(summary.source, "cached_audit_summary", `${label} must use cached summary only`);
  assert.ok(Array.isArray(summary.topBlockers), `${label} topBlockers must be an array`);
  assert.ok(Array.isArray(summary.topWarnings), `${label} topWarnings must be an array`);
  assert.equal(typeof summary.severityCounts, "object", `${label} severityCounts must be compact counts`);
  for (const item of summary.topBlockers.concat(summary.topWarnings)) {
    assert.equal(typeof item, "string", `${label} blockers/warnings must be compact strings`);
    assert.ok(item.length <= 120, `${label} blockers/warnings must be bounded`);
    assert.doesNotMatch(item, /[\r\n]/, `${label} blockers/warnings must not include multiline raw evidence`);
  }
  const serialized = flatten(summary);
  for (const forbidden of FORBIDDEN_OUTPUT_TERMS) {
    assert.equal(serialized.includes(forbidden.toLowerCase()), false, `${label} must not expose ${forbidden}`);
  }
}

let compactBuilderCalls = 0;
let auditRuns = 0;
let writes = 0;
const auditApi = {
  loadLastAudit() { return null; },
  runAudit() { auditRuns += 1; throw new Error("Meta Insights recommendation summary must not run audit"); },
  buildCompactOperatorRecommendationSummary(input) {
    compactBuilderCalls += 1;
    return input.compactOperatorRecommendationSummary || input.operatorRecommendationSummary || null;
  }
};
const api = loadMetaApi({
  AHAPersonalAiLoopAudit: auditApi,
  localStorage: { getItem() { return null; }, setItem() { writes += 1; throw new Error("must not write"); } },
  fetch() { throw new Error("must not fetch"); },
  navigator: { sendBeacon() { throw new Error("must not beacon"); } },
  XMLHttpRequest() { throw new Error("must not XHR"); },
  AHASyncHub: { runSync() { throw new Error("must not sync"); } }
});
assert.equal(typeof api.buildPersonalAiLoopMetaInsightsRecommendationSummary, "function", "Meta Insights recommendation summary builder must be exported");

for (const input of [null, undefined, "invalid", 123, [], NaN, { compactOperatorRecommendationSummary: null }, { compactOperatorRecommendationSummary: { compactOnly: false, redacted: false } }]) {
  const summary = api.buildPersonalAiLoopMetaInsightsRecommendationSummary(input);
  assert.ok(["unknown", "blocked"].includes(summary.state), "missing/null/invalid input must fail closed");
  assert.equal(summary.requiresManualReview, true);
  assert.match(summary.operatorNextStep, /manual audit\/review|training dashboard/i);
  assert.equal(/auto[- ]?fix|write|sync|publish|share/i.test(JSON.stringify(summary)), false, "fail-closed output must not propose automatic write/sync/publish/share");
  assertCompactContract(summary, `fail-closed ${String(input)}`);
}
assert.equal(auditRuns, 0, "fail-closed path must not run audit");

const readyInput = {
  status: "working",
  ready: true,
  checks: { approvedMaterial: { approvedCorpus: 2, approvedExamples: 1 } },
  compactOperatorRecommendationSummary: {
    status: "working",
    countsBySeverity: { ok: 2, info: 1, warning: 0, blocker: 0 },
    topBlockerWarningTitles: [],
    operatorNextStep: "Manual review in Training Dashboard.",
    compactOnly: true,
    redacted: true
  },
  chatReadinessState: "ready",
  rawAuditPayload: { sourceContent: "raw source content" },
  fullPrivateCorpus: "private corpus",
  fullMemoryDump: "memory dump",
  fullChatHistory: "chat history"
};
const beforeReady = JSON.stringify(readyInput);
const ready = api.buildPersonalAiLoopMetaInsightsRecommendationSummary(readyInput);
assert.equal(JSON.stringify(readyInput), beforeReady, "builder must not mutate input");
assert.equal(ready.state, "ready");
assert.equal(ready.blockerCount, 0);
assert.equal(ready.warningCount, 0);
assert.ok(["ready", "partially_ready"].includes(ready.chatReadinessState));
assert.equal(ready.requiresManualReview, false);
assertCompactContract(ready, "ready");

const attention = api.buildPersonalAiLoopMetaInsightsRecommendationSummary({
  status: "working",
  compactOperatorRecommendationSummary: {
    status: "working",
    countsBySeverity: { warning: 2, blocker: 0 },
    topBlockerWarningTitles: ["Retrieval index may be stale", "Sample query needs review"],
    operatorNextStep: "Review warnings manually in Training Dashboard.",
    compactOnly: true,
    redacted: true
  },
  autoFix: "must not leak"
});
assert.equal(attention.state, "attention_needed");
assert.equal(attention.blockerCount, 0);
assert.ok(attention.warningCount > 0);
assert.ok(attention.topWarnings.length > 0);
assert.match(attention.operatorNextStep, /manual|Training Dashboard/i);
assert.equal(/auto[- ]?fix/i.test(JSON.stringify(attention)), false, "attention_needed must not suggest auto-fix");
assertCompactContract(attention, "attention_needed");

const blocked = api.buildPersonalAiLoopMetaInsightsRecommendationSummary({
  status: "partial",
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
assert.equal(/auto[- ]?fix/i.test(JSON.stringify(blocked)), false, "blocked must not suggest auto-fix");
assertCompactContract(blocked, "blocked");

const privacy = api.buildPersonalAiLoopMetaInsightsRecommendationSummary({
  status: "working",
  compactOperatorRecommendationSummary: {
    status: "working",
    countsBySeverity: { warning: 1, blocker: 0 },
    topBlockerWarningTitles: ["Token ghp_1234567890abcdef must stay hidden", "api_key=secret123456", "person@example.com", "raw evidence string ".repeat(40)],
    operatorNextStep: "Manual review only.",
    compactOnly: true,
    redacted: true
  },
  rawAuditPayload: { sourceContent: "full raw source content" },
  fullPrivateCorpus: ["private item"],
  fullMemoryDump: "memory",
  fullChatHistory: "chat",
  rawRetrievalIndex: [{ content: "secret" }],
  rawApprovedExamples: ["example"],
  rawConsentMetadata: { email: "person@example.com" },
  secrets: "sk-test123456789",
  tokens: "ghp_abcdef123456",
  apiKeys: "api_key=abcdef123456"
});
assertCompactContract(privacy, "privacy");

let packAuditRuns = 0;
let packWrites = 0;
const packApi = loadMetaApi({
  AHAPersonalAiLoopAudit: {
    loadLastAudit() { return readyInput; },
    runAudit() { packAuditRuns += 1; throw new Error("pack must not run audit"); },
    buildCompactOperatorRecommendationSummary(input) { return input.compactOperatorRecommendationSummary; }
  },
  localStorage: { getItem() { return null; }, setItem() { packWrites += 1; throw new Error("pack must not write"); } },
  AHASyncHub: { runSync() { throw new Error("pack must not trigger Sync Hub"); } }
});
const pack = packApi.buildAgentContext({}, {}).personalAiLoopPack;
assert.ok(pack, "pack should include Personal AI Loop section when cached audit exists");
assertCompactContract(pack.recommendations, "pack recommendation summary");
for (const forbidden of FORBIDDEN_OUTPUT_TERMS) assert.equal(flatten(pack).includes(forbidden.toLowerCase()), false, `pack must not expose ${forbidden}`);
assert.equal(packAuditRuns, 0, "pack must not run audit");
assert.equal(packWrites, 0, "pack must not write");
assert.equal(writes, 0, "builder must not write");
assert.ok(compactBuilderCalls > 0, "builder may use compact operator summary builder only");

for (const forbidden of [
  /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /sendBeacon/, /supabase/i, /\.(?:insert|update|upsert|delete)\s*\(/,
  /localStorage\.setItem/, /runAudit\s*\(/, /AHASyncHub/, /manualSync|autoSync/i, /\bpublish\b/i, /\bshare\b/i,
  /source[\s_-]*(?:publish|share)?[\s_-]*events?/i
]) {
  assert.equal(forbidden.test(source), false, `Meta Insights agent must not contain forbidden pattern ${forbidden}`);
}
assert.equal(fs.existsSync("sync.html"), false, "sync.html must still not exist");

console.log("aha-personal-ai-loop-meta-insights-recommendation-behavior.test.cjs passed");
