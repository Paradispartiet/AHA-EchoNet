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

## Production boundary after 9/9 implementation

The semantic rebuild is now feature-complete at the architecture/build level. The following remain deliberately **closed** until separate production gates prove them safe:

```text
normal Chat automatic V2 persistence       CLOSED
automatic Chamber activation               CLOSED
broad canonical V2 write                   CLOSED
backend persistent V2 sync                 CLOSED
automatic product-store projection writes  CLOSED
automatic legacy backfill                   CLOSED
Meta write authority                       CLOSED
```

The existing controlled local activation from block 5 remains the only bounded V2 write path and still requires its explicit approval contract.

## Evidence retained from block 5

The permanent synthesis quality baseline remains:

```text
two production rounds
round 1: 6/6 valid, V2 semantic-review F1 1.0
round 2: 6/6 valid, V2 semantic-review F1 1.0
```

This result proves the source-bound synthesis layer. It does not by itself authorize automatic migration or normal product persistence.

## Next phase: production activation gates

No tenth semantic build block is implied. The next work is controlled product integration and production proof:

1. run block-9 migration in dry-run against representative legacy data;
2. review inventory, conflicts, enrichment-required records and reference rewrite candidates;
3. prove a bounded staging apply + rollback with no product-store mutation;
4. feed only trusted V2 objects into the shared projection layer in shadow/read-only mode;
5. prove Chat/Chamber behavior with persistence still disabled;
6. define and pass an explicit production gate before opening any normal Chat V2 write path.

Until those gates pass, the correct status is:

> **Insight Engine V2 build: 9/9 implemented. Broad production persistence: not activated.**
