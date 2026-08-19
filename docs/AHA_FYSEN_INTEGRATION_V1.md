# AHA × Fysen integration v1

Status: implemented contract and UI boundary; production activation remains explicit.

## Ownership boundary

- AHA owns identity and analysis.
- Fysen owns the user's explicit `Min mat` collection.
- Fysen search history and Demand Loop remain anonymous and are never attached to an AHA subject.
- Restaurant Claim / Fysen Pro authorization is a separate security domain and cannot be granted by an AHA consumer session.

## Delegated login

`authorize-fysen.html` is the only AHA browser authorization surface. It requires an authenticated AHA Supabase session and an explicit `Koble til Fysen` action.

The browser sends the AHA access token only to the fixed AHA production API. The API returns a short-lived HMAC-signed authorization code bound to:

- the verified AHA `sub` and provider;
- `clientId = fysen`;
- an exact allowlisted Fysen redirect URI;
- PKCE S256 challenge;
- scopes `fysen:min_mat` and `fysen:analysis_handoff`;
- policy `aha_fysen_connection_v1`;
- a short expiry and random authorization ID.

Fysen exchanges the code server-to-server with the PKCE verifier. The AHA Supabase session/access token is never returned to Fysen. Replay protection for creating a Fysen consumer session is enforced by Fysen's unique authorization ID boundary.

Production activation requires:

- `AHA_FYSEN_INTEGRATION_ENABLED=true`
- `AHA_FYSEN_AUTHORIZATION_SECRET` (minimum 32 characters)
- `AHA_FYSEN_REDIRECT_URIS` with exact HTTPS callback URI(s)

The integration is fail-closed when not configured.

## Min mat analysis handoff

The cross-product payload is a separate schema: `schemas/fysen_food_collection_v1.schema.json`. It is deliberately not `aha_import_payload_v1`, which remains History Go-specific.

The handoff contains at most 50 explicitly saved food items and states:

- `scope = private_user`
- `includesSearchHistory = false`
- `publicSharing = false`
- `modelTrainingAllowed = false`

`fysen.html` redeems a short-lived one-time Fysen capability, removes it from the URL fragment, validates the payload locally and renders an exact preview. The user must then press `Analyser i AHA`.

That action only writes an `aha_pending_chat_prompt_v1` entry and opens `chat.html`. Existing AHA chat behavior guarantees a pending prompt is prefilled but not automatically sent or ingested. The user still owns the final send action.

## Non-goals

v1 does not:

- sync Fysen search history into AHA;
- automatically infer or persist food preferences in AHA memory;
- give Fysen access to AHA conversations, History Go data, or other AHA modules;
- connect AHA consumer identity to Restaurant Claim or Fysen Pro;
- activate background or login-triggered sync.
