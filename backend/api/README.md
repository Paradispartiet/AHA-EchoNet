# AHA NestJS API and repository foundation

Status: **separat, fail-closed backendgrunnlag — ikke aktiv AHA-runtime**

Denne tjenesten dekker PR 4–5 i `AHA_BACKEND_FOUNDATION_ROADMAP_V1.md`: NestJS-grunnmur, verifisert auth, stabil HTTP-kontrakt og første PostgreSQL repository-adapter. Den overtar ikke dagens `server.js`/Express-runtime og er ikke koblet fra frontend eller Render.

## Dette finnes

- `GET /v1/health` — offentlig liveness og sann foundationstatus
- `GET /v1/auth/context` — beskyttet, verifisert principal i stabil envelope
- `GET /v1/profile` — første canonical RLS-bound read contract
- global Bearer/JWKS-verifisering
- validert request-ID
- streng global DTO-validering
- eksplisitt CORS-allowlist
- stabil success/error-envelope
- redigert audit-event uten token, body, query, SQL eller rå subject
- opt-in `pg`-adapter bak leverandørnøytral repository-port
- read-only transaksjon med transaksjonslokale JWT claims og RLS-sikkerhetskontroll
- committet npm lockfile v3 og read-only CI med `npm ci`

## Dette finnes ikke

- runtime-grants til `aha.*`
- canonical PostgreSQL-writes
- kontoimport
- bidireksjonal sync
- produktmutasjoner
- Hasura
- LangGraph/LangChain
- Milvus
- Azure-deploy
- frontendkobling
- EchoNet-deling
- ekstern publisering

## Health-grensen

Health åpner ikke en databaseconnection. Den rapporterer siste kjente adapterstatus:

```json
{
  "runtimeActivated": false,
  "existingExpressRuntimePrimary": true,
  "database": {
    "configured": false,
    "connected": false,
    "status": "disabled",
    "safeRuntimeRole": false,
    "canonicalSchema": "not_connected"
  }
}
```

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
| `AHA_AUDIT_HASH_SALT` | ja | minst 32 tegn; hasher principal før audit |

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

Connection string og driverfeil logges ikke.

## Lokal bygg og test

```bash
cd backend/api
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

`package-lock.json` skal oppdateres sammen med enhver tilsiktet dependency-endring. CI har bare `contents: read`.

## Auth- og databasegrense

JWT verifiseres med signatur, issuer og audience. Databasekonteksten får bare:

```text
sub
aha_provider
iss
aud
```

Hver repository-lesing kjører i read-only transaksjon. Før SELECT avvises rollen dersom den er superuser, har `BYPASSRLS`, kan anta tabell-owner, mangler `row_security=on`, eller canonical schema ikke finnes.

Rå token, e-post, profilnavn, `user_metadata`, `raw_user_meta_data` og klientoppgitte roller brukes ikke som autorisasjonssannhet.

## API-kontrakt

OpenAPI 3.1:

```text
backend/api/contracts/aha-backend-v1.openapi.json
```

Full kontrakt og aktiveringsgrenser:

```text
docs/AHA_BACKEND_API_CONTRACT_V1.md
```

## Audit-grense

Audit-event inneholder bare event/time/request-ID, salted principal hash, method, route-template, status, duration, outcome og safe error code. Canonical persist til `aha.audit_events` er fortsatt ikke aktivert.

## Neste steg

Neste leveranse er eksplisitt lokal import til PostgreSQL med preview, confirmation, idempotency og import receipts. Den skal ikke gjøre innlogging til opplastingssamtykke og skal ikke importere `local_only` eller `deferred` materiale.
