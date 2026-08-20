# AHA Insight Engine V2 — two-record expansion activation

Date: 2026-08-20

## Purpose

The expansion decision gate is now 12/12 green for one exact scope:

`bounded_local_chamber_two_record_candidate_v1`

This document defines the separate activation implementation required by that decision. It does not open normal Chat persistence or any broad V2 write path.

## Activation scope

The production activation wrapper is:

`js/ahaV2ControlledWriteExpansionActivation.js`

Dedicated operator surface:

`insight-expansion-v2.html?pilot=bounded_local_chamber_two_record_candidate_v1`

Operator adapter:

`js/ahaInsightExpansionOperatorV2.js`

The wrapper uses the existing production-proven `AHAInsightActivationV2` controller. It does not implement a new persistence engine.

## Authorization chain

Before the wrapper can expose any manual action, it requires:

1. exact operator intent `bounded_local_chamber_two_record_candidate_v1`;
2. permanent current expansion evidence evaluates to `BOUNDED_EXPANSION_PILOT_ELIGIBLE` with 12/12 checks green;
3. the permanent one-record production proof remains valid;
4. the exact two-record scope contract validates and still has the locked fingerprint;
5. the permanent two-record expansion live proof remains `production_evidence_verified`;
6. that live proof still proves two canaries, exact rollback, exact compensation, state-drift fail-closed, unchanged browser storage, zero unexpected write requests and zero wider authority;
7. the candidate-only scope remains exactly two records, manual sequential, batch=false and automatic=false.

Any mismatch fails closed.

## Lifetime budget

The two-record budget is **total lifetime canonical creations in the existing controlled review history**.

```text
historical canonical records = 0  → 2 slots available
historical canonical records = 1  → 1 slot available
historical canonical records = 2  → 0 slots available
historical canonical records > 2  → invalid state, fail closed
```

A record continues to consume a slot after exact rollback because its review retains `canonical_insight_id`.

This means a device/profile that already consumed the old one-record pilot slot can create at most one additional record under the two-record expansion.

Rollback never replenishes the lifetime budget.

## Sequential activation

At most one unpromoted `reviewed` item may exist at a time.

A promoted first record is a completed canonical step, so a second review may be started while the first record remains active. A second in-progress review cannot run in parallel.

Each record requires its own three approval phases:

```text
REVIEW challenge
CANONICAL challenge
optional ROLLBACK challenge
```

The underlying controller keeps each challenge single-use and expiry-bound.

## Source and duplicate binding

`AHAInsightActivationV2` already binds each review to:

- source event ID;
- source text SHA-256;
- synthesis response;
- candidate index;
- candidate payload;
- quality-gate decision.

It re-checks the current source hash before committing review/canonical state.

The expansion wrapper adds one more rule: a candidate signature that has already produced a canonical record cannot consume the second slot. The duplicate is rejected before the review write.

## Exact rollback

Rollback remains the existing `AHAInsightActivationV2` exact signature-bound rollback.

The expansion wrapper additionally verifies after rollback that:

- lifetime created-record count did not decrease;
- the target review moved to `rolled_back`;
- the target is no longer promoted;
- other promoted reviews remain promoted and untouched.

Two active records can therefore be rolled back independently, including in reverse order.

## Operator boot boundary

`insight-expansion-v2.html` starts with:

`src="about:blank"`

The Chat iframe is navigated only after the exact two-record operator intent is present and the load handler has been installed.

The operator loads the permanent expansion evidence, one-record proof, two-record live proof and exact scope contract before creating the wrapper.

The raw `AHAInsightActivationV2` controller is never exported by the operator page.

## Still closed

```text
normal Chat automatic V2 persistence       CLOSED
automatic activation                       CLOSED
batch activation                           CLOSED
automatic legacy backfill                  CLOSED
backend sync                               CLOSED
backend persistent V2 write                CLOSED
broad canonical V2 write                   CLOSED
projection-store writes                    CLOSED
Meta writes                                CLOSED
remote V2 writes                           CLOSED
```

## Required pre-merge regressions

`tests/aha-v2-controlled-write-expansion-activation.test.cjs` proves:

- authorization only for the exact green scope;
- record 1 and record 2 can be created sequentially;
- record 3 is blocked;
- rollback of record 2 does not alter record 1;
- rollback does not reopen budget;
- a fresh wrapper after both rollbacks still blocks record 3;
- a prior one-record canonical history leaves only one slot;
- a duplicate candidate signature is blocked before review write;
- invalid scope/evidence/live proof fails closed;
- history above two records fails closed;
- all broader authority flags remain false;
- wrapper contains no direct storage/network/Supabase persistence path.

`tests/aha-insight-expansion-operator-v2.test.cjs` locks the dedicated operator boot and transport boundary.

## Required production proof after merge

Repo CI is not production proof.

After merge, a temporary non-merged GitHub Pages/browser proof must establish:

1. Pages commit and selected activation/operator/safety assets exactly match main;
2. page without exact operator intent remains `about:blank` and does not request Chat;
3. exact operator intent reaches authorized two-record state;
4. first source/candidate passes separate REVIEW and CANONICAL approvals and creates exactly one local record;
5. second distinct source/candidate passes a separate REVIEW and CANONICAL sequence and creates exactly the second local record;
6. a third review/write is blocked with lifetime budget exhausted;
7. repository save/load remain 0/0 while local-only records exist;
8. exact rollback of record 2 preserves record 1 and unrelated sentinel state;
9. exact rollback of record 1 removes only record 1;
10. fresh wrapper after both rollbacks still blocks a third record because lifetime count remains two;
11. no backend/Meta/remote/backfill/projection/normal-Chat write authority opens;
12. proof artifact is redacted and the TEMP PR closes without merge.

Until that post-merge proof exists:

> **Two-record activation code: bounded and pending production proof. Production-verified write boundary remains the one-record pilot. Broad/normal V2 persistence remains CLOSED.**
