# AHA Python Engine – migreringsstatus og neste fase

Dette dokumentet samler migreringsstatusen etter PR 18–23 og definerer neste fase for AHA Python Engine. Statusen er et stabilt staging-punkt, ikke en runtime-endring og ikke en beslutning om å gjøre Python Engine til default.

Render staging URL:

```text
https://aha-engine-staging-7a3y.onrender.com
```

Verifisert health endpoint:

```http
GET https://aha-engine-staging-7a3y.onrender.com/health
```

Forventet respons:

```json
{"status":"ok","service":"aha-engine"}
```

## Status etter PR 18–23

- Python AHA Engine er deployet til Render staging via `aha-engine-staging`.
- AHA Chat kan bruke Python Engine bak feature flag og eksplisitt URL.
- JavaScript Engine er fortsatt default analyseflyt.
- JavaScript fallback er fortsatt sikkerhetsnett når Python Engine ikke kan brukes, feiler eller returnerer ugyldig respons.
- Production-origin feiler lukket uten eksplisitt `aha_python_engine_url`.
- Debug metadata er forbedret i `canonicalAnalysisMeta`, inkludert mer presise fallback-reasons.
- Intern smoke-helper finnes for manuell testing fra browser console.

Relevant status fra PR 18–23:

- PR 18 valgte Render som staging-provider, bevarte eksisterende `aha-agent` i `render.yaml`, la til Python AHA Engine staging-service og deployet Python Engine på Render.
- PR 19 dokumenterte faktisk Render staging-URL og smoke-test.
- PR 20 gjorde staging-URL tilgjengelig som default i `AHAEngineClient` for testing.
- PR 21 / PR 259 rettet smoke-test debug-status slik at den viser samme URL som klienten faktisk bruker.
- PR 260 la inn P1 privacy-fiks: production-origin feiler lukket uten eksplisitt `aha_python_engine_url`, slik at production payloads ikke automatisk sendes til delt staging-backend bare fordi feature flag er aktivert.
- PR 22 / PR 261 la mer presise fallback-reasons i `canonicalAnalysisMeta`.
- PR 23 / PR 262 la til intern console-helper for manuelle smoke-scenarioer.

## Nåværende arkitektur

Nåværende flyt er:

```text
AHA Chat
→ AHAEngineClient
→ optional Python AHA Engine på Render
→ canonical AHA analysis
→ canonicalAnalysisMeta
→ JavaScript fallback ved feil eller manglende URL
```

`canonicalAnalysis` er fortsatt et rent canonical object. Det skal ikke inneholde debug-felter eller runtime-status for Python-kallet.

`canonicalAnalysisMeta` inneholder debug metadata ved siden av analysen, for eksempel `source`, `reason`, URL-status og om eksplisitt URL kreves. Reason-kodene inkluderer:

- `feature_flag_disabled`
- `requires_explicit_url`
- `client_missing`
- `timeout`
- `network_error`
- `http_error`
- `invalid_json`
- `invalid_python_shape`
- `python_null`
- `python_error`

Python Engine brukes bare når feature flag er aktivert og URL-reglene tillater det. På production-origin kreves eksplisitt `aha_python_engine_url`; staging-URL skal ikke brukes automatisk for production-origin payloads.

JavaScript Engine er fortsatt default. JavaScript fallback bevares som sikkerhetsnett når Python Engine er deaktivert, mangler URL, feiler på nettverk/HTTP, timer ut, returnerer ugyldig JSON, returnerer ugyldig canonical shape eller returnerer en Python-feil.

## Live-verifiserte scenarioer

### Staging aktivert eksplisitt

Kommando:

```js
AHAPythonEngineSmokeTest.enableWithStagingUrl()
```

Etter ny AHA Chat-melding:

```text
latestSource: "python"
latestReason: ""
```

Dette verifiserer at AHA Chat kan bruke Render staging når Python Engine er aktivert og staging-URL er eksplisitt satt.

### Production uten eksplisitt URL

Kommando:

```js
AHAPythonEngineSmokeTest.enableWithoutUrl()
```

Etter ny AHA Chat-melding:

```text
latestSource: "javascript_fallback"
latestReason: "requires_explicit_url"
requiresExplicitUrl: true
```

Dette verifiserer fail-closed-regelen: production-origin sender ikke payloads til staging uten eksplisitt URL.

### Reset

Kommando:

```js
AHAPythonEngineSmokeTest.reset()
```

Dette går tilbake til JavaScript/default-flyt ved å nullstille smoke-testens lokale Python Engine-konfigurasjon.

