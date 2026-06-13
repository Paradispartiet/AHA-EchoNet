# AHA Sync Hub disabled execution page skeleton

## Current decision

- Disabled execution page skeleton is defined, not implemented.
- Disabled execution page skeleton is test-locked.
- Execution page implementation boundary is defined, not implemented, in `docs/AHA_SYNC_HUB_EXECUTION_PAGE_IMPLEMENTATION_BOUNDARY.md`.
- `sync.html` must not be created in this PR.
- Manual sync execution remains **NO-GO**.
- Home remains preview-only.
- No executable sync button may exist.
- No enabled execution UI may exist before all gates are **GO**.
- Audit write path remains not activated.
- Rollback implementation remains not activated.
- Supabase/session fallback implementation remains not activated.
- Auto-sync is permanently forbidden.

This document defines a future page boundary only. It does not implement UI, handlers, runtime loading, persistence, remote calls, or sync.

## Purpose

The skeleton must be defined before implementation so that:

- the page boundary is explicit
- Home stays preview-only
- the future execution page starts disabled
- the operator can see why execution is blocked
- gates are visible before any execution
- no hidden write path can exist
- the activation PR remains explicit

The skeleton is an inert review contract, not authorization to create the page or execution path.

## Proposed future file

The proposed future file is:

```text
sync.html
```

It is:

- not created yet
- not linked from Home yet as an executable execution surface
- must be disabled by default when later created
- must not execute anything on load
- must not execute anything on render
- must not execute anything on auth-ready
- must not execute anything on storage events
- must not execute anything by timer/interval

## Proposed page sections

A future disabled page skeleton should contain these operator-visible sections:

- Header / title
- Current NO-GO status
- Gate summary
- Missing gates
- Supabase/session readiness
- Audit/history readiness
- Rollback/no-write readiness
- Per-module readiness
- Dry-run summary
- Per-module result preview
- Disabled execution controls
- Confirmation requirements
- Operator next action
- Auto-sync forbidden notice

Every section must remain informational and fail closed before activation. Readiness display must not imply permission to execute.

## Disabled controls

The future controls are:

| Control | Required disabled behavior |
|---|---|
| Run manual sync | Must remain disabled until activation PR and disabled until all gates GO. It must not have hidden click handlers, must not write, must not sync, must not rollback, must not publish, and must not dispatch source events. |
| Confirm execution | Must remain disabled until activation PR and disabled until all gates GO. It must not have hidden click handlers, must not write, must not sync, must not rollback, must not publish, and must not dispatch source events. |
| Retry failed module | Must remain disabled until activation PR and disabled until all gates GO. It must not have hidden click handlers, must not write, must not sync, must not rollback, must not publish, and must not dispatch source events. |
| Rollback module | Must remain disabled until activation PR and disabled until all gates GO. It must not have hidden click handlers, must not write, must not sync, must not rollback, must not publish, and must not dispatch source events. |
| Write audit/history | Must remain disabled until activation PR and disabled until all gates GO. It must not have hidden click handlers, must not write, must not sync, must not rollback, must not publish, and must not dispatch source events. |
| Publish AHAavisa | Must remain disabled until activation PR and disabled until all gates GO. It must not have hidden click handlers, must not write, must not sync, must not rollback, must not publish, and must not dispatch source events. |
| Share Groups result | Must remain disabled until activation PR and disabled until all gates GO. It must not have hidden click handlers, must not write, must not sync, must not rollback, must not publish, and must not dispatch source events. |

Visual disablement alone is insufficient. The controls must be behaviorally inert, including keyboard, delegated, lifecycle, readiness-transition, and delayed activation paths.

## Required blocked reasons

A future disabled page must expose these stable blocked reasons:

