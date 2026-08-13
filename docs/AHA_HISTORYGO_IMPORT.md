# AHA History Go Import

## Formål

AHA-EchoNet skal importere History Go-data via `aha_import_payload_v1`.

Den kanoniske maskinlesbare kontrakten er
`schemas/aha_import_payload_v1.schema.json` (JSON Schema Draft 2020-12).
Runtimegrensen håndheves av `js/ahaHistoryGoImportContract.js` før én eneste
source event skrives.

## Versjonspolitikk

- Eksplisitt `schema_version: "aha_import_payload_v1"` valideres strengt.
- Eldre payload uten versjonsfelt migreres bare når den gjenkjennes gjennom
  etablerte History Go-signalfelt. Migrasjonen merkes
  `aha_import_payload_legacy_v0` i importloggen.
- Ukjent hovedversjon, for eksempel `aha_import_payload_v2`, avvises. AHA
  gjetter ikke, degraderer ikke lydløst og delimporterer ikke payloaden.
- Ugyldig struktur avvises før `AHAIngest`, storage apply, databasepersist og
  importlogg.

V1 er en privat brukerimport. Kontrakten krever derfor at offentlig deling og
modelltrening er avslått i `privacy`-feltet.

AHA-EchoNet skal ikke bruke `ahaEmneMatcher.js` for å gjette History Go-emner på nytt. History Go har egen lokal lærings- og innsiktsmotor, og importadapteren skal lese det History Go allerede har eksportert.

## Riktig flyt

```text
History Go-data
→ History Go sin lokale innsikts-/læringsmotor
→ aha_import_payload_v1
→ AHAHistoryGoImport
→ AHAIngest
→ eksisterende AHA-motor
```

## Feil flyt

```text
History Go-data
→ ahaEmneMatcher.js
→ gjettet AHA-innsikt
```

## Importprioritet

```text
1. nextup_learning_signal
2. hg_learning_log_v1
3. hg_insights_events_v1
4. hg_knowledge_entries_v2 (canonical), med knowledge_universe som eksplisitt
   legacy-fallback
5. notes
6. dialogs
```

## Metadata

Alt importert materiale skal merkes med:

```text
source_app: historygo
imported: true
```

## Kilder

### nextup_learning_signal

Importeres som høyverdi-signal med `theme_id: historygo_nextup`.

### hg_learning_log_v1

Importeres som learning events med kategori som theme_id når `categoryId` finnes.

### hg_insights_events_v1

Importeres som concept events med tekst på formen:

```text
History Go begreper: X, Y, Z
```

### hg_knowledge_entries_v2

Importeres som canonical Knowledge V2-elementer. `subject_id`/kategori,
begreps-ID-er, term-ID-er og original proveniens følger source eventet.

### knowledge_universe (legacy)

Importeres fra strukturen:

```text
category → dimension → items
```

Hvert item blir et AHA-signal.

## Viktig skille

History Go er en valgfri kilde til AHA. History Go er ikke grunnlaget for personlig AHA.

AHA skal primært forstå brukerens selvlagde materiale: chat, notes, galleri, feed, Insta, egne tekster og minner.

## ahaEmneMatcher kjøres ikke på History Go-import

`AHAIngest` har en eksplisitt guard som hopper over `ahaEmneMatcher` for
alt importert materiale. Guarden ser etter `imported: true`,
`source_app: "historygo"`, `source_type` som starter med `"historygo"`,
eller tilsvarende felt i `meta`. Resultatet:

```text
AHA Chat / Notes / Feed / Galleri / Insta / rå personlig tekst
  → kan få emne_suggestions fra ahaEmneMatcher

History Go-import
  → får ikke nye emne_suggestions fra ahaEmneMatcher
  → bruker History Go sin egen eksporterte metadata:
    concepts, related_emner, categoryId, place_id, person_id
```

History Go er kanonisk for sine egne emner. AHA skal ikke gjette dem
på nytt.
