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

Post-merge review invalidated the old #860 proof and returned current evidence to `NO_GO`. Therefore the current runtime must fail with `expansion_gate_not_green` before the raw activation controller is created.

Regression:

`tests/aha-v2-controlled-write-expansion-activation.test.cjs`

The regression now proves both sides of the contract:

- **real current repo evidence is rejected** and the raw controller is never created;
- a synthetic fully re-proven fixture can still authorize the implementation, so the code remains testable without pretending production evidence is green.

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

When and only when fresh evidence becomes green, the wrapper still enforces:

- at most two lifetime canonical creations;
- record 3 blocked with `expansion_record_budget_exhausted`;
- rollback does not replenish budget;
- duplicate historical candidate signatures do not consume another slot;
- at most one unpromoted reviewed item at a time;
- no direct localStorage/sessionStorage/IndexedDB/network/Supabase persistence path in the wrapper;
- all normal Chat/backend/backfill/projection/Meta/remote authorities remain false.

## Status of PR #863

Temporary PR #863 exercised the activation implementation against the then-current 12/12 evidence and was closed without merge.

That observation cannot override the later review invalidation because its authorization chain depended on the same #860-derived green gate state that is now withdrawn. It is historical evidence, not current authority.

A future corrected proof must run against the **hardened rehearsal runtime and corrected current evidence**, not against the old eligible state.

## Required next proof

Before this activation can become usable again, a new temporary production proof must first restore the **decision gate** itself by proving the hardened two-record candidate:

- immutable scope ID + fingerprint + max=2 binding;
- replay-failure cleanup;
- rollback remove-failure compensation;
- drift on a later rollback target with zero earlier deletion;
- exact browser persistent-state comparison including IndexedDB keys and values;
- zero unexpected writes;
- deployed hardened asset parity;
- all broader authorities false.

Only after that corrected proof may the decision return to `BOUNDED_EXPANSION_PILOT_ELIGIBLE`.

Then the activation implementation needs a fresh post-authorization production proof before the two-record write boundary can be called production-verified.

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

> **Activation code exists, but the current gate is NO_GO and blocks it before controller creation. Production-verified write boundary remains the one-record pilot, max=1.**
