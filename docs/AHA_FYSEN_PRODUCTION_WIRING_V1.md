# AHA × Fysen production wiring v1

The Azure Container App template now keeps the Fysen integration enabled across the normal production deploy, bounded canonical-sync activation and rollback paths that reuse `infra/azure/production/app.bicep`.

## Production callback

The exact production redirect allowlist is:

`https://fysen-matsgran-8572s-projects.vercel.app/api/aha/callback`

The authorization lifetime remains 180 seconds.

## Secret boundary

No new manually provisioned GitHub or Azure secret is required. The production runtime already receives the protected Key Vault-backed `AHA_AUDIT_HASH_SALT`. Fysen authorization may use that protected runtime value as a root secret only when no dedicated `AHA_FYSEN_AUTHORIZATION_SECRET` is supplied.

The authorization service never signs codes directly with that root. It first derives a purpose-specific key with HMAC-SHA256 and the fixed context:

`aha-fysen-authorization-signing-key-v1`

Authorization codes are then HMAC-SHA256 signed with the derived key. This keeps the Fysen authorization cryptographic domain separate from audit hashing while preserving the existing production secret-management boundary.

A dedicated `AHA_FYSEN_AUTHORIZATION_SECRET` still takes precedence in environments that want a separate root.

## Fail-closed behavior

Outside the reviewed production template, the integration remains disabled unless `AHA_FYSEN_INTEGRATION_ENABLED=true`. Enabling still requires:

- a 32+ character protected root (`AHA_FYSEN_AUTHORIZATION_SECRET` or `AHA_AUDIT_HASH_SALT`);
- at least one exact redirect URI;
- a TTL between 60 and 600 seconds.

The Fysen production proof separately checks the live AHA exchange endpoint. It expects a syntactically valid but incorrectly signed code to fail with `409`, which proves the integration is enabled and the exact Fysen callback passed the allowlist before signature verification.
