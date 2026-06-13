// Tester for AHA Training Corpus V1.
// Dekker AHATrainingCorpus (corpus items, samtykke, import, stats,
// tombstones), AHATrainingExamples (generering, godkjenning, JSONL-eksport)
// og integrasjonen mot AHA-moduler og MetaInsightsAgent (trainingPack).

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function makeContext(seed = {}) {
  const store = new Map(Object.entries(seed));
  const context = {
    console, Date, Math, JSON, setTimeout, clearTimeout,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => store.delete(k)
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("js/ahaTrainingCorpus.js", "utf8"), context, { filename: "js/ahaTrainingCorpus.js" });
  vm.runInContext(fs.readFileSync("js/ahaTrainingExamples.js", "utf8"), context, { filename: "js/ahaTrainingExamples.js" });
  vm.runInContext(fs.readFileSync("js/ahaPersonalModelReadiness.js", "utf8"), context, { filename: "js/ahaPersonalModelReadiness.js" });
  return { context, store };
}

// ── 1. loadCorpus() håndterer tomt lager.
{
  const { context } = makeContext();
  const corpus = context.AHATrainingCorpus;
  assert.ok(corpus, "AHATrainingCorpus skal eksporteres");
  assert.deepEqual(corpus.loadCorpus(), [], "tomt lager skal gi tom liste");
  assert.deepEqual(corpus.loadAllCorpus(), [], "tomt lager skal gi tom all-liste");
}

// ── 2. addCorpusItem() normaliserer item.
{
  const { context } = makeContext();
  const corpus = context.AHATrainingCorpus;
  const item = corpus.addCorpusItem({ text: "Jeg jobber med et prosjekt om grønn omstilling.", source: "manual" });
  assert.ok(item, "addCorpusItem skal returnere item");
  assert.equal(item.type, "training_corpus_item", "type skal settes");
  assert.equal(item.status, "raw", "status skal defaulte til raw");
  assert.equal(item.consent.useForMemory, true, "default consent useForMemory");
  assert.equal(item.consent.useForFineTuning, false, "default consent useForFineTuning");
  assert.ok(item.id && item.createdAt && item.updatedAt, "id/createdAt/updatedAt skal settes");
  assert.ok(item.textHash, "textHash skal settes");
  assert.equal(item.language, "no", "norsk tekst skal gjenkjennes");
  assert.equal(corpus.loadCorpus().length, 1, "item skal lagres");
}

// ── 3. importFromExistingAhaSources() deduper source/text.
{
  const sameText = "Dette er en delt refleksjon om makt og marked.";
  const { context } = makeContext({
    aha_notes_v1: JSON.stringify([
      { id: "n1", title: "Notat 1", text: sameText, created_at: "2026-01-01T00:00:00.000Z" },
      { id: "n2", title: "Notat 2", text: sameText, created_at: "2026-01-02T00:00:00.000Z" }
    ]),
    aha_feed_posts_v1: JSON.stringify([
      { id: "f1", text: "En egen feed-post med annet innhold.", created_at: "2026-01-03T00:00:00.000Z" }
    ])
  });
  const corpus = context.AHATrainingCorpus;
  const result = corpus.importFromExistingAhaSources();
  assert.equal(result.ok, true, "import skal returnere ok");
  assert.equal(result.added, 2, "to unike tekster skal legges til (n1 + f1), n2 dedupes på hash");
  assert.ok(result.skipped >= 1, "duplikat skal hoppes over");
  assert.equal(result.total, 2, "totalt 2 corpus items");

  // Re-import skal ikke legge til på nytt (source+sourceId-dedup).
  const second = corpus.importFromExistingAhaSources();
  assert.equal(second.added, 0, "re-import skal ikke duplisere");
}

// ── 4. setCorpusConsent() oppdaterer consent.
{
  const { context } = makeContext();
  const corpus = context.AHATrainingCorpus;
  const item = corpus.addCorpusItem({ text: "En tekst.", source: "manual" });
  const updated = corpus.setCorpusConsent(item.id, { useForTrainingExamples: true, useForFineTuning: true });
  assert.equal(updated.consent.useForTrainingExamples, true, "consent skal oppdateres");
  assert.equal(updated.consent.useForFineTuning, true, "consent skal oppdateres");
  assert.equal(updated.consent.useForMemory, true, "uendret consent skal bevares");
}

