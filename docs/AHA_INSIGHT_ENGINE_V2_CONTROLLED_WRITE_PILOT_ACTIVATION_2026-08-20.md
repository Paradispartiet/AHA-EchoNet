# AHA Insight Engine V2 — controlled write pilot activation

Date: 2026-08-20

## Current status

The bounded Insight Engine V2 write pilot is now **production-verified** on GitHub Pages.

The production decision gate remains `CONTROLLED_WRITE_PILOT_ELIGIBLE` with 12/12 required checks green. PR #854 added the separate fail-closed pilot authority, PR #855 tightened no-intent browser boot, and temporary PR #856 proved the deployed flow end to end before being closed without merge.

Activation code is not considered production-proven merely because repo CI is green. The production-verified status comes from the separate deployed GitHub Pages/browser proof in PR #856.

This does **not** mean normal V2 persistence is open.

Current boundary:

> **Production decision gate: 12/12 green. One-record local write pilot: production-verified. Normal V2 persistence: CLOSED.**

## Pilot authority

`js/ahaV2ControlledWritePilotActivation.js` is the only pilot-authority layer. It does not implement a new persistence engine. It wraps the existing `AHAInsightActivationV2` controller and exposes its actions only when all of the following hold at runtime:

1. `AHAV2ProductionWriteGate.evaluate(...)` returns `CONTROLLED_WRITE_PILOT_ELIGIBLE`;
2. all 12 production checks are green;
3. `AHAV2ControlledWritePilotRollback.assess(...)` returns `production_rollback_ready=true` against the locked production proof;
4. the exact proposal remains `single_local_chamber_insight` with maximum one created Chamber record;
5. the operator explicitly opens the page with `?pilot=single_local_chamber_insight_v1`;
6. the existing review history shows that the pilot has not already consumed its one-record lifetime budget.

Any failure is fail-closed.

## Exact allowed sequence

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

The three mutating phases retain distinct single-use approval challenges:

```text
GODKJENN REVIEW <nonce>
GODKJENN CANONICAL <nonce>
GODKJENN ROLLBACK <nonce>
```

## One-record lifetime budget

The existing controlled review queue is the pilot budget ledger. A review retains `canonical_insight_id` after both promotion and rollback.

```text
historical canonical records = 0  → pilot record budget available
historical canonical records = 1  → pilot record budget permanently consumed
historical canonical records > 1  → fail closed as invalid pilot history
```

Rollback removes the signed Chamber record but does not clear the historical canonical binding. Therefore a browser reload cannot reopen the pilot and create record number two.

The live proof verified this twice:

```text
second activation before rollback → pilot_record_budget_exhausted
fresh wrapper after rollback       → pilot_record_budget_exhausted
```

## Operator surface

`insight-activation-v2.html` is the dedicated operator surface.

Without the exact pilot query parameter:

- the iframe remains `about:blank`;
- all six controls remain disabled;
- `chat.html` is not requested;
- no write request is emitted.

With exact intent, the operator loads and validates:

- permanent production-gate evidence;
- the locked controlled-activation production proof and provenance;
- the original two-round synthesis proof required by `AHAInsightActivationV2`;
- `AHAV2ControlledWritePilotActivation` as the sole operator-facing controller.

The raw `AHAInsightActivationV2Controller` is not exported by the operator surface.

## Live production proof — PR #856

Temporary PR #856 contained only proof files and was closed without merge after the successful run.

Proof identity:

```text
production main:  486c9f53096e381bc9aeb4e20521d3700633366d
TEMP PR:          #856 — closed without merge
probe head:       4664f40512148548d064ae1b1623b490c125d0b6
product diff:     0 files
workflow run:     32411347026
workflow job:     96562241212
artifact id:      9422272974
artifact digest:  sha256:deb7f90b9151e867d71010bc909a7597c386716e62064264c171556d90e9f8fc
artifact size:    4013 bytes
```

GitHub Pages reported the exact production commit as `built`. Ten selected deployed operator/write/safety assets matched that commit byte-for-byte by SHA-256.

The browser diagnostic also proved that the production operator script was served directly, not through a service worker, with the expected production hash.

## Live no-intent proof

The deployed operator page without exact intent produced:

```text
status closed:             true
iframe:                    about:blank
disabled controls:         6/6
chat.html requests:        0
unexpected write requests: 0
page errors:               0
console errors:            0
```

This closes the fail-closed browser-boot concern addressed by PR #855.

## Live exact-intent proof

With exact operator intent, the deployed operator reached:

```text
authority ready:           true
production gate decision:  CONTROLLED_WRITE_PILOT_ELIGIBLE
rollback status:           ready
chat iframe ready:         true
unexpected write requests: 0
page errors:               0
```

The representative live synthesis call returned one candidate, one eligible candidate and selected quality score `0.812283` using `gpt-4.1-mini-2025-04-14`.

## Live write + rollback proof

The write proof used only a representative isolated browser-local Chamber fixture with an unrelated sentinel. No user production data was modified.

Observed sequence:

```text
initial phase:                       available
initial created_record_count:        0
review changed Chamber:              false
canonical records added:             1
created_record_count after write:    1
second activation before rollback:   pilot_record_budget_exhausted
repository save calls:               0
repository load calls:               0
sync push/pull:                      blocked before repository access
rollback status:                     rolled_back
sentinel preserved after rollback:   true
Chamber count after rollback:        1
created_record_count after rollback: 1
fresh-wrapper phase:                 rolled_back_complete
fresh-wrapper second activation:     pilot_record_budget_exhausted
audit events:                        9
dispatched activation actions:       3
```

Permanent redacted evidence:

`ops/evidence/aha-v2-controlled-write-pilot-live-proof-v1.json`

Regression:

`tests/aha-v2-controlled-write-pilot-live-proof.test.cjs`

The regression locks the live proof identity and the ten deployed asset hashes. If one of those production surfaces changes, a new live proof is required rather than silently carrying the old proof forward.

## Rollback binding

The underlying rollback contract is unchanged and binds removal to:

```text
canonical_insight_id
review_id
canonical_signature
recalculated_canonical_signature
```

State drift fails closed. Unrelated Chamber records must remain untouched.

## Write boundary after successful proof

Allowed only inside the already verified bounded pilot:

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

The live proof does not authorize expansion. Any proposal to widen scope beyond the one-record local pilot requires a separate explicit decision, new rollback analysis, new production evidence and a new PR. No existing evidence should be interpreted as permission to open normal Chat V2 persistence.
