const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const contractCode = fs.readFileSync(path.join(repoRoot, "js/ahaChatAnalysisRunContract.js"), "utf8");
const code = fs.readFileSync(path.join(repoRoot, "js/ahaChatExport.js"), "utf8");
const smokeCode = fs.readFileSync(path.join(repoRoot, "js/ahaChatPythonSmoke.js"), "utf8");

function loadExportApi() {
  const sandbox = {
    window: {},
    console,
    Date,
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Math,
    Set,
    WeakSet,
    RegExp
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(contractCode, sandbox, { filename: "ahaChatAnalysisRunContract.js" });
  vm.runInContext(code, sandbox, { filename: "ahaChatExport.js" });
  return { api: sandbox.window.AHAChatExport, window: sandbox.window, sandbox };
}

function baseDeps(overrides = {}) {
  const currentHash = overrides.currentHash || "a".repeat(64);
  const sourceText = overrides.sourceText || "Norsk medietidsskrift lanserer konseptuelle artikler om begreper, offentlighet og medievitenskap.";
  return {
    loadAutoOutputs: () => ({
      sourceText,
      sourceTextHash: currentHash,
      sourceSha256: currentHash,
      analysisRunId: "run_current",
      runId: "run_current",
      sourceTextPreview: sourceText.slice(0, 80),
      createdAt: "2026-06-29T09:00:00.000Z",
      payload: overrides.payload || {}
    }),
    loadAfterworkEntries: () => overrides.afterworks || [],
    sourceHash: () => currentHash,
    buildCanonicalAnalysis: (payload, text) => ({
      contentType: "academic_article",
      domain: "media_studies",
      theme: text.includes("medietidsskrift") ? "Konseptuelle artikler i medievitenskap" : "Kildeanalyse",
      mainTension: "Begrepsutvikling ↔ akademisk offentlighet",
      keyInsight: "Teksten handler om hvordan konseptuelle artikler kan utvikle presise fagbegreper.",
      fieldConnections: ["Medievitenskap"],
      historyGoLinks: [],
      suggestedActions: ["Sorter kjernebegrepene"],
      confidence: {
        contentType: 0.9,
        domain: 0.8,
        theme: 0.8,
        mainTension: 0.75,
        historyGoLinks: 0.5
      },
      warnings: [],
      ahaSer: {
        tema: "Konseptuelle artikler i medievitenskap",
        hovedspenning: "Begrepsutvikling ↔ akademisk offentlighet",
        viktigsteInnsikt: "Teksten løfter konseptuelle artikler som faglig format.",
        fagkoblinger: ["Medievitenskap"],
        nesteSteg: "Avklar hvilke begreper artikkelen utvikler.",
        kortSvar: "Teksten handler om konseptuelle artikler og faglig begrepsutvikling."
      },
      sortItems: [{ label: "Tema", text: "Konseptuelle artikler" }],
      list: ["Begrepsutvikling"],
      path: ["Identifiser hovedbegrep"],
      concepts: ["konseptuelle artikler", "medievitenskap"]
    }),
    ensureAcademicAfterworkShape: (afterwork) => afterwork,
    normalizeSubjectLinks: (items) => Array.isArray(items) ? items : [],
    normalizeFagkoblinger: (items) => Array.isArray(items) ? items : [],
    getLatestAhaReplyFromDom: () => overrides.domReply || "",
    loadChamberFromStorage: () => ({ insights: [], chatLog: [], meta: {} }),
    getCalibrationStatus: () => ({}),
    buildMetaProfile: () => ({}),
    setStatusNote: () => {},
    out: () => {}
  };
}

const loaded = loadExportApi();
const api = loaded.api;
assert.equal(typeof api.buildAhaAnalysisExportBundle, "function");
assert.equal(typeof api.createRuntime, "function");

{
  assert.throws(() => api.createRuntime({}), /mangler avhengighet: loadAutoOutputs/);
  const runtime = api.createRuntime({
    ...baseDeps({
      afterworks: [{
        sourceTextHash: "hash_current",
        textType: "day_log",
        summary: "Kort dagsoppsummering: feil format",
        reflection: "Dette er en dagslogg",
        learningPath: ["Oppsummer hendelsene kort"]
      }]
    }),
    getActiveAnalysisRun: () => null,
    analysisRunContract: loaded.window.AHAChatAnalysisRunContract,
    isAcademicLikeType: (type) => ["academic_article", "theory_idea"].includes(String(type || "")),
    document: {
      querySelectorAll: () => [{ textContent: "Eldre svar" }, { textContent: "Siste synlige AHA-svar" }]
    }
  });
  assert.equal(Object.isFrozen(runtime), true, "bound export runtime must be immutable");
  const bundle = runtime.buildAhaAnalysisExportBundle();
  assert.equal(bundle.ahaReply, "Siste synlige AHA-svar");
  assert.match(bundle.afterwork.summary, /Kort fagoppsummering/);
  assert.doesNotMatch(bundle.afterwork.summary, /Kort dagsoppsummering/);
  assert.doesNotMatch(bundle.afterwork.reflection, /dagslogg/i);
  assert.equal(runtime.formatAhaAnalysisExportMarkdown(bundle), api.formatAhaAnalysisExportMarkdown(bundle));
}

{
  const bundle = api.buildAhaAnalysisExportBundle(baseDeps({
    payload: {
      sourceTextHash: "b".repeat(64),
      ahaSer: { tema: "Gammelt tema som ikke hører til kilden" },
      reflection: "Dette er gammel analyse."
    }
  }));

  assert.equal(bundle.quality.status, "invalid_source_mismatch");
  assert.equal(bundle.quality.failClosed, true);
  assert.equal(JSON.stringify(bundle.sourceBinding.invalidFields.map((item) => item.field)), JSON.stringify(["rawAutoPayload"]));
  assert.equal(bundle.rawAutoPayload.source_binding.valid, false);
  assert.equal(bundle.rejectedRawAutoPayload.sourceTextHash, "b".repeat(64));
  assert.equal(bundle.ahaSer.tema, "Konseptuelle artikler i medievitenskap");
  assert.equal(bundle.contractVersion, "aha_analysis_run_v1");
  assert.equal(bundle.analysisBinding.valid, false);
}

{
  const bundle = api.buildAhaAnalysisExportBundle(baseDeps({
    payload: {
      ahaSer: { tema: "Konseptuelle artikler" },
      reflection: "Payload er pakket av current auto-output uten egen hash."
    }
  }));

  assert.equal(bundle.quality.status, "invalid_source_mismatch");
  assert.equal(bundle.quality.failClosed, true);
  assert.equal(bundle.rawAutoPayload.source_binding.status, "invalid_unbound_artifact");
  assert.equal(bundle.rawAutoPayload.source_binding.valid, false);
  assert.ok(bundle.rejectedRawAutoPayload);
}

{
  const bundle = api.buildAhaAnalysisExportBundle(baseDeps({
    payload: {},
    afterworks: [{
      id: "afterwork_1",
      sourceTextHash: "a".repeat(64),
      textType: "academic_article",
      summary: "Kildebundet etterarbeid",
      reflection: "Dette etterarbeidet matcher hash.",
      sortItems: [{ label: "Tema", text: "Konseptuelle artikler" }],
      list: ["Begreper"],
      learningPath: ["Les kilden"],
      concepts: ["medievitenskap"],
      subjectLinks: [{ title: "Medievitenskap" }]
    }]
  }));

  assert.equal(bundle.selectedAfterwork.source_binding.status, "historical_afterwork_excluded");
  assert.equal(bundle.afterwork.source_binding.valid, true);
  assert.doesNotMatch(bundle.afterwork.summary, /Kildebundet etterarbeid/);
  assert.equal(bundle.relevantAfterworks.length, 1, "historical afterwork may remain diagnostic but must not be merged");
}

{
  const lateGuard = loadExportApi();
  const sourceText = Array(10).fill("Evaluering kvalitet forvaltning oppfølging styring samfunnsnytte beslutninger").join(". ");
  const deps = baseDeps({ sourceText, payload: {} });
  deps.buildCanonicalAnalysis = () => ({
    contentType: "academic_article",
    theme: "Pinse og Den hellige ånd",
    mainTension: "Tungetale kontra Babels tårn",
    keyInsight: "Apostlene mottar Den hellige ånd og kirken blir født.",
    fieldConnections: ["Kristendom", "Kirkehistorie"],
    suggestedActions: ["Sammenlign pinse med Babels tårn og undersøk tungetale."],
    confidence: { theme: 0.8, mainTension: 0.8, keyInsight: 0.8 },
    ahaSer: {
      tema: "Pinse og Den hellige ånd",
      hovedspenning: "Tungetale kontra Babels tårn",
      viktigsteInnsikt: "Apostlene mottar Den hellige ånd.",
      nesteSteg: "Undersøk tungetale i kristne tradisjoner."
    }
  });
  const runtime = lateGuard.api.createRuntime({
    ...deps,
    getActiveAnalysisRun: () => null,
    analysisRunContract: lateGuard.window.AHAChatAnalysisRunContract,
    isAcademicLikeType: () => true
  });

  // Production loads the smoke/integrity layer after Chat has already bound
  // its runtime. The existing runtime must still call the newly guarded public
  // builder rather than its captured pre-guard implementation.
  vm.runInContext(smokeCode, lateGuard.sandbox, { filename: "ahaChatPythonSmoke.js" });
  const bundle = runtime.buildAhaAnalysisExportBundle();
  assert.equal(bundle.quality.topicConsistency.checkedAt, "post_export_semantic_guard");
  assert.equal(bundle.quality.failClosed, false);
  assert.equal(bundle.analysisBinding.valid, true, "rejected topic fields must not invalidate correctly source-bound fields");
  assert.ok(bundle.quality.rejectedTopicFields.some((item) => /canonicalAnalysis|ahaSer|afterwork/.test(item.field)), "topic rejection must identify concrete fields");
}

console.log("aha-chat-export-source-binding.test.cjs passed");
