// ahaPersonalModelReadiness.js
// ─────────────────────────────────────────────
// AHA Personal Model Readiness V1.
// Lokal report-only readiness: vurderer corpus/examples for retrieval, lokal
// JSONL-eksport og evaluering. Den trener ikke modell, starter ikke fine-tuning,
// laster ikke opp og kaller ikke backend/EchoNet.
// ─────────────────────────────────────────────

(function (global) {
  "use strict";

  function personalAiBoundaryMeta(extra = {}) { return { source_app: "aha", origin_app: extra.origin_app || "aha_personal_ai", local_only: true, control_surface_only: extra.control_surface_only ?? false, retrieval_only: extra.retrieval_only ?? false, evaluation_only: extra.evaluation_only ?? false, preview_only: extra.preview_only ?? false, model_training_enabled: false, fine_tuning_enabled: false, remote_upload_enabled: false, backend_enabled: false, echonet_shared: false, sync_enabled: false, historygo_writeback_enabled: false, writes_to_insight_chamber: false, calls_model_api: false, ...extra }; }
  function isUnavailableRecord(record) { return Boolean(record?.deleted_at || record?.deletedAt || record?.archived === true || record?.status === "archived" || record?.status === "rejected"); }

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function asText(value) { return String(value ?? "").trim(); }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function ratio(part, total) { return total > 0 ? part / total : 0; }

  function nowIso(options) {
    const now = options && options.now ? new Date(options.now) : new Date();
    return now.toISOString();
  }

  function increment(bucket, key) {
    const safeKey = asText(key) || "unknown";
    bucket[safeKey] = (bucket[safeKey] || 0) + 1;
  }

  function uniqueCount(object) {
    return Object.keys(asObject(object)).filter((key) => Number(object[key]) > 0).length;
  }

  function analyzeCoverage(corpusItems, examples) {
    const bySource = {};
    const byLanguage = {};
    const byTaskType = {};
    const corpus = asArray(corpusItems);
    const exs = asArray(examples);

    corpus.forEach((item) => {
      increment(bySource, item?.source || item?.sourceType);
      increment(byLanguage, item?.language);
    });
    exs.forEach((example) => {
      increment(byTaskType, example?.taskType || example?.task_type);
      increment(byLanguage, example?.language);
    });

    return {
      bySource,
      byLanguage,
      byTaskType,
      hasStyleExamples: Number(byTaskType.style_example) > 0,
      hasKnowledgeExamples: ["summary", "concept_explanation", "question_answer", "classification"].some((key) => Number(byTaskType[key]) > 0),
      hasMemoryFacts: Number(byTaskType.memory_fact) > 0,
      hasProjectExamples: Number(byTaskType.project_explanation) > 0,
      sourceDiversity: uniqueCount(bySource),
      taskDiversity: uniqueCount(byTaskType)
    };
  }

  function analyzeConsent(corpusItems) {
    const items = asArray(corpusItems);
    const out = {
      total: items.length,
      memoryAllowed: 0,
      trainingExamplesAllowed: 0,
      fineTuningAllowed: 0,
      styleAllowed: 0,
      knowledgeAllowed: 0,
      fineTuningRatio: 0,
      trainingExamplesRatio: 0
    };

    items.forEach((item) => {
      const consent = asObject(item?.consent);
      if (consent.useForMemory === true) out.memoryAllowed += 1;
      if (consent.useForTrainingExamples === true) out.trainingExamplesAllowed += 1;
      if (consent.useForFineTuning === true) out.fineTuningAllowed += 1;
      if (consent.useForStyle === true) out.styleAllowed += 1;
      if (consent.useForKnowledge === true) out.knowledgeAllowed += 1;
    });

    out.fineTuningRatio = ratio(out.fineTuningAllowed, out.total);
    out.trainingExamplesRatio = ratio(out.trainingExamplesAllowed, out.total);
    return out;
  }

  function corpusById(corpusItems) {
    const map = new Map();
    asArray(corpusItems).forEach((item) => {
      const id = asText(item?.id);
      if (id) map.set(id, item);
    });
    return map;
  }

  function isExportableExample(example, corpusMap) {
    if (example?.status !== "approved") return false;
    const corpusItem = corpusMap.get(asText(example?.corpusItemId || example?.corpus_item_id));
    return Boolean(corpusItem && asObject(corpusItem.consent).useForFineTuning === true);
  }

  function analyzeExportReadiness(corpusItems, examples) {
    const exs = asArray(examples);
    const approvedExamples = exs.filter((example) => example?.status === "approved").length;
    const map = corpusById(corpusItems);
    const exportableExamples = exs.filter((example) => isExportableExample(example, map)).length;
    const jsonlReady = exportableExamples > 0;
    let reason = "Ingen godkjente treningseksempler ennå.";
    if (approvedExamples > 0 && exportableExamples === 0) {
      reason = "Godkjente eksempler finnes, men mangler fine-tuning-samtykke på tilhørende corpus items.";
    } else if (exportableExamples > 0) {
      reason = `${exportableExamples} godkjente eksempler har fine-tuning-samtykke og kan eksporteres som JSONL.`;
    }
    return { approvedExamples, exportableExamples, jsonlReady, reason };
  }

  function buildQuality(corpusItems, examples, coverage) {
    const corpus = asArray(corpusItems);
    const exs = asArray(examples);
    const approvedCorpus = corpus.filter((item) => item?.status === "approved").length;
    const approvedExamples = exs.filter((example) => example?.status === "approved").length;
    const avgExampleQuality = exs.length
      ? exs.reduce((sum, example) => sum + (Number(asObject(example?.quality).score) || 0), 0) / exs.length
      : 0;
    return {
      approvedCorpusRatio: ratio(approvedCorpus, corpus.length),
      approvedExampleRatio: ratio(approvedExamples, exs.length),
      averageExampleQuality: Number(avgExampleQuality.toFixed(2)),
      hasMinimumTaskVariation: Number(coverage?.taskDiversity) >= 3,
      hasMinimumSourceVariation: Number(coverage?.sourceDiversity) >= 2
    };
  }

  function readinessBooleans(consent, coverage, exportReadiness, approvedCorpus, approvedExamples) {
    const ragReady = approvedCorpus >= 15 && consent.knowledgeAllowed > 0;
    const fineTuningReady = approvedExamples >= 50 && exportReadiness.exportableExamples >= 25 && coverage.taskDiversity >= 3;
    const styleReady = consent.styleAllowed > 0 && coverage.hasStyleExamples;
    return { ragReady, fineTuningReady, styleReady };
  }

  function scoreReport({ corpusStats, exampleStats, consent, coverage, exportReadiness, quality }) {
    const totalCorpus = Number(corpusStats.total) || 0;
    const approvedCorpus = Number(corpusStats.approved) || 0;
    const approvedExamples = Number(exampleStats.approved) || 0;
    let score = 0;

    score += Math.min(10, totalCorpus * 1);
    score += Math.min(25, approvedCorpus * 1.7);
    score += Math.min(35, approvedExamples * 1.2);
    if (consent.trainingExamplesAllowed > 0) score += Math.min(7, consent.trainingExamplesAllowed * 0.7);
    if (consent.fineTuningAllowed > 0) score += Math.min(8, consent.fineTuningAllowed * 0.5);
    score += Math.min(6, coverage.taskDiversity * 1.5);
    score += Math.min(4, coverage.sourceDiversity * 1);
    if (coverage.hasMemoryFacts) score += 2;
    if (coverage.hasProjectExamples) score += 2;
    if (coverage.hasStyleExamples && consent.styleAllowed > 0) score += 3;
    if (consent.knowledgeAllowed > 0) score += 2;
    if (exportReadiness.jsonlReady) score += 4;
    if (quality.hasMinimumTaskVariation && quality.hasMinimumSourceVariation) score += 2;

    score = Math.round(clamp(score, 0, 100));

    let level = "tom";
    if (approvedCorpus === 0) {
      level = "tom";
      score = totalCorpus > 0 ? clamp(score, 1, 10) : 0;
    } else if (approvedCorpus <= 4) {
      level = "tidlig";
      score = clamp(score, 10, 30);
    } else if (approvedCorpus <= 14) {
      level = "på vei";
      score = clamp(score, 30, 55);
    } else if (approvedCorpus >= 15 && approvedExamples > 0) {
      level = "klar for RAG";
      score = clamp(score, 55, 70);
    }

    if (approvedExamples >= 25 && consent.fineTuningAllowed > 0 && exportReadiness.exportableExamples > 0) {
      level = "klar for eksport";
      score = clamp(score, 70, 85);
    }
    if (approvedExamples >= 50 && coverage.taskDiversity >= 3 && exportReadiness.exportableExamples >= 25) {
      level = "klar for modelltilpasning";
      score = clamp(score, 85, 100);
    }

    return { level, score: Math.round(score) };
  }

  function buildSummary(report) {
    if (report.level === "tom") return "Training Corpus er tomt eller mangler godkjente tekster. Start med import og godkjenning.";
    if (report.level === "tidlig") return "Materialet er i tidlig fase. Flere godkjente corpus items og samtykker trengs før treningseksempler gir verdi.";
    if (report.level === "på vei") return "Materialet er på vei mot et nyttig treningsgrunnlag, men trenger flere godkjente eksempler og bedre dekning.";
    if (report.level === "klar for RAG") return "Corpus har nok godkjent kunnskapsgrunnlag til å vurderes som RAG-grunnlag før finjustering.";
    if (report.level === "klar for eksport") return "Det finnes nok godkjente og samtykkede eksempler til stabil JSONL-eksport.";
    return "Materialet har god mengde, samtykke og variasjon for å vurderes som grunnlag for personlig modelltilpasning.";
  }

  function buildRecommendations(report) {
    const recs = [];
    const approvedCorpus = Number(report?.corpus?.approved) || 0;
    const approvedExamples = Number(report?.examples?.approved) || 0;
    const consent = asObject(report?.consent);
    const coverage = asObject(report?.coverage);
    const exportReadiness = asObject(report?.exportReadiness);

    if (approvedCorpus === 0) recs.push("Godkjenn flere corpus items.");
    if (consent.trainingExamplesAllowed < Math.max(1, approvedCorpus)) recs.push("Slå på treningseksempler for relevante tekster.");
    if (approvedExamples < 25) recs.push("Lag og godkjenn flere training examples før eksport.");
    if (!coverage.hasMemoryFacts) recs.push("Lag flere memory_fact-eksempler fra tydelige brukerpreferanser og prosjektvalg.");
    if (!coverage.hasStyleExamples || !report.styleReadiness.ready) recs.push("Legg til flere style examples hvis AHA skal lære skrivestil.");
    if (!exportReadiness.jsonlReady) recs.push("Eksporter JSONL når nok godkjente examples finnes og fine-tuning-samtykke er slått på.");
    if (!report.ragReadiness.ready && approvedCorpus >= 5) recs.push("Bruk corpus som RAG-grunnlag før finjustering.");
    if (coverage.taskDiversity < 3) recs.push("Øk variasjonen i taskType, for eksempel summary, concept_explanation og memory_fact.");

    if (!recs.length) recs.push("Fortsett å kvalitetssikre nye corpus items før de brukes til personlig modelltilpasning.");
    return recs.slice(0, 6);
  }

  function buildCompactPack(report) {
    const safe = asObject(report);
    const exportReadiness = asObject(safe.exportReadiness);
    return {
      level: asText(safe.level) || "tom",
      score: Number(safe.score) || 0,
      approvedCorpus: Number(asObject(safe.corpus).approved) || 0,
      approvedExamples: Number(asObject(safe.examples).approved) || 0,
      exportableExamples: Number(exportReadiness.exportableExamples) || 0,
      ragReady: Boolean(asObject(safe.ragReadiness).ready),
      fineTuningReady: Boolean(asObject(safe.fineTuningReadiness).ready),
      styleReady: Boolean(asObject(safe.styleReadiness).ready),
      topRecommendations: asArray(safe.recommendations).slice(0, 3)
    };
  }

  function buildReadinessReport(options = {}) {
    const corpusApi = global.AHATrainingCorpus;
    const examplesApi = global.AHATrainingExamples;
    const corpusStats = asObject(corpusApi?.collectCorpusStats?.());
    const exampleStats = asObject(examplesApi?.collectExampleStats?.());
    const corpusItems = asArray(corpusApi?.loadCorpus?.());
    const examples = asArray(examplesApi?.loadExamples?.());
    const coverage = analyzeCoverage(corpusItems, examples);
    const consent = analyzeConsent(corpusItems);
    const exportReadiness = analyzeExportReadiness(corpusItems, examples);
    const quality = buildQuality(corpusItems, examples, coverage);
    const scored = scoreReport({ corpusStats, exampleStats, consent, coverage, exportReadiness, quality });
    const approvedCorpus = Number(corpusStats.approved) || corpusItems.filter((item) => item.status === "approved").length;
    const approvedExamples = Number(exampleStats.approved) || examples.filter((example) => example.status === "approved").length;
    const booleans = readinessBooleans(consent, coverage, exportReadiness, approvedCorpus, approvedExamples);

    const report = {
      generatedAt: nowIso(options),
      local_only: true, readiness_report_only: true, report_only: true, model_training_enabled: false, fine_tuning_enabled: false, remote_upload_enabled: false, backend_enabled: false, echonet_shared: false, sync_enabled: false, calls_model_api: false, meta: personalAiBoundaryMeta({ origin_app: "aha_personal_model_readiness", object_type: "readiness_report", control_surface_only: true }),
      level: scored.level,
      score: scored.score,
      corpus: {
        total: Number(corpusStats.total) || corpusItems.length,
        approved: approvedCorpus,
        raw: Number(corpusStats.raw) || 0,
        rejected: Number(corpusStats.rejected) || 0,
        trainingExamplesAllowed: Number(corpusStats.trainingExamplesAllowed) || consent.trainingExamplesAllowed,
        fineTuningAllowed: Number(corpusStats.fineTuningAllowed) || consent.fineTuningAllowed,
        styleAllowed: Number(corpusStats.styleAllowed) || consent.styleAllowed,
        knowledgeAllowed: Number(corpusStats.knowledgeAllowed) || consent.knowledgeAllowed
      },
      examples: {
        total: Number(exampleStats.total) || examples.length,
        approved: approvedExamples,
        draft: Number(exampleStats.draft) || 0,
        rejected: Number(exampleStats.rejected) || 0,
        needsReview: Number(exampleStats.needsReview) || 0,
        byTaskType: asObject(exampleStats.byTaskType)
      },
      consent,
      coverage,
      quality,
      exportReadiness,
      ragReadiness: {
        ready: booleans.ragReady,
        reason: booleans.ragReady ? "Nok godkjent kunnskapsmateriale for RAG." : "Trenger flere godkjente corpus items med kunnskaps-samtykke."
      },
      fineTuningReadiness: {
        ready: booleans.fineTuningReady,
        reason: booleans.fineTuningReady ? "Nok godkjente, eksportbare examples og task-variasjon." : "Trenger flere godkjente examples, fine-tuning-samtykke og task-variasjon."
      },
      styleReadiness: {
        ready: booleans.styleReady,
        reason: booleans.styleReady ? "Stil-samtykke og style examples finnes." : "Trenger stil-samtykke og godkjente style examples."
      },
      recommendations: [],
      summary: ""
    };
    report.recommendations = buildRecommendations(report);
    report.summary = buildSummary(report);
    return report;
  }

  const AHAPersonalModelReadiness = {
    buildReadinessReport,
    analyzeCoverage,
    analyzeConsent,
    analyzeExportReadiness,
    buildRecommendations,
    buildCompactPack,
    personalAiBoundaryMeta,
    isUnavailableRecord
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AHAPersonalModelReadiness;
  }
  if (global) {
    global.AHAPersonalModelReadiness = AHAPersonalModelReadiness;
  }
})(typeof window !== "undefined" ? window : this);
