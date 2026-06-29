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

function loadSmokeModule(storage = makeLocalStorage()) {
  const sandbox = {
    window: {
      localStorage: storage,
      setTimeout: (callback) => callback(),
      requestAnimationFrame: (callback) => callback()
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
  assert.deepEqual(auto.sourceBinding.invalidFields, []);
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
  assert.deepEqual(auto.sourceBinding.invalidFields.map((item) => item.field), ["rawAutoPayload"]);
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

  assert.equal(repaired.payload.sourceTextHash, "hash_current");
  assert.equal(stored.payload.canonicalAnalysis.sourceTextHash, "hash_current");
  assert.equal(win.AHAPythonEngineSmokeTest.printStatus().latestPayloadSourceBinding, "inferred_from_auto_output_wrapper");
}

console.log("aha-auto-output-source-binding.test.cjs passed");