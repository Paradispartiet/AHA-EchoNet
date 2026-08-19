# AHA Insight Engine Semantic Core V1

## Status

Dette dokumentet låser produkt- og arkitekturretningen for neste kvalitetsløft i den eksisterende AHA-innsiktsmotoren.

Det innfører **ikke** en parallell motor. `js/insightsChamber.js` forblir canonical innsiktskammer/motor og `js/metaInsightsEngine.js` forblir canonical meta-lag. Arbeidet skal forbedre hva som mates inn i disse lagene og hvilke semantiske objekter de bygger på.

## 1. Produktdefinisjon

AHA er brukerens personlige innsiktsmotor.

```text
Source event = hva som kom inn.
Insight = hva AHA forsto av det.
Meta insight = hva AHA forstår på tvers av materialet over tid.
```

AHA skal derfor ikke være en tekstutklippsmotor, en nøkkelordsteller eller et ChatGPT-svar i et annet format.

Verdien oppstår når rått materiale blir transformert til en varig og sammenkoblet kunnskapsmodell som kan brukes videre i:

- Innsikter
- Begreper og begrepslister
- Lister / samlinger
- Stier
- Tankekart
- Søk
- AHAavisa
- Meta-profil
- senere EchoNet-kandidater etter eksplisitte grenser

## 2. Ikke-bryt-regler

### 2.1 AI-agentens svar er ikke motorens sannhet

AHA Chat kan bruke en språkmodell til å svare godt på en tekst. Det svaret skal **ikke** brukes som canonical input til `Insight`, `concepts`, `claims`, `relations`, `patterns` eller Meta-profil.

Agentens svar kan brukes i utvikling og evaluering som et **QA-orakel**:

```text
kildetekst
→ god ekstern/agentisk lesning
→ hva burde en kompetent semantisk analyse ha oppdaget?
```

Deretter sammenlignes dette med AHA-motorens output. Svaret skal ikke kopieres inn i chamberet og skal ikke gjøre motoren kunstig god.

Canonical runtime-grense:

```text
bruker-/kildemateriale
→ source event
→ semantic understanding
→ insight candidates
→ quality gate
→ chamber
```

Ikke:

```text
bruker-/kildemateriale
→ AI-chat-svar
→ canonical insight
```

### 2.2 Entity er ikke concept

Personer, steder, organisasjoner, verk og andre egennavn er viktige, men de er først og fremst **entities**.

Eksempel:

```text
Karl von Appen       = person/entity
Bertolt Brecht       = person/entity
Galleri F-15         = place/institution entity
Berliner Ensemble    = institution entity
```

Mens:

```text
scenografi
form og innhold
kunstnerisk frihet
kunstneriske rammer
formell variasjon
politisk kunst
```

er concepts / meningsenheter.

Et navn kan inngå i et begrep i særtilfeller, men navnefrekvens skal ikke gjøre personen til hovedbegrep automatisk.

### 2.3 Source excerpt er ikke ferdig insight

Et kildeutdrag er **evidence** eller `source_observation`, ikke automatisk en innsikt.

Hard kvalitetsregel:

> Et foreslått ferdig insight som i hovedsak kan finnes som én sammenhengende passasje i kilden, skal normalt ikke aksepteres som syntetisert innsikt.

Unntak må merkes eksplisitt som observasjon eller sitatnær påstand.

En faktisk innsikt må tilføre en meningsfull transformasjon, for eksempel:

```text
Kilde:
«Hele utstillinga roper ut om hvilken kunstnerisk frihet det kan gi å jobbe sånn etter gitte forutsetninger.»

Ikke ferdig insight:
«Utstillingen viser kunstnerisk frihet under gitte forutsetninger.»

Bedre syntese:
«Kreativ frihet trenger ikke bety fravær av rammer; når innholdet er gitt,
kan kreativiteten flyttes over i valg av form, teknikk og visuell løsning.»
```

Den siste formuleringen kan senere kobles til andre tekster om arkitektur, film, skriving, design eller problemløsning. Det er dette som gjør den verdifull i et personlig kunnskapssystem.

## 3. Diagnose av dagens motor

Dagens canonical motor har viktige riktige byggesteiner, men grunnrepresentasjonen er for svak for bred tekstforståelse.

### Det som fungerer

- felles source/ingest-grense
- canonical chamber
- source provenance
- lifecycle / reinforce / merge
- egne felt for `raw_terms`, `concepts`, `claims`, `patterns`, `markers`
- concept graph og tidsprofil i meta-laget
- spenninger, co-occurrence, anbefalinger og meta-oppsummering
- strukturering av kildetekst er ofte brukbar

### Hovedproblemene

