# AHA Music → History Go Export Bundle v1

Denne mappen er den stabile, samlede lesegrensen mellom AHA Music og History Go. History Go skal lese eksportfilen og schemaet her, ikke koble seg direkte til AHA Music-biblioteket, bridge-filene eller canon-filene.

## Filer

- `ahaMusicHistoryGoExport.json` er konsumentfilen med artister, spor, steder, relasjoner, canon-noder og summering.
- `ahaMusicHistoryGoExport.schema.json` er JSON Schema-kontrakten (Draft 2020-12).
- `ahaMusicHistoryGoExport.report.json` er auditrapporten for mennesker og CI.
- `README.md` beskriver kontrakten og driften.

Repo-baselinen er generert uten et privat Spotify-bibliotek. Den inneholder derfor ingen artister eller spor, men inkluderer de eksisterende canon-nodene. Et lokalt bibliotek-snapshot kan gis som første argument:

```bash
npm run music:export:history-go -- path/to/aha_music_library_v1.json
npm run music:export:history-go:audit -- path/to/aha_music_library_v1.json
```

Jobben leser bare lokale data. Den henter ikke eksterne data, endrer ikke snapshot/rådata og oppretter ikke History Go-steder. Hvis snapshotet ikke inneholder relasjonsfeltene `musicArtistPlaceRelations` og `musicTrackPlaceRelations`, leses de eksisterende bridge-filene i `data/aha-music/history-go/`. Canon-noder leses fra `data/aha-music/canon/musicCanonNodes.json`; canon-koblinger leses fra bibliotekets `artistCanonNodes`, `trackCanonNodes` og `playlistCanonNodes` (og støtter `*CanonLinks` som alias).

## Sikre koblinger og stedskandidater

En relasjon regnes som trygg for stedbasert History Go-bruk bare når `historyGoPlaceId` har en verdi. Slike relasjoner beholder eksisterende `verified`, `auto_matched` eller `suggested` status og får `unlockText`. Eksportjobben lager aldri en ny place ID.

Relasjoner uten `historyGoPlaceId` eksporteres med `status: "needs_place_review"`, `unlockText: null` og en forklaring om at stedet må verifiseres. History Go kan vise dem i review/audit-verktøy, men skal ikke bruke dem som sikre unlocks eller som autoritative stedskoblinger. Relasjoner med inngangsstatus `rejected` tas ikke med.

## Determinisme og tidspunkt

Lister sorteres stabilt: artister alfabetisk, spor etter artist og tittel, og relasjoner etter sted, artist og sportittel. ID-er valideres for duplikater og alle relasjonsreferanser kontrolleres.

For byte-stabile bygg avledes `generatedAt` fra snapshotets `generatedAt`/`exportGeneratedAt` eller seneste eksisterende relasjon/canon-tidsstempel. Tom baseline bruker Unix-epoken. CI eller en utgiver kan sette et eksplisitt ISO-tidspunkt med `AHA_MUSIC_EXPORT_GENERATED_AT`.
