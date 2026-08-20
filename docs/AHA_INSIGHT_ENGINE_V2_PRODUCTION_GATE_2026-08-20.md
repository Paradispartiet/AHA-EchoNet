# AHA Insight Engine V2 — production write gate (2026-08-20)

The nine-block V2 semantic rebuild is complete. The production decision chain is also complete through the bounded controlled-write pilot proof.

## Safety chain

```text
#840 trusted legacy → read-only shared projections
#841 bounded V2 semantic context transport for Chat
#842 automatic read-only Chat context with new saving disabled
#843 explicit production write decision gate
#844 isolated IndexedDB migration rehearsal
#846 exact one-record rollback-readiness contract
#849 preserve trust-ready full records through the real memory seam
#851 repair frozen InsightsEngine Chat bootstrap
#852 final migration + read-only Chat production proof, TEMP closed without merge
#853 permanentize 12/12 green production decision
#854 activate only the bounded one-record local pilot
#855 keep operator Chat iframe blank until exact pilot intent
#856 live controlled-write pilot proof, TEMP closed without merge
```

Normal V2 persistence is **not** opened by this chain.

## Production decision gate

Authoritative gate evidence:

```text
ops/evidence/aha-v2-production-write-gate-current-v1.json
ops/evidence/aha-v2-live-production-proof-2026-08-20.json
```

Decision produced by `AHAV2ProductionWriteGate.evaluate(...)`:

> **CONTROLLED_WRITE_PILOT_ELIGIBLE**

Required checks:

```text
required: 12
passed:   12
failed:    0
blockers: []
```

The gate itself is pure and read-only. A missing requirement still regresses independently to `NO_GO`.

## Read-only production proof — PR #852

The final gate proof exercised production runtime cut:

`497fa06eee5c910fce146281c2703a4c76fb0081`

GitHub Pages reported that exact commit as `built`, and 11/11 selected runtime assets matched byte-for-byte.

Proof identity:

```text
TEMP PR:          #852 — closed without merge
workflow run:     32396576869
workflow job:     96514684814
artifact id:      9416895737
artifact digest:  sha256:3863d04353f6ca9b7b7eccf7c44004d6021548f945fbc22afccf12d0799902f9
product diff:     0 files
```

The same proof closed the migration and live Chat requirements:

```text
migration dry-run reviewed:          true
first isolated staging writes:       2
identical replay writes:             0
exact rollback count:                2
staging count after rollback:        0
Chamber/localStorage changed:        false
live read-only Chat samples:         3/3
minimum admitted V2 quality:         0.93
unexpected persistence writes:       0
authority leaks:                     0
```

## Rollback readiness

PR #846 permanently locks any pilot to the already-proven one-record local activation path.

```text
workflow run:       32369823544
workflow job:       96427555521
artifact id:        9406690486
artifact digest:    sha256:711124204415c7082987c79cd99e64000a68a001ff0d5db3d990272b2a12e305
rollback status:    rolled_back
repository calls:   0 save / 0 load
```

Allowed proposal remains exactly:

```text
scope = single_local_chamber_insight
max records created = 1
manual/operator activation only
batch activation = false
automatic activation = false
backend sync = false
backend persistence = false
Meta write = false
remote write = false
normal Chat persistence = false
automatic backfill = false
projection-store write = false
```

## Controlled write pilot activation

PR #854 added `AHAV2ControlledWritePilotActivation`, a fail-closed wrapper around `AHAInsightActivationV2` rather than a new persistence mechanism.

It requires:

- the 12/12 production decision;
- locked rollback readiness;
- exact one-record proposal;
- explicit `?pilot=single_local_chamber_insight_v1` operator intent;
- an unused lifetime record budget.

PR #855 made the operator boot fail-closed at the browser boundary: `insight-activation-v2.html` starts with an `about:blank` iframe and navigates to Chat only after exact intent is accepted.

## Controlled write pilot live proof — PR #856

The bounded pilot is now **production-verified**.

Permanent evidence:

`ops/evidence/aha-v2-controlled-write-pilot-live-proof-v1.json`

Proof identity:

```text
production main:   486c9f53096e381bc9aeb4e20521d3700633366d
TEMP PR:           #856 — closed without merge
probe head:        4664f40512148548d064ae1b1623b490c125d0b6
product diff:      0 files
workflow run:      32411347026
workflow job:      96562241212
artifact id:       9422272974
artifact digest:   sha256:deb7f90b9151e867d71010bc909a7597c386716e62064264c171556d90e9f8fc
artifact size:     4013 bytes
```

GitHub Pages returned production main `486c9f53…` as `built`. Ten selected deployed operator/write/safety assets matched that commit byte-for-byte.

The browser diagnostic proved the bare operator JS was the expected production asset and was not served by a service worker.

No-intent result:

```text
status closed:             true
iframe:                    about:blank
disabled controls:         6/6
chat.html requests:        0
unexpected write requests: 0
page errors:               0
console errors:            0
```

Exact-intent result:

```text
authority ready:          true
production gate decision: CONTROLLED_WRITE_PILOT_ELIGIBLE
rollback status:          ready
chat iframe ready:        true
unexpected write requests: 0
```

Representative live synthesis produced one eligible candidate with quality score `0.812283`.

The isolated browser-local write sequence then proved:

```text
initial created_record_count:        0
review changed Chamber:              false
canonical records added:             1
created_record_count after write:    1
second activation before rollback:   pilot_record_budget_exhausted
repository save calls:               0
repository load calls:               0
sync push/pull:                      blocked before repository access
rollback status:                     rolled_back
sentinel preserved:                  true
created_record_count after rollback: 1
fresh-wrapper phase:                 rolled_back_complete
fresh-wrapper second activation:     pilot_record_budget_exhausted
audit events:                        9
user production data modified:       false
```

This proves the one-record lifetime budget survives exact rollback and a fresh wrapper/browser state. Rollback does not reopen the pilot for a second record.

## What remains closed

The successful pilot proof does **not** open:

```text
normal Chat V2 persistence       CLOSED
automatic legacy backfill        CLOSED
automatic Chamber activation     CLOSED
batch activation                 CLOSED
backend persistent V2 sync       CLOSED
broad canonical V2 writes        CLOSED
projection-store writes          CLOSED
Meta writes                      CLOSED
remote V2 writes                 CLOSED
```

## Expansion boundary

There is no automatic promotion from a production-verified one-record pilot to broader persistence.

Any proposed expansion requires a separate explicit PR and new decision evidence that defines:

1. the exact wider scope;
2. a new maximum write budget;
3. rollback/compensation for that wider scope;
4. production canaries specific to the wider scope;
5. preserved fail-closed behavior if state drifts;
6. explicit proof that normal Chat saving, backend sync, Meta, projections and backfill remain closed unless each is separately authorized.

Until such a gate exists, the correct status is:

> **Insight Engine V2 build: 9/9 complete. Production decision gate: 12/12 green. One-record local controlled-write pilot: production-verified. Normal V2 persistence: CLOSED.**
