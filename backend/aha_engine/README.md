# AHA Engine (Python-skjelett)

Dette er et minimalt Python/FastAPI-skjelett for fremtidig AHA Engine.

## Status i migreringen

- Dette er **ikke koblet til frontend ennå**.
- Dette **erstatter ikke** eksisterende JavaScript-motor per nå.
- Eksisterende JavaScript-analyseflyt og UI forblir urørt i denne PR-en.
- Endepunktet returnerer et canonical AHA analysis object i tråd med kontrakten brukt i PR 1–3.
- Python Engine har nå en **deterministisk fixture-baseline** for canonical klassifisering.
- Python Engine har nå en første **deterministisk semantic summary-baseline**.
- Denne matcher `theme`, `mainTension` og `keyInsight` for golden fixtures.
- Python Engine har nå også en **deterministisk recommendation-baseline** for `fieldConnections` og `suggestedActions`
- Python Engine har nå en **deterministisk baseline** for `confidence` og `warnings`.
- Python Engine matcher nå alle canonical fixture-felter.
- Full fixture-paritet er etablert for de 8 golden fixtures.
- Dette verifiseres av `test_fixture_full_canonical_parity()`.
- Dette betyr ikke at motoren er "ferdig intelligent"; kun at canonical kontrakt + golden fixture-paritet er etablert.

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
Testene matcher nå også `fieldConnections` og `suggestedActions` mot golden fixtures.
`test_fixture_full_canonical_parity()` verifiserer full canonical paritet ved å sammenligne hele responsobjektet mot `expectedCanonicalAnalysis` for alle 8 fixtures.
Dette betyr fortsatt ikke frontend-kobling, og det betyr heller ikke at motoren er ferdig intelligent.

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

## Staging/deploy

- Backend kan bygges med Docker.
- Render Blueprint finnes i repo-root: `render.yaml`.
- Se `docs/aha-engine-staging-deploy.md`.
- Frontend bruker staging bare via feature flag.
- JavaScript fallback er fortsatt standard.

