const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const code = fs.readFileSync(path.join(repoRoot, "js/ahaChatPythonSmoke.js"), "utf8");

function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.has(String(key)) ? store.get(String(key)) : null,
    setItem: (key, value) => { store.set(String(key), String(value)); },
    removeItem: (key) => { store.delete(String(key)); }
  };
}

function loadSmokeModule(storage = makeLocalStorage(), windowExtras = {}) {
  const sandbox = {
    window: {
      localStorage: storage,
      setTimeout: (callback) => callback(),
      requestAnimationFrame: (callback) => callback(),
      ...windowExtras
    },
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
    Map
  };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(code, sandbox, { filename: "ahaChatPythonSmoke.js" });
  return sandbox.window;
}

const AUTO_OUTPUT_STORAGE_KEY = "aha_chat_auto_outputs_v1";

{
  const win = loadSmokeModule();
  const auto = win.AHAAutoOutputSourceBinding.bindAutoOutputToSource({
    sourceText: "Dette er kildeteksten.",
    sourceTextHash: "hash_current",
    payload: {
      textType: "academic_article",
      reflection: "Analyse av kilden.",
      canonicalAnalysis: { contentType: "academic_article" },
      ahaSer: { tema: "Kildetema" }
    }
  });

  assert.equal(auto.sourceTextHash, "hash_current");
  assert.equal(auto.payload.sourceTextHash, "hash_current");
  assert.equal(auto.payload.source_binding.status, "inferred_from_auto_output_wrapper");
  assert.equal(auto.payload.canonicalAnalysis.sourceTextHash, "hash_current");
  assert.equal(auto.payload.ahaSer.sourceTextHash, "hash_current");
  assert.equal(JSON.stringify(auto.sourceBinding.invalidFields), JSON.stringify([]));
}

{
  const win = loadSmokeModule();
  const auto = win.AHAAutoOutputSourceBinding.bindAutoOutputToSource({
    sourceText: "Dette er ny kildetekst.",
    sourceTextHash: "hash_current",
    payload: {
      sourceTextHash: "old_hash",
      reflection: "Stale payload"
    }
  });

  assert.equal(auto.payload.sourceTextHash, "old_hash");
  assert.equal(auto.payload.source_binding.status, "invalid_hash_mismatch");
  assert.equal(auto.payload.source_binding.valid, false);
  assert.equal(JSON.stringify(auto.sourceBinding.invalidFields.map((item) => item.field)), JSON.stringify(["rawAutoPayload"]));
}

{
  const storage = makeLocalStorage();
  storage.setItem(AUTO_OUTPUT_STORAGE_KEY, JSON.stringify({
    sourceText: "Norsk medietidsskrift lanserer konseptuelle artikler.",
    sourceTextHash: "hash_current",
    payload: {
      canonicalAnalysis: { contentType: "academic_article" }
    }
  }));
  const win = loadSmokeModule(storage);
  const repaired = win.AHAAutoOutputSourceBinding.repairStored();
  const stored = JSON.parse(storage.getItem(AUTO_OUTPUT_STORAGE_KEY));

  assert.equal(repaired.payload.sourceTextHash, undefined);
  assert.equal(stored.payload.canonicalAnalysis.sourceTextHash, undefined);
  assert.equal(repaired.payload.source_binding.status, "warning_unverified_binding");
  assert.equal(repaired.payload.source_binding.valid, false);
  assert.equal(win.AHAPythonEngineSmokeTest.printStatus().latestPayloadSourceBinding, "warning_unverified_binding");
}

const evaluationSource = `
Offentlig ansatte ønsker at evalueringer skal ha høyere kvalitet, bli tettere fulgt opp og integreres bedre med målstyringssystemet.
Formålet med å evaluere er at evalueringene skal gi økt samfunnsnytte. Evalueringer kan brukes til læring og forbedring, men også strategisk.
Forvaltningen bruker evalueringer i beslutningsprosesser. Respondentene etterlyser mer systematikk, oppfølging, fagkompetanse og integrering i mål- og resultatstyring.
Evalueringskvalitet og relevans øker sannsynligheten for endring. Ledelsen bør identifisere evalueringsbehov og evalueringene bør planlegges når tiltak utformes.
Deltakende metoder og referansegrupper kan gjøre evalueringer mer relevante. Forvaltningen trenger bedre evalueringer, ikke nødvendigvis flere evalueringer.
Evaluering, forvaltning, kvalitet, samfunnsnytte, evaluering, forvaltning, evaluering, kvalitet, oppfølging, styring.
`;

