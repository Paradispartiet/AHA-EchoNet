# Personal AI Loop export/report surface review

Status: **reviewed**  
Scope: documentation only  
Decision date: 2026-06-21

This review defines the allowed shape of a future Personal AI Loop export/report surface. It does not implement export, PDF generation, downloads, report UI, sharing, publishing, sync, JavaScript, HTML, CSS, tests, Sync Hub behavior, `sync.html`, manual sync, auto-sync, Supabase/database writes, remote writes, fetch/XHR/sendBeacon calls, AHAavisa publishing, Groups sharing, audit execution, raw audit export, private corpus export, memory dump export, chat history export, raw retrieval-index export, secrets export, or any execution/sync/publish surface.

## 1. Current locked state

The Personal AI Loop export/report surface must build on the existing locked state:

- Personal AI Loop Audit is **local-first**.
- The read-only boundary is test-locked by `tests/aha-personal-ai-loop-read-only-boundary.test.cjs`.
- Privacy/operator visibility is reviewed in `docs/AHA_PERSONAL_AI_LOOP_AUDIT_PRIVACY_OPERATOR_VISIBILITY.md` and test-locked.
- The next activation surface is reviewed in `docs/AHA_PERSONAL_AI_LOOP_AUDIT_NEXT_ACTIVATION_SURFACE.md` and test-locked.
- Operator recommendations UX and behavior are reviewed in `docs/AHA_PERSONAL_AI_LOOP_OPERATOR_RECOMMENDATIONS_UX.md` and test-locked.
- Chat readiness surface and behavior are reviewed in `docs/AHA_PERSONAL_AI_LOOP_CHAT_READINESS_SURFACE.md` and test-locked.
- Meta Insights recommendation surface and behavior are reviewed in `docs/AHA_PERSONAL_AI_LOOP_META_INSIGHTS_RECOMMENDATION_SURFACE.md` and test-locked.
- Audit run is **explicit-action only** from the approved operator/Training Dashboard action.
- Export/report must be **explicit-action only**.
- Export/report must not run audit automatically.
- Export/report must not write data.
- Export/report must not trigger Sync Hub.
- Export/report must not trigger auto-sync.
- Export/report must not publish or share.
- Export/report must not contain raw audit payload or private payload.

Export/report is a local review surface only. It is not an execution surface, not Sync Hub, not a writeback path, not a publisher, not a sharing flow, and not a hidden channel for raw private context.

## 2. Purpose

The purpose of the export/report surface is to:

- give the user/operator a safe local report about Personal AI Loop readiness;
- summarize blockers, warnings, and next steps;
- show compact/redacted status from audit, Chat readiness, and Meta Insights;
- support manual review;
- provide a documentable overview without private raw data;
- prevent export/report from becoming hidden sync, publish, or share behavior.

The report should answer “what is the current Personal AI Loop readiness posture?” using bounded local status, counts, safe titles, redacted summaries, and manual next steps only.

## 3. Allowed export/report content

A later implementation may include only compact/redacted local report content, after a dedicated test-lock PR and implementation PR. Allowed content includes:

- compact readiness state;
- compact audit status;
- blocker count;
- warning count;
- top blocker titles;
- top warning titles;
- compact operator next step;
- compact Meta Insights recommendation summary;
- compact Chat readiness summary;
- timestamp for last cached audit;
- `manual review required` flag;
- safe status labels;
- redacted summary text;
- local-only report metadata.

Allowed content must remain bounded, redacted, local, and review-oriented. It must not become raw evidence, hidden prompt context, domain writes, remote writes, sync triggers, publishing, or sharing.

## 4. Forbidden export/report content

Export/report must not include, display, store, embed, serialize, download, print, or pass through:

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
- raw user identifiers beyond safe display labels;
- private source URLs unless explicitly redacted and approved;
- unredacted email addresses.

These prohibitions apply to visible report text, generated file content, metadata, DOM attributes, logs, debug output, errors, fallbacks, cached values, prompt/context builders, filenames, and future compact packs.

## 5. Forbidden export/report behavior

Export/report must not:

- run audit automatically;
- write `localStorage`;
- write domain data;
- write remote data;
- write Supabase/database data;
- trigger Sync Hub;
- trigger manual sync;
- trigger auto-sync;
- publish AHAavisa;
- post or share in Groups;
- send source events;
- send publish/share events;
- perform background sync;
- create tasks or automation without explicit action;
- start download/export without explicit user action;
- send the report to a network, email, or external service.

Missing data, invalid data, warnings, blockers, stale summaries, or user interest in a report must never be treated as permission to run audit, repair state, sync, publish, share, or write.

