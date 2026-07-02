# AHA Conversation Insight Snapshot V1

## Status

**AHA Conversation Insight Snapshot V1** is now implemented as a local helper/runtime builder. UI is **not started** in this PR.

Snapshot V1 defines a local, read-only understanding layer for what AHA can safely summarize from one current conversation or one current analysis. It does not change AHA Home, AHA Sync Overview, History Go, EchoNet, source storage, exports, approval surfaces, backend contracts, or tests.

## Purpose

AHA Conversation Insight Snapshot V1 is a local, read-only summary of what AHA sees in a conversation or analysis right now.

It answers product questions such as:

- What is this conversation about?
- Which concepts appear?
- Which open questions remain?
- Which perspectives are present?
- Which tensions or unclear points exist?
- Which conversation links could later become useful?
- What can AHA carefully suggest as a next understanding step?

Snapshot V1 is **not**:

- sync
- EchoNet
- an approval surface
- project management
- a raw conversation log
- an export format
- a backend model
- permanent memory

## V1 output contract

The V1 contract is implemented by `js/ahaConversationInsightSnapshot.js` as a plain browser global helper. It provides the local read-only/no-sync builder only; no UI rendering, persistence, backend API, approval action, or EchoNet behavior is implemented here.

```js
{
  version: "aha_conversation_insight_snapshot_v1",
  localOnly: true,
  readOnly: true,
  noSync: true,
  sourceScope: "current_conversation_or_analysis",
  summary: {
    headline: "",
    shortDescription: ""
  },
  signals: {
    concepts: [],
    openQuestions: [],
    perspectives: [],
    tensions: [],
    conversationLinks: []
  },
  safety: {
    rawUserTextIncluded: false,
    privateUrlsIncluded: false,
    userIdentifiersIncluded: false,
    approvalActionAvailable: false,
    syncAvailable: false
  },
  quality: {
    sourceBound: null,
    topicConsistent: null,
    staleDataGuarded: null
  },
  nextUnderstandingSteps: []
}
```


## Runtime builder status

`js/ahaConversationInsightSnapshot.js` implements the Snapshot V1 builder as `window.AHAConversationInsightSnapshot`. The builder is read-only, local-only, and no-sync. It accepts explicit input and extracts only structured/safe fields such as summary labels, concepts, open questions, perspectives, tensions, conversation links, next understanding steps, and safe quality booleans/status values.

The builder does not read from or write to browser storage, does not call a backend, does not use network requests, does not add approval actions, does not activate EchoNet, and does not create permanent memory. It sanitizes output so snapshots do not return raw user text, full transcripts, private URLs, private metadata, raw payloads, raw source events, user IDs, or email addresses.

Snapshot V1 UI is not started. This helper only makes the contract available locally for later safe use.

## Field explanations

### `version`

Fixed contract identifier: `aha_conversation_insight_snapshot_v1`.

### `localOnly`

Must be `true`. Snapshot V1 is only a local understanding summary and must not imply sharing, publishing, backend storage, cross-user state, or EchoNet activation.

### `readOnly`

Must be `true`. Snapshot V1 must not mutate source events, analysis state, local memory, source approval state, sync candidates, or UI state.

### `noSync`

Must be `true`. Snapshot V1 must not run sync, prepare a sync action, expose a sync button, or create a hidden sync path.

### `sourceScope`

Must describe the source boundary. For V1 the boundary is `current_conversation_or_analysis`, meaning the snapshot is about the current conversation or the current analysis only.

### `summary.headline`

A short, safe headline for what the conversation or analysis is about. It should be paraphrased and should not be a raw user quote dump.

### `summary.shortDescription`

A short paraphrase of the conversation or analysis. It should summarize meaning without copying raw conversation text, private URLs, metadata, or identifiers.

### `signals.concepts`

Concepts AHA believes are relevant in the current conversation or analysis.

### `signals.openQuestions`

Questions raised by the conversation or analysis that remain unresolved or worth clarifying.

### `signals.perspectives`

Different angles, interpretation frames, positions, or viewpoints that appear in the current conversation or analysis.

