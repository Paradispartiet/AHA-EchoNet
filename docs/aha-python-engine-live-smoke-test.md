# AHA Python Engine – live smoke-test for staging

## Formål

Dette dokumentet beskriver en manuell live smoke-test av Python Engine staging etter kvalitetsrunden i PR 27–30.

Testen bekrefter at:

- AHA Chat kan bruke forbedret Python Engine når eksplisitt Render staging-URL er satt.
- AHA Chat fortsatt feiler lukket fra GitHub Pages / production-origin når Python Engine er aktivert uten eksplisitt URL.
- JavaScript fallback fortsatt brukes når Python Engine ikke kan eller ikke skal brukes.
- Testen endrer ikke runtime default.
- Testen gjør ikke Python Engine til default.

## Forutsetninger

- AHA Chat kjøres fra GitHub Pages / production-origin.
- Render staging service er tilgjengelig:
  `https://aha-engine-staging-7a3y.onrender.com`
- Browser console er tilgjengelig.
- Intern helper finnes:
  `AHAPythonEngineSmokeTest`
- Følgende kommandoer finnes:
  - `AHAPythonEngineSmokeTest.printScenarioGuide()`
  - `AHAPythonEngineSmokeTest.reset()`
  - `AHAPythonEngineSmokeTest.enableWithStagingUrl()`
  - `AHAPythonEngineSmokeTest.enableWithoutUrl()`
  - `AHAPythonEngineSmokeTest.enableWithInvalidUrl()`
  - `AHAPythonEngineSmokeTest.printStatus()`

## Health check

Åpne:

```text
https://aha-engine-staging-7a3y.onrender.com/health
```

Forventet svar:

```json
{"status":"ok","service":"aha-engine"}
```

Hvis Render-tjenesten sover, kan første request bruke litt tid. Vent til health endpoint svarer før resten av smoke-testen kjøres.

## Testdata

Bruk tre representative AHA Chat-testmeldinger som dekker forbedringene fra PR 27–30. Forventningene under beskriver retning, ikke en ny fixture expectation eller regression baseline.

### 1. Morgenbladet/offentlighet

Send denne meldingen i AHA Chat:

```text
Dette er en fagtekst om Morgenbladet, offentlighet, kulturkritikk og idédebatt. Den undersøker hvordan kulturkritikk kan skape læring, men også spenning mellom ekspertkunnskap og bred demokratisk deltakelse.
```

Forventet retning når eksplisitt staging-URL er aktivert:

- `domain`: kultur, medier, offentlighet eller samfunnsdebatt
- `theme`-retning: offentlighet, kulturkritikk, idédebatt og kunnskapsformidling
- `fieldConnections`: kobler tekstens medie-/kulturfelt til demokrati, læring, deltakelse eller ekspertkunnskap
- `latestSource: "python"`

### 2. NAV-reformen/brukermøte

Send denne meldingen i AHA Chat:

```text
Teksten analyserer NAV-reformen sett fra et konkret brukermøte. Den peker på spenningen mellom effektiv saksbehandling, rettssikkerhet, digitalisering og behovet for menneskelig skjønn i møte med innbyggere som trenger hjelp.
```

Forventet retning når eksplisitt staging-URL er aktivert:

- `domain`: forvaltning, velferd, offentlig sektor eller NAV
- `theme`-retning: reform, brukermøte, rettssikkerhet, digitalisering og menneskelig skjønn
- `fieldConnections`: kobler velferdsforvaltning til teknologi, rettigheter, tillit og praktisk tjenesteyting
- `latestSource: "python"`

### 3. AI/læring/kunnskapssystemer

Send denne meldingen i AHA Chat:

```text
Dette notatet drøfter hvordan kunstig intelligens endrer læring og kunnskapssystemer. Det løfter fram muligheter for personlig veiledning, men også risiko for automatisert autoritet, svak kildekritikk og nye avhengigheter i utdanning og arbeidsliv.
```

Forventet retning når eksplisitt staging-URL er aktivert:

- `domain`: teknologi, utdanning, AI eller kunnskapssystemer
- `theme`-retning: AI-støttet læring, kunnskapsorganisering, kildekritikk og menneskelig vurdering
- `fieldConnections`: kobler teknologi til pedagogikk, epistemologi, arbeidsliv og institusjonell tillit
- `latestSource: "python"`

