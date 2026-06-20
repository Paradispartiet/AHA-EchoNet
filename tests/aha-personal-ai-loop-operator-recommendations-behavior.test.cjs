const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const AUDIT_FILE = "js/ahaPersonalAiLoopAudit.js";
const TRAINING_FILE = "js/ahaTrainingDashboard.js";
const META_FILE = "js/metaInsightsAgent.js";
const CHAT_FILE = "js/ahaChat.js";
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

for (const missing of [null, undefined, "", 0, false, [], "not-json"]) {
  const recommendations = api.buildOperatorRecommendations(missing);
  assert.ok(Array.isArray(recommendations));
  assert.notDeepEqual(new Set(recommendations.map((item) => item.severity)), new Set(["ok"]), "missing/invalid input must not return ok as the only status");
  assert.ok(recommendations.some((item) => item.severity === "blocker"), "missing/invalid input must fail closed with a blocker");
  assert.ok(recommendations.every((item) => item.requiresExplicitAction === true));
  const blocker = recommendations.find((item) => item.severity === "blocker");
  assert.match(blocker.message, /unknown|missing/i);
  assert.match(blocker.allowedNextStep, /manual|review|audit|Training Dashboard/i);
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
  assert.match(rec.allowedNextStep, /manual|review|approve|confirm|add|keep|explicit/i, "allowed next step must remain manual/operator controlled");
  const recText = flatten(rec);
  for (const unsafe of ["raw private corpus", "raw corpus", "full memory", "memory dump", "full chat history", "chat history", "sk-secret", "api key", "token value"]) {
    assert.equal(recText.includes(unsafe), false, `recommendation ${rec.id} must not expose ${unsafe}`);
  }
}
assert.ok(recommendations.some((item) => item.severity === "blocker"), "blockers must remain present");
assert.ok(recommendations.some((item) => item.severity === "warning"), "warnings must remain present");
assert.ok(recommendations.filter((item) => ["info", "suggestion"].includes(item.severity)).every((item) => item.requiresExplicitAction === true), "info/suggestion must not trigger automatic actions");
assert.ok(recommendations.every((item) => item.forbiddenAutomation.includes("sync_hub") && item.forbiddenAutomation.includes("remote_write") && item.forbiddenAutomation.includes("auto_sync")), "every severity must forbid sync/write automation");
assert.ok(recommendations.some((item) => item.id === "privacy_review_required"));
assert.ok(recommendations.some((item) => item.id === "retrieval_index_missing"));
assert.ok(recommendations.some((item) => item.id === "too_few_approved_examples"));
assert.ok(recommendations.some((item) => item.id === "sample_query_failed"));
assert.ok(recommendations.some((item) => item.id === "confirm_important_memory"));


const categoryAudit = {
  status: "mystery",
  summary: "compact cached summary only",
  checks: {
    approvedMaterial: { approvedCorpus: 2, approvedExamples: 0, confirmedClaims: 0, importantClaims: 0 },
    sampleQuery: { ok: false, resultCount: 1, reasons: [] },
    privacyAndConsent: { ok: false, consentAware: false },
    chatIntegration: { ok: false }
  },
  retrieval: { available: true, indexedItems: 2, needsRefresh: true },
  semanticRetrieval: { hasReasons: false }
};
const categoryRecommendations = api.buildOperatorRecommendations(categoryAudit);
const categoryText = flatten(categoryRecommendations);
for (const expected of [
  "unknown_audit_status", "retrieval_index_stale", "too_few_approved_corpus_items",
  "too_few_approved_examples", "confirm_important_memory", "sample_query_failed",
  "low_explainability", "privacy_review_required", "chat_integration_review",
  "review_warnings_before_implementation"
]) {
  assert.ok(categoryRecommendations.some((item) => item.id === expected), `category coverage must include ${expected}`);
}
for (const phrase of [
  "manual", "review", "consent", "approved", "memory", "warnings", "compact",
  "raw payload must stay hidden", "source", "stale", "retrieval"
]) {
  assert.ok(categoryText.includes(phrase), `recommendation categories should represent ${phrase}`);
}