- `activation_pr_required`
- `gates_not_go`
- `execution_page_not_implemented`
- `disabled_ui_not_test_locked`
- `supabase_session_not_ready`
- `audit_history_not_ready`
- `rollback_not_ready`
- `no_write_safety_not_ready`
- `per_module_results_not_ready`
- `confirmation_not_ready`
- `auto_sync_forbidden`

`auto_sync_forbidden` is permanent and cannot be cleared by implementation, readiness, tests, confirmation, or activation.

## Future page loading rules

- future sync.html may load preview-safe shared scripts
- future sync.html must not load module runtime scripts before activation
- future sync.html must not import or execute module sync functions before activation
- future sync.html must not write audit/history before activation
- future sync.html must not write remote data before activation
- future sync.html must not write or delete localStorage before activation

Permitted preview-safe loading must remain side-effect-free and must not create an indirect execution or write path.

## Home boundary

- Home remains preview-only.
- Home may link to a future disabled page only as a non-executable review surface.
- Home must not load module runtime scripts.
- Home must not contain enabled execution controls.
- Home must not execute sync.
- Home must not write.
- Home must not auto-sync.

## Activation boundary

The required separate activation PR is exactly:

```text
feat: activate manual AHA Sync Hub execution
```

Before that PR may enable anything:

- all gates A–J must be **GO**
- the activation PR must be separate
- the activation PR must explicitly enable execution
- the activation PR must explicitly document what becomes writable
- the activation PR must explicitly document rollback and audit write behavior
- the activation PR must explicitly document Supabase/session readiness behavior
- the activation PR must include tests before any execution is enabled

Defining or later implementing a disabled skeleton does not satisfy this activation boundary.

## Gate impact

- **Gate E: dedicated execution surface readiness** — defines the isolated, disabled-by-default surface and its visible blockers, but does not implement it.
- **Gate F: per-module errors/results** — reserves readiness and result-preview sections without implementing execution results or retries.
- **Gate G: no-write safety** — requires inert controls, no hidden writes, and no storage mutation before activation.
- **Gate H: audit/history** — reserves visible readiness while keeping audit/history writing inactive.
- **Gate I: Supabase/session fallback** — requires visible fail-closed readiness while keeping implementation inactive.
- **Gate J: tests** — requires the skeleton boundary, loading rules, blocked reasons, inert controls, and page absence to be test-locked.

Gates E, F, G, H, I, and J remain not full **GO for execution**. This skeleton does not make any gate GO.

## Required before implementation

- disabled execution page skeleton defined
- disabled execution page skeleton tests added
- `sync.html` absence currently test-locked
- future page loading rules documented
- Home boundary documented
- disabled controls documented
- blocked reasons documented
- activation boundary documented
- all gates A–J still required before activation

Implementation of a disabled page remains separate from execution activation and must preserve every no-write, no-sync, and no-auto-sync boundary.

## Test coverage

`tests/aha-sync-hub-disabled-execution-page-skeleton-boundary.test.cjs` test-locks the documented skeleton, future loading rules, disabled controls, blocked reasons, Home boundary, activation boundary, Gate E–J impact, runtime/HTML safety boundary, module-loading boundary, and continued absence of `sync.html`.

The disabled execution page skeleton remains defined, not implemented. Manual sync execution remains **NO-GO**, and this test coverage does not activate UI, runtime, writes, sync, rollback, audit/history, Supabase/session fallback, or auto-sync.

## Recommended next PR

The execution page implementation boundary is now defined, not implemented, in `docs/AHA_SYNC_HUB_EXECUTION_PAGE_IMPLEMENTATION_BOUNDARY.md`. The skeleton remains test-locked, `sync.html` remains not created, execution remains **NO-GO**, and auto-sync remains permanently forbidden.

The single recommended next PR is:

```text
test: lock Sync Hub execution page implementation boundary
```

That PR must test-lock the implementation boundary without creating `sync.html`, implementing the page, changing runtime, adding execution handlers, activating writes, calling sync or persistence APIs, or weakening the permanent auto-sync prohibition.
