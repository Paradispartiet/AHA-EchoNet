const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("js/ahaChatIngestRuntime.js", "utf8");
const chatSource = fs.readFileSync("js/ahaChat.js", "utf8");
const chatHtml = fs.readFileSync("chat.html", "utf8");
const context = { window: null };
context.window = context;
vm.runInNewContext(source, context, { filename: "js/ahaChatIngestRuntime.js" });

assert.equal(typeof context.AHAChatIngestRuntime?.create, "function");
assert.equal(Object.isFrozen(context.AHAChatIngestRuntime), true);

function createHarness(options = {}) {
  const calls = {
    canonical: [],
    legacyIngest: [],
    sources: [],
    signals: [],
    saves: [],
    ai: []
  };
  const engine = {
    createSignalFromMessage(text, subjectId, themeId, meta) {
      const signal = { text, subjectId, themeId, meta };
      calls.signals.push(signal);
      return signal;
    },
    addSignalToChamber(chamber, signal) {
      return { ...chamber, signals: [...(chamber.signals || []), signal] };
    }
  };
  const canonicalIngest = options.canonical === false ? null : {
    ingest() {},
    ingestWithCandidates(payload, candidates) {
      calls.canonical.push({ payload, candidates });
      return { ok: true };
    }
  };
  const runtime = context.AHAChatIngestRuntime.create({
    subjectId: "sub_laring",
    getInsightsApi: () => options.engine === false ? null : engine,
    getIngestApi: () => canonicalIngest,
    getSourcesApi: () => ({ addSourceEvent: (payload) => calls.sources.push(payload) }),
    getThemeId: () => "theme_test",
    getFieldId: () => "field_test",
    buildSemanticInsightCandidates: () => [{ text: "Semantisk kandidat" }],
    generateAIInsightCandidates: async (text, inputContext) => {
      calls.ai.push({ text, inputContext });
      return options.aiCandidates || [];
    },
    buildAIState: () => ({ state: "test" }),
    loadChamber: () => ({ signals: [] }),
    saveChamber: (chamber) => calls.saves.push(chamber),
    now: () => "2026-08-14T00:00:00.000Z"
  });
  return { runtime, calls };
}

{
  const { runtime, calls } = createHarness();
  const count = runtime.handleUserMessage("  En brukermelding  ");
  assert.equal(count, 1);
  assert.equal(calls.canonical.length, 1, "standardflyten skal bruke ingestWithCandidates én gang");
  assert.equal(calls.sources.length, 0, "standardflyten skal ikke skrive en parallell source event");
  assert.equal(calls.saves.length, 0, "standardflyten skal ikke skrive kammeret direkte");
  assert.deepEqual(Array.from(calls.canonical[0].candidates, (item) => item.text), ["Semantisk kandidat"]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.canonical[0].payload)), {
    source_type: "chat",
    source_app: "aha_chat",
    content_type: "text",
    title: "AHA Chat-melding",
    text: "En brukermelding",
    user_created: true,
    imported: false,
    created_at: "2026-08-14T00:00:00.000Z",
    subject_id: "sub_laring",
    theme_id: "theme_test",
    field_id: "field_test",
    meta: { theme_id: "theme_test", field_id: "field_test" }
  });
}

{
  const { runtime, calls } = createHarness({ canonical: false });
  const candidates = ["Første kandidat", { summary: "Andre kandidat" }, { text: "" }];
  const count = runtime.ingestUserMessageWithCandidates("Legacy-kilde", candidates);
  assert.equal(count, 3, "legacy-fallbacken skal bevare eksisterende returkontrakt");
  assert.equal(calls.signals.length, 2);
  assert.equal(calls.saves.length, 1);
  assert.equal(calls.sources.length, 1, "legacy-fallbacken skal logge nøyaktig én source event");
  assert.equal(calls.sources[0].text, "Legacy-kilde");
  assert.equal(calls.sources[0].subject_id, undefined, "legacy source-event-formatet skal forbli uendret");
}

async function verifyBackgroundIngest() {
  const { runtime, calls } = createHarness({ aiCandidates: [{ text: "AI-kandidat" }] });
  const count = await runtime.handleUserMessageInsightCandidatesInBackground("Bakgrunnsmelding");
  assert.equal(count, 1);
  assert.equal(calls.ai.length, 1);
  assert.equal(calls.canonical.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.ai[0].inputContext)), {
    subject_id: "sub_laring",
    theme_id: "theme_test",
    field_id: "field_test",
    ai_state: { state: "test" }
  });
}

{
  const { runtime, calls } = createHarness({ engine: false });
  assert.equal(runtime.handleUserMessage("Ingen motor"), 0);
  assert.equal(calls.canonical.length, 0);
}

assert.match(chatSource, /providerLoader\.instantiate\("ingestRuntime", \{/);
assert.doesNotMatch(chatSource, /function (?:ingestUserMessageWithCandidates|handleUserMessageInsightCandidatesInBackground)\s*\(/);
assert.doesNotMatch(chatSource, /ingestWithCandidates|addSourceEvent\?\.\(/);
assert.ok(chatHtml.indexOf("js/ahaChatIngestRuntime.js") < chatHtml.indexOf("js/ahaChat.js"));

verifyBackgroundIngest()
  .then(() => console.log("aha-chat-ingest-runtime passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
