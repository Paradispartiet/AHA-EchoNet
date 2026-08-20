# AHA Insight Engine V2 — controlled write expansion gate

Date: 2026-08-20

## Purpose

The production-verified one-record local Chamber pilot remains the active write boundary. A successful one-record pilot is not itself authority to widen persistence.

`AHAV2ControlledWriteExpansionGate` is a pure decision layer. It can decide whether one exact bounded expansion scope has enough evidence to proceed to a **separate activation PR**. It cannot execute writes, prepare activation, approve activation, change the existing one-record budget or open normal Chat persistence.

Current decision:

> **BOUNDED_EXPANSION_PILOT_ELIGIBLE**

This is a decision-only result:

```text
eligible_for_bounded_expansion_pilot = true
eligible_for_expansion_activation    = false
eligible_for_normal_chat_persistence = false
current_one_record_pilot_max_records = 1
current_one_record_pilot_budget_may_change = false
expansion_runtime_open               = false
```

## Exact selected scope

PR #859 selected the minimum possible bounded expansion beyond max=1:

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

Two records were chosen because this is the smallest possible expansion that can exercise multi-record rollback, compensation and lifetime-budget behavior. The contract grants no production write authority.

## Isolated multi-record rehearsal

PR #859 also added:

`js/ahaV2ControlledWriteExpansionRehearsal.js`

The module is restricted to the dedicated adapter scope:

`v2_expansion_rehearsal_staging`

It does not access Chamber, backend, Meta, projection stores, normal Chat persistence or remote state.

The permanent regression proves:

- first apply writes exactly 2 synthetic staging records;
- identical replay writes 0 and produces 2 no-ops;
- exact rollback removes both records and restores exact pre-run state;
- partial failure after record 2 has actually been written compensates both targets back to exact pre-run state;
- changed target state fails closed before either target is removed;
- unrelated sentinel state is preserved;
- the active production one-record pilot remains max=1.

Regression:

`tests/aha-v2-controlled-write-expansion-rehearsal.test.cjs`

## Production evidence

Temporary PR #860 proved the exact scope against deployed GitHub Pages and was closed without merge.

Proof identity:

```text
production main:  2a0c6e0b19d92681cc4a51bd46efc3e2b824fc8c
TEMP PR:          #860 — closed without merge
workflow run:     32415006998
workflow job:     96574038093
artifact id:      9423564833
artifact digest:  sha256:a2a30b3e0380345dddf346f090780fda4cec5c7497865cf91878b61622d504d6
probe head:       b022c357f6b637a1fbf36025a164fcc848d5006b
product diff:     0 files
```

GitHub Pages was the frontend proof authority. Pages reported the exact expected main as `built` on the first attempt.

Five selected expansion/baseline assets matched the expected production main byte-for-byte:

```text
js/ahaV2ControlledWriteExpansionGate.js
  f48e41689cce50e3af59cd809f47a36d9f40205721e520931b4e977bdb032316
js/ahaV2ControlledWriteExpansionRehearsal.js
  86da0bd015187e0ea6f4825032d9eb085ca1d307116fcd6ab72d44130b27fe58
ops/contracts/aha-v2-controlled-write-expansion-scope-two-record-v1.json
  2ddca1adc4c66e76189da6fc96713279b1c4c03201a4ed352d0629234ab6d9a8
ops/evidence/aha-v2-controlled-write-pilot-live-proof-v1.json
  77563a44f2da01456c5dd1b5f57abbb86d94b26e87f4644e0419ca49552dd303
insight-activation-v2.html
  cd6e7e25c6b5b1a48caec584d23517a015c3a272e9a51cb54b7380a11057e6ac
```

## Live two-record evidence

The two synthetic production canaries covered the full proposed record budget:

```text
canary count:                         2
first apply writes:                   2
identical replay writes:              0
identical replay no-ops:              2
rollback:                             rolled_back
rollback exact:                       true
rollback count:                       2
exact pre-run state restored:         true
partial-failure compensation:         compensated
partial-failure compensation exact:   true
state-drift result:                   manual_review_required
state-drift partial rollback count:   0
unrelated sentinel preserved:         true
```

Browser boundary:

```text
localStorage unchanged:       true
sessionStorage unchanged:     true
IndexedDB unchanged:          true
unexpected write requests:    0
page errors:                  0
console errors:               0
user production data changed: false
```

The evidence artifact contains no raw source text, evidence quotes or signatures.

Permanent proof:

`ops/evidence/aha-v2-two-record-expansion-live-proof-v1.json`

Regression:

`tests/aha-v2-two-record-expansion-live-proof.test.cjs`

## Required checks — current result

All twelve expansion-decision checks are now green:

1. production-verified one-record pilot proof remains valid and permanent;
2. exact bounded expansion scope contract exists;
3. exact multi-record rollback + unrelated-state preservation proven;
4. partial-failure compensation restores exact pre-run state;
5. identical multi-record replay is idempotent with zero writes;
6. changed/drifting state fails closed;
7. production canaries cover the full proposed budget of 2;
8. deployed candidate commit exactly matches candidate main;
9. no unexpected persistence write observed;
10. no authority leak observed and broader authorities remain false;
11. production evidence is redacted;
12. current max=1 pilot remains unchanged and separate activation + fresh post-activation proof remain mandatory.

Machine-readable current evidence:

`ops/evidence/aha-v2-controlled-write-expansion-gate-current-v1.json`

Current result:

```text
decision: BOUNDED_EXPANSION_PILOT_ELIGIBLE
required checks: 12
passed: 12
failed: 0
blockers: 0
```

## Authority boundary

A green expansion decision does **not** activate the two-record scope.

Still closed:

```text
expansion activation runtime         CLOSED
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

The current one-record pilot remains max=1 until a separate activation implementation is reviewed, merged and then independently production-proven.

## Fail-closed regression

Primary decision regression:

`tests/aha-v2-controlled-write-expansion-gate.test.cjs`

It now proves that current real evidence evaluates 12/12 green, while every individual evidence requirement, unsafe scope mutation, baseline-proof mutation and broader authority flag independently returns the decision to `NO_GO`.

The gate remains deterministic and contains no storage, fetch or persistence API.

## Next valid step

The only next valid step is a **separate explicit activation PR for this exact two-record scope**. That activation must remain manual and sequential, require separate review/canonical/rollback approval per record, preserve lifetime budget after rollback, preserve unrelated Chamber state and keep all broader authorities false.

After that activation merges, a fresh temporary GitHub Pages/browser proof must demonstrate the actual two-record operator path, a blocked third write, exact rollback and post-rollback budget exhaustion before the expansion can be called production-verified.

Authoritative status:

> **One-record pilot: production-verified. Two-record expansion decision: 12/12 green and eligible for a separate activation PR. Two-record activation: NOT YET OPEN. Broad/normal V2 persistence: CLOSED.**
