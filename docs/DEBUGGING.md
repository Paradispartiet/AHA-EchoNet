# Debugging AHA Analysis

Dette dokumentet er en praktisk feilsøkingsguide for AHA-analyser som blander kilder, minne, cache eller etterarbeid.

## Start alltid her

Når AHA viser rar analyse, spør først:

```text
1. Hva er gjeldende sourceText?
2. Hva er gjeldende sourceTextHash?
3. Hvilke felt kommer fra samme hash?
4. Hvilke felt kommer fra chamber/minne/cache?
5. Hvilket lag viste feilen først: AHA SER, afterwork, insights, subjectMatches, ahaReply eller export?
```

## Symptom: riktig sourceText, feil analyse

Typisk tegn:

```text
sourceText handler om tema A
ahaSer handler om tema B
afterwork handler om tema C
chamberInsights inneholder gamle temaer
answerEvaluation gir likevel høy score
```

Sannsynlige årsaker:

```text
- rawAutoPayload fra gammel analyse
- selectedAfterwork fra feil sourceTextHash
- canonicalAnalysis bygget fra payload med feil innhold
- latest DOM-reply brukt i export
- memory context blandet inn i hovedanalyse
- quality layer skjuler symptom, men ikke årsak
```

## Debug i eksport

Kopier full eksport og sjekk disse feltene:

```text
sourceTextHash
sourceText
rawAutoPayload
canonicalAnalysis
afterwork
selectedAfterwork
relevantAfterworks
chamberInsights
ahaReply
answerEvaluation
calibrationStatus
```

## Hash-sjekk

```text
sourceTextHash == selectedAfterwork.sourceTextHash ?
sourceTextHash == rawAutoPayload.sourceTextHash ?
sourceTextHash == canonicalAnalysis.sourceTextHash ?
sourceTextHash == afterwork.sourceTextHash ?
```

Hvis et felt mangler hash, skal det regnes som usikkert.

## Domene-sjekk

Lag tre lister:

```text
source_terms = viktigste ord i kildeteksten
output_terms = viktigste ord i AHA SER / afterwork
chamber_terms = gamle ord fra chamberInsights
```

Hvis `output_terms` matcher `chamber_terms` mer enn `source_terms`, er analysen trolig forurenset av minne/cache.

## Vanlige feilmodi

### 1. Stale afterwork

Symptom:

```text
Sortert struktur, liste eller læringssti handler om feil tekst.
```

Sjekk:

```text
afterwork.sourceTextHash
selectedAfterwork.sourceTextHash
relevantAfterworks.length
```

### 2. Stale rawAutoPayload

Symptom:

```text
rawAutoPayload.ahaSer eller payload.sortItems handler om gammel tekst.
```

Sjekk:

```text
aha_chat_auto_outputs_v1
payload.createdAt
payload.sourceTextHash
```

### 3. DOM reply mismatch

Symptom:

```text
Kort svar / ahaReply kommer fra siste chatboble, ikke fra gjeldende analyse.
```

Sjekk:

```text
getLatestAhaReplyFromDom()
chatLog siste AHA-melding
auto.createdAt
```

### 4. Chamber overtar kilden

Symptom:

```text
Meta-profil, begreper eller innsikter fra gamle samtaler dukker opp som om de tilhører ny tekst.
```

Sjekk:

```text
chamberInsights
memoryContext.used
AHA_MEMORY_CONTROLS.useExistingMemory
selectedInsights i memory transparency
```

### 5. Subject matching er for bred

Symptom:

```text
Fagkoblinger er mange og delvis irrelevante.
```

Sjekk:

```text
subjectMatches
subjectLinks
emne_suggestions
calibration matched_emner
```

## Hurtigtest for source leak

Bruk en kildetekst med tydelig domene og gamle chamber-data med helt annet domene.

Forventning:

```text
AHA SER følger kilden.
Afterwork følger kilden.
Meta/chamber kan vise gammel historikk i eget debugfelt.
Score faller hvis output ikke matcher kilden.
```

## Manuell regenerering

Ved invalid analyse:

```text
1. Tøm gjeldende auto-output for denne run.
2. Ikke slett chamber.
3. Regenerer canonicalAnalysis fra sourceText alene.
4. Bygg afterwork på nytt med samme sourceTextHash.
5. Kjør topic-consistency gate.
6. Først da render Explorer/export.
```

## Logging som bør legges til

```text
console.info("AHA analysis run", {
  runId,
  sourceTextHash,
  sourceLength,
  memoryUsed,
  autoPayloadHash,
  selectedAfterworkHash,
  canonicalDomain,
  invalidFields
});
```

## Fail-closed UI

Ved mismatch:

```text
AHA kunne ikke verifisere at analysen hører til denne teksten.
Kildeteksten vises, men AHA SER og etterarbeid må regenereres.
```

Dette er bedre enn å vise en overbevisende, men feil analyse.