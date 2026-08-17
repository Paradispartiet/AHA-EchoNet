#!/bin/sh
set -eu

require_env() {
  name="$1"
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "Missing required production database initialization setting: $name" >&2
    exit 1
  fi
}

mode="${AHA_DB_INIT_MODE:-apply}"
case "$mode" in
  apply|verify_restore) ;;
  *)
    echo "AHA_DB_INIT_MODE must be apply or verify_restore." >&2
    exit 1
    ;;
esac

require_env AHA_PRODUCTION_ADMIN_DATABASE_URL
require_env AHA_PRODUCTION_DATABASE_CA_CERT
if [ "$mode" = 'apply' ]; then
  require_env AHA_PRODUCTION_READINESS_PASSWORD
fi

lower_dsn="$(printf '%s' "$AHA_PRODUCTION_ADMIN_DATABASE_URL" | tr '[:upper:]' '[:lower:]')"
case "$lower_dsn" in
  *sstuzwppsheivczyqrim*|*wshmybqyksrwkawqleiz*)
    echo "Production DB init refused a staging/legacy-primary database target." >&2
    exit 1
    ;;
esac
case "$lower_dsn" in
  *sslmode=*|*sslcert=*|*sslkey=*|*sslrootcert=*)
    echo "Production admin DSN must not override pinned TLS settings." >&2
    exit 1
    ;;
esac

# BusyBox mktemp (used by postgres:16-alpine) requires the XXXXXX placeholder
# to be the final characters in the template. A suffix after XXXXXX fails with
# "mktemp: Invalid argument" before TLS/database verification can start.
ca_file="$(mktemp /tmp/aha-production-ca.XXXXXX)"
trap 'rm -f "$ca_file"' EXIT HUP INT TERM
printf '%s\n' "$AHA_PRODUCTION_DATABASE_CA_CERT" > "$ca_file"
chmod 0600 "$ca_file"
if ! openssl x509 -in "$ca_file" -noout >/dev/null 2>&1; then
  echo "AHA_PRODUCTION_DATABASE_CA_CERT is not a valid X.509 certificate." >&2
  exit 1
fi

export PGSSLMODE=verify-full
export PGSSLROOTCERT="$ca_file"
if [ "$mode" = 'verify_restore' ]; then
  export PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=60000 -c lock_timeout=5000'
else
  export PGOPTIONS='-c statement_timeout=60000 -c lock_timeout=5000'
fi

psql_safe() {
  psql "$AHA_PRODUCTION_ADMIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 "$@"
}

verify_canonical_state() {
  readiness_shape="$(psql_safe -A -t -q -c "
    select rolcanlogin::int || '|' || rolsuper::int || '|' || rolbypassrls::int || '|' ||
           rolcreatedb::int || '|' || rolcreaterole::int || '|' || rolinherit::int
    from pg_roles where rolname='aha_canonical_production_readiness'
  ")"
  runtime_shape="$(psql_safe -A -t -q -c "
    select rolcanlogin::int || '|' || rolsuper::int || '|' || rolbypassrls::int || '|' ||
           rolcreatedb::int || '|' || rolcreaterole::int || '|' || rolinherit::int
    from pg_roles where rolname='aha_canonical_production_runtime'
  ")"
  runtime_functions="$(psql_safe -A -t -q -c "
    select coalesce(string_agg(p.proname, ',' order by p.proname),'')
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='aha'
      and has_function_privilege('aha_canonical_production_runtime',p.oid,'EXECUTE')
  ")"
  runtime_writes="$(psql_safe -A -t -q -c "
    select count(*)
    from information_schema.role_table_grants
    where grantee='aha_canonical_production_runtime'
      and table_schema='aha'
      and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
  ")"
  schema_receipts="$(psql_safe -A -t -q -c "select count(*) from aha.schema_versions")"
  schema_present="$(psql_safe -A -t -q -c "select (to_regclass('aha.profiles') is not null and to_regclass('aha.sync_changes') is not null)::int")"
  data_shape="$(psql_safe -A -t -q -c "
    select
      (select count(*) from aha.profiles)::text || '|' ||
      (select count(*) from aha.workspaces)::text || '|' ||
      (select count(*) from aha.source_events)::text || '|' ||
      (select count(*) from aha.sync_changes)::text || '|' ||
      (select count(*) from aha.sync_conflicts where status='open')::text
  ")"

  if [ "$readiness_shape" != '1|0|0|0|0|0' ]; then
    echo "Production readiness role failed its intrinsic privilege boundary." >&2
    exit 1
  fi
  if [ "$runtime_shape" != '0|0|0|0|0|0' ]; then
    echo "Production runtime role is not fail-closed NOLOGIN." >&2
    exit 1
  fi
  if [ "$runtime_functions" != 'bootstrap_sync_snapshot_v1,pull_sync_changes_v1,push_sync_change_v1' ]; then
    echo "Production runtime role has unexpected effective function privileges." >&2
    exit 1
  fi
  if [ "$runtime_writes" != '0' ]; then
    echo "Production runtime role has direct canonical table write privileges." >&2
    exit 1
  fi
  if [ "$schema_present" != '1' ]; then
    echo "Production canonical schema is incomplete." >&2
    exit 1
  fi
  case "$schema_receipts" in
    ''|*[!0-9]*)
      echo "Production canonical schema receipt check failed." >&2
      exit 1
      ;;
  esac
  case "$data_shape" in
    *[!0-9\|]*|'')
      echo "Production canonical data verification returned an unexpected shape." >&2
      exit 1
      ;;
  esac

  printf 'AHA production canonical state: schema_receipts=%s data_shape=%s\n' "$schema_receipts" "$data_shape"
}

if [ "$mode" = 'verify_restore' ]; then
  verify_canonical_state
  echo 'AHA production restore verification: PASS_READ_ONLY_VERIFY_FULL'
  echo 'AHA production sync runtime role: NOLOGIN_EXACT_THREE_ROUTINES'
  echo 'AHA production canonical sync activation: DISABLED'
  exit 0
fi

migration_count=0
find /aha/migrations -maxdepth 1 -type f -name '*.sql' | sort | while IFS= read -r migration; do
  echo "Applying canonical migration: $(basename "$migration")"
  psql_safe -f "$migration"
done
migration_count="$(find /aha/migrations -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')"

if [ "$migration_count" -lt 10 ]; then
  echo "Production DB init found an unexpectedly small canonical migration set." >&2
  exit 1
fi

psql_safe \
  -v readiness_password="$AHA_PRODUCTION_READINESS_PASSWORD" \
  -f /aha/roles.sql

verify_canonical_state

printf 'AHA production canonical migrations: %s applied\n' "$migration_count"
echo 'AHA production readiness role: LOGIN_CATALOG_ONLY'
echo 'AHA production sync runtime role: NOLOGIN_EXACT_THREE_ROUTINES'
echo 'AHA production canonical sync activation: DISABLED'
