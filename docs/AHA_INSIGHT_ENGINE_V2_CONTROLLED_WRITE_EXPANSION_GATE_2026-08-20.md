# AHA Insight Engine V2 — controlled write expansion gate

Date: 2026-08-20  
Updated: 2026-08-21

## Purpose

The two-record expansion gate remains a **decision layer**. It cannot itself write, activate a scope, change a budget, or open normal Chat persistence.

The current gate/rehearsal decision is still:

> **BOUNDED_EXPANSION_PILOT_ELIGIBLE — 12/12 corrected evidence green**

Machine-readable gate evidence:

`ops/evidence/aha-v2-controlled-write-expansion-gate-current-v1.json`

```text
required checks: 12
passed: 12
failed: 0
blockers: 0
decision: BOUNDED_EXPANSION_PILOT_ELIGIBLE
eligible_for_bounded_expansion_pilot = true
eligible_for_expansion_activation    = false
eligible_for_normal_chat_persistence = false
current_one_record_pilot_max_records = 1
current_one_record_pilot_budget_may_change = false
expansion_runtime_open               = false
```

These fields describe the **decision gate's own authority**. `eligible_for_expansion_activation=false` intentionally means the gate does not grant activation by itself. The separate activation implementation has now been production-proved by corrected PR #876 and therefore establishes the exact bounded max=2 production-verified operator scope without changing the gate's decision-only semantics.

## Exact selected scope

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

The contract remains candidate-only because the contract itself never becomes write authority. Runtime authority is established only by the explicit activation wrapper after gate validation and exact operator intent.

## Corrected gate/rehearsal production proof — PR #867

Temporary PR #867 replaced the invalidated #860 gate proof and was closed without merge.

```text
production main:  cc82b9a4b3cab6fdd62472f62facb025fbea4b75
TEMP PR:          #867
probe head:       84e1f101079591968150832c902b01b1c9d08c8a
workflow run:     32421978733
workflow job:     96595761534
artifact id:      9426036702
artifact digest:  sha256:86051351653dd468180d4a91d5df07ebb51635baf9ff14ab31cf6d2fde82de41
```

Permanent proof:

`ops/evidence/aha-v2-two-record-expansion-live-proof-v1.json`

Status:

```text
production_evidence_verified
proof_revision = corrected_v2
```

The corrected gate proof established immutable max=2 scope binding, replay cleanup, rollback-remove compensation, later-target drift detection on record 2, full sentinel preservation, stable IndexedDB key/value digests, zero unexpected requests/writes and execution from captured hash-verified deployed bytes.

The invalidated #860 identity remains preserved as superseded provenance.

## Cross-instance rollback hardening

PR #866 fixed the activation rollback race with one origin-wide exclusive Web Lock:

```text
aha-v2-controlled-write-expansion-rollback-v1
mode = exclusive
```

The lock covers fresh state read, raw rollback and postcondition verification as one serialized transaction. Browser execution without Web Locks fails closed.

Regression:

`tests/aha-v2-controlled-write-expansion-cross-tab-rollback.test.cjs`

## Corrected activation production proof — PR #876

The separate activation proof boundary is now also green.

Temporary PR #876:

```text
production main:  b42917de4ec4fa30fbab8c68b2dc3e25c663743d
TEMP PR:          #876 — closed without merge
probe head:       0c8f2226c02e2e3f81d19acaf1c9d80e94890527
workflow run:     32436619989
workflow job:     96639013827
artifact id:      9430975409
artifact digest:  sha256:cc87613837c7d118d385ad2cd9cda829a682da174e8f5a2fe7c28bf578422f8a
product diff:     0 files
TEMP file count:  2
```

Permanent activation evidence:

`ops/evidence/aha-v2-two-record-expansion-activation-live-proof-v1.json`

Permanentization PR:

`#878`

The corrected proof closes the two remaining #863/#864 proof-quality gaps:

1. **executed-byte binding** — 20 deployed assets were captured and SHA-256 verified against exact production main; VM and operator executed/routed those same captured copies;
2. **full unrelated-state preservation** — complete sentinel contents were compared after both rollbacks, record 1 was compared exactly across rollback 2, and final business state returned exactly to pre-activation state.

The only permitted Chamber envelope delta is intentional `_local_updated_at` housekeeping metadata, separately proved as the only top-level difference.

## Current production-verified bounded result

The two proofs now form one complete chain:

```text
immutable scope + rehearsal evidence           GREEN
12/12 decision gate                            GREEN
cross-tab rollback serialization               GREEN
exact deployed activation byte binding         GREEN
manual record 1 REVIEW/CANONICAL               GREEN
manual record 2 REVIEW/CANONICAL               GREEN
third record blocked                            GREEN
repository save/load                            0/0
local-only sync block                           GREEN
full sentinel preservation                      GREEN
record 1 preservation during rollback 2         GREEN
final Chamber business state                    exact
lifetime count after rollback                   2
fresh-wrapper third record                      blocked
```

Therefore the **production-verified controlled local activation boundary is now max=2 lifetime canonical creations**, manual sequential only.

## Separate product-artifact boundary — PR #875 / #879

PR #875 introduced one explicit local product artifact per user action for qualified Lists, Paths or Mindmap candidates. PR #879 finalized that same boundary with durable reload-safe undo, refusal to roll back user-edited artifacts, normal local relation editing, V2-only compatibility entry points and lazy dependency loading after the explicit artifact action.

The final materializer still does not imply:

```text
projection_store_write authority  false
automatic persistence authority   false
remote/sync authority             false
Chamber/Meta authority            false
```

It also leaves the protected production `chat.html` byte-identical. Accordingly the Insight activation proof and policy continue to require `projection_store_write_open=false`.

## Authority boundary

Production-verified only inside the explicit bounded activation operator:

```text
manual local review-queue activation    OPEN up to shared lifetime max=2
manual local Chamber canonical write    OPEN up to shared lifetime max=2
exact signature-bound rollback          OPEN
exclusive rollback serialization        REQUIRED
```

Still closed:

```text
normal Chat V2 persistence              CLOSED
automatic activation                    CLOSED
batch activation                        CLOSED
automatic legacy backfill               CLOSED
backend sync                            CLOSED
backend persistent V2 write             CLOSED
broad canonical V2 write                CLOSED
projection-store writes                 CLOSED
Meta writes                             CLOSED
remote V2 writes                        CLOSED
```

## Next valid write-authority step

There is no implicit promotion beyond max=2. Any broader write scope must start with a new fail-closed decision gate and immutable scope contract, then receive its own adversarial regression and fresh production proof.

The current product/read-model work may continue independently as read-only or through the finalized #875/#879 explicit one-artifact-per-action local boundary, but it may not inherit the Insight expansion authority.

Authoritative status:

> **Corrected two-record gate: 12/12 green. Corrected activation proof: production-verified. Exact bounded manual local activation: max=2 lifetime canonical creations. PRs #875/#879 define a separate local product-artifact boundary. Normal Chat, automatic/batch/backend/projection-store/Meta/remote persistence remains CLOSED.**
