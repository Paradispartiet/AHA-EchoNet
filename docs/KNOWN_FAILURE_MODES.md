# Known AHA Failure Modes

Dette dokumentet beskriver kjente feilmodi i AHA-analyseflyten og hvordan de skal håndteres.

## 1. Stale cached analysis

### Symptom

```text
Kildeteksten er ny, men AHA SER, afterwork eller canonicalAnalysis handler om en tidligere tekst.
```

### Sannsynlig årsak

```text
- `aha_chat_auto_outputs_v1` inneholder gammel payload
- `rawAutoPayload` brukes uten source-binding
- `canonicalAnalysis` bygges fra gammel payload
```

### Tiltak

```text
- krev sourceTextHash på rawAutoPayload
- forkast payload hvis hash ikke matcher
- regenerer canonicalAnalysis fra sourceText alene
```

## 2. Stale afterwork

### Symptom

```text
Oppsummering, refleksjon, sortert struktur, liste eller læringssti handler om feil tekst.
```

### Sannsynlig årsak

```text
- `selectedAfterwork` er hentet fra feil sourceTextHash
- merge-logikk bruker `payload` eller fallback når selectedAfterwork ikke er valid
```

### Tiltak

```text
- filtrer afterwork strengt på sourceTextHash
- ikke bruk unverified afterwork i hovedvisning
- vis regenereringsvarsel
```

## 3. Memory contamination

### Symptom

```text
Tidligere personlige temaer eller gamle chamber-innsikter dukker opp som hovedanalyse av ny kildetekst.
```

### Sannsynlig årsak

```text
- Memory Relevance Gate slipper minne inn i hovedsvar
- `ai_state` inkluderer top_insights når kildetekst egentlig skal analyseres isolert
- Personal context og source-grounded analysis blandes i samme felt
```

### Tiltak

```text
- hold memory i separat felt: “Mulig personlig kobling”
- slå av memory for rene kildeanalyser med mindre bruker ber eksplisitt om kobling
- merk memoryUsed tydelig i export og UI
```

## 4. DOM reply mismatch

### Symptom

```text
Eksportert `ahaReply` eller kort svar kommer fra siste chatboble, ikke fra gjeldende analyse.
```

### Sannsynlig årsak

```text
- export bruker `getLatestAhaReplyFromDom()` som kilde
- DOM-state er ikke synkronisert med current analysis run
```

### Tiltak

```text
- `ahaReply` skal primært komme fra current AHAAnalysisRun
- DOM kan bare brukes som fallback og må merkes `source_binding: "dom_fallback"`
```

## 5. Shape-valid but source-invalid canonical analysis

### Symptom

```text
canonicalAnalysis har riktig schema, men feil tema.
```

### Sannsynlig årsak

```text
- shape-validering sjekker typer, ikke kildematch
- Python engine eller JS fallback returnerer gyldig objekt for feil kontekst
```

### Tiltak

```text
- legg topic-consistency gate etter shape-validering
- requiredTerms/forbiddenTerms i fixtures
- score ceiling ved mismatch
```

## 6. Domain heuristic collision

### Symptom

```text
Domenespesifikke regler for ett fagfelt påvirker en annen tekst.
```

### Sannsynlig årsak

```text
- heuristikker i `ahaChat.js` leser payloadSignalText i tillegg til sourceText
- gammel payload inneholder sterke domeneord
- sourceText er svak/kort og fallback bruker payload
```

### Tiltak

```text
- sourceText må prioriteres over payloadSignalText
- payloadSignalText kan bare brukes hvis payload er source-bound
- domeneregler må ha negative guards
```

## 7. Subject match overreach

### Symptom

```text
Fagkoblinger er brede, tilfeldige eller tilhører andre tekster.
```

### Sannsynlig årsak

```text
- calibration/emne matching er for liberal
- subjectMatches hentes fra selectedAfterwork eller payload uten binding
- chamber-begreper blandes med source-begreper
```

### Tiltak

```text
- skill `subjectMatches` fra `emne_suggestions`
- krev source-binding for subjectMatches i source analysis
- vis usikre fagkoblinger som forslag, ikke fasit
```

## 8. Quality layer hides the problem

### Symptom

```text
UI ser ryddigere ut, men eksporten viser fortsatt feil analyse.
```

### Sannsynlig årsak

```text
- `ahaAnalysisQualityLayer.js` rydder tekst og duplikater i DOM
- rådata, schema og source-binding er uendret
```

### Tiltak

```text
- ikke bruk quality layer som source-grounding
- valider før rendering
- vis quality status i export bundle
```

## 9. Cross-run export merge

### Symptom

```text
Export bundle blander riktig kildetekst, gammelt rawAutoPayload og gamle chamberInsights.
```

### Sannsynlig årsak

```text
- `buildAhaAnalysisExportBundle` slår sammen auto, payload, chamber, afterworks og DOM
- noen felt er historiske, andre er current-run
```

### Tiltak

```text
- innfør AHAAnalysisRun som eneste current-run-kilde
- merk historiske felt som chamber/debug
- ikke la chamberInsights påvirke AHA SER
```

## 10. False high answer score

### Symptom

```text
Svar-evaluering gir “good” eller høy score selv om analysen handler om feil tekst.
```

### Sannsynlig årsak

```text
- evaluation vurderer form/nytte, men ikke hard source mismatch
- source grounding score har ikke score ceiling
```

### Tiltak

```text
- innfør hard mismatch ceiling
- invalid_source_mismatch skal gi lav total score
- evaluation må sjekke topic consistency
```

## Failure response pattern

Ved alvorlig mismatch skal AHA svare:

```text
AHA kunne ikke verifisere at analysen hører til denne teksten.
Kildeteksten er bevart, men AHA SER og etterarbeid må regenereres.
Ingen innsikt er lagret fra denne analysen.
```

## Prioritet

```text
P0: sourceTextHash binding
P0: stale payload/afterwork forkastes
P0: score ceiling ved mismatch
P1: topic-consistency gate
P1: fixture forbiddenTerms
P2: AHAAnalysisRun view model
```