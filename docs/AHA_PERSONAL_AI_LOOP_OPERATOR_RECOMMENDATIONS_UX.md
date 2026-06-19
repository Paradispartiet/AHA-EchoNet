# Personal AI Loop Audit: operator recommendations UX review

Status: **reviewed**  
Scope: documentation only  
Decision date: 2026-06-19

This review defines how a future Personal AI Loop Audit UX may present better operator recommendations without activating runtime behavior, auto-run, write routes, Sync Hub, publishing, social sharing, Supabase/database writes, rollback, source events, or new external calls. It is a planning/review document only; it does not implement recommendation objects, UI, JavaScript, HTML, CSS, tests, Sync Hub, sync execution, or any write path.

## 1. Current locked state

Operator recommendations must build on the existing locked state:

- Personal AI Loop Audit is **local-first**.
- The read-only boundary is test-locked by `tests/aha-personal-ai-loop-read-only-boundary.test.cjs`.
- Privacy/operator visibility is test-locked by `tests/aha-personal-ai-loop-privacy-operator-visibility.test.cjs`.
- The next activation surface is reviewed and test-locked by `docs/AHA_PERSONAL_AI_LOOP_AUDIT_NEXT_ACTIVATION_SURFACE.md` and `tests/aha-personal-ai-loop-next-activation-surface.test.cjs`.
- Audit run is **explicit-action only** from the approved Training Dashboard action.
- Render paths read cached summary only.
- Meta Insights receives a compact/redacted pack only.
- Chat receives compact readiness/status only.
- There are no domain writes from audit recommendation UX.
- There are no remote writes from audit recommendation UX.
- There is no Sync Hub trigger.
- There is no auto-sync.
- There is no publishing or social sharing.
- The only approved audit cache key remains `aha_personal_ai_loop_audit_v1`.

Recommendations are explanatory operator guidance. They are not domain records, not a new source of truth, and not executable automation.

## 2. UX goals

The operator recommendations UX should:

- make audit results easier to understand;
- explain why the system is ready or not ready;
- provide clear, manual next steps;
- distinguish between warning, blocker, and suggestion states;
- help the operator without automating actions;
- make privacy/safety status visible;
- never hide that something is blocked;
- keep the operator in control of every audit run and every future remediation action.

## 3. Recommendation categories

Future recommendation UX should group recommendations into stable, operator-visible categories.

### A. Readiness recommendations

Readiness recommendations explain whether the personal AI loop can be used safely and usefully:

- `ready` — the cached audit summary indicates that approved material, retrieval, sample query, privacy checks, and integration status are sufficient.
- `partially ready` — some safe signals exist, but one or more non-fatal requirements still need manual review.
- `blocked` — a blocker prevents safe use and must remain visible.
- `stale` — the audit or retrieval status may no longer reflect current approved material.
- `missing material` — there is not enough approved personal material for useful context.
- `missing consent` — material exists but is not eligible because consent is missing.
- `missing retrieval index` — approved material exists but no usable retrieval index is available.

### B. Privacy recommendations

Privacy recommendations explain data-safety constraints without exposing raw private data:

- `consent missing` — eligible material requires explicit consent before use.
- `unapproved material found` — draft, rejected, or otherwise unapproved material appears in an unsafe place and must not be used.
- `redaction needed` — a future display/export/report must reduce or redact details before showing them.
- `raw payload must not be shown` — full audit payload, full corpus, full memory dump, full chat history, credentials, secrets, tokens, and API keys must stay hidden by default.
- `compact summary only` — the operator or agent-facing surface may use counts, status, readiness, severity, warnings, and recommendations only.

### C. Content quality recommendations

Content quality recommendations help the operator improve future usefulness manually:

- `too few approved corpus items` — more approved and consented corpus items are needed.
- `too few approved examples` — more approved training examples are needed.
- `too few confirmed/important memory claims` — important claims should be confirmed or marked important through an existing explicit review flow.
- `weak source coverage` — source categories or project coverage are too narrow for reliable recommendations.
- `stale training material` — approved material appears older than the desired operating context and should be manually reviewed.

### D. Retrieval recommendations

Retrieval recommendations explain whether the retrieval layer can support compact, explainable readiness:

- `retrieval index missing` — no existing index is available.
- `retrieval index stale` — the index appears older than approved source material.
- `sample query failed` — a sample query did not return a useful, bounded result.
- `low explainability` — returned evidence lacks source/reason clarity.
- `source mismatch` — retrieval results point to sources that do not match approved/consented material.

### E. UX/operator recommendations

UX/operator recommendations are manual next-step prompts only:

