# AHA Canonical Sync API v1

Status: **implementert, fail-closed og ikke frontend-aktivert**  
Dato: 15. august 2026

## Formål

Canonical Sync v1 gir AHA en eksplisitt, tenant-isolert og offline-vennlig synkgrense mellom lokal IndexedDB og canonical PostgreSQL. Synk er en egen bruker-/produktoperasjon. Innlogging alene starter aldri opplasting, bootstrap, pull eller push.

Canonical PostgreSQL domain-tabeller er system of record for data som brukeren eksplisitt har valgt å synkronisere. `aha.sync_changes` er bare delta-journal, og `aha.sync_conflicts` er bare konfliktledger.

## Opt-in

NestJS-grensen er deaktivert som standard:

```text
AHA_CANONICAL_SYNC_ENABLED=false
```

Konfigurasjon:

| Variabel | Standard | Regel |
|---|---:|---|
| `AHA_CANONICAL_SYNC_ENABLED` | `false` | Må være eksplisitt `true` for at sync-rutene skal kjøre. |
| `AHA_CANONICAL_SYNC_DEFAULT_LIMIT` | `200` | Standard sidegrense. |
| `AHA_CANONICAL_SYNC_MAX_LIMIT` | `500` | 1–500. |
| `AHA_CANONICAL_SYNC_MAX_PUSH_BYTES` | `262144` | 1 KiB–1 MiB; måles på canonical JSON før repository-kall. |

Dette flagget aktiverer bare NestJS-rutene. Det oppretter ikke login-hook, timer, WebSocket, beacon eller automatisk frontend-sync.

## Tillatte objekttyper

Bare disse ti canonical objekttypene er med i v1:

```text
conversation
message
source_event
insight
concept_list
concept_list_item
knowledge_path
knowledge_path_step
article
article_reference
```

Local-only områder er eksplisitt utenfor:

```text
note
gallery_item
feed_post
insta_post
music_item
training_item
personal_ai_state
workbench_state
```

V1 er dessuten begrenset til aktive personlige workspaces og privat/personal scope. Group conversations, delte lister/stier/innsikter og offentlig/workspace-publisering er ikke en skjult sync-kanal.

## Browserlag

Lokal persistence ligger i IndexedDB-databasen:

```text
aha_canonical_sync_v1
```

Stores:

```text
outbox
cursors
tombstones
```

`js/ahaCanonicalSyncStore.js` håndterer kun lokal persistence. Den har ikke nettverkskall.

`js/ahaCanonicalSyncHash.js` definerer den eneste client-side payload-hashkontrakten. Den:

- sorterer objektnøkler rekursivt
- bevarer array-rekkefølge
- serialiserer til deterministisk JSON
- bruker SHA-256 via WebCrypto
- gjør ingen lagring eller nettverk

NestJS bruker samme algoritme. For `delete` er payload canonical JSON `null`, og `payloadHash` er SHA-256 av strengen:

```text
null
```

`js/ahaCanonicalFrontendSyncAdapter.js` implementerer nå den eksplisitte frontend-adapteren, men er fortsatt ikke lastet eller produktaktivert. Den gjenbruker `AHALocalAccountImport.buildPlan()` som eksisterende mapper fra dagens lokale AHA-modeller, projiserer kun de ti canonical typene til serverens snake_case-kontrakt, håndhever privat/personal scope, beregner payload-hash via `AHACanonicalSyncHash` og kan eksplisitt legge ferdig validerte events i `AHACanonicalSyncStore`-outboxen. Den har ingen nettverkskall eller login-hook.

## HTTP-grense

### `GET /v1/sync/bootstrap`

Brukes før første delta-pull på en enhet eller når canonical data finnes fra før journalen, for eksempel etter eksplisitt account import.

Parametre:

```text
workspaceId
limit?
afterKey?
highWatermark?
```

Første side returnerer `highWatermark`. Senere bootstrap-sider må bruke samme watermark. Etter siste side går klienten over til delta-pull fra watermarken.

Tombstones inneholder aldri rå slettet payload.

### `GET /v1/sync/pull`

