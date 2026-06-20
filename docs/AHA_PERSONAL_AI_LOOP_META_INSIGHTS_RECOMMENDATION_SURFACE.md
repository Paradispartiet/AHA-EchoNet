# Personal AI Loop Meta Insights recommendation surface review

Status: **reviewed**  
Scope: documentation only  
Decision date: 2026-06-20

This review defines how a future Meta Insights recommendation surface may use Personal AI Loop operator recommendations and Chat readiness as compact/redacted insight input. It does not implement UI, JavaScript, HTML, CSS, tests, Sync Hub, `sync.html`, manual sync, auto-sync, Supabase/database writes, remote writes, fetch/XHR/sendBeacon calls, AHAavisa publishing, Groups sharing, audit execution, prompt injection, or any writeback path.

## 1. Current locked state

Meta Insights recommendation surface must build on the existing locked state:

- Personal AI Loop Audit is **local-first**.
- The read-only boundary is test-locked by `tests/aha-personal-ai-loop-read-only-boundary.test.cjs`.
- Privacy/operator visibility is test-locked by `tests/aha-personal-ai-loop-privacy-operator-visibility.test.cjs`.
- The next activation surface is reviewed and test-locked by `docs/AHA_PERSONAL_AI_LOOP_AUDIT_NEXT_ACTIVATION_SURFACE.md` and `tests/aha-personal-ai-loop-next-activation-surface.test.cjs`.
- Operator recommendations UX is reviewed in `docs/AHA_PERSONAL_AI_LOOP_OPERATOR_RECOMMENDATIONS_UX.md` and test-locked by `tests/aha-personal-ai-loop-operator-recommendations-ux.test.cjs`.
- Operator recommendations behavior is test-locked by `tests/aha-personal-ai-loop-operator-recommendations-behavior.test.cjs`.
- Chat readiness surface is reviewed in `docs/AHA_PERSONAL_AI_LOOP_CHAT_READINESS_SURFACE.md` and test-locked by `tests/aha-personal-ai-loop-chat-readiness-surface.test.cjs`.
- Chat readiness behavior is test-locked by `tests/aha-personal-ai-loop-chat-readiness-behavior.test.cjs`.
- Audit run is **explicit-action only** from the approved operator/Training Dashboard action.
- Meta Insights must not run audit automatically.
- Meta Insights must not write audit data or domain data.
- Meta Insights must not trigger Sync Hub.
- Meta Insights must not trigger auto-sync.
- Meta Insights must not publish or share.
- Meta Insights must not use raw audit payload.

Meta Insights recommendations are a compact insight/status surface only. They are not an execution surface, not Sync Hub, not a writeback path, not a publisher, and not a hidden channel for raw private context.

## 2. Purpose

The purpose of the Meta Insights recommendation surface is to:

- provide safe, high-level insight about Personal AI Loop readiness;
- use operator recommendations as a compact/redacted summary;
- show readiness blockers and warnings without private details;
- help the operator understand what must be done manually;
- support Chat and Training status without taking over execution;
- prevent Meta Insights from becoming hidden automation, sync, publish, share, or writeback infrastructure.

The surface should answer “what is the current Personal AI Loop readiness posture?” using bounded status, counts, titles, and manual next steps only.

## 3. Allowed Meta Insights input

A later implementation may use only compact/redacted Personal AI Loop inputs, after a dedicated test-lock PR and implementation PR. Allowed input includes:

- compact/redacted recommendation summary;
- counts by severity;
- top blocker titles;
- top warning titles;
- one compact operator next step;
- compact Chat readiness state;
- compact Chat readiness message;
- last audit status from a cached summary;
- manual review required flag;
- redacted/compact Personal AI Loop readiness.

Allowed input must remain bounded insight material. It must not become raw evidence, hidden prompt context, a source of domain writes, or a trigger for execution.

## 4. Forbidden Meta Insights input

Meta Insights must not use, display, store, or pass through:

- raw audit payload;
- full private corpus;
- full memory dump;
- full chat history;
- raw source content;
- raw retrieval index;
- raw approved examples;
- raw consent metadata;
- unredacted recommendation evidence;
- hidden prompt payload with private data;
- secrets, tokens, API keys, passwords, connection strings, or credentials;
- raw user identifiers beyond safe display labels.

These prohibitions apply to visible UI, insight builders, prompt/context builders, DOM attributes, logs, debug output, errors, fallbacks, cached data, and any future compact pack.

## 5. Forbidden Meta Insights behavior

Meta Insights must not:

- run audit automatically on page load;
- run audit automatically on render;
- run audit automatically when insights are built;
- write `localStorage`;
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
- create tasks or automation without explicit action.

Missing data, invalid data, warnings, blockers, or stale summaries must never be treated as permission to run audit, repair state, sync, publish, share, or write.

## 6. Meta Insights surface states

### A. `ready`

`ready` means:

- compact recommendation summary exists;
- no blockers exist;
- Chat readiness is `ready` or a safe `partially_ready` state;
- Meta Insights can show a compact ready insight.

