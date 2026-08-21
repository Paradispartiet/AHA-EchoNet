# AHA Insight Engine V2 — two-record expansion activation

Date: 2026-08-20  
Updated: 2026-08-21

## Current status

The exact two-record local activation is now **production-verified** for its bounded manual operator scope.

```text
expansion gate decision                         BOUNDED_EXPANSION_PILOT_ELIGIBLE
required gate checks                            12/12 green
activation implementation                       present + cross-tab hardened
corrected activation production proof           VERIFIED
production-verified lifetime canonical maximum  2
activation mode                                 manual_sequential
normal Chat persistence                         CLOSED
projection-store writes                         CLOSED
automatic/batch/backend/Meta/remote writes      CLOSED
```

This does not create broad V2 persistence. It verifies only the exact explicit two-record local Chamber path already implemented by `AHAV2ControlledWriteExpansionActivation`.

## Implementation

Activation wrapper:

`js/ahaV2ControlledWriteExpansionActivation.js`

Dedicated operator:

`insight-expansion-v2.html?pilot=bounded_local_chamber_two_record_candidate_v1`

Operator adapter:

`js/ahaInsightExpansionOperatorV2.js`

The wrapper reuses `AHAInsightActivationV2`; it does not create a second persistence engine.

## Exact activation scope

```text
scope_id = bounded_local_chamber_two_record_candidate_v1
max lifetime canonical creations = 2
activation mode = manual_sequential
separate REVIEW approval per record = required
separate CANONICAL approval per record = required
separate ROLLBACK approval per record = required
source binding per record = required
rollback replenishes lifetime budget = false
cross-instance rollback serialization = web_locks_exclusive
batch activation = false
automatic activation = false
```

A canonical creation remains counted after exact rollback. If one historical slot has already been consumed under the controlled one-record pilot, at most one additional canonical creation remains under the shared max=2 lifetime boundary.

## Authorization chain

Before constructing the raw activation controller, the bounded wrapper still requires:

1. exact operator intent `bounded_local_chamber_two_record_candidate_v1`;
2. current expansion evidence evaluates to `BOUNDED_EXPANSION_PILOT_ELIGIBLE`;
3. all 12 required decision-gate checks pass with zero blockers;
4. the production-verified one-record baseline remains valid;
5. the exact immutable two-record scope contract remains valid;
6. corrected two-record gate/rehearsal evidence is `production_evidence_verified`;
7. scope, proof and deployment identities agree;
8. all broad/automatic/backend/projection/Meta/remote authorities remain false.

The decision gate deliberately continues to report `eligible_for_expansion_activation=false`: that field means the **gate itself does not grant activation authority**. The separate activation implementation plus the corrected production proof establish the bounded production-verified max=2 scope.

## Corrected activation production proof — PR #876

Temporary PR #876 was built from exact production main:

`b42917de4ec4fa30fbab8c68b2dc3e25c663743d`

It contained exactly two TEMP proof files and zero product diff. After the final read-only proof run it was closed **without merge**.

Proof identity:

```text
TEMP PR:          #876 — closed without merge
probe head:       0c8f2226c02e2e3f81d19acaf1c9d80e94890527
workflow run:     32436619989
workflow job:     96639013827
artifact id:      9430975409
artifact digest:  sha256:cc87613837c7d118d385ad2cd9cda829a682da174e8f5a2fe7c28bf578422f8a
product diff:     0 files
TEMP files:       2
Pages:            exact expected main, built, attempt 1
```

Permanent evidence:

`ops/evidence/aha-v2-two-record-expansion-activation-live-proof-v1.json`

Permanentization PR:

`#878`

## Exact deployed-byte binding

The corrected workflow captured **20 critical deployed assets** from GitHub Pages and SHA-256 matched every captured file to exact expected main.

The proof then:

1. reused those captured files instead of refetching execution assets;
2. re-hashed the captured copies before VM execution;
3. routed the operator's critical HTML/JS/evidence requests to the same captured set;
4. executed the activation VM from the same verified copies.

Therefore a Pages deploy during the run could not change the bytes actually attributed to the proof.

