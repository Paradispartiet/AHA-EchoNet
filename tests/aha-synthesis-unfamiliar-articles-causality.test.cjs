// Novel synthetic research scenarios for the shadow-only generative synthesis gate.
// These are not real studies or live LLM evaluations. Test both false causal
// promotion and that legitimate source-explicit claims still pass.
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const cases = [
  {
    id: "municipal-service-access",
    observation: "Saksbehandlerne registrerte 34 søknader i den digitale portalen.",
    limitation: "Rapporten oppgir at det ikke er dokumentert effekt på samlet tilgjengelighet."
  },
  {
    id: "historical-interpretation",
    observation: "Brevene viser at enkelte familier ønsket en annen havneplan.",
    limitation: "Arkivet kan ikke fastslå om protestene var årsak til vedtaket."
  },
  {
    id: "botanical-drought",
    observation: "Plantene i første gruppe hadde lavere bladspenning etter to uker.",
    limitation: "Forsøket var for lite og for svakt kontrollert til å fastslå at vanning alene forklarte forskjellene."
  },
  {
    id: "educational-retrieval",
    observation: "Gruppen med egenprøver husket flere begreper en uke senere.",
    limitation: "Elevene valgte metode selv, og studien kan ikke alene bevise at egenprøving forårsaket forskjellen."
  },
  {
    id: "platform-deliberation",
    observation: "Etter endring av anbefalingene ble det registrert flere innlegg.",
    limitation: "Forskerne kan ikke skille algoritmens virkning fra økt engasjement under valgkampen."
  },
  {
    id: "clinical-observation",
    observation: "Pasienter som deltok i gruppen rapporterte færre symptomer.",
    limitation: "Dette er samvariasjon og ikke bevis for en behandlingseffekt."
  },
  {
    id: "urban-activity",
    observation: "Fotgjengertrafikken ble jevnere fordelt på flere tider av døgnet.",
    limitation: "Materialet peker ikke ut ett enkelt tiltak som årsak til forandringen."
  },
  {
    id: "english-ecology",
    observation: "The field survey counted more insects near the restored creek.",
    limitation: "The study cannot establish a causal effect of restoration on insect numbers."
  }
];

function payload(insight, status, observation, limitation) {
  return {
    schema: "aha_insight_synthesis_output_v2",
    candidates: [{
      insight,
      type: "pattern",
      abstraction: "Kobler det rapporterte mønsteret med studiens uttrykkelige begrensning.",
      evidence: [
        { quote: observation, role: "supports" },
        { quote: limitation, role: "limits" }
      ],
      why_it_matters: "Skiller kildeobservasjon fra en årsaksforklaring som ikke er dokumentert.",
      confidence: "medium",
      uncertainty: "Metoden begrenser konklusjonens rekkevidde.",
      causal_status: status
    }]
  };
}

async function run() {
  const uri = pathToFileURL(path.resolve("server/ahaInsightSynthesisContractV2.js")).href;
  const { validateSynthesisPayload } = await import(uri);

  for (const item of cases) {
    const source = item.observation + " " + item.limitation;
    const neutral = payload(
      "Materialet viser et observert mønster, men rekkevidden er eksplisitt avgrenset.",
      "not_causal", item.observation, item.limitation
    );
    const valid = validateSynthesisPayload(neutral, source);
    assert.equal(valid.ok, true, item.id + ": noncausal summary should remain possible: " + valid.errors.join(","));

    const falseCause = payload(
      "Tiltaket forårsaket det rapporterte resultatet.",
      "source_explicit", item.observation, item.limitation
    );
    const invalid = validateSynthesisPayload(falseCause, source);
    assert.equal(invalid.ok, false, item.id + ": a negated source cannot certify causal evidence");
    assert.ok(invalid.errors.includes("candidate:0:causal_claim_contradicts_source_limitation"),
      item.id + ": did not identify the explicit limitation: " + invalid.errors.join(","));
  }

  const controlled = {
    observation: "I laboratoriet ble to like prøver undersøkt under ellers like forhold.",
    limitation: "Forsøksrapporten oppgir at den kontrollerte varmebehandlingen forårsaket kortere tørketid."
  };
  const groundedCause = payload(
    "Under de oppgitte laboratorieforholdene førte varmebehandlingen til kortere tørketid.",
    "source_explicit", controlled.observation, controlled.limitation
  );
  assert.equal(
    validateSynthesisPayload(groundedCause, controlled.observation + " " + controlled.limitation).ok, true,
    "positive source-explicit cause must not be blocked by the negation rules"
  );

  // A limitation on representativeness alone is not necessarily a limitation
  // on a separately source-explicit causal claim.
  const unrelatedLimit = "Arkivet kan ikke fastslå om brevene representerte et flertall av innbyggerne.";
  const stillPositive = payload(
    "Under de oppgitte laboratorieforholdene førte varmebehandlingen til kortere tørketid.",
    "source_explicit", controlled.limitation, unrelatedLimit
  );
  assert.equal(
    validateSynthesisPayload(stillPositive, controlled.limitation + " " + unrelatedLimit).ok, true,
    "general source uncertainty must not automatically veto an unrelated explicit causal claim"
  );
  console.log("AHA synthesis causal guards: 8 unfamiliar limitation cases and 2 positive controls passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});