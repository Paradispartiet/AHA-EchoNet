# AHA Insight Engine V2 — product quality review (2026-08-21)

Status: **source-bound agent remediation implemented; independent human usefulness review remains open**.

This document records the first qualitative review of the 24-case V2 product-evaluation corpus after the raw-source transport/provenance evaluation in PR #880. It does not widen any write authority and does not claim that the independent human release gate has passed.

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

The #880 regression therefore uses a deterministic evaluation adapter after source-document validation: source-bound sentence insights plus heuristic token concepts. That makes it useful for product regression, provenance, determinism and suppression testing, but it is **not authoritative semantic extraction** and cannot be used to manufacture a human-review pass.

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

The next product-quality step is no longer another generic structural heuristic. It is:

1. run the independent per-case usefulness review on the refined Lists, Paths and Mindmaps;
2. record the 1–5 rubric scores without replacing them with agent scores;
3. fix any remaining recurring defect class found by that review;
4. require at least 80% acceptable artifacts and zero critical provenance errors before considering any broader rollout;
5. only after that, production-test the full explicit user journey from analysis to chosen local artifact, edit, reload and safe undo.

The max=2 controlled Insight write boundary does not need to expand for this work.
