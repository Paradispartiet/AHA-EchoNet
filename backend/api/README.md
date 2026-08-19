# AHA NestJS API and canonical sync production foundation

Status: **aktiv canonical production-backend for en bounded manual pilot med nøyaktig 2 verifiserte profiler. Ikke generell production-sync.**

Denne tjenesten inneholder NestJS-grunnmur, verifisert auth, canonical PostgreSQL repository-adapter, eksplisitt local-first kontoimport-kontrakt og personal/private canonical sync. Production kjører i Azure Container Apps mot dedikert privat PostgreSQL med least-privilege runtime-role. AHA Home kan kjøre canonical production-sync etter eksplisitt brukerhandling og samtykke; automatic/login/background sync er fortsatt av.

## Dette finnes

- `GET /v1/health` — offentlig liveness og redigert production/runtime-status
- `GET /v1/auth/context` — beskyttet, verifisert principal i stabil envelope
- `GET /v1/profile` — canonical RLS-bound read contract
- `POST /v1/local-imports/confirmation` — mottar bare lokal preview-hash + tellinger
- `POST /v1/local-imports/commit` — eksplisitt, hash-bundet kontoimport
- `GET /v1/sync/bootstrap` — første canonical snapshot/pre-journal state
- `GET /v1/sync/pull` — monotone canonical deltaer
- `POST /v1/sync/push` — én eksplisitt hash-/revision-/idempotency-bundet canonical command
- global Bearer/JWKS-verifisering
- streng DTO-validering og CORS-allowlist
- stabil success/error-envelope
- redigert audit uten token, body, query, SQL eller rå subject
- PostgreSQL-adapter bak leverandørnøytral repository-port
- read-only DB-session for reads
- command session kun for eksplisitte canonical command functions
- runtime-sperre mot superuser, `BYPASSRLS`, table-owner og `row_security=off`
- production Azure Container Apps + dedikert PostgreSQL + Key Vault
- immutable API-revisjoner og versjonspinnet pilot-allowlist
- per-profile og full-pilot rollback uten destruktiv sletting av canonical data
- committet npm lockfile og read-only `npm ci` i CI

## Dagens production-pilot

Production-policy:

```text
ops/canonical-sync-production-rollout-v1.json
```

Dagens grense er:

```text
mode = bounded_manual_allowlist
currentVerifiedProfileCount = 2
maxProfiles = 10
profilesAddedPerActivation = 1
nextExpansionPaused = true
automatic sync = false
login/auth-ready sync = false
background sync = false
group/public canonical sharing = false
```

Profil #2 er verifisert gjennom faktisk production API-/databasekjede med eget private workspace `200`, annen pilotprofils private workspace `403`, immutable activation-revisjon og rollback dry-run uten production-mutasjon.

Operativ status:

```text
docs/AHA_CANONICAL_PRODUCTION_PILOT_STATUS.md
```

## AHA Home og manuell production-sync

Normal pilotbruk skjer fra AHA Home via eksplisitt `Synkroniser nå`.

Controller:

```text
js/ahaCanonicalProductionHomeSync.js
```

Home bruker fast konfigurert production endpoint. Workspace kan ikke velges manuelt; det utledes fra den innloggede Supabase-identiteten. Canonical dependencies lazy-loades først etter eksplisitt brukerhandling og samtykke.

Den separate siden:

```text
canonical-sync-production-pilot.html
```

beholdes som diagnostisk operatorflate, ikke som normal produktflyt.

## Local account import

Importpreview bygges lokalt av:

```text
js/ahaLocalAccountImport.js
```

Første nettverkskall inneholder ikke lokal datasamling eller canonical plan, bare source kind/version, hashes og tellinger. Først etter eksplisitt brukerbekreftelse sendes den allow-listede canonical planen til commit.

`local import` er fortsatt deaktivert i dagens production-pilot selv om API-kontrakten finnes.

Detaljert kontrakt:

```text
docs/AHA_LOCAL_IMPORT_POSTGRESQL_V1.md
```