const serialized = flatten(recommendations);
for (const secret of ["raw private corpus", "full memory dump", "full chat history", "sk-secret-token", "api key"]) {
  assert.equal(serialized.includes(secret), false, `recommendations must not expose ${secret}`);
}
const compact = api.buildCompactOperatorRecommendationSummary(sampleAudit);
assert.equal(compact.compactOnly, true);
assert.equal(compact.redacted, true);
assert.ok(compact.countsBySeverity.blocker >= 1);
assert.deepEqual(Object.keys(compact).sort(), ["compactOnly", "countsBySeverity", "operatorNextStep", "redacted", "status", "topBlockerWarningTitles"].sort());
for (const unsafe of ["raw private corpus", "full memory dump", "full chat history", "raw audit payload", "sk-secret-token", "api key", "token"]) {
  assert.equal(flatten(compact).includes(unsafe), false, `compact summary must not expose ${unsafe}`);
}
assert.ok(Object.prototype.hasOwnProperty.call(compact.countsBySeverity, "blocker"));
assert.ok(Array.isArray(compact.topBlockerWarningTitles));
assert.equal(typeof compact.operatorNextStep, "string");

const auditCode = read(AUDIT_FILE);
for (const forbidden of [
  /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bsendBeacon\b/, /supabase\s*\./i,
  /\.(?:insert|upsert|delete|update)\s*\(/, /executeSync|runSync|performSync|startSync|enableExecution/,
  /DOMContentLoaded|addEventListener\s*\(\s*["'](?:load|storage|message)/,
  /refreshRetrievalIndex|buildRetrievalIndex/, /dispatchEvent\s*\(\s*new\s+CustomEvent/
]) {
  assert.equal(forbidden.test(auditCode), false, `audit recommendations must not add forbidden behavior: ${forbidden}`);
}

const mutatingAudit = { status: "partial", checks: { approvedMaterial: { approvedCorpus: 1 } }, retrieval: { available: false, indexedItems: 0 } };
const beforeMutation = JSON.stringify(mutatingAudit);
api.buildOperatorRecommendations(mutatingAudit);
assert.equal(JSON.stringify(mutatingAudit), beforeMutation, "builder must not mutate its input object");

const instrumentedApi = loadAudit({
  localStorage: { getItem() { throw new Error("no localStorage reads during builder test"); }, setItem() { throw new Error("no localStorage writes"); }, removeItem() { throw new Error("no localStorage removes"); } },
  fetch() { throw new Error("fetch must not be used"); },
  XMLHttpRequest() { throw new Error("XHR must not be used"); },
  navigator: { sendBeacon() { throw new Error("sendBeacon must not be used"); } },
  AHASyncHub: { runSync() { throw new Error("Sync Hub must not run"); } },
  AHAPersonalRetrieval: { refreshRetrievalIndex() { throw new Error("must not refresh retrieval index"); }, buildRetrievalIndex() { throw new Error("must not build retrieval index"); } }
});
instrumentedApi.buildOperatorRecommendations(sampleAudit);
instrumentedApi.buildCompactOperatorRecommendationSummary(sampleAudit);

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

const chatCode = read(CHAT_FILE);
for (const forbidden of [
  /runAudit\s*\(/, /buildOperatorRecommendations/, /buildCompactOperatorRecommendationSummary/,
  /rawAudit|auditPayload|privateCorpus|memoryDump|chatHistory/,
  /executeSync|runSync|performSync|startSync|autoSync|auto-sync/i,
  /dispatchEvent\s*\([^)]*(?:sync|publish|share)/i, /social posting/i
]) {
  assert.equal(forbidden.test(chatCode), false, `chat boundary must not include forbidden Personal AI Loop behavior: ${forbidden}`);
}

for (const [file, source] of [[AUDIT_FILE, auditCode], [TRAINING_FILE, read(TRAINING_FILE)], [META_FILE, read(META_FILE)]]) {
  for (const forbidden of [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /sendBeacon/, /supabase/i, /\.(?:insert|update|upsert|delete)\s*\(/, /AHARepository\.save/]) {
    assert.equal(forbidden.test(source), false, `${file} must not contain forbidden pattern ${forbidden}`);
  }
}
assert.equal(/import.*sync|SyncHub|executeSync|runSync|performSync|startSync/.test(auditCode), false, "operator recommendations must not import or call Sync Hub execution");

const status = read(STATUS_FILE).toLowerCase();
for (const expected of [
  "operator recommendations ux: reviewed",
  "operator recommendations ux: test-locked",
  "operator recommendations behavior: test-locked",
  "operator recommendations are minimally implemented",
  "minimal operator recommendations implementation",
  "recommendation builder: read-only/local-first",
  "training dashboard: cached summary only",
  "meta insights: compact/redacted recommendation summary only",
  "sync hub execution: no-go",
  "auto-sync: permanently forbidden",
  "test: lock personal ai loop operator recommendations behavior",
  "docs: review personal ai loop chat readiness surface"
]) {
  assert.ok(status.includes(expected), `status doc must include ${expected}`);
}
assert.equal(fs.existsSync("sync.html"), false, "sync.html must still not exist");

console.log("aha-personal-ai-loop-operator-recommendations-behavior.test.cjs passed");
