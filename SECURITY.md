# Security policy

## Sensitive information

Do not commit credentials, API keys, access tokens, private keys, database passwords, production connection strings, signing secrets, or other reusable secrets to this repository.

Secrets must be supplied through the relevant deployment platform or GitHub secret/environment mechanisms and must not be copied into issues, pull requests, build logs, documentation, screenshots, fixtures, or example files.

If a secret is suspected to have been exposed, treat it as compromised: revoke or rotate it first, then remove the exposed value from active files and, where appropriate, clean repository history. History rewriting is not a substitute for credential rotation.

## Responsible disclosure

Do not report exploitable vulnerabilities or suspected credentials in a public issue. Use GitHub private vulnerability reporting/security advisories when available, or contact the repository owner through an established private channel.

## Production information

Detailed production topology, privileged identities, recovery procedures, internal endpoints, and operational credentials are confidential unless they are deliberately documented for public release.