## Canonical sync

Lokal persistence ligger i:

```text
js/ahaCanonicalSyncStore.js
```

med IndexedDB-stores for outbox, cursors, object state, conflicts og tombstones.

Deterministisk browser-hash ligger i:

```text
js/ahaCanonicalSyncHash.js
```

NestJS speiler samme canonical JSON + SHA-256-kontrakt før push når repositoryet.

Sync er begrenset til ti canonical personal/private objekttyper og aktiverer ikke group/EchoNet/public sharing. Local-only Notes, Gallery, Feed, Insta, Music, Training, Personal AI og workbench-state er utenfor canonical kontrakten med mindre de materialiseres gjennom en av de eksplisitt støttede canonical modellene.

Detaljert kontrakt:

```text
docs/AHA_CANONICAL_SYNC_API_V1.md
```

## To-profil round-trip — neste obligatoriske gate

Det som fortsatt ikke er bevist er normal real-data round-trip for **begge** eksisterende profiler.

Operatorflate:

```text
canonical-sync-production-roundtrip.html?ahaCanonicalProductionRoundTrip=1
```

Dokumentasjon:

```text
docs/AHA_CANONICAL_PRODUCTION_TWO_PROFILE_ROUND_TRIP_V1.md
```

For hver profil skal en liten ekte lokal AHA-endring gå gjennom:

```text
local AHA
→ canonical adapter
→ IndexedDB outbox
→ push
→ production journal
→ bootstrap/pull
→ local apply/rebaseline
→ identisk replay
```

Før profil #3 kan vurderes kreves faktisk push + server round-trip/local apply, monotone cursors, null hash-mismatch, null uventede konflikter/rejections og idempotent replay med `changed=0`, `enqueued=0`, `pushed=0`.

## Dette finnes fortsatt ikke / er fortsatt bevisst av

- generell production-sync for alle brukere
- automatisk kontoimport ved innlogging
- automatisk sync ved innlogging
- auth-ready-triggered sync
- background sync/timer/WebSocket/beacon
- automatisk pilotutvidelse
- profil #3 før to-profil round-trip closeout
- generelle runtime-grants til `aha.*`
- direkte browserwrites til canonical tabeller
- gjenbruk av legacy `syncFromDatabase()` som canonical sync-motor
- automatisk konfliktmerge eller tombstone-resurrection
- Hasura write path
- LangGraph/LangChain worker-runtime for canonical sync
- automatisk EchoNet-deling
- automatisk ekstern publisering

## Health-grensen

Health viser redigert database-/runtime-/sync-status, men aldri DSN, databasebruker, host, profile IDs, secrets eller driverfeil. I active pilot rapporteres blant annet canonical sync-status, safe runtime-role og `allowedProfileCount` uten å publisere allowlisten.

## Applikasjonsmiljø

| Variabel | Påkrevd i production | Formål |
|---|---:|---|
| `NODE_ENV` | ja | `development`, `test` eller `production` |
| `PORT` | nei | standard `3100` |
| `AHA_API_VERSION` | ja i immutable production deploy | aktiv service-/Git-revisjon |
| `AHA_ALLOWED_ORIGINS` | ja | kommaseparert liste uten wildcard |
| `AHA_AUTH_ISSUER` | ja | verifisert JWT issuer |
| `AHA_AUTH_AUDIENCE` | ja | forventet JWT audience |
| `AHA_AUTH_JWKS_URL` | ja | HTTPS JWKS-endepunkt |
| `AHA_AUTH_PROVIDER` | nei | canonical provider-navn, standard `supabase` |
| `AHA_AUDIT_HASH_SALT` | ja | minst 32 tegn; hasher principal før HTTP-audit |

Tjenesten starter ikke i production hvis obligatorisk auth/origin/audit-konfigurasjon mangler.

## Databasemiljø

