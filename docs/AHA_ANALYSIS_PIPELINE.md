# AHA Analysis Pipeline

Dette dokumentet beskriver den faktiske analyseflyten slik repoet står nå. Det er skrevet etter kodegjennomgang av `chat.html`, `js/ahaChat.js`, `js/ahaChatAnalysis.js`, `js/ahaChatExport.js`, `js/ahaEngineClient.js`, `js/ahaIngest.js`, `js/ahaSources.js` og `js/ahaAnalysisQualityLayer.js`.

Målet er å gjøre det tydelig hva som er kildetekst, hva som er minne, hva som er etterarbeid, hva som er cache, og hva som bare er visning.

## Kort flyt

```text
brukerinput / innlimt tekst
→ AHA Chat UI (`chat.html`)
→ `ahaChat.js`
→ source event via `AHASources`
→ ingest via `AHAIngest`
→ `InsightsEngine.createSignalFromMessage(...)`
→ `InsightsEngine.addSignalToChamber(...)`
→ `aha_insight_chamber_v1`
→ auto-output / afterwork / canonical analysis
→ Explorer/UI
→ export bundle
```

## Scriptrekkefølge i chat

`chat.html` laster motor, minne, personal AI, source-logg, ingest, kontrakter, analysehjelpere, eksport, explorer, engine client, chat-controller og quality layer i samme side.

Viktig prinsipp:

```text
AHA Chat er ikke én fil.
AHA Chat er en runtime-komposisjon av mange små lag.
```

Dette gjør dokumentasjon ekstra viktig: feil kan komme fra samspillet mellom lag, ikke bare fra én funksjon.

## Hovedmoduler

### `AHASources`

Fil: `js/ahaSources.js`

Ansvar:

```text
- opprette source events
- lagre dem lokalt i `aha_source_events_v1`
- eventuelt persistente til repository/backend
- fyre `aha:source-event-added`
```

Source event er råkildeloggen. Den skal ikke forveksles med ferdige innsikter.

Skjema:

```text
id
source_type
source_app
content_type
title
text
user_created
imported
created_at
tags
meta
```

### `AHAIngest`

Fil: `js/ahaIngest.js`

Ansvar:

```text
source event / input
→ rense tekst for analyse
→ lage signal via `InsightsEngine.createSignalFromMessage(...)`
→ legge signal i chamber
→ lagre chamber
→ fire-and-forget emneforslag
→ fire-and-forget embedding-berikelse
```

Viktig: `skip_insight: true` betyr at kilden skal logges, men ikke bli brukerinnsikt. Dette brukes for eksempel for AHA-agentens egne svar.

### `ahaChat.js`

Fil: `js/ahaChat.js`

Ansvar:

```text
- chat-UI
- memory controls
- memory relevance gate
- agentkall
- fallback-svar
- innsiktskandidater
- etterarbeid
- rendering til panels/Explorer
- localStorage for auto-output og afterwork
```

Denne filen er fortsatt svært stor og bærer flere ansvar. Det er et kjent arkitekturproblem.

### `ahaEngineClient.js`

Fil: `js/ahaEngineClient.js`

Ansvar:

```text
- valgfri Python AHA Engine
- feature flag `aha_python_engine_enabled`
- base URL via `aha_python_engine_url` eller staging på non-production host
- POST `/api/aha/analyze`
- shape-validering av canonical analysis
- fallback til JavaScript hvis engine er av eller feiler
```

Python-engine brukes bare når feature flag er på og URL kan løses. Ellers er JS-fallback normal vei.

### `ahaChatAnalysis.js`

Fil: `js/ahaChatAnalysis.js`

Ansvar:

```text
- canonical analysis shape-validering
- fallback-meta
- confidence-normalisering
- History Go-linker fra domene
- noen spesialiserte kvalitetsanalyser
```

Viktig: Shape-validering sjekker at felt finnes, men ikke at innholdet faktisk matcher kilden. Dette må dekkes av source-grounding-gate.

### `ahaChatExport.js`

Fil: `js/ahaChatExport.js`

Ansvar:

```text
- bygge full analyse-export-bundle
- hente auto-output
- hente afterwork
- filtrere afterwork på `sourceTextHash`
- bygge `ahaSer`
- bygge `canonicalAnalysis`
- slå sammen afterwork/canonical/payload
- eksportere markdown/json
```

Dette laget er sentralt for feil som ser ut som “riktig sourceText, feil AHA SER/afterwork”. Hvis export merge-reglene slipper gjennom gammel payload, kan eksporten se korrekt ut teknisk, men være semantisk feil.

### `ahaAnalysisQualityLayer.js`

Fil: `js/ahaAnalysisQualityLayer.js`

Ansvar:

```text
- etterfilter på visning
- tekstfiksing
- deduplisering
- kollapsing av lange kilder
- heading-normalisering
- rydding i meta/konsept-visning
```

Dette laget endrer visning, ikke rådata, motor eller schema. Det skal ikke brukes som primær kilde-grounding.

## Source-grounded vs memory-grounded

AHA har minst to ulike sannhetskilder i samme runtime:

```text
1. Kildeteksten foran brukeren
2. Tidligere chamber/minne/personal context
```

Disse må aldri blandes i samme felt uten eksplisitt merking.

Riktig modell:

```text
AHA SER
= bare kildetekst

Mulig personlig kobling
= kildetekst + godkjent personlig minne

Chamber/meta-profil
= historisk materiale i chamberet

Afterwork
= kildebundet etterarbeid med hash-match
```

## Obligatorisk kontrakt

Alle analysefelt som påstår å analysere kildeteksten må bindes til gjeldende `sourceTextHash`.

Berørte felt:

```text
- ahaSer
- canonicalAnalysis
- afterwork
- concepts
- subjectMatches
- rawAutoPayload
- answerEvaluation
- export bundle
```

Hvis lagret eller cached data har en annen `sourceTextHash`, skal feltet forkastes eller markeres invalid.

## Særlig risiko i dagens kode

Dagens kode har flere lag som kan skape blanding:

```text
- `aha_chat_auto_outputs_v1`
- `aha_afterwork_v1`
- `aha_insight_chamber_v1`
- active academic context
- selected afterwork
- raw auto payload
- latest AHA reply from DOM
- Personal AI / memory context
```

Derfor må debugging alltid starte med å spørre:

```text
Hvilket felt kommer fra gjeldende sourceTextHash,
og hvilket felt kommer fra tidligere chamber/cache/minne?
```

## Ikke bruk quality layer som fasit

`ahaAnalysisQualityLayer.js` kan rydde tekst og skjule duplikater, men det kan ikke bevise at analysen er riktig. Kilde-låsing må skje før data når UI/eksport.

## Neste tekniske forbedring

Lag én felles analyse-kontrakt:

```text
AHAAnalysisRun {
  runId
  sourceText
  sourceTextHash
  createdAt
  sourceKind
  memoryAllowed
  canonicalAnalysis
  afterwork
  ahaSer
  concepts
  subjectMatches
  quality
  invalidationReasons
}
```

Denne bør være eneste objekt som Explorer og export leser fra når de viser analyse av en kildetekst.