Meta Insights may show a compact ready insight only. It must not expose raw evidence, write state, refresh indexes, trigger Sync Hub, publish, or share.

### B. `attention_needed`

`attention_needed` means:

- warnings exist;
- no fatal blockers exist;
- the operator should review a manual next step.

Meta Insights may show warnings, warning counts, top warning titles, and a manual next step. It must not auto-fix, run audit, write data, or hide degraded status.

### C. `blocked`

`blocked` means one or more blockers exist, such as:

- missing consent;
- missing approved material;
- missing retrieval index;
- missing audit summary;
- unusable or unsafe cached summary.

Meta Insights must show a compact blocked insight and must not auto-fix. Blocked status must remain visible and fail-closed.

### D. `unknown`

`unknown` means:

- cached summary is missing;
- cached summary is invalid;
- required compact fields are absent;
- the source of readiness cannot be trusted.

Meta Insights must fail-closed. It may only ask for manual audit/review and point to the Training Dashboard/operator review flow.

## 7. Fail-closed Meta Insights UX

When cached summary is missing or invalid:

- Meta Insights shows `unknown` or `blocked`;
- Meta Insights shows a manual next step;
- Meta Insights does not run audit;
- Meta Insights does not write data;
- Meta Insights does not trigger sync;
- Meta Insights does not show raw payload;
- Meta Insights may point to Training Dashboard/operator review.

Fail-closed UX must make it clear that Personal AI Loop readiness cannot be trusted until the operator performs explicit local review. The fallback must never silently repair, bypass, enrich, or sync state.

## 8. Relationship to operator recommendations

Meta Insights may use `buildCompactOperatorRecommendationSummary` when a later implementation is separately test-locked.

- Meta Insights may use counts, severity, titles, and `nextStep` from the compact summary.
- Meta Insights must not use full recommendation objects as raw data.
- Meta Insights must not use recommendation evidence as hidden prompt payload.
- Meta Insights must not auto-handle recommendations.
- Meta Insights must not start audit from recommendations.

Operator recommendations remain manual operator guidance. Meta Insights can summarize them; it cannot execute them.

## 9. Relationship to Chat readiness

Chat readiness and Meta Insights must both use compact/redacted summaries.

- Chat readiness is a user/status surface.
- Meta Insights is a high-level insight/status surface.
- No raw private data may be injected into Chat prompts.
- No raw private data may be injected into Meta Insights prompts or context.
- Chat must not execute audit.
- Meta Insights must not execute audit.
- Chat must not write back readiness, audit, domain, sync, publish, or share data.
- Meta Insights must not write back readiness, audit, domain, sync, publish, or share data.

Both surfaces must preserve the compact/redacted boundary for readiness state, counts, titles, and manual next steps.

## 10. Relationship to Training Dashboard

The Training Dashboard is the primary operator surface.

- Meta Insights is a secondary summary/insight surface.
- Meta Insights may point the operator to the Training Dashboard.
- Meta Insights must not take over the audit-run UI.
- Meta Insights must not auto-run audit when Training status is missing.
- Meta Insights must not duplicate Training Dashboard controls in a way that creates hidden write, sync, publish, share, or audit execution behavior.

Audit execution remains explicit-action only from the reviewed operator surface.

## 11. Relationship to Sync Hub

Meta Insights recommendation surface is not Sync Hub.

- Meta Insights must not trigger Sync Hub.
- Sync Hub execution remains **NO-GO**.
- `sync.html` remains outside this workstream.
- Auto-sync remains **permanently forbidden**.
- Missing or blocked readiness must not become a sync trigger.

## 12. Relationship to AHAavisa / Groups

Meta Insights recommendations must not:

- publish AHAavisa;
- post or share in Groups;
- generate social sharing events;
- generate source, publish, or share events.

Meta Insights recommendations may only suggest manual local next steps.

## 13. Required gates before implementation

Before any later implementation PR:

- docs review must be merged;
- test-lock PR must be merged;
- read-only boundary tests must be green;
- privacy/operator visibility tests must be green;
- next activation surface tests must be green;
- operator recommendations UX tests must be green;
- operator recommendations behavior tests must be green;
- Chat readiness surface tests must be green;
- Chat readiness behavior tests must be green;
- no automatic audit run;
- no raw audit payload in Meta Insights;
- no raw audit payload in Chat prompt;
- no domain write;
- no remote write;
- no Sync Hub trigger;
- no auto-sync;
- no publish/share/source events;
- compact/redacted output only;
- `npm test` must be green;
- `git diff --check` must be green;
- implementation PR must have its own specific behavior test.

## 14. Future PR sequence

Recommended safe sequence:

1. `test: lock Personal AI Loop Meta Insights recommendation surface`
2. `feat: add Personal AI Loop Meta Insights recommendation summary`
3. `test: lock Personal AI Loop Meta Insights recommendation behavior`
4. `docs: review Personal AI Loop export/report surface`
5. `test: lock Personal AI Loop export/report surface`

## 15. Next recommended PR

```text
test: lock Personal AI Loop Meta Insights recommendation surface
```
