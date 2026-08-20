# AHA Insight Engine V2 — controlled write expansion gate

Date: 2026-08-20

## Purpose

`AHAV2ControlledWriteExpansionGate` is a pure decision layer for any proposal wider than the original one-record local Chamber pilot. It never executes writes, prepares approvals, changes budgets or opens normal Chat persistence.

The exact selected scope is:

`bounded_local_chamber_two_record_candidate_v1`

The expansion decision is permanently:

> **BOUNDED_EXPANSION_PILOT_ELIGIBLE**

Decision checks:

```text
required: 12
passed:   12
failed:    0
blockers:  0
```

The decision-only gate itself still reports:

```text
eligible_for_bounded_expansion_pilot = true
eligible_for_expansion_activation    = false
eligible_for_normal_chat_persistence = false
current_one_record_pilot_max_records = 1
current_one_record_pilot_budget_may_change = false
expansion_runtime_open               = false
```

Those fields describe what the **gate itself may authorize directly**. They are intentionally unchanged even after a separate activation PR is merged: the gate cannot activate anything by itself.

## Exact selected scope

Scope contract:

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
scope_fingerprint = ee6952eef3517af8a868c83e4424125c70591af42ff4f568e76a8bba4aa3b5f8
```

Two records are the minimum possible expansion beyond the production-verified one-record pilot.

## Isolated rehearsal — PR #859

`js/ahaV2ControlledWriteExpansionRehearsal.js` uses only the dedicated `v2_expansion_rehearsal_staging` adapter scope.

The regression proves:

```text
first apply writes:                  2
identical replay writes:             0
identical replay no-ops:             2
exact rollback:                      2
exact pre-run state restored:        true
partial-failure compensation:        exact
state drift:                         fail closed before partial delete
unrelated sentinel preserved:        true
```

It cannot access Chamber, backend, Meta, projection stores or normal Chat persistence.

## Decision production evidence — PR #860 / #861

Temporary PR #860 proved the exact scope against deployed GitHub Pages and was closed without merge. PR #861 permanentized that decision evidence.

Proof identity:

```text
production main:  2a0c6e0b19d92681cc4a51bd46efc3e2b824fc8c
workflow run:     32415006998
workflow job:     96574038093
artifact id:      9423564833
artifact digest:  sha256:a2a30b3e0380345dddf346f090780fda4cec5c7497865cf91878b61622d504d6
product diff:     0 files
```

Permanent decision proof:

`ops/evidence/aha-v2-two-record-expansion-live-proof-v1.json`

Current gate evidence:

`ops/evidence/aha-v2-controlled-write-expansion-gate-current-v1.json`

The decision proof established two canaries, exact rollback, exact partial-failure compensation, idempotent replay, fail-closed state drift, exact deploy parity, zero unexpected writes, redaction and zero wider authority leaks.

## Separate activation — PR #862

The green gate did not itself open the two-record scope. PR #862 separately added:

```text
js/ahaV2ControlledWriteExpansionActivation.js
insight-expansion-v2.html
js/ahaInsightExpansionOperatorV2.js
```

The activation wrapper uses the existing `AHAInsightActivationV2` controller and adds only the exact two-record lifetime/concurrency boundary already evidenced by the gate.

The original one-record pilot remains unchanged. A prior one-record canonical creation counts as one of the two lifetime slots in the expansion wrapper.

## Post-activation production proof — PR #863

Temporary PR #863 proved the deployed two-record activation and was closed without merge.

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

Operator proof:

```text
no intent → about:blank:             true
no-intent Chat requests:             0
no-intent unexpected writes:         0
exact intent authorized:             true
exact-intent decision:               BOUNDED_EXPANSION_PILOT_ELIGIBLE
exact-intent unexpected writes:      0
page/console errors:                 0
```

Live activation proof:

```text
record 1: standardization-flexibility-v1.json, quality 0.832889
record 2: constraints-creativity-v1.json, quality 0.85084
model: gpt-4.1-mini-2025-04-14
distinct sources:                    true
distinct candidate signatures:       true
review changed Chamber:              false / false
created records:                     2
third write:                         expansion_record_budget_exhausted
repository save/load calls:          0 / 0
sync push/pull:                       blocked before repository access
record 2 rollback:                   rolled_back
record 1 preserved after rollback 2: true
record 1 rollback:                   rolled_back
final Chamber:                       sentinel only
lifetime count after rollbacks:      2
fresh-wrapper third write:           expansion_record_budget_exhausted
```

Permanent post-activation proof:

`ops/evidence/aha-v2-two-record-expansion-activation-live-proof-v1.json`

Regression:

`tests/aha-v2-two-record-expansion-activation-live-proof.test.cjs`

## Current authority boundary

The decision gate remains pure/read-only. Separately, the exact scope it evaluated is now production-verified through the explicit activation and post-activation proof chain.

Current controlled local write boundary:

```text
manual local V2 review/canonical activation = OPEN
max lifetime canonical creations            = 2
manual sequential only                      = true
exact rollback                              = OPEN
third record                                = BLOCKED
```

Still closed:

```text
normal Chat V2 persistence           CLOSED
automatic activation                 CLOSED
batch activation                     CLOSED
automatic legacy backfill            CLOSED
backend sync                         CLOSED
backend persistent V2 write          CLOSED
broad canonical V2 write             CLOSED
projection-store writes              CLOSED
Meta writes                          CLOSED
remote V2 writes                     CLOSED
```

## Fail-closed regression

`tests/aha-v2-controlled-write-expansion-gate.test.cjs` continues to require current decision evidence to remain 12/12 green while every individual evidence requirement, unsafe scope mutation, baseline-proof mutation or wider authority flag independently returns the decision to `NO_GO`.

The new post-activation regression additionally binds #863 to the exact production runtime hashes and lifetime max=2 behavior.

## Completion boundary

No additional scope is implied by the two-record success. A third record or any automatic/broad persistence path requires a new explicit decision contract and fresh evidence; nothing in the current gate or activation grants that authority.

Authoritative status:

> **Expansion decision: 12/12 green. Exact two-record local activation: production-verified. Current controlled write maximum: 2 lifetime records. Third write fails closed. Broad/normal V2 persistence: CLOSED.**
