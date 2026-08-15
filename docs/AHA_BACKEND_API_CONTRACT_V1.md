# AHA Backend API and Repository Contract v1

Status: **read-only adapterkontrakt — ikke aktiv frontend- eller synk-runtime; supplert med avgrenset lokal importkommando**  
Dato: 15. august 2026  
API-versjon: `0.2.0`

Denne kontrakten ble etablert i PR 5 i `AHA_BACKEND_FOUNDATION_ROADMAP_V1.md` og er nå supplert av PR 6. PR 5 koblet NestJS-grunnmuren til en eksplisitt PostgreSQL repository-port og definerte de første stabile HTTP-kontraktene. PR 6 legger til én særskilt, samtykkestyrt lokal-importgrense uten å aktivere browserruntime, generell synk, EchoNet eller generelle produktwrites.

OpenAPI-kontrakten ligger i:

```text
backend/api/contracts/aha-backend-v1.openapi.json
```

Den detaljerte importkontrakten ligger i:

```text
docs/AHA_LOCAL_IMPORT_POSTGRESQL_V1.md
```

## 1. Aktiv status

Følgende er sant etter denne leveransen:

- `server.js`/Express er fortsatt den aktive AHA-agent-backenden.
- NestJS-tjenesten er ikke koblet fra frontend eller Render.
- `AHA_DATABASE_ENABLED` er `false` som standard.
- `AHA_LOCAL_IMPORT_ENABLED` er `false` som standard.
- Ingen databaseforbindelse åpnes når databaseflagget er av.
- Det finnes ingen generelle canonical write-ruter.
- Det finnes to avgrensede, autentiserte importkommandoer i den ikke-aktiverte NestJS-tjenesten: confirmation og commit.
- Det finnes ingen runtime-grants til `aha.*` i repo-migrasjonene; deployment må eksplisitt gi den dedikerte runtime-rollen EXECUTE på importkommandoen.
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

Importgrensen har i tillegg egne opt-in-variabler:

| Variabel | Standard | Regel |
|---|---|---|
| `AHA_LOCAL_IMPORT_ENABLED` | `false` | Importkommandoene avviser kall når flagget er av. |
| `AHA_IMPORT_CONFIRMATION_SECRET` | tom | Minst 32 tegn når import er aktivert. |
| `AHA_IMPORT_CONFIRMATION_TTL_SECONDS` | `600` | Mellom 60 og 1800 sekunder. |
| `AHA_LOCAL_IMPORT_MAX_OBJECTS` | `25000` | Hard grense; maksimalt 100000. |

Connection string, driverfeil, hemmeligheter og databasebrukernavn skal aldri logges eller returneres i API-respons.

## 3. Repository- og kommandogrense

Domenekode bruker en leverandørnøytral port for lesing:

```text
DatabaseConnectionProvider
→ DatabaseClient
→ CanonicalDatabaseService.withReadSession(...)
→ domain repository
```

`pg` er bare implementasjonen bak porten. Controllers og domeneobjekter importerer ikke `pg` direkte.

Første leserepository er:

