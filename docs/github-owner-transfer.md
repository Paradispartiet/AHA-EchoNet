# AHA repository ownership transfer — preparation only

Source: `Paradispartiet/AHA-EchoNet`. Destination: `AHA-EchoNet/AHA-EchoNet`.
Keep the repository name unchanged. The empty `AHA-EchoNet/AHA` is unrelated.

This candidate is not proof of readiness and must remain draft until external
configuration is verified. No ownership transfer or production settings were changed.

## Before merge and transfer

- Add exactly `https://aha-echonet.github.io/AHA-EchoNet/auth-callback.html`
  to the existing AHA Supabase project Auth Redirect URLs, preserving existing entries.
  Do not change the project, user database or keys. Verify the setting without exposing secrets.
- Preserve the working Vercel origin `https://aha-echo-net.vercel.app`.
  The connected Vercel account did not return the project during preflight;
  confirm the actual project and Git integration with the destination owner.
- In each live Render service that serves AHA, inspect the current origin list and
  add exactly `https://aha-echonet.github.io` to the applicable variable:
  `ALLOWED_ORIGINS`, `AHA_ENGINE_ALLOWED_ORIGINS`, or `AHA_ALLOWED_ORIGINS`.
  Preserve all existing values. Blueprint files alone do not verify live settings.
- If Spotify is configured, register
  `https://aha-echonet.github.io/AHA-EchoNet/music.html` in its developer dashboard.
- Verify ChatGPT/Codex GitHub installation access for the destination account.
  Do not assume source-owner installation permissions follow the repository.
- Review deployment identity/OIDC policies and references to the old repository.
  Existing source-owner subject restrictions may reject the new owner.

## Transfer and verification

Only transfer once the above gates are evidenced and the owner change is confirmed.
Repository secrets, issues and PRs follow the transfer, but Pages URLs do not redirect.
After transfer, verify Pages settings and publish the same reviewed revision.
Check navigation, email/Google PKCE completion, backend CORS and destination Git access.
Check Vercel/Render Git linkage before attempting any deployment.

The browser origin changes. Existing localStorage, IndexedDB and PKCE state do not
move to the new origin: export local AHA data using the app's existing backup flow
while the old site is still available, retain the backup, and verify supported import
on the new site. Do not clear old-site data or promise automatic migration.

If a gate fails, keep the repository at its current owner. If failure occurs after
transfer, repair the integration or arrange an explicitly confirmed reverse transfer;
no automatic rollback has been implemented.