Parametre:

```text
workspaceId
afterCursor?
limit?
```

Leser monotone journal-deltaer og kollapser flere entries for samme objekt til siste tilstand i vinduet. Tombstones returnerer `payload: null`.

### `POST /v1/sync/push`

Én eksplisitt write-kommando, ikke et generisk CRUD-API.

Top-level request:

```text
workspaceId
deviceId
idempotencyKey
objectType
objectId
operation
baseRevision
payloadHash
payload
```

`operation` er `upsert` eller `delete`.

NestJS gjør før SQL:

1. feature-flag gate
2. DTO- og safe-integer-validering
3. canonical JSON-serialisering
4. payload-størrelseskontroll
5. SHA-256-reberegning
6. konstant-lengde hash-sammenligning

Bare ved bestått kontroll brukes repositoryet.

## Repository-grense

Repositoryet har nøyaktig tre databasekall:

```sql
select aha.bootstrap_sync_snapshot_v1(...)
select aha.pull_sync_changes_v1(...)
select aha.push_sync_change_v1(...)
```

Bootstrap/pull kjører via:

```text
CanonicalDatabaseService.withReadSession(...)
```

Push kjører via:

```text
CanonicalDatabaseService.withCommandSession(...)
```

Ingen controller eller service importerer `pg`. Ingen sync-route har direkte tabell-SQL.

## Konfliktmodell

Serveren bruker monotone `revision`-felt og row lock før revision-beslutning.

Forventede konflikter er eksplisitte dataresultater, ikke automatisk merge:

```text
stale_base_revision
server_tombstone
server_absent
identity_or_unique_conflict
```

API-et returnerer disse i standard success-envelope med:

```text
data.status = "conflict"
```

Dette er bevisst: outbox kan lagre konflikten deterministisk og UI kan senere tilby eksplisitt brukerbeslutning. Ingen last-write-wins eller automatisk tombstone-resurrection brukes.

## Idempotency

`aha.idempotency_keys` binder:

- workspace
- profile
- scope `canonical_sync_push_v1`
- idempotency key
- object/op/base revision
- client payload hash
- databasen sin hash av mottatt JSON

Nøyaktig retry returnerer lagret resultat med `idempotentReplay: true`. Samme key brukt på en annen request avvises.

## Compound objekter

`insight` og `article` består av basisrad + append-only versjonstabell. Sync oppdaterer dem atomisk:

```text
ny version row
→ current_version frem
→ basisrad revision frem
→ journal
→ audit
```

Gamle versjoner overskrives ikke.

## Sikkerhetsgrense

Runtime-rollen skal bare få eksplisitt `EXECUTE` på top-level-funksjonene som deployment faktisk aktiverer. Den skal ikke ha direkte write/read mot:

```text
aha.sync_changes
aha.sync_conflicts
aha.idempotency_keys
canonical domain tables
```

Interne snapshot/write/conflict-helpers har `REVOKE ALL ... FROM PUBLIC` og skal ikke gis direkte til runtime-rollen.

Alle DB-sesjoner beholder:

- verified JWT claims
- `row_security=on`
- superuser/BYPASSRLS/table-owner gate
- statement/lock timeout
- transaction rollback ved feil

## Hva som fortsatt ikke er aktivert

API-et og frontend-adapteren:

- laster ikke sync-script i produkt-UI
- kobler ikke login til sync
- starter ikke background sync
- aktiverer ikke EchoNet/gruppedeling
- bruker ikke legacy `syncFromDatabase()` som canonical sync-vei
- kaller ennå ikke bootstrap/pull/push fra Sync Hub
- applicerer ennå ikke pulled server-state tilbake til lokale modeller
- lager ikke konflikt-UI
- aktiverer ikke runtime environment flagg

Neste frontend-leveranse er derfor den eksplisitte manuelle ende-til-ende-runneren: `IndexedDB outbox → POST /v1/sync/push → bootstrap/delta-pull → lokal apply`. Den skal bare starte etter brukerhandling, og konfliktresultater skal beholdes synlige for eksplisitt valg i stedet for automatisk merge.