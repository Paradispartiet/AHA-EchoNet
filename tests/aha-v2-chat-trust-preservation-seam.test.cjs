const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { console, URL };
context.window = context;
context.globalThis = context;
vm.createContext(context);

function load(path) {
  vm.runInContext(fs.readFileSync(path, "utf8"), context, { filename: path });
}

load("js/ahaInsightRelationClassifierV2.js");
load("js/ahaInsightSaturationV2.js");
load("js/ahaKnowledgeMigrationV2.js");
load("js/ahaSemanticProjectionsV2.js");
load("js/ahaV2ProductIntegrationGate.js");
load("js/ahaV2ChatReadOnlyContext.js");
load("js/ahaChatAgentRuntime.js");

const evidenceQuoteA = "Trust-belegg A skal aldri ligge i vanlig memory_context.";
const evidenceQuoteB = "Trust-belegg B skal bare brukes lokalt for V2 readiness.";
const candidateSignature = "candidate_signature_private_v2_test";

const trusted = {
  id: "ins_v2_trusted_runtime",
  title: "Standardisering og fleksibilitet",
  summary: "Standardisering kan bevare sammenlignbarhet når fleksibilitet er eksplisitt avgrenset.",
  concepts: [{ label: "standardisering" }, { label: "sammenlignbarhet" }, { label: "fleksibilitet" }],
  status: "suggested",
  activation_v2: {
    schema: "aha_insight_activation_v2",
    review_id: "review_v2_trusted_runtime",
    candidate_signature: candidateSignature,
    source_event_id: "source_runtime_trust",
    source_text_hash: "a".repeat(64),
    type: "principle",
    evidence: [
      { quote: evidenceQuoteA, role: "supports" },
      { quote: evidenceQuoteB, role: "supports" }
    ],
    causal_status: "not_causal",
    gate_metrics: { quality_score: 0.93 },
    production_proof: { workflow_run_id: 32369823544 },
    backend_sync_allowed: false,
    meta_write_allowed: false
  }
};

const weak = {
  id: "legacy_weak_runtime",
  title: "Standardisering uten V2 trust",
  summary: "Et gammelt signal om standardisering mangler kvalitet og provenance.",
  concepts: [{ label: "standardisering" }]
};

function compact(record, score) {
  return {
    id: record.id,
    title: record.title,
    summary: record.summary,
    concepts: record.concepts.map((item) => item.label),
    score,
    source: "local"
  };
}

function memoryContext(records = [trusted, weak]) {
  return {
    used: true,
    reason: "Lokale innsikter matcher tydelig på prosjekt, tema eller begreper.",
    confidence: 0.8,
    mode: "semantic_match",
    localMatches: records.map((record, index) => ({ id: record.id, title: record.title, score: 8 - index, reasons: ["begrep:standardisering"] })),
    semanticMatches: [],
    selectedInsights: records.map((record, index) => compact(record, 8 - index)),
    summaryForAgent: records.map((record, index) => `${index + 1}. ${record.title}: ${record.summary}`).join("\n")
  };
}

let savingEnabled = false;
let memoryUseEnabled = true;
context.AHAChat = {
  isAhaSavingEnabled: () => savingEnabled,
  isAhaMemoryUseEnabled: () => memoryUseEnabled
};

let chamberReads = 0;
let currentInsightReads = 0;
const requests = [];
const fullChamber = { insights: [trusted, weak], meta: {} };
const agent = context.AHAChatAgentRuntime.create({
  subjectId: "sub_laring",
  getApiBase: () => "https://example.invalid/api/aha-agent",
  fetchImpl: async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body), serialized: options.body });
    return { ok: true, async json() { return { ok: true, reply: "ok" }; } };
  },
  loadChamber: () => {
    chamberReads += 1;
    return fullChamber;
  },
  getCurrentInsights: () => {
    currentInsightReads += 1;
    return fullChamber.insights;
  },
  memoryConceptLabel: (value) => typeof value === "object" ? String(value?.label || "") : String(value || ""),
  buildUserMetaProfile: () => ({})
});

