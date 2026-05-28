# AHA Engine staging deploy (Python backend)

Dette dokumentet beskriver hvordan `backend/aha_engine` kan kjøres som en egen **staging-tjeneste**.

## Viktig avgrensing

- Dette er **staging**, ikke produksjon.
- Python Engine er fortsatt **disabled som default** i frontend.
- Frontend må aktivere Python Engine eksplisitt via localStorage feature flag.
- JavaScript fallback bevares ved feil mot Python-backend.
- Backend deployes som egen tjeneste.
- Ingen secrets trengs på nåværende steg.
- Ingen database brukes.
- Ingen embeddings brukes.
- Ingen ekstern AI/API-integrasjon brukes.

## Miljøvariabler

- `AHA_ENGINE_ALLOWED_ORIGINS`: kommaseparert liste med origins for CORS.

Eksempel:

```bash
AHA_ENGINE_ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:5500,https://paradispartiet.github.io"
```

Hvis variabelen ikke settes (eller er tom), brukes lokale dev-origins:

- `http://localhost:3000`
- `http://127.0.0.1:5500`
- `http://localhost:5500`

## Generisk deploy-flyt

A. Bygg lokalt:

```bash
cd backend/aha_engine
docker build -t aha-engine-staging .
```

B. Kjør lokalt:

```bash
docker run --rm -p 8000:8000 aha-engine-staging
```

C. Test health:

```bash
curl http://127.0.0.1:8000/health
```

D. Test analyze:

```bash
curl -X POST http://127.0.0.1:8000/api/aha/analyze \
  -H "Content-Type: application/json" \
  -d '{"message":"Dette er en fagtekst om Morgenbladet, offentlighet, kulturkritikk og idédebatt.","assistantReply":null,"historyGoContext":{}}'
```

E. Aktiver frontend mot staging:

```js
localStorage.setItem("aha_python_engine_enabled", "true");
```

Merk: På production-origin må `aha_python_engine_url` settes eksplisitt. Uten eksplisitt URL feiler klienten lukket og bruker JavaScript fallback.

F. Sjekk i nettleserkonsoll:

```js
window.AHAPythonEngineSmokeTest.printStatus()
```

Forventet status inkluderer:

- `latestSource: "python"`
- `configuredEngineUrl` viser eksplisitt URL hvis satt (ellers `null`).
- `resolvedEngineUrl` viser faktisk URL som runtime bruker (eller `null` i production uten eksplisitt URL).

## Staging URL som miljøsensitiv default i klienten

`AHAEngineClient` bruker verifisert Render staging-URL som default kun i tydelige ikke-production-miljøer (f.eks. localhost/dev/staging/preview) når Python feature flag er aktivert og `aha_python_engine_url` ikke er satt:

- `https://aha-engine-staging-7a3y.onrender.com`

Viktig:

- Python Engine er fortsatt **disabled som default**.
- Python Engine brukes fortsatt bare når `localStorage.getItem("aha_python_engine_enabled") === "true"`.
- Production-origin uten eksplisitt `aha_python_engine_url` sender **ikke** payload til staging (fail-closed).
- URL kan fortsatt overstyres via `aha_python_engine_url`.
- Lokal backend kan fortsatt brukes med:

```js
localStorage.setItem("aha_python_engine_url", "http://127.0.0.1:8000");
```

## Render staging

Render er valgt som første staging-provider for AHA Engine i denne migreringsfasen.

- `render.yaml` i repo-root definerer nå to Render-tjenester: eksisterende `aha-agent` (Node/OpenAI/Voyage) og nye `aha-engine-staging` (Python staging).
- PR 18 legger til `aha-engine-staging` uten å fjerne eksisterende `aha-agent`.
- Tjenesten bruker Docker runtime og bygger fra `backend/aha_engine` (Dockerfile i den mappen).
- Health check går mot `GET /health`.
- CORS styres av `AHA_ENGINE_ALLOWED_ORIGINS`.
- Ingen secrets trengs i nåværende fase.
- Ingen database, embeddings eller ekstern AI/API-integrasjon er lagt til.
- Dette er ikke et produksjonsbytte; frontend beholder JavaScript-motoren som default/fallback.

