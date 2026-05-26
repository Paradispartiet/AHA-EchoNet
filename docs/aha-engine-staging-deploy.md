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
localStorage.setItem("aha_python_engine_url", "https://<staging-url>");
```

F. Sjekk i nettleserkonsoll:

```js
window.AHAPythonEngineSmokeTest.printStatus()
```

Forventet status inkluderer:

- `latestSource: "python"`

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

## Provider-nøytral hosting

Denne backend-en kan fortsatt deployes på valgfri container-basert plattform (for eksempel Railway, Fly.io eller tilsvarende) så lenge plattformen støtter:

- Docker build fra `backend/aha_engine`
- eksponering av HTTP-port `8000`
- konfigurasjon av `AHA_ENGINE_ALLOWED_ORIGINS`

Repoet inneholder nå i tillegg en konkret Render Blueprint i `render.yaml` som bevarer eksisterende `aha-agent` og legger til `aha-engine-staging`.
