# AHA Sync Hub module loading strategy

## Current decision

- Home remains read-only.
- Home must not load sync module runtime files.
- Manual sync execution remains **NO-GO**.
- Auto-sync is permanently forbidden.
- Module loading for execution requires a later dedicated PR.
- Preview/dry-run may inspect metadata only.

This strategy documents a future execution boundary; it does not activate execution, authorize writes, or make module runtime available on Home.

## Current Home loading boundary

Home may load the read-only status and preview files:

- `js/ahaSyncHub.js`
- `js/ahaManualSyncDryRunTargetAdapter.js`
- `js/ahaDashboard.js`

Home must not load the sync module runtime files:

- `js/ahaLists.js`
- `js/ahaPaths.js`
- `js/ahaGroups.js`
- `js/ahaAvisa.js`

Home status and preview must remain read-only. The module runtime files can contain sync functions, so loading them on Home could make the activation boundary unclear even if no function is intentionally called. Execution must never become possible as a side effect of page load, render, an auth-ready event, or a storage event.

## Execution loading options

### Option A: dedicated sync execution page

- Use a separate page, for example `sync.html`.
- Load sync module runtime only on that page.
- Require explicit user action before any execution.
- Keep the execution surface isolated and easiest to audit.
- This is the recommended strategy before the first execution activation.

### Option B: dynamic import after explicit click

- Home does not load module runtime during page load.
- Module runtime is loaded only after an explicit user click.
- The import path must remain behind a disabled/GO gate until every activation requirement is satisfied.
- Tests must prove that page load, render, storage, and auth-ready paths cannot trigger loading.
- This option is more complex than Option A because the preview and execution boundaries share the Home surface.

### Option C: keep Home preview-only permanently

- Home remains a status and preview surface only.
- Execution occurs through another controlled entry point.
- This keeps risk low.
- This is the best long-term operating model for preserving a stable Home boundary.

## Recommended strategy

**Recommended: Option A, dedicated sync execution page.**

Reasons:

- provides a clear boundary
- allows simpler tests
- keeps module runtime off Home
- makes the permanent auto-sync prohibition easier to enforce
- makes an explicit user click easier to require and prove
- makes Supabase/session, audit, and rollback behavior easier to isolate

This recommendation is an architecture decision only. Creating the page, loading module runtime, or enabling execution requires later, separately reviewed work.

## Required gates before module runtime loading

- [ ] All gates A–J must be **GO for execution**.
- [ ] The activation PR must exist and be named exactly: `feat: activate manual AHA Sync Hub execution`.
- [ ] Module loading must not happen on Home page load.
- [ ] Module loading must not happen during render.
- [ ] Module loading must not happen on a storage event.
- [ ] Module loading must not happen on auth-ready.
- [ ] Module loading must be caused only by explicit user action.
- [ ] The execution button must remain disabled until all gates are green.
- [ ] Dry-run must remain available without module runtime.
- [ ] Preview must remain no-write/no-sync.
- [ ] Tests must prove Home still does not load module runtime files.

None of these gates is satisfied merely because this strategy is documented. Manual sync execution remains **NO-GO**.

## Module runtime files

| Module | Runtime file | Current Home status | Future execution status | Notes |
|---|---|---|---|---|
| Lists | `js/ahaLists.js` | not loaded on Home | future execution-only | Must remain outside the Home status/preview loading path. |
| Paths | `js/ahaPaths.js` | not loaded on Home | future execution-only | Must remain outside the Home status/preview loading path. |
| Groups | `js/ahaGroups.js` | not loaded on Home | future execution-only | Must remain outside the Home status/preview loading path. |
| AHAavisa | `js/ahaAvisa.js` | not loaded on Home | future execution-only | Must remain outside the Home status/preview loading path. |

## Forbidden loading paths

Module runtime must not be loaded through any of these paths:

- page load
- `renderDashboard`
- `renderSyncHubStatus`
- storage event
- auth-ready event
- automatic background job
- `visibilitychange`
- timer/interval
- preview render
- dry-run plan creation

These paths remain forbidden before and after any future manual-execution activation. They must not become indirect execution or import triggers.

## Allowed next work

### Allowed

- tests that lock the module loading boundary
- docs for a dedicated execution page
- disabled execution UI review
- Supabase/session execution review
- audit/history activation review
- rollback/no-write failure-mode review

### Not allowed

- real execution
- executable sync button
- module runtime loading on Home
- auto-sync
- hidden writes
- source events
- insights
- publishing
- social sharing

## Recommended next PR

The Home boundary is now test-locked. The single recommended next PR is:

```text
docs: plan dedicated Sync Hub execution page
```

That PR must remain documentation-only and must not load module runtime on Home, enable execution, write data, or weaken the permanent auto-sync prohibition.

## Boundary test coverage

The Home module loading boundary is test-locked by `tests/aha-sync-hub-module-loading-boundary.test.cjs`. The test requires the three read-only Home scripts, rejects the four sync module runtime files, locks script order, and scans dashboard preview/render/trigger paths plus the dry-run target adapter for runtime loading, sync execution, writes, database calls, source events, insights, and publishing.

This coverage does not approve execution. **Option A: dedicated sync execution page** remains the recommended strategy, Home remains read-only, manual sync execution remains **NO-GO**, and auto-sync remains permanently forbidden.