// ── 5. collectCorpusStats() teller status og consent riktig.
{
  const { context } = makeContext();
  const corpus = context.AHATrainingCorpus;
  const a = corpus.addCorpusItem({ text: "Jeg liker å skrive om økonomi.", source: "aha_notes" });
  const b = corpus.addCorpusItem({ text: "Dette er en tanke jeg vil dele.", source: "aha_feed" });
  corpus.markCorpusItemStatus(a.id, "approved");
  corpus.setCorpusConsent(a.id, { useForTrainingExamples: true, useForFineTuning: true, useForStyle: true });
  const stats = corpus.collectCorpusStats();
  assert.equal(stats.total, 2, "total skal telles");
  assert.equal(stats.approved, 1, "approved skal telles");
  assert.equal(stats.raw, 1, "raw skal telles");
  assert.equal(stats.trainingExamplesAllowed, 1, "trainingExamplesAllowed skal telles");
  assert.equal(stats.fineTuningAllowed, 1, "fineTuningAllowed skal telles");
  assert.equal(stats.styleAllowed, 1, "styleAllowed skal telles");
  assert.equal(stats.bySource.aha_notes, 1, "bySource skal telles");
  assert.equal(stats.byLanguage.no, 2, "byLanguage skal telles");
}

// ── 6. deleteCorpusItem() setter tombstone.
{
  const { context } = makeContext();
  const corpus = context.AHATrainingCorpus;
  const item = corpus.addCorpusItem({ text: "Skal slettes", source: "manual" });
  const deleted = corpus.deleteCorpusItem(item.id);
  assert.ok(deleted.deletedAt, "deletedAt skal settes");
  assert.equal(corpus.loadCorpus().length, 0, "tombstoned item skal ut av aktivt corpus");
  assert.equal(corpus.loadAllCorpus().length, 1, "tombstoned item skal være med i loadAllCorpus");
}

// ── 7. AHATrainingExamples.loadExamples() håndterer tomt lager.
{
  const { context } = makeContext();
  const examples = context.AHATrainingExamples;
  assert.ok(examples, "AHATrainingExamples skal eksporteres");
  assert.deepEqual(examples.loadExamples(), [], "tomt lager skal gi tom liste");
}

// ── 8. generateExamplesFromCorpusItem() lager summary-example.
{
  const { context } = makeContext();
  const corpus = context.AHATrainingCorpus;
  const examples = context.AHATrainingExamples;
  const item = corpus.normalizeCorpusItem({
    id: "c1",
    text: "Jeg ønsker å bygge en personlig modell. Begrepet habitus er sentralt.",
    concepts: ["habitus"],
    project: "Personal Model",
    consent: { useForStyle: true }
  });
  const generated = examples.generateExamplesFromCorpusItem(item);
  const summary = generated.find((ex) => ex.taskType === "summary");
  assert.ok(summary, "summary-example skal lages");
  assert.equal(summary.input, "Oppsummer denne teksten kort.", "summary skal ha riktig input");
  assert.ok(summary.output, "summary skal ha output");
  assert.ok(generated.some((ex) => ex.taskType === "concept_explanation"), "concept_explanation skal lages når concepts finnes");
  assert.ok(generated.some((ex) => ex.taskType === "project_explanation"), "project_explanation skal lages når project finnes");
  assert.ok(generated.some((ex) => ex.taskType === "style_example"), "style_example skal lages ved style-samtykke");
  assert.ok(generated.some((ex) => ex.taskType === "memory_fact"), "memory_fact skal lages ved «jeg ønsker»");
}

// ── 9. generateExamplesFromApprovedCorpus() bruker approved corpus med training consent.
{
  const { context } = makeContext();
  const corpus = context.AHATrainingCorpus;
  const examples = context.AHATrainingExamples;
  const approved = corpus.addCorpusItem({ id: "ca", text: "Godkjent tekst om marked.", source: "manual" });
  corpus.markCorpusItemStatus(approved.id, "approved");
  corpus.setCorpusConsent(approved.id, { useForTrainingExamples: true });
  // En ikke-godkjent item skal ikke gi examples.
  corpus.addCorpusItem({ id: "cb", text: "Ikke godkjent tekst.", source: "manual" });

  const result = examples.generateExamplesFromApprovedCorpus();
  assert.equal(result.ok, true, "skal returnere ok");
  assert.equal(result.corpusItems, 1, "kun ett godkjent item med training consent");
  assert.ok(result.added >= 1, "minst ett example skal lages");
  const all = examples.loadExamples();
  assert.ok(all.every((ex) => ex.corpusItemId === "ca"), "examples skal kun komme fra godkjent item");
}

