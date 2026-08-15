# AHA Canonical manual sync runner v1

Status: **implemented library boundary, not product-activated**.

This delivery connects the already implemented local canonical adapter, IndexedDB outbox and NestJS sync API into one explicit manual orchestration layer without activating sync from login, page load or background timers.

## Explicit activation boundary

`js/ahaCanonicalManualSyncRunner.js` does nothing when loaded. A run is rejected unless the caller passes:

```text
explicitUserAction: true
workspaceId: <explicit personal workspace id>
```

`workspaceId` is deliberately an explicit activation/staging input in v1. The runner does not guess it from a profile id and does not add a new backend workspace-discovery contract in this PR.

The access token is read only after the explicit run has started, through the isolated API client and `AHAAuth.getSession()` unless a token is supplied directly by the controlled caller.

There is no listener for login, `aha:auth-ready`, token refresh or session restoration.

## Runtime layers

The manual path is split into four libraries:

1. `AHACanonicalFrontendSyncAdapter`
   - existing local AHA models → ten canonical write payloads
   - canonical SHA-256
   - revision-bound outbox events
2. `AHACanonicalSyncStore` v2
   - IndexedDB outbox, cursors and tombstones
   - new `object_states` store for last known server revision/hash and local baseline hash
3. `AHACanonicalSyncApiClient`
   - authenticated `push`, `bootstrap` and `pull`
   - no request on load
4. `AHACanonicalLocalApplyAdapter`
   - canonical server payloads → the same six supported local AHA storage surfaces
   - validates the whole page before writes and rolls back earlier local writes if a later storage write fails

The legacy `AHAManualSyncAdapter` remains unchanged as its existing preview/no-op boundary. Canonical sync does not reuse `syncFromDatabase()`.

## Manual run order

A run performs these phases:

```text
local snapshot
→ compare with object_states
→ enqueue only changed canonical objects
→ POST /v1/sync/push for pending/retry outbox rows
→ first device: GET /v1/sync/bootstrap page(s)
→ immediately GET /v1/sync/pull from bootstrap highWatermark
→ later runs: delta pull only
→ rebaseline local payload hashes
```

Bootstrap follow-up pages must reuse the first page's fixed `highWatermark`. The runner rejects a changing watermark or pagination that makes no progress.

## Why `object_states` is required

The browser must remember, per canonical object:

- last known server `revision`
- last known server payload hash
- local payload hash that corresponds to the synchronized local representation
- deletion state

Without this, every manual run would either repush the full local dataset or fall back to `baseRevision=0`, creating false conflicts after the first successful sync.

Object state is sync metadata and therefore belongs in `aha_canonical_sync_v1` IndexedDB, not in Chat, Lists, Paths, Articles or any other product model.

## Idempotency

IndexedDB outbox identity now binds `baseRevision` as well as operation and payload hash. A second attempt of the same payload against a new base revision therefore cannot collide with an older local event identity.

The HTTP idempotency key is not the potentially long IndexedDB event id. The runner derives a bounded key:

```text
sync:<sha256(device, workspace, object, operation, baseRevision, payloadHash)>
```

This stays inside the NestJS 8–256 character contract while still changing whenever the semantic push request changes.

## Conflict behavior

Expected server conflicts are stored on the outbox row with the local request context and the server result:

- `stale_base_revision`
- `server_tombstone`
- `server_absent`
- `identity_or_unique_conflict`

A conflicted object is excluded from subsequent bootstrap/pull application until a later conflict-resolution UI makes an explicit decision. Server state is retained for comparison, but is never automatically written over the local object.

There is no last-write-wins and no automatic tombstone resurrection.

## Local-only exclusion

Server-to-local apply can write only:

```text
aha_chat_sessions_v1
aha_source_events_v1
aha_insight_chamber_v1
aha_concept_lists_v1
aha_paths_v1
aha_articles_v1
```

The ten canonical types are reconstructed inside those six existing models. Notes, Gallery, Feed/Insta, Groups, Music, Training, Personal AI/workbench state and other local-only data are outside this adapter and are never touched by canonical pull/apply.

## Retry behavior

A retryable transport/API failure marks the current outbox event `retry` and stops the run before bootstrap/pull. A non-retryable request failure is marked `rejected` and also stops the run.

This prevents a failed outbound phase from being followed by a read/apply phase that could make the user's local state harder to reason about.

## Still not activated

This PR deliberately does not:

- load these libraries into the product pages;
- connect the existing Sync Hub button;
- create `sync.html`;
- enable `AHA_DATABASE_ENABLED` or `AHA_CANONICAL_SYNC_ENABLED`;
- grant a production runtime role;
- implement conflict-choice UI;
- run browser → staging NestJS → staging PostgreSQL tests;
- add automatic or login-triggered sync.

The next delivery is the **AHA Staging activation bridge**: load the canonical libraries only in the controlled staging surface, supply the explicit personal `workspaceId`, connect one explicit user control, then execute the real browser → NestJS → PostgreSQL → browser matrix before any production activation.
