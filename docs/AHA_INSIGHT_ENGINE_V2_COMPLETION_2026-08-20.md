# AHA Insight Engine V2 — nine-block completion status (2026-08-20)

Updated: 2026-08-21

This document is the authoritative completion boundary for the nine-block semantic Insight Engine V2 rebuild, the product projection layer and the controlled production rollout.

Completion scope correction (2026-08-21): the nine-block semantic architecture and V2 product mechanics are implemented, but the full live `Chat input → source-isolated analysis → Knowledge Map → Lists/Paths/Mindmap` production chain is **not** complete. The remaining integration and quality phase is authoritative in [`AHA_ANALYSIS_KNOWLEDGE_PRODUCTS_V2_PLAN_2026-08-21.md`](./AHA_ANALYSIS_KNOWLEDGE_PRODUCTS_V2_PLAN_2026-08-21.md). This correction does not reopen a tenth semantic build block and does not widen write authority.

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

The production decision evidence established the read-only V2 foundation before any controlled write pilot:

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

Normal Chat automatic V2 persistence remains closed.

## Production-verified one-record baseline

PRs #854–#857 established the original production-verified controlled write baseline:

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

Permanent proof:

`ops/evidence/aha-v2-controlled-write-pilot-live-proof-v1.json`

That proof remains the required baseline input for the later max=2 expansion.

## Corrected two-record gate/rehearsal chain

PR #858 created the fail-closed expansion decision gate. PR #859 selected the minimum meaningful bounded wider candidate:

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

The initial #860/#861 proof chain was later invalidated after review found scope-binding, replay-cleanup, rollback-compensation, IndexedDB and later-target drift gaps.

PR #865 hardened the rehearsal and failed the decision closed. PR #866 added exclusive cross-tab rollback serialization. Temporary PR #867 then re-proved the hardened gate/rehearsal from production and was closed without merge.

Permanent corrected gate evidence:

`ops/evidence/aha-v2-two-record-expansion-live-proof-v1.json`

Current gate decision:

```text
BOUNDED_EXPANSION_PILOT_ELIGIBLE
required checks: 12
passed: 12
failed: 0
blockers: 0
```

The gate itself remains decision-only and therefore still does not grant write authority.

## Corrected activation production proof — #876 / #878

The two remaining historical #863/#864 activation-proof gaps were:

1. execution bytes were not bound strongly enough after Pages parity;
2. unrelated sentinel preservation was not a complete record-content comparison.

Temporary PR #876 was built from exact production main:

`b42917de4ec4fa30fbab8c68b2dc3e25c663743d`

It contained exactly two TEMP files, zero product diff, and closed without merge after the final read-only workflow succeeded.

Proof identity:

```text
TEMP PR:          #876 — closed without merge
probe head:       0c8f2226c02e2e3f81d19acaf1c9d80e94890527
workflow run:     32436619989
workflow job:     96639013827
artifact id:      9430975409
artifact digest:  sha256:cc87613837c7d118d385ad2cd9cda829a682da174e8f5a2fe7c28bf578422f8a
Pages:            exact b42917de…, built, attempt 1
captured assets:  20/20 SHA-256 matched
```

PR #878 permanentized that corrected evidence and its regression as merge commit:

`36272b7b0739eddbe7c6146bed9cf9afeddede19`

Permanent activation proof:

`ops/evidence/aha-v2-two-record-expansion-activation-live-proof-v1.json`

Status:

```text
production_activation_verified
proof_revision = corrected_v2
```

The corrected proof established:

```text
exact deployed bytes executed                         true
operator routed from same captured asset set          true
no-intent iframe                                      about:blank
exact intent gate                                     BOUNDED_EXPANSION_PILOT_ELIGIBLE
two distinct source-bound records                     created
created_record_count                                  2
third write                                           expansion_record_budget_exhausted
repository save/load                                  0/0
sync push/pull                                        blocked local-only
rollback record 2                                     exact
full sentinel after rollback 2                        exact
record 1 after rollback 2                             exact
rollback record 1                                     exact
full sentinel after rollback 1                        exact
final Chamber business state                          exact pre-activation state
only permitted Chamber envelope delta                 _local_updated_at
rollback lock                                         exclusive, max concurrency 1
lifetime count after rollback                         2
fresh wrapper third write                             blocked
user production data modified                         false
```

