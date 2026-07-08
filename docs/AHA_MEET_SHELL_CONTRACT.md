# AHA Meet shell contract

AHA Meet is currently a shell, not an active social or scheduling module.

## Current status

AHA Meet is local-only and inactive beyond the shell page. It has no dedicated runtime, no backend, no sync, no EchoNet sharing, no calendar integration and no invitation system.

## Boundary

AHA Meet is for personal meeting memory and reflection:

- meeting notes
- personal follow-up
- people mentioned
- places mentioned
- themes and insights
- links to local AHA objects
- later reflection after a History Go route, place visit or group activity

AHA Meet is not currently:

- social coordination
- live meeting rooms
- chat
- shared calendar
- invitations
- RSVP
- external sharing
- EchoNet
- Sync Hub
- backend persistence
- History Go write-back

## Relation to History Go

History Go is the place-based arena.

History Go may later create or expose signals such as:

- visited place
- route completed
- group activity
- local event
- observation
- quiz/session
- people encountered
- place-based note

AHA Meet may later import or reference those signals as personal reflection material.

AHA Meet must not write back to History Go storage by default.

AHA Meet must not modify:

- `visited_places`
- `hg_learning_log_v1`
- `knowledge_universe`
- `trivia_universe`
- `aha_import_payload_v1`
- History Go repo data
- History Go runtime objects

## Relation to Groups

Groups are local AHA workspaces.

AHA Meet may later reference local groups, but must not turn groups into real shared collaboration.

## Relation to AHAavisa

AHA Meet may later become a source for local AHAavisa drafts, but must not publish externally.

## Future data model draft

A future local-only Meet object may look like:

```json
{
  "id": "meet_...",
  "title": "Møte ved St. Hanshaugen",
  "date": "2026-07-08",
  "source_app": "aha",
  "origin_app": "aha_meet",
  "local_only": true,
  "personal_reflection_only": true,
  "shared_external": false,
  "echonet_shared": false,
  "sync_enabled": false,
  "calendar_sync_enabled": false,
  "invitation_enabled": false,
  "historygo_writeback_enabled": false,
  "references": [
    {
      "source": "historygo_place",
      "refId": "st_hanshaugen",
      "title": "St. Hanshaugen"
    }
  ],
  "notes": [],
  "insight_refs": [],
  "meta": {
    "local_only": true,
    "personal_reflection_only": true,
    "shared_external": false,
    "echonet_shared": false,
    "sync_enabled": false,
    "historygo_writeback_enabled": false
  }
}
```

This is a draft only. Do not implement storage until explicitly requested.

## Activation requirements

Before Meet can become active, it needs:

1. local-only data model
2. reference validation against local AHA objects
3. History Go import/read boundary
4. no write-back tests
5. privacy report coverage
6. explicit no EchoNet/sync/backend tests
7. explicit user consent model for any future sharing
8. separate backend contract if collaboration is later introduced

## Current rule

Keep Meet as a shell.
Document the boundary.
Do not activate social behavior.
