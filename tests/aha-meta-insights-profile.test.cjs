// Test for at ahaProfile.collectAhaMetaProfile beholder eksisterende
// meta-profilretur og i tillegg legger til fullMeta + metaInsight fra
// MetaInsightsEngine. Read-only: ingen skriving til repository/sync.

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const store = new Map();
const chamber = {
  subject_id: undefined, // tvinger fallback til "sub_laring"
  insights: [
    { id: "i1", theme: "Klimapolitikk", concepts: [{ label: "kapitalisme", count: 3 }] },
    { id: "i2", theme: "Klimapolitikk", concepts: [{ label: "fornybar", count: 2 }] },
    { id: "i3", theme: "Makt", concepts: [{ label: "habitus", count: 2 }] }
  ]
};
store.set("aha_insight_chamber_v1", JSON.stringify(chamber));

let capturedSubjectId = null;
const fakeMetaInsight = {
  generated_at: "2026-06-04T00:00:00.000Z",
  readiness: { level: "middels", score: 42, reason: "stub" },
  dominant_themes: [{ theme_id: "Klimapolitikk", insight_count: 2, phase: "mønster", saturation: 0.4 }],
  dominant_concepts: [{ key: "kapitalisme", total_count: 3, theme_count: 1, examples: [] }],
  learning_mode: "bygger forståelse",
  recurring_patterns: [],
  tension_summary: { strongest: null, count: 0, explanation: "ingen" },
  project_signals: [],
  next_actions: ["Bekreft om hovedtemaene stemmer."],
  summary: "AHA ser foreløpig at materialet ditt samler seg rundt «kapitalisme».",
  evidence: { insight_count: 3 }
};
const fakeFullMeta = {
  subject_id: "sub_laring",
  tensions: { concept_tensions: [{ key: "vekst", combined: 0.5 }] },
  meta_insight: fakeMetaInsight
};

const context = {
  console,
  Date,
  Math,
  JSON,
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  document: {
    readyState: "loading",
    addEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  },
  MetaInsightsEngine: {
    buildUserMetaProfile: (chamberArg, subjectId) => {
      capturedSubjectId = subjectId;
      assert.ok(chamberArg, "chamber skal sendes inn");
      return fakeFullMeta;
    },
    buildMetaInsightPrompt: () => "stub-prompt"
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaProfile.js", "utf8"), context, { filename: "js/ahaProfile.js" });

const AHAProfile = context.AHAProfile;
assert.ok(AHAProfile && typeof AHAProfile.collectAhaMetaProfile === "function", "AHAProfile.collectAhaMetaProfile skal finnes");

const meta = AHAProfile.collectAhaMetaProfile();

// Eksisterende returverdier skal bevares.
for (const key of ["topThemes", "topConcepts", "topTensions", "topSubjectLinks", "recentAfterwork", "sourceCounts"]) {
  assert.ok(Object.prototype.hasOwnProperty.call(meta, key), `eksisterende felt skal bevares: ${key}`);
}
assert.ok(Array.isArray(meta.topThemes) && meta.topThemes.length > 0, "topThemes skal fortsatt bygges fra chamber");
assert.equal(meta.sourceCounts.insights, 3, "sourceCounts.insights skal telle insights");

// Nye felt skal legges til.
assert.ok(Object.prototype.hasOwnProperty.call(meta, "fullMeta"), "fullMeta skal legges til");
assert.ok(Object.prototype.hasOwnProperty.call(meta, "metaInsight"), "metaInsight skal legges til");
assert.strictEqual(meta.fullMeta, fakeFullMeta, "fullMeta skal være resultatet fra buildUserMetaProfile");
assert.strictEqual(meta.metaInsight, fakeMetaInsight, "metaInsight skal være fullMeta.meta_insight");

// Fallback-subjektet skal brukes når chamber ikke har subject_id.
assert.equal(capturedSubjectId, "sub_laring", "subjectId skal falle tilbake til 'sub_laring'");

// Spenninger fra fullMeta skal også mates inn i topTensions-kandidatene.
assert.ok(Array.isArray(meta.topTensions), "topTensions skal være en liste");

// Når motoren ikke finnes, skal fullMeta/metaInsight være null uten å kaste.
{
  const ctx2 = {
    console, Date, Math, JSON, setTimeout, clearTimeout,
    localStorage: context.localStorage,
    document: context.document
  };
  ctx2.window = ctx2;
  vm.createContext(ctx2);
  vm.runInContext(fs.readFileSync("js/ahaProfile.js", "utf8"), ctx2, { filename: "js/ahaProfile.js" });
  const meta2 = ctx2.AHAProfile.collectAhaMetaProfile();
  assert.strictEqual(meta2.fullMeta, null, "uten motor skal fullMeta være null");
  assert.strictEqual(meta2.metaInsight, null, "uten motor skal metaInsight være null");
  assert.ok(Array.isArray(meta2.topThemes), "eksisterende retur skal fortsatt fungere uten motor");
}

console.log("aha-meta-insights-profile passed");
