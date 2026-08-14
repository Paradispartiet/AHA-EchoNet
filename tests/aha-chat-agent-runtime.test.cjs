const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("js/ahaChatAgentRuntime.js", "utf8");
const chatSource = fs.readFileSync("js/ahaChat.js", "utf8");
const chatHtml = fs.readFileSync("chat.html", "utf8");
const context = { window: null };
context.window = context;
vm.runInNewContext(source, context, { filename: "js/ahaChatAgentRuntime.js" });

assert.equal(typeof context.AHAChatAgentRuntime?.create, "function");
assert.equal(Object.isFrozen(context.AHAChatAgentRuntime), true);

function createHarness(options = {}) {
  const calls = { fetch: [], load: 0, current: 0, meta: 0 };
  const insights = Array.from({ length: 10 }, (_, index) => ({
    id: `insight-${index + 1}`,
    title: index === 0 ? "" : `Innsikt ${index + 1}`,
    summary: `Sammendrag ${index + 1}`,
    concepts: [{ label: `Begrep ${index + 1}` }],
    theme_id: "theme_test",
    subject_id: "sub_laring"
  }));
  const runtime = context.AHAChatAgentRuntime.create({
    subjectId: "sub_laring",
    getApiBase: () => options.apiBase === undefined ? "https://agent.example/api/" : options.apiBase,
    fetchImpl: async (url, requestOptions) => {
      calls.fetch.push({ url, requestOptions, body: JSON.parse(requestOptions.body) });
      return {
        ok: options.fetchOk !== false,
        status: options.fetchOk === false ? 503 : 200,
        json: async () => ({ reply: "Svar" })
      };
    },
    loadChamber: () => {
      calls.load += 1;
      return { id: "chamber-test" };
    },
    getCurrentInsights: () => {
      calls.current += 1;
      return insights;
    },
    memoryConceptLabel: (concept) => concept?.label || "",
    buildUserMetaProfile: (chamber, subjectId) => {
      calls.meta += 1;
      return { chamber: chamber.id, subjectId };
    }
  });
  return { runtime, calls };
}

{
  const { runtime, calls } = createHarness();
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.buildAIState({ includeMemory: false }))), {
    top_insights: [],
    concepts: [],
    meta_profile: {}
  });
  assert.deepEqual(calls, { fetch: [], load: 0, current: 0, meta: 0 });

  const state = JSON.parse(JSON.stringify(runtime.buildAIState()));
  assert.equal(state.top_insights.length, 8, "agentens AI-state skal fortsatt være begrenset til åtte innsikter");
  assert.equal(state.top_insights[0].title, "Innsikt", "manglende tittel skal beholde fallbacken");
  assert.deepEqual(state.concepts.slice(0, 2), ["Begrep 1", "Begrep 2"]);
  assert.deepEqual(state.meta_profile, { chamber: "chamber-test", subjectId: "sub_laring" });
}

{
  const { runtime } = createHarness();
  const body = JSON.parse(JSON.stringify(runtime.buildAgentRequestBody("Hei", {
    memoryContext: { used: false, semanticMatches: [{ id: "skjult" }] },
    personalContext: {
      prompt: "Godkjent personlig kontekst",
      relevant: { projects: ["AHA"] },
      retrieval: { count: 1 },
      context: {
        readiness: { level: "klar", score: 72 },
        evidence: { approvedCorpus: 2, approvedExamples: 3, confirmedClaims: 4 }
      }
    }
  })));
  assert.equal(body.memory_context, null);
  assert.deepEqual(body.similar_insights, []);
  assert.deepEqual(body.ai_state, { top_insights: [], concepts: [], meta_profile: {} });
  assert.equal(body.personal_context.prompt, "Godkjent personlig kontekst");
  assert.equal(body.personal_context.answer_composer_prompt, "", "composer-prompten skal fortsatt kreve en eksplisitt answerPackage");
  assert.deepEqual(body.personal_context.status, {
    readinessLevel: "klar",
    readinessScore: 72,
    approvedCorpus: 2,
    approvedExamples: 3,
    confirmedClaims: 4
  });
}

(async () => {
  const { runtime, calls } = createHarness();
  const memoryContext = { used: true, semanticMatches: [{ id: "sem-1" }] };
  const result = await runtime.askAhaAgent("Spørsmål", { memoryContext });
  assert.deepEqual(result, { reply: "Svar" });
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.fetch[0].url, "https://agent.example/api/chat");
  assert.equal(calls.fetch[0].requestOptions.method, "POST");
  assert.deepEqual(calls.fetch[0].body.memory_context, memoryContext);
  assert.deepEqual(calls.fetch[0].body.similar_insights, [{ id: "sem-1" }]);

  const missing = createHarness({ apiBase: "" }).runtime;
  await assert.rejects(() => missing.askAhaAgent("Hei"), /missing_api_base/);
  const failing = createHarness({ fetchOk: false }).runtime;
  await assert.rejects(() => failing.askAhaAgent("Hei"), /chat_http_503/);

  assert.match(chatSource, /providerLoader\.instantiate\("agentRuntime", \{/);
  assert.doesNotMatch(chatSource, /function (?:buildAIState|askAhaAgent)\s*\(/);
  assert.doesNotMatch(chatSource, /memory_context:|personal_context:|similar_insights:/);
  assert.ok(chatHtml.indexOf("js/ahaChatAgentRuntime.js") < chatHtml.indexOf("js/ahaChat.js"));

  console.log("aha-chat-agent-runtime passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
