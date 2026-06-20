const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const AUDIT_FILE = "js/ahaPersonalAiLoopAudit.js";
const TRAINING_FILE = "js/ahaTrainingDashboard.js";
const META_FILE = "js/metaInsightsAgent.js";
const STATUS_FILE = "docs/AHA_IMPLEMENTATION_STATUS.md";
const VALID_SEVERITIES = new Set(["ok", "info", "suggestion", "warning", "blocker"]);
const REQUIRED_FIELDS = [
  "id", "severity", "title", "message", "reason", "evidenceType", "relatedSurface",
  "allowedNextStep", "forbiddenAutomation", "privacyRisk", "requiresExplicitAction"
];

function read(file) { return fs.readFileSync(file, "utf8"); }
function loadAudit(extra = {}) {
  const context = { console, Date, Math, JSON, ...extra };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read(AUDIT_FILE), context, { filename: AUDIT_FILE });
  return context.AHAPersonalAiLoopAudit;
}
function flatten(value) { return JSON.stringify(value).toLowerCase(); }
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail(`could not extract ${name}`);
}

const api = loadAudit();
assert.equal(typeof api.buildOperatorRecommendations, "function", "buildOperatorRecommendations must be exported");
assert.equal(typeof api.buildCompactOperatorRecommendationSummary, "function", "compact recommendation summary builder must be exported");

for (const missing of [null, undefined]) {
  const recommendations = api.buildOperatorRecommendations(missing);
  assert.ok(Array.isArray(recommendations));
  assert.ok(recommendations.some((item) => item.severity === "blocker"), "missing input must fail closed with a blocker");
  assert.ok(recommendations.every((item) => item.requiresExplicitAction === true));
  const blocker = recommendations.find((item) => item.severity === "blocker");
  assert.match(blocker.message, /unknown|missing/i);
  assert.match(blocker.allowedNextStep, /manual|Training Dashboard/i);
  for (const forbidden of ["auto_audit", "domain_write", "remote_write", "sync_hub", "auto_sync", "publish", "share"]) {
    assert.ok(blocker.forbiddenAutomation.includes(forbidden), `blocker must forbid ${forbidden}`);
  }
}

const sampleAudit = {
  status: "partial",
  score: 42,
  summary: "Personal AI Loop er delvis koblet.",
  checks: {
    approvedMaterial: { approvedCorpus: 1, approvedExamples: 0, confirmedClaims: 0, importantClaims: 0 },
    sampleQuery: { ok: false, resultCount: 0, reasons: [] },
    privacyAndConsent: { ok: false, consentAware: false },
    chatIntegration: { ok: false }
  },
  retrieval: { available: false, indexedItems: 0, needsRefresh: true },
  semanticRetrieval: { hasReasons: false },
  privateCorpus: "RAW PRIVATE CORPUS should not leak",
  memoryDump: "FULL MEMORY DUMP should not leak",
  chatHistory: "FULL CHAT HISTORY should not leak",
  apiKey: "sk-secret-token"
};
const recommendations = api.buildOperatorRecommendations(sampleAudit);
assert.ok(recommendations.length >= 5, "relevant operator recommendation categories should be emitted");
for (const rec of recommendations) {
  for (const field of REQUIRED_FIELDS) assert.ok(Object.prototype.hasOwnProperty.call(rec, field), `${field} missing`);
  assert.ok(VALID_SEVERITIES.has(rec.severity), `invalid severity ${rec.severity}`);
  assert.equal(rec.requiresExplicitAction, true);
}
assert.ok(recommendations.some((item) => item.id === "privacy_review_required"));
assert.ok(recommendations.some((item) => item.id === "retrieval_index_missing"));
assert.ok(recommendations.some((item) => item.id === "too_few_approved_examples"));
assert.ok(recommendations.some((item) => item.id === "sample_query_failed"));
assert.ok(recommendations.some((item) => item.id === "confirm_important_memory"));

const serialized = flatten(recommendations);
for (const secret of ["raw private corpus", "full memory dump", "full chat history", "sk-secret-token", "api key"]) {
  assert.equal(serialized.includes(secret), false, `recommendations must not expose ${secret}`);
}
const compact = api.buildCompactOperatorRecommendationSummary(sampleAudit);
assert.equal(compact.compactOnly, true);
assert.equal(compact.redacted, true);
assert.ok(compact.countsBySeverity.blocker >= 1);
assert.deepEqual(Object.keys(compact).sort(), ["compactOnly", "countsBySeverity", "operatorNextStep", "redacted", "status", "topBlockerWarningTitles"].sort());
assert.equal(flatten(compact).includes("raw private corpus"), false);

const auditCode = read(AUDIT_FILE);
for (const forbidden of [
  /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bsendBeacon\b/, /supabase\s*\./i,
  /\.(?:insert|upsert|delete|update)\s*\(/, /executeSync|runSync|performSync|startSync|enableExecution/,
  /DOMContentLoaded|addEventListener\s*\(\s*["'](?:load|storage|message)/,
  /refreshRetrievalIndex|buildRetrievalIndex/, /dispatchEvent\s*\(\s*new\s+CustomEvent/
]) {
  assert.equal(forbidden.test(auditCode), false, `audit recommendations must not add forbidden behavior: ${forbidden}`);
}

const trainingRender = extractFunction(read(TRAINING_FILE), "renderAiLoopAudit");
assert.match(trainingRender, /loadLastAudit/);
assert.match(trainingRender, /buildOperatorRecommendations/);
assert.match(trainingRender, /data-operator-recommendation-severity/);
assert.equal(/runAudit\s*\(|refreshRetrievalIndex|buildRetrievalIndex|setItem\s*\(|fetch\s*\(/.test(trainingRender), false);
assert.equal(/supabase|executeSync|runSync|performSync|startSync|dispatchEvent/.test(trainingRender), false);

const metaBuilder = extractFunction(read(META_FILE), "buildPersonalAiLoopPackSafe");
assert.match(metaBuilder, /loadLastAudit/);
assert.match(metaBuilder, /buildCompactOperatorRecommendationSummary/);
assert.match(metaBuilder, /recommendations: recommendationSummary/);
assert.equal(/runAudit|refreshRetrievalIndex|buildRetrievalIndex|setItem|removeItem|fetch\s*\(/.test(metaBuilder), false);
assert.equal(/rawPayload|privateCorpus|memoryDump|chatHistory/.test(metaBuilder), false);

const status = read(STATUS_FILE).toLowerCase();
for (const expected of [
  "operator recommendations ux: reviewed",
  "operator recommendations ux: test-locked",
  "minimal operator recommendations implementation",
  "recommendation builder: read-only/local-first",
  "training dashboard: cached summary only",
  "meta insights: compact/redacted recommendation summary only",
  "sync hub execution: no-go",
  "auto-sync: permanently forbidden",
  "test: lock personal ai loop operator recommendations behavior"
]) {
  assert.ok(status.includes(expected), `status doc must include ${expected}`);
}
assert.equal(fs.existsSync("sync.html"), false, "sync.html must still not exist");

console.log("aha-personal-ai-loop-operator-recommendations-behavior.test.cjs passed");
