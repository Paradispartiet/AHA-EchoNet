# AHA migrering PR 13 – feature-flagged wiring til Python AHA Engine

## Hva som er gjort

AHA Chat kan nå bruke Python AHA Engine **kun** når lokal feature flag er aktivert:

- `localStorage.getItem("aha_python_engine_enabled") === "true"`

Standardmotor er fortsatt eksisterende JavaScript-analyse. Python er ikke produksjonsbytte i denne PR-en.

## Kjøreflyt

1. Frontend bygger JavaScript-analyse som før.
2. Deretter forsøkes Python Engine **kun** når feature flag er aktiv.
3. Hvis Python returnerer gyldig canonical analysis, brukes den.
4. Ved disabled flag, manglende klient, timeout/feil/non-200/ugyldig shape: automatisk fallback til JavaScript-analyse.

Dette skjer uten UI-feilmeldinger til bruker (kun lavmælt `console.warn` ved feil i utvikling).

## Viktige avgrensninger i PR 13

- Ingen visuelle endringer i AHA Chat.
- Ingen endring i rendering-kontrakt.
- Ingen databaseendringer.
- Ingen embeddings / ekstern AI-integrasjon.
- Ingen backend-deploy.
- Ingen krav om Python Engine i produksjon.

## Lokal test (manuelt)

Start backend separat:

```bash
cd backend/aha_engine
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Aktiver frontend flag i browser console:

```js
localStorage.setItem("aha_python_engine_enabled", "true");
localStorage.setItem("aha_python_engine_url", "http://127.0.0.1:8000");
```

Deaktiver igjen:

```js
localStorage.removeItem("aha_python_engine_enabled");
```

## Oppsummering

PR 13 wired `ahaEngineClient.js` inn i analyseflyten bak feature flag, med trygg fallback til eksisterende JavaScript-motor. Standard runtime uten flagg er uendret.
