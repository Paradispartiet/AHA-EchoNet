// Tester for AHAMetaInsightsAgent – AI-agenten for selvforståelse.
// Agenten resonerer over den algoritmiske meta-profilen fra
// MetaInsightsEngine: bygger agentkontekst, norsk AI-prompt, pending
// chat-session og parser strukturert AI-respons til claims.

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const store = new Map();
const fakeMemoryPack = {
  confirmed_claims: ["Jeg bygger et arbeid rundt kapitalisme"],
  partial_claims: [],
  rejected_claims: ["Jeg er mest opptatt av idrett"],
  important_claims: ["Klimaspørsmålet er viktig for meg"],
  outdated_claims: [],
  active_self_model: { confirmed_count: 1 }
};

const context = {
  console, Date, Math, JSON, setTimeout, clearTimeout,
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => store.delete(k)
  },
  AHAMetaInsightsMemory: { buildMemoryPack: () => fakeMemoryPack }
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/metaInsightsAgent.js", "utf8"), context, { filename: "js/metaInsightsAgent.js" });

const Agent = context.AHAMetaInsightsAgent;
assert.ok(Agent, "window.AHAMetaInsightsAgent skal eksporteres");
for (const fn of ["buildAgentContext", "buildAgentPrompt", "createAgentSession", "savePendingAgentSession", "parseAgentResponse"]) {
  assert.equal(typeof Agent[fn], "function", `${fn} skal eksporteres`);
}

function makeProfile() {
  return {
    subject_id: "sub_laring",
    insights: [
      { id: "i1", title: "Klima og makt", theme_id: "klimapolitikk", strength: { evidence_count: 3 } },
      { id: "i2", title: "Vekstkritikk", theme_id: "klimapolitikk", strength: { evidence_count: 2 } }
    ],
    topics: [{ theme_id: "klimapolitikk" }],
    concepts: [{ key: "kapitalisme" }, { key: "grønn omstilling" }, { key: "habitus" }],
    phrases: [{ phrase: "grønn omstilling" }],
    cooccurrence: { nodes: [{ key: "kapitalisme" }, { key: "vekst" }], edges: [{ source: "kapitalisme", target: "vekst" }] },
    temporal: {
      span_days: 30,
      recent_focus: { window_days: 14, insights: 2, concepts: [{ key: "kapitalisme", count: 3 }], emerging: [{ key: "habitus", count: 2 }] },
      velocity: { recent_count: 2, previous_count: 1, delta: 1, trend: "økende" }
    },
    recommendations: { next_topics: [{ theme_id: "makt" }], resurface_insights: [], underexplored_concepts: [{ key: "habitus" }], bridging_pairs: [], unstick_prompts: [], emne_suggestions: [] },
    meta_insight: {
      generated_at: "2026-06-01T00:00:00.000Z",
      summary: "AHA ser at materialet samler seg rundt «kapitalisme».",
      readiness: { level: "middels", score: 42 },
      dominant_themes: [{ theme_id: "klimapolitikk", insight_count: 2 }],
      dominant_concepts: [{ key: "kapitalisme", total_count: 3 }, { key: "habitus", total_count: 2 }],
      learning_mode: "bygger forståelse",
      recurring_patterns: [{ id: "p1", label: "vekstkritikk", explanation: "går igjen" }],
      tension_summary: { strongest: { source: "kapitalisme", target: "grønn omstilling" }, count: 1 },
      project_signals: [{ label: "materialet peker mot et arbeid rundt «kapitalisme»", confidence: "lav" }],
      next_actions: ["Bekreft om hovedtemaene stemmer."]
    }
  };
}

