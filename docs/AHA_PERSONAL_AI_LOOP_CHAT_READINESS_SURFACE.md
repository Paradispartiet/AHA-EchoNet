# Personal AI Loop Chat readiness surface review

Status: **reviewed**  
Scope: documentation only  
Decision date: 2026-06-20

This review defines how a future AHA Chat surface may show Personal AI Loop readiness/status without becoming an audit execution, sync, write, publishing, sharing, or raw-private-data surface. It does not implement UI, JavaScript, HTML, CSS, tests, Sync Hub, `sync.html`, manual sync, auto-sync, Supabase/database writes, fetch/XHR/sendBeacon calls, AHAavisa publishing, Groups sharing, or chat prompt injection.

## 1. Current locked state

Chat readiness must build on the existing locked state:

- Personal AI Loop Audit is **local-first**.
- The read-only boundary is test-locked by `tests/aha-personal-ai-loop-read-only-boundary.test.cjs`.
- Privacy/operator visibility is test-locked by `tests/aha-personal-ai-loop-privacy-operator-visibility.test.cjs`.
- The next activation surface is test-locked by `tests/aha-personal-ai-loop-next-activation-surface.test.cjs`.
- Operator recommendations UX is reviewed in `docs/AHA_PERSONAL_AI_LOOP_OPERATOR_RECOMMENDATIONS_UX.md` and test-locked by `tests/aha-personal-ai-loop-operator-recommendations-ux.test.cjs`.
- Operator recommendations behavior is test-locked by `tests/aha-personal-ai-loop-operator-recommendations-behavior.test.cjs`.
- Audit run is **explicit-action only** from the approved operator/Training Dashboard action.
- Chat must not run audit automatically.
- Chat must not write audit data or domain data.
- Chat must not trigger Sync Hub.
- Chat must not trigger auto-sync.
- Chat must not publish, share, or create source/publish/share events.
- Chat must not inject raw audit payload into the chat prompt.
- The only approved audit cache key remains `aha_personal_ai_loop_audit_v1`, and Chat may only read a compact/cached summary when a later implementation is separately test-locked.

Chat readiness is a display/readiness surface only. It is not a remediation engine, not a data writer, not Sync Hub, not a publisher, not a social sharing surface, and not a hidden prompt-enrichment channel.

## 2. Purpose

The purpose of a future Chat readiness surface is to:

- show whether Personal AI Loop is ready for use in chat;
- explain why personal context is ready, partially ready, blocked, or unknown;
- provide short, safe, manual next steps;
- show blockers and warnings without leaking private data;
- make readiness understandable to the user/operator;
- prevent Chat from behaving like an execution, write, sync, publish, or share surface;
- keep the operator in control of audit execution and remediation.

The surface should answer “can chat safely use personal context right now?” using compact/redacted status only. It must not answer that question by running audit, refreshing indexes, writing state, syncing, publishing, sharing, or exposing raw source material.

## 3. Allowed Chat display

A later implementation may show only compact/redacted readiness information, after a dedicated test-lock PR and implementation PR. Allowed Chat display includes:

- compact readiness status;
- one of `ready`, `partially_ready`, `blocked`, or `unknown`;
- blocker count;
- warning count;
- top blocker titles;
- top warning titles;
- one compact operator next step;
- “last audit status” from a cached summary;
- “needs manual audit/review” messaging;
- a link or text pointing the user to the Training Dashboard/operator surface;
- redacted/compact Personal AI Loop readiness;
- short explanatory copy that does not include raw private evidence.

Allowed display is informational only. Counts, titles, severity, status, and next steps must remain bounded and must not become hidden prompt payload.

## 4. Forbidden Chat display

Chat must not display or use:

- raw audit payload;
- full private corpus;
- full memory dump;
- full chat history;
- secrets, tokens, API keys, passwords, connection strings, or credentials;
- raw source content;
- unredacted recommendation evidence;
- raw retrieval index;
- raw approved examples;
- raw consent metadata;
- hidden prompt payload containing private data;
- hidden system prompt injection with private data;
- full recommendation objects when those objects include evidence or raw/private fields.

These limits apply to visible UI, DOM attributes, logs, debug panels, prompt builders, agent context builders, error states, fallback paths, and any future compact pack used by Chat.

## 5. Forbidden Chat behavior

Chat must not:

- run audit automatically on page load;
- run audit automatically on render;
- run audit automatically on chat message;
- run audit automatically when the user opens Chat;
- write `localStorage` outside an explicitly reviewed and test-locked cached audit read boundary;
- write domain data;
- write remote data;
- write Supabase/database data;
- refresh or persist a retrieval index automatically;
- trigger Sync Hub;
- trigger manual sync;
- trigger auto-sync;
- publish AHAavisa;
- post or share in Groups;
- send source events;
- send publish/share events;
- perform background sync;
- call `fetch`, XHR, `sendBeacon`, repository write APIs, sync execution APIs, publish APIs, or share APIs as part of readiness display;
- auto-handle blockers or warnings.

The readiness surface must remain passive and fail-closed. Missing data, invalid summaries, errors, stale status, or blockers must not be treated as permission to run audit or repair state automatically.

## 6. Readiness states

### A. `ready`

`ready` means:

- a cached audit summary exists;
- approved/consented material is sufficient;
- no blockers exist;
- compact recommendation summary is available;
- Chat can show a compact ready status.

