# AHA Engine (Python-skjelett)

Dette er et minimalt Python/FastAPI-skjelett for fremtidig AHA Engine.

## Status i migreringen

- Dette er **ikke koblet til frontend ennå**.
- Dette **erstatter ikke** eksisterende JavaScript-motor per nå.
- Eksisterende JavaScript-analyseflyt og UI forblir urørt i denne PR-en.
- Endepunktet returnerer et canonical AHA analysis object i tråd med kontrakten brukt i PR 1–3.
- Python Engine har nå en første **deterministisk fixture-baseline** for enkel klassifisering.
- Python Engine har nå en første **deterministisk semantic summary-baseline**.
- Denne matcher foreløpig `theme`, `mainTension` og `keyInsight` for golden fixtures.
- Python Engine har nå også en **deterministisk recommendation-baseline** for `fieldConnections` og `suggestedActions`.

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

Testene verifiserer blant annet health-endepunkt, canonical feltstruktur, confidence-intervall, warnings for kort/tom melding, og fixture-basert kontraktstest mot golden fixtures i `docs/fixtures/aha-analysis/`.

Fixture-testen sjekker nå første semantiske baseline: `contentType`, `domain`, og sterke `historyGoLinks`-ID-er der fixtures forventer lenker.
I tillegg sjekkes nå en første semantic summary-baseline for `theme`, `mainTension` og `keyInsight`.
Testene matcher også `fieldConnections` og `suggestedActions` mot golden fixtures.

Full canonical-paritet på alle felt (inkludert strengere match på confidence og warnings) kommer i senere PR-er.

## Teststandard

Lokalt:

```bash
cd backend/aha_engine
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m pytest
```

CI:
GitHub Actions kjører samme testkommando i `backend/aha_engine`.
