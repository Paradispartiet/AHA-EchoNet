// Test for at AHA Home/Profile holder Meta-profilhandlingen innenfor
// Profile-boundary: ingen Meta AI-agentsesjon startes fra Profile, og den
// eneste eksplisitte chat-handlingen er lokal pending prompt.

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

// Script-rekkefølge i index.html.
{
  const html = fs.readFileSync("index.html", "utf8");
  const engineAt = html.indexOf('js/metaInsightsEngine.js');
  const memoryAt = html.indexOf('js/metaInsightsMemory.js');
  assert.ok(memoryAt > -1, "index.html skal laste js/metaInsightsMemory.js");
  assert.ok(engineAt < memoryAt, "minne skal lastes etter metaInsightsEngine.js");
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
    buildUserMetaProfile: () => fakeFullMeta,
    buildMetaInsightPrompt: () => "stub-prompt"
  },
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaProfile.js", "utf8"), context, { filename: "js/ahaProfile.js" });

const AHAProfile = context.AHAProfile;
assert.ok(AHAProfile, "AHAProfile skal eksporteres");

// AHA Home/Profile viser bare eksplisitt lokal chat-prompt-handling.
let metaClickHandler = null;
const metaProfileEl = {
  set innerHTML(value) { this.html = String(value || ""); },
  get innerHTML() { return this.html || ""; },
  set onclick(handler) { metaClickHandler = handler; },
  get onclick() { return metaClickHandler; }
};
context.document.getElementById = (id) => (id === "aha-meta-profile-home" ? metaProfileEl : null);

AHAProfile.render();
assert.ok(!metaProfileEl.innerHTML.includes("Tenk med Meta AI"), "Profile skal ikke starte Meta AI-agent fra statusflaten");
assert.ok(!metaProfileEl.innerHTML.includes('data-action="meta-think-ai"'), "Profile skal ikke eksponere meta-think-ai action");
assert.ok(metaProfileEl.innerHTML.includes('data-action="meta-confirm-insight"'), "eksisterende Bekreft med AHA skal bestå som lokal pending prompt");
assert.equal(typeof metaClickHandler, "function", "meta profile action handler skal bindes");

metaClickHandler({
  target: {
    closest: (selector) => selector === "button[data-action]"
      ? { getAttribute: (name) => (name === "data-action" ? "meta-confirm-insight" : null) }
      : null
  }
});

assert.equal(locationHref, "chat.html", "Bekreft med AHA skal åpne chat.html");
const pending = JSON.parse(store.get("aha_pending_chat_prompt_v1"));
assert.equal(pending.type, "meta_insight_prompt", "pending payload skal være lokal prompt, ikke agent-session");
assert.equal(pending.source, "meta_insights_engine");

console.log("aha-home-meta-ai-button passed");
