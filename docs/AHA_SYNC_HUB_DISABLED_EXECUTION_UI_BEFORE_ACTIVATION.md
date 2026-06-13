# AHA Sync Hub disabled execution UI before activation

## Current decision

- Disabled execution UI requirements are reviewed, not implemented.
- Disabled execution UI requirements are test-locked; implementation remains not activated.
- The disabled execution page skeleton is test-locked in `docs/AHA_SYNC_HUB_DISABLED_EXECUTION_PAGE_SKELETON.md`, not implemented.
- The execution page implementation boundary is defined, not implemented, in `docs/AHA_SYNC_HUB_EXECUTION_PAGE_IMPLEMENTATION_BOUNDARY.md`.
- Manual sync execution remains **NO-GO**.
- Dedicated execution page remains planned, not implemented.
- Home remains preview-only.
- No executable sync button may be shown on Home.
- No enabled execution UI may exist before all gates are **GO**.
- Audit write path remains not activated.
- Rollback implementation remains not activated.
- Supabase/session fallback implementation remains not activated.
- Auto-sync is permanently forbidden.

This is a documentation and review decision only. It does not create `sync.html`, implement an execution surface, change runtime behavior, add handlers, call sync or persistence APIs, or activate any write path.

## Purpose

The disabled execution UI must be defined before activation because:

- the operator must see why execution is blocked
- blocked UI must not become an accidental trigger
- disabled controls must not perform hidden actions
- readiness must be visible before execution
- confirmation requirements must be clear
- the activation PR must remain explicit
- Home must remain preview-only

The disabled experience is a fail-closed operator-information boundary. It may explain readiness and next actions, but it must not provide an indirect execution route.

## UI surface decision

- Home may show read-only preview and blocked status.
- Home must not show enabled execution controls.
- Dedicated execution page is planned, not implemented.
- Future execution UI must default disabled.
- Future execution UI may only become enabled after activation PR and all gates GO.
- Future execution UI must require explicit operator action.
- Future execution UI must require confirmation before execution.

The dedicated surface must remain separate from Home. Neither a blocked status nor a visually disabled control is permission to attach execution behavior.

## Disabled UI states

| Status | Meaning |
|---|---|
| `hidden` | No execution control is presented on the current surface. |
| `preview_only` | Read-only status or dry-run information is available, with no execution control. |
| `disabled_no_go` | Execution is disabled because the overall decision remains NO-GO. |
| `disabled_missing_gate` | One or more required gates are not GO. |
| `disabled_missing_session` | The required authenticated and authorized operator session is unavailable. |
| `disabled_missing_supabase` | Supabase configuration, client, connectivity, schema, permission, or remote capability is not ready. |
| `disabled_missing_audit` | The required audit/history write path is not ready or activated. |
| `disabled_missing_rollback` | Required rollback/no-write behavior is not implemented or proven. |
| `disabled_missing_confirmation` | The explicit confirmation requirement cannot yet be satisfied. |
| `ready_but_not_activated` | Readiness may be complete, but the exact activation PR has not activated execution. |
| `activated_ready` | A future post-activation state in which all gates are GO and the approved manual execution UI is ready for explicit operator action. |

This vocabulary is a requirements/status model, not runtime implementation. No state in this document changes code, enables a control, or authorizes execution.

## Required blocked reasons

A future disabled UI must represent these blocked reasons without converting them into actions:

- `gates_not_go`
- `execution_page_not_implemented`
- `activation_pr_required`
- `missing_supabase_session`
- `supabase_not_ready`
- `audit_write_not_ready`
- `rollback_not_ready`
- `per_module_results_not_ready`
- `confirmation_not_available`
- `no_write_safety_not_locked`
- `auto_sync_forbidden`

Blocked reasons must be explicit, stable, and suitable for test-locking. `auto_sync_forbidden` is permanent and can never be resolved by readiness or activation.

## Required operator visibility

A future disabled UI must be able to show:

- execution status
- disabled reason
- gate summary
- missing gate list
- Supabase/session readiness
- audit/history readiness
- rollback/no-write readiness
- per-module readiness
- preview-only status
- activation PR requirement
- auto-sync forbidden status
- next required action

Unknown, blocked, missing, ready, and activated states must remain visually and semantically distinct. Readiness information must never imply that execution is already active.

## Forbidden UI behavior

