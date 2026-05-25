# AHA analysis fixtures (golden examples)

Dette fixture-settet gir et lite, stabilt grunnlag for å sammenligne analyseoutput fra AHA-motorer.

## Formål

- Gi faste eksempler på hvordan en canonical AHA analysis object bør se ut.
- Støtte regresjonssjekk mellom dagens JavaScript-baserte analyse og en senere Python-basert backend.
- Fokusere på sammenlignbar analysekvalitet og feltstruktur, ikke UI-testing.
- Beholde ansvar for rendering i frontend; disse filene beskriver kun forventet analyseinnhold.

## Innhold

Mappen inneholder åtte JSON-fixtures med feltene:

- `id`
- `title`
- `inputText`
- `expectedCanonicalAnalysis`

Alle fixtures følger samme canonical object med standardfeltene:

- `contentType`, `domain`, `theme`, `mainTension`, `keyInsight`
- `fieldConnections`, `historyGoLinks`, `suggestedActions`
- `confidence` (med delscore-felter)
- `warnings`

## Bruk i migrering

Under Python-migreringen kan samme `inputText` kjøres gjennom begge motorer, og output sammenlignes mot `expectedCanonicalAnalysis`.
Målet er ikke byte-for-byte identitet i språkføring, men konsistent struktur, tydelig tema/tension/insight og rimelig confidence-nivå per case.
