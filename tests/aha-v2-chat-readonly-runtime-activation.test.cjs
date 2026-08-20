const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { console };
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

function makeInsight({ id, insight, concepts, quality = 0.9, source = id, reviewed = true }) {
  return {
    id,
    source_event_id: `source_${source}`,
    source_text_hash: "d".repeat(64),
    semantic_concepts: concepts,
    candidate: {
      insight,
      type: "principle",
      causal_status: "not_causal",
      evidence: [
        { quote: `Første dokumenterte belegg for ${source}.`, role: "supports" },
        { quote: `Andre dokumenterte belegg for ${source}.`, role: "supports" }
      ]
    },
    gate_decision: {
      eligible_for_insight_review: reviewed,
      blocking_reasons: reviewed ? [] : ["quality_score_below_threshold"],
      metrics: { quality_score: quality }
    }
  };
}

const trustedA = makeInsight({
  id: "trusted_a",
  insight: "Standardisering kan bevare sammenlignbarhet når fleksibilitet er eksplisitt avgrenset.",
  concepts: ["standardisering", "sammenlignbarhet", "fleksibilitet"],
  quality: 0.94,
  source: "a"
});
const trustedB = makeInsight({
  id: "trusted_b",
  insight: "Fleksibilitet kan øke behovet for lokal kvalitetssikring.",
  concepts: ["fleksibilitet", "kvalitetssikring"],
  quality: 0.9,
  source: "b"
});
const weak = makeInsight({
  id: "weak",
  insight: "Et svakt legacy-signal skal ikke oppgraderes automatisk.",
  concepts: ["legacy"],
  quality: 0.4,
  source: "weak",
  reviewed: false
});

let savingEnabled = false;
let memoryUseEnabled = true;
context.AHAChat = {
  isAhaSavingEnabled: () => savingEnabled,
  isAhaMemoryUseEnabled: () => memoryUseEnabled
};

let chamberReads = 0;
let currentInsightReads = 0;
let fetchCalls = 0;
const requests = [];
const agent = context.AHAChatAgentRuntime.create({
  subjectId: "sub_laring",
  getApiBase: () => "https://example.invalid/api/aha-agent",
  fetchImpl: async (url, options) => {
    fetchCalls += 1;
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, async json() { return { ok: true, reply: "ok" }; } };
  },
  loadChamber: () => {
    chamberReads += 1;
    return { insights: [trustedA, trustedB, weak], meta: {} };
  },
  getCurrentInsights: () => {
    currentInsightReads += 1;
    return [trustedA, trustedB, weak];
  },
  memoryConceptLabel: (value) => String(value || ""),
  buildUserMetaProfile: () => ({})
});

function memoryContext(items = [trustedA, trustedB, weak]) {
  return {
    used: true,
    reason: "relevant_test_memory",
    selectedInsights: items.map((insight) => ({ insight })),
    semanticMatches: [],
    localMatches: []
  };
}

