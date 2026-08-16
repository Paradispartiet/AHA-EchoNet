#!/usr/bin/env bash
set -euo pipefail

CONFIRMATION='RUN_AHA_CANONICAL_SYNC_HOSTED_STAGING_REHEARSAL'
ROLE_PREFIX='aha_sync_e2e_'

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required ephemeral-runtime staging setting: ${name}" >&2
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
    # psql -c sends server-parsable SQL directly and does not perform psql
    # variable interpolation. Feed SQL through stdin so :'var' / :"var"
    # remain quoted by psql before the server sees the statement.
    PGOPTIONS='-c statement_timeout=8000 -c lock_timeout=2000' \
      psql "$AHA_STAGING_ADMIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 -A -t -q "${psql_args[@]}" <<<"$sql_command"
    return
  fi

  PGOPTIONS='-c statement_timeout=8000 -c lock_timeout=2000' \
    psql "$AHA_STAGING_ADMIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 -A -t -q "${psql_args[@]}"
}

check_admin_target() {
  require_env AHA_STAGING_ADMIN_DATABASE_URL
  require_env AHA_STAGING_PROJECT_REF
  if [[ ! "$AHA_STAGING_PROJECT_REF" =~ ^[a-z0-9]{20}$ ]]; then
    echo "Ephemeral runtime role requires a pinned Supabase project ref." >&2
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

runtime_role_name() {
  require_env GITHUB_RUN_ID
  require_env GITHUB_RUN_ATTEMPT
  if [[ ! "$GITHUB_RUN_ID" =~ ^[0-9]+$ || ! "$GITHUB_RUN_ATTEMPT" =~ ^[0-9]+$ ]]; then
    echo "GitHub run identity is invalid for ephemeral runtime-role creation." >&2
    exit 1
  fi
  printf '%s%s_%s' "$ROLE_PREFIX" "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT"
}

build_runtime_dsn() {
  local role_name="$1"
  local password="$2"
  AHA_ADMIN_DSN="$AHA_STAGING_ADMIN_DATABASE_URL" \
  AHA_PROJECT_REF="$AHA_STAGING_PROJECT_REF" \
  AHA_RUNTIME_ROLE="$role_name" \
  AHA_RUNTIME_PASSWORD="$password" \
  python3 - <<'PY'
import os
from urllib.parse import quote, urlparse, urlunparse

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
print(urlunparse((parsed.scheme, netloc, parsed.path, parsed.params, parsed.query, '')), end='')
PY
}

create_role() {
  check_admin_target
  if [[ "${AHA_CANONICAL_SYNC_HOSTED_STAGING_CONFIRMATION:-}" != "$CONFIRMATION" ]]; then
    echo "Ephemeral runtime-role creation requires the exact hosted staging confirmation." >&2
    exit 1
  fi
  require_env GITHUB_ENV

  local role_name password runtime_dsn role_exists
  role_name="$(runtime_role_name)"
  password="$(python3 - <<'PY'
import secrets
print(secrets.token_hex(32), end='')
PY
)"
  runtime_dsn="$(build_runtime_dsn "$role_name" "$password")"

  if [[ ! "$role_name" =~ ^aha_sync_e2e_[0-9]+_[0-9]+$ ]]; then
    echo "Generated runtime role is outside the protected fixture namespace." >&2
    exit 1
  fi

  # Mask generated credentials before any later step can accidentally echo them.
  printf '::add-mask::%s\n' "$password"
  printf '::add-mask::%s\n' "$runtime_dsn"
  printf 'AHA_STAGING_EPHEMERAL_RUNTIME_ROLE=%s\n' "$role_name" >> "$GITHUB_ENV"
  printf 'AHA_STAGING_RUNTIME_DATABASE_URL=%s\n' "$runtime_dsn" >> "$GITHUB_ENV"

  role_exists="$(admin_psql -v role_name="$role_name" -c "select exists(select 1 from pg_roles where rolname=:'role_name')::int")"
  if [[ "$role_exists" != "0" ]]; then
    echo "Run-scoped AHA runtime role already exists; refusing to reuse it." >&2
    exit 1
  fi

  admin_psql -v role_name="$role_name" -v role_password="$password" -c "
    create role :\"role_name\"
      login
      password :'role_password'
      nosuperuser
      nobypassrls
      nocreatedb
      nocreaterole
      noinherit
      connection limit 4;
    grant usage on schema aha to :\"role_name\";
    grant execute on function aha.commit_local_import_v1(text,text,text,text,text,text,jsonb) to :\"role_name\";
  " >/dev/null

  local role_safety privileged_memberships direct_write_grants import_execute helper_execute
  role_safety="$(admin_psql -v role_name="$role_name" -c "
    select rolsuper::int, rolbypassrls::int, rolcreatedb::int, rolcreaterole::int, rolinherit::int, rolcanlogin::int
    from pg_roles where rolname=:'role_name'
  ")"
  if [[ "$role_safety" != "0|0|0|0|0|1" ]]; then
    echo "Ephemeral AHA runtime role failed its intrinsic privilege check." >&2
    exit 1
  fi

  privileged_memberships="$(admin_psql -v role_name="$role_name" -c "
    select count(*)
    from pg_roles runtime_role
    cross join pg_roles privileged_role
    where runtime_role.rolname=:'role_name'
      and privileged_role.rolname <> runtime_role.rolname
      and (privileged_role.rolsuper or privileged_role.rolbypassrls)
      and pg_has_role(runtime_role.oid, privileged_role.oid, 'member')
  ")"
  if [[ "$privileged_memberships" != "0" ]]; then
    echo "Ephemeral AHA runtime role has a forbidden privileged role membership." >&2
    exit 1
  fi

  direct_write_grants="$(admin_psql -v role_name="$role_name" -c "
    select count(*)
    from information_schema.role_table_grants
    where grantee=:'role_name'
      and table_schema='aha'
      and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
  ")"
  if [[ "$direct_write_grants" != "0" ]]; then
    echo "Ephemeral AHA runtime role unexpectedly has direct canonical table writes." >&2
    exit 1
  fi

  import_execute="$(admin_psql -v role_name="$role_name" -c "select has_function_privilege(:'role_name', 'aha.commit_local_import_v1(text,text,text,text,text,text,jsonb)', 'EXECUTE')::int")"
  helper_execute="$(admin_psql -v role_name="$role_name" -c "select has_function_privilege(:'role_name', 'aha.record_local_import_item_v1(text,text,text,text,text,text,text,text,text)', 'EXECUTE')::int")"
  if [[ "$import_execute" != "1" || "$helper_execute" != "0" ]]; then
    echo "Ephemeral AHA runtime role failed the explicit command/helper privilege boundary." >&2
    exit 1
  fi

  echo "AHA canonical sync ephemeral staging runtime: READY"
}

