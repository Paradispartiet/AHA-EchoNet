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

Permanent read-only proof:

```text
production decision checks:      12/12 green
migration first staging writes:  2
identical migration replay:      0 writes
migration exact rollback:        2
staging after rollback:          0
live read-only Chat canaries:     3/3
minimum admitted V2 quality:     0.93
unexpected persistence writes:   0
authority leaks:                  0
```

Decision:

> **CONTROLLED_WRITE_PILOT_ELIGIBLE**

Permanent evidence:

```text
ops/evidence/aha-v2-production-write-gate-current-v1.json
ops/evidence/aha-v2-live-production-proof-2026-08-20.json
```

Normal Chat V2 persistence remained closed.

## One-record controlled-write pilot

PR #854 activated only the explicitly bounded local one-record pilot. PR #855 hardened the browser boot boundary. Temporary PR #856 proved it and was closed without merge; PR #857 permanentized that proof.

Permanent proof:

`ops/evidence/aha-v2-controlled-write-pilot-live-proof-v1.json`

The one-record proof established:

```text
max lifetime records:                 1
second write before rollback:         blocked
exact rollback:                       proven
fresh-wrapper second write:           blocked
repository save/load calls:           0 / 0
unrelated sentinel preserved:         true
wider authority opened:               false
```

## Two-record expansion decision

PR #858 added a pure fail-closed expansion decision gate. PR #859 selected the minimum possible bounded expansion: exactly two local Chamber records, manual sequential, separate review/canonical/rollback approval per record, source binding per record, lifetime budget preserved after rollback, and no automatic/batch authority.

Scope contract:

`ops/contracts/aha-v2-controlled-write-expansion-scope-two-record-v1.json`

PR #860 then proved the two-record decision evidence on GitHub Pages and was closed without merge. PR #861 permanentized the result.

Permanent decision proof:

`ops/evidence/aha-v2-two-record-expansion-live-proof-v1.json`

Expansion decision:

```text
BOUNDED_EXPANSION_PILOT_ELIGIBLE
required checks: 12
passed:          12
failed:           0
blockers:         0
```

The gate itself remains decision-only and cannot execute activation.

## Two-record activation

PR #862 added the separate fail-closed activation implementation for the exact scope already evidenced by #860/#861:

```text
js/ahaV2ControlledWriteExpansionActivation.js
insight-expansion-v2.html
js/ahaInsightExpansionOperatorV2.js
```

The implementation keeps the old one-record operator untouched and wraps the existing production-proven `AHAInsightActivationV2` controller rather than creating another persistence engine.

The production runtime commit for this activation is:

`4b74504a25a4b41585c3c62280a7ec275356d4b6`

## Two-record activation is production-verified

Temporary PR #863 proved the post-activation runtime and was closed without merge.

Proof identity:

```text
production main:   4b74504a25a4b41585c3c62280a7ec275356d4b6
TEMP PR:           #863 — closed without merge
TEMP branch head:  f0ac1dc915b2246bff5284f491e1b3fd9e910b2b
workflow run:      32416552359
workflow job:      96578895412
artifact id:       9424127989
artifact digest:   sha256:bd9c046d754d3266504abfff026ed575bf03beccc804cbf129448fbfe400f0a0
product diff:      0 files
Pages status:      built, exact main on attempt 1
```

Twelve selected activation/operator/evidence/safety assets matched production main byte-for-byte.

Operator boundary:

```text
no-intent iframe:                  about:blank
no-intent Chat requests:           0
no-intent unexpected writes:       0
exact-intent authorized:           true
exact-intent gate decision:        BOUNDED_EXPANSION_PILOT_ELIGIBLE
exact-intent unexpected writes:    0
page/console errors:               0
```

Live source-bound activation:

```text
record 1 fixture:                  standardization-flexibility-v1.json
record 1 quality:                  0.832889
record 2 fixture:                  constraints-creativity-v1.json
record 2 quality:                  0.85084
model:                             gpt-4.1-mini-2025-04-14
distinct sources:                  true
distinct candidate signatures:     true
review changed Chamber:            false / false
created record count:              1 → 2
third write:                       expansion_record_budget_exhausted
repository save/load calls:        0 / 0
sync push/pull:                     blocked before repository access
```

Rollback:

```text
record 2 rollback:                 rolled_back
record 1 preserved after rollback: true
record 1 rollback:                 rolled_back
final Chamber:                     sentinel only
unrelated sentinel preserved:      true
lifetime count after rollbacks:    2
fresh-wrapper third write:         expansion_record_budget_exhausted
audit events:                      18
```

No user production data was modified; the controlled write proof used an in-memory Chamber fixture and stored no raw source text, evidence quotes, candidate signatures or canonical signatures in the evidence artifact.

Permanent proof:

`ops/evidence/aha-v2-two-record-expansion-activation-live-proof-v1.json`

Regression:

`tests/aha-v2-two-record-expansion-activation-live-proof.test.cjs`

## Permanent synthesis quality baseline

The source-bound synthesis baseline remains:

```text
round 1: 6/6 valid, V2 semantic-review F1 1.0
round 2: 6/6 valid, V2 semantic-review F1 1.0
```

The later one-record and two-record live activation proofs supplement this baseline; they do not replace it.

## What is actually open now

Production-verified controlled local V2 activation:

```text
manual review-queue write            OPEN
manual local Chamber write           OPEN, max 2 lifetime canonical creations
exact rollback                       OPEN for those controlled records
```

The earlier one-record pilot remains a valid narrower historical boundary, but the current production-verified controlled write maximum is now **2 lifetime local records** under the exact two-record scope.

## What remains deliberately closed

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

No success in the two-record chain authorizes a third record or any broad/automatic persistence path.

## Core regressions

```text
tests/aha-v2-production-write-gate.test.cjs
tests/aha-v2-controlled-write-pilot-live-proof.test.cjs
tests/aha-v2-controlled-write-expansion-gate.test.cjs
tests/aha-v2-controlled-write-expansion-rehearsal.test.cjs
tests/aha-v2-two-record-expansion-live-proof.test.cjs
tests/aha-v2-controlled-write-expansion-activation.test.cjs
tests/aha-insight-expansion-operator-v2.test.cjs
tests/aha-v2-two-record-expansion-activation-live-proof.test.cjs
```

## Completion boundary

The work started as the nine-block semantic V2 rebuild and then deliberately passed through read-only production proof, one-record controlled activation, a separate expansion decision gate, isolated two-record rehearsal, two-record decision proof, separate activation and post-activation production proof.

That bounded rollout is now closed at the intended current scope.

Authoritative status:

> **Insight Engine V2 build: 9/9 implemented. Read-only production proof: complete. One-record controlled pilot: production-verified. Two-record expansion decision: 12/12 green. Two-record local activation: production-verified. Current controlled write boundary: max 2 lifetime local records. Third write fails closed. Broad/normal V2 persistence: CLOSED.**
