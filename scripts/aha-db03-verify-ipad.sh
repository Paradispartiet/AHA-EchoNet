#!/usr/bin/env bash
# Offline iPad/iSH validation of an encrypted AHA DB-03 backup.
# Never connects to a database, exports data or writes decrypted rows to disk.
set -Eeuo pipefail
umask 077
fail() { printf 'AHA iPad backup check FAILED: %s\n' "$1" >&2; exit 1; }
[[ $# -eq 3 ]] || fail 'Usage: bash aha-db03-verify-ipad.sh ARCHIVE.dump.age MANIFEST.json PRIVATE_IDENTITY'
archive="$1"
manifest="$2"
identity="$3"
[[ -f "$archive" && -r "$archive" && -s "$archive" ]] || fail 'Encrypted archive not readable'
[[ -f "$manifest" && -r "$manifest" ]] || fail 'Manifest not readable'
[[ -f "$identity" && -r "$identity" ]] || fail 'Private identity not readable on this iPad'
[[ "${archive##*/}" == AHA-DB03-*.dump.age ]] || fail 'Unexpected archive filename'
for cmd in age sha256sum jq wc sed tr; do
  command -v "$cmd" >/dev/null 2>&1 || fail "Missing tool: $cmd"
done

restore_bin="$(command -v pg_restore || true)"
if [[ -z "$restore_bin" && -x /usr/libexec/postgresql17/pg_restore ]]; then
  restore_bin=/usr/libexec/postgresql17/pg_restore
fi
[[ -n "$restore_bin" ]] || fail 'Missing PostgreSQL 17+ pg_restore client'
pg_major="$("$restore_bin" --version | sed -n 's/.*(PostgreSQL) \([0-9][0-9]*\).*/\1/p')"
[[ "$pg_major" =~ ^[0-9]+$ && "$pg_major" -ge 17 ]] || fail 'pg_restore 17+ required'
jq -e --arg ref "wshmybqyksrwkawqleiz" '
  .project_ref == $ref and
  .archive_format == "age-encrypted PostgreSQL-17 custom-format logical dump" and
  .restore_tested == false and
  .approval == "NOT_APPROVED_FOR_WRITES" and
  (.encrypted_bytes | type == "number") and
  (.encrypted_sha256 | type == "string" and test("^[0-9a-f]{64}$"))
' "$manifest" >/dev/null || fail 'Manifest is not an unapproved AHA DB-03 archive manifest'

expected_sha="$(jq -r '.encrypted_sha256' "$manifest")"
actual_sha="$(sha256sum "$archive")"
actual_sha="${actual_sha%% *}"
[[ "$actual_sha" == "$expected_sha" ]] || fail 'Encrypted archive SHA256 differs from manifest'

expected_bytes="$(jq -r '.encrypted_bytes' "$manifest")"
actual_bytes="$(wc -c < "$archive" | tr -d '[:space:]')"
[[ "$actual_bytes" == "$expected_bytes" ]] || fail 'Encrypted archive size differs from manifest'
printf 'AHA DB-03 ciphertext hash and size: OK\n'

# pg_restore emits generated SQL to /dev/null; it never uses -d/--dbname.
# pipefail makes a truncated/invalid ciphertext or archive fail this check.
# All decrypted content stays in process pipes and is not printed or persisted.
if ! age -d -i "$identity" "$archive" 2>/dev/null \
    | "$restore_bin" --file=/dev/null - 2>/dev/null; then
  fail 'Decryption or full archive read failed (no plaintext saved)'
fi

printf 'Decryption and full pg_restore read: OK (offline, no DB connection)\n'
printf 'NOT a tested restore: roles, grants, Auth, Storage files, Vault and login still need an isolated restore test.\n'
