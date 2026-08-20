# AHA Insight Engine V2 — controlled write pilot activation

Date: 2026-08-20

## Purpose

The production decision gate is now `CONTROLLED_WRITE_PILOT_ELIGIBLE` with 12/12 required checks green. This document defines the separate activation step allowed by that decision.

The pilot is intentionally much narrower than normal persistence:

```text
one eligible V2 candidate
→ explicit operator URL intent
→ production gate 12/12 green
→ locked rollback proof valid
→ explicit REVIEW one-time approval
→ local review queue
→ explicit CANONICAL one-time approval
→ exactly one local Chamber record
→ optional explicit ROLLBACK one-time approval
→ exact signature-bound removal
→ pilot record budget remains consumed
```

No other V2 write authority is opened.

## Activation authority

`js/ahaV2ControlledWritePilotActivation.js` is the only new pilot-authority layer.

It does not implement a new persistence engine. It wraps the already production-proven `AHAInsightActivationV2` controller and refuses to expose its write actions unless all of the following validate at runtime:

1. `AHAV2ProductionWriteGate.evaluate(...)` returns `CONTROLLED_WRITE_PILOT_ELIGIBLE`;
2. all 12 production gate checks are present and green;
3. `AHAV2ControlledWritePilotRollback.assess(...)` returns `production_rollback_ready=true` against the locked live proof;
4. the exact one-record proposal has not widened;
5. the operator explicitly opens the page with `?pilot=single_local_chamber_insight_v1`;
6. the review history shows that the pilot has never created a prior canonical record.

Any failure is fail-closed.

## One-record lifetime budget

The pilot does not use a second state store to track its record budget. The existing controlled review queue is authoritative.

A review retains `canonical_insight_id` after both promotion and rollback. Therefore:

```text
historical reviews with canonical_insight_id = 0  → record budget available
historical reviews with canonical_insight_id = 1  → record budget permanently consumed
historical reviews with canonical_insight_id > 1  → fail closed as invalid pilot history
```

Rollback removes the signed Chamber record but does **not** clear `canonical_insight_id` from the review history. A browser reload therefore cannot reopen the pilot and create record number two.

Parallel outstanding reviews/promotions also fail closed.

## Operator surface

`insight-activation-v2.html` remains the dedicated operator surface, but its authority changes materially:

- without the exact pilot query parameter, the iframe is replaced with `about:blank` and all controls stay closed;
- the operator loads permanent production-gate evidence from `ops/evidence/aha-v2-production-write-gate-current-v1.json`;
- it loads the locked controlled-activation production proof and provenance;
- it validates the original two-round synthesis proof required by `AHAInsightActivationV2`;
- it creates only `AHAV2ControlledWritePilotActivation`, not a globally exported raw `AHAInsightActivationV2Controller`;
- resume state is derived from the existing review queue after reload;
- after one record is promoted, only exact rollback remains available;
- after rollback, all new pilot writes remain closed.

The query parameter is explicit operator intent, not an authentication mechanism. The pilot remains local-only and cannot write backend or remote state.

## Write boundary

Allowed only inside this pilot:

```text
manual local review-queue write      YES
manual local Chamber record          YES, max 1 total
exact rollback of that record        YES
```

Still closed:

```text
automatic activation                 NO
batch activation                     NO
normal Chat persistence              NO
automatic legacy backfill            NO
backend sync                         NO
backend persistent write             NO
broad canonical write                NO
projection-store write               NO
Meta write                           NO
remote write                         NO
```

The three mutating phases continue to require distinct, single-use approval challenges from `AHAInsightActivationV2`:

```text
GODKJENN REVIEW <nonce>
GODKJENN CANONICAL <nonce>
GODKJENN ROLLBACK <nonce>
```

## Rollback binding

The existing rollback contract remains unchanged and binds removal to:

```text
canonical_insight_id
review_id
canonical_signature
recalculated_canonical_signature
```

State drift fails closed. Unrelated Chamber records must remain untouched.

## Required production proof after merge

Activation code is not considered production-proven merely because repo CI is green. After merge, a temporary workflow must be closed without merge after it proves the deployed GitHub Pages assets and runs a representative browser-local pilot sequence:

1. production page without operator intent remains closed;
2. production page with exact operator intent validates both permanent gates;
3. review approval leaves Chamber unchanged;
4. canonical approval creates exactly one signed local V2 record;
5. a second activation attempt is blocked by the lifetime record budget;
6. backend sync/repository access remains blocked;
7. exact rollback removes only the pilot record;
8. a post-rollback second activation attempt remains blocked;
9. no Meta, remote, backend-persistence, automatic-backfill or normal-Chat write occurs.

Only that live proof may mark the pilot activation production-verified.

## Current boundary

At the code-review stage for this activation PR:

> **Production decision gate: green. Pilot activation path: explicitly bounded and pending deploy/live proof. Normal V2 persistence: CLOSED.**
