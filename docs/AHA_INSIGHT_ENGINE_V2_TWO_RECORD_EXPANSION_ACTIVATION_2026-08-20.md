# AHA Insight Engine V2 — two-record expansion activation

Date: 2026-08-20

## Current status

The exact two-record activation implementation exists and is cross-tab hardened. The corrected gate/rehearsal evidence is now green again, but the **two-record activation is not yet production-verified** because the historical #863/#864 activation proof still has two proof-quality gaps.

Current boundary:

```text
expansion gate decision = BOUNDED_EXPANSION_PILOT_ELIGIBLE
required gate checks = 12/12 green
eligible_for_expansion_activation = false
current production-verified one-record pilot max = 1
historical activation proof usable = false
fresh corrected activation proof required = true
```

The green gate permits the exact explicit operator implementation to be exercised for its corrected production proof. It does not itself widen the production-verified write boundary.

## Implementation

Activation wrapper:

`js/ahaV2ControlledWriteExpansionActivation.js`

Dedicated operator:

`insight-expansion-v2.html?pilot=bounded_local_chamber_two_record_candidate_v1`

Operator adapter:

`js/ahaInsightExpansionOperatorV2.js`

The wrapper reuses `AHAInsightActivationV2`; it does not create a second persistence engine.

## Current authorization chain

The wrapper requires all of the following before it constructs the raw activation controller:

1. exact operator intent `bounded_local_chamber_two_record_candidate_v1`;
2. current expansion evidence evaluates to `BOUNDED_EXPANSION_PILOT_ELIGIBLE`;
3. all 12 required gate checks pass with zero blockers;
4. the production-verified one-record baseline remains valid;
5. the exact two-record scope contract remains valid;
6. the corrected two-record live proof is `production_evidence_verified`;
7. proof, scope and deployment identities agree;
8. all broad/automatic/backend/projection/Meta/remote authorities remain false.

The corrected gate proof from #867 now satisfies this decision boundary. That authorization is still only the bounded operator path needed for the next proof run; it does not make #863/#864 current production evidence.

## Corrected upstream gate proof

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

It proved immutable scope binding, replay cleanup, rollback-remove compensation, later-target drift on record 2, full sentinel-content preservation, stable IndexedDB key/value digests, zero unexpected browser requests, and execution from hash-verified deployed asset copies.

Current gate result:

```text
BOUNDED_EXPANSION_PILOT_ELIGIBLE
12/12 passed
0 blockers
```

## Cross-instance rollback hardening

Post-merge review of #862 identified a P1 race: two operator tabs could approve rollback of different promoted records from stale shared snapshots, allowing a later stale write to resurrect state rolled back by the first tab.

PR #866 fixed this with one origin-wide Web Locks name:

```text
aha-v2-controlled-write-expansion-rollback-v1
mode = exclusive
```

The exclusive boundary covers:

1. fresh promoted/review state read after lock acquisition;
2. the underlying rollback transaction;
3. fresh postcondition inspection;
4. preservation checks for other promoted records.

Browser execution without Web Locks fails closed with `expansion_rollback_lock_unavailable`. Deterministic tests can inject a lock manager.

Regression:

`tests/aha-v2-controlled-write-expansion-cross-tab-rollback.test.cjs`

The #862 P1 thread is resolved.

## Exact activation scope

```text
scope_id = bounded_local_chamber_two_record_candidate_v1
max lifetime canonical creations = 2
activation mode = manual_sequential
separate REVIEW approval per record = required
separate CANONICAL approval per record = required
separate ROLLBACK approval per record = required
source binding per record = required
rollback replenishes lifetime budget = false
batch activation = false
automatic activation = false
```

A canonical creation remains counted after exact rollback. A previous creation under the one-record pilot therefore consumes one of the two historical slots if this two-record scope is eventually production-verified.

## Historical #863 / #864 activation observation

Temporary PR #863 exercised the activation implementation against the then-current gate and was closed without merge. PR #864 permanentized that observation.

