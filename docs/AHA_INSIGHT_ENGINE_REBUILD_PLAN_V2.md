# AHA Insight Engine Rebuild Plan V2

## Status

Dette dokumentet er den operative byggeplanen for å gjøre AHA til den innsiktsmotoren produktmodellen krever.

Det erstatter ikke canonical eierskap:

```text
SourceEvent / AHAIngest
→ semantisk analyse
→ js/insightsChamber.js
→ js/metaInsightsEngine.js
→ produktflater
```

`js/insightsChamber.js` forblir canonical lifecycle-/chamber-motor. `js/metaInsightsEngine.js` forblir canonical meta-lag. Ombyggingen gjelder først og fremst laget **før** chamberet, samt kvalitetsmålene som avgjør hva som får bli varig kunnskap.

Se også:

- `AHA_INSIGHT_ENGINE_SEMANTIC_CORE_V1.md`
- `AHA_INSIGHT_CONTRACT.md`
- `AHA_INSIGHT_ENGINE_EVALUATION_CONTRACT_V1.md`
- `AHA_META_PROFILE_RUNTIME_STATUS_V1.md`

---

## 1. Produktkravet

AHA skal ikke være en oppsummeringsmotor eller en tekstutklippsgenerator.

Kjerneflyten er:

```text
samtale / tekst / notat / hendelse
→ meningsbærende struktur
→ varige innsikter
→ begreper, lister, stier og tankekart
→ mønstre over tid
→ Meta-profil
→ kollektiv kunnskap etter eksplisitt samtykke
```

Tre nivåer må holdes fra hverandre:

```text
SourceEvent
= hva som faktisk kom inn

Insight
= hva AHA forsto av materialet

Meta insight
= hva AHA forstår på tvers av brukerens materiale over tid
```

Dette gir en hard produktregel:

> Et tekstutdrag er kildebelegg. Det er ikke automatisk en innsikt.

Og en tilsvarende regel for begreper:

> Et hyppig ord eller et egennavn er ikke automatisk et meningsbærende begrep.

---

## 2. Diagnose av dagens motor

Kodegjennomgangen viser at AHA allerede har flere gode byggesteiner, men at de er koblet rundt en for svak grunnanalyse.

### 2.1 `js/insightsChamber.js`

Det canonical chamberet har riktig ansvar for:

- create / reinforce / merge lifecycle
- provenance
- source event-referanser
- concepts / claims / patterns / markers
- topic stats
- insight saturation
- concept density

Problemet er inputkvaliteten.

I dagens `createInsightFromSignal(...)` kan `summary` falle tilbake til hele `signal.text`. Resultatet er at råkildetekst kan bli lagret som om det var en ferdig insight.

Dagens concept extraction bygger også mye på:

- et lite håndskrevet leksikon
- regex-/endelsesheuristikker
- candidate concepts

Dagens claims er i stor grad setningsfragmenter fanget av signalord, ikke normaliserte proposisjoner.

Dagens patterns er et lite regelsett, ikke et generelt semantisk mønsterlag.

### 2.2 `js/ahaChatInsightPipeline.js`

Denne modulen inneholder samtidig en viktig byggestein som bør bli sentral:

```text
generateAIInsightCandidates(sourceText, context)
→ /api/aha-agent/insight-candidates
```

Det er riktig prinsipp fordi **kildeteksten sendes direkte til et eget strukturert analysekall**. Dette er ikke det brukerrettede chat-svaret.

Dagens deterministiske fallback `buildSemanticInsightCandidates(...)` grupperer derimot kildesetninger etter regex-tema og kan derfor produsere omskrevne tekstutdrag i stedet for syntese.

Konklusjon:

- behold source-direct AI-analysegrensen
- bygg den ut til et fullverdig `SemanticDocument`
- nedgrader setningsgruppering til `source_observation`, aldri syntetisert insight

### 2.3 `backend/aha_engine`

Dagens Python-engine er hovedsakelig regel-/templatebasert og har ingen generell semantisk modellavhengighet i requirements.

Den er nyttig som:

- deterministisk fallback
- kontrakt-/regresjonsmotor
- enkel klassifisering

Den bør ikke være eneste semantiske hjerne for fri tekst.

