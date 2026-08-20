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
- Paths require at least three steps, explicit orientation/comparison/synthesis roles, transitions and learning outcomes.
- Mindmaps require one root, meaningful branches, resolved endpoints and correct resonance semantics.
- Weak or ambiguous input is allowed to produce no product candidate.

## Evaluation corpus

`tests/fixtures/aha-projection-product-evaluation-v2.json` contains 24 source texts across eight groups: news, research, essay, policy, personal reflection, data-heavy text, ambiguous/unsupported text and contradictory material.

The automated release suite expects 21 grounded cases to yield all three product artifacts and three weak cases to be suppressed. It also checks determinism and zero storage access.

The structured review worksheet is `ops/evaluation/aha-projection-product-human-review-v2.json`. Agent pre-review is complete. Indepent human review remains explicitly open and cannot be replaced by the automated suite. Automatic persistence remains forbidden regardless of the evaluation result.

## Next controlled boundary

The next step is an explicit, one-artifact-at-a-time materializer. It must be idempotent, reversible and separately authorized from the controlled V2 insight write pilot. Mindmap persistence should materialize concepts and relations into the existing concept-list model rather than introduce a competing graph store.
