# AHA Insight Engine V2 — nine-block completion status (2026-08-20)

This document is the authoritative completion boundary for the nine-block semantic Insight Engine V2 rebuild and its controlled production rollout.

## Semantic build

All **9/9 semantic build blocks are implemented**:

| Block | Scope | Status |
|---|---|---|
| 1 | SemanticDocument, evidence and provenance | implemented |
| 2 | Entities and meaningful concepts | implemented |
| 3 | Normalized claims and typed relations | implemented |
| 4 | Separate source-direct semantic model call | implemented |
| 5 | Insight Synthesis V2 + quality gate | implemented and production-measured |
| 6 | Equivalence vs resonance | implemented |
| 7 | Insight Saturation V2 + quality-aware Meta | implemented |
| 8 | Shared semantic projections | implemented |
| 9 | Controlled migration/backfill | implemented |

There is no tenth semantic build block.

Architecture rules remain unchanged: resonance is not equivalence; legacy existence is not V2 trust; migration remains staging-first and rollbackable; projection rewrites remain non-authoritative candidates; V2 quality does not inherit authority from legacy saturation.

## Read-only production foundation

The permanent production decision evidence established the read-only V2 foundation before any controlled write pilot:

```text
production decision checks: 12/12 green
migration first staging writes: 2
identical migration replay writes: 0
migration exact rollback: 2
staging after rollback: 0
live read-only Chat canaries: 3/3
minimum admitted V2 Chat quality: 0.93
unexpected persistence writes: 0
authority leaks: 0
```

Normal Chat V2 persistence remained closed.

## Production-verified one-record pilot

PRs #854–#857 established and production-proved the current verified write boundary:

```text
scope = single_local_chamber_insight
max Chamber records created = 1
manual/operator activation only
separate REVIEW approval
separate CANONICAL approval
separate ROLLBACK approval
exact signature-bound rollback
lifetime record budget remains consumed after rollback
```

Proof identity:

```text
production main:  486c9f53096e381bc9aeb4e20521d3700633366d
workflow run:     32411347026
workflow job:     96562241212
artifact id:      9422272974
artifact digest:  sha256:deb7f90b9151e867d71010bc909a7597c386716e62064264c171556d90e9f8fc
product diff:     0 files
```

Permanent proof:

`ops/evidence/aha-v2-controlled-write-pilot-live-proof-v1.json`

This remains the **production-verified max=1 boundary** until a corrected two-record activation proof is completed and permanentized.

## Two-record candidate and review correction

PR #858 added a fail-closed expansion decision gate. PR #859 selected the minimum bounded wider candidate:

```text
scope_id = bounded_local_chamber_two_record_candidate_v1
max_chamber_records_created = 2
activation_mode = manual_sequential
review/canonical/rollback approval = required per record
source binding = required per record
lifetime budget persists after rollback = true
batch activation = false
automatic activation = false
candidate_only = true
activation_authority = false
```

The initial temporary #860 proof appeared green and was permanentized by #861. Post-merge review then found five material weaknesses: mutable scope binding, missing replay cleanup, missing rollback-remove compensation, IndexedDB count-only comparison, and drift only on the first rollback target.

PR #865 therefore fail-closed the gate and hardened the rehearsal runtime. The historical #860 proof was retained as provenance but withdrawn as current authority.

## Cross-tab activation hardening

The activation implementation created in #862 also received post-merge review. A P1 showed that two operator tabs could race independent rollbacks against stale shared snapshots.

PR #866 fixed this with an exclusive same-origin Web Lock across the complete rollback transaction and added an adversarial two-wrapper stale-snapshot regression.

Current runtime state:

```text
cross-instance rollback serialization missing = false
exclusive same-origin rollback lock             = implemented
fresh state read inside lock                    = implemented
raw rollback + verification inside lock         = implemented
browser without Web Locks                       = fail closed
```

That runtime P1 is resolved.

## Corrected two-record gate/rehearsal proof — #867

Temporary PR #867 was created from production main `cc82b9a4b3cab6fdd62472f62facb025fbea4b75`, contained exactly two TEMP files and zero product diff, and was closed without merge after a green corrected proof.

Proof identity:

```text
TEMP PR:          #867 — closed without merge
probe head:       84e1f101079591968150832c902b01b1c9d08c8a
workflow run:     32421978733
workflow job:     96595761534
artifact id:      9426036702
artifact digest:  sha256:86051351653dd468180d4a91d5df07ebb51635baf9ff14ab31cf6d2fde82de41
product diff:     0 files
TEMP files:       2
Pages:            exact expected main, built, attempt 1
```

Five selected deployed assets matched production main byte-for-byte. The proof captured those deployed bytes and executed the same hash-verified copies, eliminating the refetch ambiguity present in earlier proof designs.

Corrected evidence demonstrated:

```text
immutable max=2 scope mutation            blocked
first apply writes                        2
identical replay writes                   0
identical replay no-ops                   2
normal rollback                           exact, count 2
partial apply failure compensation        exact
rollback remove failure                   compensated exactly
replay failure cleanup                    exact
state drift target                        record 2
rolled back before later drift detected   0
record 1 preserved                        true
full sentinel contents preserved          true
localStorage unchanged                    true
sessionStorage unchanged                  true
IndexedDB snapshot mode                   stable_keys_values_sha256
IndexedDB content digest unchanged        true
unexpected requests                       0
unexpected write requests                 0
page errors                               0
console errors                            0
```

Permanent proof:

`ops/evidence/aha-v2-two-record-expansion-live-proof-v1.json`

Status:

```text
production_evidence_verified
proof_revision = corrected_v2
```

The old #860 identity remains under superseded provenance for auditability.

## Current expansion decision

Machine-readable evidence:

`ops/evidence/aha-v2-controlled-write-expansion-gate-current-v1.json`

Current decision:

```text
BOUNDED_EXPANSION_PILOT_ELIGIBLE
required checks: 12
passed: 12
failed: 0
blockers: 0
```

The gate still explicitly returns:

```text
eligible_for_expansion_activation = false
eligible_for_normal_chat_persistence = false
current_one_record_pilot_max_records = 1
current_one_record_pilot_budget_may_change = false
expansion_runtime_open = false
```

This is eligibility for the bounded activation proof path, not production verification of the two-record write boundary.

## Activation implementation vs activation proof

The two-record activation implementation already exists and is cross-tab hardened:

```text
js/ahaV2ControlledWriteExpansionActivation.js
js/ahaInsightExpansionOperatorV2.js
insight-expansion-v2.html
```

The historical activation production proof from #863/#864 remains **invalidated pending corrected activation proof**.

The upstream gate issue has now been corrected; the remaining activation-proof gaps are narrower and independent:

1. #863 did not hash-bind the exact controller bytes refetched for execution after parity;
2. #863 proved sentinel presence by ID, not complete sentinel-record equality.

Therefore current state is:

```text
semantic build                              9/9 implemented
one-record controlled-write pilot           production-verified, max=1
two-record gate/rehearsal evidence           corrected, 12/12 green
two-record activation implementation         exists + cross-tab hardened
two-record activation production proof       pending corrected replacement
normal/broad V2 persistence                  closed
```

## What is actually production-verified now

```text
manual local review-queue write      OPEN inside one-record pilot
manual local Chamber write           OPEN inside one-record pilot, max 1 lifetime record
exact rollback                       OPEN for that one-record pilot
```

Not yet promoted to a production-verified wider boundary:

```text
two-record activation                PENDING corrected activation proof
normal Chat automatic V2 persistence CLOSED
automatic Chamber activation         CLOSED
batch activation                     CLOSED
backend persistent V2 sync           CLOSED
automatic projection writes          CLOSED
automatic legacy backfill            CLOSED
Meta write authority                 CLOSED
remote V2 write authority            CLOSED
```

## Next phase

The next engineering phase is **not another activation implementation PR**. The implementation already exists.

The next valid step is one corrected, isolated, non-merged activation production proof that must demonstrate:

1. exact deployed activation/operator/gate bytes are hash-bound to expected main and those same verified bytes are executed;
2. exact operator intent reaches the bounded two-record path;
3. two distinct source-bound records are created with independent REVIEW/CANONICAL approvals;
4. a third write is blocked;
5. repository save/load calls remain 0/0;
6. record-2 rollback preserves record 1 and the complete unrelated sentinel record;
7. record-1 rollback is exact;
8. cross-tab rollback remains serialized under the production Web Lock;
9. lifetime count remains 2 after rollback and a fresh wrapper still blocks record 3;
10. all broad/automatic/backend/projection/Meta/remote authorities remain false;
11. no user production data is modified;
12. the TEMP PR closes without merge.

Only after that corrected activation proof is permanentized may the production-verified write boundary move from max=1 to the exact bounded max=2 scope.

## Regressions

Core rollout regressions now include:

```text
tests/aha-v2-production-write-gate.test.cjs
tests/aha-v2-controlled-write-pilot-live-proof.test.cjs
tests/aha-v2-controlled-write-expansion-gate.test.cjs
tests/aha-v2-controlled-write-expansion-rehearsal.test.cjs
tests/aha-v2-controlled-write-expansion-hardening.test.cjs
tests/aha-v2-controlled-write-expansion-cross-tab-rollback.test.cjs
tests/aha-v2-two-record-expansion-live-proof.test.cjs
tests/aha-v2-controlled-write-expansion-activation.test.cjs
tests/aha-v2-two-record-expansion-activation-live-proof.test.cjs
```

Authoritative status:

> **Insight Engine V2 build: 9/9 implemented. One-record controlled-write pilot: production-verified, max=1. Corrected two-record gate: 12/12 green. Two-record activation implementation: present and cross-tab hardened. Corrected activation production proof: still pending. Broad/normal V2 persistence: CLOSED.**
