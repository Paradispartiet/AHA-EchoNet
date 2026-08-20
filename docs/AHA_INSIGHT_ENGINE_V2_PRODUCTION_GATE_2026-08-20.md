# AHA Insight Engine V2 — production write gate (2026-08-20)

The nine-block V2 semantic rebuild is complete. The post-build safety chain now includes:

- PR #840 — trusted legacy knowledge → shared read-only projections
- PR #841 — bounded V2 semantic context transport for Chat
- PR #842 — automatic read-only Chat context only when existing memory is allowed and new saving is disabled
- PR #843 — explicit production write decision gate
- PR #844 — isolated IndexedDB migration rehearsal operator surface
- PR #846 — exact one-record controlled-write rollback readiness contract
- PR #849 — preserve trust-ready full records after Memory Relevance Gate selection without extra V2 reads or provenance leakage
- PR #851 — repair the live Chat bootstrap failure caused by mutating a frozen `InsightsEngine` provider

Normal V2 persistence is **not** opened by any of these changes.

## Current decision

Authoritative evidence:

```text
ops/evidence/aha-v2-production-write-gate-current-v1.json
ops/evidence/aha-v2-live-production-proof-2026-08-20.json
```

Decision produced by `AHAV2ProductionWriteGate.evaluate(...)`:

> **CONTROLLED_WRITE_PILOT_ELIGIBLE**

All **12/12 required production checks** are now green.

This decision means exactly one thing: a **separate explicit activation PR may propose a bounded controlled write pilot**. It does not execute a write and does not authorize normal Chat persistence, automatic backfill, broad canonical writes, projection-store writes, Meta writes or remote V2 writes.

## Proven production runtime cut

The final live proof exercised this exact runtime cut:

```text
production runtime commit: 497fa06eee5c910fce146281c2703a4c76fb0081
GitHub Pages commit:        497fa06eee5c910fce146281c2703a4c76fb0081
Pages status:               built
runtime assets:             11/11 SHA-256 match
```

`main_commit_sha` in the evidence file denotes the exact production runtime cut tested by the browser proof. A later evidence/docs-only commit may have a newer repository SHA without changing the runtime assets proven here; the evidence does not mislabel that metadata commit as the tested runtime.

GitHub Pages is the AHA frontend production proof authority. Vercel `build-rate-limit` status is non-authoritative for this gate.

## Final live production proof — PR #852

Temporary PR #852 contained exactly two TEMP proof files and **zero product-file differences** from the proven runtime cut. It was closed without merge after the successful run.

Permanent proof identity:

```text
TEMP PR:          #852 — closed without merge
TEMP head:        4eacd1cbe75d99a4fa64a0bad2f2192295bcb8b7
product diff:     0 files
workflow run:     32396576869
workflow job:     96514684814
artifact id:      9416895737
artifact digest:  sha256:3863d04353f6ca9b7b7eccf7c44004d6021548f945fbc22afccf12d0799902f9
workflow result:  success
```

The workflow required the TEMP branch to differ from the tested production cut only by the workflow and browser-proof script. It then queried GitHub Pages, required the deployed commit to equal `497fa06e…`, and compared the selected deployed runtime files byte-for-byte against that commit.

## Live migration rehearsal proof

The deployed operator surface completed the required sequence against a representative browser-local Chamber fixture:

```text
dry-run reviewed:              true
trusted candidates:            1
enrichment candidates:         1
planned staging writes:        2
first apply writes:            2
identical second apply writes: 0
second apply idempotent:       true
exact rollback count:          2
staging count after rollback:  0
Chamber unchanged:             true
localStorage unchanged:        true
user production data modified: false
```

The only write target was the isolated IndexedDB `v2_backfill_staging` store. The rehearsal did not write Chamber, Lists, Paths, Mindmap, Meta, canonical storage or remote storage. The permanent proof contains no raw insight evidence or candidate signature.

This closes both production migration blockers:

- `migration_dry_run_reviewed = true`
- `staging_apply_rollback_production_proof = true`

## Live read-only Chat proof

The same production-proof run then booted the real deployed `chat.html` and ran three actual Chat requests with:

```text
saveNewInsights = false
useExistingMemory = true
memory_context.used = true
```

All three requests reached:

`https://aha-agent-7a3y.onrender.com/api/aha-agent/chat`

Observed result:

```text
live samples:                         3/3
responses received:                   3/3
replies present:                      3/3
V2 context used:                      3/3
V2 trusted insights per sample:       1
minimum V2 quality score:             0.93
all V2 authority/write flags false:   true
unexpected browser write requests:    0
localStorage unchanged:               true
IndexedDB unchanged:                  true
raw activation_v2 in memory_context:  false
raw evidence in request:              false
raw candidate signature in request:   false
```

The normal Memory Relevance Gate was allowed to select both the trusted and weak legacy record, but V2 semantic context admitted only the trust-ready record. This is the intended #849 seam behavior.

This closes the remaining live Chat blockers:

- `live_readonly_chat_proof = true`
- `live_readonly_chat_sample_count = 3`
- `no_persistence_write_observed = true`
- `no_authority_leak_observed = true`

## Production bug discovered and repaired during proof

The first browser attempt revealed a real production bootstrap defect before any Chat proof was counted:

`ahaChatProviderLoader.js` attempted to add `buildMetaProfile` to a frozen/non-extensible `InsightsEngine` object.

PR #851 replaced that mutation with a stable, frozen compatibility view that inherits the provider and supplies only the missing legacy seam. All four normal repo gates passed before it was merged. Final PR #852 then proved the repaired deployed runtime.

## Rollback readiness remains proven

PR #846 locks any future controlled pilot to the already production-proven `AHAInsightActivationV2` one-record flow.

Existing rollback proof:

```text
workflow run:    32369823544
workflow job:    96427555521
artifact id:     9406690486
artifact digest: sha256:711124204415c7082987c79cd99e64000a68a001ff0d5db3d990272b2a12e305
rollback status: rolled_back
repository calls: 0 save / 0 load
```

The future pilot boundary remains:

```text
single_local_chamber_insight
max records created = 1
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

## Gate state

The production decision gate now has no missing evidence blockers:

```text
required checks: 12
passed:          12
failed:           0
blocking reasons: []
```

The gate itself remains pure and read-only. Every individual requirement is regression-tested to fail closed back to `NO_GO` if its evidence disappears or deployment SHA equality is broken.

## What remains closed

A green decision does **not** activate any of the following:

```text
normal Chat V2 persistence       CLOSED
automatic legacy backfill        CLOSED
automatic Chamber activation     CLOSED
broad canonical V2 writes        CLOSED
projection-store writes          CLOSED
Meta writes                      CLOSED
remote V2 writes                 CLOSED
```

## Next production work

The next phase is no longer another production-evidence collection round. The next valid step is a **separate, narrowly scoped controlled-write pilot activation PR**.

That PR must:

1. use the already proven `AHAInsightActivationV2` path;
2. permit at most one local Chamber insight per controlled activation;
3. require explicit operator/manual activation;
4. preserve signature-bound exact rollback;
5. keep backend sync, remote persistence, Meta, projections, automatic backfill and normal Chat saving disabled;
6. contain its own activation/rollback verification and kill switch.

Only evidence from that pilot may justify discussing a later expansion. It must not be interpreted as permission to open normal V2 persistence.

Current status:

> **Insight Engine V2 build: 9/9 complete. Production decision gate: 12/12 green. Controlled write pilot: eligible for a separate activation PR. Normal V2 persistence: CLOSED.**
