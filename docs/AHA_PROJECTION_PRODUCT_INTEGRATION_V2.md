# AHA Projection/Product Integration V2

## Status

The shared V2 semantic projection is now consumed through a validated read-only product model. Lists, Paths and Mindmap can render quality-filtered candidates without writing them into product stores.

## Runtime chain

1. `AHAV2ProductIntegrationGate.preview()` admits only V2-ready knowledge.
2. `AHAProjectionProductContractV2` validates the immutable five-surface result and closed write policy.
3. `AHAProjectionArtifactQualityV2` removes weak lists, paths and mindmaps.
4. `AHAProjectionRuntimeSourceV2` reads existing local knowledge and rebuilds the model on demand.
5. Product modules render candidates in separate, clearly labelled preview surfaces.

No module in this chain has automatic persistence, remote write, sync or product-store authority.

## Product quality

- Lists require a documented semantic basis, unique members and provenance coverage.
- Paths require the ordered five-stage progression orientation → claim/evidence → tension/counterexample → uncertainty → synthesis/next inquiry, with source-bound references, distinct transitions and learning outcomes.
- Mindmaps require one root, meaningful branches, resolved endpoints and correct resonance semantics.
- Weak or ambiguous input is allowed to produce no product candidate.

## Evaluation corpus

`tests/fixtures/aha-projection-product-evaluation-v2.json` contains 24 source texts across eight groups: news, research, essay, policy, personal reflection, data-heavy text, ambiguous/unsupported text and contradictory material.

The automated release suite expects 21 grounded cases to yield all three product artifacts and three weak cases to be suppressed. It also checks determinism and zero storage access.

The structured review worksheet is `ops/evaluation/aha-projection-product-human-review-v2.json`. Agent pre-review is complete. Independent human review remains explicitly open and cannot be replaced by the automated suite. Automatic persistence remains forbidden regardless of the evaluation result.

## Controlled local materialization

`AHAProjectionMaterializerV2` is the sole write boundary for projection artifacts. It accepts only a valid, quality-filtered product read model and exactly one list, path or mindmap candidate per explicit user action. Lists are stored in `aha_lists_v1`, paths in `aha_paths_v1`, and mindmaps become concept graphs in the existing `aha_concept_lists_v1` model.

Every projected insight is stored as an immutable inline snapshot, so a product artifact does not depend on an unpersisted chamber record. Repeating the same action is idempotent. A new write returns a scoped receipt that can undo only the unchanged record it created; undo fails closed after user edits. Repository calls, sync, automatic persistence, Chamber writes and Meta writes remain forbidden.

The older `ahaAnalysisArtifacts` click path now prefers an available V2 candidate and falls back to its legacy builder only when the V2 runtime is unavailable. This does not create a background write path: both routes still require the existing explicit artifact button click.