### `signals.tensions`

Contradictions, unclear points, ambiguity, disagreement, tradeoffs, or friction in the current conversation or analysis.

### `signals.conversationLinks`

Safe links to other conversations, themes, concepts, or later comparison surfaces. In V1 these are only local understanding hints. They are not EchoNet sync, cross-user graph edges, publishing, shared memory, or backend relationships.

### `safety.rawUserTextIncluded`

Must be `false`. Snapshot V1 must not expose raw user messages, raw transcripts, raw source text, raw article text, raw notes, or raw payloads as a new data model.

### `safety.privateUrlsIncluded`

Must be `false`. Snapshot V1 must not include private URLs, raw imported URLs, private link metadata, or URL article bodies.

### `safety.userIdentifiersIncluded`

Must be `false`. Snapshot V1 must not include user IDs, email addresses, account identifiers, private profile identifiers, or equivalent direct identifiers.

### `safety.approvalActionAvailable`

Must be `false`. Snapshot V1 has no approve/reject action, no confirmation gate, no new approval model, and no source approval workflow of its own.

### `safety.syncAvailable`

Must be `false`. Snapshot V1 must not expose, trigger, queue, or imply sync.

### `nextUnderstandingSteps`

Careful suggestions for what the user may investigate, compare, clarify, or ask next. These are understanding prompts only, not automatic recommendations, project tasks, sync actions, approval actions, or publishing actions.

## Safety rules

Conversation Insight Snapshot V1 must:

- be read-only
- be local-only
- run no sync
- write nothing to `localStorage`
- send no data to a backend
- show no raw user data
- include no private URLs
- include no `userId`, email, or account identifier
- use no approval actions
- publish or share nothing
- activate no EchoNet runtime
- create no backend model
- create no permanent memory
- create no raw transcript browser
- create no project dashboard
- introduce no project-management fields such as `phase`, `priority`, `health`, `nextPr`, `repoStatus`, or equivalent product-model fields

## Relationship to AHA Sync Overview V1

AHA Sync Overview V1 shows patterns in local source events.
AHA Conversation Insight Snapshot V1 describes what AHA understands in one conversation or analysis.

The difference is:

- Sync Overview is status and coverage.
- Conversation Snapshot is understanding.
- Sync Overview aggregates local source-event coverage and safety status.
- Conversation Snapshot summarizes concepts, questions, perspectives, tensions, links, and next understanding steps for the current source scope.
- Neither runs sync.
- Neither activates EchoNet.
- Neither is project management.

AHA Sync Overview V1 remains frozen. Snapshot V1 is the next planning track after that freeze, but it must not modify the Sync Overview contract or UI.

## Relationship to quality gates

Later runtime, if implemented, must follow existing AHA quality gates and fail closed when the snapshot cannot be safely bound to the current source.

The relevant gates are:

- `sourceBinding`: snapshot content must be bound to the current conversation or analysis source scope.
- `topicConsistency`: snapshot content must remain about the current source topic and must not drift into stale or unrelated material.
- Geopolitics consistency, when relevant: snapshots for geopolitics material must preserve required topic terms and fail closed on stale or forbidden-term drift.
- Stale-data guards: snapshots must not reuse old AHA SER, afterwork, canonical analysis, or chamber output as if it belonged to the current source.
- Analysis run isolation: a snapshot must not mix fields from another analysis run, another source text hash, or another conversation.

If a future runtime cannot verify source binding or topic consistency, it should not produce a normal snapshot. It should fail closed with a safe local status instead of presenting stale or unbound understanding as valid.

## Not in V1

Snapshot V1 does not include:

- multi-user sync
- EchoNet graph
- shared memory
- approval workflow
- approve/reject buttons
- public publishing
- backend storage
- raw transcript browser
- project dashboard
- automatic recommendations
- sync button
- confirmation gate
- `js/ahaSyncConfirmationGate.js`
- new approval model

## Possible later V2

A possible later V2 may be described only as:

```text
user-reviewed insight preparation
```

V2 is not started. Approval actions do not exist here. Sync does not exist here. EchoNet is not activated here.
