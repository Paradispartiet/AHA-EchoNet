const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

let forbiddenCalls = 0;
const context = {
  console,
  localStorage: new Proxy({}, { get() { forbiddenCalls += 1; throw new Error("V2 Chat context must not touch localStorage"); } }),
  AHARepository: new Proxy({}, { get() { forbiddenCalls += 1; throw new Error("V2 Chat context must not touch repository"); } }),
  InsightsEngine: new Proxy({}, { get() { forbiddenCalls += 1; throw new Error("V2 Chat context must not touch InsightsEngine"); } }),
  supabase: new Proxy({}, { get() { forbiddenCalls += 1; throw new Error("V2 Chat context must not touch Supabase"); } })
};
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

const builder = context.AHAV2ChatReadOnlyContext;
assert.ok(builder);
assert.equal(builder.CONTEXT_SCHEMA, "aha_v2_chat_readonly_context_v1");

function makeInsight({ id, insight, concepts, quality = 0.88, source = id }) {
  return {
    id,
    source_event_id: `source_${source}`,
    source_text_hash: "c".repeat(64),
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
      eligible_for_insight_review: true,
      blocking_reasons: [],
      metrics: { quality_score: quality }
    }
  };
}

const standardization = makeInsight({
  id: "legacy_standardization",
  insight: "Delvis standardisering bevarer sammenlignbarhet samtidig som valgfrie felt gir nødvendig fleksibilitet.",
  concepts: ["standardisering", "sammenlignbarhet", "fleksibilitet"],
  quality: 0.93,
  source: "standardization"
});
const quality = makeInsight({
  id: "legacy_quality",
  insight: "Fleksibilitet gjennom valgfrie felt kan gjøre lokal kvalitetssikring mer krevende.",
  concepts: ["fleksibilitet", "kvalitetssikring"],
  quality: 0.89,
  source: "quality"
});
const unrelated = makeInsight({
  id: "legacy_unrelated",
  insight: "Historiske tidsserier kan vise langsiktige endringer i urban befolkningsutvikling.",
  concepts: ["historie", "tidsserier", "befolkning"],
  quality: 0.9,
  source: "unrelated"
});

const sourceText = "Hvordan kan standardisering bevare sammenlignbarhet uten å miste fleksibilitet og kvalitetssikring?";
const chamber = { insights: [standardization, quality, unrelated] };
const readOnly = builder.build({
  source_text: sourceText,
  chamber,
  memory_allowed: true,
  persistence_disabled: true
});

assert.equal(readOnly.used, true, JSON.stringify(readOnly));
assert.equal(readOnly.mode, "read_only");
assert.equal(readOnly.reason, "relevant_v2_projection_context");
assert.ok(readOnly.gate_id.startsWith("v2_integration_gate_"));
assert.ok(readOnly.projection_id.startsWith("projection_v2_"));
assert.ok(readOnly.source_hash);
assert.ok(readOnly.insights.length >= 2);
assert.ok(readOnly.insights.length <= builder.MAX_INSIGHTS);
assert.ok(readOnly.insights.some((item) => item.member_ids.includes("legacy_standardization")));
assert.ok(readOnly.insights.some((item) => item.member_ids.includes("legacy_quality")));
assert.ok(readOnly.insights.every((item) => !item.member_ids.includes("legacy_unrelated")), "irrelevant legacy insight must not enter Chat context");
assert.ok(readOnly.insights.every((item) => item.relevance >= builder.MIN_RELEVANCE));
assert.ok(readOnly.concepts.some((concept) => concept.key === "standardisering"));
assert.ok(readOnly.usage_rules.includes("prefer_current_user_message_on_conflict"));
assert.ok(readOnly.usage_rules.includes("do_not_create_memory_or_persistence_from_context"));
for (const [key, value] of Object.entries(readOnly.policy)) assert.equal(value, false, `${key} must stay false`);

// Context must be unavailable unless existing-memory use is permitted AND new persistence is disabled.
const memoryOff = builder.build({ source_text: sourceText, chamber, memory_allowed: false, persistence_disabled: true });
assert.equal(memoryOff.used, false);
assert.equal(memoryOff.reason, "existing_memory_not_allowed");
const persistenceOn = builder.build({ source_text: sourceText, chamber, memory_allowed: true, persistence_disabled: false });
assert.equal(persistenceOn.used, false);
assert.equal(persistenceOn.reason, "persistence_must_be_disabled_for_v2_chat_gate");
const irrelevant = builder.build({
  source_text: "Hva er dagens temperatur på Mars?",
  chamber,
  memory_allowed: true,
  persistence_disabled: true
});
assert.equal(irrelevant.used, false);
assert.equal(irrelevant.reason, "no_relevant_v2_context");

