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

// 1. runAudit() håndterer tomme lagre.
{
  const { context } = makeContext();
  loadLoop(context);
  const audit = context.AHAPersonalAiLoopAudit.runAudit({ now: "2026-06-13T00:00:00.000Z" });
  assert.equal(audit.status, "empty");
  assert.ok(audit.score >= 0 && audit.score <= 100);
  assert.equal(audit.checks.approvedMaterial.approvedCorpus, 0);
  assert.equal(audit.checks.sampleQuery.resultCount, 0);
}

// 2–6 og 12. Full flyt: memory + corpus + example → retrieval → chat/RAG.
{
  const { context } = makeContext();
  loadLoop(context);
  context.AHAMetaInsightsMemory.addFeedback({
    claimId: "memory-1",
    claimText: "AHA-EchoNet er mitt viktigste prosjekt for personlig retrieval.",
    response: "stemmer",
    basis: ["brukerbekreftet"]
  });
  const corpus = context.AHATrainingCorpus.addCorpusItem({
    id: "corpus-loop",
    title: "AHA-EchoNet Personal AI Loop",
    text: "Prosjektet AHA-EchoNet kobler godkjent minne, corpus og eksempler til personlig retrieval og RAG-kontekst.",
    project: "AHA-EchoNet",
    concepts: ["personlig retrieval", "RAG-kontekst"],
    status: "approved",
    consent: { useForKnowledge: true, useForMemory: false }
  });
  context.AHATrainingExamples.addExample({
    id: "example-loop",
    corpusItemId: corpus.id,
    taskType: "project_explanation",
    input: "Forklar AHA-EchoNet og personlig retrieval.",
    output: "AHA-EchoNet bygger en consent-aware Personal AI Loop.",
    language: "no",
    status: "approved",
    meta: { project: "AHA-EchoNet", concepts: ["personlig retrieval"] }
  });
  context.AHAPersonalRetrieval.refreshRetrievalIndex({ now: "2026-06-13T23:59:59.999Z" });

  const api = context.AHAPersonalAiLoopAudit;
  const sources = api.checkDataSources();
  assert.equal(sources.ok, true);
  assert.equal(sources.availableCount, 6);

  const material = api.checkApprovedMaterial();
  assert.equal(material.confirmedClaims, 1);
  assert.equal(material.approvedCorpus, 1);
  assert.equal(material.approvedExamples, 1);
  assert.equal(material.knowledgeAllowedCorpus, 1);
  assert.equal(material.examplesByTaskType.project_explanation, 1);

  const retrieval = api.checkRetrievalIndex();
  assert.equal(retrieval.available, true);
  assert.ok(retrieval.indexedItems >= 3);
  assert.equal(retrieval.needsRefresh, false);

  const simulation = api.simulateQuery("Forklar AHA-EchoNet personlig retrieval og RAG-kontekst", { forceLexical: true });
  assert.equal(simulation.ok, true);
  assert.ok(simulation.resultCount >= 3);
  assert.ok(simulation.promptPreview.includes("AHA Personal Retrieval"));
  assert.ok(simulation.topResults.every((item) => item.source && item.score > 0 && item.reasons.length));

  const privacy = api.checkPrivacyAndConsent();
  assert.equal(privacy.ok, true);
  assert.equal(privacy.approvedOnly, true);
  assert.equal(privacy.consentAware, true);

  const message = context.AHAChatPersonalContext.buildMessageContext("Forklar AHA-EchoNet personlig retrieval og RAG-kontekst", { forceLexical: true });
  assert.ok(message.prompt.includes("Relevant personlig kunnskap fra AHA"));
  assert.ok(message.retrieval.results.some((item) => item.source === "meta_insights_memory"));
  assert.ok(message.retrieval.results.some((item) => item.source === "training_corpus"));
  assert.ok(message.retrieval.results.some((item) => item.source === "training_examples"));

  const audit = api.runAudit({ query: "Forklar AHA-EchoNet personlig retrieval og RAG-kontekst", forceLexical: true });
  assert.ok(["working", "strong"].includes(audit.status));
  assert.ok(audit.dataFlow.ragPromptBlock);
  assert.ok(audit.dataFlow.explainableReasons);
}

// 4. Manglende indeks oppdages når godkjent materiale finnes.
{
  const { context } = makeContext();
  loadLoop(context);
  context.AHATrainingCorpus.addCorpusItem({
    title: "Godkjent kunnskap", text: "Et prosjektbegrep.", status: "approved",
    consent: { useForKnowledge: true }
  });
  const status = context.AHAPersonalAiLoopAudit.checkRetrievalIndex();
  assert.equal(status.available, false);
  assert.equal(status.needsRefresh, true);
}

// 7–11. Statiske UI- og agentintegrasjoner.
{
  const training = fs.readFileSync("training.html", "utf8");
  const chat = fs.readFileSync("chat.html", "utf8");
  const dashboard = fs.readFileSync("js/ahaTrainingDashboard.js", "utf8");
  assert.ok(training.includes("js/ahaPersonalAiLoopAudit.js"));
  assert.ok(training.includes("Personal AI Loop Audit"));
  assert.ok(training.includes("Kjør AI-loop audit"));
  assert.ok(dashboard.includes("aha_personal_ai_loop_audit_v1"));
  assert.ok(chat.includes("Personal AI Loop: aktiv"));
  assert.ok(chat.includes("aha-personal-ai-loop-status"));

  const { context } = makeContext();
  context.AHAPersonalAiLoopAudit = {
    loadLastAudit: () => ({
      status: "working", score: 78,
      checks: { approvedMaterial: { approvedCorpus: 2, approvedExamples: 3 } },
      retrieval: { available: true, indexedItems: 8 },
      recommendations: ["Kontroller reasons."]
    })
  };
  run("js/metaInsightsAgent.js", context);
  const agentContext = context.AHAMetaInsightsAgent.buildAgentContext({ meta_insight: {}, temporal: {} });
  assert.equal(agentContext.personalAiLoopPack.status, "working");
  assert.equal(agentContext.personalAiLoopPack.approvedCorpus, 2);
  assert.equal(agentContext.personalAiLoopPack.approvedExamples, 3);
  assert.equal(agentContext.personalAiLoopPack.indexedItems, 8);
  assert.equal(agentContext.personalAiLoopPack.retrievalAvailable, true);
}

console.log("aha-personal-ai-loop-audit tests passed");
