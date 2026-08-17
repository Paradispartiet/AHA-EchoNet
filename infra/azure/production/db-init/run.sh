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

require_env AHA_PRODUCTION_ADMIN_DATABASE_URL
require_env AHA_PRODUCTION_DATABASE_CA_CERT
require_env AHA_PRODUCTION_READINESS_PASSWORD

case "$(printf '%s' "$AHA_PRODUCTION_ADMIN_DATABASE_URL" | tr '[:upper:]' '[:lower:]')" in
  *sstuzwppsheivczyqrim*|*wshmybqyksrwkawqleiz*)
    echo "Production DB init refused a staging/legacy-primary database target." >&2
    exit 1
    ;;
esac

case "$(printf '%s' "$AHA_PRODUCTION_ADMIN_DATABASE_URL" | tr '[:upper:]' '[:lower:]')" in
  *sslmode=*|*sslcert=*|*sslkey=*|*sslrootcert=*)
    echo "Production admin DSN must not override pinned TLS settings." >&2
    exit 1
    ;;
esac

ca_file="$(mktemp /tmp/aha-production-ca.XXXXXX.crt)"
trap 'rm -f "$ca_file"' EXIT HUP INT TERM
printf '%s\n' "$AHA_PRODUCTION_DATABASE_CA_CERT" > "$ca_file"
chmod 0600 "$ca_file"
if ! openssl x509 -in "$ca_file" -noout >/dev/null 2>&1; then
  echo "AHA_PRODUCTION_DATABASE_CA_CERT is not a valid X.509 certificate." >&2
  exit 1
fi

export PGSSLMODE=verify-full
export PGSSLROOTCERT="$ca_file"
export PGOPTIONS='-c statement_timeout=60000 -c lock_timeout=5000'

migration_count=0
for migration in $(find /aha/migrations -maxdepth 1 -type f -name '*.sql' | sort); do
  echo "Applying canonical migration: $(basename "$migration")"
  psql "$AHA_PRODUCTION_ADMIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$migration"
  migration_count=$((migration_count + 1))
done

if [ "$migration_count" -lt 10 ]; then
  echo "Production DB init found an unexpectedly small canonical migration set." >&2
  exit 1
fi

psql "$AHA_PRODUCTION_ADMIN_DATABASE_URL" \
  -X -v ON_ERROR_STOP=1 \
  -v readiness_password="$AHA_PRODUCTION_READINESS_PASSWORD" \
  -f /aha/roles.sql

readiness_shape="$(psql "$AHA_PRODUCTION_ADMIN_DATABASE_URL" -X -A -t -q -v ON_ERROR_STOP=1 -c "
  select rolcanlogin::int || '|' || rolsuper::int || '|' || rolbypassrls::int || '|' ||
         rolcreatedb::int || '|' || rolcreaterole::int || '|' || rolinherit::int
  from pg_roles where rolname='aha_canonical_production_readiness'
")"
runtime_shape="$(psql "$AHA_PRODUCTION_ADMIN_DATABASE_URL" -X -A -t -q -v ON_ERROR_STOP=1 -c "
  select rolcanlogin::int || '|' || rolsuper::int || '|' || rolbypassrls::int || '|' ||
         rolcreatedb::int || '|' || rolcreaterole::int || '|' || rolinherit::int
  from pg_roles where rolname='aha_canonical_production_runtime'
")"
runtime_functions="$(psql "$AHA_PRODUCTION_ADMIN_DATABASE_URL" -X -A -t -q -v ON_ERROR_STOP=1 -c "
  select coalesce(string_agg(p.proname, ',' order by p.proname),'')
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='aha'
    and has_function_privilege('aha_canonical_production_runtime',p.oid,'EXECUTE')
")"
runtime_writes="$(psql "$AHA_PRODUCTION_ADMIN_DATABASE_URL" -X -A -t -q -v ON_ERROR_STOP=1 -c "
  select count(*)
  from information_schema.role_table_grants
  where grantee='aha_canonical_production_runtime'
    and table_schema='aha'
    and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
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

schema_receipts="$(psql "$AHA_PRODUCTION_ADMIN_DATABASE_URL" -X -A -t -q -v ON_ERROR_STOP=1 -c "select count(*) from aha.schema_versions")"
case "$schema_receipts" in
  ''|*[!0-9]*)
    echo "Production canonical schema receipt check failed." >&2
    exit 1
    ;;
esac

printf 'AHA production canonical migrations: %s applied\n' "$migration_count"
echo 'AHA production readiness role: LOGIN_CATALOG_ONLY'
echo 'AHA production sync runtime role: NOLOGIN_EXACT_THREE_ROUTINES'
echo 'AHA production canonical sync activation: DISABLED'
