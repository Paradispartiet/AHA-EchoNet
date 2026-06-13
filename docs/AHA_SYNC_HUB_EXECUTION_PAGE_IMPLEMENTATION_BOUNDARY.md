# AHA Sync Hub execution page implementation boundary

## Current decision

- Execution page implementation boundary is defined, not implemented.
- `sync.html` must not be created in this PR.
- Manual sync execution remains **NO-GO**.
- Home remains preview-only.
- Disabled execution page skeleton remains test-locked.
- No executable sync button may exist.
- No enabled execution UI may exist before all gates are **GO**.
- Audit write path remains not activated.
- Rollback implementation remains not activated.
- Supabase/session fallback implementation remains not activated.
- Auto-sync is permanently forbidden.

This document is an implementation boundary only. It does not create a page, UI, handler, runtime path, persistence path, remote call, or sync capability.

## Purpose

The implementation boundary must be defined before a page may be created to:

- prevent an accidental execution surface
- keep Home preview-only
- separate the page shell from execution activation
- separate disabled controls from enabled controls
- make allowed files explicit
- make forbidden runtime loading explicit
- keep the activation PR separate
- preserve no-write and no-auto-sync guarantees

## Future implementation phases

### Phase 1: docs only

- boundary defined
- no `sync.html`
- no runtime changes
- no execution UI

### Phase 2: disabled page shell

- future `sync.html` may be created
- page shell must be inert
- controls must be disabled
- no module runtime scripts
- no sync calls
- no writes
- no auto-sync

### Phase 3: preview-only page wiring

- read-only diagnostics may render
- dry-run plan may render
- per-module preview may render
- no writes
- no sync
- no Supabase writes
- no audit writes
- no rollback

### Phase 4: activation PR

- exact activation PR required: `feat: activate manual AHA Sync Hub execution`
- only the activation PR may enable execution
- all gates A–J must be **GO**
- execution tests are required before enabling

## Allowed future disabled page files

The following are allowed future names, not files to be created in this PR:

- `sync.html`
- `js/ahaSyncExecutionPage.js`
- `css/aha-sync-execution.css`
- `tests/aha-sync-hub-execution-page-boundary.test.cjs`

Listing these names does not authorize implementation, runtime loading, UI creation, or execution.

## Allowed preview-only dependencies

A future disabled page may use these preview-safe files:

- `js/ahaSyncHub.js`
- `js/ahaManualSyncDryRunTargetAdapter.js`
- `js/ahaDashboard.js` only if read-only helpers are reused safely

This allowance requires:

- no module runtime loading before activation
- no sync function calls
- no writes
- no Supabase write APIs
- no audit writes
- no rollback

## Forbidden dependencies before activation

Before activation, a future disabled page must not load:

- `js/ahaLists.js`
- `js/ahaPaths.js`
- `js/ahaGroups.js`
- `js/ahaAvisa.js`

Before activation, it must not use:

- `syncFromDatabase`
- `AHARepository.save`
- `AHARepository.load`
- `supabase.from`
- `localStorage.setItem`
- `localStorage.removeItem`
- `dispatchEvent(new CustomEvent`
- source events
- insights
- publishing
- social sharing

## Page load boundary

A future disabled or preview-only page must have:

- no execution on page load
- no execution on render
- no execution on `DOMContentLoaded`
- no execution on auth-ready
- no execution on storage event
- no execution on `visibilitychange`
- no execution by timer/interval
- no execution when a Supabase session becomes ready
- no execution when `localStorage` changes

Readiness changes may update read-only status only; they must never trigger execution.

## Disabled controls boundary

Before activation, these future controls must be disabled:

- Run manual sync
- Confirm execution
- Retry failed module
- Rollback module
- Write audit/history
- Publish AHAavisa
- Share Groups result

Every listed control:

- must not have a hidden click handler
- must not call sync
- must not write
- must not rollback
- must not publish
- must not dispatch source events

Visual disablement is insufficient. Keyboard, delegated, lifecycle, readiness-transition, and delayed paths must also remain inert.

## Home boundary

- Home remains preview-only.
- Home must not load module runtime scripts.
- Home must not contain enabled execution controls.
- Home must not link to an executable sync page before the page boundary is test-locked.
- Home must not execute sync.
- Home must not write.
- Home must not auto-sync.

## Activation boundary

- The activation PR must be separate.
- The exact PR name is `feat: activate manual AHA Sync Hub execution`.
- All gates A–J must be **GO**.
- The activation PR must explicitly list writable surfaces.
- The activation PR must explicitly list loaded runtime modules.
- The activation PR must explicitly document rollback behavior.
- The activation PR must explicitly document audit write behavior.
- The activation PR must explicitly document Supabase/session behavior.
- The activation PR must include tests before execution is enabled.

No earlier docs, test-lock, shell, or preview-only PR may enable execution.

## Gate impact

- **Gate E: dedicated execution surface readiness** — defines the implementation boundary and fail-closed surface rules, but does not implement the surface.
- **Gate F: per-module errors/results** — permits preview-only results while keeping retries and real execution results inactive.
- **Gate G: no-write safety** — prohibits hidden writes, storage mutation, execution triggers, and side effects before activation.
- **Gate H: audit/history** — keeps audit/history writing inactive and its control disabled.
- **Gate I: Supabase/session fallback** — permits read-only readiness only and prohibits session-ready execution or Supabase writes.
- **Gate J: tests** — requires this boundary and the continued absence/inertness rules to be test-locked before page implementation.

Gates E, F, G, H, I, and J remain not full **GO for execution**. This boundary does not make any gate GO.

## Required before implementation

- implementation boundary defined
- implementation boundary tests added
- disabled page shell plan documented
- allowed future files documented
- forbidden dependencies documented
- page load boundary documented
- disabled controls boundary documented
- Home boundary documented
- activation boundary documented
- `sync.html` still absent
- all gates A–J still required before activation

## Recommended next PR

The single recommended next PR is:

```text
test: lock Sync Hub execution page implementation boundary
```

That PR must only test-lock this boundary and continued page/runtime safety. It must not create `sync.html`, implement UI, load module runtime, activate writes or sync, or weaken the permanent auto-sync prohibition.
