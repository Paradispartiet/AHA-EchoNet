# AHA Sync Hub dedicated execution page plan

## Current decision

- The dedicated execution page is planned, not implemented.
- Manual sync execution remains **NO-GO**.
- Home remains preview-only.
- Home must not load sync module runtime.
- Auto-sync is permanently forbidden.
- No execution page may run sync until all activation gates are **GO**.
- Audit/history activation requirements are reviewed in `docs/AHA_SYNC_HUB_AUDIT_HISTORY_ACTIVATION_REQUIREMENTS.md`, but no audit/history write path is implemented or activated.
- Rollback/no-write failure modes are reviewed in `docs/AHA_SYNC_HUB_ROLLBACK_NO_WRITE_FAILURE_MODES.md`, but rollback and execution remain not implemented.
- Supabase/session fallback requirements are reviewed in `docs/AHA_SYNC_HUB_SUPABASE_SESSION_FALLBACK_BEFORE_EXECUTION.md`, but session-dependent execution remains not implemented.
- Disabled execution UI requirements are reviewed in `docs/AHA_SYNC_HUB_DISABLED_EXECUTION_UI_BEFORE_ACTIVATION.md`, but the UI and dedicated surface remain not implemented.
- The next bounded planning layer, the disabled page skeleton, is defined in `docs/AHA_SYNC_HUB_DISABLED_EXECUTION_PAGE_SKELETON.md`; it is not implemented and `sync.html` remains not created.

This plan defines a future isolation boundary only. It does not create an execution page, activate manual sync, authorize writes, or change runtime behavior.

## Proposed page

The proposed future file is `sync.html`. Its purpose would be to provide an isolated manual sync execution surface that is not part of Home.

After a separate activation decision, the page could load the execution runtime required by an approved execution contract. It must allow only explicit user-triggered manual sync and must never auto-run on load.

`sync.html` is not created by this plan and must not be implemented until the required planning, boundary, contract, and activation work has been approved.

## Separation from Home

Home may load these read-only status and preview files:

- `js/ahaSyncHub.js`
- `js/ahaManualSyncDryRunTargetAdapter.js`
- `js/ahaDashboard.js`

Home must not load these sync module runtime files:

- `js/ahaLists.js`
- `js/ahaPaths.js`
- `js/ahaGroups.js`
- `js/ahaAvisa.js`

A dedicated execution page may eventually load module runtime, but only after the activation gate is approved. The existing test-locked Home boundary must remain unchanged before and after any future execution-page work.

## Proposed execution page loading boundary

A future `sync.html` may load only the assets approved by its execution contract, potentially including:

- shared shell/status assets
- an auth/session helper, if needed
- `js/ahaRepository.js`, only if required by the execution contract
- `js/ahaLists.js`
- `js/ahaPaths.js`
- `js/ahaGroups.js`
- `js/ahaAvisa.js`
- manual sync adapter/state machine files, if already approved

This loading boundary is a proposal, not an implementation authorization. None of these files may be added to a new execution page in this PR, and the module runtime must remain unloaded on Home.

## Required activation gates before implementation

- [ ] Gates A–J must be **GO for execution**.
- [ ] A dedicated activation PR must exist and be named exactly: `feat: activate manual AHA Sync Hub execution`.
- [ ] The execution page PR must be separate from the activation PR unless explicitly approved.
- [ ] A user click must be required for execution.
- [ ] A confirm step must be required.
- [ ] A dry-run preview must be required before execution.
- [ ] A per-module result preview must be required before execution.
- [ ] Per-module error handling must be defined and approved.
- [x] Audit/history requirements are reviewed in `docs/AHA_SYNC_HUB_AUDIT_HISTORY_ACTIVATION_REQUIREMENTS.md`; implementation, write-path approval, and activation evidence remain outstanding.
- [x] Supabase/session fallback requirements are reviewed in `docs/AHA_SYNC_HUB_SUPABASE_SESSION_FALLBACK_BEFORE_EXECUTION.md`; tests, implementation, and activation evidence remain outstanding.
- [x] Rollback/no-write failure modes are reviewed in `docs/AHA_SYNC_HUB_ROLLBACK_NO_WRITE_FAILURE_MODES.md`; test-locking, implementation, and activation evidence remain outstanding.
- [x] Disabled execution UI requirements are reviewed in `docs/AHA_SYNC_HUB_DISABLED_EXECUTION_UI_BEFORE_ACTIVATION.md`; test-locking, implementation, and activation evidence remain outstanding.
- [ ] A remote error must never delete localStorage data.
- [ ] Hidden writes must be impossible and test-locked.
- [ ] Auto-sync must remain impossible and permanently forbidden.
- [ ] Execution on page load must be impossible.
- [ ] Execution during render must be impossible.
- [ ] Execution on storage or auth-ready events must be impossible.
- [ ] Execution by timer or interval must be impossible.

