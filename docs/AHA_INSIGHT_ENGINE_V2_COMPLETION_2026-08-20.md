# AHA Insight Engine V2 — nine-block completion status (2026-08-20)

This document is the authoritative completion boundary for the nine-block semantic Insight Engine V2 rebuild. It complements `AHA_INSIGHT_ENGINE_IMPLEMENTATION_STATUS_2026-08-20.md`, which documents the detailed synthesis/calibration history through controlled activation.

When this file is present on `main` through PR #839, all **9/9 build blocks are implemented**. That does **not** mean normal Chat persistence or broad production writing is open.

## Nine-block status

| Block | Scope | Status / proof |
|---|---|---|
| 1 | SemanticDocument, evidence and provenance | implemented and merged |
| 2 | Entities and meaningful concepts | implemented and merged |
| 3 | Normalized claims and typed relations | implemented and merged |
| 4 | Separate source-direct semantic model call | implemented and merged |
| 5 | Insight Synthesis V2 + quality gate + controlled activation | implemented, production-measured; controlled local activation permanentized through PR #835 |
| 6 | Equivalence vs resonance | implemented and merged in PR #836 (`js/ahaInsightRelationClassifierV2.js`) |
| 7 | Insight Saturation V2 + quality-aware Meta | implemented and merged in PR #837 (`js/ahaInsightSaturationV2.js`, `js/ahaMetaQualityV2.js`) |
| 8 | Shared semantic projections for Insights, Concepts, Lists, Paths and Mindmaps | implemented and merged in PR #838 (`js/ahaSemanticProjectionsV2.js`) |
| 9 | Controlled migration/backfill of legacy knowledge | implemented in PR #839 (`js/ahaKnowledgeMigrationV2.js`) with staging-only apply, idempotency and exact rollback |

## What blocks 6–9 add

### Block 6 — equivalence is not resonance

`AHAInsightRelationClassifierV2` is deterministic, symmetric and fail-closed.

- semantic equivalence and resonance are separate relation classes;
- resonance is never dedupe-eligible;
- equivalence alone is not enough for dedupe: reviewed quality, provenance and resolved causal status are also required;
- causal, polarity and directional conflicts block equivalence/dedupe;
- the layer does not write to Chamber, Meta, projections or persistence.

### Block 7 — saturation is marginal semantic redundancy, not volume

`AHAInsightSaturationV2` measures whether new quality-ready insights mostly resolve to verified equivalence against already trusted knowledge.

- many low-quality or repeated objects cannot manufacture saturation;
- resonance remains semantic novelty;
- low quality/provenance coverage blocks saturation claims;
- `AHAMetaQualityV2` provides a read-only V2 quality overlay and does not treat legacy V1 `avg_saturation` as authoritative for V2.

### Block 8 — one semantic core, five projections

`AHASemanticProjectionsV2` builds one immutable canonical projection core for:

```text
Insights
Concepts
Lists
Paths
Mindmaps
```

Only dedupe-eligible equivalence groups collapse. Resonance remains an edge between distinct nodes. Product projections are read-only candidates and do not directly write to their existing stores.

### Block 9 — reviewable legacy migration

`AHAKnowledgeMigrationV2` provides a controlled migration planner and staging executor.

Legacy records are classified as:

```text
v2_ready
needs_semantic_enrichment
already_staged
invalid
conflict
```

A legacy record is never silently upgraded to trusted V2 knowledge merely because it exists.

The migration contract guarantees:

- dry-run by default;
- deterministic migration IDs and operation IDs;
- staging-only target kinds;
- adapter scope must be exactly `v2_backfill_staging`;
- explicit authorization is required for staging apply;
- identical re-apply is a no-op;
- existing changed staging state causes a hard conflict;
- partial apply failure automatically rolls back already-applied staging writes;
- manual rollback only removes/restores exact expected state;
- changed post-apply state produces `manual_review_required` rather than destructive rollback;
- List/Path/Mindmap references are emitted only as non-authoritative rewrite candidates.

