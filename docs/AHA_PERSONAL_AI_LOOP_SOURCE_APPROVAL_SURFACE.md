# Personal AI Loop source approval surface review

Status: **reviewed**  
Scope: documentation only  
Decision date: 2026-06-21

This review defines the safety boundary for a future Personal AI Loop source approval surface. It does not implement source approval UI, approval buttons, source ingestion, sync, publishing, runtime behavior, JavaScript, HTML, CSS, tests, Sync Hub changes, `sync.html`, manual sync, auto-sync, Supabase/database writes, remote writes, fetch/XHR/sendBeacon calls, AHAavisa publishing, Groups sharing, raw source import, automatic source approval, source approval state writes, raw source export, private source URL exposure, or any execution/sync/publish surface.

## 1. Current locked state

The Personal AI Loop source approval surface must build on the existing locked state:

- Personal AI Loop Audit is **local-first**.
- The read-only boundary is test-locked by `tests/aha-personal-ai-loop-read-only-boundary.test.cjs`.
- Privacy/operator visibility is reviewed in `docs/AHA_PERSONAL_AI_LOOP_AUDIT_PRIVACY_OPERATOR_VISIBILITY.md` and test-locked.
- The next activation surface is reviewed in `docs/AHA_PERSONAL_AI_LOOP_AUDIT_NEXT_ACTIVATION_SURFACE.md` and test-locked.
- Operator recommendations UX and behavior are reviewed in `docs/AHA_PERSONAL_AI_LOOP_OPERATOR_RECOMMENDATIONS_UX.md` and test-locked.
- Chat readiness surface and behavior are reviewed in `docs/AHA_PERSONAL_AI_LOOP_CHAT_READINESS_SURFACE.md` and test-locked.
- Meta Insights recommendation surface and behavior are reviewed in `docs/AHA_PERSONAL_AI_LOOP_META_INSIGHTS_RECOMMENDATION_SURFACE.md` and test-locked.
- Export/report surface and behavior are reviewed in `docs/AHA_PERSONAL_AI_LOOP_EXPORT_REPORT_SURFACE.md` and test-locked.
- Audit run is **explicit-action only** from the approved operator/Training Dashboard action.
- Source approval must be **explicit-action only**.
- Source approval must not run audit automatically.
- Source approval must not write data in this review.
- Source approval must not trigger Sync Hub.
- Source approval must not trigger auto-sync.
- Source approval must not publish or share.
- Source approval must not expose raw private source content.

Source approval is a future manual review surface only. It is not an ingestion pipeline, not an audit runner, not Sync Hub, not a writeback path, not a publisher, not social sharing, and not a hidden channel for raw private context.

## 2. Purpose

The purpose of the source approval surface is to:

- give the operator a safe way to review suggested sources before they can be used;
- distinguish between `suggested`, `review_needed`, `approved`, `rejected`, `blocked`, and `unknown`;
- prevent private or raw sources from being used in training or audit without explicit approval;
- prevent source approval from becoming hidden ingestion, sync, or publishing;
- support future manual source approval;
- keep Personal AI Loop local-first and privacy-safe.

The surface should answer “what source needs manual operator review before later use?” using compact/redacted status, reasons, risk labels, linked readiness blockers or warnings, and manual next steps only.

## 3. Allowed source approval content

A later implementation may show only compact/redacted source approval content after a dedicated test-lock PR and implementation PR. Allowed content includes:

- compact source title;
- redacted source label;
- source type/category;
- short redacted reason;
- approval state;
- risk level;
- manual next step;
- linked readiness blocker/warning title;
- timestamp for local suggestion/review;
- operator-visible safe summary;
- local-only metadata.

Allowed content must remain bounded, local, operator-visible, and redacted. It must not become raw source evidence, hidden prompt payload, source ingestion, writeback, Sync Hub execution, publishing, or sharing.

## 4. Forbidden source approval content

Source approval must not show, store, embed, serialize, pass through, export, or expose:

- raw source content;
- full private corpus;
- full memory dump;
- full chat history;
- raw retrieval index;
- raw approved examples;
- raw consent metadata;
- secrets, tokens, or API keys;
- private source URLs unless explicitly redacted or approved;
- unredacted email addresses;
- hidden prompt payload with private source data;
- raw audit payload;
- unredacted recommendation evidence.

These prohibitions apply to visible text, DOM attributes, logs, debug output, errors, fallback labels, cached data, future compact packs, prompts, report/export fields, filenames, and metadata.

## 5. Forbidden source approval behavior

Source approval must not:

- approve sources automatically;
- import sources automatically;
- run audit automatically;
- write `localStorage` in the review phase;
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
- start ingestion/import without explicit user action.

