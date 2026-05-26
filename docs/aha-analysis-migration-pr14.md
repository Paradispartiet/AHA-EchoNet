# AHA Analysis-migrering PR14

Denne endringen legger til intern metadata for hvilken motor som faktisk ble brukt ved auto-output, uten å endre canonical AHA analysis-kontrakten.

## Hva som er nytt

- Auto-output payload får et nytt felt: `canonicalAnalysisMeta`.
- `canonicalAnalysisMeta` ligger **ved siden av** `canonicalAnalysis` i runtime-payloaden.
- Metadata brukes kun til intern verifisering og debugging av engine-routing.

Eksempel:

```js
payload.canonicalAnalysisMeta = {
  source: "javascript_default" | "python" | "javascript_fallback",
  featureFlagEnabled: boolean,
  resolvedAt: "ISO timestamp",
  reason: ""
}
```

## Viktige avgrensinger

- Canonical contract er uendret.
- `canonicalAnalysis` forblir et rent canonical object uten `source`, `engine`, `debug` eller annen metadata.
- Python Engine er fortsatt kun bak feature flag.
- JavaScript er fortsatt default når flag er av, og fallback når Python ikke kan brukes.

## Source/reason-semantikk

- `javascript_default`: feature flag av.
- `python`: feature flag på og gyldig canonical fra Python.
- `javascript_fallback` + `client_missing`: Python-klient ikke tilgjengelig.
- `javascript_fallback` + `python_null`: Python returnerer `null`.
- `javascript_fallback` + `invalid_python_shape`: Python returnerer ugyldig canonical shape.
- `javascript_fallback` + `python_error`: Python-kall kaster exception.


## Lokal smoke-test
- Se `docs/aha-analysis-local-smoke-test.md` for stegvis verifisering av Python-source og JavaScript fallback.
