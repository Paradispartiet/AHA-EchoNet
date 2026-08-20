# AHA Insight Engine V2 — production write gate (2026-08-20)

The nine-block V2 semantic rebuild is complete on `main`, and the first three post-build read-only integration gates are merged:

- PR #840 — trusted legacy knowledge → shared read-only projections
- PR #841 — bounded V2 semantic context transport for Chat
- PR #842 — automatic read-only Chat context only when existing memory is allowed and new saving is disabled

This does **not** open normal V2 persistence.

## Current decision

Authoritative evidence file:

`ops/evidence/aha-v2-production-write-gate-current-v1.json`

Decision produced by `AHAV2ProductionWriteGate.evaluate(...)`:

> **NO_GO**

Current `main` at the evidence cut:

`a1b83920f1852999573d18cea8cc63d31e446609`

The repository/build side is green, but the production evidence side is intentionally incomplete.

## Already proven

The production gate currently accepts these as proven:

1. **V2 build 9/9 complete.**
2. **Insight Synthesis production quality:** two production rounds, all reviewed cases valid, minimum V2 semantic-review F1 = `1.0`.
3. **Trusted read-only integration merged** through PR #840.
4. **Read-only Chat transport merged** through PR #841.
5. **Read-only Chat runtime gate merged** through PR #842.

Repository tests also prove the *semantics* of block-9 dry-run, staging apply, idempotency and rollback. Those tests are not counted as a production migration rehearsal.

## Current blockers

The gate remains NO-GO until all of the following are production-proven:

- deployment commit matches current `main` exactly;
- representative migration dry-run has been reviewed;
- bounded staging apply + exact rollback has been proven against the production-like target;
- at least three live read-only Chat samples have been verified;
- those live samples show zero unintended persistence writes;
- those live samples show zero V2 authority leaks;
- production rollback procedure is ready for the proposed pilot.

The current Vercel PR status is a build-rate-limit/quota condition. Therefore this document does not infer deploy parity from CI or from merge state.

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

## Why this boundary exists

The V2 architecture now has multiple independent safety layers:

```text
source-bound semantic synthesis
→ quality review
→ equivalence/resonance classifier
→ saturation / quality-aware Meta
→ shared projections
→ controlled legacy migration
→ trusted-only read-only integration
→ bounded Chat context
→ runtime kill switches
→ production write gate
→ separate activation PR
```

The production write gate prevents a green unit/regression suite from being mistaken for evidence that live persistence is safe.

## Runtime state after PR #842

V2 semantic context may enter Chat only when all three runtime conditions are true:

```text
useExistingMemory == true
saveNewInsights == false
memory_context.used == true
```

The V2 context is built only from the already-selected Memory Relevance Gate insights. It performs no additional Chamber load for V2. If V2 dependencies fail to load or no selected insight is V2 trust-ready, the V2 context is omitted and normal Chat continues without it.

## Next production work

The next correct work is evidence collection, in this order:

1. prove which commit is actually deployed;
2. run and review representative block-9 migration dry-run;
3. perform bounded staging apply + exact rollback rehearsal;
4. run live read-only Chat canaries with saving disabled;
5. inspect storage/audit state and confirm no unintended write or authority escalation;
6. refresh the evidence JSON and re-evaluate the production write gate;
7. only after `CONTROLLED_WRITE_PILOT_ELIGIBLE`, propose a separate narrowly scoped write-pilot activation PR.

Until then, the correct status is:

> **V2 build complete. Read-only Chat integration active behind kill switches. Normal V2 persistence: NO-GO.**
