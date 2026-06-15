# Personal AI Loop Audit: privacy and operator visibility review

Status: **reviewed**  
Scope: documentation only  
Decision date: 2026-06-14

This review defines the privacy, read-only, cache, and operator-visibility boundary for Personal AI Loop Audit before any further UI or agent integration is added. It does not change runtime behavior, activate synchronization, create a database write path, or authorize publication or social sharing.

## 1. Current decision

Personal AI Loop Audit is **local-first** and read-only against domain data.

- The audit may read only the approved material described in this document.
- The audit may cache only the last audit summary under `aha_personal_ai_loop_audit_v1`.
- The audit must not mutate corpus, training examples, memory, chat, Sync Hub state, or repository-backed data.
- The audit must not perform Supabase or other database writes.
- The audit must not trigger Sync Hub, manual sync, or auto-sync.
- The audit must not publish content or initiate social sharing.
- Auto-sync is permanently forbidden.
- Sync Hub execution remains **NO-GO**.

The cached audit result is an operational summary, not a domain record and not a new source of truth.

## 2. Approved material boundary

### Allowed material

The audit may use only:

- confirmed memory claims;
- important memory claims;
- approved corpus where `consent.useForKnowledge === true` or `consent.useForMemory === true`; and
- approved training examples.

The minimum-use principle applies: even approved material should be reduced to the counts, statuses, readiness signals, warnings, recommendations, and bounded sample-query metadata needed for the audit.

### Disallowed material

The audit must not use:

- draft or rejected corpus;
- corpus without knowledge or memory consent;
- draft or rejected training examples;
- unconfirmed memory claims unless they are explicitly categorized as important or confirmed;
- a raw `localStorage` dump;
- full chat history;
- secrets, tokens, passwords, API keys, or connection strings.

Finding disallowed or unconsented material must produce a privacy warning. It must not cause the material to be copied into the audit cache, shown as a raw payload, repaired automatically, synchronized, or published.

## 3. Operator visibility

### Information the operator should see

The operator-facing summary should expose only the information needed to understand readiness and take a manual next step:

- audit status;
- audit score;
- approved corpus count;
- approved training example count;
- confirmed/important memory claim count;
- indexed item count;
- sample-query status;
- recommendations;
- privacy warnings;
- stale or missing retrieval index warning;
- missing consent warning; and
- missing approved material warning.

Warnings must be understandable without exposing the underlying private body text. Counts and concise reasons are preferred over payloads.

### Information the operator should not see

The audit UI or compact status must not expose:

- full raw payloads;
- full corpus body by default;
- full memory raw dump;
- full chat history;
- credentials or secrets;
- hidden source events; or
- hidden sync results.

If later product work proposes drill-down views, that work requires a separate privacy design and test lock. This review does not approve raw-data expansion.

## 4. Training UI boundary

The Training UI is the only currently approved place to start an audit, and it may do so only after explicit user action.

- The audit may run only from an explicit user action such as the dedicated audit button.
- Rendering the Training UI must read the cached summary only.
- Rendering must not build or refresh a retrieval index.
- Rendering must not run the audit automatically.
- The audit action must not write domain data.
- The audit action must not perform a remote write.
- The audit action must not trigger Sync Hub.

The one allowed cache write is the last audit summary under `aha_personal_ai_loop_audit_v1`, after the explicit action. It does not authorize any other persistence.

## 5. Chat UI boundary

AHA Chat may show a compact status derived from the cached audit summary.

- Chat render may read `aha_personal_ai_loop_audit_v1`.
- Chat render must not run the audit automatically.
- Chat must not write audit data or domain data as part of audit status rendering.
- Chat must not trigger retrieval build, refresh, or persistence from the audit-status path.
- Chat must not include the full audit raw payload in a user-visible or model-visible prompt unless a later, separately reviewed design explicitly allows it.
- Chat must not trigger Sync Hub, sync, publication, or sharing from the audit-status path.

## 6. Meta Insights boundary

Meta Insights may receive only a compact, redacted `personalAiLoopPack`.

The pack may include:

- status;
- counts;
- recommendations; and
- readiness signals such as score, retrieval availability, or indexed item count.

The pack must not include:

- raw corpus text;
- raw memory dump;
- full chat history;
- credentials;
- secrets; or
- tokens.

The pack must be derived from the cached summary or another safe, read-only status. Building the pack must not run an audit, write audit/domain data, build or refresh an index, or trigger sync. Passing a compact pack to Meta Insights does not authorize automatic insight creation or persistence.

## 7. `localStorage` and cache boundary

The audit cache contract is deliberately narrow:

- Allowed key: `aha_personal_ai_loop_audit_v1`.
- Purpose: the last audit summary only.
- The key is not a source-of-truth domain store.
- Audit paths must not call `removeItem` or `clear`.
- Audit paths must not write other domain keys.
- Audit paths must not persist a retrieval index.
- Audit paths must not mutate chat history.
- Audit paths must not mutate Sync Hub audit or history state.

The cached value should contain only the bounded summary needed by Training, Chat, and the compact Meta Insights pack. A raw local-storage snapshot, raw domain objects, credentials, and complete content bodies are outside the cache contract.