1. `concepts` bygges i stor grad fra et lite håndskrevet leksikon og et abstrakt-endelsesfallback.
2. `claims` er i stor grad tekstsegmenter som passer bestemte signalord, ikke normaliserte proposisjoner.
3. `patterns` er et lite hardkodet mønsterleksikon.
4. title/summary kan være nær kildeutdraget.
5. navn og høyfrekvente ord kan dominere over faktiske begreper.
6. relasjoner mellom begreper/påstander/entities finnes ikke som et tydelig førsteordens semantisk lag.
7. Meta-laget er betydelig rikere enn inputlaget. Når chamberet fylles med svake insights og svake concepts, blir også Meta-profilen svak selv om meta-algoritmene er avanserte.

Konklusjon:

> Vi skal ikke først bygge flere presentasjonsregler. Vi må forbedre den semantiske mellomrepresentasjonen som hele AHA leser fra.

## 4. Målmodell: SemanticDocument

Før AHA oppretter/reinforcer et `Insight`, skal en kilde kunne representeres som et semantisk dokument.

Forslått intern kontrakt:

```text
SemanticDocument {
  source_event_id
  source_text_hash
  source_type
  language

  entities[]
  concepts[]
  claims[]
  relations[]
  tensions[]
  evidence_anchors[]
  candidate_insights[]
}
```

Dette er en intern analysemodell. Den skal ikke erstatte `SourceEvent` eller `Insight`.

## 5. Entities

Entity extraction skal identifisere minst:

- person
- place
- institution / organization
- work / title
- event
- date / period når relevant

Entityobjekter skal ha source anchors og canonical label når mulig.

Entities brukes til kobling og proveniens, men skal ikke fylle `concepts` ukritisk.

## 6. Concepts

Concept extraction skal svare på:

> Hvilke meningsbærende ideer, fagbegreper, prosesser eller abstraksjoner brukes eller realiseres i materialet?

Concepts skal kunne komme fra flere kilder:

1. eksplisitte fagbegreper i teksten
2. flerordsuttrykk / noun phrases
3. eksisterende AHA/Fagverk-concept registry
4. semantisk canonicalisering mot kjente begreper
5. forsiktig infererte concepts når det finnes tydelig kildebelegg

Hvert concept bør ha:

```text
key
label
type
source = explicit | registry_match | inferred
confidence
evidence_anchor_ids[]
canonical_id? / subject_id? / emne_id?
```

Rå tokens beholdes som `raw_terms`; de skal ikke promoteres til concept bare fordi de forekommer ofte.

## 7. Claims / proposisjoner

Claims skal representere **hva teksten hevder**, ikke bare setningen som står der.

Forslått form:

```text
Claim {
  id
  proposition
  claim_type
  subject_entity_or_concept
  predicate
  object_entity_or_concept
  polarity
  modality
  confidence
  evidence_anchor_ids[]
}
```

Eksempel:

```text
proposition:
«Gitte innholdsrammer kan øke formell variasjon i kunstnerisk arbeid.»

subject: kunstneriske rammer
predicate: kan_fremme
object: formell variasjon
```

Kildeutdraget som begrunner dette beholdes separat i evidence.

## 8. Relations

Relations er laget som i dag mangler mest.

Motoren må kunne representere blant annet:

- `is_a`
- `part_of`
- `uses`
- `creates`
- `supports`
- `contradicts`
- `enables`
- `constrains`
- `causes`
- `responds_to`
- `interprets`
- `example_of`
- `associated_with`

Eksempel:

```text
Brecht --defines_content_for--> von Appen
von Appen --realizes_through--> scenografi
kunstneriske rammer --can_enable--> formell variasjon
formell variasjon --supports--> kunstnerisk frihet
```

Tankekart og Meta-profil skal etter hvert bygge på slike relasjoner, ikke bare co-occurrence mellom ord.

## 9. Insight synthesis

Candidate insights bygges **etter** entities, concepts, claims og relations.

En kandidat skal vurderes på minst disse aksene:

### 9.1 Grounding

Kan insighten spores til ett eller flere konkrete evidence anchors?

### 9.2 Transformation

Tilfører den en syntese, generalisering, sammenheng, konsekvens, kontrast eller prinsipiell forståelse utover kildeutdraget?

### 9.3 Portability

Er insighten formulert slik at den kan gjenkjennes eller brukes i annet materiale senere?

### 9.4 Specificity

Er den spesifikk nok til å bety noe, uten å bli ren kopi?

### 9.5 Relation value

Knytter den sammen minst to relevante objekter — concepts, claims, entities, tidligere insights eller fagverk — når materialet gir grunnlag for det?

### 9.6 Distinctness

Er den semantisk forskjellig fra eksisterende insights, eller bør den reinforce/merge en eksisterende?

## 10. Insight-typer

`functional_type` beholdes, men kvaliteten må skilles tydeligere mellom rå observasjon og syntetisert forståelse.

Minstekategorier:

```text
source_observation
interpretation
principle
pattern
contradiction
tension
causal_hypothesis
question
learning_point
decision
```

