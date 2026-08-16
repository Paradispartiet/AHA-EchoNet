#!/usr/bin/env bash
set -euo pipefail

for name in AHA_STAGING_DATABASE_CA_CERT RUNNER_TEMP GITHUB_ENV; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required PostgreSQL CA setting: ${name}" >&2
    exit 1
  fi
done

ca_file="$RUNNER_TEMP/aha-supabase-db-ca.crt"
printf '%s\n' "$AHA_STAGING_DATABASE_CA_CERT" > "$ca_file"
chmod 600 "$ca_file"

if ! openssl x509 -in "$ca_file" -noout >/dev/null 2>&1; then
  rm -f "$ca_file"
  echo "AHA_STAGING_DATABASE_CA_CERT is not a valid X.509 certificate." >&2
  exit 1
fi

printf 'AHA_POSTGRES_SSL_ROOT_CERT=%s\n' "$ca_file" >> "$GITHUB_ENV"
printf 'NODE_EXTRA_CA_CERTS=%s\n' "$ca_file" >> "$GITHUB_ENV"

echo "AHA PostgreSQL staging CA: READY"
