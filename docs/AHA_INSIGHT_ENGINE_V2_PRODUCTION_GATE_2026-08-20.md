# AHA Insight Engine V2 — production write gate (2026-08-20)

The nine-block V2 semantic rebuild is complete on `main`. The post-build safety chain now includes:

- PR #840 — trusted legacy knowledge → shared read-only projections
- PR #841 — bounded V2 semantic context transport for Chat
- PR #842 — automatic read-only Chat context only when existing memory is allowed and new saving is disabled
- PR #843 — explicit production write decision gate
- PR #844 — isolated IndexedDB migration rehearsal operator surface

This does **not** open normal V2 persistence.

## Current decision

Authoritative evidence file:

`ops/evidence/aha-v2-production-write-gate-current-v1.json`

Decision produced by `AHAV2ProductionWriteGate.evaluate(...)`:

> **NO_GO**

Current `main` at the evidence cut:

`98b0d56fd718c44d35148699dab507bd48562df5`

Last known Vercel commit with a successful deployment status:

`28dc264076a838f98793010fc8e0375958719a5f`

That successful deployment is the block-9 merge. The later read-only integration, Chat transport/runtime gates, production decision gate and migration-rehearsal surface are present on `main` but have not received a successful Vercel build because the Vercel integration reports `build-rate-limit`.

The connected Vercel tooling available to this operator session is not authorized to the `mats-grans-projects` scope that owns `aha-echonet.vercel.app`, so the deployment cannot be repaired or independently inspected from that connector. Deployment parity therefore remains explicitly false.

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
6. **Explicit production decision gate merged** through PR #843.
7. **Production-like migration rehearsal tooling merged** through PR #844.

Repository tests prove the mechanics of dry-run, staging apply, idempotent replay and rollback. PR #844 additionally provides a real browser IndexedDB staging target and an operator-only rehearsal surface. Neither fact is counted as live migration evidence until that surface is successfully deployed and run against real browser-local Chamber data.

## Migration rehearsal boundary

Live operator surface:

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

## Current blockers

The gate remains NO-GO until all of the following are production-proven:

- deployment commit matches current `main` exactly;
- representative migration dry-run has been run and reviewed on the deployed operator surface;
- bounded IndexedDB staging apply + exact rollback has been proven live;
- at least three live read-only Chat samples have been verified;
- those live samples show zero unintended persistence writes;
- those live samples show zero V2 authority leaks;
- production rollback procedure is ready for the proposed V2 write pilot.

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

The next correct sequence is:

1. restore exact frontend deployment parity with current `main`;
2. run and review the deployed block-9 migration dry-run;
3. perform the deployed IndexedDB staging apply + idempotent replay + exact rollback rehearsal;
4. run live read-only Chat canaries with saving disabled;
5. inspect storage/audit state and confirm no unintended write or authority escalation;
6. establish the rollback contract for the proposed controlled V2 write pilot;
7. refresh the evidence JSON and re-evaluate the production write gate;
8. only after `CONTROLLED_WRITE_PILOT_ELIGIBLE`, propose a separate narrowly scoped write-pilot activation PR.

Until then, the correct status is:

> **V2 build complete. Read-only integration is merged but frontend deployment is behind main. Normal V2 persistence: NO-GO.**