// 1. buildAgentContext lager context med profileSnapshot, evidencePack,
//    memoryPack og reasoningFrame.
const agentContext = Agent.buildAgentContext(makeProfile());
{
  assert.ok(agentContext.id, "context skal ha id");
  assert.ok(agentContext.createdAt, "context skal ha createdAt");
  assert.equal(agentContext.agent, "aha_meta_insights_ai");
  assert.equal(agentContext.version, "v1");

  const snapshot = agentContext.profileSnapshot;
  assert.ok(snapshot, "profileSnapshot skal finnes");
  assert.equal(snapshot.learning_mode, "bygger forståelse");
  assert.equal(snapshot.dominant_themes[0].theme_id, "klimapolitikk");
  assert.equal(snapshot.dominant_concepts[0].key, "kapitalisme");
  assert.ok(Array.isArray(snapshot.next_actions) && snapshot.next_actions.length, "next_actions skal med i snapshot");
  assert.ok(snapshot.tension_summary, "tension_summary skal med i snapshot");

  const summary = agentContext.algorithmicSummary;
  assert.equal(summary.readiness.level, "middels");
  assert.equal(summary.readiness.score, 42);
  assert.deepEqual(summary.strongest_concepts, ["kapitalisme", "habitus"]);
  assert.deepEqual(summary.strongest_themes, ["klimapolitikk"]);
  assert.equal(summary.strongest_tension.source, "kapitalisme");
  assert.equal(summary.temporal_velocity.trend, "økende");
  assert.equal(summary.recommendation_count, 2, "recommendation_count skal telle anbefalinger");

  const evidence = agentContext.evidencePack;
  assert.equal(evidence.insight_count, 2);
  assert.equal(evidence.topic_count, 1);
  assert.equal(evidence.concept_count, 3);
  assert.equal(evidence.phrase_count, 1);
  assert.equal(evidence.cooccurrence_node_count, 2);
  assert.equal(evidence.cooccurrence_edge_count, 1);
  assert.equal(evidence.tension_count, 1);
  assert.equal(evidence.temporal_span_days, 30);
  assert.deepEqual(evidence.emerging_concepts, ["habitus"]);
  assert.equal(evidence.strongest_evidence_items[0].id, "i1", "sterkeste evidens skal sorteres først");

  assert.strictEqual(agentContext.memoryPack, fakeMemoryPack, "memoryPack skal hentes fra meta-minnet");
  assert.ok(Array.isArray(agentContext.reasoningFrame.principles) && agentContext.reasoningFrame.principles.length >= 5, "reasoningFrame skal ha prinsipper");
}

// Uten minnemodul skal memoryPack falle tilbake til tom pakke.
{
  const ctxNoMem = { console, Date, Math, JSON, localStorage: context.localStorage };
  ctxNoMem.window = ctxNoMem;
  vm.createContext(ctxNoMem);
  vm.runInContext(fs.readFileSync("js/metaInsightsAgent.js", "utf8"), ctxNoMem, { filename: "js/metaInsightsAgent.js" });
  const fallback = ctxNoMem.AHAMetaInsightsAgent.buildAgentContext(makeProfile());
  assert.deepEqual(fallback.memoryPack.confirmed_claims, [], "uten minne skal confirmed_claims være tom");
  assert.strictEqual(fallback.memoryPack.active_self_model, null, "uten minne skal active_self_model være null");
}

// 2. buildAgentPrompt inneholder rollen "AHA Meta Insights AI".
const prompt = Agent.buildAgentPrompt(agentContext);
{
  assert.ok(prompt.includes("AHA Meta Insights AI — selvforståelsesagent"), "prompt skal ha tittel");
  assert.ok(prompt.includes("Du er AHA Meta Insights AI"), "prompt skal definere rollen");
  assert.ok(prompt.includes("forsiktige hypoteser"), "prompt skal be om forsiktige hypoteser");
  for (const section of ["1. Rolle", "2. Algoritmisk grunnlag", "3. Bekreftet meta-minne", "4. Oppgave", "5. Svarformat"]) {
    assert.ok(prompt.includes(section), `prompt skal ha seksjonen «${section}»`);
  }
}

// 3. Prompten ber om claims, basis, confidence, questions og
//    memory_update_suggestion.
{
  for (const field of ["claims", "basis", "confidence", "questions", "memory_update_suggestion", "suggested_next_step", "confirmed_if_user_agrees", "watch_next"]) {
    assert.ok(prompt.includes(field), `prompt skal be om «${field}»`);
  }
  assert.ok(prompt.includes("3–5 meta-hypoteser"), "prompt skal be om 3–5 hypoteser");
  assert.ok(prompt.includes("3 korte spørsmål"), "prompt skal be om 3 korte spørsmål");
  for (const option of ["stemmer", "delvis", "feil", "viktig", "utdatert"]) {
    assert.ok(prompt.includes(option), `prompt skal vise feedback-valget «${option}»`);
  }
  assert.ok(prompt.includes("Jeg bygger et arbeid rundt kapitalisme"), "bekreftet minne skal med i prompten");
  assert.ok(prompt.includes("Avvist (ikke gjenta som hypotese)"), "avviste claims skal merkes i prompten");
}

// 4. createAgentSession lager session med type meta_insights_ai_session.
const session = Agent.createAgentSession(makeProfile());
{
  assert.ok(session.id, "session skal ha id");
  assert.equal(session.type, "meta_insights_ai_session");
  assert.equal(session.source, "meta_insights_agent");
  assert.equal(session.status, "pending");
  assert.ok(session.createdAt, "session skal ha createdAt");
  assert.ok(session.agentContext && session.agentContext.agent === "aha_meta_insights_ai", "session skal bære agentContext");
  assert.ok(String(session.prompt).includes("AHA Meta Insights AI"), "session skal bære agentprompten");
}