## 8. Failure modes

All failure modes are fail-closed and operator-visible. Every failure must result in **no write**, **no auto-fix**, **no sync**, and **no publish**. Recommendations are manual guidance, not executable actions.

| Failure mode | Operator-visible status | Required behavior | Recommended manual next step |
| --- | --- | --- | --- |
| Missing audit API | `unavailable` / audit module missing | No write, no auto-fix, no sync, no publish | Reload the expected local module or ask a developer/operator to verify the audit script loading order. |
| Missing personal context API | `partial` / personal context unavailable | No write, no auto-fix, no sync, no publish | Verify that the Personal Context module is locally available, then rerun the audit explicitly. |
| Missing retrieval API | `partial` / retrieval unavailable | No write, no auto-fix, no sync, no publish | Verify that Personal Retrieval is locally available; do not build it from render or audit fallback. |
| Missing approved corpus | `empty` or `partial` / no approved corpus | No write, no auto-fix, no sync, no publish | Review corpus manually, approve appropriate items, and grant explicit knowledge or memory consent where intended. |
| Missing approved examples | `partial` / no approved examples | No write, no auto-fix, no sync, no publish | Review and approve suitable training examples manually. |
| Missing confirmed/important memory | `partial` / no eligible memory claims | No write, no auto-fix, no sync, no publish | Confirm or mark relevant claims as important through the existing explicit memory review flow. |
| Missing retrieval index | `partial` / index missing | No write, no auto-fix, no sync, no publish | Use the existing explicit Training control to build the index; the audit must not build it. |
| Stale retrieval index | `partial` / index refresh recommended | No write, no auto-fix, no sync, no publish | Use the existing explicit Training control to refresh the index, then rerun the audit manually. |
| Disallowed or unconsented material found | `blocked` or `privacy_warning` | No write, no auto-fix, no sync, no publish | Review the flagged category, remove it from retrieval eligibility, or add valid consent only through the proper manual domain flow. |
| Redaction/privacy warning | `privacy_warning` | No write, no auto-fix, no sync, no publish | Inspect the safe warning metadata, correct the source or redaction policy manually, and rerun explicitly. |
| Unknown status | `unknown` | No write, no auto-fix, no sync, no publish | Treat the audit as not ready; verify local APIs and cached-summary shape before another explicit run. |

No failure status authorizes fallback to raw data, a broad `localStorage` read, an index refresh, a domain mutation, a remote request, or Sync Hub execution.

## 9. Security and no-go list

Personal AI Loop Audit must not:

- call `supabase.from`;
- call `.insert`, `.upsert`, `.delete`, or `.update`;
- call `fetch`;
- call `XMLHttpRequest`;
- call `sendBeacon`;
- call `AHARepository.save`;
- call `AHARepository.load`;
- call `syncFromDatabase`;
- trigger `executeSync`, `runSync`, `performSync`, or `startSync`;
- trigger rollback;
- trigger source events;
- create insights automatically;
- publish;
- share; or
- run timers or intervals for auto-audit.

Equivalent aliases or indirect wrappers are also forbidden when they would create the same side effect. The rule applies to the audit module, audit render/status paths, compact pack construction, error handling, and fallback behavior.

## 10. Test coverage

Current audit behavior and the read-only boundary are covered by:

- `tests/aha-personal-ai-loop-audit.test.cjs`, which covers the end-to-end local audit flow, approved material, retrieval, sample query, privacy/consent, Training/Chat integration, and the compact Meta Insights pack.
- `tests/aha-personal-ai-loop-read-only-boundary.test.cjs`, which test-locks approved/consented inputs, domain immutability, no index auto-build/persist, the single allowed cache key, forbidden remote/write/sync/publish APIs, explicit Training execution, cached Chat status, compact redacted Meta Insights data, and unchanged Sync Hub boundaries.

This documentation review does not change those tests. The next PR should extend the test lock to the privacy and operator-visibility details documented here.

## 11. Required before next implementation

Before further Personal AI Loop UI or agent integration:

- this privacy/operator visibility review must exist and remain current;
- the read-only boundary must remain test-locked;
- the approved/consented material boundary must remain test-locked;
- `personalAiLoopPack` must remain compact and redacted;
- render paths must not run the audit automatically;
- there must be no domain writes;
- there must be no Sync Hub trigger;
- there must be no auto-sync; and
- the full `npm test` suite must be green.

Any future proposal that needs more data or new side effects requires a separate review, implementation PR, and test evidence. It must not be smuggled into a UI render, fallback path, compact pack, or cache migration.

## 12. Sync Hub and publication status

This review leaves the Sync Hub boundary unchanged:

- Sync Hub execution is **NO-GO**.
- No `sync.html` is created.
- Manual sync is not activated.
- Auto-sync is permanently forbidden.
- No Sync Hub audit/history write path is added.
- No Supabase/database write is added.
- No rollback, source event, automatic insight, Groups social sharing, or AHAavisa publication is added.

## 13. Next recommended PR

```text
test: lock Personal AI Loop audit privacy and operator visibility
```
