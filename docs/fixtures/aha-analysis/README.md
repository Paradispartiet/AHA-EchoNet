# AHA analysis fixtures (golden examples)

Dette fixture-settet gir et lite, stabilt grunnlag for å sammenligne analyseoutput fra AHA-motorer.

## Formål

- Gi faste eksempler på hvordan en canonical AHA analysis object bør se ut.
- Støtte regresjonssjekk mellom dagens JavaScript-baserte analyse og en senere Python-basert backend.
- Fokusere på sammenlignbar analysekvalitet og feltstruktur, ikke UI-testing.
- Beholde ansvar for rendering i frontend; disse filene beskriver kun forventet analyseinnhold.

## Innhold

Mappen inneholder seksten JSON-fixtures med feltene:

- `id`
- `title`
- `inputText`
- `expectedCanonicalAnalysis`

Alle fixtures følger samme canonical object med standardfeltene:

- `contentType`, `domain`, `theme`, `mainTension`, `keyInsight`
- `contentType` og `domain` må bruke canonical engine keys (ikke display labels).
- `fieldConnections`, `historyGoLinks`, `suggestedActions`
- Ikke-tomme `historyGoLinks` skal bruke strukturerte objekter med `type`, `id`, `title`, `reason`.
- `confidence` (med delscore-felter)
- `warnings`

## Representative fixtures for next-phase quality work

PR 25 utvider fixture-grunnlaget med åtte representative next-phase fixtures. De nye casene dekker fagtekst, personlig refleksjon, History Go-koblinger, tverrfaglighet, uklare input og nærliggende domener som bør skilles tydelig i senere analysearbeid. Målet er å forberede senere sammenligning mellom JavaScript Engine og Python Engine, ikke å endre analyse-runtime ennå.

History Go-koblinger bruker eksisterende IDs der repoet allerede har dem (`morgenbladet`, `nav_reformen`). For Eidsvoll/Grunnloven og Bislett/stadion er koblingene markert som konseptuelle fordi det ikke finnes verifiserte IDs i repoet.

## Bruk i migrering

Under Python-migreringen kan samme `inputText` kjøres gjennom begge motorer, og output sammenlignes mot `expectedCanonicalAnalysis`.
Målet er ikke byte-for-byte identitet i språkføring, men konsistent struktur, tydelig tema/tension/insight og rimelig confidence-nivå per case.

Kjør validering lokalt med `npm run validate:aha-fixtures`.

## Sammenligningsrapport

Fixture-settet kan også brukes til lokal, deterministisk sammenligning av JavaScript Engine og Python Engine uten nettverkskall til Render staging:

```bash
npm run compare:aha-engines
```

Kommandoen oppdaterer `docs/reports/aha-engine-fixture-comparison.md` med feltvis status for `contentType`, `domain`, `theme`, `mainTension`, `keyInsight`, `fieldConnections`, `historyGoLinks`, `suggestedActions`, `confidence` og `warnings`. Rapporten skiller baseline parity-fixtures fra next-phase kvalitetsfixtures og er ment som grunnlag for senere forbedrings-PR-er, ikke som runtime- eller contract-endring.