// ── 10. & 11. exportApprovedExamples("jsonl") gir gyldig JSONL med fine-tuning-consent.
{
  const { context } = makeContext();
  const corpus = context.AHATrainingCorpus;
  const examples = context.AHATrainingExamples;

  // Corpus item med både training- og fine-tuning-samtykke.
  const item = corpus.addCorpusItem({ id: "cx", text: "Eksporterbar tekst om økonomi.", source: "manual" });
  corpus.markCorpusItemStatus(item.id, "approved");
  corpus.setCorpusConsent(item.id, { useForTrainingExamples: true, useForFineTuning: true });
  examples.generateExamplesFromApprovedCorpus();

  // Ingen godkjente examples ennå → tom eksport.
  assert.equal(examples.exportApprovedExamples("jsonl"), "", "uten godkjente examples skal eksport være tom");

  // Godkjenn alle examples.
  examples.loadExamples().forEach((ex) => examples.markExampleStatus(ex.id, "approved"));
  const jsonl = examples.exportApprovedExamples("jsonl");
  assert.ok(jsonl.length > 0, "JSONL skal ha innhold");
  const lines = jsonl.split("\n");
  lines.forEach((line) => {
    const parsed = JSON.parse(line);
    assert.ok(Array.isArray(parsed.messages) && parsed.messages.length === 2, "hver linje skal ha messages");
    assert.equal(parsed.messages[0].role, "user");
    assert.equal(parsed.messages[1].role, "assistant");
    assert.equal(parsed.metadata.source, "aha_training_examples", "metadata.source skal settes");
    assert.ok(parsed.metadata.taskType, "metadata.taskType skal settes");
    assert.ok(parsed.metadata.language, "metadata.language skal settes");
  });

  // 11. Uten fine-tuning-samtykke skal eksport være tom selv om examples er godkjent.
  corpus.setCorpusConsent(item.id, { useForFineTuning: false });
  assert.equal(examples.exportApprovedExamples("jsonl"), "", "uten fine-tuning-samtykke skal eksport være tom");
}

// ── collectExampleStats teller status og taskType.
{
  const { context } = makeContext();
  const examples = context.AHATrainingExamples;
  const ex = examples.addExample({ corpusItemId: "c1", taskType: "summary", input: "i", output: "o" });
  examples.markExampleStatus(ex.id, "needs_review");
  const stats = examples.collectExampleStats();
  assert.equal(stats.total, 1);
  assert.equal(stats.needsReview, 1, "needs_review skal telles som needsReview");
  assert.equal(stats.byTaskType.summary, 1);
}


// ── Personal Model Readiness V1 håndterer tomt corpus.
{
  const { context } = makeContext();
  const readiness = context.AHAPersonalModelReadiness;
  assert.ok(readiness, "AHAPersonalModelReadiness skal eksporteres");
  const report = readiness.buildReadinessReport({ now: "2026-01-01T00:00:00.000Z" });
  assert.equal(report.level, "tom", "tomt corpus skal gi nivå tom");
  assert.equal(report.score, 0, "tomt corpus skal gi score 0");
  assert.equal(report.exportReadiness.jsonlReady, false, "tomt corpus skal ikke være JSONL-klart");
}

// ── Readiness-score øker med approved corpus, og mer med approved examples.
{
  const { context } = makeContext();
  const corpus = context.AHATrainingCorpus;
  const examples = context.AHATrainingExamples;
  const readiness = context.AHAPersonalModelReadiness;
  const baseScore = readiness.buildReadinessReport().score;
  const item = corpus.addCorpusItem({ id: "r1", text: "Jeg ønsker bedre prosjektminne.", source: "manual" });
  corpus.markCorpusItemStatus(item.id, "approved");
  corpus.setCorpusConsent(item.id, { useForTrainingExamples: true, useForFineTuning: true, useForStyle: true });
  const corpusScore = readiness.buildReadinessReport().score;
  examples.addExample({ corpusItemId: item.id, taskType: "summary", input: "i", output: "o", status: "approved", language: "no" });
  const exampleScore = readiness.buildReadinessReport().score;
  assert.ok(corpusScore > baseScore, "approved corpus skal øke readiness-score");
  assert.ok(exampleScore > corpusScore, "approved examples skal øke readiness-score mer");
}