```text
all deployed assets matched          true
captured assets                       20
VM assets executed from capture       12
operator routed assets from capture   20
exact deployed bytes used             true
execution mode                         captured_hash_verified_deployed_bytes
```

This closes the first material #863 proof gap.

## Activation result

Two distinct permanent reviewed synthesis fixtures produced eligible candidates and were activated through separate REVIEW/CANONICAL sequences.

```text
record 1 quality score                         0.848617
record 2 quality score                         0.847581
created_record_count                           2
third write                                    expansion_record_budget_exhausted
repository save calls                          0
repository load calls                          0
sync push/pull                                 blocked local-only
lifetime count after both rollbacks            2
fresh wrapper third write                      expansion_record_budget_exhausted
```

No user production data was modified. The Chamber writes used an in-memory fixture.

## Rollback and sentinel proof

Both rollbacks passed through the production lock name:

```text
aha-v2-controlled-write-expansion-rollback-v1
mode = exclusive
max simultaneous rollback transaction = 1
```

The proof established:

```text
rollback record 2                              rolled_back
full unrelated sentinel after rollback 2       exact
full record 1 after rollback 2                 exact
rollback record 1                              rolled_back
full unrelated sentinel after rollback 1       exact
final Chamber business state                   exact pre-activation state
```

The Chamber envelope intentionally updates `_local_updated_at` on canonical write and rollback. The corrected invariant therefore removes that housekeeping field before exact business-state comparison and separately proves that `_local_updated_at` is the **only** permitted top-level envelope delta and is present as a timestamp string.

```text
final_chamber_exact_pre_activation_business_state          true
final_chamber_only_local_updated_at_housekeeping_delta      true
```

This is stricter and semantically correct: no business record or unrelated top-level state may drift, while intentional local housekeeping metadata is not misclassified as a rollback failure.

This closes the second material #863 proof gap.

## Historical #863 / #864 observation

The earlier #863 activation observation, permanentized by #864, remains preserved as superseded provenance. It is no longer current authority.

Its two material proof gaps were:

1. execution assets could be refetched after Pages parity without binding those exact response bytes;
2. sentinel preservation was checked by ID rather than complete record contents.

The corrected #876 proof closes both. The historical artifact identity and invalidated status remain recorded in the permanent evidence for auditability.

## Separate PR #875 local artifact boundary

PR #875 introduced a different write boundary for Lists, Paths and Mindmap product artifacts:

```text
explicit user action required          true
one local artifact per call            true
automatic write authority              false
remote/sync authority                   false
Chamber/Meta authority inherited        false
projection-store authority inherited    false
```

That materializer must not be interpreted as `projection_store_write` authority for the Insight activation pilot. The activation policy therefore still requires:

`projection_store_write_open=false`

## Production authority boundary

Production-verified and open only inside the exact bounded operator scope:

```text
manual local review-queue activation     OPEN, max=2 lifetime canonical scope
manual local Chamber canonical write     OPEN, max=2 lifetime canonical scope
exact signature-bound rollback           OPEN for those records
exclusive cross-tab rollback lock        REQUIRED
```

Still closed:

```text
normal Chat automatic V2 persistence     CLOSED
automatic activation                     CLOSED
batch activation                         CLOSED
automatic legacy backfill                CLOSED
backend sync                             CLOSED
backend persistent V2 write              CLOSED
broad canonical V2 write                 CLOSED
projection-store writes                  CLOSED
Meta writes                              CLOSED
remote V2 writes                         CLOSED
```

## Next boundary

The next write-authority step is **not** to increase the record budget automatically and not to connect projection materialization to the Insight store boundary. Any wider write scope requires a new explicit gate, immutable scope contract, regression layer and fresh production proof.

Authoritative status:

> **Two-record manual local activation is production-verified at a lifetime maximum of 2 canonical creations. Exact rollback is cross-tab serialized and fully state-proven. Normal Chat, automatic/batch/backend/projection-store/Meta/remote V2 persistence remains CLOSED. PR #875's user-click local artifact materializer remains a separate non-inherited boundary.**