The historical observation demonstrated useful behavior: two separate source-bound records, independent approvals, blocked third write, local-only sync boundary, independent rollback and lifetime budget exhaustion. However, it remains **invalidated pending corrected activation proof**.

Permanent historical evidence:

`ops/evidence/aha-v2-two-record-expansion-activation-live-proof-v1.json`

Current status:

```text
status = invalidated_pending_corrected_activation_proof
current_activation_proof_usable = false
corrected_gate_proof_available = true
cross_instance_rollback_serialization_missing = false
deployed_execution_byte_binding_missing = true
unrelated_sentinel_full_content_check_missing = true
fresh_corrected_gate_proof_required = false
fresh_post_gate_activation_proof_required = true
```

## Two remaining #863 proof gaps

### 1. Exact executed-byte binding

The #863 workflow checked Pages parity, but later refetched controller assets for execution. Those exact refetched response bytes were not separately hash-bound to the expected production commit. A concurrent Pages deployment could therefore make the artifact attribute execution to the wrong code bytes.

Corrected activation proof requirement:

> Capture the deployed activation/operator/gate bytes, verify their SHA-256 against expected main, then execute those exact captured copies; or equivalently hash-bind the exact responses immediately before execution.

Review thread:

`PRRT_kwDOQgS1AM6a9Pio`

### 2. Full sentinel-content preservation

#863 checked that the unrelated sentinel ID still existed after rollback, but did not prove its complete contents were unchanged.

Corrected activation proof requirement:

> Snapshot the complete sentinel record before activation and stable-compare the entire record after rollback of record 2 and again after rollback of record 1.

Review thread:

`PRRT_kwDOQgS1AM6a9Pis`

These two review threads remain open until corrected activation evidence is successfully captured and permanentized.

## What the next proof must demonstrate

The corrected activation proof must be a temporary, isolated PR with zero product diff and must close without merge. It must prove:

1. exact production main and selected activation/operator/gate assets match deployed Pages;
2. the exact verified deployed bytes are the bytes executed by the proof;
3. without exact operator intent, the iframe remains `about:blank` and Chat does not start;
4. exact operator intent authorizes only the bounded two-record path;
5. two distinct permanent reviewed fixture sources produce eligible candidates;
6. record 1 requires its own REVIEW and CANONICAL approval and creates exactly one local source-bound record;
7. record 2 requires a separate REVIEW and CANONICAL sequence and creates exactly the second record;
8. a third write fails with `expansion_record_budget_exhausted`;
9. repository save/load remain 0/0 and Chamber sync is blocked before repository access;
10. rollback of record 2 preserves record 1 and the **complete unrelated sentinel record**;
11. rollback of record 1 removes only that record and leaves the complete sentinel unchanged;
12. cross-tab rollback remains serialized by the production exclusive Web Lock;
13. lifetime created-record count remains 2 after both rollbacks;
14. a fresh wrapper still blocks a third write;
15. every normal Chat/backend/backfill/projection/Meta/remote/automatic/batch authority remains false;
16. no user production data is modified.

## Production boundary until that proof is permanentized

Currently production-verified:

```text
one-record manual local review-queue write   OPEN inside max=1 pilot
one-record manual local Chamber write        OPEN inside max=1 pilot
exact rollback for that one record           OPEN
```

Not yet production-verified as a widened boundary:

```text
two-record activation                        PENDING corrected activation proof
normal Chat automatic V2 persistence         CLOSED
automatic activation                         CLOSED
batch activation                             CLOSED
automatic legacy backfill                    CLOSED
backend sync                                 CLOSED
backend persistent V2 write                  CLOSED
broad canonical V2 write                     CLOSED
projection-store writes                      CLOSED
Meta writes                                  CLOSED
remote V2 writes                             CLOSED
```

Authoritative status:

> **Corrected two-record gate: 12/12 green. Activation implementation: present and cross-tab hardened. Historical #863/#864 activation proof: invalid pending corrected replacement. Production-verified write boundary remains the one-record pilot, max=1, until the corrected activation proof is green and permanentized.**
