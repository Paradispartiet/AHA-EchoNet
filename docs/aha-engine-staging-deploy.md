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

## Provider-nøytral hosting

Denne backend-en kan deployes på valgfri container-basert plattform (for eksempel Render, Railway, Fly.io eller tilsvarende) så lenge plattformen støtter:

- Docker build fra `backend/aha_engine`
- eksponering av HTTP-port `8000`
- konfigurasjon av `AHA_ENGINE_ALLOWED_ORIGINS`

Ingen provider-spesifikke filer kreves i dette steget.