const stalePentecostPayload = {
  canonicalAnalysis: {
    contentType: "academic_article",
    theme: "Pinse som kristen høytid, Den hellige ånd, tungetale og kirkens fødsel.",
    mainTension: "Språkforvirring og språkforståelse ved Babels tårn.",
    keyInsight: "Pinse markerer Den hellige ånds komme til apostlene og kirkens begynnelse.",
    fieldConnections: ["Kristendom", "Kirkehistorie", "Det nye testamentet", "Liturgi"],
    suggestedActions: [
      "Forstå pinsefortellingen i Apostlenes gjerninger.",
      "Sammenlign pinse med Babels tårn.",
      "Undersøk tungetale i kristne tradisjoner."
    ],
    summary: "Pinse er en kristen høytid femti dager etter påske.",
    reflection: "En religionsfaglig tekst om pinse, tungetale og kirkelig praksis."
  },
  ahaSer: {
    tema: "Pinse, Den hellige ånd og tungetale",
    viktigsteInnsikt: "Apostlene mottar Den hellige ånd."
  },
  reflection: "Teksten er en religionsfaglig leksikontekst om pinse.",
  day: "Pinse er kirkens fødselsdag.",
  list: ["Pinse feires etter påske", "Babels tårn er symbolsk kontrast"],
  path: ["Lær om apostlene", "Undersøk tungetale"]
};

{
  const storage = makeLocalStorage();
  storage.setItem(AUTO_OUTPUT_STORAGE_KEY, JSON.stringify({
    sourceText: evaluationSource,
    sourceTextHash: "hash_evaluation",
    payload: stalePentecostPayload
  }));
  const win = loadSmokeModule(storage);
  const repaired = win.AHAAutoOutputSourceBinding.repairStored();

  assert.equal(repaired.payload.sourceTextHash, undefined);
  assert.equal(repaired.payload.source_binding.status, "invalid_semantic_topic_mismatch");
  assert.equal(repaired.payload.source_binding.valid, false);
  assert.equal(repaired.sourceBinding.semanticTopicReport.valid, false);
  assert.ok(repaired.sourceBinding.invalidFields.some((item) => item.status === "invalid_semantic_topic_mismatch"));
}

{
  const fakeBundle = {
    sourceText: evaluationSource,
    sourceTextHash: "hash_evaluation",
    canonicalAnalysis: stalePentecostPayload.canonicalAnalysis,
    afterwork: {
      summary: stalePentecostPayload.day,
      reflection: stalePentecostPayload.reflection,
      list: stalePentecostPayload.list,
      path: stalePentecostPayload.path
    },
    quality: {
      status: "valid",
      failClosed: false,
      warnings: [],
      sourceBinding: { invalidFields: [] },
      topicConsistency: { status: "valid", valid: true }
    }
  };
  const exporter = {
    buildAhaAnalysisExportBundle() {
      return JSON.parse(JSON.stringify(fakeBundle));
    }
  };
  const win = loadSmokeModule(makeLocalStorage(), { AHAChatExport: exporter });
  const bundle = win.AHAChatExport.buildAhaAnalysisExportBundle({});

  assert.equal(bundle.quality.status, "invalid_topic_mismatch");
  assert.equal(bundle.quality.failClosed, true);
  assert.equal(bundle.quality.topicConsistency.status, "invalid_semantic_topic_mismatch");
  assert.equal(bundle.quality.topicConsistency.valid, false);
  assert.ok(bundle.quality.warnings.includes("semantic_topic_mismatch"));
  assert.ok(bundle.quality.sourceBinding.invalidFields.some((item) => item.field === "topicConsistency"));
}

{
  const goodBundle = {
    sourceText: evaluationSource,
    canonicalAnalysis: {
      theme: "Evaluering og samfunnsnytte i offentlig forvaltning",
      keyInsight: "Evalueringer blir nyttigere når kvalitet, oppfølging og styring kobles sammen.",
      summary: "Forvaltningen trenger bedre og mer systematiske evalueringer."
    },
    quality: { status: "valid", failClosed: false, warnings: [], sourceBinding: { invalidFields: [] } }
  };
  const exporter = { buildAhaAnalysisExportBundle: () => JSON.parse(JSON.stringify(goodBundle)) };
  const win = loadSmokeModule(makeLocalStorage(), { AHAChatExport: exporter });
  const bundle = win.AHAChatExport.buildAhaAnalysisExportBundle({});
  assert.equal(bundle.quality.status, "valid");
  assert.equal(bundle.quality.failClosed, false);
}

console.log("aha-auto-output-source-binding.test.cjs passed");