| Variabel | Standard | Formål |
|---|---|---|
| `AHA_DATABASE_ENABLED` | `false` | Må være eksplisitt `true` for å opprette pool. |
| `AHA_DATABASE_URL` | tom | Påkrevd når adapteren er aktivert. |
| `AHA_DATABASE_SSL_MODE` | lokalt `disable` | Production krever `verify-full`. |
| `AHA_DATABASE_POOL_MAX` | `8` | Maks 32. |
| `AHA_DATABASE_CONNECTION_TIMEOUT_MS` | `5000` | Connection fail-fast. |
| `AHA_DATABASE_IDLE_TIMEOUT_MS` | `30000` | Pool idle timeout. |
| `AHA_DATABASE_STATEMENT_TIMEOUT_MS` | `8000` | Transaksjonslokal statement timeout. |
| `AHA_DATABASE_LOCK_TIMEOUT_MS` | `2000` | Transaksjonslokal lock timeout. |

## Importmiljø

| Variabel | Standard | Formål |
|---|---|---|
| `AHA_LOCAL_IMPORT_ENABLED` | `false` | Må være eksplisitt `true` før confirmation/commit. |
| `AHA_IMPORT_CONFIRMATION_SECRET` | tom | Minst 32 tegn når import er aktivert. |
| `AHA_IMPORT_CONFIRMATION_TTL_SECONDS` | `600` | 60–1800 sekunder. |
| `AHA_LOCAL_IMPORT_MAX_OBJECTS` | `25000` | Hard grense for én canonical importplan. |

## Syncmiljø

| Variabel | Standard | Formål |
|---|---|---|
| `AHA_CANONICAL_SYNC_ENABLED` | `false` | Må være eksplisitt aktivert i den kontrollerte production-revisjonen. |
| `AHA_CANONICAL_SYNC_DEFAULT_LIMIT` | `200` | Standard bootstrap/pull-side. |
| `AHA_CANONICAL_SYNC_MAX_LIMIT` | `500` | Deployment-grense, maks 500. |
| `AHA_CANONICAL_SYNC_MAX_PUSH_BYTES` | `262144` | Maks canonical JSON-størrelse før repository-kall. |
| `AHA_CANONICAL_SYNC_PILOT_PROFILE_ID` | tom | Legacy protected pilot anchor. |
| `AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON` | tom | Expanded protected bounded pilot allowlist. |

## Lokal bygg og test

```bash
cd backend/api
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

Repository-wide canonical/frontend regressions kjøres fra rotens Node-testoppsett.

## Auth- og databasegrense

JWT verifiseres med signatur, issuer og audience. Databasekonteksten får bare de avtalte auth-claimene. Før read- og command-session avvises rollen dersom den er superuser, har `BYPASSRLS`, kan anta table-owner, mangler `row_security=on`, eller canonical schema ikke finnes.

En command session betyr ikke generelle table writes. Local import og canonical sync kan bare gå gjennom sine eksplisitte databasekommandoer. Internal helpers og tabeller er ikke runtime-API.

## API-kontrakt

OpenAPI 3.1:

```text
backend/api/contracts/aha-backend-v1.openapi.json
```

Full generell kontrakt:

```text
docs/AHA_BACKEND_API_CONTRACT_V1.md
```

## PostgreSQL-, staging- og production-bevis

Canonical migrasjoner er kjørt i isolert staging, ren PostgreSQL 16 CI og dedikert Azure production. Rehearsals dekker least-privilege runtime-role, RLS, import primitives, bootstrap, pull, push for alle ti objekttyper, idempotency, conflicts, tombstones, private scope og cross-tenant denial.

Production-piloten har i tillegg verifisert immutable deployment, protected allowlist, to profiler, eget private workspace og cross-profile denial. Det resterende closeout-beviset er den eksplisitte real-data round-tripen for begge profiler.

## Neste steg

Ikke bygg mer Azure-infrastruktur og ikke aktiver profil #3 som neste handling.

Neste port er:

```text
begge eksisterende profiler
→ ekte kontrollert AHA-endring
→ first round-trip PASS
→ identical replay PASS
→ stabilitetsobservasjon
```

Først etter dette kan bounded-piloten utvides kontrollert videre.