### Opprette staging-tjenesten i Render

1. Gå til Render Dashboard og velg opprettelse via Blueprint fra repoet.
2. Velg dette repoet og branchen som inneholder `render.yaml`.
3. Bekreft at Blueprint oppretter web-servicen `aha-engine-staging`.
4. Verifiser etter opprettelse at health check på `/health` er grønn.

### Etter at Render har gitt staging-URL

Aktiver Python Engine i nettleseren:

```js
localStorage.setItem("aha_python_engine_enabled", "true");
```

Ved behov kan URL fortsatt overstyres manuelt:

```js
localStorage.setItem("aha_python_engine_url", "https://<render-staging-url>");
```

Send testmelding i AHA Chat:

```text
Dette er en fagtekst om Morgenbladet, offentlighet, kulturkritikk og idédebatt.
```

Sjekk status i konsollen:

```js
window.AHAPythonEngineSmokeTest.printStatus()
```

Forventet:

- `latestSource: "python"`

### Fallback-test med ugyldig staging-URL

Sett en ugyldig URL:

```js
localStorage.setItem("aha_python_engine_url", "https://invalid-aha-engine-staging-url.example");
```

Send en ny melding i AHA Chat og sjekk:

```js
window.AHAPythonEngineSmokeTest.printStatus()
```

Forventet:

- `latestSource: "javascript_fallback"`

Merk: Vercel preview-origins legges ikke inn som wildcard (f.eks. `https://*.vercel.app`) i denne fasen. Eventuelle preview-origins må legges til eksplisitt når konkret preview/staging-origin er kjent.


## Intern console-helper for Python Engine testing

AHA Chat eksponerer en intern console-helper for rask testing av Python Engine-scenarier:

```js
AHAPythonEngineSmokeTest.reset()
AHAPythonEngineSmokeTest.enableWithStagingUrl()
AHAPythonEngineSmokeTest.enableWithoutUrl()
AHAPythonEngineSmokeTest.enableWithInvalidUrl()
AHAPythonEngineSmokeTest.printScenarioGuide()
AHAPythonEngineSmokeTest.printStatus()
```

Helperen endrer bare `localStorage` og intern teststatus. Den sender ikke AHA Chat-meldinger automatisk, slik at selve appflyten fortsatt testes ved at man sender en ny melding manuelt i UI etter hver enable-kommando.

Anbefalt rekkefølge:

1. Kjør `AHAPythonEngineSmokeTest.reset()`.
2. Kjør `AHAPythonEngineSmokeTest.enableWithStagingUrl()`.
3. Send en ny AHA Chat-melding manuelt.
4. Kjør `AHAPythonEngineSmokeTest.printStatus()`.
5. Kjør `AHAPythonEngineSmokeTest.enableWithoutUrl()`.
6. Send en ny AHA Chat-melding manuelt.
7. Kjør `AHAPythonEngineSmokeTest.printStatus()`.
8. Kjør `AHAPythonEngineSmokeTest.enableWithInvalidUrl()`.
9. Send en ny AHA Chat-melding manuelt.
10. Kjør `AHAPythonEngineSmokeTest.printStatus()`.

Forventede scenarioer:

- `reset()` fjerner Python Engine-flagget og URL-overstyring og går tilbake til JavaScript/default.
- Eksplisitt staging-URL skal gi `latestSource: "python"` når staging er oppe.
- Production-origin uten eksplisitt URL skal feile lukket med `latestReason: "requires_explicit_url"`.
- Ugyldig URL skal falle tilbake til JavaScript med en presis reason, for eksempel `network_error`, `http_error` eller `python_error`; nøyaktig reason kan avhenge av browser/network.

## Verifisert staging URL

Faktisk Render staging-URL for Python AHA Engine:

- Staging URL: `https://aha-engine-staging-7a3y.onrender.com`
- Health endpoint: `https://aha-engine-staging-7a3y.onrender.com/health`
- Analyze endpoint: `https://aha-engine-staging-7a3y.onrender.com/api/aha/analyze`

