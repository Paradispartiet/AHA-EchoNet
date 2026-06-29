# Source Grounding Contract

Dette dokumentet definerer hvordan AHA skal skille mellom kildetekst, personlig minne, chamber-historikk, cached afterwork og UI-visning.

Bakgrunn: AHA kan i dag vise riktig `sourceText`, men samtidig lekke gammel analyse inn i `ahaSer`, `afterwork`, `canonicalAnalysis`, `concepts` eller `subjectMatches`.

## Hovedregel

```text
AHA SER skal først svare på teksten foran seg.
AHA MINNES skal først kobles inn etterpå.
AHA ETTERARBEID skal aldri gjenbruke gamle felt uten hash-match.
```

## Fire separate kontekster

AHA må holde disse adskilt:

```text
1. sourceText
   Teksten brukeren nettopp har sendt eller limt inn.

2. source-grounded analysis
   Analyse som bare bygger på gjeldende sourceText.

3. personal/chamber memory
   Tidligere innsikter, source events, semantic retrieval og Personal AI-context.

4. UI/export state
   Renderede felt, active context, cached payload, selected afterwork og eksportdata.
```

## Felt som må være kilde-låst

Disse feltene er ugyldige uten matchende `sourceTextHash`:

```text
- ahaSer
- canonicalAnalysis
- afterwork
- concepts
- subjectMatches
- rawAutoPayload
- selectedAfterwork
- relevantAfterworks
- answerEvaluation
- exported analysis bundle
```

## Hash-regel

```text
currentSourceHash = sourceHash(currentSourceText)

For hvert kildebasert felt:
  hvis field.sourceTextHash mangler:
    field kan bare brukes hvis det ble produsert i samme run
  hvis field.sourceTextHash !== currentSourceHash:
    field skal forkastes
    field skal ikke vises som analyse av currentSourceText
```

## Topic-consistency gate

Shape-validering er ikke nok. Et objekt kan ha riktig schema og fortsatt analysere feil tekst.

Legg inn semantisk kontroll:

```text
sourceTerms = top terms/themes from sourceText
outputTerms = top terms/themes from ahaSer + afterwork + canonicalAnalysis

Hvis outputTerms inneholder sterke domeneord som ikke finnes i sourceText:
  invalid

Hvis sourceTerms og outputTerms har for lav overlapp:
  invalid

Hvis output domain er ulik source domain og ikke eksplisitt merket som personlig kobling:
  invalid
```

## Eksempel: NMT-artikkel

Kildetekst: Norsk medietidsskrift, konseptuelle artikler, begreper, offentlighet, akademisk publisering, norsk/nordisk kontekst, polarisering.

Godkjente output-temaer:

```text
- konseptuelle artikler
- begrepsutvikling
- akademisk offentlighet
- medievitenskap
- norsk/nordisk kontekst
- polarisering
- fagfellevurdering
- tellekantsystem
- NMT
```

Ugyldige output-temaer er temaer som ikke finnes i kilden og tydelig kommer fra tidligere analyse eller personlig minne.

## Hvordan personlig minne kan brukes riktig

Riktig:

```text
AHA SER:
Teksten handler om NMTs lansering av konseptuelle artikler.

Mulig personlig kobling:
Dette kan kobles til AHA-prosjektet fordi AHA selv utvikler nye begreper som innsiktskort, refleksjonsdata og semantisk resonans.
```

Feil:

```text
AHA SER:
Teksten handler om brukerens tidligere dagbokspørsmål.
```

## Eksportregel

Export bundle må vise kildegrunnlag eksplisitt:

```text
sourceTextHash
sourceTextPreview
analysisRunId
canonicalAnalysis.sourceTextHash
afterwork.sourceTextHash
rawAutoPayload.sourceTextHash
selectedAfterwork.sourceTextHash
```

Hvis et felt mangler hash, skal det merkes:

```text
source_binding: "unverified"
```

og ikke brukes til hovedvisning.

## Scoring-regel

Svar-evaluering må straffe kildebrudd hardt:

```text
Hvis hovedtema i svar ikke finnes i sourceText:
  source_grounding <= 20
  total_score <= 30

Hvis gammelt tema lekker inn i en kildeanalyse:
  total_score <= 20
  status = "invalid_source_mismatch"
```

## Minimumstest

Hver analysefixture bør ha negative leak terms:

```json
{
  "id": "nmt_conceptual_articles",
  "inputText": "...",
  "expectedCanonicalAnalysis": { },
  "forbiddenTerms": ["tema_fra_gammel_analyse", "tema_fra_personlig_minne"]
}
```

Testen skal feile hvis forbidden terms finnes i:

```text
ahaSer
canonicalAnalysis
afterwork
concepts
subjectMatches
rawAutoPayload
```

## Produktregel

Brukeren skal kunne stole på at:

```text
Når AHA sier “AHA SER”, ser den faktisk denne teksten.
Når AHA bruker minne, sier den tydelig at det er minne.
Når AHA viser etterarbeid, kommer det fra riktig kildetekst.
```