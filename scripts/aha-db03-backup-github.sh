#!/usr/bin/env bash
# AHA DB-03: manual GitHub Actions only; never an automatic production export.
# No plaintext database dump, credentials or row contents are uploaded.
set -Eeuo pipefail
set +x
umask 077

ref="wshmybqyksrwkawqleiz"
fail() { printf 'AHA DB-03 encrypted backup declined: %s\n' "$1" >&2; exit 1; }

[[ "${GITHUB_ACTIONS:-}" == "true" ]] || fail 'Only GitHub-hosted manual workflow supported'
[[ "${GITHUB_REF:-}" == "refs/heads/main" ]] || fail 'Only main is permitted'
[[ "${AHA_DB03_BACKUP_ENABLED:-}" == "yes" ]] || fail 'Explicit owner enablement is missing'
[[ "${AHA_DB03_MANUAL_EXPORT_ACK:-}" == "yes" ]] || fail 'Manual owner export acknowledgement missing'
[[ -n "${AHA_DB03_DATABASE_URL:-}" ]] || fail 'Secret AHA_DB03_DATABASE_URL is not configured'
[[ -n "${AHA_DB03_AGE_RECIPIENT:-}" ]] || fail 'Public age recipient is not configured'
[[ -n "${RUNNER_TEMP:-}" ]] || fail 'Missing runner temporary location'

for command in docker age node sha256sum stat; do
  command -v "$command" >/dev/null 2>&1 || fail "Missing command: $command"
done

# Never log credentials or use a SQL endpoint from another Supabase project.
# Require Postgres 17 direct or session-pooler endpoint on 5432, not txn pooler.
node <<'JS' || fail 'Incorrect DB-03 connection target or age recipient'
const raw = process.env.AHA_DB03_DATABASE_URL || '';
const recipient = process.env.AHA_DB03_AGE_RECIPIENT || '';
const ref = 'wshmybqyksrwkawqleiz';
try {
  const uri = new URL(raw);
  const direct = uri.hostname === 'db.' + ref + '.supabase.co' && uri.username === 'postgres';
  const pooler = /^aws-[0-9]+-eu-west-1\.pooler\.supabase\.com$/.test(uri.hostname) &&
    uri.username === 'postgres.' + ref;
  const port = uri.port || '5432';
  const valid = ['postgres:', 'postgresql:'].includes(uri.protocol) &&
    (direct || pooler) && port === '5432' && uri.password &&
    uri.pathname === '/postgres' && !/[\s#]/.test(raw) && raw.split('@').length === 2 &&
    // libpq permits URI query options to override the authority and TLS settings.
    (uri.search === '' || uri.search === '?sslmode=require') &&
    /^age1[ac-hj-np-z02-9]{50,75}$/.test(recipient);
  if (!valid) process.exit(1);
} catch { process.exit(1); }
JS

# age recipient is public. The private decryption key stays OFF GitHub.
dir="$RUNNER_TEMP/aha-db03-encrypted"
mkdir -p "$dir"
archive="$dir/AHA-DB03-$(date -u +%Y%m%dT%H%M%SZ).dump.age"
partial="$archive.partial"
errfile="$RUNNER_TEMP/aha-db03-dump.stderr"
cleanup() { rm -f "$partial" "$errfile"; }
trap cleanup EXIT
[[ ! -e "$archive" ]] || fail 'Output already exists; refusing overwrite'

export PGDATABASE="$AHA_DB03_DATABASE_URL"
export PGSSLMODE=require
export PGCONNECT_TIMEOUT=15

# Docker receives PGDATABASE via inherited environment, not as an argv value.
# PostgreSQL custom-format bytes are streamed directly into age. No plaintext file.
# All database-specific stderr stays inside the ephemeral runner and is deleted.
if ! docker run --rm --network host \
    --env PGDATABASE --env PGSSLMODE --env PGCONNECT_TIMEOUT \
    postgres:17 pg_dump --format=custom 2>"$errfile" \
    | age -r "$AHA_DB03_AGE_RECIPIENT" -o "$partial" 2>>"$errfile"; then
  fail 'Encrypted dump command failed. Sensitive diagnostic output suppressed.'
fi
[[ -s "$partial" ]] || fail 'Encrypted artifact is empty'
if ! head -c 32 "$partial" | grep -aq '^age-encryption.org/v1'; then
  fail 'Encrypted artifact header invalid'
fi
mv "$partial" "$archive"

# Status only. This is NOT proof that archive can be restored.
export AHA_ARCHIVE_BYTES
AHA_ARCHIVE_BYTES="$(stat -c '%s' "$archive")"
export AHA_ARCHIVE_SHA256
AHA_ARCHIVE_SHA256="$(sha256sum "$archive" | awk '{print $1}')"
node <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const out = {
  project_ref: 'wshmybqyksrwkawqleiz',
  archive_format: 'age-encrypted PostgreSQL-17 custom-format logical dump',
  encrypted_bytes: Number(process.env.AHA_ARCHIVE_BYTES),
  encrypted_sha256: process.env.AHA_ARCHIVE_SHA256,
  created_at: new Date().toISOString(),
  restore_tested: false,
  includes_global_roles: 'UNVERIFIED: pg_dump does not include cluster globals',
  includes_storage_object_files: 'UNVERIFIED: binary files need separate backup',
  includes_auth_data: 'UNVERIFIED: encrypted archive not restored yet',
  approval: 'NOT_APPROVED_FOR_WRITES'
};
fs.writeFileSync(
  path.join(process.env.RUNNER_TEMP,'aha-db03-encrypted','AHA-DB03.manifest.json'),
  JSON.stringify(out, null, 2) + '\n',
  {mode:0o600,flag:'wx'}
);
JS
unset PGDATABASE AHA_DB03_DATABASE_URL
printf 'Only age-encrypted backup and status manifest are staged. Restore NOT verified.\n'