## Verifisert smoke-test

Følgende er manuelt verifisert mot staging:

- `GET /health` returnerer `{"status":"ok","service":"aha-engine"}`.
- `POST /api/aha/analyze` returnerer et gyldig canonical AHA analysis object.
- AHA Chat med feature flag mot staging gir `latestSource: "python"` i smoke-test-status.
- JavaScript fallback/default er fortsatt bevart fordi Python Engine fortsatt kun aktiveres via localStorage-flag.

Konsollkommandoer brukt i staging-test:

```js
localStorage.setItem("aha_python_engine_enabled", "true");
localStorage.setItem("aha_python_engine_url", "https://aha-engine-staging-7a3y.onrender.com");

window.AHAPythonEngineSmokeTest.printStatus();
```

Verifisert statusutdrag etter ny AHA Chat-melding:

```js
{
  featureFlagEnabled: true,
  configuredEngineUrl: "https://aha-engine-staging-7a3y.onrender.com",
  latestSource: "python",
  latestReason: ""
}
```

Direkte klienttest mot staging:

```js
window.AHAEngineClient.analyzeWithPythonEngine(
  window.AHAEngineClient.buildAnalyzePayload(
    "Dette er en fagtekst om Morgenbladet, offentlighet, kulturkritikk og idédebatt.",
    null,
    {}
  )
).then(console.log);
```

Verifisert canonical-felter i responsen:

- `contentType: "academic_article"`
- `domain: "institutional_media_history"`
- `theme: "Morgenbladet som idéoffentlig institusjon"`
- `mainTension: "dyptpløyende offentlighet kontra tempoorientert nyhetslogikk"`

Fallback reset (tilbake til default/JS-flyt):

```js
localStorage.removeItem("aha_python_engine_enabled");
localStorage.removeItem("aha_python_engine_url");
```

## Provider-nøytral hosting

Denne backend-en kan fortsatt deployes på valgfri container-basert plattform (for eksempel Railway, Fly.io eller tilsvarende) så lenge plattformen støtter:

- Docker build fra `backend/aha_engine`
- eksponering av HTTP-port `8000`
- konfigurasjon av `AHA_ENGINE_ALLOWED_ORIGINS`

Repoet inneholder nå i tillegg en konkret Render Blueprint i `render.yaml` som bevarer eksisterende `aha-agent` og legger til `aha-engine-staging`.

## Debug reasons for Python fallback

Python Engine-fallback i AHA Chat skiller nå mellom stabile reason-koder i `payload.canonicalAnalysisMeta.reason`:

- `feature_flag_disabled` – Python Engine-feature flag er ikke aktivert.
- `requires_explicit_url` – feature flag er aktivert på production-origin, men `aha_python_engine_url` er ikke eksplisitt satt.
- `client_missing` – AHA Chat mangler Python Engine-klienten eller nødvendig klientmetode.
- `timeout` – requesten ble avbrutt av klient-timeout.
- `network_error` – fetch/network feilet før gyldig HTTP-respons.
- `http_error` – Python Engine svarte med ikke-2xx HTTP-status.
- `invalid_json` – HTTP-responsen kunne ikke parses som JSON.
- `invalid_python_shape` – JSON-responsen fulgte ikke canonical AHA analysis-kontrakten.
- `python_null` – Python Engine-responsen var `null`.
- `python_error` – uventet klientfeil under Python Engine-kall.

Debug-metadata ligger fortsatt kun ved siden av analysen i `canonicalAnalysisMeta`; `canonicalAnalysis` er fortsatt et rent canonical object uten debug-felter. På production-origin kreves eksplisitt `localStorage.setItem("aha_python_engine_url", "https://aha-engine-staging-7a3y.onrender.com")` før payloads sendes til staging-backend. JavaScript fallback er fortsatt sikkerhetsnettet når Python Engine er deaktivert eller feiler.

Se også samlet migreringsstatus og neste fase i `docs/aha-python-engine-migration-status.md`.
