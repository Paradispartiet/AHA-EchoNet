# AHA Projection/Product Integration V2

## Status

The shared V2 semantic projection is consumed through a validated read-only product model. Lists, Paths and Mindmap can render quality-filtered candidates without writing them into product stores.

This is an implemented **product-mechanics boundary**, not proof that the complete live Chat-input-to-product chain is finished. The active Chat analysis still needs the authoritative AnalysisBundle/semantic bridge, stronger source isolation, explicit Knowledge Map separation and real-browser human usefulness release proof described in [`AHA_ANALYSIS_KNOWLEDGE_PRODUCTS_V2_PLAN_2026-08-21.md`](./AHA_ANALYSIS_KNOWLEDGE_PRODUCTS_V2_PLAN_2026-08-21.md).

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

`ahaAnalysisArtifacts` is now a thin V2-only compatibility wrapper. It contains no independent artifact builder and still requires an explicit artifact action. The remaining UI problem is that Chat/Knowledge Map can materialize the first candidate directly instead of routing the user through the dedicated preview surface; the authoritative integration plan closes that shortcut without adding a background write path.

## Live integration boundary

Current product-page preview availability depends on an active analysis plus matching projection-ready local insights. A structurally valid Chat analysis is therefore not sufficient if the live ingest path created only metadata or otherwise non-ready Chamber insights. Lists and Paths also hide their preview shells when no candidate is returned, while Mindmap defaults to the user's local graph unless V2 is selected.

Required next behavior:

- all product pages consume the same approved active AnalysisBundle identity;
- Chat exposes explicit List/Path/Mindmap preview states and stable deep links;
- blocked candidates remain visible as a reasoned status instead of disappearing;
- Mindmap entered from Chat selects the V2 preview source;
- no product is written before an explicit save inside its preview.
