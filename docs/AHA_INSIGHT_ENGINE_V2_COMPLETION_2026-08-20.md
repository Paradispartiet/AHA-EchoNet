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

The architecture rules remain unchanged:

- resonance is not equivalence and is never dedupe by itself;
- legacy object existence is not V2 trust;
- migration is dry-run/staging-first and exact-rollback capable;
- List/Path/Mindmap rewrites remain non-authoritative candidates;
- V2 quality does not inherit authority from legacy `avg_saturation`.

## Read-only production rollout

After the build completed, V2 stayed read-only while the production boundary was proven through:

```text
#840 trusted legacy → shared read-only projections
#841 bounded V2 Chat transport
#842 automatic read-only Chat context with new saving disabled
#843 explicit production decision gate
#844 isolated migration rehearsal
#846 one-record rollback readiness
#849 real Memory Runtime → Agent Runtime trust preservation
#851 live Chat bootstrap repair
#852 final migration + read-only Chat production proof
#853 permanent 12/12 green decision state
```

The final read-only gate proof established:

```text
production decision checks: 12/12 green
migration first staging writes: 2
identical migration replay writes: 0
migration exact rollback: 2
staging after rollback: 0
live Chat canaries: 3/3
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

## Bounded controlled-write pilot

PR #854 activated only the pilot shape already permitted by the green decision gate:

```text
scope = single_local_chamber_insight
max Chamber records created = 1
manual/operator activation only
separate REVIEW approval
separate CANONICAL approval
separate ROLLBACK approval
exact signature-bound rollback
```

The pilot uses `AHAInsightActivationV2` through the fail-closed `AHAV2ControlledWritePilotActivation` wrapper. It is not a new persistence engine.

The lifetime write budget is stored in the existing review history. Once any review receives `canonical_insight_id`, the budget is permanently consumed even if the record is later rolled back.

PR #855 hardened the browser boot boundary so the operator iframe remains `about:blank` until the exact pilot query parameter is present.

## Controlled-write pilot is now production-verified

Temporary PR #856 proved the deployed pilot and was closed without merge.

Proof identity:

```text
production main:  486c9f53096e381bc9aeb4e20521d3700633366d
workflow run:     32411347026
workflow job:     96562241212
artifact id:      9422272974
artifact digest:  sha256:deb7f90b9151e867d71010bc909a7597c386716e62064264c171556d90e9f8fc
product diff:     0 files
```

Ten deployed operator/write/safety assets matched production main byte-for-byte.

No-intent browser proof:

```text
iframe:             about:blank
controls disabled:  6/6
chat requests:      0
write requests:     0
page errors:        0
console errors:     0
```

Exact-intent pilot proof:

```text
production gate:                    CONTROLLED_WRITE_PILOT_ELIGIBLE
rollback readiness:                 ready
live synthesis eligible candidates: 1
selected quality score:             0.812283
review changed Chamber:             false
canonical records added:            1
record count after canonical:       1
second write before rollback:        pilot_record_budget_exhausted
repository calls:                    0 save / 0 load
rollback:                            rolled_back
sentinel preserved:                  true
record count after rollback:        1
fresh-wrapper second write:          pilot_record_budget_exhausted
audit events:                        9
user production data modified:       false
```

Permanent proof:

`ops/evidence/aha-v2-controlled-write-pilot-live-proof-v1.json`

Regression:

`tests/aha-v2-controlled-write-pilot-live-proof.test.cjs`

The regression binds the proof to the ten deployed asset hashes. A future change to a proved production surface therefore requires fresh live proof instead of silently inheriting this one.

## Permanent synthesis quality baseline

The source-bound synthesis baseline remains:

```text
round 1: 6/6 valid, V2 semantic-review F1 1.0
round 2: 6/6 valid, V2 semantic-review F1 1.0
```

The later pilot proof supplements this with a live eligible synthesis result at quality `0.812283`; it does not replace the permanent two-round quality baseline.

## What is actually open

Only the production-verified bounded pilot is open:

```text
manual local review-queue write      OPEN inside pilot
manual local Chamber write           OPEN inside pilot, max 1 total
exact rollback of that one record    OPEN inside pilot
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

## Expansion gate

The next-phase expansion decision layer is now defined in:

`js/ahaV2ControlledWriteExpansionGate.js`

It is pure and read-only. It does not increase the current write budget and cannot prepare or approve an activation.

Current machine-readable evidence:

`ops/evidence/aha-v2-controlled-write-expansion-gate-current-v1.json`

Current decision:

```text
NO_GO
required checks: 12
passed: 3
failed: 9
```

Current blockers:

```text
expansion_scope_contract_missing_or_invalid
multi_record_rollback_proof_missing
partial_failure_compensation_proof_missing
idempotent_multi_record_replay_proof_missing
multi_record_state_drift_proof_missing
expansion_production_canary_proof_missing
expansion_deploy_parity_missing
expansion_no_write_observation_missing
expansion_authority_leak_observation_missing
```

The gate deliberately does not invent a larger record quota. A future scope contract must explicitly define a finite multi-record budget, manual sequential activation, per-record review/canonical/rollback approvals, per-record source binding and a lifetime budget that remains consumed after rollback.

Even a fully green future expansion gate returns only `BOUNDED_EXPANSION_PILOT_ELIGIBLE`; it keeps `eligible_for_expansion_activation=false`, retains the current one-record pilot maximum at `1`, and requires a separate explicit activation PR plus fresh post-activation production proof.

Detailed contract:

`docs/AHA_INSIGHT_ENGINE_V2_CONTROLLED_WRITE_EXPANSION_GATE_2026-08-20.md`

Regression:

`tests/aha-v2-controlled-write-expansion-gate.test.cjs`

## Next phase

There is no tenth semantic build block and there is no automatic promotion to broader persistence.

The next valid engineering work is to close the expansion blockers without changing write authority: define one exact proposed scope, design multi-record exact rollback and partial-failure compensation, prove idempotence/state-drift behavior in isolation, and only then design production canaries for that exact scope.

Until those proofs exist, the authoritative status is:

> **Insight Engine V2 build: 9/9 implemented. Production decision gate: 12/12 green. One-record local controlled-write pilot: production-verified. Expansion gate: NO_GO. Broad/normal V2 persistence: CLOSED.**
