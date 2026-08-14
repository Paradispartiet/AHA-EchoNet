# AHA Backend API and Repository Contract v1

Status: **read-only adapterkontrakt — ikke aktiv frontend- eller synk-runtime**  
Dato: 14. august 2026  
API-versjon: `0.2.0`

Denne leveransen er PR 5 i `AHA_BACKEND_FOUNDATION_ROADMAP_V1.md`. Den kobler NestJS-grunnmuren til en eksplisitt PostgreSQL repository-port og definerer de første stabile HTTP-kontraktene uten å aktivere browserbruk, import, sync, EchoNet eller produktwrites.

OpenAPI-kontrakten ligger i:

```text
backend/api/contracts/aha-backend-v1.openapi.json
```

## 1. Aktiv status

Følgende er sant etter denne leveransen:

- `server.js`/Express er fortsatt den aktive AHA-agent-backenden.
- NestJS-tjenesten er ikke koblet fra frontend eller Render.
- `AHA_DATABASE_ENABLED` er `false` som standard.
- Ingen databaseforbindelse åpnes når flagget er av.
- Det finnes ingen canonical write-ruter.
- Det finnes ingen runtime-grants til `aha.*`.
- Migrasjonene er ennå ikke kjørt og testet mot en faktisk stagingdatabase i denne leveransen.

## 2. Databasekonfigurasjon

PostgreSQL-adapteren er opt-in:

| Variabel | Standard | Regel |
|---|---|---|
| `AHA_DATABASE_ENABLED` | `false` | Må være eksplisitt `true` for å åpne pool. |
| `AHA_DATABASE_URL` | tom | Påkrevd bare når adapteren er aktivert. |
| `AHA_DATABASE_SSL_MODE` | `disable` lokalt, `verify-full` i production | Production tillater bare `verify-full`. |
| `AHA_DATABASE_POOL_MAX` | `8` | Mellom 1 og 32. |
| `AHA_DATABASE_CONNECTION_TIMEOUT_MS` | `5000` | Fail-fast ved utilgjengelig database. |
| `AHA_DATABASE_IDLE_TIMEOUT_MS` | `30000` | Begrenset idle pool. |
| `AHA_DATABASE_STATEMENT_TIMEOUT_MS` | `8000` | Settes transaksjonslokalt. |
| `AHA_DATABASE_LOCK_TIMEOUT_MS` | `2000` | Settes transaksjonslokalt. |

Connection string, driverfeil og databasebrukernavn skal aldri logges eller returneres i API-respons.

## 3. Repository-grense

Domenekode bruker en leverandørnøytral port:

```text
DatabaseConnectionProvider
→ DatabaseClient
→ CanonicalDatabaseService.withReadSession(...)
→ domain repository
```

`pg` er bare implementasjonen bak porten. Controllers og domeneobjekter importerer ikke `pg` direkte.

Første repository er:

```text
CurrentProfileRepository
→ PgCurrentProfileRepository
→ GET /v1/profile
```

Profil-read-modelen inneholder bare:

```text
id
displayName
locale
timezone
status
createdAt
updatedAt
revision
```

Den eksponerer ikke auth subject, auth provider, e-post, metadata, secrets eller rå databaseobjekt.

## 4. RLS-bundet read session

Hver canonical repository-lesing kjører i en separat databaseconnection og read-only transaksjon:

```text
BEGIN
SET TRANSACTION READ ONLY
set_config(request.jwt.claims, verified principal, local=true)
set_config(row_security, on, local=true)
set_config(statement_timeout, ...)
set_config(lock_timeout, ...)
validate runtime role and aha schema
run repository SELECT
COMMIT
```

Ved feil:

```text
ROLLBACK
release connection
return safe API error
```

Claims overføres som parameterisert JSON med bare:

```text
sub
aha_provider
iss
aud
```

Rå token og brukerredigerbar metadata går ikke inn i databasekonteksten.

## 5. Runtime-role gate

Før repository-query kjøres, kontrollerer adapteren:

