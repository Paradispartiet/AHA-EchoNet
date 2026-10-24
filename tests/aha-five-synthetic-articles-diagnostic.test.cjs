// Exploratory, read-only article benchmark. This exercises the existing AHA
// deterministic Chat analysis and quality evaluator, NOT a live LLM/API.
// All five texts below are newly written fictional scenarios, not sourced facts.
const assert = require("node:assert/strict");
const { createChatContext } = require("../scripts/compare-aha-engine-fixtures.cjs");

const articles = [
  {
    id: "municipal-digital-access",
    topic: "Kommunal digitalisering",
    text: "En kommune innførte i et prøveprosjekt digital søknad om boligtilpasning. Saksbehandlerne registrerte 42 fullførte digitale søknader på seks uker, men 11 innbyggere oppsøkte biblioteket fordi de ikke kom gjennom identitetskontrollen. Frivillige veiledere hjalp ni av de elleve med å finne en alternativ søknadsvei. Kommunen vurderer å stenge papirskjemaet fordi den digitale behandlingen ser raskere ut. Rapporten sammenligner ikke saksbehandlingstid for ellers like saker, og registreringen omfatter ikke dem som aldri forsøkte å søke. Tallene beskriver bruk i et lite prøveprosjekt, ikke dokumentert effekt for alle innbyggere. Spørsmålet er om digital effektivitet og reell tilgjengelighet blir vurdert med samme målestokk.",
    concepts: ["søknad", "kommune", "digital"],
    caution: "Ikke anta at digitaliseringen er bevist mer effektiv."
  },
  {
    id: "historical-archive-silence",
    topic: "Historie og kildekritikk",
    text: "Et lokalhistorisk arkiv har møteprotokoller fra en havneutbygging i 1978. Protokollene beskriver bred enighet i kommunestyret. Tre private brev fra samme periode forteller derimot om protester fra beboere som mistet tilgang til brygga. Brevene ble samlet inn førti år senere, og arkivet kan ikke fastslå om avsenderne representerte et flertall av nabolaget. Forskerne sammenligner dokumentenes proveniens, tidspunkt og formål før de beskriver hva materialet kan si om offentlig deltakelse. De finner en spenning mellom den formelle beslutningshistorien og uformelle erfaringer, men har ikke grunnlag for å beregne hvor omfattende motstanden var. Fravær av protest i en møteprotokoll er derfor ikke det samme som bevis for fravær av protest.",
    concepts: ["arkiv", "protokoll", "brev"],
    caution: "Ikke hev at flertallet protesterte."
  },
  {
    id: "botany-drought-experiment",
    topic: "Biologi og metode",
    text: "I et veksthus undersøkte en botaniker vanntransport hos atten tomatplanter. Ni planter fikk mindre vann i to uker, mens ni fikk vanlig vanning. I den første gruppen registrerte forskeren lavere bladspenning og mindre vannstrøm gjennom xylem ved målingene. Plantene stod på forskjellige benker, og temperaturforskjeller mellom benkene ble ikke målt. Rapporten beskriver samtidig variasjon i røttenes størrelse. Materialet støtter en sammenheng mellom behandlingsgruppe og registrert vanntransport, men forsøket er for lite og for svakt kontrollert til å fastslå at vanning alene forklarte alle forskjellene. Funnene begrunner mer kontrollerte undersøkelser av tørkestress, ikke en generell lov om avlingssvikt.",
    concepts: ["xylem", "vanntransport", "planter"],
    caution: "Ikke fremstille forsøket som sikker kausal dokumentasjon."
  },
  {
    id: "education-retrieval-practice",
    topic: "Læring og forskningsdesign",
    text: "Ved en skole sammenlignet lærere to måter å arbeide med samme historiekapittel på. Av 48 elever valgte 23 å lese teksten flere ganger, mens 25 foretrakk korte egenprøver mellom lesingene. Begge gruppene brukte omtrent like lang tid. Etter én uke husket gruppen med egenprøver i gjennomsnitt flere nøkkelbegreper, selv om flere av dem beskrev øktene som mer krevende. Elevene hadde selv valgt metode, og lærerne målte ikke forkunnskaper eller motivasjon før forsøket. Resultatet viser en observert forskjell i dette utvalget, men kan ikke alene bevise at egenprøving forårsaket forskjellen. Rapporten foreslår en ny studie med tilfeldig gruppefordeling.",
    concepts: ["læring", "elever", "egenprøver"],
    caution: "Ikke påstå at forsøket dokumenterer kausal effekt."
  },
  {
    id: "politics-platform-conflict",
    topic: "Demokrati og digitale plattformer",
    text: "Et forskerteam undersøkte politiske diskusjoner på en lokal nettplattform i seks uker. De registrerte 120 innlegg og kodet om innleggene inneholdt dokumentasjon, uenighet eller personangrep. Antall kommentarer økte etter at plattformen begynte å prioritere innlegg med mange reaksjoner, samtidig som færre av innleggene viste til kontrollerbare kilder. Endringen skjedde midt under en omstridt lokal planprosess, og forskerne kan ikke skille algoritmens virkning fra økt politisk engasjement. Intervjuer med seks brukere avdekket både opplevd synlighet og uro for hardere debatt. Materialet viser en tidsmessig samvariasjon, ikke at plattformens prioritering alene skapte polarisering.",
    concepts: ["politisk", "plattform", "kilder"],
    caution: "Ikke påstå dokumentert årsak mellom algoritme og polarisering."
  }
];