- no enabled sync button on Home
- no hidden execution behind a disabled button
- no click handler that calls `syncFromDatabase`
- no click handler that calls Supabase write APIs
- no click handler that writes audit/history
- no click handler that performs rollback
- no execution on page load
- no execution on render
- no execution on auth-ready
- no execution on storage event
- no execution on timer/interval
- no publishing
- no source events
- no insights creation
- no social sharing

Disabled controls must be inert. They must not execute through direct handlers, delegated handlers, keyboard activation, lifecycle events, readiness transitions, or delayed callbacks.

## Future activation UI requirements

A later activation PR must satisfy all of the following:

- the exact activation PR name is required: `feat: activate manual AHA Sync Hub execution`
- all gates A–J must be GO
- dedicated execution page must exist
- disabled UI must become enabled only through activation PR
- explicit operator click required
- explicit confirmation required
- dry-run summary visible before execution
- per-module result preview visible before execution
- audit/history readiness visible before execution
- rollback/no-write status visible before execution
- Supabase/session readiness visible before execution

Meeting these UI requirements is necessary but not sufficient: execution remains disabled until the activation PR explicitly changes the reviewed boundary after all evidence is complete.

## Gate impact

- **Gate E: dedicated execution surface readiness** — the future isolated surface must exist, default disabled, expose blockers, and remain separate from Home.
- **Gate F: per-module errors/results** — disabled UI must expose per-module readiness and preview results before execution.
- **Gate G: no-write safety** — disabled controls and blocked states must be inert and must not hide writes or destructive behavior.
- **Gate H: audit/history** — audit/history readiness must be visible, while the write path remains inactive before execution activation.
- **Gate I: Supabase/session fallback** — missing or unready Supabase/session states must fail closed and remain visible.
- **Gate J: tests** — disabled states, reasons, visibility, Home boundaries, and absence of hidden triggers must be test-locked.

Gates E, F, G, H, I, and J remain not full **GO for execution**. This review does not make any gate GO.

## Required before activation

- disabled execution UI requirements reviewed
- disabled execution UI tests added
- Home preview-only boundary test-locked
- no enabled execution controls on Home test-locked
- no hidden click handler test-locked
- disabled status vocabulary test-locked
- blocked reasons test-locked
- operator visibility test-locked
- activation PR still required: `feat: activate manual AHA Sync Hub execution`

All gates A–J must be **GO for execution** before activation. Completing this review does not implement the UI or activate sync.

## Test coverage

`tests/aha-sync-hub-disabled-execution-ui-before-activation.test.cjs` test-locks the reviewed current decision, UI surface boundary, disabled states, blocked reasons, operator visibility, forbidden UI behavior, future activation requirements, Gate E–J impact, Home preview-only boundary, unloaded execution modules, and absence of `sync.html`.

This coverage remains safety-only. Disabled execution UI requirements are test-locked, but the implementation is not activated; Manual sync execution remains **NO-GO**, Home remains preview-only, and Auto-sync is permanently forbidden.

## Disabled execution page skeleton

`docs/AHA_SYNC_HUB_DISABLED_EXECUTION_PAGE_SKELETON.md` now defines the future page sections, inert controls, blocked reasons, loading rules, Home boundary, activation boundary, and Gate E–J impact. The skeleton is **defined, not implemented**; execution UI implementation remains not activated, `sync.html` remains absent, execution remains **NO-GO**, Home remains preview-only, and auto-sync remains permanently forbidden.

## Execution page implementation boundary

`docs/AHA_SYNC_HUB_EXECUTION_PAGE_IMPLEMENTATION_BOUNDARY.md` defines the future implementation phases, allowed files and preview-only dependencies, forbidden dependencies, page-load boundary, disabled-controls boundary, Home boundary, activation boundary, and Gate E–J impact. The boundary is defined, not implemented. Disabled UI requirements remain test-locked, disabled UI implementation remains not activated, Home remains preview-only, execution remains **NO-GO**, and auto-sync remains permanently forbidden.

## Recommended next PR

The single recommended next PR is:

```text
test: lock Sync Hub execution page implementation boundary
```

That PR must test-lock the implementation boundary without implementing execution UI, enabling a sync button, changing runtime behavior, calling sync, repository, Supabase, or database APIs, writing or deleting `localStorage`, activating audit/history or rollback, or weakening the permanent auto-sync prohibition.
