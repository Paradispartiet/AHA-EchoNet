const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const AUDIT_KEY = "aha_personal_ai_loop_audit_v1";
const AUDIT_FILE = "js/ahaPersonalAiLoopAudit.js";
const TRAINING_FILE = "js/ahaTrainingDashboard.js";
const CHAT_FILE = "js/ahaChat.js";
const META_FILE = "js/metaInsightsAgent.js";

function read(file) {
  return fs.readFileSync(file, "utf8");
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeAuditContext(overrides = {}) {
  const writes = [];
  const removals = [];
  const store = new Map(overrides.initialStore || []);
  const context = {
    console, Date, Math, JSON,
    localStorage: {
      getItem(key) { return store.get(key) || null; },
      setItem(key, value) { writes.push(key); store.set(key, String(value)); },
      removeItem(key) { removals.push(key); store.delete(key); },
      clear() { removals.push("*"); store.clear(); }
    },
    ...overrides.globals
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read(AUDIT_FILE), context, { filename: AUDIT_FILE });
  return { context, store, writes, removals };
}

const auditCode = read(AUDIT_FILE);
const trainingCode = read(TRAINING_FILE);
const chatCode = read(CHAT_FILE);
const metaCode = read(META_FILE);

// A. Public audit API is explicit and stable.
{
  const { context } = makeAuditContext();
  assert.ok(context.AHAPersonalAiLoopAudit);
  for (const method of [
    "runAudit", "checkDataSources", "checkApprovedMaterial", "checkRetrievalIndex",
    "simulateQuery", "checkChatIntegration", "checkPrivacyAndConsent",
    "checkSemanticRetrieval", "buildRecommendations", "loadLastAudit"
  ]) {
    assert.equal(typeof context.AHAPersonalAiLoopAudit[method], "function", `${method} must be exposed`);
  }
}

// B–D. Only approved/consented source material is counted, and an audit is domain-read-only.
{
  const memory = {
    confirmedClaims: [{ id: "confirmed", claimText: "confirmed safe claim" }],
    importantClaims: [{ id: "important", claimText: "important safe claim" }],
    unconfirmedClaims: [{ id: "unconfirmed", claimText: "must not be used" }],
    rawPayload: { password: "must-not-leak" }
  };
  const corpus = [
    { id: "knowledge", status: "approved", text: "knowledge safe", consent: { useForKnowledge: true } },
    { id: "memory", status: "approved", text: "memory safe", consent: { useForMemory: true } },
    { id: "draft", status: "draft", text: "draft forbidden", consent: { useForKnowledge: true } },
    { id: "rejected", status: "rejected", text: "rejected forbidden", consent: { useForMemory: true } },
    { id: "no-consent", status: "approved", text: "no consent forbidden", consent: {} }
  ];
  const examples = [
    { id: "approved-example", status: "approved", taskType: "memory_fact", output: "safe example" },
    { id: "draft-example", status: "draft", output: "draft forbidden" },
    { id: "rejected-example", status: "rejected", output: "rejected forbidden" }
  ];
  const retrievalIndex = {
    generatedAt: "2026-06-14T00:00:00.000Z",
    items: [
      { source: "meta_insights_memory", sourceType: "confirmed_claim" },
      { source: "meta_insights_memory", sourceType: "important_claim" },
      { source: "training_corpus", meta: { status: "approved" }, consent: { useForKnowledge: true } },
      { source: "training_corpus", meta: { status: "approved" }, consent: { useForMemory: true } },
      { source: "training_examples", meta: { status: "approved" } }
    ]
  };
  const domain = {
    memory, corpus, examples, retrievalIndex,
    chatMessages: [{ role: "user", text: "private chat" }],
    metaInsightsMemory: { token: "private-token" },
    syncHub: { status: "NO-GO", autoSync: false },
    repository: { records: [{ id: "repo-record" }] }
  };
  const before = clone(domain);
  let receivedIndex = null;
  const { context, writes, removals } = makeAuditContext({
    globals: {
      AHAMetaInsightsMemory: {
        summarizeMemory: () => domain.memory,
        loadMemory: () => ({ updatedAt: "2026-06-13T00:00:00.000Z" })
      },
      AHATrainingCorpus: { loadCorpus: () => domain.corpus },
      AHATrainingExamples: { loadExamples: () => domain.examples },
      AHAPersonalModelReadiness: { buildReadinessReport: () => ({ level: "building" }) },
      AHAChatPersonalContext: { buildPersonalContext: () => ({ summary: "compact" }) },
      AHAPersonalRetrieval: {
        getRetrievalStatus: () => ({ available: true, indexedItems: 5, lastBuiltAt: "2026-06-14T00:00:00.000Z" }),
        loadRetrievalIndex: () => domain.retrievalIndex,
        buildRagContext: (_query, options) => {
          receivedIndex = options.index;
          return { results: [{ source: "training_corpus", title: "safe", score: 1, reasons: ["approved"] }] };
        },
        buildRagPromptBlock: () => "AHA Personal Retrieval: approved summary"
      },
      AHASemanticRetrieval: {
        getSemanticStatus: () => ({ available: false }),
        searchSemanticKnowledge: () => ({ results: [] }),
        hybridSearch: () => ({ results: [] })
      }
    }
  });

  const approved = context.AHAPersonalAiLoopAudit.checkApprovedMaterial();
  assert.equal(approved.confirmedClaims, 1);
  assert.equal(approved.importantClaims, 1);
  assert.equal(approved.approvedCorpus, 2, "approved corpus without knowledge/memory consent must be excluded");
  assert.equal(approved.knowledgeAllowedCorpus, 1);
  assert.equal(approved.memoryAllowedCorpus, 1);
  assert.equal(approved.approvedExamples, 1);

  const audit = context.AHAPersonalAiLoopAudit.runAudit({ now: "2026-06-14T00:00:00.000Z" });
  assert.ok(audit && typeof audit === "object");
  assert.strictEqual(receivedIndex, retrievalIndex, "audit must query only the already persisted retrieval index");
  assert.deepEqual(domain, before, "audit must not mutate memory, corpus, examples, retrieval, chat, Meta Insights, Sync Hub, or repository data");
  assert.deepEqual(writes, [], "runAudit must not write localStorage");
  assert.deepEqual(removals, [], "runAudit must not remove or clear localStorage");
  assert.equal(JSON.stringify(audit).includes("must-not-leak"), false);
  assert.equal(JSON.stringify(audit).includes("private-token"), false);
  assert.equal(JSON.stringify(audit).includes("private chat"), false);
}

// Missing retrieval state must fail read-only instead of building/persisting an index.
{
  let built = 0;
  const { context, writes } = makeAuditContext({
    globals: {
      AHAPersonalRetrieval: {
        loadRetrievalIndex: () => null,
        buildRetrievalIndex: () => { built += 1; return { items: [] }; },
        refreshRetrievalIndex: () => { built += 1; return { items: [] }; }
      },
      AHAChatPersonalContext: {
        buildPersonalContext: () => ({}),
        buildMessageContext: () => { built += 1; return {}; }
      }
    }
  });
  const result = context.AHAPersonalAiLoopAudit.simulateQuery("read only");
  const privacy = context.AHAPersonalAiLoopAudit.checkPrivacyAndConsent();
  assert.equal(result.ok, false);
  assert.equal(privacy.ok, true);
  assert.equal(built, 0, "audit must not build, refresh, or indirectly persist retrieval state");
  assert.deepEqual(writes, []);
}

// The only permitted cache key belongs to the explicit Training click handler.
{
  const handler = extractFunction(trainingCode, "handleAiLoopAudit");
  assert.match(handler, /localStorage\?\.setItem\("aha_personal_ai_loop_audit_v1"/);
  assert.equal(/removeItem\s*\(|\.clear\s*\(/.test(handler), false);
  const keys = [...handler.matchAll(/setItem\s*\(\s*["']([^"']+)/g)].map((match) => match[1]);
  assert.deepEqual(keys, [AUDIT_KEY]);
  for (const forbiddenKey of [
    "aha_personal_retrieval_index_v1", "chat_history", "training_corpus",
    "training_examples", "meta_insights_memory", "sync", "audit_history", "aha_repository"
  ]) {
    assert.equal(handler.includes(forbiddenKey), false, `audit handler must not write ${forbiddenKey}`);
  }
}

// E–F. Audit paths contain no remote/write/sync/publish APIs and cannot auto-run.
const forbiddenAuditPatterns = [
  /\bsupabase\s*\.\s*from/i, /\.(?:insert|upsert|delete|update)\s*\(/, /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/, /\bsendBeacon\b/, /\bAHARepository\s*\.\s*(?:save|load)\b/,
  /\b(?:syncFromDatabase|executeSync|runSync|performSync|startSync|enableExecution)\b/,
  /\b(?:executeRollback|performRollback)\b/, /\b(?:writeAudit|saveAudit|recordAudit)\b/,
  /dispatchEvent\s*\(\s*new\s+CustomEvent/, /\bsource_events\b/, /\bcreateInsight\b/,
  /\bpublish\b/i, /\bshare\b/i, /\bsetInterval\s*\(/, /\bsetTimeout\s*\(/
];
for (const pattern of forbiddenAuditPatterns) {
  assert.equal(pattern.test(auditCode), false, `audit module must not contain ${pattern}`);
}
assert.equal(/DOMContentLoaded|addEventListener\s*\(\s*["']storage|runAudit\s*\(\s*\)\s*;?\s*$/m.test(auditCode), false);

// G–H. Training runs only from the button handler; Chat only reads compact cached status.
{
  const renderTraining = extractFunction(trainingCode, "renderAiLoopAudit");
  const trainingHandler = extractFunction(trainingCode, "handleAiLoopAudit");
  const chatStatus = extractFunction(chatCode, "renderAhaPersonalAiLoopStatus");
  assert.ok(read("training.html").includes('id="training-ai-loop-audit-btn"'));
  assert.match(trainingCode, /training-ai-loop-audit-btn"\)\?\.addEventListener\("click", handleAiLoopAudit\)/);
  assert.equal(/runAudit\s*\(/.test(renderTraining), false, "Training render must not auto-run audit");
  assert.match(trainingHandler, /api\.runAudit\s*\(/);
  assert.equal(/refreshRetrievalIndex|buildRetrievalIndex|syncFromDatabase|fetch\s*\(/.test(trainingHandler), false);
  assert.match(read("chat.html"), /aha-personal-ai-loop-status/);
  assert.match(chatStatus, /loadLastAudit\s*\(/);
  assert.equal(/runAudit|buildRetrievalIndex|refreshRetrievalIndex|fetch\s*\(|setItem\s*\(|removeItem\s*\(/.test(chatStatus), false);
}

// I–J. Meta Insights receives only a compact, redacted cache-derived pack.
{
  const packBuilder = extractFunction(metaCode, "buildPersonalAiLoopPackSafe");
  assert.match(packBuilder, /loadLastAudit/);
  assert.equal(/runAudit|buildRetrievalIndex|refreshRetrievalIndex|setItem|removeItem|fetch\s*\(/.test(packBuilder), false);
  const { context } = makeAuditContext();
  context.AHAPersonalAiLoopAudit = {
    loadLastAudit: () => ({
      status: "working", score: 91, summary: "safe summary",
      checks: { approvedMaterial: { approvedCorpus: 2, approvedExamples: 3 } },
      retrieval: { indexedItems: 7, available: true },
      recommendations: ["safe recommendation"],
      corpus: [{ text: "FULL CORPUS password secret" }],
      memory: { rawPayload: "FULL MEMORY token api_key" },
      chatHistory: ["FULL CHAT connectionString"]
    }),
    runAudit: () => assert.fail("Meta Insights must not run audit while building context")
  };
  vm.runInContext(metaCode, context, { filename: META_FILE });
  const pack = context.AHAMetaInsightsAgent.buildAgentContext({ meta_insight: {}, temporal: {} }).personalAiLoopPack;
  assert.deepEqual(Object.keys(pack).sort(), [
    "approvedCorpus", "approvedExamples", "indexedItems", "recommendations",
    "retrievalAvailable", "score", "status"
  ]);
  const serialized = JSON.stringify(pack).toLowerCase();
  for (const forbidden of ["password", "token", "secret", "apikey", "api_key", "connectionstring", "full corpus", "full memory", "full chat"]) {
    assert.equal(serialized.includes(forbidden), false, `personalAiLoopPack must redact ${forbidden}`);
  }
}

// K. Existing Sync Hub and Home loading boundaries remain unchanged.
{
  const docs = read("docs/AHA_IMPLEMENTATION_STATUS.md");
  const home = read("index.html");
  assert.equal(fs.existsSync("sync.html"), false);
  assert.ok(docs.includes("## 33. AHA Sync Hub execution page implementation boundary"));
  assert.match(docs, /Manual sync execution remains NO-GO|Execution: NO-GO/);
  assert.match(docs, /Auto-sync (?:is |er )?(?:still )?(?:permanently forbidden|permanent forbudt)/i);
  assert.ok(docs.includes("## 34. Personal AI Loop Audit"));
  for (const moduleFile of ["js/ahaLists.js", "js/ahaPaths.js", "js/ahaGroups.js", "js/ahaAvisa.js"]) {
    assert.equal(home.includes(moduleFile), false, `Home must not load ${moduleFile}`);
  }
}

console.log("aha-personal-ai-loop-read-only-boundary.test.cjs passed");
