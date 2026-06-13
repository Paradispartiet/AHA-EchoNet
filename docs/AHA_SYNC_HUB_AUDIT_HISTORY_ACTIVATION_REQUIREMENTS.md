# AHA Sync Hub audit/history activation requirements

## Current decision

- Audit/history activation requirements are reviewed, not implemented.
- Manual sync execution remains **NO-GO**.
- Dedicated execution page remains planned, not implemented.
- Home remains preview-only.
- Audit write path remains not activated.
- Rollback/no-write failure modes are reviewed, not implemented, in `docs/AHA_SYNC_HUB_ROLLBACK_NO_WRITE_FAILURE_MODES.md`.
- Auto-sync is permanently forbidden.
- No audit/history write path may activate before all gates are **GO**.
- No rollback/write path may activate before all gates are **GO**.

This document defines review requirements only. It does not create an audit writer, history store, execution page, runtime path, sync action, or database write.

## Purpose

Audit/history must be defined before execution so an operator can determine:

- what was attempted
- what was skipped
- what failed
- whether anything was written
- whether rollback was required, completed, failed, or unnecessary
- whether the run was a no-write preview or dry run

Future support and debugging also require traceable run history that can connect a run summary to per-module outcomes without relying on unstructured logs. Audit data must be sanitized: secrets and full payloads must not be exposed or stored by default.

## Required audit record fields

| Field | Required | Description | Notes |
|---|---|---|---|
| `runId` | Yes | Stable identifier for one reviewed execution attempt or eligible recorded run. | Must support correlation with per-module history without exposing payload content. |
| `timestamp` | Yes | Time associated with the audit record. | The execution contract must define whether this is run start, completion, or record-write time. |
| `trigger` | Yes | Trigger classification for the run. | Future execution must identify an explicit manual trigger; automatic triggers remain forbidden. |
| `operator/session identity placeholder` | Yes | Sanitized placeholder for the operator or session context. | Must support anonymous, signed-out, unavailable, or redacted fallback without storing secrets. |
| `target` | Yes | Selected execution target identifier. | Must be explicit even when the target is unavailable or blocked. |
| `targetStatus` | Yes | Readiness/configuration status of the selected target. | Must distinguish configured, unavailable, blocked, and fallback conditions. |
| `includedModules` | Yes | Module identifiers included in the reviewed run plan. | Allowed module IDs are `lists`, `paths`, `groups`, and `avisa`. |
| `excludedModules` | Yes | Module identifiers excluded from the reviewed run plan. | Exclusion must remain visible and must not be reported as execution success. |
| `dryRunSummary` | Yes | Sanitized summary of the required no-write preview. | Must state that dry-run planning itself did not write audit/history. |
| `readinessSummary` | Yes | Summary of readiness checks and blockers. | Must preserve blocked conditions. |
| `checklistSummary` | Yes | Summary of activation/run checklist results. | Must distinguish passed, blocked, skipped, and unavailable checks. |
| `confirmationSummary` | Yes | Sanitized evidence of operator confirmation state. | Must not contain tokens, secrets, or full session data. |
| `perModuleResults` | Yes | Structured result summary for every included or excluded module. | Must use the per-module history model below. |
| `perModuleErrors` | Yes | Sanitized module-specific errors. | Errors must remain attributable to the correct module. |
| `writeStatus` | Yes | Whether domain writes were not attempted, attempted, partial, successful, or failed. | Must not infer success from audit-write success. |
| `rollbackStatus` | Yes | Rollback/no-write outcome. | Must distinguish not required, required, pending, completed, failed, and unavailable when later defined. |
| `auditStatus` | Yes | Status of the audit/history record itself. | Must use the audit status model in this document. |
| `warnings` | Yes | Sanitized run-level warnings. | Empty list is permitted; warnings must not be silently discarded. |
| `errors` | Yes | Sanitized run-level errors. | Empty list is permitted; audit errors and module errors must remain distinguishable. |
| `payloadChecksum` | Yes | Non-secret checksum or digest reference for payload correlation. | Must not allow reconstruction of secrets or full payloads. |
| `noSecretsStored` | Yes | Explicit assertion that no secrets were stored. | Must be `true` for an acceptable record. |
| `noFullPayloadStoredByDefault` | Yes | Explicit assertion that the full payload was not stored by default. | Must be `true`; any future exception requires separate security review and is outside this scope. |

## Required per-module history

Audit/history must provide one structured entry for each of these modules:

- `lists`
- `paths`
- `groups`
- `avisa`

Each per-module entry must be able to show:

| Field | Requirement |
|---|---|
| `module id` | Stable module identifier: `lists`, `paths`, `groups`, or `avisa`. |
| `label` | Human-readable module label. |
| `target id` | Explicit target identifier for the module. |
| `startedAt` | Start time, or an explicit not-started value when skipped or blocked. |
| `finishedAt` | Finish time, or an explicit not-finished value when never started or still pending. |
| `previewStatus` | Result of the no-write preview/readiness phase. |
| `executionStatus` | Not started, blocked, skipped, running, success, partial, or failed state as later approved. |
| `recordsPlanned` | Number of records included in the approved plan. |
| `recordsAttempted` | Number of records for which execution was attempted. |
| `recordsWritten` | Number of records confirmed written. |
| `recordsSkipped` | Number of records intentionally not attempted or not written. |
| `tombstonesDetected` | Number of deletion/tombstone candidates detected, without implying deletion occurred. |
| `errors` | Sanitized module-specific error collection. |
| `warnings` | Sanitized module-specific warning collection. |
| `rollbackRequired` | Explicit boolean or defined unknown state. |
| `rollbackStatus` | Explicit rollback/no-write status for the module. |