Chat may show the ready state as compact status only. It still must not expose raw evidence, write state, refresh indexes, trigger Sync Hub, or publish/share.

### B. `partially_ready`

`partially_ready` means:

- a cached audit summary exists;
- warnings exist;
- no fatal blockers exist;
- the user/operator may need manual review before relying on personal context fully.

Chat may show warnings, warning count, top warning titles, and one manual next step. Chat must not auto-fix, run audit, write data, or hide degraded status.

### C. `blocked`

`blocked` means one or more blockers exist, such as:

- missing consent;
- insufficient approved material;
- missing or unusable retrieval index;
- missing audit summary where readiness cannot be established;
- privacy/operator visibility blocker;
- stale or invalid readiness status that must fail closed.

Chat must explain why personal context is not ready using compact blocker titles/counts and manual next-step copy. Chat must not attempt auto-fix, audit execution, index refresh, sync, writeback, publishing, or sharing.

### D. `unknown`

`unknown` means:

- cached summary is missing;
- cached summary is invalid;
- cached summary cannot be parsed safely;
- required compact fields are absent;
- the source of readiness cannot be trusted.

Chat must fail closed. It may only say that manual audit/review is needed and point to the Training Dashboard/operator surface. It must not run audit, write data, trigger sync, or reveal raw payload.

## 7. Fail-closed Chat UX

When cached summary is missing or invalid:

- Chat shows `unknown` or blocked readiness;
- Chat shows a manual next step;
- Chat does not run audit;
- Chat does not write data;
- Chat does not trigger sync;
- Chat does not show raw payload;
- Chat may point to Training Dashboard/operator review;
- Chat keeps personal context unavailable until a valid compact cached summary exists.

Fail-closed UX must be clear enough that the user understands personal context is unavailable because the readiness source is missing or unsafe, not because Chat silently repaired or bypassed the gate.

## 8. Relationship to operator recommendations

Chat readiness may use compact output from operator recommendations, such as:

- status;
- severity;
- counts;
- titles;
- one `nextStep` or equivalent compact manual guidance.

Chat must not:

- show full recommendation objects as raw data;
- use recommendation evidence as hidden prompt payload;
- auto-handle recommendations;
- start audit from recommendations;
- convert recommendation blockers/warnings into write, sync, publish, share, or index-refresh actions.

Operator recommendations remain operator-visible guidance, not executable automation.

## 9. Relationship to Meta Insights

Chat readiness and Meta Insights must both use compact/redacted summaries.

- No raw private data may be sent to Meta Insights.
- No raw private data may be injected into a chat prompt.
- Neither Meta Insights nor Chat may execute audit.
- Neither Meta Insights nor Chat may write back audit results, domain data, recommendation results, retrieval indexes, or source events.
- Both surfaces must preserve the compact/redacted boundary for counts, status, readiness, and recommendation summaries.

If a future design needs more than compact status, it requires a separate review and test-lock before implementation.

## 10. Relationship to Training Dashboard

The Training Dashboard is the primary operator surface.

- Chat is a secondary status surface.
- Chat may point the user to the Training Dashboard for manual audit/review.
- Chat must not take over the audit-run UI.
- Chat must not auto-run audit when Training status is missing.
- Chat must not duplicate Training Dashboard controls in a way that creates hidden write/sync/publish behavior.

Audit execution must remain explicit-action only from the reviewed operator surface.

## 11. Relationship to Sync Hub

Chat readiness surface is not Sync Hub.

- Chat readiness must not trigger Sync Hub.
- Sync Hub execution remains **NO-GO**.
- `sync.html` remains outside this workstream and must not be created here.
- Manual sync is not activated by this review.
- Auto-sync remains **permanently forbidden**.
- No Sync Hub audit write path, history write, source event, rollback, execution adapter, or background sync behavior is authorized.

## 12. Relationship to AHAavisa / Groups

Chat readiness must not:

- publish AHAavisa;
- post or share in Groups;
- generate social sharing events;
- generate publish/share events;
- convert readiness warnings or recommendations into outbound content.

Chat readiness may only suggest manual local next steps. It must remain a private readiness/status surface.

## 13. Required gates before implementation

Before a later implementation PR, all of the following gates are required:

- this docs review is merged;
- `test: lock Personal AI Loop Chat readiness surface` is merged;
- read-only boundary tests are green;
- privacy/operator visibility tests are green;
- next activation surface tests are green;
- operator recommendations UX tests are green;
- operator recommendations behavior tests are green;
- no automatic audit run exists;
- no raw audit payload is injected into the chat prompt;
- no domain write exists;
- no remote write exists;
- no Sync Hub trigger exists;
- no auto-sync exists;
- no publish/share/source events exist;
- compact/redacted output only is used;
- `npm test` is green;
- `git diff --check` is green;
- the implementation PR has its own specific behavior test.

No implementation should proceed by relying on this document alone. The next PR must test-lock the Chat readiness surface before runtime changes are introduced.

## 14. Future PR sequence

Recommended safe sequence:

1. `test: lock Personal AI Loop Chat readiness surface`
2. `feat: add Personal AI Loop Chat readiness status`
3. `test: lock Personal AI Loop Chat readiness behavior`
4. `docs: review Personal AI Loop Meta Insights recommendation surface`
5. `test: lock Personal AI Loop Meta Insights recommendation surface`

Runtime activation should not be proposed before the docs and tests for the surface are in place.

## 15. Next recommended PR

```text
test: lock Personal AI Loop Chat readiness surface
```
