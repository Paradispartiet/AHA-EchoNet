# AHA Profile boundary

AHA Profile is a local status and audit surface for the user's AHA.

It is not a public profile, social identity, EchoNet identity, authentication system, backend account model or sync engine.

## Allowed

AHA Profile may read local AHA data and show:

- local counts
- recent activity
- local privacy status
- local History Go import status
- local AHA meta-profile summaries
- local afterwork archive preview
- module status links

AHA Profile may write only one local helper key:

- `aha_pending_chat_prompt_v1`

This key is used only after explicit user action to open Chat with a prepared prompt.

## Not allowed

AHA Profile must not:

- publish a public profile
- create social identity
- activate EchoNet
- sync profile data
- call backend
- call AHARepository
- call fetch
- call AHAIngest
- write source events
- write to the insight chamber
- write to History Go keys
- write to module data keys
- modify privacy settings
- modify Training Corpus

## History Go

AHA Profile may read local History Go status/import keys as local status only.

It must not write to:

- `visited_places`
- `hg_learning_log_v1`
- `knowledge_universe`
- `trivia_universe`
- `people_collected`
- `historygo_progress`
- `aha_import_payload_v1`

## Current rule

Profile is local-only, read-only and status-surface only.
