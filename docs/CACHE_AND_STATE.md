# Cache and State

Dette dokumentet beskriver state-lagene som kan påvirke AHA-analyser.

## Hvorfor dette finnes

AHA har flere lokale og persistente lag. Det er nyttig for minne, offline-bruk og eksport, men farlig for kildeanalyse hvis gamle felt blir lest som om de tilhører ny tekst.

## Kjente localStorage-nøkler

### Analyse og chat

```text
aha_insight_chamber_v1
= hovedkammeret for innsikter, chatLog, knowledgeMap/meta og lokal oppdateringstid.

aha_chat_auto_outputs_v1
= auto-output for siste eller tidligere analyse.

aha_afterwork_v1
= lagrede etterarbeid. Må filtreres på sourceTextHash før bruk.

aha_chat_highlights_v1
= markerte chatmeldinger.

aha_pending_chat_prompt_v1
= ventende prompt fra annen side.
```

### Source og ingest

```text
aha_source_events_v1
= rå source events fra chat, notes, feed, galleri, insta og import.
```

### Minne og kontroll

```text
aha_memory_controls_v1
= om nye innsikter skal lagres og om tidligere minne kan brukes i svar.

aha_memory_exclusions_v1
= innsikter brukeren har ekskludert fra minnebruk.
```

### Python engine

```text
aha_python_engine_enabled
= feature flag for ekstern Python AHA Engine.

aha_python_engine_url
= eksplisitt base-URL for Python engine.
```

### History Go-import

```text
aha_import_payload_v1
= History Go sin eksportpayload inn til AHA.
```

## State-regel

```text
Local state er aldri automatisk sant for gjeldende analyse.
Local state må alltid vurderes mot:
- sourceTextHash
- createdAt
- source_type
- source_app
- imported
- current run id
```

## Største risiko

```text
Riktig sourceText + feil cached analysis
```

Dette kan skje når UI eller export henter:

```text
- rawAutoPayload fra gammel analyse
- selectedAfterwork fra gammel hash
- latest AHA reply fra DOM
- chamberInsights fra hele kammeret
- metaProfile fra historisk materiale
```

og presenterer det ved siden av ny sourceText.

## Korrekt lesemønster

For en kildeanalyse:

```text
1. Les gjeldende sourceText.
2. Beregn sourceTextHash.
3. Les auto-output bare hvis run/hash matcher.
4. Les afterwork bare hvis sourceTextHash matcher.
5. Les personal/chamber memory bare til separat personlig kobling eller meta-panel.
6. Bygg AHA SER fra gjeldende sourceText, ikke fra chamber.
7. Bygg export bundle med eksplisitt source-binding per felt.
```

## Feil lesemønster

```text
sourceText = current input
payload = last auto payload
selectedAfterwork = latest afterwork
ahaSer = payload.ahaSer || selectedAfterwork.ahaSer
```

Dette kan gi gammel analyse på ny tekst.

## Fail-closed-regel

Når AHA er usikker på state-binding:

```text
Vis kilden.
Skjul analysefelt.
Skriv “Analysefeltet er ikke kildeverifisert”.
Ikke gi score over 30.
Ikke lagre som ny innsikt automatisk.
```

## Debug-checkliste

Ved rar analyse:

```text
1. Kopier sourceTextHash fra eksport.
2. Sjekk `rawAutoPayload`.
3. Sjekk `selectedAfterwork.sourceTextHash`.
4. Sjekk `relevantAfterworks`.
5. Sjekk om `afterwork` ble slått sammen fra payload/canonical/selectedAfterwork.
6. Sjekk `chamberInsights` for gamle domener.
7. Sjekk om `latestAhaReplyFromDom()` bidro til ahaReply.
8. Sjekk memory controls: `useExistingMemory`.
```

## Anbefalt ny kontrakt

```text
AHAAnalysisRun
```

bør bli eneste kilde til Explorer/export for én analyse.

Minimumsfelt:

```text
runId
sourceText
sourceTextHash
createdAt
sourceType
memoryMode
analysisBinding
canonicalAnalysis
afterwork
ahaSer
concepts
subjectMatches
quality
invalidFields
```

## Praktisk prinsipp

```text
Cache kan gjøre AHA raskere.
Cache skal aldri gjøre AHA mindre sant.
```