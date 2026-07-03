# AHA Quality Status Surface V1

## Status

```text
AHA Quality Status Surface V1 builder: implemented
AHA Quality Status Surface V1 preview: implemented
```

AHA Quality Status Surface V1 is implemented as a local, read-only, no-sync builder in `js/ahaQualityStatusSurface.js`. It exposes `window.AHAQualityStatusSurface` and builds a safe quality-status contract from explicit input only. The Quality Status Surface V1 preview is implemented in the existing AHA Chat `AHA ser nå` UI as a compact local-only/read-only/no-sync status surface.

The builder is not a new analysis layer. It does not build Sync Overview, Conversation Insight Snapshot, EchoNet, approval, backend, or project management. It only summarizes existing safe quality/status signals for the current conversation or current analysis.

## Runtime boundaries

The builder is:

- read-only
- local-only
- no-sync
- scoped to `current_conversation_or_analysis`
- driven by explicit input objects
- limited to safe quality/status fields such as `sourceBinding`, `topicConsistency`, stale-data guard status, analysis isolation status, and existing safe snapshot/export quality booleans

The builder does not read from or write to `localStorage`, does not call a backend, does not use network requests, and does not send data anywhere. It has no approval actions, no EchoNet activation, and no backend contract.

AHA Sync Overview V1 is unchanged. AHA Conversation Insight Snapshot V1 is unchanged.

## V1 output contract

```js
{
  version: "aha_quality_status_surface_v1",
  localOnly: true,
  readOnly: true,
  noSync: true,
  sourceScope: "current_conversation_or_analysis",
  status: "unknown" | "ok" | "warning" | "blocked",
  checks: {
    sourceBinding: {
      status: "unknown" | "passed" | "warning" | "failed",
      sourceBound: null
    },
    topicConsistency: {
      status: "unknown" | "passed" | "warning" | "failed",
      topicConsistent: null
    },
    staleData: {
      status: "unknown" | "passed" | "warning" | "failed",
      staleDataGuarded: null
    },
    analysisIsolation: {
      status: "unknown" | "passed" | "warning" | "failed",
      isolated: null
    }
  },
  safeSummary: {
    headline: "",
    lines: []
  },
  safety: {
    rawUserTextIncluded: false,
    privateUrlsIncluded: false,
    userIdentifiersIncluded: false,
    approvalActionAvailable: false,
    syncAvailable: false,
    echoNetAvailable: false
  }
}
```

## Safety model

The builder uses only safe quality/status fields. It does not return raw user text, full transcripts, source excerpts, URLs, private metadata, raw payloads, raw invalid fields, raw source events, user IDs, or email addresses.

If explicit input contains raw or private fields, the builder ignores them and does not copy them into `checks`, `safeSummary`, or `safety`.

## Status derivation

Overall status is conservative:

- failed `sourceBinding`, `topicConsistency`, stale-data guard, or analysis isolation blocks the surface
- warnings produce `warning`
- all unknown checks produce `unknown`
- partial unknown checks do not produce false `ok`
- all checks must pass before the surface returns `ok`

## Preview

The preview is a small read-only section next to the existing Conversation Insight Snapshot preview. It uses `window.AHAQualityStatusSurface?.buildQualityStatusSurface(input)` and passes only structured/safe quality fields: `quality`, `sourceBinding`, `topicConsistency`, stale-data guard fields, analysis isolation fields, `canonicalAnalysis`, `analysis`, and `snapshotQuality`.

The preview shows only the overall status, the four safe checks (Kildebinding, Temakonsistens, Stale-data guard, Analyse-isolering), up to four safe summary lines, and the safety copy: `Lokal, read-only status. Ingen sync. Ingen rå brukerdata.`

The preview does not show raw user text, full transcript, source excerpts, URL-er/private URL-er, raw invalid fields, metadata, raw payloads, raw source events, userId, or email. It has no approval actions, no approve/reject controls, no sync action, no EchoNet activation, and no backend. AHA Sync Overview V1 is unchanged, and the Conversation Insight Snapshot V1 contract is unchanged.

## Non-goals

Quality Status Surface V1 does not add:

- sync
- approval actions
- approve/reject controls
- EchoNet runtime
- backend storage
- project management fields
- changes to AHA Sync Overview V1
- changes to AHA Conversation Insight Snapshot V1
