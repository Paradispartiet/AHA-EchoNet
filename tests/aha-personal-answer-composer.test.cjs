const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function makeContext() {
  const store = new Map();
  const context = { console, Date, Math, JSON, localStorage: { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  context.window = context; context.globalThis = context; vm.createContext(context); return context;
}
function run(file, context) { vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file }); }
function load(context) { ["js/metaInsightsMemory.js","js/ahaTrainingCorpus.js","js/ahaTrainingExamples.js","js/ahaPersonalModelReadiness.js","js/ahaPersonalRetrieval.js","js/ahaSemanticRetrieval.js","js/ahaChatPersonalContext.js","js/ahaPersonalAnswerComposer.js","js/ahaPersonalAiLoopAudit.js","js/metaInsightsAgent.js"].forEach((f) => run(f, context)); }

{
  const ctx = makeContext(); load(ctx); const api = ctx.AHAPersonalAnswerComposer;
  assert.equal(api.detectAnswerIntent("Hvor er vi med status nå?"), "project_status");
  assert.equal(api.detectAnswerIntent("Lag prompt og planlegg neste steg"), "planning");
  assert.equal(api.detectAnswerIntent("Hva betyr dette, er dette smart?"), "reflection");
  assert.equal(api.detectAnswerIntent("Feil i repo kode PR"), "technical_help");
  assert.equal(api.detectAnswerIntent("Modell trening fine-tuning RAG"), "training_model");
  const empty = api.buildAnswerContext("Hei", { now: "2026-06-22T00:00:00.000Z" });
  assert.equal(empty.version, "v1");
  assert.ok(Array.isArray(empty.selectedSources));
  assert.ok(empty.promptBlock.includes("AHA Personal Answer Composer"));
}

{
  const ctx = makeContext(); load(ctx); const api = ctx.AHAPersonalAnswerComposer;
  const selected = api.selectSourcesForAnswer([
    { id: "low", sourceType: "corpus_item", title: "Lav", excerpt: "x", hybridScore: 0.2, reasons: ["godkjent corpus"] },
    { id: "confirmed", source: "meta_insights_memory", sourceType: "confirmed_claim", title: "Bekreftet", excerpt: "x", score: 0.4, reasons: ["bekreftet selvinnsikt"] },
    { id: "high", sourceType: "training_example", title: "Høy", excerpt: "x", hybridScore: 0.9, reasons: ["semantisk nærhet"] }
  ], { intent: "project_status" });
  assert.equal(selected[0].id, "high");
  assert.ok(selected.some((s) => s.id === "confirmed"));
  assert.ok(selected.every((s) => Object.prototype.hasOwnProperty.call(s, "hybridScore") && Array.isArray(s.reasons)));
  const plan = api.buildAnswerPlan("hvor er vi", { answerIntent: "project_status" });
  assert.equal(plan.responseMode, "grounded_status");
  const prompt = api.buildComposerPrompt({ userMessage: "Hva nå?", answerIntent: "planning", selectedSources: selected, answerPlan: plan, personalContext: {}, evidence: {} });
  assert.ok(prompt.includes("Hva nå?"));
  assert.ok(prompt.includes("Relevante kilder"));
  assert.ok(prompt.includes("Svarplan"));
  assert.ok(prompt.length <= 2500);
  const preview = api.composeLocalAnswerPreview({ answerIntent: "planning", selectedSources: selected, answerPlan: plan });
  assert.ok(preview.sourcesUsed.length > 0);
}

{
  const ctx = makeContext(); load(ctx);
  ctx.AHAMetaInsightsMemory.addFeedback({ claimId: "c1", claimText: "AHA-EchoNet er viktig for personlig svargrunnlag.", response: "stemmer", basis: ["test"] });
  ctx.AHATrainingCorpus.addCorpusItem({ id: "corp1", title: "AHA-EchoNet Composer", text: "Answer Composer kobler retrieval, kilder og reasons til chat.", project: "AHA-EchoNet", concepts: ["Answer Composer", "retrieval"], status: "approved", consent: { useForKnowledge: true } });
  ctx.AHATrainingExamples.addExample({ id: "ex1", taskType: "project_explanation", input: "Forklar composer", output: "Composer gir strukturert svargrunnlag.", status: "approved", meta: { project: "AHA-EchoNet", concepts: ["Answer Composer"] } });
  ctx.AHAPersonalRetrieval.refreshRetrievalIndex(); ctx.AHASemanticRetrieval.refreshSemanticIndex();
  const pack = ctx.AHAPersonalAnswerComposer.buildAnswerPackage("Hva vet AHA om AHA-EchoNet og Answer Composer?");
  assert.ok(pack.prompt.includes("Brukerens melding"));
  assert.ok(pack.localPreview.sourcesUsed.length > 0);
  assert.equal(pack.status.ready, true);
  assert.ok(pack.context.selectedSources.every((s) => s.source && s.sourceId !== undefined && Array.isArray(s.reasons)));
  assert.ok(pack.prompt.length <= 2500);
  const audit = ctx.AHAPersonalAiLoopAudit.runAudit({ query: "AHA-EchoNet Answer Composer" });
  assert.ok(audit.answerComposer.available);
  assert.ok(audit.checks.answerComposer.hasPrompt);
  const agentContext = ctx.AHAMetaInsightsAgent.buildAgentContext({ meta_insight: {}, temporal: {} });
  assert.ok(agentContext.answerComposerPack.available);
}

{
  const chatHtml = fs.readFileSync("chat.html", "utf8");
  const chatJs = fs.readFileSync("js/ahaChat.js", "utf8");
  const training = fs.readFileSync("training.html", "utf8");
  const dashboard = fs.readFileSync("js/ahaTrainingDashboard.js", "utf8");
  assert.ok(chatHtml.includes("js/ahaPersonalAnswerComposer.js"));
  assert.ok(chatHtml.includes("Svargrunnlag") || chatJs.includes("AHA Answer Composer aktiv"));
  assert.ok(training.includes("Test Answer Composer"));
  assert.ok(dashboard.includes("renderAnswerComposer"));
  assert.ok(fs.readFileSync("js/ahaPersonalAiLoopAudit.js", "utf8").includes("answerComposer"));
  assert.ok(fs.readFileSync("js/metaInsightsAgent.js", "utf8").includes("answerComposerPack"));
}

console.log("aha-personal-answer-composer tests passed");
