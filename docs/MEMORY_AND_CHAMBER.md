# Memory and Chamber Boundaries

Dette dokumentet forklarer skillet mellom chamber, personlig minne, source events og kildeanalyse.

## Kort definisjon

```text
Source event
= rå hendelse / brukerinnhold / importert materiale.

Signal
= analyseklar tekstbit sendt inn i InsightsEngine.

Insight
= kondensert innsikt i chamberet.

Chamber
= brukerens lokale/personlige innsiktskammer.

Memory context
= utvalgte tidligere innsikter som kan brukes i svar.

Source-grounded analysis
= analyse av gjeldende kildetekst, uavhengig av tidligere chamber.
```

## Chamber er historisk materiale

`aha_insight_chamber_v1` inneholder historiske innsikter. Det er ikke det samme som gjeldende kildetekst.

Chamber kan brukes til:

```text
- meta-profil
- personlig kontinuitet
- forslag til videre arbeid
- koblinger mellom ideer
- semantisk retrieval
```

Chamber skal ikke brukes til:

```text
- å fylle AHA SER for en ny kildetekst
- å overstyre sourceText
- å velge afterwork uten sourceTextHash-match
- å forklare en akademisk tekst med tidligere private temaer
```

## Memory Relevance Gate

`ahaChat.js` har en memory gate som vurderer om tidligere minne skal brukes.

Minne brukes sterkere når meldingen har:

```text
- eksplisitt referanse til tidligere arbeid
- kontinuitetsformuleringer
- kjent AHA-prosjekt
- sterke semantiske treff
- lokale treff på begreper/prosjekt
```

Minne bør slås av eller holdes separat når meldingen er:

```text
- ren kildetekst
- akademisk artikkel
- leksikontekst
- nyhetstekst
- bruker ber om analyse av “denne teksten”
```

## Riktig minnebruk i kildeanalyse

```text
Fase 1: Analyser kilden alene.
Fase 2: Lag eventuelt “Mulig personlig kobling”.
Fase 3: Ikke la personlig kobling endre AHA SER.
```

Eksempel:

```text
AHA SER:
Teksten handler om konseptuelle artikler i Norsk medietidsskrift.

Mulig personlig kobling:
Dette er relevant for AHA fordi prosjektet selv utvikler begreper som refleksjonsdata, innsiktskort og semantisk resonans.
```

## AHA-agentens svar er ikke brukerinnsikter

Agentens egne svar kan logges som source event, men skal ikke bli ordinære insights. Bruk `skip_insight: true`.

Riktig flyt:

```text
agent reply
→ AHASources
→ skip_insight
→ ikke `InsightsEngine.addSignalToChamber`
```

Brukerens egne meldinger kan ingestes som vanlig.

## Source events vs insights

`AHASources.createSourceEvent(...)` bevarer råkilden i et enkelt schema. `AHAIngest.ingest(...)` gjør kilde til signal/insight.

Viktig:

```text
Ikke alle source events skal bli insights.
Ikke alle insights skal brukes som minne.
Ikke alt minne skal inn i kildeanalyse.
```

## Importert materiale

History Go-import skal merkes:

```text
imported: true
source_app: "historygo"
source_type: "historygo_*"
```

AHA skal ikke emnematche History Go på nytt når importen allerede har concepts/metadata fra History Go.

## Minnekontroll

Brukeren kan styre:

```text
saveNewInsights
useExistingMemory
excludedInsightIds
excludedKeys
```

Dette ligger i:

```text
aha_memory_controls_v1
aha_memory_exclusions_v1
```

## Arkitekturregel

```text
Chamber kan inspirere.
SourceText skal bestemme.
Memory må merkes.
Afterwork må hash-matche.
```

## Testkrav

Kildeanalyse bør testes med chamber fylt av irrelevante gamle innsikter.

Testen skal bekrefte:

```text
- AHA SER følger sourceText
- afterwork følger sourceTextHash
- chamberInsights kan vises i debug/export, men ikke dominere analysen
- answerEvaluation senker score ved mismatch
```