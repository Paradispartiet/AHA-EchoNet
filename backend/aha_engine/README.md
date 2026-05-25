# AHA Engine (Python-skjelett)

Dette er et minimalt Python/FastAPI-skjelett for fremtidig AHA Engine.

## Status i migreringen

- Dette er **ikke koblet til frontend ennå**.
- Dette **erstatter ikke** eksisterende JavaScript-motor per nå.
- Eksisterende JavaScript-analyseflyt og UI forblir urørt i denne PR-en.
- Endepunktet returnerer et canonical AHA analysis object i tråd med kontrakten brukt i PR 1–3.

## Lokal oppstart

```bash
cd backend/aha_engine
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Serveren starter lokalt, typisk på `http://127.0.0.1:8000`.

- Health check: `GET /health`
- Analyze: `POST /api/aha/analyze`

## Kjør tester

```bash
cd backend/aha_engine
pytest
```

Testene verifiserer blant annet health-endepunkt, canonical feltstruktur, confidence-intervall, og warnings for kort/tom melding.
