const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const code = fs.readFileSync(path.join(repoRoot, "js/ahaChatExport.js"), "utf8");

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
  vm.runInNewContext(code, sandbox, { filename: "ahaChatExport.js" });
  return sandbox.window.AHAChatExport;
}

function baseDeps(overrides = {}) {
  const currentHash = overrides.currentHash || "hash_current";
  const sourceText = overrides.sourceText || "Norsk medietidsskrift lanserer konseptuelle artikler om begreper, offentlighet og medievitenskap.";
  return {
    loadAutoOutputs: () => ({
      sourceText,
      sourceTextHash: currentHash,
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

const api = loadExportApi();
assert.equal(typeof api.buildAhaAnalysisExportBundle, "function");

{
  const bundle = api.buildAhaAnalysisExportBundle(baseDeps({
    payload: {
      sourceTextHash: "old_hash",
      ahaSer: { tema: "Gammelt tema som ikke hører til kilden" },
      reflection: "Dette er gammel analyse."
    }
  }));

  assert.equal(bundle.quality.status, "invalid_source_mismatch");
  assert.equal(bundle.quality.failClosed, true);
  assert.deepEqual(bundle.sourceBinding.invalidFields.map((item) => item.field), ["rawAutoPayload"]);
  assert.equal(bundle.rawAutoPayload.source_binding.valid, false);
  assert.equal(bundle.rejectedRawAutoPayload.sourceTextHash, "old_hash");
  assert.equal(bundle.ahaSer.tema, "Konseptuelle artikler i medievitenskap");
}

{
  const bundle = api.buildAhaAnalysisExportBundle(baseDeps({
    payload: {
      ahaSer: { tema: "Konseptuelle artikler" },
      reflection: "Payload er pakket av current auto-output uten egen hash."
    }
  }));

  assert.equal(bundle.quality.status, "warning_unverified_binding");
  assert.equal(bundle.quality.failClosed, false);
  assert.equal(bundle.rawAutoPayload.source_binding.status, "inferred_from_auto_wrapper");
  assert.equal(bundle.rawAutoPayload.source_binding.valid, true);
  assert.equal(bundle.rejectedRawAutoPayload, null);
}

{
  const bundle = api.buildAhaAnalysisExportBundle(baseDeps({
    payload: {},
    afterworks: [{
      id: "afterwork_1",
      sourceTextHash: "hash_current",
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

  assert.equal(bundle.selectedAfterwork.source_binding.valid, true);
  assert.equal(bundle.afterwork.source_binding.valid, true);
  assert.equal(bundle.afterwork.summary, "Kildebundet etterarbeid");
}

console.log("aha-chat-export-source-binding.test.cjs passed");