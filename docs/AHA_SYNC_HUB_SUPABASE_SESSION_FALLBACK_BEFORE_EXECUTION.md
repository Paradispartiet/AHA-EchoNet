# AHA Sync Hub Supabase session fallback before execution

## Current decision

- Supabase/session fallback requirements are reviewed, not implemented.
- Manual sync execution remains **NO-GO**.
- Dedicated execution page remains planned, not implemented.
- Home remains preview-only.
- Audit write path remains not activated.
- Rollback implementation remains not activated.
- Auto-sync is permanently forbidden.
- Missing Supabase/session must never delete or overwrite local-first data.
- No Supabase/session-dependent execution may activate before all gates are **GO**.

This document defines requirements and review evidence only. It does not implement session handling, create `sync.html`, change runtime behavior, call Supabase, call a database, call sync or repository persistence, write or delete `localStorage`, activate audit/history writing, or implement rollback.

## Purpose

Supabase/session fallback must be defined before execution because:

- the operator must know whether remote sync is available
- a missing session must block execution safely
- missing Supabase configuration or client availability must block remote writes safely
- local-first data must remain protected
- preview and dry-run target inspection must still work without Supabase
- failed remote readiness must not write or delete
- audit/history must capture a blocked state in a later approved execution implementation, but the audit write path is not active now

Fallback is a fail-closed execution boundary, not an alternate route to execution. A local-only preview may remain useful while remote execution stays blocked.

## Session states

| Status | Meaning |
|---|---|
| `unknown` | Session state has not been determined. Execution remains blocked. |
| `not_configured` | Session/auth integration is not configured for the selected target. |
| `unavailable` | Session state cannot be obtained safely. |
| `anonymous` | An anonymous session exists but is not sufficient for authenticated execution. |
| `unauthenticated` | No authenticated operator session exists. |
| `authenticated` | An authenticated session exists, but authorization and remote readiness are not yet proven. |
| `expired` | The session is expired or no longer valid. |
| `permission_denied` | The session lacks required authorization for the requested remote operation. |
| `ready` | Authentication and authorization requirements are satisfied for review, subject to every other activation gate. |
| `blocked_no_go` | Session-dependent execution is blocked because activation remains NO-GO or another required gate is not GO. |

This is a requirements/status model, not runtime implementation. These values do not authorize auth calls, state transitions, writes, sync, or execution.

## Supabase availability states

| Status | Meaning |
|---|---|
| `unknown` | Supabase availability has not been established. Execution remains blocked. |
| `not_configured` | Required Supabase configuration is absent or intentionally disabled. |
| `missing_client` | No approved Supabase client is available. |
| `missing_url` | The required Supabase URL is absent. |
| `missing_key` | The required non-secret client configuration key is absent. |
| `unavailable` | Supabase cannot currently provide the required remote capability. |
| `reachable` | The service appears reachable, but permissions, schema, tables, and write readiness are not yet proven. |
| `unreachable` | The service cannot be reached. |
| `permission_denied` | The remote operation is rejected by authorization or policy. |
| `ready` | The approved client, configuration, connectivity, schema, permissions, and required remote capability are ready, subject to all other gates. |
| `blocked_no_go` | Remote execution is blocked because activation remains NO-GO or another required gate is not GO. |

This is a requirements/status model, not a Supabase client implementation or permission to make remote calls.

## Required fallback behavior

| Scenario | Required behavior | Must not happen | Gate impact |
|---|---|---|---|
| Supabase client missing | Show `missing_client`, keep preview/local counts available, block remote execution, and preserve local-first data. | No dynamic client creation, remote attempt, local overwrite/deletion, or implied success. | E, G, I, J |
| Supabase URL/key missing | Show the specific configuration blocker, keep no-write inspection available, and block remote execution. | No guessed credentials, hidden fallback target, write, or local deletion. | E, G, I, J |
| Supabase unavailable | Show remote unavailable, preserve local data, and keep execution disabled. | No silent retry, alternate write path, success state, overwrite, or deletion. | E, F, G, I, J |
| Network failure | Mark remote readiness or the affected future operation failed/unknown, preserve local data, and require operator review. | No automatic retry, assumed success, hidden partial write, or local deletion. | F, G, H, I, J |
| Unauthenticated user | Show `unauthenticated`, allow preview/dry-run only, and block execution. | No anonymous elevation, remote write, audit write, or conversion to GO. | E, G, H, I, J |
| Expired session | Show `expired`, require a later explicit re-authentication flow, and keep execution blocked. | No automatic execution after refresh, stale-token write, or local deletion. | E, G, I, J |
| Permission denied | Show the authorization blocker and affected target/module, preserve local data, and fail closed. | No policy bypass, privilege escalation, hidden retry, or success state. | E, F, G, H, I, J |
| Anonymous session | Show `anonymous` and local-only preview state; require approved authenticated/authorized status for execution. | No treating anonymous as execution-ready or writing remote/audit data. | E, G, H, I, J |
| Remote table unavailable | Show the table/module blocker without dropping evidence, preserve local data, and block affected execution. | No table creation, alternate table write, dropped module result, or local deletion. | E, F, G, I, J |
| Remote schema mismatch | Show a sanitized schema blocker, mark affected modules unavailable, and require review. | No coercive destructive migration, guessed mapping, partial hidden write, or overwrite. | E, F, G, I, J |
| Remote write rejected | In a future approved path, report the rejection and uncertain/failed outcome per module while preserving local data. | No success state, automatic retry, local deletion, or hidden partial result. | F, G, H, I, J |
| Audit write unavailable | Keep audit readiness blocked and do not permit execution that requires audit evidence. | No domain execution presented as fully eligible, silent audit loss, or preview audit write. | E, F, G, H, J |
| Rollback unavailable | Show rollback unavailable and keep execution blocked wherever rollback readiness is required. | No execution based on assumed rollback, fake rollback status, or rollback attempt. | E, F, G, H, J |
| `localStorage` parse failure | Show affected local input as invalid/unavailable, preserve the original value, and block affected planning/execution. | No reset, replacement, deletion, remote write from unknown input, or hidden zero count. | E, F, G, J |
| Activation gates not green | Show `blocked_no_go`, list blocking gates, and allow no-write preview only. | No override, fallback conversion to GO, write, sync, audit write, or rollback. | E, F, G, H, I, J |

