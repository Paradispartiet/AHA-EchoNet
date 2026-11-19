#!/usr/bin/env bash
# AHA DB-03 encrypted logical backup, to run on a trusted PC/Mac only.
# Never run in GitHub Actions; never consider this a validated restore.
set -Eeuo pipefail
umask 077

fail() { printf 'AHA backup refused: %s\n' "$1" >&2; exit 1; }
for required in node pg_dump pg_restore age git; do
  command -v "$required" >/dev/null 2>&1 || fail "Missing local command: $required"
done
[[ -n "${AHA_DB_URL:-}" ]] || fail 'Set private AHA_DB_URL in the local shell'
[[ -n "${AHA_BACKUP_RECIPIENT:-}" ]] || fail 'Set age public AHA_BACKUP_RECIPIENT'
[[ -r "${AHA_BACKUP_IDENTITY:-}" ]] || fail 'Set readable private AHA_BACKUP_IDENTITY file for verification'

# Validate the project without printing username, host, password, or URI.
node - <<'JS' || fail 'Database connection target must be AHA DB-03'
const raw = process.env.AHA_DB_URL;
const ref = 'wshmybqyksrwkawqleiz';
try {
  const url = new URL(raw);
  const direct = url.hostname === 'db.' + ref + '.supabase.co' && url.username === 'postgres';
  const pooled = url.hostname.endsWith('.pooler.supabase.com') && url.username === 'postgres.' + ref;
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !(direct || pooled) || !url.password) process.exit(1);
} catch { process.exit(1); }
JS

version="$(pg_dump --version)"
major="$(printf '%s\n' "$version" | sed -E 's/.* ([0-9]+)(\.[0-9]+)?.*/\1/')"
[[ "$major" =~ ^[0-9]+$ ]] && (( major >= 17 )) || fail 'pg_dump 17 or newer required for AHA Postgres 17'

backup_dir="${AHA_BACKUP_DIR:-${HOME:?}/AHA-private-backups}"
mkdir -p "$backup_dir"
# Reject any Git worktree, where artifacts could be committed or uploaded.
if git -C "$backup_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail 'Backup directory is inside a Git checkout'
fi

stem="aha-db03-$(date -u +%Y%m%dT%H%M%SZ)-$$"
archive="$backup_dir/$stem.dump.age"
partial="$archive.partial"
list="$backup_dir/$stem.objects.txt"
manifest="$backup_dir/$stem.manifest.json"
cleanup() { rm -f "$partial"; }
trap cleanup EXIT
[[ ! -e "$archive" && ! -e "$partial" ]] || fail 'Refusing to overwrite an existing backup'

# libpq accepts PGDATABASE as a URI. Credentials are not passed in argv.
export PGDATABASE="$AHA_DB_URL"
# pg_dump emits directly to age; the disk never receives plaintext SQL/data.
pg_dump --format=custom | age -r "$AHA_BACKUP_RECIPIENT" -o "$partial"
[[ -s "$partial" ]] || fail 'Encrypted dump is empty'
mv "$partial" "$archive"

# Only decrypted metadata is piped to pg_restore; no plaintext data is saved.
age -d -i "$AHA_BACKUP_IDENTITY" "$archive" | pg_restore --list > "$list"
for entry in \
  'TABLE DATA auth users ' \
  'TABLE DATA auth identities ' \
  'TABLE DATA auth sessions ' \
  'TABLE DATA public aha_profiles ' \
  'TABLE DATA public aha_feed_posts ' \
  'TABLE DATA public aha_insta_posts ' \
  'TABLE DATA storage buckets ' \
  'TABLE DATA storage objects ' \
  'TABLE DATA vault secrets ' \
  'TABLE DATA supabase_migrations schema_migrations ' \
  'TABLE DATA aha_friend_private '; do
  grep -Fq "$entry" "$list" || fail "Archive missing expected data section: $entry"
done

# Only encrypted archive metadata is saved here. No user identities or content.
node - "$archive" "$manifest" <<'JS'
const fs = require('node:fs');
const crypto = require('node:crypto');
const [archive, manifest] = process.argv.slice(2);
const bytes = fs.readFileSync(archive);
const report = {
  project_ref: 'wshmybqyksrwkawqleiz',
  archive_format: 'age-encrypted-pg_dump-custom',
  archive_bytes: bytes.length,
  encrypted_sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  inspected: 'decrypted-pg_restore-list-and-required-sections',
  restore_tested: false,
  approval: 'NOT_APPROVED: isolation_restore_and_roles_storage_scope_pending'
};
fs.writeFileSync(manifest, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
JS

printf 'Encrypted local snapshot created and archive list checked.\n'
printf 'Directory: %s\n' "$backup_dir"
printf 'Archive: %s\n' "$(basename "$archive")"
printf 'Status: NOT APPROVED until an isolated restore proves recovery.\n'