The historical #863/#864 observation remains preserved as superseded provenance rather than being erased.

## Current production-verified write boundary

The production-verified controlled Insight activation boundary is now:

```text
scope_id                                  bounded_local_chamber_two_record_candidate_v1
max lifetime canonical creations         2
activation mode                           manual_sequential
manual local review-queue activation      OPEN inside exact scope
manual local Chamber canonical write      OPEN inside exact scope
exact signature-bound rollback            OPEN
cross-tab rollback serialization          REQUIRED / exclusive Web Lock
third canonical creation                  BLOCKED
rollback replenishes lifetime budget      false
```

The original max=1 proof remains a baseline dependency; the current verified ceiling for the exact expansion operator is max=2.

## Product projections and acceptance

The V2 product layer remains separated from write authority.

PRs #868–#874 established the shared read model, quality gates, read-only Lists/Paths/Mindmap previews and evaluation corpus.

PR #877 then tightened the product contract:

- preview source is bound to the active analysis identity and fails closed on stale/missing matches;
- Paths use the ordered five-stage pedagogical progression;
- Mindmaps are capped at 2–7 ranked branches with stronger semantic quality checks;
- Lists/Paths/Mindmap surfaces are explicitly suggestions from the active analysis.

This work remains read-only unless the separate explicit materializer boundary is invoked.

## Finalized explicit local product-artifact materialization — #875 / #879

PR #875 introduced the quality-gated explicit materializer: one qualified List, Path or Mindmap artifact per user action.

PR #879 then completed the local artifact lifecycle without widening Insight authority:

- scoped undo is durable across reloads;
- rollback is refused after the user has edited the materialized artifact;
- concept-graph relations can be edited normally after materialization;
- the legacy/adaptive artifact compatibility entry points route only to the V2 path;
- V2 dependencies load lazily only after an explicit Chat artifact action;
- protected production `chat.html` remained byte-identical.

The finalized boundary is:

```text
explicit user action required        true
one local artifact per call          true
durable scoped undo                  true
rollback after user edit             refused
local relation editing               available
automatic persistence                false
remote/sync write                    false
Chamber/Meta write                   false
projection-store authority inherited false
```

This boundary remains intentionally independent of the controlled Insight activation pilot. It must not be used to reinterpret `projection_store_write_open` as true.

## Still closed

The following remain outside the production-verified authority:

```text
normal Chat automatic V2 persistence     CLOSED
automatic Chamber activation             CLOSED
batch activation                         CLOSED
automatic legacy backfill                CLOSED
backend persistent V2 sync               CLOSED
broad canonical V2 writes                CLOSED
projection-store writes                  CLOSED
Meta write authority                     CLOSED
remote V2 write authority                CLOSED
```

## Regressions

Core rollout regressions include:

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
tests/aha-projection-materializer-v2.test.cjs
tests/aha-lists.test.cjs
```

## Next phase

The semantic rebuild architecture itself is complete. The next work must first make the live source/analysis chain authoritative and source-isolated, then connect the separate Analysis, Knowledge Map and product read models, and finally complete product usefulness evaluation and controlled adoption **without silently widening write authority**.

The seven-PR order, feature-specific quality requirements, product visibility contract and definition of done are recorded in [`AHA_ANALYSIS_KNOWLEDGE_PRODUCTS_V2_PLAN_2026-08-21.md`](./AHA_ANALYSIS_KNOWLEDGE_PRODUCTS_V2_PLAN_2026-08-21.md). The existing 24-case adapter remains projection regression evidence, not a substitute for the full browser path or independent human review.

Any expansion beyond the exact max=2 Insight scope requires a new immutable scope contract, explicit fail-closed gate, adversarial regressions and fresh production proof. Projection artifacts remain either read-only suggestions or explicit one-artifact-per-user-action local materializations under the finalized #875/#879 boundary.

Authoritative status:

> **Insight Engine V2 semantic build: 9/9 implemented. Product projections: active-analysis-bound and quality-gated. Controlled local Insight activation: production-verified at exact lifetime max=2. Explicit product artifact materialization: finalized by #875/#879 as one local artifact per explicit action with durable undo and local editing. Normal Chat, automatic/batch/backend/projection-store/Meta/remote V2 persistence: CLOSED.**
