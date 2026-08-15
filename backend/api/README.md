# AHA NestJS API and repository foundation

Status: **separat, fail-closed backendgrunnlag — ikke aktiv AHA-runtime**

Denne tjenesten inneholder NestJS-grunnmur, verifisert auth, canonical PostgreSQL repository-adapter, eksplisitt local-first kontoimport og en eksplisitt personal/private canonical sync-grense. Den overtar ikke dagens `server.js`/Express-runtime og er ikke automatisk koblet til frontend eller deploy.

## Dette finnes

- `GET /v1/health` — offentlig liveness og sann foundationstatus
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
- opt-in `pg`-adapter bak leverandørnøytral repository-port
- read-only DB-session for reads
- command session kun for eksplisitte canonical command functions
- runtime-sperre mot superuser, `BYPASSRLS`, table-owner og `row_security=off`
- committet npm lockfile og read-only `npm ci` i CI

## Local account import

Importpreview bygges lokalt av:

```text
js/ahaLocalAccountImport.js
```

Første nettverkskall inneholder ikke lokal datasamling eller canonical plan, bare source kind/version, hashes og tellinger. Først etter eksplisitt brukerbekreftelse sendes den allow-listede canonical planen til commit.

Detaljert kontrakt:

```text
docs/AHA_LOCAL_IMPORT_POSTGRESQL_V1.md
```

## Canonical sync

Lokal persistence ligger i:

```text
js/ahaCanonicalSyncStore.js
```

med IndexedDB-stores for outbox, cursors og tombstones.

Deterministisk browser-hash ligger i:

```text
js/ahaCanonicalSyncHash.js
```

NestJS speiler nøyaktig samme canonical JSON + SHA-256-kontrakt før push får nå repositoryet.

Sync er begrenset til ti canonical personal/private objekttyper og aktiverer ikke group/EchoNet/public sharing. Local-only Notes, Gallery, Feed, Insta, Music, Training, Personal AI og workbench-state er utenfor kontrakten.

Detaljert kontrakt:

```text
docs/AHA_CANONICAL_SYNC_API_V1.md
```

## Dette finnes fortsatt ikke

- automatisk kontoimport ved innlogging
- automatisk sync ved innlogging
- frontendaktivering av local import eller canonical sync
- background sync/timer/WebSocket/beacon
- generelle runtime-grants til `aha.*`
- direkte browserwrites til canonical tabeller
- gjenbruk av legacy `syncFromDatabase()` som canonical sync-motor
- automatisk konfliktmerge eller tombstone-resurrection
- Hasura write path
- LangGraph/LangChain worker-runtime
- pgvector retrieval-runtime
- Azure deploy
- EchoNet-deling
- automatisk ekstern publisering

## Health-grensen

Health åpner ikke en databaseconnection. Den rapporterer siste kjente adapterstatus og viser ikke DSN, databasebruker, host eller driverfeil.

## Applikasjonsmiljø

| Variabel | Påkrevd i production | Formål |
|---|---:|---|
| `NODE_ENV` | ja | `development`, `test` eller `production` |
| `PORT` | nei | standard `3100` |
| `AHA_API_VERSION` | nei | serviceversjon, standard `0.2.0` |
| `AHA_ALLOWED_ORIGINS` | ja | kommaseparert liste uten wildcard |
| `AHA_AUTH_ISSUER` | ja | verifisert JWT issuer |
| `AHA_AUTH_AUDIENCE` | ja | forventet JWT audience |
| `AHA_AUTH_JWKS_URL` | ja | HTTPS JWKS-endepunkt |
| `AHA_AUTH_PROVIDER` | nei | canonical provider-navn, standard `supabase` |
| `AHA_AUDIT_HASH_SALT` | ja | minst 32 tegn; hasher principal før HTTP-audit |

Tjenesten starter ikke i production hvis auth, origins eller audit-salt mangler.

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
| `AHA_CANONICAL_SYNC_ENABLED` | `false` | Må være eksplisitt `true` før bootstrap/pull/push. |
| `AHA_CANONICAL_SYNC_DEFAULT_LIMIT` | `200` | Standard bootstrap/pull-side. |
| `AHA_CANONICAL_SYNC_MAX_LIMIT` | `500` | Deployment-grense, maks 500. |
| `AHA_CANONICAL_SYNC_MAX_PUSH_BYTES` | `262144` | Maks canonical JSON-størrelse før repository-kall. |

## Lokal bygg og test

```bash
cd backend/api
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

## Auth- og databasegrense

JWT verifiseres med signatur, issuer og audience. Databasekonteksten får bare:

```text
sub
aha_provider
iss
aud
```

Før read- og command-session avvises rollen dersom den er superuser, har `BYPASSRLS`, kan anta table-owner, mangler `row_security=on`, eller canonical schema ikke finnes.

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

## PostgreSQL- og stagingbevis

Canonical migrasjoner er kjørt på isolert AHA Staging og i ren PostgreSQL 16 CI. Rehearsalen dekker minst-privilegert runtime-role, RLS, import, bootstrap, pull, push for alle ti objekttyper, idempotency, conflicts, tombstones, append-only insight/article-versjoner, private scope og cross-tenant denial.

## Neste steg

Neste port er en eksplisitt frontend-adapter som oversetter eksisterende lokale modeller til canonical snake_case payload, beregner hash med `AHACanonicalSyncHash`, bruker IndexedDB-outbox/cursors/tombstones og kaller API bare etter eksplisitt sync-aktivering/brukerhandling. Legacy `syncFromDatabase()` skal ikke kobles inn som en parallell motor.