## 6. Report states

### A. `ready`

`ready` means:

- cached compact summaries exist;
- no blockers exist;
- the report can be generated locally after explicit user action.

A ready report may show compact status and safe local report metadata only. It must not expose raw evidence, write state, trigger Sync Hub, publish, or share.

### B. `attention_needed`

`attention_needed` means:

- warnings exist;
- no fatal blockers exist;
- the report can be generated with a clear manual next step.

The report may show warning counts, top warning titles, redacted summary text, and a manual next step. It must not auto-fix, run audit, write data, or hide degraded status.

### C. `blocked`

`blocked` means one or more blockers exist, including possible missing consent, material, retrieval index, or audit summary.

The report must show a compact blocked reason. It must not auto-fix missing consent, material, index, or summary. Blocked status must remain visible and fail-closed.

### D. `unknown`

`unknown` means:

- cached summary is missing;
- cached summary is invalid;
- required compact fields are absent;
- readiness cannot be trusted.

The report must fail-closed and may only show `manual audit/review required` guidance.

## 7. Fail-closed report UX

When cached summary is missing or invalid:

- the report shows `unknown` or `blocked`;
- the report shows a manual next step;
- the report does not run audit;
- the report does not write data;
- the report does not trigger sync;
- the report does not show raw payload;
- the report may point to Training Dashboard/operator review.

Fail-closed UX must make it clear that Personal AI Loop readiness cannot be trusted until the operator performs explicit local review. The fallback must never silently repair, bypass, enrich, download, sync, publish, share, or write state.

## 8. Relationship to Chat readiness

Chat readiness is a runtime status surface. Export/report is an explicit local report surface.

- Both surfaces use compact/redacted summaries.
- The report may refer to Chat readiness state.
- The report must not use Chat prompts or raw conversations as export content.
- The report must not inject private data into Chat prompts.
- Chat readiness must not become a report-generation trigger.
- Report generation must not become a Chat execution or prompt-injection path.

## 9. Relationship to Meta Insights

The report may use compact/redacted Meta Insights recommendation summary after the surface is test-locked.

- The report may show severity counts, top titles, and next step.
- The report must not include raw Meta Insights prompt or context.
- The report must not include raw evidence.
- The report must not perform writeback.
- Meta Insights status must remain a compact insight input, not a source of private report payload.

## 10. Relationship to Training Dashboard

The Training Dashboard is the primary operator surface.

- The report may point to the Training Dashboard for manual review.
- The report must not take over the audit-run UI.
- The report must not auto-run audit when Training status is missing.
- The report must not duplicate Training Dashboard controls in a way that creates hidden write, sync, publish, share, or audit execution behavior.

Audit execution remains explicit-action only from the reviewed operator/Training Dashboard surface.

## 11. Relationship to Sync Hub

Export/report surface is not Sync Hub.

- Export/report must not trigger Sync Hub.
- Sync Hub execution remains **NO-GO**.
- `sync.html` remains outside this workstream.
- Auto-sync remains **permanently forbidden**.
- Missing, blocked, unknown, or stale report status must not become a sync trigger.

## 12. Relationship to AHAavisa / Groups

Export/report must not:

- publish AHAavisa;
- post or share in Groups;
- generate social sharing events;
- generate source, publish, or share events.

Any future export is local and explicit-user-action only. Sharing or publishing requires its own documentation review and test-lock before implementation.

## 13. Required gates before implementation

Before any later implementation PR, all of the following gates are required:

- docs review merged;
- test-lock PR merged;
- read-only boundary tests green;
- privacy/operator visibility tests green;
- next activation surface tests green;
- operator recommendations tests green;
- Chat readiness tests green;
- Meta Insights recommendation tests green;
- no automatic audit run;
- no raw export payload;
- no domain write;
- no remote write;
- no Sync Hub trigger;
- no auto-sync;
- no publish/share/source events;
- compact/redacted output only;
- local-only explicit action only;
- `npm test` green;
- `git diff --check` green;
- implementation PR has its own specific behavior test.

Implementation must not begin until export/report behavior is separately test-locked.

## 14. Future PR sequence

Recommended safe sequence:

1. `test: lock Personal AI Loop export/report surface`
2. `feat: add Personal AI Loop local readiness report`
3. `test: lock Personal AI Loop local readiness report behavior`
4. `docs: review Personal AI Loop source approval surface`
5. `test: lock Personal AI Loop source approval surface`

## 15. Next recommended PR

```text
test: lock Personal AI Loop export/report surface
```
