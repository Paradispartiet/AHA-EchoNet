const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { console, Date, Math, JSON, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);

function load(path) {
  vm.runInContext(fs.readFileSync(path, "utf8"), context, { filename: path });
}

load("js/ahaInsightRelationClassifierV2.js");
load("js/ahaInsightSaturationV2.js");
load("js/ahaMetaQualityV2.js");

const saturationApi = context.AHAInsightSaturationV2;
const metaApi = context.AHAMetaQualityV2;
assert.ok(saturationApi, "AHAInsightSaturationV2 skal eksporteres");
assert.ok(metaApi, "AHAMetaQualityV2 skal eksporteres");
assert.equal(saturationApi.SATURATION_SCHEMA, "aha_insight_saturation_v2");
assert.equal(metaApi.META_SCHEMA, "aha_meta_quality_view_v2");

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeInsight({ id, insight, concepts, quality = 0.84, reviewed = true, causal_status = "not_causal", source = id }) {
  return {
    id,
    source_event_id: `source_${source}`,
    source_text_hash: `${String(source).replace(/[^a-z0-9]/gi, "a")}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`.slice(0, 64),
    semantic_concepts: concepts,
    candidate: {
      insight,
      type: "principle",
      causal_status,
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

const baseline = [
  makeInsight({
    id: "base_1",
    insight: "Delvis standardisering bevarer sammenlignbarhet samtidig som valgfrie felt gir nødvendig fleksibilitet.",
    concepts: ["standardisering", "sammenlignbarhet", "fleksibilitet"],
    source: "base1"
  }),
  makeInsight({
    id: "base_2",
    insight: "Kildebundet provenance gjør det mulig å kontrollere hvilke belegg en innsikt bygger på.",
    concepts: ["provenance", "kildebinding", "belegg"],
    source: "base2"
  }),
  makeInsight({
    id: "base_3",
    insight: "Resonance skal bevare interessante forbindelser uten å slå sammen semantisk ulike innsikter.",
    concepts: ["resonance", "forbindelser", "innsikter"],
    source: "base3"
  })
];

// 1. Fire review-ready repetisjoner mot en review-ready baseline gir
//    faktisk saturation, ikke bare "mange insights".
{
  const incoming = [1, 2, 3, 4].map((number) => makeInsight({
    id: `dup_${number}`,
    insight: baseline[0].candidate.insight,
    concepts: baseline[0].semantic_concepts,
    source: `dup${number}`
  }));
  const beforeBaseline = JSON.stringify(baseline);
  const beforeIncoming = JSON.stringify(incoming);
  const result = saturationApi.assess({ existing_insights: baseline, incoming_insights: incoming });
  assert.equal(result.state, "saturated", JSON.stringify(result));
  assert.equal(result.metrics.existing_ready_count, 3);
  assert.equal(result.metrics.incoming_ready_count, 4);
  assert.equal(result.metrics.verified_duplicate_existing_count, 4);
  assert.equal(result.metrics.resonant_count, 0);
  assert.equal(result.metrics.distinct_count, 0);
  assert.equal(result.metrics.saturation_score, 1);
  assert.equal(result.metrics.marginal_novelty_rate, 0);
  assert.equal(result.guidance, "prioritize_resonance_integration_over_duplicate_generation");
  assert.equal(result.ready_for_meta, true);
  assert.equal(result.policy.stop_generation_authority, false);
  assert.equal(result.policy.meta_write, false);
  assert.equal(JSON.stringify(baseline), beforeBaseline, "baseline må ikke muteres");
  assert.equal(JSON.stringify(incoming), beforeIncoming, "incoming må ikke muteres");
}

// 2. Resonance er fortsatt ny semantisk verdi og skal derfor ikke bidra til
//    saturation som duplicate support.
{
  const resonant = makeInsight({
    id: "resonant_1",
    insight: "Fleksibilitet gjennom valgfrie felt kan gjøre lokal kvalitetssikring mer krevende.",
    concepts: ["standardisering", "fleksibilitet", "kvalitetssikring"],
    source: "resonant1"
  });
  const distinct = makeInsight({
    id: "distinct_1",
    insight: "Historiske tidsserier kan avdekke endringer som ikke er synlige i et enkelt øyeblikksbilde.",
    concepts: ["tidsserier", "historie", "endring"],
    source: "distinct1"
  });
  const anotherDistinct = makeInsight({
    id: "distinct_2",
    insight: "Begrepskart kan vise hvilke konsepter som binder flere kunnskapsområder sammen.",
    concepts: ["begrepskart", "konsepter", "kunnskapsområder"],
    source: "distinct2"
  });
  const result = saturationApi.assess({ existing_insights: baseline, incoming_insights: [resonant, distinct, anotherDistinct] });
  assert.equal(result.state, "growing", JSON.stringify(result));
  assert.equal(result.metrics.verified_duplicate_existing_count, 0);
  assert.ok(result.metrics.resonant_count >= 1, JSON.stringify(result));
  assert.equal(result.metrics.saturation_score, 0);
  assert.ok(result.metrics.marginal_novelty_rate > 0.6);
  const resonanceRole = result.candidate_roles.find((entry) => entry.id === "resonant_1");
  assert.ok(resonanceRole, JSON.stringify(result));
  assert.equal(resonanceRole.role, "resonant_novel", JSON.stringify(resonanceRole));
}

// 3. 50/50 verified repetition og novelty nærmer seg saturation, men er ikke
//    ferdig mettet.
{
  const incoming = [
    makeInsight({ id: "half_dup_1", insight: baseline[0].candidate.insight, concepts: baseline[0].semantic_concepts, source: "halfdup1" }),
    makeInsight({ id: "half_dup_2", insight: baseline[1].candidate.insight, concepts: baseline[1].semantic_concepts, source: "halfdup2" }),
    makeInsight({ id: "half_new_1", insight: "En eksplisitt usikkerhetsmarkør gjør en faglig påstand lettere å tolke korrekt.", concepts: ["usikkerhet", "påstand", "tolkning"], source: "halfnew1" }),
    makeInsight({ id: "half_new_2", insight: "Uavhengige kilder kan styrke robustheten når de peker mot samme dokumenterte mønster.", concepts: ["kilder", "robusthet", "mønster"], source: "halfnew2" })
  ];
  const result = saturationApi.assess({ existing_insights: baseline, incoming_insights: incoming });
  assert.equal(result.state, "approaching_saturation", JSON.stringify(result));
  assert.equal(result.metrics.verified_duplicate_existing_count, 2);
  assert.equal(result.metrics.saturation_score, 0.5);
}

// 4. Lav review-ready dekning blokkerer saturation selv om teksten gjentas.
{
  const good = makeInsight({ id: "quality_good", insight: baseline[0].candidate.insight, concepts: baseline[0].semantic_concepts, source: "qualitygood" });
  const bad1 = makeInsight({ id: "quality_bad_1", insight: baseline[0].candidate.insight, concepts: baseline[0].semantic_concepts, quality: 0.91, reviewed: false, source: "qualitybad1" });
  const bad2 = makeInsight({ id: "quality_bad_2", insight: baseline[0].candidate.insight, concepts: baseline[0].semantic_concepts, quality: 0.91, reviewed: false, source: "qualitybad2" });
  const result = saturationApi.assess({ existing_insights: baseline, incoming_insights: [good, bad1, bad2] });
  assert.equal(result.state, "quality_blocked", JSON.stringify(result));
  assert.ok(result.metrics.incoming_quality_coverage < 0.6);
  assert.equal(result.ready_for_meta, false);
  assert.ok(result.blocking_reasons.includes("incoming_quality_coverage_below_threshold"));
}

// 5. Uverifisert legacy baseline kan ikke brukes til å erklære V2 saturation.
{
  const unreviewedBaseline = baseline.map((item, index) => {
    const copy = jsonClone(item);
    copy.id = `legacy_${index}`;
    copy.gate_decision.eligible_for_insight_review = false;
    return copy;
  });
  const incoming = [1, 2, 3, 4].map((number) => makeInsight({
    id: `legacy_dup_${number}`,
    insight: baseline[0].candidate.insight,
    concepts: baseline[0].semantic_concepts,
    source: `legacydup${number}`
  }));
  const result = saturationApi.assess({ existing_insights: unreviewedBaseline, incoming_insights: incoming });
  assert.equal(result.state, "quality_blocked", JSON.stringify(result));
  assert.equal(result.metrics.existing_ready_count, 0);
  assert.equal(result.metrics.saturation_score, 0);
  assert.ok(result.blocking_reasons.includes("baseline_quality_coverage_below_threshold"));
}

// 6. Quality-aware Meta bruker bare V2-trusted materiale og markerer legacy
//    quantity-saturation som ikke-autoritativ.
{
  const incoming = [1, 2, 3, 4].map((number) => makeInsight({
    id: `meta_dup_${number}`,
    insight: baseline[0].candidate.insight,
    concepts: baseline[0].semantic_concepts,
    source: `metadup${number}`
  }));
  const saturation = saturationApi.assess({ existing_insights: baseline, incoming_insights: incoming });
  const legacyProfile = {
    subject_id: "sub_v2",
    global: { avg_saturation: 0.99 },
    meta_insight: { readiness: { level: "høy", score: 1 } },
    insights: [{ id: "legacy_unvetted" }]
  };
  const before = JSON.stringify(legacyProfile);
  const view = metaApi.build({ meta_profile: legacyProfile, v2_insights: incoming, saturation });
  assert.equal(view.status, "ready", JSON.stringify(view));
  assert.equal(view.quality.trusted_count, 4);
  assert.equal(view.quality.blocked_count, 0);
  assert.equal(view.saturation.state, "saturated");
  assert.equal(view.legacy_context.legacy_avg_saturation, 0.99);
  assert.equal(view.legacy_context.authoritative_for_v2_saturation, false);
  assert.equal(view.legacy_context.authoritative_for_v2_quality, false);
  assert.equal(view.semantic_basis.equivalence_links.length, 4);
  assert.ok(view.semantic_basis.equivalence_links.every((entry) => entry.duplicate_support === true));
  assert.equal(view.semantic_basis.rules.resonance_is_duplicate_support, false);
  assert.ok(view.semantic_basis.dominant_concepts.some((entry) => entry.key === "standardisering"));
  assert.equal(view.policy.legacy_meta_behavior_changed, false);
  assert.equal(view.policy.meta_write, false);
  assert.equal(JSON.stringify(legacyProfile), before, "legacy Meta-profil må ikke muteres");
}

// 7. Blokkerte V2-innsikter får ikke drive Meta-begreper.
{
  const trustedA = makeInsight({ id: "trusted_a", insight: "Dokumentert kildebinding styrker sporbarhet.", concepts: ["sporbarhet", "kildebinding"], source: "trusteda" });
  const trustedB = makeInsight({ id: "trusted_b", insight: "Provenance gjør det mulig å kontrollere belegg.", concepts: ["provenance", "belegg"], source: "trustedb" });
  const blocked = makeInsight({ id: "blocked_meta", insight: "Et blokkert hemmelig konsept skal ikke drive Meta.", concepts: ["hemmelig-blokkert-konsept"], reviewed: false, quality: 0.95, source: "blockedmeta" });
  const saturation = saturationApi.assess({ existing_insights: baseline, incoming_insights: [trustedA, trustedB, blocked] });
  const view = metaApi.build({ meta_profile: { subject_id: "sub_v2" }, v2_insights: [trustedA, trustedB, blocked], saturation });
  assert.equal(view.quality.trusted_count, 2);
  assert.equal(view.quality.blocked_count, 1);
  assert.ok(view.quality.blocked_insights.some((entry) => entry.id === "blocked_meta"));
  assert.ok(!view.semantic_basis.dominant_concepts.some((entry) => entry.key === "hemmelig-blokkert-konsept"));
  assert.equal(view.semantic_basis.rules.blocked_insights_can_drive_meta_claims, false);
}

// 8. Resonance vises som connection, aldri duplicate support, i Meta.
{
  const resonant = makeInsight({
    id: "meta_resonant",
    insight: "Fleksibilitet gjennom valgfrie felt kan gjøre lokal kvalitetssikring mer krevende.",
    concepts: ["standardisering", "fleksibilitet", "kvalitetssikring"],
    source: "metaresonant"
  });
  const newA = makeInsight({ id: "meta_new_a", insight: "Temporal variasjon kan vise om et mønster er stabilt over tid.", concepts: ["temporal variasjon", "mønster"], source: "metanewa" });
  const newB = makeInsight({ id: "meta_new_b", insight: "Krysskilder kan avdekke om samme begrep brukes forskjellig i ulike domener.", concepts: ["krysskilder", "begrep", "domener"], source: "metanewb" });
  const saturation = saturationApi.assess({ existing_insights: baseline, incoming_insights: [resonant, newA, newB] });
  const view = metaApi.build({ meta_profile: { subject_id: "sub_v2" }, v2_insights: [resonant, newA, newB], saturation });
  assert.ok(view.semantic_basis.resonance_links.some((entry) => entry.insight_id === "meta_resonant"), JSON.stringify(view));
  assert.ok(view.semantic_basis.resonance_links.every((entry) => entry.duplicate_support === false));
}

// 9. Eksisterende MetaInsightsEngine kan brukes som legacy context gjennom
//    den nye bridgen uten å endre motorens eksisterende oppførsel.
{
  load("js/insightsChamber.js");
  load("js/metaInsightsEngine.js");
  assert.ok(context.MetaInsightsEngine?.buildUserMetaProfile);

  const chamber = {
    subject_id: "sub_bridge",
    insights: [
      {
        id: "legacy_1",
        subject_id: "sub_bridge",
        theme_id: "tema_1",
        title: "Legacy innsikt 1",
        summary: "Kapitalisme møter grønn omstilling.",
        created_at: "2026-05-01T00:00:00.000Z",
        first_seen: "2026-05-01T00:00:00.000Z",
        last_updated: "2026-05-20T00:00:00.000Z",
        strength: { evidence_count: 3 },
        semantics: { modality: "krav", valence: "blandet" },
        concepts: [{ key: "kapitalisme", count: 3 }, { key: "grønn omstilling", count: 2 }]
      },
      {
        id: "legacy_2",
        subject_id: "sub_bridge",
        theme_id: "tema_1",
        title: "Legacy innsikt 2",
        summary: "Vekst skaper press mot naturgrenser.",
        created_at: "2026-05-03T00:00:00.000Z",
        first_seen: "2026-05-03T00:00:00.000Z",
        last_updated: "2026-05-21T00:00:00.000Z",
        strength: { evidence_count: 2 },
        semantics: { modality: "hindring", valence: "negativ" },
        concepts: [{ key: "vekst", count: 2 }, { key: "naturgrenser", count: 2 }]
      }
    ]
  };
  const v2Incoming = [1, 2, 3, 4].map((number) => makeInsight({
    id: `bridge_${number}`,
    insight: baseline[0].candidate.insight,
    concepts: baseline[0].semantic_concepts,
    source: `bridge${number}`
  }));
  const saturation = saturationApi.assess({ existing_insights: baseline, incoming_insights: v2Incoming });
  const chamberBefore = JSON.stringify(chamber);
  const view = metaApi.buildFromMetaEngine({ chamber, subject_id: "sub_bridge", v2_insights: v2Incoming, saturation });
  assert.equal(view.status, "ready", JSON.stringify(view));
  assert.equal(view.legacy_context.available, true);
  assert.equal(view.legacy_context.subject_id, "sub_bridge");
  assert.equal(view.legacy_context.authoritative_for_v2_saturation, false);
  assert.equal(JSON.stringify(chamber), chamberBefore, "Meta-bridgen må ikke mutere Chamber");
}

console.log("aha-insight-saturation-meta-quality-v2.test.cjs: OK");