const context = createChatContext();
const hooks = context.AHATestHooks;
const evaluator = context.AHAAnalysisQualityEvaluator;
assert.equal(typeof hooks.buildAutoOutputs, "function");
assert.equal(typeof hooks.buildCanonicalAnalysis, "function");
assert.equal(typeof evaluator.evaluateAnalysis, "function");

const results = [];
for (const article of articles) {
  const payload = hooks.buildAutoOutputs(article.text, "");
  const canonical = hooks.buildCanonicalAnalysis(payload, article.text);
  assert.ok(canonical && typeof canonical === "object", article.id + " missing canonical result");
  payload.canonicalAnalysis = canonical;
  const quality = evaluator.evaluateAnalysis(payload, article.text);
  const evidence = quality.claims.filter((claim) => claim.kind === "source_evidence");
  const invalidEvidence = evidence.filter((claim) => claim.sourceMatch !== "verbatim");
  const summary = {
    id: article.id,
    topic: article.topic,
    source_length: article.text.length,
    content_type: canonical.contentType || null,
    detected_domain: canonical.domain || null,
    theme: canonical.theme || null,
    tension: canonical.mainTension || null,
    insight: canonical.keyInsight || null,
    next_steps: (canonical.suggestedActions || []).slice(0, 3),
    warnings: (canonical.warnings || []).slice(0, 3),
    confidence: canonical.confidence || null,
    quality_status: quality.status,
    quality_score: quality.overall,
    dimensions: quality.dimensions,
    failing_dimensions: quality.failures.map((x) => x.dimension),
    critical: quality.critical,
    source_evidence_count: evidence.length,
    exact_evidence_count: evidence.length - invalidEvidence.length,
    topic_term_hits: article.concepts.filter((term) => (JSON.stringify(canonical).toLowerCase()).includes(term.toLowerCase())),
    human_review_caution: article.caution
  };
  results.push(summary);
  console.log("AHA_ARTICLE_RESULT " + JSON.stringify(summary));
  assert.equal(invalidEvidence.length, 0, article.id + ": evidence attributed to absent text");
}
const totals = {
  articles: results.length,
  passed: results.filter((x) => x.quality_status === "passed").length,
  needs_review: results.filter((x) => x.quality_status === "needs_review").length,
  blocked: results.filter((x) => x.quality_status === "blocked").length,
  missing_main_insight: results.filter((x) => !x.insight).length,
  missing_exact_evidence: results.filter((x) => !x.exact_evidence_count).length
};
console.log("AHA_ARTICLE_SUMMARY " + JSON.stringify(totals));
assert.equal(results.length, 5);
console.log("AHA five synthetic test articles: diagnostic run completed.");
