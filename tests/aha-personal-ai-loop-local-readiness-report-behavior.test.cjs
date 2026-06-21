const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const AUDIT_FILE = "js/ahaPersonalAiLoopAudit.js";
const source = fs.readFileSync(AUDIT_FILE, "utf8");
const REQUIRED_KEYS = [
  "state", "title", "summary", "auditStatus", "blockerCount", "warningCount", "topBlockers", "topWarnings",
  "operatorNextStep", "chatReadinessState", "metaInsightsRecommendationState", "manualReviewRequired", "generatedAt",
  "localOnly", "explicitActionOnly", "compactOnly", "redacted", "sections"
];
const FORBIDDEN_OUTPUT_TERMS = [
  "rawAuditPayload", "fullPrivateCorpus", "fullMemoryDump", "fullChatHistory", "raw source content",
  "rawRetrievalIndex", "private corpus", "memory dump", "chat history", "sourceContent", "retrieval index raw",
  "raw approved examples", "raw consent metadata", "unredacted recommendation evidence", "sk-test", "ghp_",
  "api_key", "secret123", "token123", "person@example.com", "raw evidence string"
];

function loadAuditApi(extra = {}) {
  const context = { console, Date, Math, JSON, ...extra };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: AUDIT_FILE });
  return context.AHAPersonalAiLoopAudit;
}
function flatten(value) { return JSON.stringify(value).toLowerCase(); }
function assertCompactContract(report, label = "report") {
  assert.deepEqual(Object.keys(report).sort(), REQUIRED_KEYS.slice().sort(), `${label} must expose only the local readiness report contract`);
  assert.equal(report.localOnly, true, `${label} must be local-only`);
  assert.equal(report.explicitActionOnly, true, `${label} must be explicit-action only`);
  assert.equal(report.compactOnly, true, `${label} must be compact only`);
  assert.equal(report.redacted, true, `${label} must be redacted`);
  assert.ok(Array.isArray(report.topBlockers), `${label} topBlockers must be an array`);
  assert.ok(Array.isArray(report.topWarnings), `${label} topWarnings must be an array`);
  assert.ok(Array.isArray(report.sections), `${label} sections must be an array`);
  for (const item of report.topBlockers.concat(report.topWarnings)) {
    assert.equal(typeof item, "string", `${label} blockers/warnings must be compact strings`);
    assert.ok(item.length <= 120, `${label} blockers/warnings must be bounded`);
    assert.doesNotMatch(item, /[\r\n]/, `${label} blockers/warnings must not contain multiline raw evidence`);
  }
  for (const section of report.sections) {
    assert.equal(section.compactOnly, true, `${label} section must be compact`);
    assert.equal(section.redacted, true, `${label} section must be redacted`);
  }
  const serialized = flatten(report);
  for (const forbidden of FORBIDDEN_OUTPUT_TERMS) {
    assert.equal(serialized.includes(forbidden.toLowerCase()), false, `${label} must not expose ${forbidden}`);
  }
  assert.equal(/auto[- ]?fix|write|sync|publish|share|download/i.test(JSON.stringify(report)), false, `${label} must not suggest execution/sync/publish/share/download`);
}

let auditRuns = 0;
let writes = 0;
const api = loadAuditApi({
  localStorage: { getItem() { return null; }, setItem() { writes += 1; throw new Error("must not write"); } },
  fetch() { throw new Error("must not fetch"); },
  navigator: { sendBeacon() { throw new Error("must not beacon"); } },
  XMLHttpRequest() { throw new Error("must not XHR"); },
  AHASyncHub: { runSync() { throw new Error("must not sync"); } }
});
assert.equal(typeof api.buildPersonalAiLoopLocalReadinessReport, "function", "local readiness report helper must be exported");
api.runAudit = () => { auditRuns += 1; throw new Error("report must not run audit"); };

for (const input of [null, undefined, "invalid", 123, [], NaN, { compactOperatorRecommendationSummary: null }, { compactOperatorRecommendationSummary: { compactOnly: false, redacted: false } }]) {
  const report = api.buildPersonalAiLoopLocalReadinessReport(input);
  assert.ok(["unknown", "blocked"].includes(report.state), "missing/null/invalid input must fail closed");
  assert.equal(report.manualReviewRequired, true);
  assert.match(report.operatorNextStep, /manual audit\/review|training dashboard/i);
  assertCompactContract(report, `fail-closed ${String(input)}`);
}
assert.equal(auditRuns, 0, "report helper must not run audit");
assert.equal(writes, 0, "report helper must not write");

