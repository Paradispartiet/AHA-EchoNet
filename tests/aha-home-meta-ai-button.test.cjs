// Test for at AHA Home viser «Tenk med Meta AI» i «Hva AHA ser nå» og at
// knappen starter en Meta Insights AI-agentsesjon: pending payload med
// type meta_insights_ai_session lagres via AHAMetaInsightsAgent og chat
// åpnes. index.html skal også laste minne- og agent-modulene i riktig
// rekkefølge (etter metaInsightsEngine.js, før ahaProfile.js).

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

// Script-rekkefølge i index.html.
{
  const html = fs.readFileSync("index.html", "utf8");
  const engineAt = html.indexOf('js/metaInsightsEngine.js');
  const memoryAt = html.indexOf('js/metaInsightsMemory.js');
  const agentAt = html.indexOf('js/metaInsightsAgent.js');
  const profileAt = html.indexOf('js/ahaProfile.js');
  assert.ok(memoryAt > -1, "index.html skal laste js/metaInsightsMemory.js");
  assert.ok(agentAt > -1, "index.html skal laste js/metaInsightsAgent.js");
  assert.ok(engineAt < memoryAt && memoryAt < agentAt, "minne og agent skal lastes etter metaInsightsEngine.js");
  assert.ok(agentAt < profileAt, "agenten skal lastes før ahaProfile.js");
}

const store = new Map();
const chamber = {
  insights: [
    { id: "i1", theme: "Klimapolitikk", concepts: [{ label: "kapitalisme", count: 3 }] },
    { id: "i2", theme: "Klimapolitikk", concepts: [{ label: "fornybar", count: 2 }] }
  ]
};
store.set("aha_insight_chamber_v1", JSON.stringify(chamber));

const fakeMetaInsight = {
  generated_at: "2026-06-10T00:00:00.000Z",
  readiness: { level: "middels", score: 42 },
  dominant_themes: [{ theme_id: "Klimapolitikk", insight_count: 2 }],
  dominant_concepts: [{ key: "kapitalisme", total_count: 3 }],
  learning_mode: "bygger forståelse",
  recurring_patterns: [],
  tension_summary: { strongest: null, count: 0 },
  project_signals: [],
  next_actions: ["Bekreft om hovedtemaene stemmer."],
  summary: "AHA ser at materialet samler seg rundt «kapitalisme».",
  evidence: { insight_count: 2 }
};
const fakeFullMeta = { subject_id: "sub_laring", meta_insight: fakeMetaInsight };

let savedProfile = null;
let locationHref = "index.html";

const context = {
  console, Date, Math, JSON, setTimeout, clearTimeout,
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => store.delete(k)
  },
  document: {
    readyState: "loading",
    addEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  },
  location: {
    get href() { return locationHref; },
    set href(value) { locationHref = String(value); }
  },
  MetaInsightsEngine: {
    buildUserMetaProfile: () => fakeFullMeta
  },
  AHAMetaInsightsAgent: {
    savePendingAgentSession: (profile) => {
      savedProfile = profile;
      const payload = {
        type: "meta_insights_ai_session",
        source: "meta_insights_agent",
        createdAt: "2026-06-10T00:00:00.000Z",
        sessionId: "meta_ai_session_test",
        prompt: "AHA Meta Insights AI — selvforståelsesagent",
        agentContext: { agent: "aha_meta_insights_ai" }
      };
      store.set("aha_pending_chat_prompt_v1", JSON.stringify(payload));
      return { ok: true, session: { id: payload.sessionId, type: payload.type } };
    }
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaProfile.js", "utf8"), context, { filename: "js/ahaProfile.js" });

const AHAProfile = context.AHAProfile;
assert.ok(AHAProfile, "AHAProfile skal eksporteres");

// 14. AHA Home viser «Tenk med Meta AI».
let metaClickHandler = null;
const metaProfileEl = {
  set innerHTML(value) { this.html = String(value || ""); },
  get innerHTML() { return this.html || ""; },
  set onclick(handler) { metaClickHandler = handler; },
  get onclick() { return metaClickHandler; }
};
context.document.getElementById = (id) => (id === "aha-meta-profile-home" ? metaProfileEl : null);

AHAProfile.render();
assert.ok(metaProfileEl.innerHTML.includes("Tenk med Meta AI"), "«Hva AHA ser nå» skal vise Tenk med Meta AI-knappen");
assert.ok(metaProfileEl.innerHTML.includes('data-action="meta-think-ai"'), "knappen skal ha data-action meta-think-ai");
assert.ok(metaProfileEl.innerHTML.includes('data-action="meta-confirm-insight"'), "eksisterende Bekreft med AHA skal bestå");
assert.equal(typeof metaClickHandler, "function", "meta profile action handler skal bindes");

// Knappen skal lage pending meta_insights_ai_session og åpne chat.
metaClickHandler({
  target: {
    closest: (selector) => selector === "button[data-action]"
      ? { getAttribute: (name) => (name === "data-action" ? "meta-think-ai" : null) }
      : null
  }
});

assert.strictEqual(savedProfile, fakeFullMeta, "savePendingAgentSession skal kalles med latestMetaProfile.fullMeta");
assert.equal(locationHref, "chat.html", "Tenk med Meta AI skal åpne chat.html");
const pending = JSON.parse(store.get("aha_pending_chat_prompt_v1"));
assert.equal(pending.type, "meta_insights_ai_session", "pending payload skal ha agent-sessiontypen");
assert.equal(pending.source, "meta_insights_agent");
assert.ok(pending.sessionId, "pending payload skal ha sessionId");

console.log("aha-home-meta-ai-button passed");