Excluded, blocked, and not-started modules must still be represented so history cannot hide skipped work or imply that all modules ran.

## Write safety requirements

Audit/history must not become a hidden write bypass. A future implementation must satisfy all of these requirements:

- audit write must be explicit in the execution contract
- audit write must not happen on Home
- audit write must not happen during preview
- audit write must not happen during dry-run plan creation
- audit write must not happen on page load
- audit write must not happen on render
- audit write must not happen on storage event
- audit write must not happen on auth-ready
- audit write must not happen through timer/interval
- failed remote sync must not delete `localStorage`
- audit failure must not hide module failure
- audit failure must not mark sync as success

An audit record may only be considered for an explicitly approved execution attempt after the activation contract defines timing, storage, session fallback, sanitization, error handling, and rollback/no-write behavior. This review does not approve such a write.

## Audit status model

The required audit/history status vocabulary is:

| Status | Meaning |
|---|---|
| `not_configured` | No approved audit/history storage channel is configured. |
| `preview_only` | Audit/history information is shown as a no-write preview only. |
| `disabled_no_go` | Audit/history writing is intentionally disabled because activation remains NO-GO. |
| `pending` | An eligible, explicitly triggered execution attempt is awaiting an approved audit write. |
| `writing` | The approved audit write is in progress. |
| `written` | The audit record was written successfully; this does not by itself mean module execution succeeded. |
| `write_failed` | The audit write failed and the failure is visible. |
| `skipped` | The audit write was intentionally not attempted under a documented rule. |
| `partial_success` | Some required audit/history work succeeded and some failed; module outcomes remain independently visible. |
| `failed` | The audit/history operation failed overall. |

This is a requirements/status model, not implemented execution. The existence of a status name does not authorize a transition, write, or runtime behavior.

## History visibility requirements

Before activation, the reviewed UI contract must be able to present sanitized, read-only visibility for:

- last run summary
- last successful run
- last failed run
- per-module status
- error summary
- warning summary
- rollback status
- audit write status
- no-write/dry-run status
- operator confirmation status

Missing or unavailable history must be shown explicitly. The UI must not convert unavailable data, skipped audit writes, or audit failures into silent success.

## Forbidden audit/history behavior

- no source events from preview
- no insights creation
- no publishing
- no social sharing
- no AHAavisa publish side effects
- no Groups social operations
- no storing secrets
- no storing full payloads by default
- no silent success when audit failed
- no auto-run audit entry on page load

These prohibitions apply to Home, preview, dry-run planning, future execution-page initialization, and any later audit/history implementation. Auto-sync remains permanently forbidden.

## Activation gate impact

| Gate | Impact of this review | Remaining execution requirement |
|---|---|---|
| **Gate F: per-module errors/results** | Defines the minimum per-module result, count, warning, error, and rollback history fields. | Real execution result/error semantics and tests remain unimplemented. |
| **Gate G: no-write safety** | Defines where audit writes must never occur and prevents audit/history from becoming a hidden write path. | No-write behavior and forbidden side effects must be test-locked for the future execution boundary. |
| **Gate H: audit/history** | Reviews the record contract, status model, visibility, sanitization, and failure rules. | The audit/history write path remains disabled and unimplemented for activation. |
| **Gate I: Supabase/session fallback** | Requires an operator/session placeholder and explicit unavailable/signed-out fallback. | Storage/session fallback behavior still requires a separate review and tests. |
| **Gate J: tests** | Identifies the audit/history behaviors that require test evidence. | Audit/history requirements are test-locked; the full execution activation suite remains outstanding. |

This review advances documentation evidence only. Gates F, G, H, I, and J are not full **GO for execution**.

## Required before activation

- audit/history contract reviewed
- audit/history tests added
- audit write disabled until activation
- audit preview allowed without write
- audit failure handling documented
- per-module history model documented
- rollback/no-write failure modes reviewed in `docs/AHA_SYNC_HUB_ROLLBACK_NO_WRITE_FAILURE_MODES.md`; implementation remains not activated
- session/operator fallback documented
- no secrets/full payload rule documented
- activation PR still required: `feat: activate manual AHA Sync Hub execution`

All gates A–J must be **GO for execution** before that activation PR may be considered. Rollback/no-write failure modes are now reviewed, but neither rollback nor the audit write path is implemented or activated. Completing these reviews does not satisfy the remaining implementation, fallback, or test gates.

## Test coverage

`tests/aha-manual-sync-audit-history-activation-requirements.test.cjs` test-locks this reviewed contract, its required run-level and per-module fields, write-safety rules, status model, forbidden behavior, gate impact, activation boundary, absent `sync.html`, and the current no-audit-write Home preview boundary.

This test coverage does not implement or activate audit/history storage. The requirements remain review-only, the write path remains not implemented, and manual sync execution remains **NO-GO**.

## Recommended next PR

The single recommended next PR is:

```text
test: lock manual sync rollback and no-write failure modes
```

That PR should test-lock the reviewed rollback/no-write contract without activating rollback, an audit writer, execution, runtime sync, database calls, repository persistence, `localStorage` writes or deletion, source events, insights, publishing, or social operations.
