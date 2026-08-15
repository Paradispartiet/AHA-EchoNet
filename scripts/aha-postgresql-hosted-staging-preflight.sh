#!/usr/bin/env bash
set -euo pipefail

require_secret() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required hosted-staging secret: ${name}" >&2
    exit 1
  fi
}

require_secret AHA_STAGING_ADMIN_DATABASE_URL
require_secret AHA_STAGING_RUNTIME_DATABASE_URL

if [[ -z "${AHA_STAGING_PROJECT_REF:-}" || ! "$AHA_STAGING_PROJECT_REF" =~ ^[a-z0-9]{20}$ ]]; then
  echo "Hosted staging requires a pinned Supabase project ref." >&2
  exit 1
fi

if [[ "${AHA_HOSTED_STAGING_CONFIRMATION:-}" != "RUN_AHA_HOSTED_STAGING_PREFLIGHT" ]]; then
  echo "Hosted staging preflight requires the exact manual confirmation token." >&2
  exit 1
fi

check_supabase_project_ref() {
  local label="$1"
  local url="$2"
  if ! AHA_DSN_TO_CHECK="$url" AHA_PROJECT_REF_TO_CHECK="$AHA_STAGING_PROJECT_REF" python3 - <<'PY'
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
    echo "${label} DSN does not identify the pinned AHA Supabase staging project." >&2
    exit 1
  fi
}

readonly_psql() {
  local url="$1"
  shift
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=8000 -c lock_timeout=2000' \
    psql "$url" -X -v ON_ERROR_STOP=1 -A -t -q "$@"
}

check_ssl() {
  local label="$1"
  local url="$2"
  local ssl
  ssl="$(readonly_psql "$url" -c "select coalesce((select ssl::text from pg_stat_ssl where pid = pg_backend_pid()), 'false')")"
  if [[ "$ssl" != "true" && "$ssl" != "t" ]]; then
    echo "${label} connection is not using TLS." >&2
    exit 1
  fi
}

check_supabase_project_ref admin "$AHA_STAGING_ADMIN_DATABASE_URL"
check_supabase_project_ref runtime "$AHA_STAGING_RUNTIME_DATABASE_URL"
check_ssl admin "$AHA_STAGING_ADMIN_DATABASE_URL"
check_ssl runtime "$AHA_STAGING_RUNTIME_DATABASE_URL"

admin_identity="$(readonly_psql "$AHA_STAGING_ADMIN_DATABASE_URL" -c "select current_database(), current_user, current_setting('server_version_num')")"
runtime_identity="$(readonly_psql "$AHA_STAGING_RUNTIME_DATABASE_URL" -c "select current_database(), current_user, current_setting('server_version_num')")"

IFS='|' read -r admin_database admin_user admin_version <<<"$admin_identity"
IFS='|' read -r runtime_database runtime_user runtime_version <<<"$runtime_identity"

if [[ "$admin_database" != "$runtime_database" ]]; then
  echo "Admin and runtime DSNs do not target the same database." >&2
  exit 1
fi
if [[ "$admin_user" == "$runtime_user" ]]; then
  echo "Admin and runtime DSNs must use separate database roles." >&2
  exit 1
fi
if [[ ! "$runtime_user" =~ ^[A-Za-z_][A-Za-z0-9_.\$-]*$ ]]; then
  echo "Hosted staging runtime role name is outside the allowed safety pattern." >&2
  exit 1
fi
if (( admin_version < 150000 || runtime_version < 150000 )); then
  echo "Hosted staging requires PostgreSQL 15 or newer." >&2
  exit 1
fi

runtime_safety="$(readonly_psql "$AHA_STAGING_RUNTIME_DATABASE_URL" -c "select rolsuper::int, rolbypassrls::int, rolcreatedb::int, rolcreaterole::int, rolinherit::int from pg_roles where rolname = current_user")"
IFS='|' read -r is_super bypass_rls create_db create_role inherit_role <<<"$runtime_safety"
if [[ "$is_super" != "0" || "$bypass_rls" != "0" || "$create_db" != "0" || "$create_role" != "0" || "$inherit_role" != "0" ]]; then
  echo "Hosted staging runtime role is over-privileged; require NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/NOINHERIT." >&2
  exit 1
fi

owned_canonical_tables="$(readonly_psql "$AHA_STAGING_RUNTIME_DATABASE_URL" -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='aha' and c.relkind in ('r','p') and pg_get_userbyid(c.relowner)=current_user")"
if [[ "$owned_canonical_tables" != "0" ]]; then
  echo "Hosted staging runtime role owns canonical AHA tables." >&2
  exit 1
fi

canonical_write_grants="$(readonly_psql "$AHA_STAGING_RUNTIME_DATABASE_URL" -c "select count(*) from information_schema.role_table_grants where grantee=current_user and table_schema='aha' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')")"
if [[ "$canonical_write_grants" != "0" ]]; then
  echo "Hosted staging runtime role has direct canonical write grants." >&2
  exit 1
fi

canonical_schema_present="$(readonly_psql "$AHA_STAGING_ADMIN_DATABASE_URL" -c "select (to_regclass('aha.schema_versions') is not null)::int")"
if [[ "$canonical_schema_present" == "1" ]]; then
  import_execute="$(readonly_psql "$AHA_STAGING_ADMIN_DATABASE_URL" -c "select has_function_privilege('${runtime_user}', 'aha.commit_local_import_v1(text,text,text,text,text,text,jsonb)', 'EXECUTE')::int")"
  helper_execute="$(readonly_psql "$AHA_STAGING_ADMIN_DATABASE_URL" -c "select has_function_privilege('${runtime_user}', 'aha.record_local_import_item_v1(text,text,text,text,text,text,text,text,text)', 'EXECUTE')::int")"
  if [[ "$import_execute" != "1" ]]; then
    echo "Canonical schema exists but runtime role lacks explicit import-command EXECUTE." >&2
    exit 1
  fi
  if [[ "$helper_execute" != "0" ]]; then
    echo "Runtime role must not execute the internal import helper directly." >&2
    exit 1
  fi
fi

# This script deliberately emits no DSN, hostname or username.
echo "AHA hosted PostgreSQL staging preflight: PASS (schema_present=${canonical_schema_present})"