(async () => {
  const message = "Hvordan balanserer vi standardisering, sammenlignbarhet og fleksibilitet?";
  const compactContext = memoryContext();

  // The actual Memory Runtime shape is compact. Agent Runtime must resolve only
  // the relevance-selected IDs back to their current full Chamber records.
  const resolved = agent.resolveSelectedMemoryInsights(compactContext, {
    preloadedChamber: fullChamber,
    preloadedCurrentInsights: fullChamber.insights
  });
  assert.equal(resolved.length, 2);
  assert.equal(resolved[0], trusted);
  assert.equal(resolved[1], weak);
  assert.equal(resolved[0].activation_v2.candidate_signature, candidateSignature);

  // A real ask must use exactly the reads legacy ai_state already needs: one
  // Chamber read and one current-insight read. V2 may not add another read.
  const response = await agent.askAhaAgent(message, { memoryContext: compactContext });
  assert.equal(response.reply, "ok");
  assert.equal(chamberReads, 1, "V2 seam must not add a second Chamber read");
  assert.equal(currentInsightReads, 1, "V2 seam must reuse the existing current-insight read");
  assert.equal(requests.length, 1);

  const request = requests[0];
  const body = request.body;
  assert.ok(body.profile.semantic_context_v2, "trust-ready selected Chamber record must reach bounded V2 profile context");
  assert.equal(body.profile.semantic_context_v2.mode, "read_only");
  assert.equal(body.profile.semantic_context_v2.policy.authoritative_for_chat, false);
  assert.equal(body.profile.semantic_context_v2.policy.persistent_write, false);
  assert.equal(body.profile.semantic_context_v2.policy.normal_chat_persistence_authority, false);
  assert.equal(body.profile.semantic_context_v2.insights.length, 1, "weak selected memory must not be upgraded to trusted V2 context");
  assert.ok(body.profile.semantic_context_v2.insights[0].quality_score >= 0.9);

  // Normal memory transport stays compact. Full trust/provenance records are an
  // internal lookup only and must never leak through memory_context/similar_insights.
  assert.deepEqual(body.memory_context.selectedInsights, compactContext.selectedInsights);
  assert.equal(Object.prototype.hasOwnProperty.call(body.memory_context.selectedInsights[0], "activation_v2"), false);
  assert.equal(request.serialized.includes(evidenceQuoteA), false);
  assert.equal(request.serialized.includes(evidenceQuoteB), false);
  assert.equal(request.serialized.includes(candidateSignature), false);
  assert.ok(body.ai_state.top_insights.some((entry) => entry.id === trusted.id));

  // Selection authority remains with Memory Relevance Gate. A full trusted
  // Chamber record that was not selected must not enter V2 context.
  const weakOnlyContext = memoryContext([weak]);
  await agent.askAhaAgent(message, { memoryContext: weakOnlyContext });
  assert.deepEqual(requests.at(-1).body.profile, {});
  assert.equal(chamberReads, 2);
  assert.equal(currentInsightReads, 2);

  const missingContext = {
    ...memoryContext([trusted]),
    selectedInsights: [{ id: "not_in_chamber", title: trusted.title, summary: trusted.summary, concepts: ["standardisering"], score: 8, source: "local" }]
  };
  await agent.askAhaAgent(message, { memoryContext: missingContext });
  assert.deepEqual(requests.at(-1).body.profile, {}, "unresolved selected ID must fail closed instead of borrowing another Chamber record");

  // Runtime kill switches remain authoritative even though full records can now
  // be resolved after relevance selection.
  savingEnabled = true;
  await agent.askAhaAgent(message, { memoryContext: compactContext });
  assert.deepEqual(requests.at(-1).body.profile, {});
  savingEnabled = false;
  memoryUseEnabled = false;
  await agent.askAhaAgent(message, { memoryContext: compactContext });
  assert.deepEqual(requests.at(-1).body.profile, {});
  memoryUseEnabled = true;

  // No selected memory means no preloading and no V2 context.
  const readsBeforeNoMemory = { chamberReads, currentInsightReads };
  await agent.askAhaAgent(message, { memoryContext: { used: false, selectedInsights: [] } });
  assert.equal(chamberReads, readsBeforeNoMemory.chamberReads);
  assert.equal(currentInsightReads, readsBeforeNoMemory.currentInsightReads);
  assert.deepEqual(requests.at(-1).body.profile, {});
  assert.equal(requests.at(-1).body.memory_context, null);

  const source = fs.readFileSync("js/ahaChatAgentRuntime.js", "utf8");
  assert.match(source, /resolveSelectedMemoryInsights\(memoryContext, options\)/);
  assert.match(source, /preloadedChamber: loadChamber\(\)/);
  assert.match(source, /preloadedCurrentInsights: getCurrentInsights\(\)/);
  assert.match(source, /memory_context: memoryContext/);
  for (const [pattern, label] of [
    [/localStorage\s*\./, "localStorage access"],
    [/saveChamber/i, "Chamber write"],
    [/AHARepository\s*\./, "repository access"],
    [/\.execute\s*\(/, "migration execute"],
    [/\.rollback\s*\(/, "migration rollback"],
    [/normal_chat_persistence_authority:\s*true/, "normal Chat persistence authority"],
    [/authoritative_for_chat:\s*true/, "Chat authority"]
  ]) assert.equal(pattern.test(source), false, `runtime must not contain ${label}`);

  console.log("aha-v2-chat-trust-preservation-seam.test.cjs: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
