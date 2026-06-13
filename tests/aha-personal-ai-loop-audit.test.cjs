const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function makeContext() {
  const store = new Map();
  const context = {
    console, Date, Math, JSON,
    localStorage: {
      getItem: (key) => store.get(key) || null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key)
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  return { context, store };
}

function run(file, context) {
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

function loadLoop(context) {
  [
    "js/metaInsightsMemory.js",
    "js/ahaTrainingCorpus.js",
    "js/ahaTrainingExamples.js",
    "js/ahaPersonalModelReadiness.js",
    "js/ahaPersonalRetrieval.js",
    "js/ahaChatPersonalContext.js",
    "js/ahaPersonalAiLoopAudit.js"
  ].forEach((file) => run(file, context));
}

// 1–2. Tomme lagre håndteres, og alle lastede datakilder oppdages.
{
  const { context, store } = makeContext();
  loadLoop(context);
  const api = context.AHAPersonalAiLoopAudit;
  const sources = api.checkDataSources();
  assert.equal(sources.ok, true);
  assert.equal(sources.availableCount, 6);
  assert.deepEqual(sources.missing, []);
  const audit = api.runAudit({ now: "2026-06-13T00:00:00.000Z" });
  assert.equal(audit.status, "empty");
  assert.equal(audit.readiness.approvedCorpus, 0);
  assert.equal(audit.readiness.approvedExamples, 0);
  assert.equal(store.has(context.AHAPersonalRetrieval.STORAGE_KEY), false, "read-only audit skal ikke bygge eller lagre retrieval-indeks");
}

// 3–6 og 12. Full flyt: memory + corpus + example → index → retrieval → chat/RAG.
{
  const { context } = makeContext();
  loadLoop(context);
  context.AHAMetaInsightsMemory.addFeedback({
    claimId: "claim-project",
    claimText: "Mitt viktigste prosjekt er AHA Personal AI Loop med forklarbar retrieval.",
    response: "stemmer",
    basis: ["Brukeren beskrev prosjektet."]
  });
  context.AHATrainingCorpus.addCorpusItem({
    id: "corpus-loop",
    title: "AHA Personal AI Loop",
    text: "Prosjektet kobler godkjent kunnskap, personlige begreper og retrieval til chat-kontekst.",
    project: "AHA Personal AI Loop",
    concepts: ["personlig retrieval", "chat-kontekst"],
    status: "approved",
    consent: { useForKnowledge: true, useForMemory: false }
  });
  context.AHATrainingCorpus.addCorpusItem({
    id: "corpus-private",
    title: "Privat utkast",
    text: "Dette skal aldri nå retrieval.",
    status: "approved",
    consent: { useForKnowledge: false, useForMemory: false }
  });
  context.AHATrainingExamples.addExample({
    id: "example-loop",
    corpusItemId: "corpus-loop",
    taskType: "project_explanation",
    input: "Forklar mitt viktigste prosjekt og begrepene.",
    output: "AHA Personal AI Loop gjør godkjent personlig kunnskap tilgjengelig i chat via retrieval.",
    language: "no",
    status: "approved"
  });

  const material = context.AHAPersonalAiLoopAudit.checkApprovedMaterial();
  assert.equal(material.confirmedClaims, 1);
  assert.equal(material.approvedCorpus, 2);
  assert.equal(material.knowledgeAllowedCorpus, 1);
  assert.equal(material.approvedExamples, 1);
  assert.equal(material.examplesByTaskType.project_explanation, 1);

  const before = context.AHAPersonalAiLoopAudit.checkRetrievalIndex();
  assert.equal(before.available, false);
  assert.equal(before.needsRefresh, true);
  const readOnlySimulation = context.AHAPersonalAiLoopAudit.simulateQuery("AHA Personal AI Loop retrieval");
  assert.equal(readOnlySimulation.usedPersistedIndex, false);
  assert.equal(context.AHAPersonalRetrieval.loadRetrievalIndex(), null, "query-simulering skal ikke persistere indeks");
  assert.ok(readOnlySimulation.resultCount >= 3);
  const index = context.AHAPersonalRetrieval.refreshRetrievalIndex({ now: "2026-06-13T12:00:00.000Z" });
  assert.equal(JSON.stringify(index).includes("Dette skal aldri nå retrieval"), false);

  const simulated = context.AHAPersonalAiLoopAudit.simulateQuery("Forklar mitt viktigste AHA Personal AI Loop prosjekt og retrieval-begreper");
  assert.equal(simulated.ok, true);
  assert.ok(simulated.resultCount >= 3);
  assert.ok(simulated.promptPreview.includes("AHA Personal Retrieval"));
  assert.ok(simulated.topResults.every((item) => item.source && item.score > 0 && item.reasons.length));

  const message = context.AHAChatPersonalContext.buildMessageContext("Forklar mitt viktigste AHA Personal AI Loop prosjekt");
  assert.ok(message.prompt.includes("AHA Personal Retrieval"));
  assert.ok(message.retrieval.results.some((item) => item.source === "meta_insights_memory"));
  assert.ok(message.retrieval.results.some((item) => item.source === "training_corpus"));
  assert.ok(message.retrieval.results.some((item) => item.source === "training_examples"));

  const privacy = context.AHAPersonalAiLoopAudit.checkPrivacyAndConsent();
  assert.equal(privacy.ok, true);
  assert.equal(privacy.approvedOnly, true);
  assert.equal(privacy.consentAware, true);
}

// 7–10. Training og Chat laster audit og eksponerer nødvendig UI.
{
  const training = fs.readFileSync("training.html", "utf8");
  const dashboard = fs.readFileSync("js/ahaTrainingDashboard.js", "utf8");
  const chat = fs.readFileSync("chat.html", "utf8");
  const chatScript = fs.readFileSync("js/ahaChat.js", "utf8");
  assert.ok(training.includes("js/ahaPersonalAiLoopAudit.js"));
  assert.ok(training.includes("Personal AI Loop Audit"));
  assert.ok(training.includes("Kjør AI-loop audit"));
  assert.ok(dashboard.includes("aha_personal_ai_loop_audit_v1"));
  assert.ok(chat.includes('id="aha-personal-ai-loop-summary"'));
  assert.ok(chat.includes("aha-personal-ai-loop-status"));
  assert.ok(chatScript.includes("Personal AI Loop: aktiv"));
}

// 11. Meta Insights Agent mottar kompakt personalAiLoopPack.
{
  const { context } = makeContext();
  context.AHAPersonalAiLoopAudit = {
    loadLastAudit: () => ({
      status: "working",
      score: 78,
      readiness: { approvedCorpus: 4, approvedExamples: 3 },
      retrieval: { indexedItems: 9, available: true },
      recommendations: ["Kjør testmelding i chat."]
    })
  };
  run("js/metaInsightsAgent.js", context);
  const agentContext = context.AHAMetaInsightsAgent.buildAgentContext({ meta_insight: {}, temporal: {} });
  assert.equal(agentContext.personalAiLoopPack.status, "working");
  assert.equal(agentContext.personalAiLoopPack.indexedItems, 9);
  assert.equal(agentContext.personalAiLoopPack.retrievalAvailable, true);
}

console.log("aha-personal-ai-loop-audit tests passed");