Missing source approval, stale suggestions, blockers, warnings, or operator interest must never be treated as permission to approve, import, run audit, sync, publish, share, write, or send events.

## 6. Source approval states

### A. `suggested`

`suggested` means:

- the source is suggested but not approved;
- the source can only be shown compact/redacted;
- the source cannot be used as an approved source.

### B. `review_needed`

`review_needed` means:

- the source needs manual operator review;
- the surface shows a compact reason and manual next step.

### C. `approved`

`approved` means:

- the source is explicitly approved by the operator;
- the UI remains compact/redacted;
- an approved source can only be used by a later implementation after gates are test-locked.

### D. `rejected`

`rejected` means:

- the source is rejected;
- the source must not be used in audit or training.

### E. `blocked`

`blocked` means:

- the source lacks required consent, material, or visibility;
- the source cannot be approved until the blocker is resolved.

### F. `unknown`

`unknown` means:

- source state is missing or invalid;
- the surface must fail closed;
- manual review is required.

## 7. Fail-closed source approval UX

When source state is missing or invalid:

- the surface shows `unknown` or `blocked`;
- the surface shows a manual next step;
- the surface does not approve the source;
- the surface does not import the source;
- the surface does not run audit;
- the surface does not write data;
- the surface does not trigger sync;
- the surface does not show raw source payload.

Fail-closed output must remain compact/redacted and must not repair, infer, or upgrade approval state automatically.

## 8. Relationship to Training Dashboard

Training Dashboard is the natural future operator surface for source approval because it already represents the operator-facing training/material review area. A later source approval view may be shown there only after a dedicated test-lock PR.

Training Dashboard must not:

- auto-approve sources;
- auto-import sources;
- auto-run audit when source approval is missing.

Any future Training Dashboard source approval implementation must remain explicit-action only, compact/redacted, local-first, and covered by behavior tests before runtime activation.

## 9. Relationship to audit

Audit may point to missing or unapproved sources as a blocker or warning. Audit must not:

- approve sources automatically;
- import raw source content;
- write source approval state.

Audit run remains **explicit-action only**. Source approval state is not an audit side effect, and audit warnings are not permission to ingest, approve, write, sync, publish, or share source data.

## 10. Relationship to Meta Insights

Meta Insights may show compact count/status for source approval and may point the operator to manual review. Meta Insights must not:

- show raw source content;
- auto-approve sources;
- trigger ingestion, sync, or publishing.

Meta Insights can summarize only bounded source approval status, such as counts by state, top safe blocker/warning titles, and a manual next step.

## 11. Relationship to Chat readiness

Chat may show a compact source approval blocker/status. Chat must not:

- show raw source content;
- approve sources;
- import sources;
- inject source content into a prompt.

Chat readiness may only explain that personal context is blocked, partially ready, unknown, or ready based on compact/redacted local status. It must not become a prompt-enrichment channel for source payloads.

## 12. Relationship to export/report

Export/report may show compact source approval status/counts and may point to manual review. Report/export must not:

- include raw source content;
- include private source URLs;
- auto-export source payload.

Any future report content must stay compact/redacted, local-only, explicit-action only, and bounded to safe counts, labels, state, linked blocker/warning titles, and manual next steps.

## 13. Relationship to Sync Hub

Source approval surface is not Sync Hub. Source approval must not trigger Sync Hub.

Sync Hub execution remains **NO-GO**. `sync.html` remains outside this workstream. Auto-sync remains **permanently forbidden**.

Source approval review does not weaken existing Sync Hub gates, does not create a manual sync path, and does not create any source event path that can be consumed by Sync Hub.

## 14. Relationship to AHAavisa / Groups

Source approval must not:

- publish AHAavisa;
- post or share in Groups;
- generate social sharing events.

Publishing or sharing requires a separate documentation review and test-lock before any implementation. Source approval is not a publishing surface and not a social sharing surface.

## 15. Required gates before implementation

Before any later implementation PR, all of the following gates are required:

- docs review merged;
- test-lock PR merged;
- read-only boundary tests green;
- privacy/operator visibility tests green;
- next activation surface tests green;
- operator recommendations tests green;
- Chat readiness tests green;
- Meta Insights recommendation tests green;
- export/report tests green;
- no automatic source approval;
- no raw source payload;
- no source ingestion;
- no audit auto-run;
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

## 16. Future PR sequence

Recommended safe sequence:

1. `test: lock Personal AI Loop source approval surface`
2. `feat: add Personal AI Loop source approval summary`
3. `test: lock Personal AI Loop source approval behavior`
4. `docs: review Personal AI Loop manual audit action surface`
5. `test: lock Personal AI Loop manual audit action surface`

## 17. Next recommended PR

```text
test: lock Personal AI Loop source approval surface
```