Regression coverage is in `tests/aha-knowledge-migration-v2.test.cjs`.

## Post-build production gates are now complete

After 9/9 implementation, V2 was deliberately kept read-only while the production chain was proven. That chain is now complete through the final live browser proof:

```text
#840 trusted legacy -> read-only shared projections
#841 bounded V2 Chat transport
#842 automatic read-only Chat context with saving disabled
#843 explicit production decision gate
#844 isolated IndexedDB migration rehearsal surface
#846 one-record controlled-pilot rollback readiness
#849 trust-ready record preservation after Memory Relevance Gate selection
#851 live Chat bootstrap repair for frozen InsightsEngine provider
#852 final TEMP live proof, closed without merge
```

The final proof exercised production runtime cut:

`497fa06eee5c910fce146281c2703a4c76fb0081`

GitHub Pages reported that exact commit as `built` on the first probe attempt, and **11/11 selected runtime assets** matched it byte-for-byte by SHA-256.

The live migration rehearsal proved:

```text
dry-run reviewed:              true
first isolated staging writes: 2
identical replay writes:       0
exact rollback:                2
staging after rollback:        0
Chamber/localStorage changed:  false
```

The live Chat proof then ran **3/3** actual production-agent requests with `saveNewInsights=false`, each carrying bounded trust-ready V2 context, returning a reply, leaving browser storage unchanged, and showing no V2 authority leak or unintended persistence write.

Permanent evidence:

```text
ops/evidence/aha-v2-production-write-gate-current-v1.json
ops/evidence/aha-v2-live-production-proof-2026-08-20.json
```

## Current production decision

All twelve required production decision checks are green:

```text
required checks: 12
passed:          12
failed:           0
```

The decision is:

> **CONTROLLED_WRITE_PILOT_ELIGIBLE**

This is not equivalent to “production persistence enabled”. The decision gate is pure/read-only and can execute no write itself.

## What remains deliberately closed

Even with the green gate, the following remain closed:

```text
normal Chat automatic V2 persistence       CLOSED
automatic Chamber activation               CLOSED
broad canonical V2 write                   CLOSED
backend persistent V2 sync                 CLOSED
automatic product-store projection writes  CLOSED
automatic legacy backfill                   CLOSED
Meta write authority                       CLOSED
remote V2 write authority                   CLOSED
```

The only next write step that may be proposed is a separate, explicit, bounded pilot using the already production-proven `AHAInsightActivationV2` flow.

That pilot remains limited to:

```text
single local Chamber insight
max records created = 1
manual/operator activation only
signature-bound exact rollback
backend sync = false
backend persistence = false
Meta write = false
remote write = false
normal Chat persistence = false
automatic backfill = false
projection-store write = false
```

## Evidence retained from block 5

The permanent synthesis quality baseline remains:

```text
two production rounds
round 1: 6/6 valid, V2 semantic-review F1 1.0
round 2: 6/6 valid, V2 semantic-review F1 1.0
```

This result proves the source-bound synthesis layer. The later production gate proves read-only integration, migration rehearsal, Chat transport/runtime behavior and rollback readiness. Neither automatically authorizes broad writes.

## Next phase: bounded controlled-write pilot

No tenth semantic build block is implied, and no additional generic evidence round is required before proposing the next bounded step.

The next correct work is a **separate activation PR** for one controlled local Chamber write, with:

1. explicit manual/operator activation;
2. one-record maximum scope;
3. existing trust/quality gate requirements;
4. signature-bound exact rollback;
5. a kill switch;
6. backend/remote/Meta/projection/backfill/normal-Chat persistence still disabled;
7. production verification of activation and rollback before any later expansion is discussed.

Current status:

> **Insight Engine V2 build: 9/9 implemented. Production decision gate: 12/12 green. Controlled write pilot: eligible for a separate activation PR. Broad production persistence: not activated.**