- `run audit manually` — use the explicit audit action when the operator chooses.
- `review consent` — review consent status through existing local operator flows.
- `add approved examples` — create or approve more examples manually.
- `confirm important memory` — confirm or mark relevant memory claims as important through existing review flows.
- `refresh only through explicit future design` — any future retrieval refresh must be an explicit, separately reviewed design and must not run from render.
- `review warnings before implementation` — resolve visible warnings/blockers before a later implementation PR relies on the surface.

## 4. Recommendation severity model

Future recommendation UX should use the following severity model:

| Severity | Meaning | UX rule |
| --- | --- | --- |
| `ok` | The checked condition is safe or satisfied. | May be shown as positive status; must not trigger any action. |
| `info` | Neutral context that helps the operator understand status. | Operator-visible; must not trigger any action. |
| `suggestion` | Optional manual improvement. | Operator-visible; must not trigger sync/write/publish or auto-fix. |
| `warning` | A visible risk or degraded state that should be reviewed. | Must be visible; must not be hidden, suppressed, or converted into automation. |
| `blocker` | A condition that prevents safe use or implementation. | Must not be hidden; must remain operator-visible and fail-closed. |

Rules for all severities:

- `blocker` must not be hidden.
- `warning` must be visible.
- `info` and `suggestion` must not trigger actions.
- All severity levels must be operator-visible when relevant.
- No severity level may start sync, write domain data, write remote data, publish, share, refresh indexes, run audit automatically, or trigger Sync Hub.

## 5. Future recommendation object contract

A later implementation may define a recommendation object contract similar to this, but this document is review/plan only and does not implement it:

```js
{
  id: "stable_recommendation_id",
  severity: "ok | info | suggestion | warning | blocker",
  title: "Short operator-visible title",
  message: "Concise explanation without raw private payload",
  reason: "Why the recommendation exists",
  evidenceType: "cached_summary | count | status | warning | sample_query | privacy_check",
  relatedSurface: "training_dashboard | chat | meta_insights | export_report | sync_hub_status",
  allowedNextStep: "Manual, local next step the operator may choose",
  forbiddenAutomation: ["auto_audit", "domain_write", "remote_write", "sync_hub", "auto_sync", "publish", "share"],
  privacyRisk: "none | low | medium | high",
  requiresExplicitAction: true
}
```

Contract rules:

- It is not implemented by this PR.
- It is not a runtime contract yet.
- It must be test-locked before implementation.
- `requiresExplicitAction` must remain true for any recommendation that could lead to a state change in a later design.
- `forbiddenAutomation` must be treated as a hard no-go list, not as UI copy only.
- Recommendation objects must not contain full raw payload, full private corpus, full memory dump, full chat history, secrets, tokens, API keys, or connection strings.

## 6. Allowed UX behavior

A future UX may, after a dedicated test-lock PR and implementation PR:

- show compact readiness;
- show grouped recommendations;
- show warning/blocker badges;
- show manual next steps;
- show a why-not-ready explanation;
- show counts/status;
- show stale/missing index warnings;
- show consent/material warnings;
- link to relevant local operator sections;
- use cached audit summary;
- require explicit user action for audit run.

Allowed UX remains display/guidance only. It must preserve the local-first, read-only, compact/redacted, explicit-action boundary.

## 7. Forbidden UX behavior

A future UX must not:

- run audit automatically on page load;
- run audit automatically on render;
- run audit automatically on chat message;
- write domain data;
- write remote data;
- write Supabase/database data;
- refresh or persist a retrieval index automatically;
- trigger Sync Hub;
- trigger auto-sync;
- publish;
- share socially;
- send source events;
- show full raw payload by default;
- show full private corpus by default;
- show full memory dump;
- show full chat history;
- send raw private data to Meta Insights;
- inject raw audit payload into a chat prompt.

These prohibitions apply to primary UI paths, render paths, event handlers, chat-message flows, compact pack builders, fallback paths, error handlers, export/report work, and future recommendation grouping.

## 8. Surface-specific UX rules

### A. Training Dashboard

The Training Dashboard is the primary operator surface.

It may:

- show grouped recommendations;
- show compact readiness, counts, warnings, blockers, and manual next steps;
- show a manual audit button.

It must not:

- auto-run audit;
- auto-build or auto-refresh a retrieval index;
- write domain data from recommendation UX;
- write remote data;
- trigger Sync Hub.

### B. Chat

Chat may:

- show compact readiness/status;
- explain that personal context is not ready;
- point the operator toward a manual Training Dashboard review.

Chat must not:

- run audit automatically;
- inject raw audit payload into a chat prompt;
- mutate audit data;
- mutate domain data;
- trigger sync;
- trigger publish;
- trigger share/social posting.

### C. Meta Insights

Meta Insights may receive a compact recommendation summary only.