// 5. savePendingAgentSession lagrer korrekt payload i
//    aha_pending_chat_prompt_v1.
{
  const result = Agent.savePendingAgentSession(makeProfile());
  assert.equal(result.ok, true, "savePendingAgentSession skal returnere ok: true");
  assert.ok(result.session && result.session.id, "savePendingAgentSession skal returnere session");
  const raw = store.get("aha_pending_chat_prompt_v1");
  assert.ok(raw, "payload skal lagres på aha_pending_chat_prompt_v1");
  const payload = JSON.parse(raw);
  assert.equal(payload.type, "meta_insights_ai_session");
  assert.equal(payload.source, "meta_insights_agent");
  assert.equal(payload.sessionId, result.session.id);
  assert.equal(payload.createdAt, result.session.createdAt);
  assert.equal(payload.prompt, result.session.prompt);
  assert.deepEqual(payload.agentContext.algorithmicSummary, result.session.agentContext.algorithmicSummary);
}

// 6. parseAgentResponse parser strukturert JSON-respons.
{
  const structured = {
    agent: "aha_meta_insights_ai",
    interpretation: "Materialet peker mot et vekstkritisk prosjekt.",
    claims: [
      { id: "claim_1", text: "Du bygger et arbeid rundt kapitalisme og klima.", basis: ["2 innsikter om klimapolitikk"], confidence: 0.7, status: "hypothesis", feedback_options: ["stemmer", "delvis", "feil", "viktig", "utdatert"] },
      { text: "Du utvider begreper raskere enn du fordyper dem.", basis: [], confidence: 1.4 }
    ],
    questions: ["Stemmer det at kapitalisme er kjernen?", "Er klima et prosjekt eller interesse?", "Hva vil du fordype?"],
    suggested_next_step: "Lag en sti for «kapitalisme».",
    memory_update_suggestion: { confirmed_if_user_agrees: ["Vekstkritisk prosjekt"], watch_next: ["habitus"] }
  };
  const parsed = Agent.parseAgentResponse(JSON.stringify(structured));
  assert.equal(parsed.ok, true, "strukturert JSON skal parses");
  assert.equal(parsed.claims.length, 2);
  assert.equal(parsed.claims[0].id, "claim_1");
  assert.equal(parsed.claims[0].confidence, 0.7);
  assert.equal(parsed.claims[1].id, "claim_2", "claims uten id skal få generert id");
  assert.equal(parsed.claims[1].confidence, 1, "confidence skal clampes til [0,1]");
  assert.equal(parsed.claims[1].status, "hypothesis", "status skal defaulte til hypothesis");
  assert.deepEqual(parsed.claims[1].feedback_options, ["stemmer", "delvis", "feil", "viktig", "utdatert"], "feedback_options skal defaultes");
  assert.equal(parsed.questions.length, 3);
  assert.equal(parsed.suggested_next_step, "Lag en sti for «kapitalisme».");
  assert.equal(parsed.response.agent, "aha_meta_insights_ai");

  // JSON pakket inn i prosa/kodeblokk skal også parses.
  const wrapped = "Her er vurderingen min:\n```json\n" + JSON.stringify(structured) + "\n```\nHåper det hjelper.";
  const parsedWrapped = Agent.parseAgentResponse(wrapped);
  assert.equal(parsedWrapped.ok, true, "JSON i kodeblokk skal parses");
  assert.equal(parsedWrapped.claims.length, 2);
}

// 7. parseAgentResponse håndterer fritekst rolig.
{
  const freeText = "AHA ser at du er opptatt av klima, men dette er bare en tolkning.";
  const parsed = Agent.parseAgentResponse(freeText);
  assert.equal(parsed.ok, false, "fritekst skal gi ok: false");
  assert.deepEqual(parsed.claims, [], "fritekst skal gi tom claims-liste");
  assert.deepEqual(parsed.questions, [], "fritekst skal gi tom questions-liste");
  assert.equal(parsed.rawText, freeText, "rawText skal beholdes");
  assert.strictEqual(parsed.response, null);

  const emptyParsed = Agent.parseAgentResponse("");
  assert.equal(emptyParsed.ok, false);
  assert.deepEqual(emptyParsed.claims, []);
}

console.log("aha-meta-insights-agent passed");
