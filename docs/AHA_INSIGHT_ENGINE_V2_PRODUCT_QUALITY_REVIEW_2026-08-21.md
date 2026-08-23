# AHA Insight Engine V2 — product quality review (2026-08-21)

Status: **PR #892 browser gate merged; product-specific semantic shapes implemented in the current change; independent human usefulness review remains open**.

The authoritative next-phase production integration plan is [`AHA_ANALYSIS_KNOWLEDGE_PRODUCTS_V2_PLAN_2026-08-21.md`](./AHA_ANALYSIS_KNOWLEDGE_PRODUCTS_V2_PLAN_2026-08-21.md). It distinguishes Chat analysis, Knowledge Map and the three products, and it records the remaining seven-PR path from live source isolation to preview, human evaluation and controlled save.

This document records the qualitative review lineage from the original 24-case V2 product-evaluation corpus and the PR 6 expansion to 27 browser cases. It does not widen any write authority and does not claim that the independent human release gate has passed.

## Why the automated score was not enough

The #880 corpus correctly proved the transport contract: 24/24 cases followed their expected visibility rule, 21 useful-candidate cases were visible, three deliberately insufficient cases were suppressed, evidence stayed inside the raw source and the evaluation made zero storage writes.

A TEMP output-inspection probe, PR #882, then printed the actual Lists, Paths and Mindmaps. The PR was closed without merge. It showed a material gap between structural quality and human usefulness.

Examples of user-facing output that still received high structural scores included:

```text
Utforsk antall
Utforsk alene
Utforsk derfor
Utforsk prosent
Utforsk gjør
```

Paths were structurally perfect but reused the same five generic teaching narratives across unrelated cases. Shared-concept and resonance products could also duplicate the same exact insight pair, and resonance titles could become long concatenations of two insight titles. Mindmaps could be structurally valid while using weak token anchors as roots or branches.

The key conclusion is therefore:

> **A score of 1.0 on the former structural gate was not evidence of a 1.0 user product.**

## Remediation in PR #884

PR #884 adds a read-only usefulness-refinement step to `AHAProjectionArtifactQualityV2`.

The refinement is deliberately narrow:

- weak display anchors are replaced only with compact text already present in the referenced, source-bound insights;
- Path narratives are made specific to the insight `refId` used by each step;
- exact-ref duplicate Lists and Paths are deduplicated deterministically, preferring explicit resonance over a weaker duplicate grouping;
- product titles are capped for navigation quality;
- semantic IDs, `refId`s, relation semantics and projection IDs are not rewritten;
- the input read model is not mutated;
- persistence, remote write and automatic acceptance remain false.

The quality test now explicitly proves that a generic five-stage Path fails when source insight text is available, and that the source-bound refinement is required before it can pass.

## 24-case regression after remediation

The strengthened corpus regression preserves the original 21-visible / 3-suppressed contract and adds usefulness-oriented assertions.

On the first green full run of the strengthened corpus:

```text
24 raw-text cases
21 visible cases
3 correctly suppressed cases
17 weak display anchors source-refined
21 distinct Path narrative signatures across 21 visible cases
0 duplicate List ref sets
0 duplicate Path ref sets
all visible Path steps source-bound to their referenced insight
0 storage writes
Node suite: 374/374 passed
```

The permanent audit is:

`ops/evaluation/aha-projection-product-agent-quality-review-v2.json`

The strengthened regressions are:

```text
tests/aha-projection-artifact-quality-v2.test.cjs
tests/aha-projection-product-evaluation-v2.test.cjs
tests/aha-projection-product-agent-quality-review-v2.test.cjs
```

## Important evaluation limitation

The TEMP probe also inspected `AHASemanticDocument` in this evaluation path. Its current shadow document reports `claims_relations_shadow` / `shadow_claims_relations_pending`, and the observed arrays for concepts, claims, relations, tensions and candidate insights are still empty at that layer. The semantic gate correctly reports that the dedicated semantic model is not authoritative and that the synthesized-insight quality gate is not implemented there.

The #880 regression therefore uses a deterministic evaluation adapter after source-document validation: source-bound sentence insights plus heuristic token concepts. That makes it useful for product regression, provenance, determinism and suppression testing, but it is **not authoritative semantic extraction** and cannot be used to manufacture a human-review pass. This limitation now describes the legacy Node adapter only; PR 6 separately runs the actual browser application and active AnalysisBundle V2 chain.

