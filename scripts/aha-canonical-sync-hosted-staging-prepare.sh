#!/usr/bin/env bash
set -euo pipefail

CONFIRMATION='RUN_AHA_CANONICAL_SYNC_HOSTED_STAGING_REHEARSAL'
FIXTURE_PROFILE_ID='aha-staging-sync-e2e-profile-v1'
FIXTURE_WORKSPACE_ID='aha-staging-sync-e2e-workspace-v1'
FIXTURE_MARKER='aha_canonical_sync_hosted_staging_rehearsal_v1'

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required hosted canonical-sync staging setting: ${name}" >&2
    exit 1
  fi
}

for name in \
  AHA_STAGING_ADMIN_DATABASE_URL \
  AHA_STAGING_RUNTIME_DATABASE_URL \
  AHA_STAGING_PROJECT_REF \
  AHA_STAGING_SYNC_BEARER_TOKEN \
  AHA_CANONICAL_SYNC_HOSTED_STAGING_CONFIRMATION
  do require_env "$name"
done

if [[ "$AHA_CANONICAL_SYNC_HOSTED_STAGING_CONFIRMATION" != "$CONFIRMATION" ]]; then
  echo "Hosted canonical-sync staging rehearsal requires the exact confirmation token." >&2
  exit 1
fi
if [[ ! "$AHA_STAGING_PROJECT_REF" =~ ^[a-z0-9]{20}$ ]]; then
  echo "Hosted canonical-sync staging rehearsal requires a pinned Supabase project ref." >&2
  exit 1
fi

check_project_ref() {
  local label="$1"
  local dsn="$2"
  if ! AHA_DSN_TO_CHECK="$dsn" AHA_PROJECT_REF_TO_CHECK="$AHA_STAGING_PROJECT_REF" python3 - <<'PY'
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
    echo "${label} DSN does not identify the pinned AHA staging project." >&2
    exit 1
  fi
}

readonly_psql() {
  local dsn="$1"
  shift
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=8000 -c lock_timeout=2000' \
    psql "$dsn" -X -v ON_ERROR_STOP=1 -A -t -q "$@"
}

admin_psql() {
  PGOPTIONS='-c statement_timeout=8000 -c lock_timeout=2000' \
    psql "$AHA_STAGING_ADMIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 -A -t -q "$@"
}

check_project_ref admin "$AHA_STAGING_ADMIN_DATABASE_URL"
check_project_ref runtime "$AHA_STAGING_RUNTIME_DATABASE_URL"

runtime_user="$(readonly_psql "$AHA_STAGING_RUNTIME_DATABASE_URL" -c 'select current_user')"
if [[ ! "$runtime_user" =~ ^[A-Za-z_][A-Za-z0-9_.\$-]*$ ]]; then
  echo "Hosted staging runtime role name is outside the allowed safety pattern." >&2
  exit 1
fi

runtime_safety="$(readonly_psql "$AHA_STAGING_RUNTIME_DATABASE_URL" -c "select rolsuper::int, rolbypassrls::int, rolcreatedb::int, rolcreaterole::int, rolinherit::int from pg_roles where rolname=current_user")"
IFS='|' read -r is_super bypass_rls create_db create_role inherit_role <<<"$runtime_safety"
if [[ "$is_super" != "0" || "$bypass_rls" != "0" || "$create_db" != "0" || "$create_role" != "0" || "$inherit_role" != "0" ]]; then
  echo "Hosted staging runtime role is over-privileged." >&2
  exit 1
fi

canonical_write_grants="$(readonly_psql "$AHA_STAGING_RUNTIME_DATABASE_URL" -c "select count(*) from information_schema.role_table_grants where grantee=current_user and table_schema='aha' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')")"
if [[ "$canonical_write_grants" != "0" ]]; then
  echo "Hosted staging runtime role has direct canonical table-write grants." >&2
  exit 1
fi

schema_usage="$(readonly_psql "$AHA_STAGING_ADMIN_DATABASE_URL" -c "select has_schema_privilege('${runtime_user}', 'aha', 'USAGE')::int")"
if [[ "$schema_usage" != "1" ]]; then
  echo "Hosted staging runtime role lacks the already-required aha schema USAGE privilege." >&2
  exit 1
fi

for fn in \
  "aha.bootstrap_sync_snapshot_v1(text,text,bigint,integer)" \
  "aha.pull_sync_changes_v1(text,bigint,integer)" \
  "aha.push_sync_change_v1(text,text,text,text,text,text,bigint,text,jsonb)"
  do
    admin_psql -c "grant execute on function ${fn} to \"${runtime_user}\";" >/dev/null
  done

# Internal helpers remain unavailable to the runtime role. SECURITY DEFINER top-level
# commands may invoke them, but the role must never call them directly.
for helper in \
  "aha.sync_object_snapshot_v1(text,text,text)" \
  "aha.record_sync_conflict_v1(text,text,text,text,text,text,bigint,bigint,text,text,text,text,jsonb)" \
  "aha.sync_apply_upsert_v1(text,text,text,text,jsonb,boolean)" \
  "aha.sync_apply_delete_v1(text,text,text)"
  do
    helper_execute="$(readonly_psql "$AHA_STAGING_ADMIN_DATABASE_URL" -c "select has_function_privilege('${runtime_user}', '${helper}', 'EXECUTE')::int")"
    if [[ "$helper_execute" != "0" ]]; then
      echo "Hosted staging runtime role may not execute internal canonical-sync helper ${helper%%(*}." >&2
      exit 1
    fi
  done

