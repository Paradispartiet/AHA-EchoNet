# AHA IndexedDB Sync Outbox v1

Status: **lokal persistence foundation, ingen nettverk og ingen runtime-aktivering**.

Dette laget er den lokale delen av canonical bidirectional sync. Det erstatter ikke dagens local-first produkt og kaller ikke de eldre modulenes `syncFromDatabase()`-funksjoner.

## Stores

IndexedDB-databasen `aha_canonical_sync_v1` har tre eksplisitte stores:

- `outbox` — brukerinitierte canonical endringer som senere kan pushes eksplisitt;
- `cursors` — monotone pull/push-cursors per device/workspace;
- `tombstones` — slettemarkører som skal hindre at eldre remote data gjenoppliver slettede objekter.

## Canonical allow-list

Bare disse objekttypene kan normaliseres inn i outbox:

- conversation
- message
- source_event
- insight
- concept_list / concept_list_item
- knowledge_path / knowledge_path_step
- article / article_reference

Dette følger den allerede godkjente local-import-grensen.

## Local-only deny-list

Følgende avvises eksplisitt før IndexedDB-write:

- notes
- gallery
- feed
- Insta
- music
- training
- Personal AI state
- workbench state

Ukjente objekttyper avvises også fail-closed.

## Eventkontrakt

En outbox-event har minst:

- `workspaceId`
- `deviceId`
- `objectType`
- `objectId`
- `operation`: `upsert` eller `delete`
- `baseRevision`
- `payloadHash` (SHA-256 hex)
- canonical payload kun for `upsert`

Delete-events kan ikke bære payload. Det reduserer risikoen for at slettet råinnhold blir liggende i outbox.

## Sikkerhetsgrenser

`ahaCanonicalSyncStore.js`:

- har ingen nettverksklient;
- starter aldri ved login/auth/session;
- utfører ingen auto-sync;
- skriver ikke sync-state til localStorage;
- lar cursor aldri gå bakover;
- lar en nyere tombstone vinne over en eldre;
- kopierer payload før den lagres for å unngå mutasjon av runtime-objektet.

## Neste port

Neste PR kobler **den eksisterende `AHAManualSyncAdapter`** til en NestJS push/pull-kontrakt. Den skal fortsatt kreve eksplisitt brukerhandling. Login alene skal fortsatt gi null upload, og de gamle modulspesifikke `syncFromDatabase()`-rutinene skal ikke bli canonical write-path.
