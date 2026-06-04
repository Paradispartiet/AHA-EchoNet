// Tester for MetaInsightsEngine sitt algoritmiske meta-/selvinnsiktslag.
// buildMetaInsightSummary og buildMetaInsightPrompt er rene funksjoner som
// tar en ferdig meta-profil (slik buildUserMetaProfile bygger) og koker den
// ned til ett forklarbart, read-only svar.

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { console, Date, Math, JSON, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/insightsChamber.js", "utf8"), context, { filename: "js/insightsChamber.js" });
vm.runInContext(fs.readFileSync("js/metaInsightsEngine.js", "utf8"), context, { filename: "js/metaInsightsEngine.js" });

const MetaInsightsEngine = context.MetaInsightsEngine;
assert.ok(MetaInsightsEngine, "MetaInsightsEngine skal være eksportert");
assert.equal(typeof MetaInsightsEngine.buildMetaInsightSummary, "function", "buildMetaInsightSummary skal eksporteres");
assert.equal(typeof MetaInsightsEngine.buildMetaInsightPrompt, "function", "buildMetaInsightPrompt skal eksporteres");

const { buildUserMetaProfile, buildMetaInsightSummary, buildMetaInsightPrompt } = MetaInsightsEngine;


function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

function makeForbiddenApi(name) {
  return new Proxy(function forbiddenApi() {}, {
    get() { throw new Error(`${name} skal ikke brukes av MetaInsightsEngine`); },
    apply() { throw new Error(`${name} skal ikke kalles av MetaInsightsEngine`); },
    construct() { throw new Error(`${name} skal ikke konstrueres av MetaInsightsEngine`); }
  });
}

function makeChamber() {
  return {
    subject_id: "sub_laring",
    insights: [
      {
        id: "i1",
        subject_id: "sub_laring",
        theme_id: "klimapolitikk",
        title: "Klima og makt",
        summary: "Kapitalisme møter grønn omstilling.",
        created_at: "2026-05-01T00:00:00.000Z",
        first_seen: "2026-05-01T00:00:00.000Z",
        last_updated: "2026-05-20T00:00:00.000Z",
        strength: { evidence_count: 3 },
        semantics: { modality: "krav", valence: "blandet" },
        concepts: [{ key: "kapitalisme", count: 3 }, { key: "grønn omstilling", count: 2 }],
        keywords: ["makt", "omstilling"]
      },
      {
        id: "i2",
        subject_id: "sub_laring",
        theme_id: "klimapolitikk",
        title: "Vekstkritikk",
        summary: "Vekst skaper press mot naturgrenser.",
        created_at: "2026-05-03T00:00:00.000Z",
        first_seen: "2026-05-03T00:00:00.000Z",
        last_updated: "2026-05-21T00:00:00.000Z",
        strength: { evidence_count: 2 },
        semantics: { modality: "hindring", valence: "negativ" },
        concepts: [{ key: "vekst", count: 2 }, { key: "naturgrenser", count: 2 }],
        keywords: ["vekst", "natur"]
      }
    ]
  };
}

function makeProfile(overrides) {
  return Object.assign(
    {
      subject_id: "sub_laring",
      topics: [],
      global: {},
      insights: [],
      concepts: [],
      phrases: [],
      cooccurrence: { nodes: [], edges: [] },
      temporal: { span_days: 0, recent_focus: { emerging: [] }, velocity: {} },
      tensions: {},
      patterns: [],
      academic: { disciplines: [] },
      recommendations: {}
    },
    overrides || {}
  );
}

// 1. Tom profil håndteres uten å kaste.
{
  const empty = buildMetaInsightSummary({});
  assert.equal(empty.readiness.level, "tom");
  assert.equal(empty.readiness.score, 0);
  assert.equal(empty.learning_mode, "ukjent");
  assert.deepEqual(empty.dominant_themes, []);
  assert.deepEqual(empty.dominant_concepts, []);
  assert.equal(empty.tension_summary.count, 0);
  assert.equal(empty.tension_summary.strongest, null);
  assert.ok(empty.summary.includes("lite materiale"), "tom profil skal gi tomtilstandstekst");
  assert.ok(empty.generated_at, "generated_at skal settes");
  // null skal også tåles
  const nullProfile = buildMetaInsightSummary(null);
  assert.equal(nullProfile.readiness.level, "tom");
}

// 2. readiness øker med flere insights.
{
  const few = buildMetaInsightSummary(makeProfile({ insights: new Array(2).fill({}) }));
  const many = buildMetaInsightSummary(makeProfile({ insights: new Array(20).fill({}) }));
  assert.equal(few.readiness.level, "lav");
  assert.equal(many.readiness.level, "høy");
  assert.ok(many.readiness.score > few.readiness.score, "flere insights skal gi høyere score");

  const mid = buildMetaInsightSummary(makeProfile({ insights: new Array(8).fill({}) }));
  assert.equal(mid.readiness.level, "middels");
  assert.ok(mid.readiness.score > few.readiness.score);
  assert.ok(many.readiness.score > mid.readiness.score);
}

// 3. dominant concepts filtrerer generiske begreper.
{
  const profile = makeProfile({
    insights: new Array(6).fill({}),
    concepts: [
      { key: "kunnskap", total_count: 20, theme_count: 3 },
      { key: "analyse", total_count: 15, theme_count: 2 },
      { key: "kapitalisme", total_count: 9, theme_count: 2, examples: ["a", "b"] },
      { key: "habitus", total_count: 6, theme_count: 1 },
      { key: "refleksjon", total_count: 5, theme_count: 1 }
    ]
  });
  const meta = buildMetaInsightSummary(profile);
  const keys = meta.dominant_concepts.map((c) => c.key);
  assert.ok(!keys.includes("kunnskap"), "generisk begrep 'kunnskap' skal filtreres bort");
  assert.ok(!keys.includes("analyse"), "generisk begrep 'analyse' skal filtreres bort");
  assert.ok(!keys.includes("refleksjon"), "generisk begrep 'refleksjon' skal filtreres bort");
  assert.ok(keys.includes("kapitalisme"), "konkret begrep skal beholdes");
  assert.ok(keys.includes("habitus"), "konkret begrep skal beholdes");
  assert.equal(keys[0], "kapitalisme", "sterkeste konkrete begrep skal ligge øverst");
}

// 4. learning_mode får korrekt verdi ved concept expansion.
{
  const profile = makeProfile({
    insights: new Array(6).fill({}),
    temporal: { span_days: 5, recent_focus: { emerging: [{ key: "a" }, { key: "b" }, { key: "c" }] }, velocity: {} }
  });
  const meta = buildMetaInsightSummary(profile);
  assert.equal(meta.learning_mode, "utvider begreper");
  // og mønsteret skal speiles i recurring_patterns
  assert.ok(meta.recurring_patterns.some((p) => p.id === "concept_expansion"), "concept_expansion skal være et mønster");
}

// 5. tension_summary normaliserer sterkeste spenning.
{
  const profile = makeProfile({
    insights: new Array(6).fill({}),
    tensions: {
      concept_pair_tensions: [
        { source: "oljeproduksjon", target: "grønn omstilling", strength: 9, reason: "Motsatte retninger." }
      ],
      concept_tensions: [
        { key: "vekst", combined: 0.4, tension_score: 0.4 }
      ]
    }
  });
  const meta = buildMetaInsightSummary(profile);
  assert.equal(meta.tension_summary.count, 2);
  const s = meta.tension_summary.strongest;
  assert.ok(s, "strongest skal finnes");
  assert.deepEqual(Object.keys(s).sort(), ["explanation", "source", "strength", "target", "type"].sort());
  assert.equal(s.type, "concept_pair");
  assert.equal(s.source, "oljeproduksjon");
  assert.equal(s.target, "grønn omstilling");
  assert.equal(s.strength, 9);
  assert.ok(typeof s.explanation === "string" && s.explanation.length > 0);
}

// 6. buildMetaInsightPrompt returnerer norsk prompt med summary, begreper og spørsmål.
{
  const profile = makeProfile({
    insights: new Array(10).fill({}),
    topics: [{ theme_id: "klimapolitikk", stats: { insight_count: 6, user_phase: "mønster", insight_saturation: 0.5 }, semCounts: {} }],
    concepts: [
      { key: "kapitalisme", total_count: 9, theme_count: 2 },
      { key: "habitus", total_count: 6, theme_count: 1 }
    ],
    tensions: { concept_pair_tensions: [{ source: "olje", target: "fornybar", strength: 5 }] }
  });
  const prompt = buildMetaInsightPrompt(profile);
  assert.equal(typeof prompt, "string");
  assert.ok(prompt.includes("Dette er hva AHA foreløpig ser i materialet mitt"), "skal innlede med fast formulering");
  assert.ok(prompt.includes("kapitalisme"), "skal nevne et dominerende begrep");
  assert.ok(prompt.includes("Læringsmodus"), "skal inkludere læringsmodus");
  assert.ok(prompt.includes("klimapolitikk"), "skal inkludere topp tema");
  assert.ok(/3 korte spørsmål/.test(prompt), "skal be om 3 korte spørsmål");

  // Bygger også fra et profil-objekt som allerede har meta_insight.
  const withMeta = { meta_insight: buildMetaInsightSummary(profile) };
  const prompt2 = buildMetaInsightPrompt(withMeta);
  assert.ok(prompt2.includes("3 korte spørsmål"));
}


// 7. MetaInsightsEngine er read-only mot storage, ingest/repository/db og Supabase.
{
  const forbiddenNames = ["AHAIngest", "AHASources", "AHARepository", "AHADb", "Supabase", "supabase"];
  const guardContext = { console, Date, Math, JSON, setTimeout, clearTimeout };
  guardContext.window = guardContext;
  for (const name of forbiddenNames) guardContext[name] = makeForbiddenApi(name);
  guardContext.localStorage = {
    getItem: () => null,
    setItem: () => { throw new Error("localStorage.setItem skal ikke brukes av MetaInsightsEngine"); },
    removeItem: () => { throw new Error("localStorage.removeItem skal ikke brukes av MetaInsightsEngine"); }
  };
  guardContext.sessionStorage = {
    getItem: () => null,
    setItem: () => { throw new Error("sessionStorage.setItem skal ikke brukes av MetaInsightsEngine"); },
    removeItem: () => { throw new Error("sessionStorage.removeItem skal ikke brukes av MetaInsightsEngine"); }
  };
  vm.createContext(guardContext);
  vm.runInContext(fs.readFileSync("js/insightsChamber.js", "utf8"), guardContext, { filename: "js/insightsChamber.js" });
  vm.runInContext(fs.readFileSync("js/metaInsightsEngine.js", "utf8"), guardContext, { filename: "js/metaInsightsEngine.js" });

  const guardedEngine = guardContext.MetaInsightsEngine;
  const chamber = makeChamber();
  const profile = guardedEngine.buildUserMetaProfile(chamber, "sub_laring");
  assert.ok(profile && profile.meta_insight, "guarded buildUserMetaProfile skal bygge meta-profil");
  const summary = guardedEngine.buildMetaInsightSummary(profile);
  assert.ok(summary && summary.readiness, "guarded buildMetaInsightSummary skal bygge summary");
  const prompt = guardedEngine.buildMetaInsightPrompt(profile);
  assert.ok(prompt.includes("Dette er hva AHA foreløpig ser"), "guarded buildMetaInsightPrompt skal bygge prompt");
}

// 8. buildMetaInsightSummary og buildUserMetaProfile muterer ikke input.
{
  const profile = makeProfile({
    insights: new Array(8).fill(null).map((_, index) => ({ id: `i${index}`, nested: { value: index } })),
    topics: [{ theme_id: "klimapolitikk", stats: { insight_count: 6, user_phase: "mønster", insight_saturation: 0.5 }, semCounts: { modality: { krav: 1 }, valence: { blandet: 1 } } }],
    concepts: [{ key: "kapitalisme", total_count: 9, theme_count: 2, examples: ["klasse", "makt"] }],
    temporal: { span_days: 5, recent_focus: { emerging: [{ key: "habitus" }] }, velocity: { kapitalisme: 0.4 } },
    tensions: { concept_pair_tensions: [{ source: "olje", target: "fornybar", strength: 5, reason: "test" }] }
  });
  const profileClone = deepClone(profile);
  deepFreeze(profile);
  buildMetaInsightSummary(profile);
  assert.deepStrictEqual(profile, profileClone, "buildMetaInsightSummary skal ikke mutere profil-input");

  const chamber = makeChamber();
  const chamberClone = deepClone(chamber);
  deepFreeze(chamber);
  buildUserMetaProfile(chamber, "sub_laring");
  assert.deepStrictEqual(chamber, chamberClone, "buildUserMetaProfile skal ikke mutere chamber-input");
}


console.log("aha-meta-insights-engine passed");
