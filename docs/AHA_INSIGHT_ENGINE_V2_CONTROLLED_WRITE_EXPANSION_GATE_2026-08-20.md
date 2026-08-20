# AHA Insight Engine V2 — controlled write expansion gate

Date: 2026-08-20

## Purpose

The production-verified **one-record local Chamber pilot remains the active write boundary**. A successful one-record pilot is not authority to widen persistence.

`AHAV2ControlledWriteExpansionGate` is a pure decision layer. It cannot execute writes, prepare activation, approve activation, change the existing one-record budget, or open normal Chat persistence.

## Current decision

> **NO_GO**

Current machine-readable evidence:

`ops/evidence/aha-v2-controlled-write-expansion-gate-current-v1.json`

Current result:

```text
required checks: 12
passed: 6
failed: 6
decision: NO_GO
eligible_for_bounded_expansion_pilot = false
eligible_for_expansion_activation    = false
eligible_for_normal_chat_persistence = false
current_one_record_pilot_max_records = 1
current_one_record_pilot_budget_may_change = false
expansion_runtime_open               = false
```

The six current blockers are:

```text
expansion_no_write_observation_missing
expansion_production_canary_proof_missing
idempotent_multi_record_replay_proof_missing
multi_record_rollback_proof_missing
multi_record_state_drift_proof_missing
partial_failure_compensation_proof_missing
```

## What changed after PR #861

PR #861 permanentized the successful-looking temporary #860 proof and moved the decision to `BOUNDED_EXPANSION_PILOT_ELIGIBLE`.

Subsequent inline review found five material gaps. The prior 12/12 result is therefore **invalidated as current gate authority**. It remains historical evidence only.

The review findings were:

1. **Scope binding was not immutable enough.** A plan could alter the scope while retaining a syntactically valid SHA-256-looking fingerprint.
2. **Replay failure could strand the first apply.** If the second apply failed, the first successful apply was not guaranteed to be rolled back.
3. **Rollback removal failure could leave partial deletion.** If one `remove` succeeded and a later `remove` failed, the rollback path did not compensate the already-removed record.
4. **IndexedDB proof compared counts rather than contents.** An in-place overwrite could pass while persistent data had changed.
5. **The drift canary altered the first rollback target.** That did not prove that preflight prevents deletion of an earlier record when drift exists on a later target.

These findings affect the proposed two-record expansion only. They do **not** invalidate the already production-verified one-record pilot.

## Exact selected scope

The candidate scope remains:

`ops/contracts/aha-v2-controlled-write-expansion-scope-two-record-v1.json`

```text
scope_id = bounded_local_chamber_two_record_candidate_v1
scope_kind = bounded_local_chamber_multi_record
max_chamber_records_created = 2
activation_mode = manual_sequential
review_approval_per_record = true
canonical_approval_per_record = true
rollback_approval_per_record = true
source_binding_per_record = true
lifetime_budget_persists_after_rollback = true
unrelated_chamber_records_preserved = true
batch_activation = false
automatic_activation = false
candidate_only = true
activation_authority = false
scope_fingerprint = ee6952eef3517af8a868c83e4424125c70591af42ff4f568e76a8bba4aa3b5f8
```

Two records remain the smallest meaningful expansion beyond max=1, but the scope is **not currently eligible for activation**.

## Hardened rehearsal runtime

`js/ahaV2ControlledWriteExpansionRehearsal.js` remains restricted to:

`v2_expansion_rehearsal_staging`

The hardened runtime now additionally requires:

- exact binding to the canonical two-record scope ID;
- exact binding to the canonical scope fingerprint;
- exact `max_records = 2`;
- first-apply cleanup if identical replay fails;
- rollback compensation if record removal fails after another target has already been removed;
- fail-closed rollback preflight across all targets before destructive removal.

The dedicated hardening regression also checks:

- a forged `max=3` plan using the old fingerprint is rejected;
- replay failure restores the exact pre-run staging state;
- remove failure compensates to the exact pre-run state;
- drift on **record 2** blocks rollback before record 1 is removed.

Regression files:

```text
tests/aha-v2-controlled-write-expansion-rehearsal.test.cjs
tests/aha-v2-controlled-write-expansion-hardening.test.cjs
```

## Status of the old #860 production proof

The historical proof remains recorded at:

`ops/evidence/aha-v2-two-record-expansion-live-proof-v1.json`

Identity:

```text
production main:  2a0c6e0b19d92681cc4a51bd46efc3e2b824fc8c
TEMP PR:          #860 — closed without merge
workflow run:     32415006998
workflow job:     96574038093
artifact id:      9423564833
artifact digest:  sha256:a2a30b3e0380345dddf346f090780fda4cec5c7497865cf91878b61622d504d6
probe head:       b022c357f6b637a1fbf36025a164fcc848d5006b
product diff:     0 files
```

Its current status is:

```text
status = invalidated_by_post_merge_review
current_gate_usable = false
fresh_corrected_production_proof_required = true
```

The old observation still records what happened during #860, but it must not be interpreted as current production authority.

In particular:

```text
IndexedDB unchanged was claimed from store counts only.
IndexedDB key/value content digest was NOT proven.
Later-target rollback drift was NOT proven.
The deployed rehearsal bytes predate the hardening changes.
```

The permanent regression now requires the current hardened rehearsal hash to differ from the historical #860 rehearsal hash.

## Authority boundary

Still open:

```text
one-record manual local review-queue write   OPEN inside verified max=1 pilot
one-record manual local Chamber write        OPEN inside verified max=1 pilot
exact rollback for that record               OPEN
```

Still closed:

```text
two-record expansion activation       CLOSED
normal Chat V2 persistence             CLOSED
automatic activation                   CLOSED
batch activation                       CLOSED
automatic legacy backfill              CLOSED
backend sync                           CLOSED
backend persistent V2 write            CLOSED
broad canonical V2 write               CLOSED
projection-store writes                CLOSED
Meta writes                            CLOSED
remote V2 writes                       CLOSED
```

The one-record lifetime budget remains max=1 until a separate, freshly proven expansion is explicitly authorized.

## Required fresh proof

The two-record gate may return to `BOUNDED_EXPANSION_PILOT_ELIGIBLE` only after a new temporary production proof demonstrates the hardened runtime against the exact candidate scope.

The replacement proof must include all previous boundaries plus the missing adversarial evidence:

1. exact immutable scope binding to ID + fingerprint + max=2;
2. first apply 2 writes and identical replay 0 writes / 2 no-ops;
3. replay-failure cleanup restores exact pre-run state;
4. rollback of both records is exact;
5. remove failure during rollback compensates exact pre-run state;
6. drift on the **later rollback target** prevents any earlier deletion;
7. unrelated state remains unchanged;
8. localStorage and sessionStorage remain unchanged;
9. IndexedDB is compared by stable keys-and-values digest, not row count;
10. unexpected persistence write requests remain 0;
11. deployed candidate commit and selected assets match the expected hardened main;
12. all broader write authorities remain false.

## Next valid step

The next valid step is **fresh temporary production reproof of the hardened two-record candidate**.

It is **not** a two-record activation PR and it is **not** broad persistence.

Only after that corrected proof is green may the decision gate become eligible again; even then, `eligible_for_expansion_activation` remains false until a separate explicit activation PR is reviewed and merged.

Authoritative status:

> **One-record pilot: production-verified and max=1. Two-record candidate: hardened but current decision NO_GO pending fresh corrected production proof. Two-record activation: CLOSED. Broad/normal V2 persistence: CLOSED.**
