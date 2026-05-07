# AHA History Go Import

## Formål

AHA-EchoNet skal importere History Go-data via `aha_import_payload_v1`.

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
4. knowledge_universe
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

### knowledge_universe

Importeres fra strukturen:

```text
category → dimension → items
```

Hvert item blir et AHA-signal.

## Viktig skille

History Go er en valgfri kilde til AHA. History Go er ikke grunnlaget for personlig AHA.

AHA skal primært forstå brukerens selvlagde materiale: chat, notes, galleri, feed, Insta, egne tekster og minner.
