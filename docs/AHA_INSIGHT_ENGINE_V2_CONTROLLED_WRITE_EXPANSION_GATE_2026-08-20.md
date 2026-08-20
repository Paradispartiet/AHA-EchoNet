# AHA Insight Engine V2 — controlled write expansion gate

Date: 2026-08-20

## Purpose

The one-record local Chamber pilot is production-verified. That success is **not** authority to increase the write budget.

`AHAV2ControlledWriteExpansionGate` is a pure decision layer for any future proposal that would create more than one controlled local Chamber record. It does not activate an expansion and does not alter the existing pilot.

Current decision:

> **NO_GO**

Current one-record pilot:

```text
max Chamber records created = 1
manual review approval       = required
manual canonical approval    = required
manual rollback approval     = required
normal Chat persistence      = CLOSED
```

## No scope is invented

The gate deliberately does not choose a larger record budget.

A future expansion must first provide an explicit scope contract with:

```text
schema = aha_v2_controlled_write_expansion_scope_contract_v1
scope_id = explicit non-empty identifier
scope_fingerprint = 64-character immutable fingerprint
scope_kind = bounded_local_chamber_multi_record
max_chamber_records_created >= 2
activation_mode = manual_sequential
review_approval_per_record = true
canonical_approval_per_record = true
rollback_approval_per_record = true
source_binding_per_record = true
lifetime_budget_persists_after_rollback = true
unrelated_chamber_records_preserved = true
batch_activation = false
automatic_activation = false
```

The absence of a current scope contract is intentional. The system must not infer a larger quota merely because the one-record proof succeeded.

## Required checks

The gate has twelve required checks:

1. the production-verified one-record pilot proof remains valid and permanent;
2. an exact bounded expansion scope contract exists;
3. multi-record rollback is rehearsed with exact record binding and unrelated-state preservation;
4. partial-failure compensation restores exact pre-run state;
5. identical multi-record replay is idempotent and writes zero records;
6. changed/drifting multi-record state fails closed;
7. production canaries cover the full proposed record budget;
8. the deployed candidate commit exactly matches the candidate main commit;
9. no unexpected persistence write is observed;
10. no authority leak is observed and every broader authority remains false;
11. production evidence is redacted;
12. the existing one-record pilot stays capped at one and a separate activation PR plus fresh post-activation production proof remain mandatory.

A green gate would return only:

`BOUNDED_EXPANSION_PILOT_ELIGIBLE`

Even then:

```text
eligible_for_expansion_activation = false
eligible_for_normal_chat_persistence = false
current_one_record_pilot_max_records = 1
current_one_record_pilot_budget_may_change = false
expansion_runtime_open = false
```

A separate explicit activation PR would still be required for the exact evaluated scope.

## Current evidence

Machine-readable evidence:

`ops/evidence/aha-v2-controlled-write-expansion-gate-current-v1.json`

The baseline one-record proof is:

`ops/evidence/aha-v2-controlled-write-pilot-live-proof-v1.json`

Current gate result:

```text
decision: NO_GO
required checks: 12
passed: 3
failed: 9
```

The three currently satisfied checks are:

- production-verified one-record baseline proof;
- permanent proof redaction boundary;
- current one-record pilot boundary remains unchanged.

## Current blockers

Exactly nine blockers remain:

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

These are evidence blockers, not prompts to open write paths prematurely.

## Fail-closed scope rules

A scope contract is rejected if any of the following happens:

- record budget is still `1` or is otherwise not a larger bounded proposal;
- batch activation becomes true;
- automatic activation becomes true;
- any per-record review/canonical/rollback approval is removed;
- per-record source binding is removed;
- rollback would reopen the lifetime budget;
- unrelated Chamber state is not explicitly protected;
- the scope fingerprint is missing or malformed.

## Authority boundary

The expansion gate treats any of the following becoming true as an authority leak:

```text
normal_chat_persistence_open
automatic_backfill_open
backend_sync_open
backend_persistent_write_open
broad_canonical_write_open
projection_store_write_open
meta_write_open
remote_write_open
automatic_activation_open
batch_activation_open
```

All remain false in current evidence.

## Baseline proof remains authoritative

The expansion gate validates the permanent #856 one-record production proof before considering any wider scope. The baseline must continue to prove:

- exactly one record was created;
- second write was blocked before rollback;
- exact rollback succeeded;
- second write remained blocked after a fresh wrapper/reload;
- repository save/load calls remained 0/0;
- unrelated Chamber sentinel state survived;
- no-intent browser boot stayed closed;
- broader authority flags remained false.

If that baseline proof becomes invalid, expansion is automatically `NO_GO` regardless of any later evidence.

## Regression

Primary regression:

`tests/aha-v2-controlled-write-expansion-gate.test.cjs`

It proves:

- current real evidence evaluates to `NO_GO` with the exact nine blockers;
- the real #856 one-record proof validates as the baseline;
- each required check fails independently;
- any broader authority flag fails closed;
- unsafe scope-contract variants fail closed;
- a synthetic fully evidenced future scope can reach `BOUNDED_EXPANSION_PILOT_ELIGIBLE` only as a decision;
- even that synthetic green decision cannot activate expansion and cannot change the current `max=1` budget;
- the module has no storage, fetch or persistence API.

## Next work

The next engineering work is not “increase the quota.” It is to close these blockers in order:

1. define one exact proposed multi-record scope and immutable fingerprint;
2. design exact multi-record rollback + partial-failure compensation;
3. prove idempotent replay and fail-closed state drift in an isolated rehearsal;
4. only then design temporary production canaries for the exact scope;
5. require exact deploy parity, zero unexpected writes and zero authority leaks;
6. return to the gate for a decision;
7. if and only if it becomes green, use a separate activation PR and then collect fresh post-activation production proof.

Until those proofs exist:

> **One-record local pilot: production-verified. Expansion gate: NO_GO. Normal/broad V2 persistence: CLOSED.**