```text
CurrentProfileRepository
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

PR 6 legger til en separat, smal kommandogrense:

```text
LocalImportController
→ LocalImportService
→ LocalImportRepository
→ CanonicalDatabaseService.withCommandSession(...)
→ aha.commit_local_import_v1(...)
```

`withCommandSession` gir ikke generelle tabellwrites. Den finnes bare for eksplisitt granted canonical command-funksjoner og beholder samme JWT-, RLS-, timeout- og runtime-role-sperrer som read-sessionen.

## 4. RLS-bundne sessions

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

Den avgrensede importkommandoen bruker samme session-grense uten `SET TRANSACTION READ ONLY`, fordi selve write-operasjonen ligger i den ene eksplisitt tillatte databasefunksjonen. Browserroller får fortsatt ingen generelle tabellgrants eller write-policyer.

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

Før repository-query eller canonical command kjøres, kontrollerer adapteren:

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

### `POST /v1/local-imports/confirmation`

Krever gyldig Bearer JWT og eksplisitt aktivert lokal import. Endepunktet mottar bare:

- source kind/version
- payload hash
- plan hash
- objekttellinger

Det mottar **ikke** samtaletekst, innsiktstekst, artikler eller andre importobjekter. Responsen inneholder et kortlivet, HMAC-bundet confirmation token som er bundet til verified principal, hashes, tellinger, policyversjon og personlig workspace-scope.

### `POST /v1/local-imports/commit`

Krever samme verified principal, et gyldig uforløpt confirmation token og nøyaktig samme planhash/tellinger som confirmation. Serveren revaliderer planen og beregner planhashen på nytt før databasekommandoen kan kjøre.

Committen bruker:

- eksakt `account_import`-samtykkescope
- idempotency key
- payload- og planhash
- én `SECURITY DEFINER`-kommando med låst search path
- per-objekt import receipts
- full transaksjonsrollback ved kollisjon eller ugyldig foreldreobjekt

Local-only/deferred områder er ikke del av den tillatte planen.

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

## 8. Audit og samtykke

Eksisterende redigerte auditkontrakt beholdes. Repository- og databasefeil reduseres til safe error code. Audit inneholder ikke databasefeilobjektet eller connection details.

Canonical persist til `aha.audit_events` er fortsatt ikke aktivert som generell audit-writeadapter.

Lokal import skriver derimot en eksplisitt `consent_receipt` inne i samme transaksjon som importbatchen. Receipt-scope bindes til personlig workspace, source kind og payload hash. En identisk payload eller idempotency key kan replayes uten å materialisere objektene på nytt.

## 9. Dependency- og supply-chain-grense

NestJS-pakken bruker committet npm lockfile og read-only CI med `npm ci --ignore-scripts`.

Repositorylaget bruker:

```text
pg
@types/pg
```

Ingen ORM, Prisma, TypeORM, LangChain, Milvus eller Hasura legges inn i denne adapter-/importleveransen.

## 10. Tester

Testene dekker uten ekstern database:

- database disabled uten connection attempt
- eksplisitt enable og TLS-regler
- read-only transaction for repositorylesing
- avgrenset command session uten superuser/`BYPASSRLS`/table-owner
- parameteriserte verified claims
- statement- og lock-timeout
- safe runtime-role gate
- manglende schema
- rollback og safe error code ved driverfeil
- readiness uten rolle-/connectionlekkasje
- profilrepository uten `select *` eller sensitive felt
- stabile success/error envelopes
- protected profile endpoint
- ingen generelle produktwrite-ruter
- bare de to eksplisitte lokal-import-POST-operasjonene i OpenAPI
- lokal preview uten nettverk
- null local-only/deferred innhold i canonical-planen
- confirmation uten rå importdata
- planhash-binding og endringsavvisning etter preview
- idempotency- og receipt-kontrakt
- locked-search-path SHA-256 uten avhengighet av `public`/extension-schema

Disse er kontrakt-, adapter- og statiske migrasjonstester. Før **runtime-aktivering** kreves fortsatt en ekte PostgreSQL/Supabase stagingtest med alle migrasjoner, non-owner runtime role, eksplisitt EXECUTE-grant og cross-tenant fixtures.

## 11. PR 6-status og neste port

PR 6 — lokal import til PostgreSQL — er implementert i kode med:

```text
lokal preview
→ hash/tellinger
→ eksplisitt confirmation
→ server-side revalidering
→ idempotent canonical commit
→ samtykke- og objektkvitteringer
```

Dette betyr ikke at import er produksjonsaktivert. Neste port er å kjøre migrasjonene mot en isolert stagingdatabase og bevise runtime-grants, RLS, rollback, retry og cross-tenant-isolasjon med den faktiske database-rollen før `AHA_DATABASE_ENABLED` og `AHA_LOCAL_IMPORT_ENABLED` kan slås på i en deploy.
