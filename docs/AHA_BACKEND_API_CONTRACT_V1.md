# AHA Backend API and Repository Contract v1

Status: **fail-closed backend foundation with explicit local-import and personal/private canonical-sync commands; frontend runtime not activated**  
Dato: 15. august 2026  
API-versjon: `0.2.0`

OpenAPI-kontrakten ligger i:

```text
backend/api/contracts/aha-backend-v1.openapi.json
```

Detaljerte underkontrakter:

```text
docs/AHA_LOCAL_IMPORT_POSTGRESQL_V1.md
docs/AHA_CANONICAL_SYNC_API_V1.md
```

## 1. Aktiv status

- `server.js`/Express er fortsatt primær AHA-agent-runtime.
- NestJS er en isolert backend-grense og er ikke koblet automatisk til frontend.
- `AHA_DATABASE_ENABLED=false` som standard.
- `AHA_LOCAL_IMPORT_ENABLED=false` som standard.
- `AHA_CANONICAL_SYNC_ENABLED=false` som standard.
- Login aktiverer aldri import eller sync.
- Det finnes ingen generelle canonical CRUD-ruter.
- Browserroller får ingen generelle canonical table-write-grants.
- Local-only data er ikke en del av import- eller sync-allow-listen.

## 2. Databaseadapter

PostgreSQL-adapteren er opt-in og bruker dedikert runtime-role.

| Variabel | Standard | Regel |
|---|---|---|
| `AHA_DATABASE_ENABLED` | `false` | Må være eksplisitt `true` for å åpne pool. |
| `AHA_DATABASE_URL` | tom | Påkrevd når adapteren er aktivert. |
| `AHA_DATABASE_SSL_MODE` | `disable` lokalt, `verify-full` i production | Production tillater bare `verify-full`. |
| `AHA_DATABASE_POOL_MAX` | `8` | 1–32. |
| `AHA_DATABASE_CONNECTION_TIMEOUT_MS` | `5000` | Fail-fast ved utilgjengelig database. |
| `AHA_DATABASE_IDLE_TIMEOUT_MS` | `30000` | Begrenset idle pool. |
| `AHA_DATABASE_STATEMENT_TIMEOUT_MS` | `8000` | Settes transaksjonslokalt. |
| `AHA_DATABASE_LOCK_TIMEOUT_MS` | `2000` | Settes transaksjonslokalt. |

Connection string, hemmeligheter, driverfeil og databasebrukernavn skal aldri returneres i API-respons eller audit.

## 3. Repository-grense

Domenekode bruker:

```text
DatabaseConnectionProvider
→ DatabaseClient
→ CanonicalDatabaseService
→ domain repository
```

Controllers importerer ikke `pg`.

Read repositories bruker:

```text
withReadSession(...)
```

med `SET TRANSACTION READ ONLY`.

Eksplisitte command repositories bruker:

```text
withCommandSession(...)
```

Denne sessiontypen gir ikke i seg selv table-write. Deployment må ha gitt runtime-rollen EXECUTE på den konkrete command-funksjonen.

## 4. Session- og RLS-grense

Hver session:

1. starter egen transaksjon
2. setter verified JWT claims transaksjonslokalt
3. setter `row_security=on`
4. setter statement- og lock-timeout
5. verifiserer runtime-role og canonical schema
6. kjører repository-operasjonen
7. commit/rollback + release

Claims begrenses til:

```text
sub
aha_provider
iss
aud
```

Runtime-gaten avviser:

- superuser
- `BYPASSRLS`
- rolle som kan anta canonical table owner
- `row_security=off`
- manglende canonical schema

## 5. HTTP-kontrakter

### Public/read

```text
GET /v1/health
GET /v1/auth/context
GET /v1/profile
```

### Eksplisitt account import

```text
POST /v1/local-imports/confirmation
POST /v1/local-imports/commit
```

Confirmation mottar bare hashes og tellinger. Rå canonical importplan lastes først opp etter eksplisitt confirmation og bindes til principal, hash, tellinger og samtykkescope.

### Eksplisitt canonical sync

```text
GET  /v1/sync/bootstrap
GET  /v1/sync/pull
POST /v1/sync/push
```

Sync-rutene er separat opt-in og gjelder bare de ti canonical personal/private objekttypene. De aktiverer ikke gruppe-/EchoNet-deling.

`push` verifiserer deterministic canonical JSON SHA-256 før databasekommandoen. Forventet stale-base/tombstone-konflikt returneres som eksplisitt business-resultat; serveren utfører ingen automatisk konfliktmerge eller tombstone-resurrection.

## 6. Standard response envelope

Success:

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

Ingen stack, SQL, token, DSN, request body eller driverdetaljer skal være med.

## 7. Canonical write-flater

Det finnes ikke generelle produktwrites. De eksplisitte canonical command-flatene er:

```text
aha.commit_local_import_v1(...)
aha.push_sync_change_v1(...)
```

Sync read-flaten er:

```text
aha.bootstrap_sync_snapshot_v1(...)
aha.pull_sync_changes_v1(...)
```

Interne helpers er `SECURITY DEFINER` med låst `search_path` og revoked fra `PUBLIC`. Runtime-rollen skal ikke få direkte EXECUTE på dem.

## 8. Canonical sync SoR og konfliktmodell

Canonical domain-tabeller er system of record.

```text
aha.sync_changes   = delta-journal
aha.sync_conflicts = konfliktledger
```

De er ikke alternative sannhetslagre.

Sync bruker monotone revision-felt og objekt-row-lock før optimistic concurrency-beslutning. `insight` og `article` beholder append-only versjonsrader.

## 9. Staging- og PostgreSQL-bevis

Canonical migrasjoner er kjørt på isolert **AHA Staging** i Supabase, ikke bare statisk analysert.

Verifisert der og i ren PostgreSQL 16 CI:

- canonical schema og RLS
- minst-privilegert runtime-role
- account-import med exact consent/idempotency
- cross-tenant rollback/isolation
- bootstrap av pre-journal/importerte data
- monotone delta-pull
- tombstones uten rå payload
- push for alle ti canonical objekttyper
- exact retry
- stale-base conflict
- anti-resurrection
- append-only insight/article-versjoner
- article-reference revision parity
- private/personal-only scope
- blokkering av group/public/local-only data

Supabase Security Advisor har etter disse leveransene bare tilsiktede `RLS enabled, no policy` INFO-funn på backend-only tabeller. Performance Advisor har ingen nye unindexed-FK-funn; `unused_index` på tom staging behandles ikke som grunnlag for indeksfjerning.

## 10. Supply chain

NestJS bruker committet npm lockfile og `npm ci --ignore-scripts` i CI.

Backend foundation bruker blant annet:

```text
NestJS
pg
jose
class-validator
class-transformer
```

Hasura, LangChain, Milvus og frontend-sync aktiveres ikke av denne API-kontrakten.

## 11. Neste grense

Neste produktport er en eksplisitt frontend sync-adapter som:

1. oversetter eksisterende lokale modeller til canonical snake_case payload
2. beregner hash med `AHACanonicalSyncHash`
3. bruker IndexedDB-outbox/cursor/tombstones
4. kaller NestJS bare når sync eksplisitt er aktivert/utløst
5. lagrer konflikter uten automatisk overskriving

Legacy `syncFromDatabase()` skal ikke gjenbrukes som parallell canonical sync-motor.
