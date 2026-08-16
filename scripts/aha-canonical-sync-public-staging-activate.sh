#!/usr/bin/env bash
set -euo pipefail

CONFIRMATION='RUN_AHA_CANONICAL_PUBLIC_STAGING_ACTIVATION'
ROLE_NAME='aha_canonical_staging_runtime'
EXPECTED_ROUTINES='bootstrap_sync_snapshot_v1,pull_sync_changes_v1,push_sync_change_v1'

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required canonical public staging setting: ${name}" >&2
    exit 1
  fi
}

admin_psql() {
  local -a psql_args=()
  local sql_command=""
  local has_sql_command=0

  while (($# > 0)); do
    case "$1" in
      -c|--command)
        if [[ $# -lt 2 || $has_sql_command -eq 1 ]]; then
          echo "admin_psql accepts exactly one SQL command." >&2
          exit 1
        fi
        sql_command="$2"
        has_sql_command=1
        shift 2
        ;;
      *)
        psql_args+=("$1")
        shift
        ;;
    esac
  done

  if ((has_sql_command == 1)); then
    PGSSLMODE=verify-full \
    PGSSLROOTCERT="$AHA_POSTGRES_SSL_ROOT_CERT" \
    PGOPTIONS='-c statement_timeout=8000 -c lock_timeout=2000' \
      psql "$AHA_STAGING_ADMIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 -A -t -q "${psql_args[@]}" <<<"$sql_command"
    return
  fi

  PGSSLMODE=verify-full \
  PGSSLROOTCERT="$AHA_POSTGRES_SSL_ROOT_CERT" \
  PGOPTIONS='-c statement_timeout=8000 -c lock_timeout=2000' \
    psql "$AHA_STAGING_ADMIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 -A -t -q "${psql_args[@]}"
}

runtime_psql() {
  PGSSLMODE=verify-full \
  PGSSLROOTCERT="$AHA_POSTGRES_SSL_ROOT_CERT" \
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=8000 -c lock_timeout=2000' \
    psql "$AHA_STAGING_RUNTIME_DATABASE_URL" -X -v ON_ERROR_STOP=1 -A -t -q "$@"
}

check_admin_target() {
  require_env AHA_STAGING_ADMIN_DATABASE_URL
  require_env AHA_STAGING_PROJECT_REF
  require_env AHA_POSTGRES_SSL_ROOT_CERT
  if [[ ! -r "$AHA_POSTGRES_SSL_ROOT_CERT" ]]; then
    echo "Pinned PostgreSQL CA certificate is not readable." >&2
    exit 1
  fi
  if [[ ! "$AHA_STAGING_PROJECT_REF" =~ ^[a-z0-9]{20}$ ]]; then
    echo "Canonical public staging activation requires a pinned Supabase project ref." >&2
    exit 1
  fi
  if ! AHA_DSN_TO_CHECK="$AHA_STAGING_ADMIN_DATABASE_URL" AHA_PROJECT_REF_TO_CHECK="$AHA_STAGING_PROJECT_REF" python3 - <<'PY'
import os
from urllib.parse import unquote, urlparse

parsed = urlparse(os.environ['AHA_DSN_TO_CHECK'])
ref = os.environ['AHA_PROJECT_REF_TO_CHECK']
host = (parsed.hostname or '').lower()
user = unquote(parsed.username or '')
direct = host == f'db.{ref}.supabase.co'
pooler = host.endswith('.pooler.supabase.com') and user.endswith(f'.{ref}')
raise SystemExit(0 if direct or pooler else 1)
PY
  then
    echo "Admin DSN does not identify the pinned AHA staging project." >&2
    exit 1
  fi
}

build_runtime_dsn() {
  local password="$1"
  AHA_ADMIN_DSN="$AHA_STAGING_ADMIN_DATABASE_URL" \
  AHA_PROJECT_REF="$AHA_STAGING_PROJECT_REF" \
  AHA_RUNTIME_ROLE="$ROLE_NAME" \
  AHA_RUNTIME_PASSWORD="$password" \
  python3 - <<'PY'
import os
from urllib.parse import parse_qsl, quote, urlencode, urlparse, urlunparse

parsed = urlparse(os.environ['AHA_ADMIN_DSN'])
ref = os.environ['AHA_PROJECT_REF']
role = os.environ['AHA_RUNTIME_ROLE']
password = os.environ['AHA_RUNTIME_PASSWORD']
host = (parsed.hostname or '').lower()

if host == f'db.{ref}.supabase.co':
    username = role
elif host.endswith('.pooler.supabase.com'):
    username = f'{role}.{ref}'
else:
    raise SystemExit('admin DSN host is not the pinned Supabase staging target')

host_part = host
if parsed.port:
    host_part = f'{host_part}:{parsed.port}'
netloc = f'{quote(username, safe="")}:{quote(password, safe="")}@{host_part}'
blocked = {'sslmode', 'sslcert', 'sslkey', 'sslrootcert'}
query = urlencode([(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k.lower() not in blocked])
print(urlunparse((parsed.scheme, netloc, parsed.path, parsed.params, query, '')), end='')
PY
}

preflight_role() {
  local intrinsic privileged_memberships direct_write_grants owned_objects schema_usage routines local_import helper_count

  intrinsic="$(admin_psql -v role_name="$ROLE_NAME" -c "
    select rolcanlogin::int, rolsuper::int, rolbypassrls::int, rolcreatedb::int, rolcreaterole::int, rolinherit::int
    from pg_roles where rolname=:'role_name'
  ")"
  if [[ "$intrinsic" != "0|0|0|0|0|0" ]]; then
    echo "Persistent staging role is absent, already LOGIN-enabled, or has unexpected intrinsic privileges." >&2
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
  routines="$(admin_psql -v role_name="$ROLE_NAME" -c "
    select coalesce(string_agg(routine_name, ',' order by routine_name),'')
    from information_schema.role_routine_grants
    where grantee=:'role_name' and routine_schema='aha' and privilege_type='EXECUTE'
  ")"
  local_import="$(admin_psql -v role_name="$ROLE_NAME" -c "select has_function_privilege(:'role_name','aha.commit_local_import_v1(text,text,text,text,text,text,jsonb)','EXECUTE')::int")"
  helper_count="$(admin_psql -v role_name="$ROLE_NAME" -c "
    select
      has_function_privilege(:'role_name','aha.sync_object_snapshot_v1(text,text,text)','EXECUTE')::int +
      has_function_privilege(:'role_name','aha.record_sync_conflict_v1(text,text,text,text,text,text,bigint,bigint,text,text,text,text,jsonb)','EXECUTE')::int +
      has_function_privilege(:'role_name','aha.sync_apply_upsert_v1(text,text,text,text,jsonb,boolean)','EXECUTE')::int +
      has_function_privilege(:'role_name','aha.sync_apply_delete_v1(text,text,text)','EXECUTE')::int
  ")"

  if [[ "$privileged_memberships" != "0" || "$direct_write_grants" != "0" || "$owned_objects" != "0" || "$schema_usage" != "1" ]]; then
    echo "Persistent staging role failed its least-privilege database boundary." >&2
    exit 1
  fi
  if [[ "$routines" != "$EXPECTED_ROUTINES" || "$local_import" != "0" || "$helper_count" != "0" ]]; then
    echo "Persistent staging role failed its exact canonical-sync function boundary." >&2
    exit 1
  fi

  echo "AHA canonical public staging persistent role: PREFLIGHT_PASS"
}

activate_role() {
  check_admin_target
  if [[ "${AHA_CANONICAL_PUBLIC_STAGING_CONFIRMATION:-}" != "$CONFIRMATION" ]]; then
    echo "Canonical public staging activation requires the exact confirmation token." >&2
    exit 1
  fi
  require_env GITHUB_ENV
  preflight_role

  local password runtime_dsn
  password="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(48), end='')
PY
)"
  runtime_dsn="$(build_runtime_dsn "$password")"

  printf '::add-mask::%s\n' "$password"
  printf '::add-mask::%s\n' "$runtime_dsn"
  printf 'AHA_STAGING_RUNTIME_DATABASE_URL=%s\n' "$runtime_dsn" >> "$GITHUB_ENV"
  printf 'AHA_PUBLIC_STAGING_ROLE_TOUCHED=1\n' >> "$GITHUB_ENV"

  admin_psql -v role_name="$ROLE_NAME" -v role_password="$password" -c "
    alter role :\"role_name\" login password :'role_password';
  " >/dev/null

  local runtime_shape runtime_name
  runtime_name="$(runtime_psql -c 'select current_user')"
  runtime_shape="$(runtime_psql -c "
    select rolcanlogin::int, rolsuper::int, rolbypassrls::int, rolcreatedb::int, rolcreaterole::int, rolinherit::int
    from pg_roles where rolname=current_user
  ")"
  if [[ "$runtime_name" != "$ROLE_NAME" || "$runtime_shape" != "1|0|0|0|0|0" ]]; then
    echo "Persistent staging runtime failed its post-activation login/privilege check." >&2
    exit 1
  fi

  echo "AHA canonical public staging persistent role: LOGIN_READY"
}

rollback_role() {
  check_admin_target
  if [[ "${AHA_PUBLIC_STAGING_ACTIVATION_COMMITTED:-0}" == "1" ]]; then
    echo "AHA canonical public staging persistent role: committed; rollback skipped"
    return 0
  fi
  if [[ "${AHA_PUBLIC_STAGING_ROLE_TOUCHED:-0}" != "1" ]]; then
    echo "AHA canonical public staging persistent role: untouched; rollback skipped"
    return 0
  fi

  admin_psql -v role_name="$ROLE_NAME" -c "alter role :\"role_name\" nologin password null;" >/dev/null
  local intrinsic
  intrinsic="$(admin_psql -v role_name="$ROLE_NAME" -c "
    select rolcanlogin::int, rolsuper::int, rolbypassrls::int, rolcreatedb::int, rolcreaterole::int, rolinherit::int
    from pg_roles where rolname=:'role_name'
  ")"
  if [[ "$intrinsic" != "0|0|0|0|0|0" ]]; then
    echo "Persistent staging role rollback failed." >&2
    exit 1
  fi
  echo "AHA canonical public staging persistent role: ROLLED_BACK"
}

case "${1:-}" in
  activate) activate_role ;;
  rollback) rollback_role ;;
  *)
    echo "usage: $0 activate|rollback" >&2
    exit 2
    ;;
esac
