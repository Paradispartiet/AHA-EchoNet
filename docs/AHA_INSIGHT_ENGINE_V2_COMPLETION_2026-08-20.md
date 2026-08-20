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

Architecture rules remain unchanged:

- resonance is not equivalence and is never dedupe by itself;
- legacy object existence is not V2 trust;
- migration is dry-run/staging-first and exact-rollback capable;
- List/Path/Mindmap rewrites remain non-authoritative candidates;
- V2 quality does not inherit authority from legacy `avg_saturation`.

There is no tenth semantic build block.

## Read-only production rollout

After 9/9 completion, V2 stayed read-only while the production boundary was closed through PRs #840–#853.

The permanent production decision evidence established:

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

Permanent evidence:

```text
ops/evidence/aha-v2-production-write-gate-current-v1.json
ops/evidence/aha-v2-live-production-proof-2026-08-20.json
```

Normal Chat V2 persistence remained closed.

## Production-verified one-record controlled-write pilot

PR #854 activated only the explicitly bounded local pilot permitted by the green decision gate. PR #855 hardened the browser boot boundary.

Pilot shape:

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

Temporary PR #856 proved the deployed one-record pilot and was closed without merge.

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

The live proof demonstrated one local record, blocked second write before rollback, exact rollback, blocked second write after a fresh wrapper/reload, repository save/load calls 0/0, sentinel preservation and no wider authority.

## Permanent synthesis quality baseline

The source-bound synthesis baseline remains:

```text
round 1: 6/6 valid, V2 semantic-review F1 1.0
round 2: 6/6 valid, V2 semantic-review F1 1.0
```

The later one-record pilot proof supplements this baseline; it does not replace it.

## Two-record expansion evidence

PR #858 introduced a pure fail-closed expansion decision gate. It initially returned `NO_GO` until a specific wider scope was selected and proven.

PR #859 selected the **minimum bounded multi-record scope: exactly two local Chamber records** and added a candidate-only isolated rehearsal.

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

The isolated rehearsal proved:

```text
first apply writes:                    2
identical replay writes:               0
identical replay no-ops:               2
exact rollback count:                  2
exact pre-run state restored:          true
partial-failure compensation:          exact
state drift:                           fail closed before partial delete
unrelated sentinel preserved:          true
```

## Two-record production decision proof

Temporary PR #860 proved the exact two-record candidate scope against deployed GitHub Pages and was closed without merge.

Proof identity:

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

Five selected expansion/baseline assets matched production main byte-for-byte.

Live evidence:

```text
production canaries:                   2/2
first apply writes:                    2
identical replay writes:               0
rollback:                              rolled_back
rollback count:                        2
partial-failure compensation exact:    true
state-drift result:                    manual_review_required
state-drift partial rollback count:    0
localStorage unchanged:                true
sessionStorage unchanged:              true
IndexedDB unchanged:                   true
unexpected write requests:             0
page errors:                           0
console errors:                        0
user production data modified:         false
```

Permanent proof:

`ops/evidence/aha-v2-two-record-expansion-live-proof-v1.json`

Current expansion-decision evidence:

`ops/evidence/aha-v2-controlled-write-expansion-gate-current-v1.json`

Current expansion decision:

```text
BOUNDED_EXPANSION_PILOT_ELIGIBLE
required checks: 12
passed: 12
failed: 0
blockers: 0
```

Crucially, the gate still returns:

```text
eligible_for_expansion_activation = false
current_one_record_pilot_max_records = 1
current_one_record_pilot_budget_may_change = false
expansion_runtime_open = false
```

A separate activation PR and fresh post-activation production proof are still mandatory.

## What is actually open now

Production-verified one-record pilot:

```text
manual local review-queue write      OPEN inside one-record pilot
manual local Chamber write           OPEN inside one-record pilot, max 1 lifetime record
exact rollback                       OPEN for that record
```

Two-record expansion:

```text
decision evidence                    GREEN 12/12
activation implementation            NOT YET OPEN
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
remote V2 write authority                   CLOSED
```

## Regressions

Core rollout regressions include:

```text
tests/aha-v2-production-write-gate.test.cjs
tests/aha-v2-controlled-write-pilot-live-proof.test.cjs
tests/aha-v2-controlled-write-expansion-gate.test.cjs
tests/aha-v2-controlled-write-expansion-rehearsal.test.cjs
tests/aha-v2-two-record-expansion-live-proof.test.cjs
```

The expansion gate regression requires current real evidence to remain 12/12 green while independently failing closed to `NO_GO` for every missing evidence requirement, unsafe scope mutation, baseline-proof regression or wider authority flag.

## Next phase

The next valid engineering step is **not broad persistence**. It is a separate activation implementation for the already-evidenced exact two-record scope.

That activation must remain manual and sequential, enforce a lifetime budget of exactly two records, use separate review/canonical/rollback approvals per record, bind each record to its source, block a third record, preserve unrelated Chamber state and keep all normal Chat/backend/backfill/projection/Meta/remote authorities false.

After merge, a fresh temporary GitHub Pages/browser proof must demonstrate both real local records, blocked third write, exact rollback and post-rollback lifetime-budget exhaustion before the two-record expansion can be called production-verified.

Authoritative status:

> **Insight Engine V2 build: 9/9 implemented. Production decision gate: 12/12 green. One-record local controlled-write pilot: production-verified. Two-record expansion decision: 12/12 green and eligible for a separate activation PR. Two-record activation: NOT YET OPEN. Broad/normal V2 persistence: CLOSED.**