Etter hver scenario-endring må minst én av meldingene sendes på nytt manuelt i AHA Chat. For en komplett live smoke-test bør alle tre meldingene kjøres i Scenario A med eksplisitt staging-URL. Helperen setter bare testkonfigurasjon og leser status; den sender ikke chatmeldinger automatisk.

## Scenario A: eksplisitt staging URL skal bruke Python Engine

1. Åpne AHA Chat fra GitHub Pages / production-origin.
2. Åpne browser console.
3. Nullstill tidligere testoppsett:

   ```js
   AHAPythonEngineSmokeTest.reset()
   ```

4. Aktiver Python Engine med eksplisitt Render staging-URL:

   ```js
   AHAPythonEngineSmokeTest.enableWithStagingUrl()
   ```

5. Send alle tre representative testmeldinger manuelt i AHA Chat, én om gangen.
6. Skriv ut status etter hver melding:

   ```js
   AHAPythonEngineSmokeTest.printStatus()
   ```

Forventet:

- `latestSource: "python"`
- `configuredEngineUrl` peker på `https://aha-engine-staging-7a3y.onrender.com`
- `resolvedEngineUrl` peker på `https://aha-engine-staging-7a3y.onrender.com`
- `latestReason` er ikke `requires_explicit_url`

Dette bekrefter at GitHub Pages / AHA Chat kan bruke forbedret Python Engine når staging-URL er eksplisitt satt, på tvers av Morgenbladet/offentlighet, NAV-reformen/brukermøte og AI/læring/kunnskapssystemer.

## Scenario B: production-origin uten eksplisitt URL skal feile lukket

1. Behold AHA Chat på GitHub Pages / production-origin.
2. Aktiver Python Engine uten eksplisitt URL:

   ```js
   AHAPythonEngineSmokeTest.enableWithoutUrl()
   ```

3. Send minst én av testmeldingene manuelt på nytt i AHA Chat.
4. Skriv ut status:

   ```js
   AHAPythonEngineSmokeTest.printStatus()
   ```

Forventet:

- `latestSource: "javascript_fallback"`
- `latestReason: "requires_explicit_url"`
- `configuredEngineUrl` er tom eller `null`
- `resolvedEngineUrl` er tom eller `null`

Dette bekrefter at production-origin fortsatt feiler lukket og ikke sender payload til staging uten eksplisitt URL.

## Scenario C: ugyldig URL skal bruke JavaScript fallback

1. Sett en ugyldig Python Engine-URL:

   ```js
   AHAPythonEngineSmokeTest.enableWithInvalidUrl()
   ```

2. Send minst én av testmeldingene manuelt på nytt i AHA Chat.
3. Skriv ut status:

   ```js
   AHAPythonEngineSmokeTest.printStatus()
   ```

Forventet:

- `latestSource: "javascript_fallback"`
- `latestReason` viser en fallback-årsak, for eksempel `network_error`, `http_error` eller `python_error`

Nøyaktig reason kan variere med browser, CORS og nettverksfeil, men resultatet skal fortsatt være JavaScript fallback.

## Anbefalt komplett kjørerekkefølge

Kjør i browser console:

```js
AHAPythonEngineSmokeTest.printScenarioGuide()
AHAPythonEngineSmokeTest.reset()
AHAPythonEngineSmokeTest.enableWithStagingUrl()
```

Send de tre testmeldingene i AHA Chat, og kjør etter hver melding:

```js
AHAPythonEngineSmokeTest.printStatus()
```

Kjør deretter:

```js
AHAPythonEngineSmokeTest.enableWithoutUrl()
```

Send minst én testmelding i AHA Chat, og kjør:

```js
AHAPythonEngineSmokeTest.printStatus()
```

Kjør til slutt:

```js
AHAPythonEngineSmokeTest.enableWithInvalidUrl()
```

Send minst én testmelding i AHA Chat, og kjør:

```js
AHAPythonEngineSmokeTest.printStatus()
```


## Live smoke-testresultat – 2026-05-29

Testen ble kjørt manuelt etter at PR 31 var merget, fra AHA Chat på production-origin / GitHub Pages mot Render staging:

```text
https://aha-engine-staging-7a3y.onrender.com
```

Live smoke-testen bekreftet at eksplisitt Render staging-URL bruker Python Engine, at production-origin uten eksplisitt URL feiler lukket, at ugyldig URL går til JavaScript fallback, og at reset går tilbake til JavaScript/default-flow. Python Engine er fortsatt ikke default.

### Health check

