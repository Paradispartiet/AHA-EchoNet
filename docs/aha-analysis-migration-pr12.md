# AHA analysis migration – PR 12 (frontend bridge client)

Denne PR-en legger til en trygg frontend-klient for Python AHA Engine uten å endre standard runtime i AHA Chat.

## Hva som er lagt til

- Ny frontend-klient: `ahaEngineClient.js`.
- Klienten kan bygge payload for `POST /api/aha/analyze`.
- Klienten validerer at svar følger canonical `AhaAnalysis`-shape.
- Klienten feiler trygt og returnerer `null` ved disable/timeout/fetch-feil/non-200/ugyldig shape.

## Standard oppførsel (uendret)

- Python Engine er **disabled som default**.
- Eksisterende JavaScript-analyse er fortsatt standardmotor i AHA Chat.
- Ingen aktiv wiring av Python-klienten inn i analyze-flow i denne PR-en.

## Lokal testing med feature flag

```js
localStorage.setItem("aha_python_engine_enabled", "true");
localStorage.setItem("aha_python_engine_url", "http://127.0.0.1:8000");
```

Hvis flagget ikke er satt til `"true"`, returnerer klienten `null` uten å sende request.
