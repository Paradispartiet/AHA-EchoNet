# AHA Projection/Product Integration V2

## Status

The shared V2 semantic projection is consumed through a validated read-only product model. Lists, Paths and Mindmap render distinct, quality-filtered semantic shapes without writing them into product stores.

The authoritative AnalysisBundle, source isolation, Knowledge Map separation, real-browser product gate and product-specific semantic shapes are merged through PR #894. The controlled save journey is implemented in the current change. Independent human usefulness review and green live journey evidence remain release blockers as described in [`AHA_ANALYSIS_KNOWLEDGE_PRODUCTS_V2_PLAN_2026-08-21.md`](./AHA_ANALYSIS_KNOWLEDGE_PRODUCTS_V2_PLAN_2026-08-21.md).

## Runtime chain

1. `AHAV2ProductIntegrationGate.preview()` admits only V2-ready knowledge.
2. `AHAProjectionProductContractV2` validates the immutable five-surface result and closed write policy.
3. `AHAProjectionArtifactQualityV2` removes weak lists, paths and mindmaps.
4. `AHAProjectionRuntimeSourceV2` reads existing local knowledge and rebuilds the model on demand.
5. Product modules render candidates in separate, clearly labelled preview surfaces.

No module in this chain has automatic persistence, remote write, sync or product-store authority.

## Product quality

- Lists use `thematic_membership_v2`: every unique member has an explicit membership reason, the same named semantic basis and a deterministic member manifest.
- Paths use `ordered_inquiry_v2`: each of the five stages selects the best source-bound insight for its semantic role instead of cycling through List members.
- Mindmaps use `ranked_hierarchy_v2`: one source-specific central idea, 2–7 justified concept branches and exactly one normal hierarchy parent per insight. Resonance remains a typed cross-link.
- Weak or ambiguous input is allowed to produce no product candidate.

## Evaluation corpus

`tests/fixtures/aha-projection-product-evaluation-v2.json` contains 27 source texts across news, research, essay, policy, personal reflection, data-heavy, ambiguous, contradictory, literature/health and source-precedence classes.

The deterministic adapter suite expects 24 grounded cases to yield all three product artifacts and three weak cases to be suppressed. It checks semantic-shape invariants, determinism and zero storage access. The real-browser workflow separately exercises the active Chat/AnalysisBundle runtime.

The structured review worksheet is `ops/evaluation/aha-projection-product-human-review-v2.json`. Agent pre-review is complete. Independent human review remains explicitly open and cannot be replaced by the automated suite. Automatic persistence remains forbidden regardless of the evaluation result.

## Controlled local materialization

`AHAProjectionMaterializerV2` is the sole write boundary for projection artifacts. It accepts only a valid, quality-filtered product read model and exactly one list, path or mindmap candidate per explicit user action. Lists are stored in `aha_lists_v1`, paths in `aha_paths_v1`, and mindmaps become concept graphs in the existing `aha_concept_lists_v1` model.

Every projected insight is stored as an immutable inline snapshot, so a product artifact does not depend on an unpersisted chamber record. Saved artifacts retain exact analysis/run/source/SHA-256 identity plus their List membership, Path stage-role or Mindmap hierarchy contract. Repeating the same action is idempotent. A reload-safe state distinguishes absent, unchanged and user-modified artifacts. A new write returns a scoped receipt that can undo only the unchanged record it created; undo fails closed after user edits. Repository calls, sync, automatic persistence, Chamber writes and Meta writes remain forbidden.

`ahaAnalysisArtifacts` remains a thin V2-only compatibility wrapper. It contains no independent artifact builder and cannot materialize the first candidate from Chat or Knowledge Map. Stable links route the user through the dedicated preview surfaces, and saving is available only there.

## Live integration boundary

Product-page preview availability depends on an active, identity-matched AnalysisBundle with approved projection-ready insights. It does not read Chamber as a fallback. Blocked candidates keep a visible reasoned state, and a Mindmap deep link selects the V2 preview source.

Still required:

- pass the extended live browser journey for all three products;
- complete the independent 1–5 usefulness review;
- keep all automatic, Chamber, canonical, Meta, sync and remote write authority closed.