### 2.4 `js/ahaEmbeddings.js`

AHA har allerede et reelt embedding-lag via `/api/aha-agent/embed`, med flerspråklige embeddings og lagring i `aha_insight_embeddings`.

Dette bør gjenbrukes til:

- semantic equivalence
- duplicate/reinforcement matching
- resonance/relatedness
- retrieval

Men embeddings må bygges på **gode semantiske objekter**. Embedding av et dårlig tekstutklipp gjør ikke objektet til en god insight.

### 2.5 `js/ahaSemanticRetrieval.js`

Dette er et forklarbart lokalt hybridlag basert på tokens, stems, phrases, concepts og vekter.

Det er nyttig som:

- offline fallback
- lokal retrieval
- forklarbar støtte

Det skal ikke forveksles med den reelle embedding-modellen eller brukes som hovedbevis for semantisk ekvivalens.

### 2.6 `js/ahaChatConceptPolicy.js`

Denne modulen har nyttige canonicalization- og display-regler, men også mange håndskrevne domeneeksempler.

Riktig fremtidig rolle:

```text
SemanticDocument concepts
→ concept registry / Fagverk match
→ conceptPolicy canonicalization / display guard
```

Ikke:

```text
råtekst
→ håndskrevet conceptPolicy
→ ferdig begrepsforståelse
```

### 2.7 `js/ahaAnalysisQualityEvaluator.js`

Dagens evaluator måler blant annet transformation ved leksikalsk avstand til kilden.

Det er utilstrekkelig. En semantisk feil tolkning kan ha lav tekstoverlapp og dermed se «transformert» ut selv om den er meningsløs.

V2 må kontrollere:

- kildebelegg
- proposisjonell konsistens
- entity/concept-skille
- relation validity
- semantic transformation
- usikkerhet

Ikke bare tekstlig forskjell.

### 2.8 Meta og Knowledge Map

`MetaInsightsEngine` har allerede betydelig rikere funksjonalitet enn råinputen den får: concepts, co-occurrence, temporal development, tensions og recommendations.

`AHAKnowledgeMap` og `AHAKnowledgeGraphIntelligence` er nyttige avledede/read-only lag, men de må etter hvert få typed relations fra canonical semantic core i stedet for primært tag-/keyword-/co-occurrence-koblinger.

---

## 3. Hovedbeslutning: bygg én SemanticDocument-kjerne

Alle kildeanalyser skal først kunne materialiseres som én versjonert mellomrepresentasjon.

```text
SemanticDocumentV1 {
  version
  source_event_id
  source_text_hash
  source_type
  language
  analyzer_origin
  analyzer_version

  evidence_anchors[]
  entities[]
  concepts[]
  claims[]
  relations[]
  tensions[]
  candidate_insights[]

  quality
  provenance
}
```

Dette er **ikke** en ny database ved siden av chamberet. Det er analyseobjektet mellom SourceEvent og Insight lifecycle.

---

## 4. Evidence anchors først

Før tolkning skal kilden segmenteres i stabile evidence anchors.

```text
EvidenceAnchor {
  id
  source_event_id
  start_offset?
  end_offset?
  text
  section?
}
```

Alle infererte objects må kunne peke tilbake til ett eller flere anchors.

Fordeler:

- explain-back
- audit
- source binding
- mindre risiko for hallusinasjon
- bedre quality gate
- mulig å rekonstruere hvorfor en insight ble laget

---

## 5. Entities

Entities er konkrete referenter:

- person
- place
- organization / institution
- work / title
- event
- date / period
- object når relevant

```text
Entity {
  id
  type
  label
  canonical_id?
  confidence
  evidence_anchor_ids[]
}
```

Egennavn skal normalt bo her, ikke automatisk i concepts.

---

## 6. Concepts

Concepts er meningsbærende ideer, fagbegreper, prosesser eller abstraksjoner.

```text
Concept {
  id
  key
  label
  kind
  origin: explicit | registry_match | inferred
  confidence
  evidence_anchor_ids[]
  subject_id?
  emne_id?
  canonical_id?
}
```

Concept extraction bør kombinere:

1. eksplisitte flerordsbegreper fra kilden
2. noun-/concept phrases
3. Subject Engine / Fagverk matches
4. eksisterende concept registry
5. forsiktig semantisk inferens med evidence
6. deterministic policy som guard/canonicalizer

`raw_terms` beholdes, men er kun overflatesignaler.

---

## 7. Claims skal bli proposisjoner

Et claim skal representere **hva kilden hevder**, separat fra ordlyden i kildebelegget.

```text
Claim {
  id
  proposition
  claim_type
  subject_ref?
  predicate?
  object_ref?
  polarity
  modality
  confidence
  evidence_anchor_ids[]
}
```

Eksempel:

```text
Kildebelegg:
«... kunstnerisk frihet ... etter gitte forutsetninger ...»

Proposition:
«Gitte kunstneriske rammer kan fremme formell variasjon.»
```

Proposition og evidence må aldri kollapses til samme felt.

---

## 8. Typed relations

Relations er nødvendige for at tankekart, Meta og krysskoblinger skal uttrykke mer enn co-occurrence.

Minimum:

```text
is_a
part_of
uses
creates
supports
contradicts
enables
constrains
causes
responds_to
interprets
example_of
associated_with
precedes
changes_into
```

```text
Relation {
  id
  from_ref
  relation_type
  to_ref
  confidence
  evidence_anchor_ids[]
}
```

Relasjoner kan gå mellom entities, concepts, claims og senere canonical insights.

---

## 9. Insight synthesis skjer etter struktureringen

Syntetiserte insight-kandidater bygges fra SemanticDocument, ikke direkte fra setningsutklipp.

En kandidat skal angi:

```text
CandidateInsight {
  id
  title
  summary
  insight_kind
  concept_ids[]
  claim_ids[]
  relation_ids[]
  evidence_anchor_ids[]
  why_it_matters?
  portability?
  uncertainty
  quality
}
```

### Hardt skille

`source_observation`
- kan ligge nær kilden
- er belegg/observasjon
- teller lite i insight saturation

`synthesized_insight`
- må tilføre forståelse
- kan være interpretation, principle, pattern, tension, contradiction, causal_hypothesis, learning_point osv.
- må bestå transformation-porten

Hvis analysemotoren ikke kan lage en kildebundet syntese med rimelig sikkerhet, skal den **ikke late som**. Da lagres bare observasjoner/evidence.

---

## 10. Dedikert semantisk modellkall — ikke Chat-svaret

Det brukerrettede AHA-chat-svaret skal aldri være skjult input til innsiktsmotoren.

Riktig modell:

```text
source text
→ dedicated semantic analysis request
→ strict SemanticDocument JSON
```

Dette kan bygge videre på eksisterende `/api/aha-agent/insight-candidates`-seam eller erstattes av et tydeligere versjonert endepunkt, for eksempel:

```text
POST /api/aha-agent/semantic-document
```

Backenden for `insight-candidates` må verifiseres/implementeres eksplisitt; klientkontrakten finnes i repoet, men kodegjennomgangen fant ikke en autoritativ serverimplementasjon i dette repoet.

### Fail closed

Hvis modellkallet er utilgjengelig:

- behold SourceEvent
- bygg sikre deterministic entities/basic terms/evidence
- eventuelt materialiser `source_observation`
- **ikke** løft setningsgrupper til synthesized insights

Dermed blir fravær av modellkall synlig som redusert analyse, ikke skjult som falsk kvalitet.

---

## 11. Canonicalization etter semantisk ekstraksjon

Etter modell-/regelanalysen canonicaliseres objektene mot eksisterende AHA-kunnskap:

```text
SemanticDocument concepts/entities
→ Subject Engine / Fagverk
→ concept registry
→ canonical IDs / aliases
→ quality validation
```

Fagverket skal være referanse- og canonicalization-støtte. Det skal ikke omskrive kildebelegg.

---

## 12. Ny quality gate

En synthesized insight kan bare bli canonical når følgende er bestått:

### 12.1 Grounding
Alle sentrale claims/relations har gyldige evidence anchors.

### 12.2 Semantic consistency
Insightens mening må være forenlig med claim-/relation-strukturen den bygger på.

### 12.3 Transformation
Insighten er ikke bare et sitat eller en lett omskriving.