let chamberReads = 0;
let currentInsightReads = 0;
let fetchCalls = 0;
let lastRequest = null;
const agent = context.AHAChatAgentRuntime.create({
  subjectId: "sub_laring",
  getApiBase: () => "https://example.invalid/api/aha-agent",
  fetchImpl: async (url, options) => {
    fetchCalls += 1;
    lastRequest = { url, options };
    return { ok: true, async json() { return { ok: true, reply: "ok" }; } };
  },
  loadChamber: () => { chamberReads += 1; throw new Error("read-only V2 transport must not implicitly load Chamber"); },
  getCurrentInsights: () => { currentInsightReads += 1; throw new Error("read-only V2 transport must not implicitly load current insights"); },
  memoryConceptLabel: (value) => String(value || ""),
  buildUserMetaProfile: () => ({})
});

const body = agent.buildAgentRequestBody(sourceText, { semanticContextV2: readOnly });
assert.deepEqual(body.ai_state, { top_insights: [], concepts: [], meta_profile: {} });
assert.equal(body.memory_context, null);
assert.equal(body.personal_context, null);
assert.deepEqual(body.similar_insights, []);
assert.ok(body.profile.semantic_context_v2);
assert.equal(body.profile.semantic_context_v2.schema, "aha_v2_chat_readonly_context_v1");
assert.equal(body.profile.semantic_context_v2.used, true);
assert.equal(body.profile.semantic_context_v2.policy.authoritative_for_chat, false);
assert.equal(body.profile.semantic_context_v2.policy.normal_chat_persistence_authority, false);
assert.equal(body.profile.semantic_context_v2.insights.length, readOnly.insights.length);
assert.equal(chamberReads, 0);
assert.equal(currentInsightReads, 0);

// Any context that tries to claim authority or write permission is rejected before transport.
const manipulated = JSON.parse(JSON.stringify(readOnly));
manipulated.policy.persistent_write = true;
const manipulatedBody = agent.buildAgentRequestBody(sourceText, { semanticContextV2: manipulated });
assert.deepEqual(manipulatedBody.profile, {});
const wrongSchema = { ...readOnly, schema: "other", used: true };
assert.deepEqual(agent.buildAgentRequestBody(sourceText, { semanticContextV2: wrongSchema }).profile, {});

(async () => {
  const response = await agent.askAhaAgent(sourceText, { semanticContextV2: readOnly });
  assert.equal(response.reply, "ok");
  assert.equal(fetchCalls, 1);
  assert.equal(lastRequest.url, "https://example.invalid/api/aha-agent/chat");
  const sent = JSON.parse(lastRequest.options.body);
  assert.ok(sent.profile.semantic_context_v2);
  assert.equal(sent.memory_context, null);
  assert.deepEqual(sent.ai_state, { top_insights: [], concepts: [], meta_profile: {} });
  assert.equal(chamberReads, 0);
  assert.equal(currentInsightReads, 0);

  // The current server already transports profile verbatim into the model payload.
  const serverSource = fs.readFileSync("server.js", "utf8");
  assert.match(serverSource, /const profile = body\.profile && typeof body\.profile === \"object\" \? body\.profile : \{\};/);
  assert.match(serverSource, /const userPayload = JSON\.stringify\(\{[\s\S]*profile[\s\S]*\}\);/);
  assert.match(serverSource, /message: message\.trim\(\),[\s\S]*profile/);

  // Neither builder nor request runtime may directly persist or activate V2 knowledge.
  const builderSource = fs.readFileSync("js/ahaV2ChatReadOnlyContext.js", "utf8");
  const agentSource = fs.readFileSync("js/ahaChatAgentRuntime.js", "utf8");
  for (const [source, label] of [[builderSource, "builder"], [agentSource, "agent runtime"]]) {
    for (const [pattern, action] of [
      [/localStorage\s*\./, "localStorage"],
      [/AHARepository\s*\./, "repository"],
      [/\.execute\s*\(/, "migration execute"],
      [/\.rollback\s*\(/, "migration rollback"],
      [/saveChamber/i, "Chamber write"],
      [/normal_chat_persistence_authority:\s*true/, "Chat persistence authority"],
      [/authoritative_for_chat:\s*true/, "Chat authority"]
    ]) assert.equal(pattern.test(source), false, `${label} must not contain ${action}`);
  }

  assert.equal(forbiddenCalls, 0, "V2 Chat context contract must not touch product persistence");
  console.log("aha-v2-chat-readonly-context.test.cjs: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