Documenting these gates does not make any gate **GO** and does not authorize implementation or execution.

## Proposed page states

A future execution page should have explicit, testable UI states:

- `not_configured`
- `preview_only`
- `gates_blocked`
- `ready_for_manual_review`
- `ready_for_confirmation`
- `executing`
- `partial_success`
- `success`
- `failed`
- `rollback_required`
- `rollback_complete`

These states are planned, not implemented. Their transitions, data contract, and safety behavior require later review and tests.

## Disabled-by-default policy

- Execution controls must render disabled by default.
- The execution button must remain disabled unless all gates are **GO**.
- The disabled state must be test-locked.
- No click handler may call execution while the decision is **NO-GO**.
- Preview-only controls may remain enabled when they cannot write or execute sync.

A disabled skeleton must not include an execution path that can be reached indirectly or enabled accidentally.

## Explicitly forbidden

- auto-sync
- execution on page load
- execution on render
- execution on a storage event
- execution on auth-ready
- execution on `visibilitychange`
- execution by timer or interval
- hidden database writes
- source events
- insights creation
- publishing
- social sharing
- AHAavisa publishing
- Groups social operations

These prohibitions apply to planning, implementation, activation, and post-activation operation unless a future scope explicitly changes a non-sync feature prohibition. The auto-sync prohibition is permanent.

## Implementation phases

### Phase 0: docs and boundary tests

**Status: current.**

The architecture, activation review, and Home module-loading boundary are documented. Home is preview-only, and tests lock module runtime out of Home.

### Phase 1: dedicated page plan

**Status: this PR.**

This phase defines the proposed page, loading boundary, activation gates, states, disabled-by-default policy, prohibitions, and future phases without creating `sync.html` or changing runtime.

### Phase 2: disabled execution page skeleton

**Status: defined, not implemented.**

`docs/AHA_SYNC_HUB_DISABLED_EXECUTION_PAGE_SKELETON.md` is the next bounded planning layer. It defines future sections, disabled controls, blocked reasons, loading rules, and activation boundaries without creating `sync.html`. A later implementation PR may create only a disabled page skeleton with no runtime execution, must preserve the disabled-by-default policy, and must not load module runtime before activation.

### Phase 3: execution page loading boundary tests

**Status: future PR.**

Tests must prove that controls remain disabled and that page load, render, storage, auth-ready, visibility, timers, or intervals cannot execute sync.

### Phase 4: execution contract review

**Status: in review; not implemented.**

The audit/history, rollback/no-write, Supabase/session fallback, and disabled execution UI requirements are reviewed in their dedicated documents, but audit/history writing, rollback, session-dependent execution, and manual execution are not implemented or activated. Real per-module error behavior and test-locked Supabase/session fallback evidence still require approval.

### Phase 5: activation PR

**Status: future PR only.**

The separate activation PR must be named exactly:

```text
feat: activate manual AHA Sync Hub execution
```

It may be considered only after all gates A–J are **GO for execution**. Auto-sync remains permanently forbidden.

## Recommended next PR

The single recommended next PR is:

```text
test: lock disabled Sync Hub execution page skeleton boundary
```

The skeleton is defined but not implemented. The next PR should test-lock its boundary and the absence of `sync.html` without implementing the dedicated page, activating execution, loading module runtime, writing data, or weakening the permanent auto-sync prohibition.
