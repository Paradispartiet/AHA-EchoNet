# AHA Insight Engine V2 — controlled write pilot rollback boundary

Date: 2026-08-20

## Purpose

This document defines rollback readiness for a **future, separately activated** V2 controlled write pilot.

It does not activate a pilot. It does not open normal Chat V2 persistence.

The only pilot shape currently allowed by the readiness contract is the already production-proven Phase 5 activation boundary:

```text
one eligible V2 candidate
→ explicit review approval
→ local review queue
→ separate explicit canonical approval
→ exactly one local-only Chamber record
→ optional separate explicit rollback approval
→ exact signature-bound removal of that one record
```

Any broader scope fails closed.

## Reused production proof

Rollback readiness reuses the permanent live proof under:

```text
tests/fixtures/semantic-live-reviewed-v2/controlled-activation-production-v1/
```

The locked proof identity is:

```text
workflow run:      32369823544
workflow job:      96427555521
artifact id:       9406690486
artifact digest:   sha256:711124204415c7082987c79cd99e64000a68a001ff0d5db3d990272b2a12e305
production main:   ed1db452088232146702fabdf9f9543bb9f0d959
frontend origin:   https://paradispartiet.github.io/AHA-EchoNet
```

The live proof established:

- the deployed GitHub Pages assets matched merged production assets;
- review approval did not change the Chamber;
- canonical approval added exactly one signed V2 insight next to an unrelated sentinel insight;
- both Chamber sync push and pull stopped before repository access;
- repository save calls = 0;
- repository load calls = 0;
- exact rollback returned status `rolled_back`;
- rollback removed only the V2 record;
- the unrelated sentinel remained;
- the activation audit chain remained valid.

## Exact rollback binding

`AHAInsightActivationV2` permits rollback only when the current record still matches:

```text
canonical_insight_id
review_id
canonical_signature
recalculated canonical record signature
```

A changed canonical record fails with `activation_rollback_target_modified` rather than being overwritten or removed.

A changed review/canonical binding fails with `activation_rollback_binding_changed` or `activation_rollback_target_mismatch`.

Rollback itself requires a fresh, single-use one-time approval challenge.

## Allowed future pilot

The readiness contract in:

```text
js/ahaV2ControlledWritePilotRollback.js
```

permits only:

```text
scope = single_local_chamber_insight
max_chamber_records_created = 1
batch_activation = false
automatic_activation = false
backend_sync_allowed = false
backend_persistent_write_allowed = false
meta_write_allowed = false
remote_write_allowed = false
normal_chat_persistence_allowed = false
automatic_backfill_allowed = false
projection_store_write_allowed = false
```

The following approvals are mandatory and distinct:

1. review approval;
2. canonical approval;
3. rollback approval if rollback is needed.

## Readiness versus activation

The readiness result may be:

```text
production_rollback_ready = true
```

while still requiring:

```text
eligible_for_controlled_write_pilot_activation = false
```

This is intentional. Rollback readiness is one prerequisite in the separate production-write gate. It is not write authority.

A future activation still requires:

1. all remaining `AHAV2ProductionWriteGate` requirements to pass;
2. decision `CONTROLLED_WRITE_PILOT_ELIGIBLE`;
3. a separate explicit activation PR;
4. no widening of the one-record rollback contract.

## Permanent evidence

Machine-readable readiness evidence:

```text
ops/evidence/aha-v2-controlled-write-pilot-rollback-v1.json
```

Primary regressions:

```text
tests/aha-v2-controlled-write-pilot-rollback.test.cjs
tests/aha-insight-activation-v2.test.cjs
tests/aha-insight-activation-production-proof-v2.test.cjs
tests/aha-chamber-sync-insight-activation-v2.test.cjs
```

## Authorities that remain closed

Rollback readiness does not open:

- normal Chat V2 persistence;
- automatic activation;
- automatic legacy backfill;
- batch promotion;
- backend Chamber persistence of V2 records;
- Meta writes;
- projection-store writes;
- broad canonical writes;
- remote writes.
