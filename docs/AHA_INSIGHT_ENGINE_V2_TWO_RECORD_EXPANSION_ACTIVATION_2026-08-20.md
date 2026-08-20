# AHA Insight Engine V2 — two-record expansion activation

Date: 2026-08-20

## Current status

The two-record activation implementation exists, but **current authorization remains fail-closed**.

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

The activation wrapper calls the current expansion gate before it constructs the raw activation controller. Current #860-derived evidence is invalidated, so the real repo state fails with `expansion_gate_not_green` before raw controller creation.

Regression:

`tests/aha-v2-controlled-write-expansion-activation.test.cjs`

The regression proves both sides of the contract:

- real current repo evidence is rejected;
- a synthetic fully re-proven fixture can still exercise the implementation contract without pretending production evidence is green.

## Cross-instance rollback hardening

Review of #862 found a P1 race in the two-active-record case: two operator tabs could start rollback of different promoted records from the same shared localStorage snapshot, and a later stale write could resurrect the record rolled back by the other tab.

That runtime gap is now hardened.

The expansion wrapper uses the same origin-wide Web Locks name for the complete rollback transaction:

```text
aha-v2-controlled-write-expansion-rollback-v1
mode = exclusive
```

The exclusive boundary covers:

1. fresh `requirePromoted()` / review-queue state read after lock acquisition;
2. the underlying `AHAInsightActivationV2.approveRollback()` transaction;
3. fresh postcondition inspection;
4. preservation checks for all other promoted records.

The wrapper does **not** acquire a per-tab-only fallback in production. In a browser context without the Web Locks API it fails closed with:

`expansion_rollback_lock_unavailable`

Non-browser deterministic tests may inject a lock manager.

Adversarial regression:

`tests/aha-v2-controlled-write-expansion-cross-tab-rollback.test.cjs`

The regression creates two independent expansion-wrapper instances over one deliberately stale-snapshot fake controller and launches rollback concurrently. It proves:

- both instances request the same lock name;
- both requests use `mode: exclusive`;
- raw rollback concurrency never exceeds 1;
- record 1 cannot be resurrected by rollback of record 2;
- both records end `rolled_back`;
- lifetime created-record count remains 2 after rollback;
- browser-without-lock fails before any mutation.

Tracked review thread:

`PRRT_kwDOQgS1AM6a9LzR`

Runtime status:

```text
cross_instance_rollback_serialization_missing = false
cross_instance_rollback_serialization_hardened_after_observation = true
```

This fixes the #862 runtime P1, but it does not make the old #863 proof valid.

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

## Status of PR #863 / #864 proof

Temporary PR #863 exercised the activation implementation against the then-current 12/12 evidence and was closed without merge. PR #864 permanentized that downstream observation.

That proof remains historical only. It cannot override the upstream #860 invalidation, and two proof-quality gaps remain:

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
cross_instance_rollback_serialization_missing = false
cross_instance_rollback_serialization_hardened_after_observation = true
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

A fresh activation proof must then additionally prove:

1. concurrent same-origin rollback is serialized under the production Web Lock;
2. the exact bytes executed by the proof are either the already hash-verified copies or are re-hashed immediately before execution and bound to expected main;
3. the complete unrelated sentinel record is snapshotted and stable-digest compared before and after both rollbacks;
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

> **Cross-tab rollback P1 is hardened and regression-covered. Current gate remains NO_GO and blocks activation before controller creation. Two proof-quality gaps plus fresh gate/activation production evidence are still required. Production-verified write boundary remains the one-record pilot, max=1.**
