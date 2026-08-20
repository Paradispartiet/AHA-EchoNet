# AHA Insight Engine V2 — two-record expansion activation

Date: 2026-08-20

## Current status

The exact two-record local V2 activation is now **production-verified**.

Scope:

`bounded_local_chamber_two_record_candidate_v1`

Current production write boundary:

```text
max lifetime local Chamber records = 2
activation mode = manual sequential
review approval = required per record
canonical approval = required per record
rollback approval = required per record
source binding = required per record
rollback replenishes budget = false
normal Chat persistence = CLOSED
```

Permanent post-activation proof:

`ops/evidence/aha-v2-two-record-expansion-activation-live-proof-v1.json`

## Activation implementation

Production wrapper:

`js/ahaV2ControlledWriteExpansionActivation.js`

Dedicated operator surface:

`insight-expansion-v2.html?pilot=bounded_local_chamber_two_record_candidate_v1`

Operator adapter:

`js/ahaInsightExpansionOperatorV2.js`

The wrapper uses the already production-proven `AHAInsightActivationV2` controller. It does not implement a second persistence engine.

## Authorization chain

Before the wrapper exposes any manual action, it requires:

1. exact operator intent `bounded_local_chamber_two_record_candidate_v1`;
2. permanent expansion evidence evaluates to `BOUNDED_EXPANSION_PILOT_ELIGIBLE` with 12/12 checks green;
3. the permanent one-record production proof remains valid;
4. the exact two-record scope contract validates and retains its immutable fingerprint;
5. the permanent two-record expansion decision proof remains valid;
6. the selected scope remains exactly two records, manual sequential, `batch=false` and `automatic=false`;
7. all broader write authorities remain false.

Any mismatch fails closed.

## Lifetime budget

The two-record budget is the **total lifetime canonical creation count in the existing controlled review history**.

```text
historical canonical records = 0  → 2 slots available
historical canonical records = 1  → 1 slot available
historical canonical records = 2  → 0 slots available
historical canonical records > 2  → invalid state, fail closed
```

A record continues to consume a slot after exact rollback because its review retains `canonical_insight_id`.

A device/profile that already consumed the old one-record pilot slot can therefore create at most one additional record under the two-record scope.

Rollback never replenishes the lifetime budget.

## Sequential activation

At most one unpromoted `reviewed` item may exist at a time.

A promoted first record is a completed canonical step, so a second review can begin while the first record remains active. Two review/canonical sequences cannot run in parallel.

Each record requires its own approval sequence:

```text
REVIEW challenge
CANONICAL challenge
optional ROLLBACK challenge
```

The underlying controller keeps each challenge single-use, expiry-bound and state-bound.

## Source and duplicate binding

`AHAInsightActivationV2` binds each review to:

- source event ID;
- source text SHA-256;
- synthesis response;
- candidate index;
- candidate payload;
- quality-gate decision.

It re-checks the current source hash before committing review/canonical state.

The expansion wrapper additionally prevents a candidate signature that already produced a canonical record from consuming the second slot.

## Exact rollback

Rollback remains the existing `AHAInsightActivationV2` signature-bound exact rollback.

The expansion wrapper verifies after rollback that:

- lifetime created-record count does not decrease;
- the target review moves to `rolled_back`;
- the target is no longer promoted;
- other promoted reviews remain untouched;
- unrelated Chamber records remain untouched.

Two active records can therefore be rolled back independently, including in reverse order.

## Operator boot boundary

`insight-expansion-v2.html` starts with:

`src="about:blank"`

The Chat iframe navigates only after the exact two-record operator intent is present and the load handler is installed.

The operator loads the permanent expansion evidence, one-record proof, two-record decision proof and exact scope contract before constructing the wrapper. The raw `AHAInsightActivationV2` controller is not exported as operator authority.

## Production proof — PR #863

Temporary PR #863 was isolated to two TEMP proof files, had zero product diff and was closed without merge after a successful run.

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

### Operator proof

Without exact intent:

```text
iframe:                    about:blank
Chat requests:             0
all controls disabled:     true
unexpected write requests: 0
page errors:               0
console errors:            0
```

With exact intent:

```text
authorized:                true
gate decision:             BOUNDED_EXPANSION_PILOT_ELIGIBLE
iframe ready:              true
unexpected write requests: 0
page errors:               0
console errors:            0
```

### Live source-bound activation proof

Two distinct permanent reviewed fixtures produced review-eligible live synthesis candidates:

```text
record 1 source:  standardization-flexibility-v1.json
record 1 quality: 0.832889
record 2 source:  constraints-creativity-v1.json
record 2 quality: 0.85084
model:            gpt-4.1-mini-2025-04-14
```

For both records, review approval left Chamber unchanged and source binding was verified before canonical creation.

Result:

```text
created record count after record 1: 1
created record count after record 2: 2
remaining budget after record 2:     0
third write:                          expansion_record_budget_exhausted
repository save/load calls:          0 / 0
sync push:                            blocked before repository access
sync pull:                            blocked before repository access
```

Rollback proof:

```text
record 2 rollback:                   rolled_back
record 1 preserved after rollback 2: true
record 1 rollback:                   rolled_back
final Chamber:                       sentinel only
unrelated sentinel preserved:        true
lifetime count after rollbacks:      2
fresh-wrapper third write:           expansion_record_budget_exhausted
audit events:                        18
```

No user production data was modified; the activation write sequence used an in-memory Chamber fixture only. The artifact contains no raw source text, evidence quotes, candidate signatures or canonical signatures.

## Permanent regression

`tests/aha-v2-two-record-expansion-activation-live-proof.test.cjs`

The regression locks:

- #863 run/job/artifact identity;
- exact production runtime commit;
- all twelve deployed asset hashes;
- operator no-intent and exact-intent behavior;
- the two distinct live sources and quality floor;
- source-bound review/canonical behavior;
- lifetime max=2 and blocked third write;
- repository calls 0/0 and sync blocking;
- independent exact rollbacks and sentinel preservation;
- post-rollback lifetime exhaustion after a fresh wrapper;
- redaction boundaries;
- absence of the #863 TEMP files from the permanent branch.

## What is open

Only this bounded local manual scope is open:

```text
manual review-queue write            OPEN inside controlled V2 activation
manual local Chamber write           OPEN, max 2 lifetime canonical creations
exact rollback                       OPEN for those controlled records
```

## What remains closed

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

No production proof in this chain authorizes widening beyond two local lifetime records.

Authoritative status:

> **Two-record local controlled V2 activation: production-verified. Lifetime max=2. Third write fails closed. Exact rollback proven. Broad/normal V2 persistence remains CLOSED.**