Health endpoint:

```text
https://aha-engine-staging-7a3y.onrender.com/health
```

Resultat:

```json
{"status":"ok","service":"aha-engine"}
```

Status: Bestått.

### Direkte analyse-endepunkt

Direkte test mot analyse-endepunktet ble kjørt med:

```http
POST https://aha-engine-staging-7a3y.onrender.com/api/aha/analyze
```

Melding:

```text
Dette er en fagtekst om Morgenbladet, offentlighet, kulturkritikk og idédebatt.
```

Resultat: HTTP 200 og gyldig canonical analysis.

Viktigste felt fra responsen:

- `contentType`: `academic_article`
- `domain`: `institutional_media_history`
- `theme`: `Morgenbladet som idéoffentlig institusjon`
- `mainTension`: `dyptpløyende offentlighet kontra tempoorientert nyhetslogikk`
- `fieldConnections`:
  - `pressehistorie`
  - `offentlighetsteori`
  - `kulturjournalistikk`
- `warnings`: `[]`

Hele JSON-responsen er ikke limt inn her, fordi kortfelt-oppsummeringen er nok for å dokumentere at canonical analysis ble returnert.

### Scenario A – eksplisitt staging URL

Kommando kjørt i browser console:

```js
AHAPythonEngineSmokeTest.enableWithStagingUrl()
```

Deretter ble tre AHA Chat-meldinger sendt manuelt.

#### A. Morgenbladet/offentlighet

Melding:

```text
Dette er en fagtekst om Morgenbladet, offentlighet, kulturkritikk og idédebatt. Den undersøker hvordan kulturkritikk kan skape læring, men også spenning mellom ekspertkunnskap og bred demokratisk deltakelse.
```

Resultat:

```json
{
  "featureFlagEnabled": true,
  "configuredEngineUrl": "https://aha-engine-staging-7a3y.onrender.com",
  "resolvedEngineUrl": "https://aha-engine-staging-7a3y.onrender.com",
  "urlAvailable": true,
  "requiresExplicitUrl": false,
  "latestSource": "python",
  "latestReason": "",
  "latestStatus": null,
  "latestUrl": null
}
```

#### B. NAV-reformen/brukermøte

Melding:

```text
Teksten analyserer NAV-reformen sett fra et konkret brukermøte. Den peker på spenningen mellom effektiv saksbehandling, rettssikkerhet, digitalisering og behovet for menneskelig skjønn i møte med innbyggere som trenger hjelp.
```

Resultat:

- `latestSource`: `python`
- `latestReason`: `""`

#### C. AI/læring/kunnskapssystemer

Melding:

```text
Dette notatet drøfter hvordan kunstig intelligens endrer læring og kunnskapssystemer. Det løfter fram muligheter for personlig veiledning, men også risiko for automatisert autoritet, svak kildekritikk og nye avhengigheter i utdanning og arbeidsliv.
```

Resultat:

- `latestSource`: `python`
- `latestReason`: `""`

Konklusjon: Scenario A bestått. AHA Chat brukte Python Engine for alle tre representative meldinger når eksplisitt staging-URL var satt.

### Første timeout-observasjon

Første forsøk etter `AHAPythonEngineSmokeTest.enableWithStagingUrl()` ga:

```json
{
  "latestSource": "javascript_fallback",
  "latestReason": "timeout",
  "latestUrl": "https://aha-engine-staging-7a3y.onrender.com"
}
```

Observasjonen tolkes slik:

- URL var riktig satt.
- Dette tydet på Render cold start / staging latency, ikke feil URL eller fail-closed-regel.
- Etter health check og direkte analyse-kall svarte staging med HTTP 200.
- Ny AHA Chat-test etterpå ga `latestSource: "python"`.

Dette er bare dokumentert som en relevant live-observasjon for senere vurdering. Denne PR-en gjør ingen runtime-endring for timeout, fallback eller staging-latency.

### Scenario B – fail-closed uten eksplisitt URL

Kommando kjørt i browser console:

```js
AHAPythonEngineSmokeTest.enableWithoutUrl()
```

Status rett etter enable:

```json
{
  "featureFlagEnabled": true,
  "configuredEngineUrl": null,
  "resolvedEngineUrl": null,
  "urlAvailable": false,
  "requiresExplicitUrl": true,
  "latestSource": "n/a",
  "latestReason": "",
  "latestStatus": null,
  "latestUrl": null
}
```