drop_role() {
  check_admin_target
  local role_name="${AHA_STAGING_EPHEMERAL_RUNTIME_ROLE:-}"
  if [[ -z "$role_name" ]]; then
    echo "AHA canonical sync ephemeral staging runtime: no role metadata; cleanup skipped"
    return 0
  fi
  if [[ ! "$role_name" =~ ^aha_sync_e2e_[0-9]+_[0-9]+$ ]]; then
    echo "Refusing to clean up a role outside the protected AHA rehearsal namespace." >&2
    exit 1
  fi

  local role_exists role_safety owned_objects privileged_memberships
  role_exists="$(admin_psql -v role_name="$role_name" -c "select exists(select 1 from pg_roles where rolname=:'role_name')::int")"
  if [[ "$role_exists" == "0" ]]; then
    echo "AHA canonical sync ephemeral staging runtime: already absent"
    return 0
  fi

  role_safety="$(admin_psql -v role_name="$role_name" -c "
    select rolsuper::int, rolbypassrls::int, rolcreatedb::int, rolcreaterole::int, rolinherit::int, rolcanlogin::int
    from pg_roles where rolname=:'role_name'
  ")"
  if [[ "$role_safety" != "0|0|0|0|0|1" ]]; then
    echo "Refusing to drop an AHA rehearsal role whose privilege shape changed unexpectedly." >&2
    exit 1
  fi

  privileged_memberships="$(admin_psql -v role_name="$role_name" -c "
    select count(*)
    from pg_roles runtime_role
    cross join pg_roles privileged_role
    where runtime_role.rolname=:'role_name'
      and privileged_role.rolname <> runtime_role.rolname
      and (privileged_role.rolsuper or privileged_role.rolbypassrls)
      and pg_has_role(runtime_role.oid, privileged_role.oid, 'member')
  ")"
  if [[ "$privileged_memberships" != "0" ]]; then
    echo "Refusing to clean up an AHA rehearsal role with privileged memberships." >&2
    exit 1
  fi

  owned_objects="$(admin_psql -v role_name="$role_name" -c "
    select count(*)
    from pg_class c
    join pg_roles r on r.oid=c.relowner
    where r.rolname=:'role_name'
  ")"
  if [[ "$owned_objects" != "0" ]]; then
    echo "Refusing to hide unexpected database ownership during AHA runtime cleanup." >&2
    exit 1
  fi

  # Revoke only the privileges this rehearsal is allowed to grant. If some unknown
  # dependency was added to the role, DROP ROLE must fail rather than DROP OWNED
  # silently erasing evidence of privilege drift.
  admin_psql -v role_name="$role_name" -c "
    select pg_terminate_backend(pid)
    from pg_stat_activity
    where usename=:'role_name'
      and pid <> pg_backend_pid();
    revoke execute on function aha.bootstrap_sync_snapshot_v1(text,text,bigint,integer) from :\"role_name\";
    revoke execute on function aha.pull_sync_changes_v1(text,bigint,integer) from :\"role_name\";
    revoke execute on function aha.push_sync_change_v1(text,text,text,text,text,text,bigint,text,jsonb) from :\"role_name\";
    revoke execute on function aha.commit_local_import_v1(text,text,text,text,text,text,jsonb) from :\"role_name\";
    revoke usage on schema aha from :\"role_name\";
    drop role :\"role_name\";
  " >/dev/null

  echo "AHA canonical sync ephemeral staging runtime: CLEANED"
}

case "${1:-}" in
  create) create_role ;;
  drop) drop_role ;;
  *)
    echo "usage: $0 create|drop" >&2
    exit 2
    ;;
esac