## Console-helper

Intern console-helper for manuell smoke-testing:

```js
AHAPythonEngineSmokeTest.printScenarioGuide()
AHAPythonEngineSmokeTest.reset()
AHAPythonEngineSmokeTest.enableWithStagingUrl()
AHAPythonEngineSmokeTest.enableWithoutUrl()
AHAPythonEngineSmokeTest.enableWithInvalidUrl()
AHAPythonEngineSmokeTest.printStatus()
```

Viktig bruksmønster:

- Helperen sender ikke AHA Chat-meldinger automatisk.
- Etter hver scenario-kommando må man sende ny AHA Chat-melding manuelt.
- Helperen sletter gammel auto-output for å unngå falsk status fra tidligere meldinger.
- `printStatus()` brukes etter ny melding for å lese siste observerte `source`, `reason`, URL-status og fail-closed-status.

## Sikkerhetsstatus

- Python Engine er ikke default.
- Production-origin sender ikke payloads til staging uten eksplisitt URL.
- Dette beskytter mot utilsiktet deling av brukerinnhold med staging-backend.
- Fail-closed-regelen fra PR 260 skal bevares frem til en reell production-backend eller production-konfigurasjon er valgt.
- JavaScript fallback fortsetter å være sikkerhetsnettet for manglende URL, deaktiverte flagg, nettverksfeil, timeouts og ugyldige Python-responser.

## Neste fase

Neste fase går fra teknisk migrering til kvalitativ forbedring av innsiktsmotoren.

Arbeidet bør handle om:

- bedre analyse av fagtekst
- bedre domain detection
- bedre tema, hovedspenning og keyInsight
- bedre fieldConnections
- bedre History Go-koblinger
- bedre suggestedActions
- bedre confidence og warnings
- flere test-fixtures
- sammenligning mellom JavaScript og Python output
- gradvis forbedring av Python Engine uten å gjøre den default

Målet er å gjøre Python Engine kvalitativt bedre og mer etterprøvbar før det tas stilling til eventuell production-konfigurasjon eller bredere utrulling.

## Foreslåtte neste PR-er

### PR 25

Legg til flere representative AHA Engine test-fixtures for fagtekst, refleksjon og History Go-koblinger.

### PR 26

Legg til lokal sammenligningsrapport mellom JavaScript Engine og Python Engine output for samme fixtures. Rapporten genereres med `npm run compare:aha-engines`, dekker alle 16 fixtures, skiller baseline-fixtures fra next-phase kvalitetsfixtures og dokumenterer feltvise avvik som grunnlag for PR 27–29 uten å endre runtime, fallback, backend API eller analyse-logikk.

### PR 27

Forbedre Python Engine domain detection og fieldConnections basert på fixture-avvik. PR 27 legger til smale, deterministiske regler for next-phase-fixturene i sammenligningsrapporten, slik at Python Engine treffer bedre på domain og fieldConnections uten å endre UI, runtime default, fallback-regler eller canonical contract.

### PR 28

Forbedrer Python Engine `suggestedActions` og `warnings` basert på fixture comparison report. Endringen legger til smale domeneregler for next-phase-fixturene, mer presise warnings for fragmentert tekst, situert uro og konseptuelle History Go-koblinger, og justerer confidence bare der warning-/uklarhetslogikken direkte tilsier det.

### PR 29

Forbedrer Python Engine `theme`, `mainTension` og `keyInsight` basert på fixture comparison report. Endringen legger til smale, deterministiske summary-regler for next-phase-fixturene, slik at tekstkvaliteten løftes uten å endre UI, runtime default, fallback-regler, backend API eller canonical AHA analysis contract.

### PR 30

Legger til en lokal regression gate for AHA Engine comparison report. Gate-en låser nåværende forbedringsnivå for prioriterte canonical fields mot en eksplisitt baseline, men krever ikke full JS/Python parity og gjør ikke Python Engine til default. UI, runtime default, fallback-regler, backend API og canonical AHA analysis contract forblir uendret.

## Representative fixtures for next-phase quality work

PR 25 utvider fixture-grunnlaget for AHA Engine-kvalitetsarbeid med representative caser for fagtekst, refleksjon, History Go-koblinger, tverrfaglige tekster og uklare input. Hensikten er å gi et bedre sammenligningsgrunnlag for senere vurdering av JavaScript Engine og Python Engine uten å endre analyse-runtime, fallback-regler eller canonical AHA analysis contract i denne fasen.