Dette er riktig status før ny AHA Chat-melding, fordi helperen sletter gammel output for å unngå at forrige scenario gir falsk status.

Etter ny AHA Chat-melding:

```json
{
  "featureFlagEnabled": true,
  "configuredEngineUrl": null,
  "resolvedEngineUrl": null,
  "urlAvailable": false,
  "requiresExplicitUrl": true,
  "latestSource": "javascript_fallback",
  "latestReason": "requires_explicit_url",
  "latestStatus": null,
  "latestUrl": null
}
```

Konklusjon: Scenario B bestått. Production-origin uten eksplisitt URL sender ikke payload til staging og bruker JavaScript fallback.

### Scenario C – ugyldig URL

Kommando kjørt i browser console:

```js
AHAPythonEngineSmokeTest.enableWithInvalidUrl()
```

Status etter ny AHA Chat-melding:

```json
{
  "featureFlagEnabled": true,
  "configuredEngineUrl": "https://invalid-aha-engine-staging-url.example",
  "resolvedEngineUrl": "https://invalid-aha-engine-staging-url.example",
  "urlAvailable": true,
  "requiresExplicitUrl": false,
  "latestSource": "javascript_fallback",
  "latestReason": "network_error",
  "latestStatus": null,
  "latestUrl": "https://invalid-aha-engine-staging-url.example"
}
```

Konklusjon: Scenario C bestått. Ugyldig Python Engine URL gir JavaScript fallback med `network_error`.

### Reset

Kommando kjørt i browser console:

```js
AHAPythonEngineSmokeTest.reset()
```

Endelig status:

```json
{
  "featureFlagEnabled": false,
  "configuredEngineUrl": null,
  "resolvedEngineUrl": null,
  "urlAvailable": false,
  "requiresExplicitUrl": false,
  "latestSource": "n/a",
  "latestReason": "",
  "latestStatus": null,
  "latestUrl": null
}
```

Konklusjon: Reset bestått. AHA Chat er tilbake i JavaScript/default-flow.

### Samlet resultat

- Scenario A:
  - Morgenbladet/offentlighet → `python`
  - NAV-reformen/brukermøte → `python`
  - AI/læring/kunnskapssystemer → `python`
- Scenario B:
  - uten eksplisitt URL → `javascript_fallback` / `requires_explicit_url`
- Scenario C:
  - ugyldig URL → `javascript_fallback` / `network_error`
- Reset:
  - tilbake til JavaScript/default-flow

Konklusjon: Live smoke-testen etter PR 31 er bestått.

### Separat observasjon: AHAEmbeddings

Under invalid-URL-testen dukket følgende console-melding opp:

```text
AHAEmbeddings.embedAndStore feilet Error { }
```

Denne observasjonen påvirket ikke Python Engine smoke-testresultatet. `AHAPythonEngineSmokeTest` viste korrekt fallback-status for invalid-URL-scenarioet. Observasjonen gjelder AHAEmbeddings og bør eventuelt følges opp separat. Denne PR-en endrer ikke embedding-logikk.

## Akseptansekriterier

Smoke-testen er bestått når alle disse punktene er observert:

- Health endpoint svarer med `{"status":"ok","service":"aha-engine"}`.
- Eksplisitt staging-URL gir `latestSource: "python"` for alle tre representative testmeldinger.
- De tre meldingene viser forventet retning for `domain`, `theme` og `fieldConnections`.
- Production-origin uten eksplisitt URL gir `latestSource: "javascript_fallback"`.
- Production-origin uten eksplisitt URL gir `latestReason: "requires_explicit_url"`.
- Ugyldig URL gir `latestSource: "javascript_fallback"`.
- Runtime default er ikke endret.
- Python Engine er ikke gjort til default.

## Rydd opp etter test

Nullstill helperen når smoke-testen er ferdig:

```js
AHAPythonEngineSmokeTest.reset()
```

Valgfri manuell kontroll av localStorage:

```js
localStorage.removeItem("aha_python_engine_enabled")
localStorage.removeItem("aha_python_engine_url")
```

## Avgrensing

Denne smoke-testen er bare en manuell dokumentert testprosedyre. Den skal ikke endre:

- AHA Chat UI
- runtime default
- JavaScript fallback
- production fail-closed-regelen
- canonical AHA analysis contract
- backend API
- Python Engine-logikk
- JavaScript Engine-logikk
- Render config
- Dockerfile
- fixture expectations
- regression baseline
