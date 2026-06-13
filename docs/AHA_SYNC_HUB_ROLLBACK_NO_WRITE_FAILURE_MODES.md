# AHA Sync Hub rollback and no-write failure modes

## Current decision

- Rollback/no-write failure modes are reviewed, not implemented.
- Manual sync execution remains **NO-GO**.
- Dedicated execution page remains planned, not implemented.
- Home remains preview-only.
- Audit write path remains not activated.
- Auto-sync is permanently forbidden.
- No rollback/write path may activate before all gates are **GO**.

This document defines requirements and review evidence only. It does not implement rollback, create a write path, activate audit/history writing, create `sync.html`, or change runtime behavior.

## Purpose

Rollback and no-write behavior must be defined before execution so that:

- the operator knows whether anything was written
- a failed remote sync cannot delete local data
- a partial module failure cannot be hidden
- an audit failure cannot mark a sync as successful
- no-write and dry-run paths remain safe
- rollback expectations are clear before activation
- local-first data remains protected

The future execution contract must distinguish planning, attempted writes, confirmed writes, remote failures, audit failures, and rollback outcomes. Uncertainty must be visible rather than converted into success.

## No-write policy

- Dry-run must never write.
- Preview must never write.
- Home must never write.
- Module inspection must never write.
- Readiness checks must never write.
- Failed remote sync must not delete `localStorage`.
- Missing Supabase or session must not delete `localStorage`.
- Audit/history failure must not delete `localStorage`.
- Rollback planning must not write.
- Rollback review must not write.

No-write means no domain write, audit/history write, repository persistence, database call, `localStorage` write or deletion, source event, insight, publication, or social-sharing side effect.

## Failure mode table

| Failure mode | Example | Required behavior | Must not happen | Gate impact |
|---|---|---|---|---|
| Missing Supabase session | The execution surface has no authenticated session. | Block execution, show the session blocker, preserve local data, and report no write attempted. | No fallback deletion, hidden remote attempt, or success state. | I, G, J |
| Supabase unavailable | Client initialization fails or the service cannot be reached. | Stop or block affected remote work, show availability failure, preserve local data, and require manual review when outcome is uncertain. | No deletion of `localStorage`, silent retry, or implied success. | I, F, G, J |
| Network failure | Connection drops before or during a remote request. | Record the affected module as failed or outcome-unknown, preserve local data, expose rollback requirements, and avoid automatic retry. | No local deletion, hidden partial write, or success without confirmation. | F, G, H, I, J |
| Partial module failure | Lists writes but Paths fails. | Report every module independently, mark the run non-successful, expose written counts and rollback status, and require the approved stop/continue policy. | No hiding the failed module or reporting overall success. | F, G, H, J |
| Module runtime missing | `window.AHALists` or another required runtime is unavailable. | Block that module before writing, show the missing runtime, and keep all local data intact. | No dynamic bypass, partial hidden execution, or success state. | F, G, J |
| Sync function missing | The approved function for a module is absent. | Block the module, show the missing contract, record zero attempts/writes, and require review. | No alternate unapproved call or inferred completion. | F, G, J |
| Audit write failed | Domain work may have completed but the audit record cannot be written. | Mark audit failure visibly, do not mark the run successful, preserve module outcomes, and require manual review. | No silent audit loss or success based only on domain writes. | F, H, J |
| `localStorage` parse failure | Local module JSON is invalid. | Treat local input as unavailable/invalid, block affected planning or execution, show the error safely, and do not overwrite or delete the value. | No reset, deletion, replacement, or remote write from unknown input. | F, G, J |
| Tombstone conflict | Local deletion marker conflicts with a newer or ambiguous remote record. | Report the conflict, skip or block the record under the approved merge contract, preserve local evidence, and require review when unresolved. | No resurrection, unapproved deletion, or silent conflict resolution. | F, G, H, J |
| Stale remote data | Remote data is older than protected local-first data. | Preserve local-first data, identify the stale comparison, and apply only an approved conflict policy. | No stale overwrite or deletion of newer local data. | F, G, I, J |
| Duplicate record | The same logical record appears more than once. | Detect and report duplicates, avoid duplicate writes, and expose skipped/error counts. | No duplicate creation or inflated success counts. | F, G, H, J |
| Permission denied | Remote policy rejects a write. | Mark the affected records/module failed, preserve local data, show the permission blocker, and expose whether any earlier writes occurred. | No deletion, privilege bypass, or success state. | F, G, H, I, J |
| Timeout | A request does not complete within the approved limit. | Mark the outcome as failed or unknown, preserve local data, show possible rollback/manual-review needs, and do not retry automatically. | No assumed failure-with-no-write or assumed success. | F, G, H, I, J |
| Unknown exception | An unclassified error interrupts processing. | Fail closed, sanitize and expose the error category, preserve local data, and require manual review of uncertain writes. | No swallowed exception, automatic continuation, or false success. | F, G, H, J |
| Operator cancels confirmation | The operator dismisses or rejects the final confirmation. | Record no execution attempt in the no-write UI state, keep all modules unchanged, and return to a safe reviewed state. | No write, audit write, rollback, or delayed execution. | G, H, J |
| Activation gates not green | One or more gates A–J is PARTIAL or NO-GO. | Keep execution disabled, show blocking gates, allow only no-write review/preview, and preserve local data. | No override, hidden handler, write, or rollback. | F, G, H, I, J |

## Per-module rollback expectations

The same minimum rollback and no-write evidence is required for `lists`, `paths`, `groups`, and `avisa`. No module may be omitted merely because it was blocked, skipped, or not started.

