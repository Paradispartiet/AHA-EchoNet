# AHA migrering PR 13: feature-flagget wiring til Python AHA Engine

## Hva er gjort
- AHA Chat er koblet til `window.AHAEngineClient` bak lokal feature flag.
- Standardmotor er fortsatt eksisterende JavaScript-analyse.
- JavaScript-analyse bygges alltid og brukes som automatisk fallback.

## Feature flag
Python-engine brukes bare når dette er satt:

```js
localStorage.setItem("aha_python_engine_enabled", "true");
```

Valgfri URL-overstyring:

```js
localStorage.setItem("aha_python_engine_url", "http://127.0.0.1:8000");
```

Slå av igjen:

```js
localStorage.removeItem("aha_python_engine_enabled");
```

## Runtime-oppførsel
- **Flag av (default):** Runtime er som før, kun JavaScript-motor.
- **Flag på:** AHA Chat prøver Python Engine via `AHAEngineClient`.
- Hvis Python returnerer gyldig canonical analysis brukes den.
- Hvis Python feiler, timer ut, returnerer non-200 eller ugyldig shape brukes JavaScript-fallback uten UI-feil.

## Lokal test av Python-path
Start backend separat:

```bash
cd backend/aha_engine
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Dette er fortsatt **ikke** et produksjonsbytte; det er kun lokal, eksplisitt opt-in wiring.


## Lokal smoke-test
- Se `docs/aha-analysis-local-smoke-test.md` for stegvis verifisering av Python-source og JavaScript fallback.