Allowed fields are limited to:

- status;
- counts;
- severity;
- recommendations;
- warnings.

Meta Insights must not receive:

- raw corpus;
- raw memory;
- full chat history;
- secrets;
- tokens;
- API keys;
- connection strings.

Meta Insights must not:

- run audit;
- write audit results;
- refresh or persist retrieval indexes;
- receive raw private data hidden inside recommendation messages.

### D. Export/report

Export/report behavior is not implemented by this review. If considered later, it must be:

- local/manual only;
- triggered by explicit user action;
- redacted by default;
- blocked from automatic publishing;
- blocked from social sharing;
- reviewed and test-locked separately before implementation.

## 9. Failure modes

All failure modes must be operator-visible and fail-closed. Each failure mode requires no write, no sync, no auto-fix, no publish, and a manual next step.

| Failure mode | Operator-visible status | Required behavior | Manual next step |
| --- | --- | --- | --- |
| Missing audit API | `blocker` / audit unavailable | Fail-closed; no write; no sync; no auto-fix; no publish | Verify local script loading, then run audit explicitly only after the API exists. |
| Missing cached summary | `info` or `warning` / no cached audit | Fail-closed; no write; no sync; no auto-fix; no publish | Use the explicit Training Dashboard audit action when ready. |
| Missing consent | `blocker` or `warning` | Fail-closed; no write; no sync; no auto-fix; no publish | Review consent manually in the relevant local operator section. |
| Missing approved corpus | `warning` / insufficient material | Fail-closed; no write; no sync; no auto-fix; no publish | Add or approve corpus items manually with appropriate consent. |
| Missing approved examples | `suggestion` or `warning` | Fail-closed; no write; no sync; no auto-fix; no publish | Approve or create examples manually. |
| Missing confirmed/important memory | `suggestion` or `warning` | Fail-closed; no write; no sync; no auto-fix; no publish | Confirm or mark important memory claims through existing manual review. |
| Stale retrieval index | `warning` | Fail-closed; no write; no sync; no auto-fix; no publish | Use only a future explicit reviewed refresh design; rerun audit manually afterward. |
| Failed sample query | `warning` or `blocker` | Fail-closed; no write; no sync; no auto-fix; no publish | Review approved material and retrieval explainability manually. |
| Unknown audit status | `blocker` or `warning` | Fail-closed; no write; no sync; no auto-fix; no publish | Treat as not ready; verify cached summary shape and local APIs. |
| Privacy warning | `blocker` or `warning` | Fail-closed; no write; no sync; no auto-fix; no publish | Review safe metadata and correct source eligibility or consent manually. |
| Redaction warning | `warning` | Fail-closed; no write; no sync; no auto-fix; no publish | Redact or reduce future display/export content before any implementation. |

No failure mode may fall back to raw localStorage dumps, broad private-data display, automatic index refresh, Sync Hub, publication, social sharing, or remote writes.

## 10. Required gates before implementation

Before a later implementation PR, all of the following gates must be true:

- docs review merged;
- test-lock PR merged;
- read-only boundary tests green;
- privacy/operator visibility tests green;
- next activation surface tests green;
- new UX behavior has specific tests;
- no automatic audit run;
- no domain write;
- no remote write;
- no Sync Hub trigger;
- no auto-sync;
- compact pack remains redacted;
- `aha_personal_ai_loop_audit_v1` remains the only audit cache key;
- `npm test` green;
- `git diff --check` green.

Implementation must not proceed from this document alone. The next step is a targeted test-lock PR.

## 11. Future PR sequence

Recommended safe sequence:

1. `test: lock Personal AI Loop operator recommendations UX`
2. `feat: improve Personal AI Loop operator recommendations`
3. `test: lock Personal AI Loop operator recommendations behavior`
4. `docs: review Personal AI Loop Chat readiness surface`
5. `test: lock Personal AI Loop Chat readiness surface`

## 12. Relationship to Sync Hub

Operator recommendations are not Sync Hub.

- Operator recommendations must not trigger Sync Hub.
- Sync Hub execution remains **NO-GO**.
- `sync.html` remains outside this workstream and must not be created here.
- Manual sync execution is not activated by this review.
- Auto-sync remains **permanently forbidden**.
- No Sync Hub audit write path, history write, source event, rollback, execution adapter, or target execution is authorized.

## 13. Relationship to AHAavisa / Groups

Operator recommendations must not publish or socially share content.

- Recommendations must not publish AHAavisa.
- Recommendations must not post or share in Groups.
- Recommendations must not generate social sharing events.
- Recommendations may only suggest manual local next steps.

## 14. Next recommended PR

```text
test: lock Personal AI Loop operator recommendations UX
```
