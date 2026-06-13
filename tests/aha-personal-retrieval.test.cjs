const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function makeContext(extra = {}) {
  const store = new Map();
  const context = {
    console, Date, Math, JSON,
    localStorage: {
      getItem: (key) => store.get(key) || null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key)
    },
    ...extra
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  return { context, store };
}

function run(file, context) {
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

// 1. Tomme lagre håndteres og readiness er eneste kompakte status-item.
{
  const { context } = makeContext();
  run("js/ahaPersonalRetrieval.js", context);
  const index = context.AHAPersonalRetrieval.buildRetrievalIndex({ now: "2026-06-13T00:00:00.000Z" });
  assert.equal(index.version, "v1");
  assert.equal(index.stats.total, 0);
  assert.deepEqual(index.items, []);
}

function richContext() {
  return makeContext({
    AHAMetaInsightsMemory: {
      summarizeMemory: () => ({
        confirmedClaims: [{ id: "m1", claimText: "Jeg bygger prosjektet AHA Retrieval om lokal kunnskap." }],
        importantClaims: [{ id: "m2", claimText: "Forklarbar personalisering er viktig." }]
      }),
      buildMemoryPack: () => ({ confirmed_claims: ["Jeg bygger prosjektet AHA Retrieval."] })
    },
    AHATrainingCorpus: {
      loadCorpus: () => [
        { id: "c1", title: "AHA Retrieval arkitektur", text: "Lokal lexical RAG med forklarbare begreper.", project: "AHA Retrieval", concepts: ["lexical RAG"], tags: ["lokal"], language: "no", status: "approved", consent: { useForKnowledge: true } },
        { id: "c2", title: "Privat", text: "Ikke tillatt", status: "approved", consent: { useForKnowledge: false, useForMemory: false } },
        { id: "c3", title: "Utkast", text: "Ikke godkjent", status: "raw", consent: { useForKnowledge: true } }
      ]
    },
    AHATrainingExamples: {
      loadExamples: () => [
        { id: "e1", taskType: "project_explanation", input: "Forklar AHA Retrieval", output: "Et lokalt personlig søk.", language: "no", status: "approved", labels: ["RAG"] },
        { id: "e2", taskType: "summary", input: "Utkast", output: "Skal bort", status: "draft" }
      ]
    },
    AHAPersonalModelReadiness: {
      buildReadinessReport: () => ({ generatedAt: "2026-06-13T00:00:00.000Z", level: "bygger", score: 44, summary: "Materialet bygges.", ragReadiness: { ready: false } }),
      buildCompactPack: (report) => ({ level: report.level, score: report.score, summary: report.summary })
    }
  });
}

// 2–4. Approved/samtykket corpus, approved examples og confirmed/important memory indekseres.
{
  const { context } = richContext();
  run("js/ahaPersonalRetrieval.js", context);
  const index = context.AHAPersonalRetrieval.buildRetrievalIndex();
  assert.equal(index.stats.corpusItems, 1);
  assert.equal(index.stats.examples, 1);
  assert.equal(index.stats.memoryClaims, 2);
  assert.equal(index.stats.readinessItems, 1);
  assert.ok(index.items.some((item) => item.sourceType === "confirmed_claim"));
  assert.ok(index.items.some((item) => item.sourceType === "important_claim"));
  assert.equal(JSON.stringify(index).includes("Ikke tillatt"), false);
  assert.equal(JSON.stringify(index).includes("Ikke godkjent"), false);
}

// 5. Tokenisering normaliserer og fjerner korte ord/fyllord.
{
  const { context } = makeContext();
  run("js/ahaPersonalRetrieval.js", context);
  assert.deepEqual(context.AHAPersonalRetrieval.tokenize("Jeg og du bygger RAG, med AHA-prosjekt!"), ["bygger", "rag", "aha", "prosjekt"]);
}

// 6–10. Scoring, sortering, RAG, prompt og lagret status.
{
  const { context } = richContext();
  run("js/ahaPersonalRetrieval.js", context);
  const api = context.AHAPersonalRetrieval;
  const index = api.refreshRetrievalIndex({ now: "2026-06-13T12:00:00.000Z" });
  const strong = api.scoreItemAgainstQuery(index.items.find((item) => item.sourceId === "c1"), "Forklar prosjekt AHA Retrieval og lexical RAG");
  const weak = api.scoreItemAgainstQuery(index.items.find((item) => item.sourceType === "readiness_summary"), "Forklar prosjekt AHA Retrieval og lexical RAG");
  assert.ok(strong.score > weak.score);
  assert.ok(strong.reasons.some((reason) => reason.includes("match på tittel")));
  assert.ok(strong.reasons.some((reason) => reason.includes("match på prosjekt")));
  assert.ok(strong.reasons.some((reason) => reason.includes("match på begrep")));

  const search = api.searchPersonalKnowledge("AHA Retrieval lexical RAG");
  assert.ok(search.results.length >= 2);
  assert.ok(search.results[0].score >= search.results[1].score);
  assert.ok(search.results.every((item) => item.source && item.sourceId && item.sourceType && item.reasons.length));

  const rag = api.buildRagContext("AHA Retrieval lexical RAG", { limit: 5 });
  assert.ok(rag.contextText.includes("Relevant personlig kunnskap fra AHA"));
  assert.ok(rag.contextText.includes("AHA Retrieval arkitektur"));
  assert.ok(rag.contextText.length <= 1200);
  assert.ok(api.buildRagPromptBlock(rag).includes("Følgende godkjente personlige kilder"));

  const status = api.getRetrievalStatus();
  assert.equal(status.available, true);
  assert.equal(status.indexedItems, index.stats.total);
  assert.equal(status.corpusItems, 1);
  assert.equal(status.examples, 1);
  assert.equal(status.memoryClaims, 2);
  assert.equal(status.lastBuiltAt, "2026-06-13T12:00:00.000Z");
}

// 11. Chat Personal Context inkluderer retrieval og promptblokk.
{
  const { context } = richContext();
  run("js/ahaPersonalRetrieval.js", context);
  context.AHAPersonalRetrieval.refreshRetrievalIndex();
  run("js/ahaChatPersonalContext.js", context);
  const message = context.AHAChatPersonalContext.buildMessageContext("Hvordan virker AHA Retrieval?");
  assert.ok(message.retrieval);
  assert.ok(message.retrieval.results.length);
  assert.ok(message.prompt.includes("AHA Personal Retrieval"));
  const status = context.AHAChatPersonalContext.getPersonalContextStatus();
  assert.equal(status.retrievalAvailable, true);
  assert.ok(status.indexedItems > 0);
}

// 12–14. Statiske integrasjonsguards for Chat, Training og Meta Insights Agent.
{
  const chatHtml = fs.readFileSync("chat.html", "utf8");
  const trainingHtml = fs.readFileSync("training.html", "utf8");
  const dashboard = fs.readFileSync("js/ahaTrainingDashboard.js", "utf8");
  assert.ok(chatHtml.includes('js/ahaPersonalRetrieval.js'));
  assert.ok(chatHtml.indexOf("ahaPersonalRetrieval.js") < chatHtml.indexOf("ahaChatPersonalContext.js"));
  assert.ok(chatHtml.includes("Personlig søk"));
  assert.ok(trainingHtml.includes("Bygg personlig søkeindeks"));
  assert.ok(trainingHtml.includes("Personal Retrieval Index"));
  assert.ok(dashboard.includes("refreshRetrievalIndex"));

  const { context } = makeContext({
    AHAPersonalRetrieval: {
      getRetrievalStatus: () => ({ available: true, indexedItems: 5, corpusItems: 1, examples: 1, memoryClaims: 2, lastBuiltAt: "2026-06-13T12:00:00.000Z" })
    }
  });
  run("js/metaInsightsAgent.js", context);
  const agentContext = context.AHAMetaInsightsAgent.buildAgentContext({ meta_insight: {}, temporal: {} });
  assert.equal(agentContext.personalRetrievalPack.available, true);
  assert.equal(agentContext.personalRetrievalPack.indexedItems, 5);
  assert.equal(agentContext.personalRetrievalPack.memoryClaims, 2);
}

console.log("aha-personal-retrieval tests passed");
