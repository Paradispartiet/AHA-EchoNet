#!/usr/bin/env bash
set -euo pipefail

ROLE_NAME='aha_canonical_production_runtime'
EXPECTED_ROUTINES='bootstrap_sync_snapshot_v1,pull_sync_changes_v1,push_sync_change_v1'
EXPECTED_TABLES='article_references,articles,concept_list_items,concept_lists,conversations,device_sync_cursors,idempotency_keys,insight_versions,insights,knowledge_path_steps,knowledge_paths,messages,source_events,sync_changes,sync_conflicts,workspace_memberships,workspaces'

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required production database readiness setting: ${name}" >&2
    exit 1
  fi
}

for name in AHA_PRODUCTION_ADMIN_DATABASE_URL AHA_PRODUCTION_DATABASE_CA_CERT RUNNER_TEMP; do
  require_env "$name"
done

lower_dsn="$(printf '%s' "$AHA_PRODUCTION_ADMIN_DATABASE_URL" | tr '[:upper:]' '[:lower:]')"
for forbidden in sstuzwppsheivczyqrim wshmybqyksrwkawqleiz; do
  if [[ "$lower_dsn" == *"$forbidden"* ]]; then
    echo "Production readiness refused a staging/legacy-primary database target." >&2
    exit 1
  fi
done
if [[ "$lower_dsn" =~ [\?\&](sslmode|sslcert|sslkey|sslrootcert)= ]]; then
  echo "Production admin DSN must not override the pinned TLS settings." >&2
  exit 1
fi

ca_file="$RUNNER_TEMP/aha-production-db-ca.crt"
printf '%s\n' "$AHA_PRODUCTION_DATABASE_CA_CERT" > "$ca_file"
chmod 600 "$ca_file"
trap 'rm -f "$ca_file"' EXIT

if ! openssl x509 -in "$ca_file" -noout >/dev/null 2>&1; then
  echo "AHA_PRODUCTION_DATABASE_CA_CERT is not a valid X.509 certificate." >&2
  exit 1
fi

admin_psql() {
  PGSSLMODE=verify-full \
  PGSSLROOTCERT="$ca_file" \
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=2000' \
    psql "$AHA_PRODUCTION_ADMIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 -A -t -q "$@"
}

schema_present="$(admin_psql -c "select exists(select 1 from pg_namespace where nspname='aha')::int")"
if [[ "$schema_present" != "1" ]]; then
  echo "Production canonical schema aha is missing." >&2
  exit 1
fi

missing_tables="$(admin_psql -v expected="$EXPECTED_TABLES" -c "
  with expected(name) as (
    select unnest(string_to_array(:'expected', ','))
  )
  select coalesce(string_agg(e.name, ',' order by e.name),'')
  from expected e
  left join information_schema.tables t
    on t.table_schema='aha' and t.table_name=e.name
  where t.table_name is null
")"
if [[ -n "$missing_tables" ]]; then
  echo "Production canonical schema is missing required tables: $missing_tables" >&2
  exit 1
fi

intrinsic="$(admin_psql -v role_name="$ROLE_NAME" -c "
  select rolcanlogin::int, rolsuper::int, rolbypassrls::int, rolcreatedb::int, rolcreaterole::int, rolinherit::int
  from pg_roles where rolname=:'role_name'
")"
if [[ "$intrinsic" != "0|0|0|0|0|0" ]]; then
  echo "Production runtime role must exist as NOLOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOINHERIT before pilot activation." >&2
  exit 1
fi

privileged_memberships="$(admin_psql -v role_name="$ROLE_NAME" -c "
  select count(*)
  from pg_roles runtime_role
  cross join pg_roles privileged_role
  where runtime_role.rolname=:'role_name'
    and privileged_role.rolname <> runtime_role.rolname
    and (privileged_role.rolsuper or privileged_role.rolbypassrls)
    and pg_has_role(runtime_role.oid, privileged_role.oid, 'member')
")"
direct_write_grants="$(admin_psql -v role_name="$ROLE_NAME" -c "
  select count(*) from information_schema.role_table_grants
  where grantee=:'role_name' and table_schema='aha'
    and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
")"
owned_objects="$(admin_psql -v role_name="$ROLE_NAME" -c "
  select count(*) from pg_class c join pg_roles r on r.oid=c.relowner where r.rolname=:'role_name'
")"
schema_usage="$(admin_psql -v role_name="$ROLE_NAME" -c "select has_schema_privilege(:'role_name','aha','USAGE')::int")"
accessible_routines="$(admin_psql -v role_name="$ROLE_NAME" -c "
  select coalesce(string_agg(p.proname, ',' order by p.proname),'')
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='aha'
    and has_function_privilege(:'role_name', p.oid, 'EXECUTE')
")"

if [[ "$privileged_memberships" != "0" || "$direct_write_grants" != "0" || "$owned_objects" != "0" || "$schema_usage" != "1" ]]; then
  echo "Production runtime role failed the least-privilege boundary." >&2
  exit 1
fi
if [[ "$accessible_routines" != "$EXPECTED_ROUTINES" ]]; then
  echo "Production runtime role failed the exact effective canonical-sync function boundary." >&2
  exit 1
fi

# Read-only canary: the gate must be able to inspect sync state without mutating it.
sync_state="$(admin_psql -c "
  select count(*)::text || '|' || coalesce(max(cursor),0)::text || '|' ||
         (select count(*) from aha.sync_conflicts where status='open')::text
  from aha.sync_changes
")"
if [[ ! "$sync_state" =~ ^[0-9]+\|[0-9]+\|[0-9]+$ ]]; then
  echo "Production sync read-only canary returned an unexpected shape." >&2
  exit 1
fi

echo "AHA canonical production database readiness: PASS"
echo "AHA canonical production runtime role: NOLOGIN_LEAST_PRIVILEGE"
echo "AHA canonical production database check mode: READ_ONLY_VERIFY_FULL"