## Preview and dry-run behavior

- Preview must work without Supabase.
- Dry-run target inspection must work without Supabase.
- Dry-run plan may show remote unavailable or blocked readiness.
- Dry-run must not write.
- Dry-run must not call Supabase write APIs.
- Missing Supabase/session must not delete `localStorage`.
- Missing Supabase/session must not hide local counts.
- Missing Supabase/session must show blocked remote execution state.
- Preview and dry-run may describe requirements, configuration gaps, and next operator actions without authenticating, writing, or executing.

## Execution blocking rules

- No execution without authenticated/authorized session.
- No remote write without Supabase ready state.
- No audit write without audit readiness.
- No rollback attempt without rollback readiness.
- No fallback may convert **NO-GO** into **GO**.
- No Home action may trigger session-based execution.
- No page-load/session-ready event may trigger execution.
- No auth-ready event may trigger execution.
- No storage event may trigger execution.
- No timer/interval may trigger execution.
- A `ready` session or Supabase status is necessary but never sufficient; every gate A–J must independently be **GO for execution**.

## Required operator visibility

A future execution UI must be able to show:

- Supabase configured/not configured
- session status
- authentication status
- authorization status
- remote readiness status
- remote write availability
- audit write availability
- rollback availability
- local-only mode
- blocked reason
- next required action

Unknown, unavailable, blocked, and ready states must remain distinct. A local-only preview must not visually imply remote execution eligibility.

## Forbidden behavior

- no auto-sync after session becomes ready
- no execution on auth-ready
- no execution on page load
- no execution on render
- no execution on storage event
- no execution on visibilitychange
- no execution by timer/interval
- no deleting localStorage when Supabase unavailable
- no deleting localStorage when session missing
- no writing audit/history during preview
- no writing remote data during dry-run
- no source events
- no insights creation
- no publishing, including AHAavisa publishing
- no social sharing, including real Groups social sharing

## Activation gate impact

| Gate | Impact of this review | Remaining execution requirement |
|---|---|---|
| **Gate E: dedicated execution surface readiness** | Requires the future isolated surface to expose fail-closed session and remote blockers without enabling execution. | The dedicated page and disabled execution UI remain planned, not implemented. |
| **Gate F: per-module errors/results** | Requires remote/session/schema/write blockers and uncertain outcomes to remain visible per affected module. | Real execution error/result behavior remains not implemented or proven. |
| **Gate G: no-write safety** | Requires missing configuration, session, permissions, or connectivity to preserve local-first data and avoid all writes/deletions. | Future boundaries and failure paths must be implemented and test-locked. |
| **Gate H: audit/history** | Requires a later audit model to capture blocked session/remote states without writing during preview. | Audit write readiness and the execution-only audit write path remain not activated. |
| **Gate I: Supabase/session fallback** | Reviews the required status models, fallback behavior, blocking rules, and operator visibility. | Implementation and dedicated fallback tests remain outstanding. |
| **Gate J: tests** | Identifies the fallback and forbidden-trigger evidence required before activation. | Supabase/session fallback must be test-locked, and the full activation suite must pass. |

Gates E, F, G, H, I, and J remain not full **GO for execution**. This review does not make any gate GO, and all gates A–J must be **GO for execution** before activation.

## Required before activation

- Supabase/session fallback requirements reviewed
- Supabase/session fallback tests added
- preview without Supabase test-locked
- no-write on missing session test-locked
- no `localStorage` deletion on missing Supabase/session test-locked
- no auto-sync on auth-ready test-locked
- blocked remote execution state documented
- operator visibility documented
- activation PR still required: `feat: activate manual AHA Sync Hub execution`

Completing these requirements does not activate Supabase, session handling, audit writing, rollback, or manual sync execution.

## Test coverage

`tests/aha-sync-hub-supabase-session-fallback-before-execution.test.cjs` test-locks the reviewed session states, Supabase availability states, fail-closed fallback behavior, preview/dry-run behavior, execution blockers, operator visibility, forbidden behavior, Gate E–J impact, activation boundary, runtime/HTML safety boundary, and absence of `sync.html`.

This coverage remains review-only and safety-only. Supabase/session fallback implementation is not activated, manual sync execution remains **NO-GO**, Home remains preview-only, and auto-sync is permanently forbidden.

## Recommended next PR

The single recommended next PR is:

```text
docs: review disabled Sync Hub execution UI before activation
```

That PR should clarify disabled execution UI requirements only. It must not create `sync.html`, change runtime behavior, call Supabase or a database, call sync or repository persistence, write or delete `localStorage`, activate audit/history writing, implement rollback, publish, share, or enable auto-sync.
