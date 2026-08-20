# AHA Insight Engine V2 — controlled write expansion gate

Date: 2026-08-20

## Purpose

The production-verified **one-record local Chamber pilot remains the current production-verified write boundary**. The two-record gate is a decision layer only: it cannot itself write, activate the wider scope, change the existing production budget, or open normal Chat persistence.

## Current decision

> **BOUNDED_EXPANSION_PILOT_ELIGIBLE — 12/12 corrected evidence green**

Machine-readable current evidence:

`ops/evidence/aha-v2-controlled-write-expansion-gate-current-v1.json`

Current result:

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

The green decision means the exact bounded two-record candidate has enough corrected gate/rehearsal evidence to proceed through the already-existing explicit activation implementation for a **fresh activation production proof**. It does **not** mean the two-record activation is production-verified.

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

Two records are the minimum meaningful expansion beyond the verified max=1 pilot.

## Why the old #860 proof was invalidated

Temporary PR #860 originally appeared to establish a green two-record gate. Post-merge review later found five material gaps:

1. the rehearsal did not bind strongly enough to the immutable scope ID/fingerprint/max=2;
2. a replay failure could strand the first apply;
3. a later rollback-remove failure could leave a partial deletion;
4. IndexedDB was compared by row counts rather than stable key/value contents;
5. drift was injected into the first rollback target rather than a later target.

Those findings invalidated #860 as current authority and caused PR #865 to return the gate to `NO_GO` while the runtime and proof model were corrected.

The #860 identity remains preserved as superseded provenance in the current permanent proof; it is not silently rewritten or discarded.

## Runtime hardening

The permanent rehearsal runtime:

`js/ahaV2ControlledWriteExpansionRehearsal.js`

is restricted to `v2_expansion_rehearsal_staging` and now enforces:

- exact canonical scope ID;
- exact canonical SHA-256 scope fingerprint;
- exact max=2;
- cleanup of the first apply if replay fails;
- compensation of already-removed records if a later remove fails;
- preflight of all rollback targets before destructive removal.

Permanent regressions:

```text
tests/aha-v2-controlled-write-expansion-rehearsal.test.cjs
tests/aha-v2-controlled-write-expansion-hardening.test.cjs
```

The hardening regression explicitly covers a forged max=3 scope, replay-failure cleanup, remove-failure compensation and drift on record 2.

## Corrected production proof — PR #867

Temporary PR #867 was created from deployed hardened main and was closed **without merge** after successful evidence capture.

Proof identity:

```text
production main:  cc82b9a4b3cab6fdd62472f62facb025fbea4b75
TEMP PR:          #867 — closed without merge
probe head:       84e1f101079591968150832c902b01b1c9d08c8a
workflow run:     32421978733
workflow job:     96595761534
artifact id:      9426036702
artifact digest:  sha256:86051351653dd468180d4a91d5df07ebb51635baf9ff14ab31cf6d2fde82de41
product diff:     0 files
TEMP file count:  2
```

GitHub Pages reported the exact expected main as `built` on attempt 1. Five selected deployed assets matched that commit byte-for-byte.

Crucially, the proof did not perform a later unbound JS refetch. It captured the deployed gate/rehearsal/scope/baseline bytes, verified each SHA-256 against expected main, and then executed the **same captured verified bytes** in the browser proof.

## Corrected evidence demonstrated

The production proof established all of the following:

```text
immutable scope mutation max=3              BLOCKED
first apply writes                           2
identical replay writes                      0
identical replay no-ops                      2
normal rollback                              exact, count 2
partial apply failure compensation           exact
rollback remove failure                      manual_review_required
rollback remove rolled_back_count            0
rollback remove compensation                 exact
rollback remove target state restored        true
replay failure cleanup                       rolled_back + exact
replay failure pre-run state restored        true
state drift target                           record 2
state drift rollback count                   0
record 1 preserved on record-2 drift         true
drifted record preserved                     true
unrelated sentinel full contents preserved   true
localStorage unchanged                       true
sessionStorage unchanged                     true
IndexedDB snapshot mode                      stable_keys_values_sha256
IndexedDB content digest unchanged           true
unexpected requests                          0
unexpected write requests                    0
page errors                                  0
console errors                               0
```

Permanent proof:

`ops/evidence/aha-v2-two-record-expansion-live-proof-v1.json`

Its status is now:

```text
status = production_evidence_verified
proof_revision = corrected_v2
```

The invalidated #860 proof is retained inside `superseded_provenance` for auditability.

## Review remediation

The corrected runtime/proof closes the five gate/rehearsal findings:

- immutable scope binding — fixed and production-proven;
- replay cleanup — fixed and production-proven;
- rollback remove compensation — fixed and production-proven;
- IndexedDB content digest — corrected and production-proven;
- later-target drift — corrected and production-proven on record 2.

Runtime review threads from #859 are already resolved. The two #860 proof-review threads are eligible for resolution after this permanentization PR merges:

```text
PRRT_kwDOQgS1AM6a88Mp
PRRT_kwDOQgS1AM6a88Mx
```

## Activation remains a separate proof boundary

The activation implementation already exists:

```text
js/ahaV2ControlledWriteExpansionActivation.js
insight-expansion-v2.html
js/ahaInsightExpansionOperatorV2.js
```

PR #866 additionally hardened the #862 cross-tab rollback P1 with an exclusive same-origin Web Lock and adversarial two-wrapper concurrency regression.

However, the historical activation proof from #863/#864 remains invalid as current production proof. Two separate proof-quality gaps still need fresh evidence:

1. the exact bytes executed by the activation proof must be hash-bound to expected production main;
2. unrelated sentinel preservation must compare the complete record contents, not ID presence only.

Therefore:

```text
corrected two-record gate/rehearsal evidence   GREEN 12/12
two-record activation implementation           EXISTS + cross-tab hardened
historical #863/#864 activation proof           INVALID / superseded
two-record activation production-verified       NO
production-verified write boundary              one-record max=1
```

## Authority boundary

Currently production-verified:

```text
one-record manual local review-queue write   OPEN inside verified max=1 pilot
one-record manual local Chamber write        OPEN inside verified max=1 pilot
exact rollback for that record               OPEN
```

Still not production-verified/open as a widened production boundary:

```text
two-record activation production status   PENDING corrected activation proof
normal Chat V2 persistence                 CLOSED
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

## Next valid step

The next valid step is **one fresh temporary activation production proof** against the corrected gate and cross-tab-hardened activation runtime.

That proof must be isolated and closed without merge. It must prove at minimum:

1. exact deployed activation/operator/gate bytes are hash-bound to expected main and those exact verified bytes are executed;
2. exact operator intent reaches the bounded two-record path;
3. two distinct sources create exactly two records through separate REVIEW/CANONICAL sequences;
4. a third write is blocked;
5. repository save/load remain 0/0 and sync remains local-only;
6. rollback of record 2 preserves record 1 and the **complete unrelated sentinel record**;
7. rollback of record 1 removes only that record;
8. concurrent rollback safety remains serialized by the production Web Lock;
9. lifetime created-record count remains 2 after rollback and a fresh wrapper still blocks record 3;
10. every broad/automatic/backend/projection/Meta/remote authority remains false.

Only after that proof is green and permanentized may the two-record activation be called production-verified.

Authoritative status:

> **One-record pilot: production-verified, max=1. Corrected two-record expansion gate: 12/12 green and eligible for the fresh activation proof. Two-record activation implementation: present and cross-tab hardened, but NOT yet production-verified. Broad/normal V2 persistence: CLOSED.**
