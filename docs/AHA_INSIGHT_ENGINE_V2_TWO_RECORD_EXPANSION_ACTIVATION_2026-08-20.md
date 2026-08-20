# AHA Insight Engine V2 — two-record expansion activation

Date: 2026-08-20

## Current status

The two-record activation implementation exists on `main`, but **current authorization is fail-closed**.

Current decision:

```text
expansion decision = NO_GO
eligible_for_bounded_expansion_pilot = false
eligible_for_expansion_activation = false
current one-record pilot max = 1
```

The activation code must not be interpreted as current write authority.

## Implementation

Activation wrapper:

`js/ahaV2ControlledWriteExpansionActivation.js`

Dedicated operator:

`insight-expansion-v2.html?pilot=bounded_local_chamber_two_record_candidate_v1`

Operator adapter:

`js/ahaInsightExpansionOperatorV2.js`

The wrapper reuses the already production-verified `AHAInsightActivationV2` controller. It does not create a second persistence engine.

## Why activation is blocked now

The activation wrapper calls the current expansion gate before it constructs the raw activation controller.

It requires all of the following at runtime:

1. exact operator intent `bounded_local_chamber_two_record_candidate_v1`;
2. current permanent expansion evidence evaluates to `BOUNDED_EXPANSION_PILOT_ELIGIBLE`;
3. all 12 required expansion checks are green with zero blockers;
4. the production-verified one-record baseline remains valid;
5. the exact two-record scope contract remains valid;
6. the permanent two-record live proof has status `production_evidence_verified`;
7. proof, scope and decision identities agree;
8. every broader write authority remains closed.

Post-merge review invalidated the old #860 proof and returned current evidence to `NO_GO`. Therefore the current runtime fails with `expansion_gate_not_green` before the raw activation controller is created.

Regression:

`tests/aha-v2-controlled-write-expansion-activation.test.cjs`

The regression proves both sides of the contract:

- **real current repo evidence is rejected** and the raw controller is never created;
- a synthetic fully re-proven fixture can still exercise the implementation contract without pretending current production evidence is green.

## Additional activation-runtime blocker from #862 review

Post-merge review of #862 found a separate P1 issue in the two-active-record case: two operator tabs can approve rollback of different records concurrently. Without cross-instance serialization, both raw controllers can read the same review queue and Chamber snapshot, then one can write stale state after the other has completed. A rollback that appeared successful in one tab could therefore be partially resurrected by the other tab.

Current production remains protected because the `NO_GO` gate prevents the activation controller from being created. However, the activation implementation must **not be re-authorized** until the complete rollback transaction is serialized across same-origin tabs/instances (or is otherwise made atomically compare-and-write safe), followed by an adversarial concurrency regression.

Tracked review thread:

`PRRT_kwDOQgS1AM6a9LzR`

Required remediation before reauthorization:

```text
cross-instance rollback serialization = REQUIRED
fresh state read inside exclusive boundary = REQUIRED
full rollback + verification inside same boundary = REQUIRED
concurrent two-tab rollback regression = REQUIRED
```

## Candidate scope remains unchanged

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

A previous canonical creation under the one-record pilot consumes one of the two total historical slots if the two-record candidate is ever re-authorized.

## Existing implementation boundaries

When and only when both the runtime hardening and fresh evidence are green, the wrapper is intended to enforce:

- at most two lifetime canonical creations;
- record 3 blocked with `expansion_record_budget_exhausted`;
- rollback does not replenish budget;
- duplicate historical candidate signatures do not consume another slot;
- at most one unpromoted reviewed item at a time;
- no direct localStorage/sessionStorage/IndexedDB/network/Supabase persistence path in the wrapper;
- all normal Chat/backend/backfill/projection/Meta/remote authorities remain false.

## Status of PR #863 / #864 proof

Temporary PR #863 exercised the activation implementation against the then-current 12/12 evidence and was closed without merge. PR #864 permanentized that downstream observation.

That proof is now historical only. It cannot override the upstream #860 invalidation, and review found two additional proof-quality gaps:

1. **Executed-byte TOCTOU:** after the initial Pages parity check, the proof refetched controller assets for execution without hashing those exact response bytes against the expected commit. A concurrent Pages deployment could therefore cause the artifact to attribute execution to the wrong commit.
2. **Sentinel content not proven:** rollback isolation asserted that the unrelated sentinel ID still existed, but did not compare the full sentinel record before and after rollback. Mutated sentinel contents could have passed.

Tracked proof-review threads:

```text
PRRT_kwDOQgS1AM6a9Pio
PRRT_kwDOQgS1AM6a9Pis
```

Permanent historical evidence:

`ops/evidence/aha-v2-two-record-expansion-activation-live-proof-v1.json`

Current status:

```text
status = invalidated_by_upstream_gate_review
current_activation_authority_usable = false
cross_instance_rollback_serialization_missing = true
deployed_execution_byte_binding_missing = true
unrelated_sentinel_full_content_check_missing = true
fresh_corrected_gate_proof_required = true
fresh_post_gate_activation_proof_required = true
```

## Required corrected proof chain

Before activation can become usable again, the **gate/rehearsal** must first be freshly production-proven against the hardened runtime. That replacement proof must establish:

- immutable scope ID + fingerprint + max=2 binding;
- replay-failure cleanup;
- rollback remove-failure compensation;
- drift on a later rollback target with zero earlier deletion;
- exact browser persistent-state comparison including IndexedDB keys and values;
- zero unexpected writes;
- deployed hardened asset parity;
- all broader authorities false.

Only after that gate proof is green may the decision return to `BOUNDED_EXPANSION_PILOT_ELIGIBLE`.

Before activation itself can then be called production-verified, all of the following must also be true:

1. cross-instance rollback serialization is implemented and regression-tested;
2. the exact bytes executed by the proof are either the already hash-verified copies or are re-hashed immediately before execution and bound to expected main;
3. the complete unrelated sentinel record is snapshotted and byte/stable-digest compared before and after both rollbacks;
4. two distinct records remain independently rollback-safe;
5. third write remains blocked and lifetime count remains two after rollback;
6. repository calls remain 0/0 and all broader authorities remain false.

The old #863 artifact cannot be reused as the corrected proof.

## Still closed

```text
two-record activation write authority       CLOSED
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

> **Activation code exists, but current gate is NO_GO and blocks it before controller creation. Cross-instance rollback serialization is also required before any reauthorization. Production-verified write boundary remains the one-record pilot, max=1.**