(async () => {
  const message = "Hvordan balanserer vi standardisering, sammenlignbarhet, fleksibilitet og kvalitetssikring?";

  // Activation case: existing-memory use is on, new saving is off, and the
  // existing relevance gate has selected memory. V2 is added alongside memory.
  const automatic = await agent.buildAutomaticV2SemanticContext(message, { memoryContext: memoryContext() });
  assert.ok(automatic);
  assert.equal(automatic.used, true);
  assert.equal(automatic.mode, "read_only");
  assert.ok(automatic.insights.some((entry) => entry.member_ids.includes("trusted_a")));
  assert.ok(automatic.insights.some((entry) => entry.member_ids.includes("trusted_b")));
  assert.ok(automatic.insights.every((entry) => !entry.member_ids.includes("weak")));
  assert.equal(automatic.policy.normal_chat_persistence_authority, false);
  assert.equal(chamberReads, 0, "automatic V2 builder must reuse selected memory instead of loading Chamber");
  assert.equal(currentInsightReads, 0);

  const response = await agent.askAhaAgent(message, { memoryContext: memoryContext() });
  assert.equal(response.reply, "ok");
  assert.equal(fetchCalls, 1);
  assert.equal(chamberReads, 1, "existing legacy ai_state may read Chamber once; V2 must add no extra Chamber read");
  assert.equal(currentInsightReads, 1);
  const activeBody = requests.at(-1).body;
  assert.ok(activeBody.memory_context);
  assert.ok(activeBody.profile.semantic_context_v2);
  assert.equal(activeBody.profile.semantic_context_v2.mode, "read_only");
  assert.equal(activeBody.profile.semantic_context_v2.policy.persistent_write, false);
  assert.equal(activeBody.profile.semantic_context_v2.policy.authoritative_for_chat, false);
  assert.ok(activeBody.ai_state.top_insights.length > 0, "legacy memory behavior remains intact while memory use is enabled");

  // Saving on closes this V2 pilot path completely.
  savingEnabled = true;
  const savingOnAutomatic = await agent.buildAutomaticV2SemanticContext(message, { memoryContext: memoryContext() });
  assert.equal(savingOnAutomatic, null);
  await agent.askAhaAgent(message, { memoryContext: memoryContext() });
  assert.deepEqual(requests.at(-1).body.profile, {});

  // Existing-memory use off also closes the path.
  savingEnabled = false;
  memoryUseEnabled = false;
  const memoryOffAutomatic = await agent.buildAutomaticV2SemanticContext(message, { memoryContext: memoryContext() });
  assert.equal(memoryOffAutomatic, null);
  await agent.askAhaAgent(message, { memoryContext: memoryContext() });
  assert.deepEqual(requests.at(-1).body.profile, {});

  // No relevance-gated memory means no V2 context even if controls otherwise permit it.
  memoryUseEnabled = true;
  const noMemory = await agent.buildAutomaticV2SemanticContext(message, { memoryContext: { used: false, selectedInsights: [] } });
  assert.equal(noMemory, null);
  await agent.askAhaAgent(message, { memoryContext: { used: false, selectedInsights: [] } });
  const noMemoryBody = requests.at(-1).body;
  assert.deepEqual(noMemoryBody.profile, {});
  assert.equal(noMemoryBody.memory_context, null);
  assert.deepEqual(noMemoryBody.ai_state, { top_insights: [], concepts: [], meta_profile: {} });

  // Relevant memory that contains no V2 trust-ready items also fails closed.
  const weakOnly = await agent.buildAutomaticV2SemanticContext(message, { memoryContext: memoryContext([weak]) });
  assert.equal(weakOnly, null);

  // Missing control facade fails closed rather than guessing saving/memory state.
  const chatBackup = context.AHAChat;
  context.AHAChat = null;
  const controlsMissing = await agent.buildAutomaticV2SemanticContext(message, { memoryContext: memoryContext() });
  assert.equal(controlsMissing, null);
  context.AHAChat = chatBackup;

  // Explicit already-validated V2 context still follows the transport contract
  // and does not depend on the automatic activation controls.
  savingEnabled = true;
  const explicit = context.AHAV2ChatReadOnlyContext.build({
    source_text: message,
    legacy_insights: [trustedA, trustedB],
    memory_allowed: true,
    persistence_disabled: true
  });
  assert.equal(explicit.used, true);
  await agent.askAhaAgent(message, { semanticContextV2: explicit });
  assert.ok(requests.at(-1).body.profile.semantic_context_v2);

  // The runtime activation remains read-only by source inspection.
  const source = fs.readFileSync("js/ahaChatAgentRuntime.js", "utf8");
  for (const [pattern, label] of [
    [/localStorage\s*\./, "localStorage writes/reads"],
    [/saveChamber/i, "Chamber write"],
    [/AHARepository\s*\./, "repository write"],
    [/\.execute\s*\(/, "migration execute"],
    [/\.rollback\s*\(/, "migration rollback"],
    [/normal_chat_persistence_authority:\s*true/, "normal Chat persistence authority"],
    [/authoritative_for_chat:\s*true/, "Chat authority"]
  ]) assert.equal(pattern.test(source), false, `runtime must not contain ${label}`);
  assert.match(source, /controls\.savingEnabled !== false \|\| controls\.memoryUseEnabled !== true/);
  assert.match(source, /selectedMemoryInsights\(memoryContext\)/);
  assert.match(source, /persistence_disabled:\s*true/);
  assert.match(source, /memory_allowed:\s*true/);

  console.log("aha-v2-chat-readonly-runtime-activation.test.cjs: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