const readyInput = {
  status: "working",
  checks: { approvedMaterial: { approvedCorpus: 2, approvedExamples: 1 }, retrievalIndex: { ok: true }, privacyAndConsent: { ok: true } },
  chatReadinessState: "ready",
  metaInsightsRecommendationState: "ready",
  compactOperatorRecommendationSummary: {
    status: "working",
    countsBySeverity: { ok: 2, info: 1, warning: 0, blocker: 0 },
    topBlockerWarningTitles: [],
    operatorNextStep: "Manual review in Training Dashboard.",
    compactOnly: true,
    redacted: true
  },
  rawAuditPayload: { sourceContent: "raw source content" },
  fullPrivateCorpus: "private corpus",
  fullMemoryDump: "memory dump",
  fullChatHistory: "chat history"
};
const beforeReady = JSON.stringify(readyInput);
const ready = api.buildPersonalAiLoopLocalReadinessReport(readyInput);
assert.equal(JSON.stringify(readyInput), beforeReady, "report helper must not mutate input");
assert.equal(ready.state, "ready");
assert.equal(ready.blockerCount, 0);
assert.equal(ready.warningCount, 0);
assert.equal(ready.manualReviewRequired, false);
assertCompactContract(ready, "ready");

const attention = api.buildPersonalAiLoopLocalReadinessReport({
  status: "working",
  checks: { approvedMaterial: { approvedCorpus: 1 }, retrievalIndex: { ok: true }, privacyAndConsent: { ok: true } },
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
assertCompactContract(attention, "attention_needed");

const blocked = api.buildPersonalAiLoopLocalReadinessReport({
  status: "partial",
  checks: { approvedMaterial: { approvedCorpus: 1 }, retrievalIndex: { ok: false }, privacyAndConsent: { ok: true } },
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
assert.equal(blocked.manualReviewRequired, true);
assert.match(blocked.operatorNextStep, /manual/i);
assertCompactContract(blocked, "blocked");

const privacy = api.buildPersonalAiLoopLocalReadinessReport({
  status: "working",
  checks: { approvedMaterial: { approvedCorpus: 1 }, retrievalIndex: { ok: true }, privacyAndConsent: { ok: true } },
  compactOperatorRecommendationSummary: {
    status: "working",
    countsBySeverity: { warning: 1, blocker: 0 },
    topBlockerWarningTitles: ["Token ghp_1234567890abcdef must stay hidden", "api_key=secret123456", "person@example.com", "raw evidence string ".repeat(40)],
    operatorNextStep: "Manual review only for person@example.com with token=token123.",
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

const helperStart = source.indexOf("function buildPersonalAiLoopLocalReadinessReport(");
assert.notEqual(helperStart, -1, "helper source must exist");
const helperBodyStart = source.indexOf("{", helperStart);
let helperDepth = 0;
let helperEnd = -1;
for (let index = helperBodyStart; index < source.length; index += 1) {
  if (source[index] === "{") helperDepth += 1;
  if (source[index] === "}") {
    helperDepth -= 1;
    if (helperDepth === 0) { helperEnd = index + 1; break; }
  }
}
assert.notEqual(helperEnd, -1, "helper source must be extractable");
const helperSource = source.slice(helperStart, helperEnd);
for (const forbidden of [
  /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /sendBeacon/, /supabase/i, /\.(?:insert|update|upsert|delete)\s*\(/,
  /localStorage\.setItem/, /runAudit\s*\(/, /AHASyncHub/, /manualSync|autoSync/i, /\bpublish\b/i, /\bshare\b/i,
  /source[\s_-]*(?:publish|share)?[\s_-]*events?/i, /download/i
]) {
  assert.equal(forbidden.test(helperSource), false, `local report helper must not contain forbidden pattern ${forbidden}`);
}
assert.equal(fs.existsSync("sync.html"), false, "sync.html must still not exist");

console.log("aha-personal-ai-loop-local-readiness-report-behavior.test.cjs passed");