for fn in \
  "aha.bootstrap_sync_snapshot_v1(text,text,bigint,integer)" \
  "aha.pull_sync_changes_v1(text,bigint,integer)" \
  "aha.push_sync_change_v1(text,text,text,text,text,text,bigint,text,jsonb)"
  do
    top_execute="$(readonly_psql "$AHA_STAGING_ADMIN_DATABASE_URL" -c "select has_function_privilege('${runtime_user}', '${fn}', 'EXECUTE')::int")"
    if [[ "$top_execute" != "1" ]]; then
      echo "Hosted staging runtime role did not receive the expected top-level sync EXECUTE grant." >&2
      exit 1
    fi
  done

# Decode only the immutable JWT subject needed to bind the dedicated staging fixture.
# The bearer token itself is never printed or persisted.
auth_subject="$(AHA_TOKEN="$AHA_STAGING_SYNC_BEARER_TOKEN" node <<'NODE'
const token = String(process.env.AHA_TOKEN || '');
const parts = token.split('.');
if (parts.length !== 3) process.exit(2);
try {
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  const sub = String(payload.sub || '').trim();
  if (!sub || sub.length > 512 || /[\r\n]/.test(sub)) process.exit(3);
  process.stdout.write(sub);
} catch {
  process.exit(4);
}
NODE
)" || {
  echo "Staging bearer token does not contain a usable JWT subject." >&2
  exit 1
}

subject_profile="$(admin_psql -v auth_subject="$auth_subject" -c "select coalesce((select id from aha.profiles where auth_provider='supabase' and auth_subject=:'auth_subject' limit 1),'')")"
if [[ -n "$subject_profile" && "$subject_profile" != "$FIXTURE_PROFILE_ID" ]]; then
  echo "Staging bearer token is already bound to a non-fixture canonical profile; refusing rehearsal." >&2
  exit 1
fi

fixture_subject="$(admin_psql -c "select coalesce((select auth_subject from aha.profiles where id='${FIXTURE_PROFILE_ID}' limit 1),'')")"
if [[ -n "$fixture_subject" && "$fixture_subject" != "$auth_subject" ]]; then
  echo "Dedicated staging fixture profile is bound to a different auth subject; refusing rehearsal." >&2
  exit 1
fi

if [[ -z "$subject_profile" ]]; then
  admin_psql -v auth_subject="$auth_subject" -c "
    insert into aha.profiles(id,auth_provider,auth_subject,display_name,status,metadata)
    values(
      '${FIXTURE_PROFILE_ID}',
      'supabase',
      :'auth_subject',
      'AHA canonical sync hosted staging rehearsal',
      'active',
      jsonb_build_object('fixture','${FIXTURE_MARKER}')
    );
  " >/dev/null
fi

profile_ok="$(admin_psql -v auth_subject="$auth_subject" -c "
  select (
    exists(
      select 1 from aha.profiles
      where id='${FIXTURE_PROFILE_ID}'
        and auth_provider='supabase'
        and auth_subject=:'auth_subject'
        and status='active'
        and deleted_at is null
        and metadata->>'fixture'='${FIXTURE_MARKER}'
    )
  )::int;
")"
if [[ "$profile_ok" != "1" ]]; then
  echo "Dedicated staging fixture profile failed its identity/scope check." >&2
  exit 1
fi

workspace_owner="$(admin_psql -c "select coalesce((select owner_profile_id from aha.workspaces where id='${FIXTURE_WORKSPACE_ID}' limit 1),'')")"
if [[ -n "$workspace_owner" && "$workspace_owner" != "$FIXTURE_PROFILE_ID" ]]; then
  echo "Dedicated staging fixture workspace belongs to another profile; refusing rehearsal." >&2
  exit 1
fi

if [[ -z "$workspace_owner" ]]; then
  admin_psql -c "
    insert into aha.workspaces(id,owner_profile_id,workspace_type,name,visibility,status,metadata)
    values(
      '${FIXTURE_WORKSPACE_ID}',
      '${FIXTURE_PROFILE_ID}',
      'personal',
      'AHA canonical sync hosted staging rehearsal',
      'private',
      'active',
      jsonb_build_object('fixture','${FIXTURE_MARKER}')
    );
  " >/dev/null
fi

workspace_ok="$(admin_psql -c "
  select (
    exists(
      select 1 from aha.workspaces
      where id='${FIXTURE_WORKSPACE_ID}'
        and owner_profile_id='${FIXTURE_PROFILE_ID}'
        and workspace_type='personal'
        and visibility='private'
        and status='active'
        and deleted_at is null
        and metadata->>'fixture'='${FIXTURE_MARKER}'
    )
  )::int;
")"
if [[ "$workspace_ok" != "1" ]]; then
  echo "Dedicated staging fixture workspace failed its ownership/scope check." >&2
  exit 1
fi

# Re-check the invariant after grants/fixture preparation.
canonical_write_grants_after="$(readonly_psql "$AHA_STAGING_RUNTIME_DATABASE_URL" -c "select count(*) from information_schema.role_table_grants where grantee=current_user and table_schema='aha' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')")"
if [[ "$canonical_write_grants_after" != "0" ]]; then
  echo "Runtime role acquired a forbidden canonical table-write grant." >&2
  exit 1
fi

# Deliberately emit no DSN, role name, auth subject or bearer token.
echo "AHA canonical sync hosted staging prepare: PASS (fixture=${FIXTURE_WORKSPACE_ID})"
