# AHA Registry / Matrix consistency

`js/ahaModules.js` is the runtime registry for AHA modules.

`docs/AHA_MODULE_MATURITY_MATRIX.md` is the maturity and boundary audit for the same module set.

## Rules

- Every registry module ID must have exactly one matrix row.
- Every matrix module ID must have exactly one registry entry.
- Registry status must match matrix registry_status.
- Registry descriptions must be boundary-safe.
- `PREFERRED_ORDER` must include every registry module exactly once.
- Empty-state copy must not imply backend, sync, EchoNet, external publishing, model training, fine-tuning, invitations, login or History Go write-back unless an explicit contract exists.

## Intentional non-ready modules

- `meet` is a shell.
- `sync-hub` is planned/no-op.

## Forbidden registry implications

Registry descriptions and empty states must not imply:

- backend is active
- EchoNet is active
- Sync Hub is active sync
- external publishing
- social sharing
- invitations/calendar
- model training
- fine-tuning
- remote upload
- History Go write-back
- login/account identity

## Current rule

The registry may describe what a module is for, but it must not overpromise behavior beyond the documented boundary contracts.