## PR 6 real-browser evaluation

PR 6 expands the corpus from 24 to 27 sources with three previously missing release classes:

- Livsarket/literature-health after a Morgenbladet seed in the same storage context, followed by hard reload;
- a health/patient-path source where one metric does not represent the whole care journey;
- pasted full text with an inaccessible URL, where the pasted text must remain primary.

`projection-product-review-v2.html` runs every case through the real `chat.html` application, `AHAChat.submitAhaChatMessage`, the active immutable `AnalysisBundleV2` and `AHAProjectionRuntimeSourceV2`. It displays the exact Lists, Paths and Mindmap output and supports an explicit downloadable human-review ledger. Review inputs are not automatically persisted.

The browser workflow has two distinct gates:

1. deterministic offline Chromium transport proof: exact cache/bundle/projection identity, evidence containment, sequential isolation, hard reload, same-source replay, changed-runtime-version separation and zero guarded preview writes;
2. live semantic corpus proof: the configured backend must be reachable, all useful cases must yield qualified previews, weak cases must remain suppressed and at least 80% of cases per product type must be ready for human review.

An iPad WebKit job locks responsive layout and the accessible review/Chat entry controls. The browser run also exposed and fixed a real bootstrap defect: the Chat provider loader resolved V2 Bundle/read-model/live-semantic modules as version 1 in the registry.

### Merged live-gate evidence (2026-08-23)

PR #892's final workflow run `32630087938`, artifact `9490861618`, received HTTP 200 for all 29 Chat submissions (27 cases, the Morgenbladet seed and the deterministic replay). Eighteen of 22 live coverage cases produced at least one qualified product on the first pass, or 81.82%; retry was not used. `data_bus` produced qualified Lists, Paths and Mindmap output. `conflict_tourism` produced qualified Paths and Mindmap output while its List was selectively withheld.

The run recorded zero critical provenance errors and zero guarded preview writes; offline Chromium and iPad WebKit also passed. The result was achieved without lowering cross-claim evidence, causal-status, provenance or write gates. It is the baseline that every later semantic-shape change must preserve, not a substitute for the separate human 1–5 review.

## Post-remediation live analysis audit

A production-shaped Livsarket analysis inspected after PR #884 produced materially unchanged Chat-analysis output across reload. The observed bundle contained stale Morgenbladet afterwork, unsupported institutional/media-history subject links, a rendered `[object Object]`, weak/morphologically duplicated concept tokens and a metadata-only `Kilde registrert` Chamber insight. Source binding and topic consistency still appeared as passed.

This does not invalidate the narrow #884 product-refinement regression. It proves that the regression does not exercise the complete production route:

```text
raw Chat input
→ authoritative semantic extraction
→ source-bound current insights
→ active AnalysisBundle
→ product projection runtime
→ Lists / Paths / Mindmap preview
```

The live audit is therefore a stop condition for declaring the complete analysis-to-products chain production-ready. The source/analysis fixes and real-browser sequential-source regression are specified in the authoritative integration plan.

## Release boundary

The independent human ledger remains unchanged:

`ops/evaluation/aha-projection-product-human-review-v2.json`

Required release rule remains:

```text
minimum acceptable human-reviewed share = 0.80
critical provenance errors allowed        = 0
independent human review required         = true
automatic persistence allowed             = false
```

Still closed:

```text
normal Chat automatic V2 persistence
projection-store writes
backend/remote V2 writes
Meta writes
automatic acceptance of product candidates
```

The explicit #875/#879 local materializer remains a separate one-artifact-per-user-action boundary and does not inherit or grant any projection-store authority.

## What remains

The remaining product-quality sequence is:

1. rerun the 27-case browser/live gate on the product-specific semantic shapes;
2. run the independent per-case usefulness review only on successful live-browser Lists, Paths and Mindmaps;
3. record the 1–5 rubric scores without replacing them with agent scores;
4. fix any remaining recurring defect class found by that review;
5. require at least 80% acceptable artifacts and zero critical provenance errors before considering any broader rollout;
6. only after that, production-test the full explicit user journey from analysis to chosen local artifact, edit, reload and safe undo.

The max=2 controlled Insight write boundary does not need to expand for this work.
