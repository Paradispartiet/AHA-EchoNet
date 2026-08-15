# AHA NestJS API and repository foundation

Status: **separat, fail-closed backendgrunnlag — ikke aktiv AHA-runtime**

Denne tjenesten dekker Backend Foundation PR 4–6: NestJS-grunnmur, verifisert auth, stabil HTTP-kontrakt, PostgreSQL repository-adapter og den første eksplisitte local-first kontoimporten. Den overtar ikke dagens `server.js`/Express-runtime og er ikke koblet til frontend eller Render.

## Dette finnes

- `GET /v1/health` — offentlig liveness og sann foundationstatus
- `GET /v1/auth/context` — beskyttet, verifisert principal i stabil envelope
- `GET /v1/profile` — canonical RLS-bound read contract
- `POST /v1/local-imports/confirmation` — mottar bare lokal preview-hash + tellinger
- `POST /v1/local-imports/commit` — eksplisitt, hash-bundet kontoimport
- global Bearer/JWKS-verifisering
- validert request-ID
- streng global DTO-validering
- eksplisitt CORS-allowlist
- stabil success/error-envelope
- redigert audit-event uten token, body, query, SQL eller rå subject
- opt-in `pg`-adapter bak leverandørnøytral repository-port
- read-only database sessions for reads
- begrenset command session for eksplisitte canonical command functions
- runtime-sperre mot superuser, `BYPASSRLS`, table-owner og manglende `row_security`
- committet npm lockfile v3 og read-only CI med `npm ci`

## Local account import

Importpreview bygges lokalt av:

```text
js/ahaLocalAccountImport.js
```

Første nettverkskall inneholder **ikke** den lokale datasamlingen eller canonical planen. Det inneholder bare:

```text
sourceKind
sourceVersion
payloadHash
planHash
counts
```

Serveren lager et kortlivet HMAC-token bundet til principal, payloadHash, planHash, tellinger og policyversjon. Brukeren skal deretter eksplisitt bekrefte den viste lokale previewen. Først ved `POST /v1/local-imports/commit` sendes den allow-listede canonical planen.

Detaljert kontrakt:

```text
docs/AHA_LOCAL_IMPORT_POSTGRESQL_V1.md
```

## Dette finnes fortsatt ikke

- automatisk kontoimport ved innlogging
- frontendaktivering av local import
- generelle runtime-grants til `aha.*`
- direkte browserwrites til canonical tabeller
- generell bidireksjonal sync
- IndexedDB outbox/device cursor-runtime
- Hasura write path
- LangGraph/LangChain
- Milvus-produksjonsadapter
- Azure-deploy
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

## Importmiljø

| Variabel | Standard | Formål |
|---|---|---|
| `AHA_LOCAL_IMPORT_ENABLED` | `false` | Må være eksplisitt `true` før confirmation/commit. |
| `AHA_IMPORT_CONFIRMATION_SECRET` | tom | Minst 32 tegn når import er aktivert. Brukes bare til kortlivet HMAC. |
| `AHA_IMPORT_CONFIRMATION_TTL_SECONDS` | `600` | Mellom 60 og 1800 sekunder. |
| `AHA_LOCAL_IMPORT_MAX_OBJECTS` | `25000` | Hard grense for ett canonical importplan. |

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

Før både read- og command-session avvises rollen dersom den er superuser, har `BYPASSRLS`, kan anta table-owner, mangler `row_security=on`, eller canonical schema ikke finnes.

En command session betyr ikke generelle table writes. Local import får kun gå gjennom den eksplisitte `aha.commit_local_import_v1(...)`-funksjonen, som er `SECURITY DEFINER`, har låst `search_path` og er revoked fra `PUBLIC`. Et senere staging-/produksjonsoppsett må eksplisitt gi `EXECUTE` kun til den dedikerte NestJS runtime-rollen.

Rå token, e-post, profilnavn, `user_metadata`, `raw_user_meta_data` og klientoppgitte roller brukes ikke som autorisasjonssannhet.

## API-kontrakt

OpenAPI 3.1:

```text
backend/api/contracts/aha-backend-v1.openapi.json
```

Full generell kontrakt og aktiveringsgrenser:

```text
docs/AHA_BACKEND_API_CONTRACT_V1.md
```

## Audit-grense

HTTP-audit-event inneholder bare event/time/request-ID, salted principal hash, method, route-template, status, duration, outcome og safe error code. Local import-prosedyren skriver i tillegg et canonical audit-event med batch-ID, payload-/planhash og tellinger — aldri samtaletekst eller annet råinnhold.

## Neste steg

Etter denne kontrakten er neste migreringsfase IndexedDB/outbox + device cursor og en eksplisitt sync-protokoll. Før det aktiveres må local account import først rehearse mot en ren stagingdatabase og dokumentere null datatap, null duplikater og null local-only-opplasting.