### 12.4 Portability
Den uttrykker en forståelse som kan gjenkjennes eller brukes på tvers av materiale når det er faglig riktig.

### 12.5 Specificity
Den sier noe konkret nok til å ha verdi.

### 12.6 Relation value
Den binder sammen relevante objects når kilden faktisk gir grunnlag for det.

### 12.7 Distinctness
Den er ikke bare en ny formulering av en eksisterende insight.

### 12.8 Uncertainty
Inferensgrader må være eksplisitte. Hypoteser skal ikke presenteres som direkte observasjoner.

Forslåtte statuser:

```text
source_observation
candidate
accepted_synthesized
needs_review
rejected
```

---

## 13. Skill duplicate/equivalence fra resonance

Dagens system har for mye risiko for å blande «disse handler om det samme» og «disse er interessante å koble».

Dette skal være to separate operasjoner.

### 13.1 Equivalence / reinforcement

Brukes til:

```text
create vs reinforce vs merge_suggestion
```

Prioriter:

1. proposition equivalence
2. canonical concept overlap
3. kompatible relation patterns
4. entity context
5. ekte embedding similarity
6. lexical similarity som svak fallback

### 13.2 Resonance / relatedness

Brukes til:

- «AHA ser en mulig kobling»
- tankekart
- stier
- Meta
- retrieval

To insights kan resonere sterkt uten å være samme insight. Resonance skal derfor aldri automatisk merge dem.

---

## 14. Concept Density V2

Dagens token-diversitetsmål skal ikke lenger representere produktbegrepet «begrepstetthet».

Ny versjon:

```text
concept_density_v2 {
  unique_meaningful_concepts
  explicit_concepts
  inferred_concepts
  content_tokens
  concepts_per_100_tokens
  weighted_density
  confidence
}
```

Regler:

- entities teller ikke automatisk som concepts
- raw terms teller ikke
- canonical aliases dedupliseres
- flerordsbegreper teller som én meningsenhet
- explicit/registry concepts bør veie høyere enn usikre infererte concepts
- både raw count og normalisert score skal eksponeres

Dette gjør metricen faglig kontrollerbar og forklarbar.

---

## 15. Insight Saturation V2

Innsiktsmetning skal ikke primært være «antall insights».

Den skal være en kompositt av produktkravene:

```text
insight_saturation_v2 {
  accepted_insight_coverage
  source_diversity
  semantic_diversity
  reinforcement_consensus
  relational_coherence
  synthesis_depth
  engagement_signal
  total_score
}
```

### Viktige regler

- ti nesten identiske observations skal ikke gi høy metning
- flere uavhengige kilder som støtter samme proposition kan øke reinforcement/consensus
- semantic diversity må hindre duplicate inflation
- synthesized insights veier mer enn source observations
- relational coherence må se etter et faktisk sammenhengende kunnskapsområde
- brukerengasjement kan være et signal, men er ikke sannhetsbevis

Endelige vekter skal **ikke** låses før golden-fixtures er kalibrert. Komponenten må alltid være synlig sammen med totalen.

---

## 16. Meta-profil V2-input

Meta runtime-wiring er reparert, men Meta må etter Semantic Core-løftet bli quality-aware.

Meta bør prioritere:

1. `accepted_synthesized`
2. reinforced insights
3. canonical concepts
4. propositions
5. typed relations
6. tensions/contradictions
7. temporal evolution
8. source diversity
9. brukerbekreftet meta-minne

Legacy/weak objects skal få lavere vekt og aldri blåse opp metning eller personlig profil bare fordi de finnes i stort antall.

Meta skal analysere **brukerens varige kunnskapsstruktur**, ikke siste kildetekst på nytt.

---

## 17. Produktflatene skal bli projections

Når Semantic Core fungerer, skal vi slutte å ha separate «smarte» mini-motorer for hver visning.

```text
Begreper
= projection av canonical concepts

Innsikter
= projection av accepted insights

Lister
= grupperinger av concepts/entities/insights/claims

Stier
= meningsfull progresjon gjennom claims/insights/relations/tid

Tankekart
= typed semantic graph

Meta-profil
= cross-time analyse av samme graph/chamber

AHAavisa
= kuratert materialisering når saturation + concept density + quality tilsier modenhet
```

