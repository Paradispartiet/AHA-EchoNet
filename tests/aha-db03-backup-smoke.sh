#!/usr/bin/env bash
# Real age and PostgreSQL 17 using disposable test identities and synthetic data.
set -Eeuo pipefail
umask 077

scratch="$(mktemp -d)"
container=''
docker_bin="$(command -v docker)"
cleanup() {
  if [[ -n "$container" ]]; then
    "$docker_bin" rm -f "$container" >/dev/null
  fi
  rm -rf "$scratch"
}
trap cleanup EXIT

container="$("$docker_bin" run --detach --network none \
  --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17)"
for attempt in {1..30}; do
  if "$docker_bin" exec "$container" pg_isready -U postgres -h 127.0.0.1 -q; then
    break
  fi
  sleep 1
done
"$docker_bin" exec "$container" psql -X -U postgres -v ON_ERROR_STOP=1 -c \
  "CREATE TABLE backup_probe (id integer PRIMARY KEY, marker text NOT NULL);
   INSERT INTO backup_probe VALUES (17, 'synthetic-backup-probe');"

# Route only the dump command to the disposable container. No Supabase endpoint
# or credential can be used by this adapter, and the container has no network.
export SMOKE_DOCKER="$docker_bin" SMOKE_CONTAINER="$container"
mkdir "$scratch/bin"
cat > "$scratch/bin/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == run && "${*: -3}" == 'postgres:17 pg_dump --format=custom' ]]
exec "$SMOKE_DOCKER" exec "$SMOKE_CONTAINER" pg_dump --username=postgres --format=custom postgres
SH
cat > "$scratch/bin/pg_restore" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
exec "$SMOKE_DOCKER" exec -i "$SMOKE_CONTAINER" pg_restore "$@"
SH
chmod 700 "$scratch/bin/docker" "$scratch/bin/pg_restore"

identity="$scratch/synthetic-identity"
age-keygen -o "$identity" 2>/dev/null
recipient="$(age-keygen -y "$identity")"
PATH="$scratch/bin:$PATH" \
  GITHUB_ACTIONS=true GITHUB_REF=refs/heads/main RUNNER_TEMP="$scratch" \
  AHA_DB03_BACKUP_ENABLED=yes AHA_DB03_MANUAL_EXPORT_ACK=yes \
  AHA_DB03_DATABASE_URL='postgresql://postgres.wshmybqyksrwkawqleiz:synthetic-only@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require' \
  AHA_DB03_AGE_RECIPIENT="$recipient" bash scripts/aha-db03-backup-github.sh

output="$scratch/aha-db03-encrypted"
archives=("$output"/AHA-DB03-*.dump.age)
[[ "${#archives[@]}" -eq 1 ]]
PATH="$scratch/bin:$PATH" bash scripts/aha-db03-verify-ipad.sh \
  "${archives[0]}" "$output/AHA-DB03.manifest.json" "$identity"

# Real negative controls with age: a second synthetic private key must NOT
# decrypt, and a truncated ciphertext must fail both age and the iPad verifier.
# All identities are ephemeral fixtures, never an AHA user key or Supabase data.
wrong_identity="$scratch/wrong-synthetic-identity"
age-keygen -o "$wrong_identity" 2>/dev/null
if age -d -i "$wrong_identity" "${archives[0]}" >/dev/null 2>&1; then
  printf 'FAIL: synthetic ciphertext decrypted with the wrong identity.\n' >&2
  exit 1
fi

tampered="$scratch/AHA-DB03-truncated.dump.age"
cp "${archives[0]}" "$tampered"
truncate -s -16 "$tampered"
if age -d -i "$identity" "$tampered" >/dev/null 2>&1; then
  printf 'FAIL: truncated synthetic ciphertext was accepted by age.\n' >&2
  exit 1
fi
if PATH="$scratch/bin:$PATH" bash scripts/aha-db03-verify-ipad.sh \
    "$tampered" "$output/AHA-DB03.manifest.json" "$identity" >/dev/null 2>&1; then
  printf 'FAIL: iPad verifier accepted a truncated synthetic archive.\n' >&2
  exit 1
fi
printf 'Synthetic wrong-key and corrupted-ciphertext rejection: PASS.\n'

"$docker_bin" exec "$container" createdb -U postgres synthetic_restore
age -d -i "$identity" "${archives[0]}" | "$docker_bin" exec -i "$container" \
  pg_restore -U postgres --exit-on-error --dbname=synthetic_restore
restored="$("$docker_bin" exec "$container" psql -XAt -U postgres \
  --dbname=synthetic_restore -c 'SELECT id, marker FROM backup_probe')"
[[ "$restored" == '17|synthetic-backup-probe' ]]
printf 'Synthetic backup encrypted, decrypted and restored to isolated PostgreSQL 17.\n'