// ── Fine-tuning consent påvirker exportReadiness.
{
  const { context } = makeContext();
  const corpus = context.AHATrainingCorpus;
  const examples = context.AHATrainingExamples;
  const readiness = context.AHAPersonalModelReadiness;
  const item = corpus.addCorpusItem({ id: "r2", text: "Eksporttest.", source: "manual" });
  corpus.markCorpusItemStatus(item.id, "approved");
  examples.addExample({ corpusItemId: item.id, taskType: "summary", input: "i", output: "o", status: "approved", language: "no" });
  assert.equal(readiness.buildReadinessReport().exportReadiness.exportableExamples, 0, "uten fine-tuning consent er ingen examples eksportbare");
  corpus.setCorpusConsent(item.id, { useForFineTuning: true });
  assert.equal(readiness.buildReadinessReport().exportReadiness.exportableExamples, 1, "med fine-tuning consent er example eksportbart");
}

// ── analyzeCoverage(), analyzeConsent(), analyzeExportReadiness() og buildCompactPack().
{
  const { context } = makeContext();
  const readiness = context.AHAPersonalModelReadiness;
  const corpusItems = [
    { id: "a", source: "aha_notes", language: "no", status: "approved", consent: { useForMemory: true, useForTrainingExamples: true, useForFineTuning: true, useForStyle: true, useForKnowledge: true } },
    { id: "b", source: "aha_feed", language: "en", status: "approved", consent: { useForMemory: false, useForTrainingExamples: false, useForFineTuning: false, useForStyle: false, useForKnowledge: true } }
  ];
  const examples = [
    { corpusItemId: "a", taskType: "summary", language: "no", status: "approved" },
    { corpusItemId: "a", taskType: "style_example", language: "no", status: "approved" },
    { corpusItemId: "b", taskType: "memory_fact", language: "en", status: "draft" }
  ];
  const coverage = readiness.analyzeCoverage(corpusItems, examples);
  assert.equal(coverage.byTaskType.summary, 1, "taskType summary skal telles");
  assert.equal(coverage.sourceDiversity, 2, "source diversity skal telles");
  assert.equal(coverage.hasStyleExamples, true, "style examples skal oppdages");
  assert.equal(coverage.hasMemoryFacts, true, "memory facts skal oppdages");
  const consent = readiness.analyzeConsent(corpusItems);
  assert.equal(consent.total, 2, "consent total skal telles");
  assert.equal(consent.trainingExamplesAllowed, 1, "training consent skal telles");
  assert.equal(consent.fineTuningAllowed, 1, "fine-tuning consent skal telles");
  const exportReadiness = readiness.analyzeExportReadiness(corpusItems, examples);
  assert.equal(exportReadiness.approvedExamples, 2, "approved examples skal telles");
  assert.equal(exportReadiness.exportableExamples, 2, "exportable examples skal telles via corpus consent");
  const pack = readiness.buildCompactPack({
    level: "klar for eksport", score: 80, corpus: { approved: 2 }, examples: { approved: 2 },
    exportReadiness, ragReadiness: { ready: true }, fineTuningReadiness: { ready: false }, styleReadiness: { ready: true },
    recommendations: ["A", "B", "C", "D"]
  });
  assert.equal(pack.level, "klar for eksport", "compact pack skal ha level");
  assert.equal(pack.topRecommendations.length, 3, "compact pack skal begrense anbefalinger");
}

// ── Training dashboard renderer Personal Model Readiness.
{
  const dashboard = fs.readFileSync("js/ahaTrainingDashboard.js", "utf8");
  assert.ok(dashboard.includes("renderReadiness"), "dashboard skal ha renderReadiness");
  assert.ok(dashboard.includes("training-readiness-report"), "dashboard skal rendere readiness mount");
  assert.ok(dashboard.includes("Personal Model Readiness") || fs.readFileSync("training.html", "utf8").includes("Personal Model Readiness"), "dashboard/html skal vise Personal Model Readiness");
}