Strukturvisningen kan fortsatt gjøre tekstorganisering, men den skal ikke være source of truth for semantics.

---

## 18. Migrering uten å ødelegge eksisterende data

Gamle chamber-objekter skal ikke skrives om blindt.

Legg til versjonert provenance:

```text
semantic_version
analyzer_origin
analyzer_version
quality_status
```

Strategi:

1. nye SourceEvents bruker V2
2. gamle insights fortsetter å kunne leses
3. Meta kan skille `legacy` fra V2-quality objects
4. eventuell backfill kjøres separat og reviewbart
5. gamle source events beholdes uendret
6. samme object-ID må ikke få ny mening uten eksplisitt migrering

---

## 19. Personvern og modellgrenser

Semantisk analyse kan innebære et eksternt modellkall. Derfor må den bruke samme consent-/privacy-regler som resten av AHA.

Obligatorisk provenance:

- source hash
- analyzer origin/version
- modell-/provider-identifikator på teknisk nivå
- evidence anchors
- tidspunkt

Ikke logg access tokens, private workspace-ID-er eller rå sensitiv payload i offentlig telemetry/evidence.

Hvis materialet ikke kan sendes ut av klienten, brukes lokal/deterministisk fallback og output markeres deretter.

---

## 20. Implementeringsrekkefølge

### PR 1 — `SemanticDocumentV1` kontrakt + evidence anchors

Bygg bare schema, validering, source segmentation og provenance.

Ingen endring i produktoutput ennå.

### PR 2 — entities + meaningful concepts

- entity extraction
- flerordsconcepts
- registry/Fagverk canonicalization
- entity != concept-regresjoner
- `concept_density_v2` i shadow mode

### PR 3 — normalized claims + typed relations

- proposition schema
- evidence links
- relation extraction
- relation validation

### PR 4 — source-direct semantic analyzer

- versjonert model contract
- strict JSON output
- source-only input
- fail-closed fallback
- eksisterende `/insight-candidates` migreres eller erstattes kontrollert

### PR 5 — insight synthesis quality gate

- source_observation vs synthesized
- grounding
- transformation
- portability
- semantic consistency
- distinctness

Ingen rå setningsgrupper kan bli accepted synthesized insight.

### PR 6 — equivalence + resonance

- ekte embeddings for semantic similarity
- proposition/concept/relation-aware equivalence
- separate resonance edges
- merge thresholds kalibreres mot fixtures

### PR 7 — saturation V2 + Meta quality-aware

- nye komponenter
- shadow comparison mot v1
- Meta filtrerer/vekter semantic quality

### PR 8 — produktprojections

Begreper, Innsikter, Lister, Stier, Tankekart og Meta leser den samme semantiske kjernen.

### PR 9 — migration/backfill

Først når V2-fixtures er grønne og produksjonsoutput er vurdert.

---

## 21. Ferdigdefinisjon

Ombyggingen er ikke ferdig fordi et eksempel «ser bedre ut».

Den er ferdig når:

1. et rikt kildedokument gir meningsbærende concepts, ikke bare navn/ord
2. entities er tydelig separert fra concepts
3. claims er normaliserte proposisjoner med evidence
4. relations er typed og kildebundet
5. synthesized insights tilfører reell forståelse utover kildeutdrag
6. dårlig/uklar analyse failer closed
7. equivalence og resonance er separate
8. concept density måler concepts, ikke orddiversitet
9. saturation tåler duplicate/repetition-testene
10. Meta bygger mønstre fra quality-aware semantiske objects
11. lister/stier/tankekart kan materialiseres fra samme objects
12. golden fixture-suite med varierte domener er grønn
13. ingen runtime-avhengighet til det brukerrettede chat-svaret finnes
14. provenance gjør hver viktig tolkning etterprøvbar

---

## 22. Første byggejobb

Neste konkrete produkt-PR skal være **SemanticDocumentV1 + evidence anchors i shadow mode**.

Vi skal ikke begynne med å finjustere flere `AHA SER`-tekster, legge til flere weak-word-lister eller skrive flere domene-spesialregler. Først må AHA få en generell, versjonert semantisk mellomrepresentasjon som resten av systemet kan stole på.
