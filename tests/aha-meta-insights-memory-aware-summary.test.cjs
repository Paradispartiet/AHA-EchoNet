// Test for at MetaInsightsEngine.buildMetaInsightSummary er minnebevisst:
// options.memorySummary (fra AHAMetaInsightsMemory.summarizeMemory) skal gi
// memory_summary på meta-innsikten, bekreftede claims i evidence, viktige
// claims i next_actions, avviste/utdaterte claims som modellgrenser og økt
// confidence i samsvarende project_signals.

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { console, Date, Math, JSON, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/insightsChamber.js", "utf8"), context, { filename: "js/insightsChamber.js" });
vm.runInContext(fs.readFileSync("js/metaInsightsEngine.js", "utf8"), context, { filename: "js/metaInsightsEngine.js" });

const { buildMetaInsightSummary } = context.MetaInsightsEngine;

function makeProfile() {
  return {
    subject_id: "sub_laring",
    topics: [],
    global: {},
    insights: new Array(6).fill({}),
    concepts: [
      { key: "kapitalisme", total_count: 9, theme_count: 2, examples: ["a", "b"] },
      { key: "habitus", total_count: 6, theme_count: 1 }
    ],
    phrases: [],
    cooccurrence: { nodes: [], edges: [] },
    temporal: { span_days: 10, recent_focus: { emerging: [] }, velocity: {} },
    tensions: {},
    patterns: [],
    academic: { disciplines: [] },
    recommendations: {}
  };
}

const memorySummary = {
  totalFeedback: 4,
  confirmed: 1,
  partial: 1,
  rejected: 1,
  important: 1,
  outdated: 0,
  confirmedClaims: [{ claimText: "Jeg bygger et arbeid rundt kapitalisme og klima." }],
  partialClaims: [{ claimText: "Jeg utvider begreper raskt." }],
  rejectedClaims: [{ claimText: "Jeg er mest opptatt av idrett." }],
  importantClaims: [{ claimText: "Klimaspørsmålet er viktig for meg." }],
  outdatedClaims: [],
  activeSelfModel: { confirmedClaims: [{ claimText: "Jeg bygger et arbeid rundt kapitalisme og klima." }], activeProjects: [] }
};

// Uten memorySummary: ingen minnefelt (bakoverkompatibelt).
const baseline = buildMetaInsightSummary(makeProfile());
{
  assert.ok(!("memory_summary" in baseline), "uten memorySummary skal memory_summary ikke settes");
  assert.ok(!("active_self_model" in baseline), "uten memorySummary skal active_self_model ikke settes");
  assert.ok(!("confirmed_meta_claims" in baseline.evidence), "uten memorySummary skal evidence ikke ha confirmed_meta_claims");
}

// 13. buildMetaInsightSummary(profile, { memorySummary }) inkluderer
//     memory_summary og bruker minnet i evidence/next_actions/signaler.
{
  const meta = buildMetaInsightSummary(makeProfile(), { memorySummary });

  assert.ok(meta.memory_summary, "memory_summary skal settes");
  assert.equal(meta.memory_summary.totalFeedback, 4);
  assert.equal(meta.memory_summary.confirmed, 1);
  assert.equal(meta.memory_summary.important, 1);

  assert.deepEqual(
    meta.evidence.confirmed_meta_claims,
    ["Jeg bygger et arbeid rundt kapitalisme og klima."],
    "bekreftede claims skal inn i evidence.confirmed_meta_claims"
  );
  assert.deepEqual(
    meta.evidence.model_limits,
    ["Jeg er mest opptatt av idrett."],
    "avviste/utdaterte claims skal inn som modellgrenser i evidence"
  );

  assert.ok(
    meta.next_actions[0].includes("Klimaspørsmålet er viktig for meg."),
    "viktige claims skal prioriteres øverst i next_actions"
  );
  assert.ok(meta.next_actions.length <= 5, "next_actions skal fortsatt være maks 5");

  assert.strictEqual(meta.active_self_model, memorySummary.activeSelfModel, "active_self_model skal legges på meta-innsikten");

  // Bekreftet claim nevner «kapitalisme» → samsvarende project_signal skal
  // få økt confidence i forhold til baseline.
  const baseSignal = baseline.project_signals.find((s) => s.label.includes("kapitalisme"));
  const boostedSignal = meta.project_signals.find((s) => s.label.includes("kapitalisme"));
  assert.ok(baseSignal && boostedSignal, "begge kjøringer skal ha kapitalisme-signal");
  assert.equal(baseSignal.confidence, "middels", "baseline-confidence skal være middels");
  assert.equal(boostedSignal.confidence, "høy", "bekreftet claim skal øke confidence");
  assert.equal(boostedSignal.confirmed_by_user, true, "signalet skal merkes som brukerbekreftet");

  // Bekreftet selvinnsikt skal speiles i summary-teksten.
  assert.ok(meta.summary.includes("Du har bekreftet"), "summary skal nevne bekreftet selvinnsikt");
}

// Tom/ugyldig memorySummary skal ikke endre noe.
{
  const meta = buildMetaInsightSummary(makeProfile(), { memorySummary: null });
  assert.ok(!("memory_summary" in meta), "null memorySummary skal ignoreres");
}

console.log("aha-meta-insights-memory-aware-summary passed");