- `row_security` er `on`
- rollen er ikke superuser
- rollen har ikke `BYPASSRLS`
- rollen kan ikke anta eierrollen til `aha.profiles`
- `aha.profiles` finnes
- `aha.schema_versions` finnes

Feil gir fail-closed 503:

```text
DATABASE_UNSAFE_RUNTIME_ROLE
CANONICAL_SCHEMA_NOT_READY
DATABASE_UNAVAILABLE
```

Denne kontrollen erstatter ikke stagingtest av grants, RLS og faktisk rolleoppsett. Den er en runtime-sperre i tillegg.

## 6. HTTP-kontrakter

### `GET /v1/health`

Offentlig liveness. Rapporterer sann status uten å åpne databaseforbindelse:

- service og versjon
- `runtimeActivated: false`
- `existingExpressRuntimePrimary: true`
- om databaseadapter er konfigurert
- siste kjente reachability-/rolesikkerhetsstatus
- om auth er konfigurert

Health viser ikke DSN, rolle, host eller driverfeil.

### `GET /v1/auth/context`

Krever gyldig Bearer JWT. Returnerer bare verifisert immutable principal i standard success envelope.

### `GET /v1/profile`

Krever gyldig Bearer JWT og en sikker canonical databasekonfigurasjon. Leser aktiv profil gjennom `aha.current_profile_id()` og RLS-bound transaction.

Mulige resultater:

- `200` — stabil profil-read-model
- `401 AUTH_REQUIRED`
- `404 PROFILE_NOT_FOUND`
- `503 DATABASE_NOT_CONFIGURED`
- `503 DATABASE_UNAVAILABLE`
- `503 DATABASE_UNSAFE_RUNTIME_ROLE`
- `503 CANONICAL_SCHEMA_NOT_READY`

## 7. Standard response envelope

Beskyttede success-responser:

```json
{
  "data": {},
  "meta": {
    "requestId": "...",
    "apiVersion": "0.2.0"
  }
}
```

Feil:

```json
{
  "error": {
    "code": "...",
    "message": "...",
    "status": 503,
    "requestId": "..."
  },
  "meta": {
    "apiVersion": "0.2.0",
    "timestamp": "..."
  }
}
```

Response envelope skal ikke inneholde stack, SQL, drivercode, connection string, token, query string eller request body.

## 8. Audit

Eksisterende redigerte auditkontrakt beholdes. Repository- og databasefeil reduseres til safe error code. Audit inneholder ikke databasefeilobjektet eller connection details.

Canonical persist til `aha.audit_events` er fortsatt ikke aktivert. Det kommer gjennom en senere backend-only write adapter.

## 9. Dependency- og supply-chain-grense

NestJS-pakken bruker committet npm lockfile og read-only CI med `npm ci --ignore-scripts`.

PR 5 legger til:

```text
pg
@types/pg
```

Ingen ORM, Prisma, TypeORM, LangChain, Milvus eller Hasura legges inn i denne adapterleveransen.

## 10. Tester

Testene dekker uten ekstern database:

- database disabled uten connection attempt
- eksplisitt enable og TLS-regler
- read-only transaction
- parameteriserte verified claims
- statement- og lock-timeout
- safe runtime-role gate
- manglende schema
- rollback og safe error code ved driverfeil
- readiness uten rolle-/connectionlekkasje
- profilrepository uten `select *` eller sensitive felt
- stabile success/error envelopes
- protected profile endpoint
- null produktwrite-ruter
- OpenAPI uten muterende operasjoner

Disse er kontrakt- og adaptertester. Før aktivering kreves fortsatt en ekte PostgreSQL/Supabase stagingtest med migrasjoner, non-owner runtime role, grants og cross-tenant fixtures.

## 11. Neste leveranse

Neste roadmapsteg er:

```text
PR 6 — Lokal import til PostgreSQL
```

Den skal først bygge preview, eksplisitt confirmation, idempotency og import receipts. Den skal ikke gjøre innlogging til automatisk opplasting og skal bevise null import av `local_only` og `deferred` materiale.