`source_observation` kan være kildenært.

`interpretation`, `principle`, `pattern`, `tension` og `causal_hypothesis` skal normalt bestå transformasjonsporten.

## 11. Chamber lifecycle

Canonical flow skal være:

```text
SourceEvent
→ SemanticDocument
→ accepted candidate insight(s)
→ semantic similarity / relation-aware match mot chamber
→ create | reinforce | merge_suggestion
→ persist provenance + evidence
→ MetaInsightsEngine
```

Reinforcement skal ikke bare være tekstlig Jaccard-likhet. Senere matching bør prioritere:

1. canonical concepts
2. proposition similarity
3. relations
4. entity context
5. embedding similarity
6. lexical similarity som svak støtte

## 12. Meta-profilens rolle

Meta-profilen skal **ikke analysere én tekst på nytt**. Den skal forstå brukerens varige materialstruktur på tvers av tid og kilder.

Den bør bruke:

- accepted/reinforced insights
- canonical concepts
- claim/proposition graph
- relations
- tensions/contradictions
- tidsutvikling
- kilde- og emnefordeling
- brukerbekreftet meta-minne

Meta skal kunne svare på spørsmål som:

```text
Hva går igjen i det jeg samler og skriver?
Hvilke begreper binder ulike interesser sammen?
Hvor har forståelsen min endret seg?
Hvilke påstander står i konflikt?
Hva er nye temaer versus gamle, stabile spor?
Hvilke forbindelser har jeg sannsynligvis ikke sett selv?
```

Meta-profilen er dermed avhengig av kvaliteten på innsiktsmotorens semantiske objekter. En avansert meta-algoritme kan ikke reparere et chamber fullt av kildeutdrag og tilfeldige ord.

## 13. Produktene skal materialiseres fra samme semantiske kjerne

```text
Innsikter
= syntetiserte forståelser

Begreper
= canonical concepts, ikke raw_terms

Lister
= semantisk grupperte concepts/entities/insights

Stier
= meningsfull progresjon mellom forståelsespunkter

Tankekart
= entities + concepts + claims + relations

Meta-profil
= mønstre og utvikling på tvers av chamberet
```

Ingen av disse skal ha en egen parallell analysefasit.

## 14. Kvalitetsevaluering

Vi trenger en permanent fixture-suite med ekte, varierte tekster.

For hver fixture lagres **forventede semantiske egenskaper**, ikke ett fasitsvar ord for ord.

Eksempel på forventningskontrakt:

```text
must_detect_entities: [...]
must_detect_concepts: [...]
must_detect_relations: [...]
must_capture_claims: [...]
forbidden_concepts: [...]
minimum_transformed_insights: true
max_excerpt_similarity_for_synthesized_insight: ...
expected_subject_domains: [...]
```

Et godt AI-svar kan brukes under utvikling til å hjelpe mennesker med å formulere disse forventningene, men **skal ikke være runtime-input og skal ikke brukes som automatisk kilde til chamberet**.

## 15. Implementeringsrekkefølge

### Fase 0 — grensene først

- fjern agent-svar som semantic fallback til canonical insights
- sikre Meta-profil-wiring
- behold source/hash/provenance-kontraktene
- behold dagens chamber og meta engine

### Fase 1 — SemanticDocument

- entity extraction
- phrase/concept extraction
- canonical concept matching
- normalized claims
- evidence anchors
- typed relations

Dagens leksikon/suffix-regler beholdes kun som fallback eller støtte, ikke som hovedmotor.

### Fase 2 — Insight synthesis

- bygg kandidatinnsikter fra SemanticDocument
- transformation/grounding/portability quality gate
- source_observation skilles fra syntetisert insight
- relation-aware create/reinforce/merge

### Fase 3 — Meta og kunnskapskart

- MetaInsightsEngine leser rikere concepts/claims/relations
- knowledge map bruker typed relations i tillegg til co-occurrence
- spenninger og endring over tid bygger på proposisjoner, ikke bare ordvalens

### Fase 4 — Produktflater

- Begreper
- Lister
- Stier
- Tankekart
- Meta-profil
- AHAavisa

skal alle materialiseres fra samme semantiske kjerne.

## 16. Ferdigdefinisjon

Innsiktsmotoren er ikke «ferdig» fordi den kan produsere felter uten feil.

Den er produktmessig god nok når ekte materiale regelmessig gir:

- relevante entities
- faktiske begreper fremfor navn/stopwords
- normaliserte claims med belegg
- eksplisitte relasjoner
- flere genuinely transformed insights når kilden gir grunnlag
- meningsfulle cross-source koblinger
- en Meta-profil som blir rikere og mer presis over tid
- produkter som kan bygges fra samme kunnskapsmodell uten å analysere teksten på nytt

Det er denne kvaliteten AHA skal optimaliseres for.