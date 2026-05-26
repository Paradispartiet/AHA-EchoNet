# AHA lokal smoke-test: Python Engine-kall fra AHA Chat

Denne guiden er en **developer-only** smoke-test for å verifisere at AHA Chat faktisk bruker Python Engine når feature flag er på, og at JavaScript fallback fortsatt fungerer.

## Mål
Bekreft lokalt at:

1. backend kjører,
2. frontend feature flag er aktivert,
3. AHA Chat sender request mot Python Engine,
4. `payload.canonicalAnalysis` finnes,
5. `payload.canonicalAnalysisMeta.source === "python"` ved gyldig Python-svar,
6. fallback gir `payload.canonicalAnalysisMeta.source === "javascript_fallback"` ved Python-feil.

## A) Start Python backend

```bash
cd backend/aha_engine
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Forventning: backend svarer på `http://127.0.0.1:8000`.

## B) Åpne AHA Chat lokalt / preview

Start frontend lokalt som vanlig i repoet, og åpne AHA Chat i nettleseren.

## C) Aktiver feature flag i browser console

```js
localStorage.setItem("aha_python_engine_enabled", "true");
localStorage.setItem("aha_python_engine_url", "http://127.0.0.1:8000");
```

## D) Send testmelding i AHA Chat

Eksempel:

> Dette er en fagtekst om Morgenbladet, offentlighet, kulturkritikk og idédebatt.

## E) Les siste auto-output

Repoet bruker storage key:

```js
"aha_chat_auto_outputs_v1"
```

Hent payload i console:

```js
JSON.parse(localStorage.getItem("aha_chat_auto_outputs_v1"))
```

Alternativt med helper:

```js
window.AHAPythonEngineSmokeTest.getLatestAutoOutput()
```

## F) Bekreft Python-resultat

Bekreft i output:

- `payload.canonicalAnalysis` finnes
- `payload.canonicalAnalysisMeta` finnes
- `payload.canonicalAnalysisMeta.source === "python"`

Rask sjekk:

```js
window.AHAPythonEngineSmokeTest.printStatus()
```

Forventet at `latestSource` er `"python"` når backend svarer med gyldig canonical analysis.

## G) Test fallback

Tving en utilgjengelig URL:

```js
localStorage.setItem("aha_python_engine_url", "http://127.0.0.1:9999");
```

Send ny melding i AHA Chat. Bekreft:

- `payload.canonicalAnalysisMeta.source === "javascript_fallback"`

Valgfritt:

```js
window.AHAPythonEngineSmokeTest.getLatestEngineMeta()
window.AHAPythonEngineSmokeTest.printStatus()
```

Forventet at `latestReason` typisk viser fallback-årsak (f.eks. `python_null` eller `python_error`).


## Automatisert smoke-test

Kjør denne testen for å verifisere ende-til-ende-koblingen mellom frontend-klienten og lokal Python FastAPI-backend:

```bash
cd backend/aha_engine
pip install -r requirements.txt
cd ../..
npm run test:aha-python-smoke
```

Testen starter `uvicorn` lokalt på port `8011`, venter på `GET /health`, kjører klientkall + resolver og verifiserer både Python-path og JavaScript fallback-path.

## H) Deaktiver feature flag etter test

```js
localStorage.removeItem("aha_python_engine_enabled");
localStorage.removeItem("aha_python_engine_url");
```

## Developer helper (passiv)

`window.AHAPythonEngineSmokeTest` er kun for lokal debugging og:

- leser bare eksisterende `localStorage`-data,
- sender ingen requests,
- endrer ikke UI,
- endrer ikke app-state,
- påvirker ikke normal runtime.

Metoder:

- `getLatestAutoOutput()`
- `getLatestEngineMeta()`
- `isPythonActive()`
- `printStatus()`
