# AHA Insight Engine V2 — production write gate (2026-08-20)

The nine-block V2 semantic rebuild is complete on `main`. The post-build safety chain now includes:

- PR #840 — trusted legacy knowledge → shared read-only projections
- PR #841 — bounded V2 semantic context transport for Chat
- PR #842 — automatic read-only Chat context only when existing memory is allowed and new saving is disabled
- PR #843 — explicit production write decision gate
- PR #844 — isolated IndexedDB migration rehearsal operator surface
- PR #846 — exact one-record controlled-write rollback readiness contract

This does **not** open normal V2 persistence.

## Current decision

Authoritative evidence file:

`ops/evidence/aha-v2-production-write-gate-current-v1.json`

Decision produced by `AHAV2ProductionWriteGate.evaluate(...)`:

> **NO_GO**

Current production evidence cut:

```text
main commit:          196e94ef8135a657a3e2588672c80b304dc2b647
GitHub Pages commit:  196e94ef8135a657a3e2588672c80b304dc2b647
Pages status:         built
runtime assets:       9/9 SHA-256 match
```

Deployment parity is therefore proven for the AHA frontend production origin.

## Frontend production proof authority

For AHA, the production frontend proof authority is the configured GitHub Pages origin:

`https://paradispartiet.github.io/AHA-EchoNet`

This is the same proof authority used by the earlier controlled activation production proof. Vercel build status is not authoritative for this gate.

Temporary PR #847 reproduced that proof pattern and was closed without merge. Its workflow queried the GitHub Pages API and fetched the deployed runtime assets directly.

Permanent probe identity:

```text
workflow run:    32391781228
job:             96499363224
artifact id:     9415099667
artifact digest: sha256:b00d7a6a3d58d2999f6a065529670da374a57336b1601b45f48e3027f1d80394
Pages commit:    196e94ef8135a657a3e2588672c80b304dc2b647
Pages status:    built
probe attempt:   1
```

The following production assets matched the same commit byte-for-byte by SHA-256:

```text
chat.html
js/ahaV2ProductIntegrationGate.js
js/ahaV2ChatReadOnlyContext.js
js/ahaChatAgentRuntime.js
js/ahaV2ProductionWriteGate.js
js/ahaV2BackfillStagingStore.js
js/ahaV2ProductionMigrationRehearsal.js
v2-production-migration-rehearsal.html
js/ahaV2ControlledWritePilotRollback.js
```

The temporary workflow was never merged to `main`.

Vercel may still report `build-rate-limit`; that is a separate hosting status and does not override the verified GitHub Pages production state.

## Separate canonical production platform

AHA's canonical backend production platform is Azure Container Apps with dedicated PostgreSQL and a bounded manual two-profile canonical-sync pilot. That platform already has migration, restore, observability and rollback controls.

This is a separate production boundary from Insight Engine V2 semantic persistence. A green canonical-sync pilot does **not** imply that normal V2 semantic Chat persistence or automatic backfill is enabled.

## Already proven

The V2 production gate currently accepts these as proven:

1. **V2 build 9/9 complete.**
2. **Insight Synthesis production quality:** two production rounds, all reviewed cases valid, minimum V2 semantic-review F1 = `1.0`.
3. **Trusted read-only integration merged** through PR #840.
4. **Read-only Chat transport merged** through PR #841.
5. **Read-only Chat runtime gate merged** through PR #842.
6. **Exact production frontend deployment parity** at GitHub Pages.
7. **Production rollback readiness** for the only permitted future controlled pilot shape.

## Production rollback readiness

PR #846 does not introduce a new rollback mechanism. It locks any future write pilot to the already production-proven `AHAInsightActivationV2` flow.

Permanent live rollback proof:

```text
workflow run:    32369823544
workflow job:    96427555521
artifact id:     9406690486
artifact digest: sha256:711124204415c7082987c79cd99e64000a68a001ff0d5db3d990272b2a12e305
production main: ed1db452088232146702fabdf9f9543bb9f0d959
frontend:        https://paradispartiet.github.io/AHA-EchoNet
rollback status: rolled_back
repository calls: 0 save / 0 load
```

The proof added exactly one signed local V2 Chamber record next to a sentinel record, blocked both sync directions before repository access, then removed only the V2 record through signature-bound rollback and preserved the sentinel.

The only allowed future pilot scope is:

```text
single_local_chamber_insight
max records created = 1
batch activation = false
automatic activation = false
backend sync = false
backend persistence = false
Meta write = false
remote write = false
normal Chat persistence = false
automatic backfill = false
projection-store write = false
```

Rollback readiness is only a prerequisite. It does not activate a pilot.

## Migration rehearsal boundary

The production-deployed operator surface is:

`v2-production-migration-rehearsal.html?ahaV2ProductionRehearsal=1`

It uses the separate IndexedDB database:

`aha_v2_backfill_staging_v1`

Required sequence:

1. read existing Chamber insights only;
2. run zero-write dry-run;
3. operator reviews redacted counts;
4. exact confirmation token is entered;
5. apply only to `v2_backfill_staging`;
6. identical second apply must produce zero writes;
7. exact rollback must return staging count to zero;
8. evidence must contain no raw Chamber payload or raw insight text.

The page never writes Chamber, Lists, Paths, Mindmap, Meta, canonical storage or remote storage. It performs no network request.

The operator surface is deployed and hash-verified, but it has not yet been executed against real browser-local Chamber data. Therefore both migration production-proof fields remain false.

## Current blockers

The gate remains NO-GO until all of the following are production-proven:

- representative migration dry-run has been run and reviewed on the deployed operator surface;
- bounded IndexedDB staging apply + idempotent replay + exact rollback has been proven live;
- at least three live read-only Chat samples have been verified;
- those live samples show zero unintended persistence writes;
- those live samples show zero V2 authority leaks.

Deployment parity and production rollback readiness are no longer blockers.

## What a fully green gate means

A fully green `AHAV2ProductionWriteGate` decision is:

`CONTROLLED_WRITE_PILOT_ELIGIBLE`

That wording is deliberate. Even a green gate does **not** by itself activate:

- normal Chat V2 persistence;
- automatic legacy backfill;
- automatic Chamber activation;
- broad canonical writes;
- projection writes into Lists, Paths or Mindmaps;
- Meta write authority.

A separate explicit activation PR is still required for a narrowly scoped controlled write pilot.

## Runtime state after PR #842

V2 semantic context may enter Chat only when all three runtime conditions are true:

```text
useExistingMemory == true
saveNewInsights == false
memory_context.used == true
```

The V2 context is built only from the already-selected Memory Relevance Gate insights. It performs no additional Chamber load for V2. If V2 dependencies fail to load or no selected insight is V2 trust-ready, the V2 context is omitted and normal Chat continues without it.

## Next production work

The remaining correct sequence is:

1. run and review the deployed block-9 migration dry-run;
2. perform the deployed IndexedDB staging apply + idempotent replay + exact rollback rehearsal;
3. run at least three live read-only Chat canaries with saving disabled;
4. inspect storage/audit state and confirm no unintended write or authority escalation;
5. refresh the evidence JSON and re-evaluate the production write gate;
6. only after `CONTROLLED_WRITE_PILOT_ELIGIBLE`, propose a separate narrowly scoped write-pilot activation PR.

Until then, the correct status is:

> **V2 build complete. Read-only runtime is deployed. Deployment parity and rollback readiness are proven. Migration rehearsal and live Chat canaries remain. Normal V2 persistence: NO-GO.**
