# AHA Sync Hub planned/no-op contract

Sync Hub is currently a planned integration surface, not an active sync engine.

## Current status

Sync Hub may inspect local modules and show sync candidates, coverage gaps, dry-run summaries and review states.

It must not perform automatic sync.

## Boundary

Sync Hub is allowed to:

- read local AHA metadata
- count local records
- show candidate summaries
- show dry-run results
- show manual review queues
- document future channel concepts
- show which modules have sync-capable functions

Sync Hub is not allowed to:

- auto-call module sync functions
- write to backend
- write to Supabase
- call AHARepository
- call fetch for remote sync
- activate EchoNet
- share data externally
- send data between users
- write to History Go storage
- write to History Go repo data
- modify canonical AHA insight engines
- modify local module data outside explicit future user-confirmed flows

## EchoNet

EchoNet is a later collective layer.

Sync Hub must not enable EchoNet.

Any future EchoNet activation requires:

1. explicit product contract
2. backend contract
3. privacy and consent model
4. user-visible sharing controls
5. tests for no accidental sharing
6. opt-in only behavior

## History Go

History Go is a separate arena.

Sync Hub may later inspect History Go import/read boundaries, but must not write to:

- `visited_places`
- `hg_learning_log_v1`
- `knowledge_universe`
- `trivia_universe`
- `aha_import_payload_v1`
- History Go repo data
- History Go runtime objects

## Current rule

Sync Hub is planned/no-op.

Read, inspect and dry-run are allowed.
Automatic sync, backend writes, EchoNet and History Go write-back are not allowed.