// ── 12. training.html laster nødvendige scripts.
{
  const html = fs.readFileSync("training.html", "utf8");
  assert.ok(html.includes("js/ahaTrainingCorpus.js"), "training.html skal laste ahaTrainingCorpus.js");
  assert.ok(html.includes("js/ahaTrainingExamples.js"), "training.html skal laste ahaTrainingExamples.js");
  assert.ok(html.includes("js/ahaPersonalModelReadiness.js"), "training.html skal laste ahaPersonalModelReadiness.js");
  assert.ok(html.includes("js/ahaTrainingDashboard.js"), "training.html skal laste ahaTrainingDashboard.js");
  assert.ok(html.includes("AHA Training Corpus"), "training.html skal ha header");
  assert.ok(html.includes("Personal Model Readiness"), "training.html skal vise readiness-panel");
  assert.ok(html.includes("Importer fra AHA"), "training.html skal ha import-handling");
}

// ── 13. ahaModules.js inneholder Training-modul.
{
  const sandbox = { window: {}, document: { getElementById: () => null } };
  vm.runInNewContext(fs.readFileSync("js/ahaModules.js", "utf8"), sandbox, { filename: "js/ahaModules.js" });
  const training = (sandbox.window.AHA_MODULES || []).find((m) => m.id === "training");
  assert.ok(training, "Training-modul skal finnes");
  assert.equal(training.href, "training.html");
  assert.equal(training.type, "system");
  assert.equal(training.status, "active");
  assert.equal(training.phase, 2);
}

// ── 14. MetaInsightsAgent agentContext inkluderer trainingPack når Training-moduler finnes.
{
  const store = new Map();
  const ctx = {
    console, Date, Math, JSON, setTimeout, clearTimeout,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => store.delete(k)
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("js/ahaTrainingCorpus.js", "utf8"), ctx, { filename: "js/ahaTrainingCorpus.js" });
  vm.runInContext(fs.readFileSync("js/ahaTrainingExamples.js", "utf8"), ctx, { filename: "js/ahaTrainingExamples.js" });
  vm.runInContext(fs.readFileSync("js/ahaPersonalModelReadiness.js", "utf8"), ctx, { filename: "js/ahaPersonalModelReadiness.js" });
  vm.runInContext(fs.readFileSync("js/metaInsightsAgent.js", "utf8"), ctx, { filename: "js/metaInsightsAgent.js" });

  // Seed corpus + examples.
  const item = ctx.AHATrainingCorpus.addCorpusItem({ text: "Treningsgrunnlag.", source: "manual" });
  ctx.AHATrainingCorpus.markCorpusItemStatus(item.id, "approved");
  ctx.AHATrainingCorpus.setCorpusConsent(item.id, { useForFineTuning: true });

  const agentContext = ctx.AHAMetaInsightsAgent.buildAgentContext({});
  assert.ok(agentContext.trainingPack, "trainingPack skal finnes når Training-moduler er lastet");
  assert.equal(agentContext.trainingPack.corpusTotal, 1, "corpusTotal skal telles");
  assert.equal(agentContext.trainingPack.approvedCorpus, 1, "approvedCorpus skal telles");
  assert.equal(agentContext.trainingPack.fineTuningAllowed, 1, "fineTuningAllowed skal telles");
  assert.ok(Object.prototype.hasOwnProperty.call(agentContext.trainingPack, "approvedExamples"), "approvedExamples skal med");
  assert.ok(Object.prototype.hasOwnProperty.call(agentContext.trainingPack, "styleAllowed"), "styleAllowed skal med");
  assert.ok(Object.prototype.hasOwnProperty.call(agentContext.trainingPack, "trainingExamplesAllowed"), "trainingExamplesAllowed skal med");
  assert.ok(agentContext.personalModelReadinessPack, "personalModelReadinessPack skal finnes når readiness-modulen er lastet");
  assert.equal(agentContext.personalModelReadinessPack.approvedCorpus, 1, "approvedCorpus skal med i readiness-pack");
  assert.ok(Object.prototype.hasOwnProperty.call(agentContext.personalModelReadinessPack, "ragReady"), "ragReady skal med");
}

// ── Uten Training-moduler skal trainingPack utelates.
{
  const store = new Map();
  const ctx = {
    console, Date, Math, JSON,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => store.delete(k)
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("js/metaInsightsAgent.js", "utf8"), ctx, { filename: "js/metaInsightsAgent.js" });
  const agentContext = ctx.AHAMetaInsightsAgent.buildAgentContext({});
  assert.ok(!Object.prototype.hasOwnProperty.call(agentContext, "trainingPack"), "uten Training-moduler skal trainingPack utelates");
}

console.log("aha-training-corpus.test.cjs passed");
