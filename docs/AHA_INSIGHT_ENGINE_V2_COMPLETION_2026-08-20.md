# AHA Insight Engine V2 — nine-block completion status (2026-08-20)

This document is the authoritative completion boundary for the nine-block semantic Insight Engine V2 rebuild and its controlled production rollout.

## Nine-block build

All **9/9 semantic build blocks are implemented**:

| Block | Scope | Status |
|---|---|---|
| 1 | SemanticDocument, evidence and provenance | implemented |
| 2 | Entities and meaningful concepts | implemented |
| 3 | Normalized claims and typed relations | implemented |
| 4 | Separate source-direct semantic model call | implemented |
| 5 | Insight Synthesis V2 + quality gate | implemented and production-measured |
| 6 | Equivalence vs resonance | implemented in PR #836 |
| 7 | Insight Saturation V2 + quality-aware Meta | implemented in PR #837 |
| 8 | Shared semantic projections | implemented in PR #838 |
| 9 | Controlled migration/backfill | implemented in PR #839 |

There is no tenth semantic build block.

Architecture rules remain unchanged:

- resonance is not equivalence and is never dedupe by itself;
- legacy object existence is not V2 trust;
- migration is dry-run/staging-first and exact-rollback capable;
- List/Path/Mindmap rewrites remain non-authoritative candidates;
- V2 quality does not inherit authority from legacy `avg_saturation`.

## Read-only production rollout

After 9/9 completion, V2 stayed read-only while the production boundary was closed through PRs #840–#853.

Permanent production evidence established:

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

Decision:

> **CONTROLLED_WRITE_PILOT_ELIGIBLE**

Normal Chat V2 persistence remained closed.

## Production-verified one-record controlled-write pilot

PR #854 activated only the explicitly bounded local pilot permitted by the green decision gate. PR #855 hardened the browser boot boundary. Temporary PR #856 proved the deployed pilot and was closed without merge; PR #857 permanentized that proof.

Pilot boundary:

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

The one-record pilot remains **production-verified**. The later two-record review does not invalidate it.

## Permanent synthesis quality baseline

The source-bound synthesis baseline remains:

```text
round 1: 6/6 valid, V2 semantic-review F1 1.0
round 2: 6/6 valid, V2 semantic-review F1 1.0
```

The controlled-write work supplements this baseline; it does not replace it.

## Two-record expansion candidate

PR #858 introduced a pure fail-closed expansion decision gate. PR #859 selected the minimum bounded expansion beyond max=1: exactly two local Chamber records.

Scope contract:

`ops/contracts/aha-v2-controlled-write-expansion-scope-two-record-v1.json`

```text
scope_id = bounded_local_chamber_two_record_candidate_v1
max_chamber_records_created = 2
activation_mode = manual_sequential
review/canonical/rollback approval = required per record
source binding = required per record
lifetime budget persists after rollback = true
unrelated Chamber state preserved = true
batch activation = false
automatic activation = false
candidate_only = true
activation_authority = false
```

The candidate scope itself remains valid, but it is **not currently eligible for activation**.

## #860 proof — historical but invalidated as current authority

Temporary PR #860 captured an initially green-looking two-record production proof and was correctly closed without merge. PR #861 permanentized that result and temporarily moved the decision to 12/12 green.

Historical proof identity:

```text
production main:  2a0c6e0b19d92681cc4a51bd46efc3e2b824fc8c
TEMP PR:          #860 — closed without merge
workflow run:     32415006998
workflow job:     96574038093
artifact id:      9423564833
artifact digest:  sha256:a2a30b3e0380345dddf346f090780fda4cec5c7497865cf91878b61622d504d6
product diff:     0 files
Pages status:     built, exact main on attempt 1
```

Post-merge review then found five material gaps:

1. the rehearsal accepted a modified scope when the retained fingerprint merely looked like SHA-256;
2. a second/replay apply failure could leave the first apply in staging;
3. a rollback `remove` failure after an earlier successful removal could leave a partial rollback;
4. IndexedDB was compared by store row count rather than stable key/value contents;
5. the drift test modified the first rollback record and therefore did not prove all-target preflight against drift on a later record.

The historical proof is retained at:

`ops/evidence/aha-v2-two-record-expansion-live-proof-v1.json`

Its current status is:

```text
invalidated_by_post_merge_review
current_gate_usable = false
fresh_corrected_production_proof_required = true
```

The old observation is useful provenance, but it no longer authorizes a green expansion decision.

## Hardened two-record rehearsal

The rehearsal runtime is hardened to fail closed on the review findings:

- exact two-record scope ID is pinned;
- exact scope fingerprint is pinned;
- exact max=2 is pinned;
- replay failure cleans up the first apply before rethrow;
- rollback remove failure compensates already-removed records back to exact pre-run state;
- drift preflight covers every target before destructive rollback begins.

Regression coverage now includes:

```text
tests/aha-v2-controlled-write-expansion-rehearsal.test.cjs
tests/aha-v2-controlled-write-expansion-hardening.test.cjs
```

The hardening regression explicitly checks forged max=3 scope, replay cleanup, remove-failure compensation and drift on record 2.

## Current two-record decision

Machine-readable evidence:

`ops/evidence/aha-v2-controlled-write-expansion-gate-current-v1.json`

Current decision:

```text
NO_GO
required checks: 12
passed: 6
failed: 6
```

Current blockers:

```text
expansion_no_write_observation_missing
expansion_production_canary_proof_missing
idempotent_multi_record_replay_proof_missing
multi_record_rollback_proof_missing
multi_record_state_drift_proof_missing
partial_failure_compensation_proof_missing
```

The gate still guarantees:

```text
eligible_for_expansion_activation = false
eligible_for_normal_chat_persistence = false
current_one_record_pilot_max_records = 1
current_one_record_pilot_budget_may_change = false
expansion_runtime_open = false
```

## What is actually open now

Production-verified one-record pilot:

```text
manual local review-queue write      OPEN inside one-record pilot
manual local Chamber write           OPEN inside one-record pilot, max 1 lifetime record
exact rollback                       OPEN for that record
```

Two-record expansion:

```text
scope contract                       DEFINED
hardened rehearsal runtime           IMPLEMENTED
current production decision          NO_GO
activation implementation            CLOSED
production write budget              STILL max 1
```

Everything broader remains deliberately closed:

```text
normal Chat automatic V2 persistence       CLOSED
automatic Chamber activation               CLOSED
batch activation                           CLOSED
broad canonical V2 write                   CLOSED
backend persistent V2 sync                 CLOSED
automatic product-store projection writes  CLOSED
automatic legacy backfill                   CLOSED
Meta write authority                       CLOSED
remote V2 write authority                  CLOSED
```

## Required corrected production proof

The next valid engineering phase is **fresh temporary production reproof of the hardened two-record candidate**, not activation.

The replacement proof must demonstrate:

1. exact immutable scope binding to the canonical ID, fingerprint and max=2;
2. first apply writes 2;
3. identical replay writes 0 and returns 2 no-ops;
4. replay failure cleans up the first apply to exact pre-run state;
5. exact rollback of both records;
6. rollback remove failure compensates exact pre-run state;
7. drift on record 2 blocks removal of record 1;
8. unrelated sentinel/state remains unchanged;
9. localStorage/sessionStorage remain unchanged;
10. IndexedDB is compared by stable key/value digest, not count;
11. unexpected persistence write requests remain 0;
12. deployed hardened assets match the expected candidate main and all broader authorities remain false.

Only after that proof is green may the decision gate return to `BOUNDED_EXPANSION_PILOT_ELIGIBLE`. Even then, a **separate explicit activation PR** plus fresh post-activation production proof remain mandatory.

## Regressions

Core rollout regressions include:

```text
tests/aha-v2-production-write-gate.test.cjs
tests/aha-v2-controlled-write-pilot-live-proof.test.cjs
tests/aha-v2-controlled-write-expansion-gate.test.cjs
tests/aha-v2-controlled-write-expansion-rehearsal.test.cjs
tests/aha-v2-controlled-write-expansion-hardening.test.cjs
tests/aha-v2-two-record-expansion-live-proof.test.cjs
```

Authoritative status:

> **Insight Engine V2 build: 9/9 implemented. One-record local controlled-write pilot: production-verified, max=1. Two-record candidate: hardened but current decision NO_GO pending corrected production reproof. Two-record activation: CLOSED. Broad/normal V2 persistence: CLOSED.**
