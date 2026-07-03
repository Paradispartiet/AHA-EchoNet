# AHA Local Insight Home V1

## Status

AHA Local Insight Home V1 builder is implemented as a local, read-only, no-sync runtime helper. UI is not started.

AHA Local Insight Home V1 is a small, local, read-only start surface that will later combine the three frozen AHA V1 layers:

- AHA Sync Overview V1
- AHA Conversation Insight Snapshot V1
- AHA Quality Status Surface V1

It gives the user one local place to see:

- what AHA has local overview over
- what AHA understands now
- how safe or reliable that understanding is
- what the next understanding steps are

It does not provide actions.

## V1 contract

The runtime helper `window.AHALocalInsightHome` returns this compact V1 contract and only composes safe outputs from frozen V1 layers.

```js
{
  version: "aha_local_insight_home_v1",
  localOnly: true,
  readOnly: true,
  noSync: true,
  sourceScope: "current_conversation_or_analysis",
  sections: {
    qualityStatus: {
      enabled: true,
      source: "aha_quality_status_surface_v1"
    },
    conversationSnapshot: {
      enabled: true,
      source: "aha_conversation_insight_snapshot_v1"
    },
    syncOverview: {
      enabled: true,
      source: "aha_sync_overview_v1"
    }
  },
  display: {
    compact: true,
    actionsAvailable: false,
    approvalAvailable: false,
    syncAvailable: false,
    echoNetAvailable: false
  },
  safety: {
    rawUserTextIncluded: false,
    privateUrlsIncluded: false,
    sourceExcerptsIncluded: false,
    userIdentifiersIncluded: false,
    approvalActionAvailable: false,
    syncAvailable: false,
    echoNetAvailable: false
  }
}
```

## Planned sections

### 1. Kvalitetsstatus

Source: AHA Quality Status Surface V1.

This section must be shown first because quality controls trust. It will show whether the current understanding is `ok`, `warning`, `blocked`, or `unknown` using the existing Quality Status Surface V1 contract. It does not create a new score or a new analysis model.

### 2. AHA ser nå

Source: AHA Conversation Insight Snapshot V1.

This section will show the existing snapshot summary, structured signals, and `nextUnderstandingSteps`. The steps are understanding prompts only, not tasks, approval controls, publishing controls, or sync controls.

### 3. Lokal oversikt

Source: AHA Sync Overview V1.

This section will show local coverage, patterns, and counts from the existing Sync Overview V1 layer. It must not show sync readiness as an action invitation, and it must not include actions.

## Safety contract

AHA Local Insight Home V1 must not:

- read raw transcript
- show raw transcript
- show raw user text
- show source excerpts
- show private URLs
- show userId or email
- show raw source events
- show raw invalid fields
- run sync
- start EchoNet
- send data to backend
- publish or share
- approve or reject
- save to memory
- act as a project dashboard
- show PR, repo, sprint, or roadmap status

The surface remains local-only, read-only, no-sync, compact, and safe-summary-only. It must not read raw browser storage data, write to browser storage, call network APIs, or introduce a new confirmation gate.

## Not in V1

The following are not part of AHA Local Insight Home V1:

- backend storage
- multi-user sync
- EchoNet graph
- approval workflow
- approve/reject
- publish/share
- raw transcript browser
- source excerpt viewer
- source review UI
- project dashboard
- automatic task/action engine
- PR/repo planning
- new scoring model
- new analysis engine

## Runtime status

`js/ahaLocalInsightHome.js` implements `window.AHALocalInsightHome` with `buildLocalInsightHome`, `normalizeLocalInsightHomeInput`, `buildHomeSections`, `buildHomeDisplay`, and `buildHomeSafety`. The builder accepts only explicit input objects, uses finished V1 objects when provided, and may call existing safe builders for Quality Status Surface V1 and Conversation Insight Snapshot V1 when explicit safe input is provided. It does not read browser storage, write browser storage, call network APIs, create backend state, run sync, activate EchoNet, or add approval actions.

The builder returns only compact safe fields from AHA Quality Status Surface V1, AHA Conversation Insight Snapshot V1, and AHA Sync Overview V1. It does not return raw user text, transcript, source excerpts, private URLs, metadata, raw invalid fields, raw source events, userId, email, approval controls, sync controls, EchoNet controls, or project-management fields. AHA Sync Overview V1 is unchanged. Conversation Insight Snapshot V1 is unchanged. Quality Status Surface V1 is unchanged.

## Relationship to existing V1 layers

AHA Local Insight Home V1 combines existing V1 layers. It does not own new analysis. It does not change the contracts for AHA Sync Overview V1, AHA Conversation Insight Snapshot V1, or AHA Quality Status Surface V1.

AHA Sync Overview V1 remains the local overview for coverage, patterns, and counts. AHA Conversation Insight Snapshot V1 remains the local understanding layer for the current conversation or analysis. AHA Quality Status Surface V1 remains the local quality layer that shows how trustworthy the understanding is.

## Relationship to later V2

A possible later V2 can introduce:

```text
user-reviewed insight preparation
```

V2 is not started. Approval actions do not exist. Sync does not exist. EchoNet is not activated. Any later V2 must remain separate from this V1 documentation contract until explicitly defined.