| Module | Required rollback/no-write evidence |
|---|---|
| `lists` | Records planned, records attempted, records written, records skipped, tombstones detected, sanitized errors, whether rollback is required, whether rollback is available or not available, confirmation that local data is preserved, and audit status. |
| `paths` | Records planned, records attempted, records written, records skipped, tombstones detected, sanitized errors, whether rollback is required, whether rollback is available or not available, confirmation that local data is preserved, and audit status. |
| `groups` | Records planned, records attempted, records written, records skipped, tombstones detected, sanitized errors, whether rollback is required, whether rollback is available or not available, confirmation that local data is preserved, and audit status. |
| `avisa` | Records planned, records attempted, records written, records skipped, tombstones detected, sanitized errors, whether rollback is required, whether rollback is available or not available, confirmation that local data is preserved, and audit status. |

For every module, `rollback required`, `rollback available`, and `rollback not available` must be explicit outcomes rather than inferred from a missing value. Counts must distinguish plans, attempts, confirmed writes, and skips. `local data preserved` must remain visible even when remote state or audit state is uncertain.

## Rollback status model

| Status | Meaning |
|---|---|
| `not_needed` | No confirmed or possible write requires rollback. |
| `not_configured` | No approved rollback mechanism is configured. |
| `preview_only` | Rollback information is being reviewed without execution or writes. |
| `disabled_no_go` | Rollback is disabled because activation remains NO-GO. |
| `pending` | The outcome is awaiting classification or an approved rollback decision. |
| `rollback_required` | Confirmed or possible writes require rollback under the approved contract. |
| `rollback_not_available` | Rollback is required or requested, but no approved rollback mechanism is available. |
| `rollback_available` | An approved rollback mechanism is available but has not started. |
| `rolling_back` | An explicitly approved rollback is in progress. |
| `rollback_complete` | The approved rollback completed and its result is verified. |
| `rollback_failed` | The approved rollback was attempted but did not complete successfully. |
| `manual_review_required` | The write or rollback outcome is uncertain and requires operator review. |

This is a requirements/status model, not implemented execution. These values do not authorize rollback, writes, status transitions, handlers, or automatic behavior.

## Required operator visibility

A future execution UI must be able to show:

- no-write status
- dry-run status
- write status
- per-module failure status
- rollback required status
- rollback availability
- rollback result
- local data preserved warning
- remote write failure warning
- audit write failure warning
- manual review required warning

The UI must distinguish zero writes from unknown writes, and confirmed local preservation from an outcome that still needs review.

## Forbidden behavior

- no deleting `localStorage` on remote failure
- no hiding partial failures
- no marking success if any required module failed
- no marking success if audit write failed
- no rollback during preview
- no rollback during dry-run plan creation
- no rollback on Home
- no automatic rollback on page load
- no automatic rollback on render
- no automatic rollback on storage/auth-ready
- no timer/interval rollback
- no source events from rollback review
- no insights creation
- no publishing, including AHAavisa publishing
- no social sharing, including real Groups social sharing

## Activation gate impact

| Gate | Impact of this review | Remaining execution requirement |
|---|---|---|
| **Gate F: per-module errors/results** | Defines visible partial-failure, record-count, error, local-preservation, and rollback outcomes for every module. | Real execution semantics, stop/continue rules, compensation behavior, and tests remain unimplemented. |
| **Gate G: no-write safety** | Defines the no-write policy and forbids rollback or writes from preview, dry-run, Home, inspection, and readiness paths. | The future boundary must be implemented safely and test-locked; this review does not activate it. |
| **Gate H: audit/history** | Requires audit status to remain independent and prevents audit failure from being reported as sync success. | Audit write timing, storage, failure handling, and execution-only implementation remain not activated. |
| **Gate I: Supabase/session fallback** | Defines fail-closed behavior for missing session, unavailable Supabase, permissions, network, timeout, and uncertain remote outcomes. | Exact fallback behavior and tests still require separate approval. |
| **Gate J: tests** | Identifies rollback/no-write scenarios that need automated evidence. | Requirements must be test-locked before activation, and the complete activation suite remains outstanding. |

Gates F, G, H, I, and J remain not full **GO for execution**. All gates A–J must be **GO for execution** before activation may be considered.

## Required before activation

- rollback/no-write failure modes reviewed
- rollback/no-write tests added
- no-write dry-run path test-locked
- failed remote sync must preserve `localStorage`
- partial module failure behavior documented
- audit failure behavior documented
- per-module rollback status documented
- operator visibility documented
- session/Supabase fallback documented
- activation PR still required: `feat: activate manual AHA Sync Hub execution`

Completing this review does not implement rollback or satisfy the remaining execution, fallback, audit-write, or test gates.

## Test coverage

`tests/aha-manual-sync-rollback-no-write-failure-modes.test.cjs` test-locks the current decision, no-write policy, failure mode table, per-module expectations, rollback status model, operator visibility, forbidden behavior, Gate F–J impact, activation boundary, absent `sync.html`, and the no-execution boundary for the Home Sync Hub surfaces.

This coverage is requirements-only. Rollback implementation remains not activated, the audit write path remains not activated, manual sync execution remains **NO-GO**, Home remains preview-only, and auto-sync is permanently forbidden.

## Recommended next PR

The single recommended next PR is:

```text
docs: review Sync Hub Supabase session fallback before execution
```

That PR should review fail-closed Supabase/session fallback requirements only. It must not activate rollback, audit writing, manual sync execution, module writes, repository persistence, database calls, `localStorage` writes or deletion, source events, insights, publishing, social sharing, or auto-sync.
