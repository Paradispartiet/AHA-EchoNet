# AHA Local Demo Seed V1

This folder contains synthetic local-only example data for the AHA product demo.

The seed is loaded only when the user explicitly presses **Legg inn eksempeldata** on `demo-seed.html`.

Contract:

- no automatic loading
- no backend, Sync Hub or EchoNet actions
- no History Go data or write-back
- no tokens, OAuth/PKCE data, secrets or account identifiers
- every seeded object is owned by `aha_local_demo_seed_v1`
- applying the seed is idempotent
- existing user objects are preserved
- removal deletes only objects owned by this seed

The seed exists for local product testing and demonstration. It is not canonical user knowledge.
