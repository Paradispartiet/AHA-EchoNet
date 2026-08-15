# AHA Canonical frontend sync adapter v1

Status: **implemented library boundary, not product-activated**.

`js/ahaCanonicalFrontendSyncAdapter.js` is the explicit frontend bridge between today's local AHA models and canonical sync v1. It performs no network I/O and is not connected to login, auth events, page boot or an automatic timer.

## Boundary

The adapter deliberately reuses `AHALocalAccountImport.buildPlan()` as the single existing mapper from the six supported local storage surfaces into canonical-neutral client models. The sync adapter then owns only:

1. strict projection into the canonical snake_case write payload,
2. personal/private scope enforcement,
3. canonical SHA-256 through `AHACanonicalSyncHash`,
4. `baseRevision` resolution,
5. preparation and explicit enqueue into `AHACanonicalSyncStore`.

This avoids a second copy of the local-model mapping logic.

## Canonical object types

Only these ten types can cross the adapter:

- `conversation`
- `message`
- `source_event`
- `insight`
- `concept_list`
- `concept_list_item`
- `knowledge_path`
- `knowledge_path_step`
- `article`
- `article_reference`

The underlying local mapper only reads `aha_chat_sessions_v1`, `aha_source_events_v1`, `aha_insight_chamber_v1`, `aha_concept_lists_v1`, `aha_paths_v1` and `aha_articles_v1`. Notes, Gallery, Feed/Insta, Groups, Music, Training, Personal AI state, data-intake/workbench state and other local-only surfaces are outside the plan and therefore cannot enter the canonical payload through this adapter.

## Fail-closed rules

- Server-owned identity fields are never copied into payloads.
- Canonical IDs remain text IDs. The adapter does not invent a UUID requirement that the PostgreSQL schema does not have.
- Shared/public lists, paths, insights or articles are rejected; v1 is personal/private only.
- `article_reference.ref_id` and other fields required by the database write helper are validated before enqueue.
- A logical deletion becomes `operation: "delete"`, `payload: null`, and `payloadHash = SHA256(canonical null)`.
- Unknown base revisions default to `0`. A caller can supply a per-object revision map; a wrong/old revision is intentionally surfaced by the server as a conflict instead of being overwritten.
- Bulk preparation validates and hashes the entire plan before the first outbox write, avoiding a half-enqueued plan if a later record fails validation.
- Bulk events receive stable parent-before-child timestamps so later manual push can preserve foreign-key dependency order.

## Explicit APIs

The library exposes pure preparation methods (`toCanonicalPayload`, `prepareRecord`, `preparePlan`, `prepareSnapshot`) and explicit write methods (`enqueueRecord`, `enqueuePlan`, `enqueueSnapshot`). Merely loading the script does nothing.

`enqueueSnapshot` is therefore not a background sync mechanism. Product code must call it as part of an explicit user-initiated flow.

## Still disabled

This PR does **not**:

- call `/v1/sync/bootstrap`, `/v1/sync/pull` or `/v1/sync/push`;
- load the adapter into AHA pages;
- connect Sync Hub/manual sync controls;
- apply pulled server payloads back to local product models;
- resolve conflicts;
- enable `AHA_DATABASE_ENABLED` or `AHA_CANONICAL_SYNC_ENABLED`;
- trigger sync from login.

The next delivery is the explicit manual end-to-end sync runner: outbox → push → bootstrap/delta pull → local apply, with conflict states kept visible rather than auto-merged.
