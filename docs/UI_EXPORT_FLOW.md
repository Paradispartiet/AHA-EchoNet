# UI and Export Flow

Dette dokumentet beskriver hvordan AHA Chat viser analyse og hvordan eksportpakken bygges.

## Chat UI

`chat.html` har tre hovedflater:

```text
1. Samtalen
   `#chat-log`, `#empty-state`, composer og AHA-svar.

2. Svarhandlinger
   knapper for innsikt, liste, sti, begreper, kart, forkort/utvid.

3. Explorer
   faner for oversikt, innsikter, begreper, fag, struktur, kart og data.
```

Viktig: Explorer viser ikke nødvendigvis én ren analysekilde. Den kan lese fra auto-output, afterwork, chamber, meta-profile og export-bundle.

## Explorer er visning, ikke sannhetskilde

Explorer skal bare vise data som allerede er validert.

Feil mønster:

```text
Explorer rydder eller skjuler feil → vi antar analysen er korrekt.
```

Riktig mønster:

```text
Analyse valideres før Explorer.
Explorer viser bare godkjente eller tydelig merkede felt.
```

## Export bundle

`js/ahaChatExport.js` bygger `aha_analysis_export_v1`.

Den henter blant annet:

```text
auto = loadAutoOutputs()
payload = auto.payload
chamber = loadChamberFromStorage()
afterworks = loadAfterworkEntries()
sourceText = auto.sourceText
sourceTextHash = auto.sourceTextHash || sourceHash(sourceText)
relevantAfterworks = afterworks filtered by sourceTextHash
selectedAfterwork = latest relevant afterwork
canonical = buildCanonicalAnalysis(payload, sourceText)
mergedAfterwork = ensureAcademicAfterworkShape(...)
```

Dette er kraftig, men også risikabelt fordi flere lag slås sammen.

## Eksportens hovedfelt

```text
version
exportedAt
createdAt
sourceTextHash
sourceText
sourceTextPreview
ahaReply
ahaSer
canonicalAnalysis
afterwork
insights
concepts
subjectMatches
metaProfile
knowledgeMap
rawAutoPayload
selectedAfterwork
relevantAfterworks
chamberInsights
chamberChatLog
fullChamberSnapshot
calibrationStatus
```

## Kritisk export-regel

Export må ikke bare vise hva systemet har. Den må vise hva som faktisk tilhører gjeldende kildetekst.

Derfor må hvert kildebaserte felt enten ha:

```text
sourceTextHash === current sourceTextHash
```

eller merkes:

```text
source_binding: "unverified"
```

## Felt som kan være historiske

Disse kan lovlig inneholde gammelt materiale, men må ikke forveksles med gjeldende analyse:

```text
chamberInsights
chamberChatLog
metaProfile
fullChamberSnapshot
calibrationStatus
```

Disse bør ligge under debug/data, ikke i AHA SER.

## Felt som må være gjeldende

```text
ahaSer
canonicalAnalysis
afterwork
concepts
subjectMatches
rawAutoPayload
selectedAfterwork
relevantAfterworks
```

## `ahaReply`

`ahaReply` kan hentes fra siste AHA-svar i DOM. Det betyr at eksport kan få et svar som ikke er rent bundet til `sourceText` dersom DOM-state ikke er synkronisert.

Anbefalt regel:

```text
Export bundle bør hente ahaReply fra current run object, ikke DOM.
```

DOM kan brukes som fallback, men må merkes.

## Quality layer

`ahaAnalysisQualityLayer.js` gjør visningsrydding:

```text
- tekstfikser
- deduplisering
- strukturert svarformattering
- kollapsing av lange kilder
- sitatseksjoner
- små datasett-justeringer
```

Den endrer ikke rådata og skal ikke brukes som sikkerhets- eller source-grounding-lag.

## Riktig visningsmodell

```text
AHAAnalysisRun
→ validated view model
→ Explorer
→ Export
```

Ikke:

```text
localStorage + DOM + chamber + payload + afterwork
→ Explorer direkte
```

## Minimum UI-sikkerhet

Ved source mismatch:

```text
- Vis kildetekst
- Skjul eller grå ut AHA SER
- Vis “Analyse må regenereres”
- Ikke tilby “Lagre som innsikt” for ugyldig analyse
- Ikke gi høy score
```

## Debug-output i UI

Explorer/Data bør vise:

```text
currentSourceTextHash
payloadSourceTextHash
selectedAfterworkHash
canonicalSourceBinding
memoryUsed
personalContextUsed
rawAutoPayload.createdAt
selectedAfterwork.createdAt
invalidFields
```

Dette gjør det mulig å se nøyaktig hvor lekkasjen kom fra.