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
  apply|verify_restore|activate_pilot|verify_pilot_expansion|add_pilot_profile|deactivate_pilot) ;;
  *)
    echo "AHA_DB_INIT_MODE must be apply, verify_restore, activate_pilot, verify_pilot_expansion, add_pilot_profile or deactivate_pilot." >&2
    exit 1
    ;;
esac

require_env AHA_PRODUCTION_ADMIN_DATABASE_URL
require_env AHA_PRODUCTION_DATABASE_CA_CERT
if [ "$mode" = 'apply' ]; then
  require_env AHA_PRODUCTION_READINESS_PASSWORD
fi
if [ "$mode" = 'activate_pilot' ]; then
  require_env AHA_PRODUCTION_RUNTIME_PASSWORD
fi
case "$mode" in
  activate_pilot|verify_pilot_expansion|add_pilot_profile)
    require_env AHA_PRODUCTION_PILOT_PROFILE_ID
    ;;
esac

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
if [ "$mode" = 'verify_restore' ] || [ "$mode" = 'verify_pilot_expansion' ]; then
  export PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=60000 -c lock_timeout=5000'
else
  export PGOPTIONS='-c statement_timeout=60000 -c lock_timeout=5000'
fi

psql_safe() {
  psql "$AHA_PRODUCTION_ADMIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 "$@"
}

runtime_control_membership_shape() {
  psql_safe -A -t -q -c "
    select coalesce(
      string_agg(
        m.admin_option::int::text || '|' || m.inherit_option::int::text || '|' || m.set_option::int::text,
        ',' order by m.admin_option desc, m.inherit_option desc, m.set_option desc
      ),
      ''
    )
    from pg_auth_members m
    join pg_roles granted on granted.oid=m.roleid
    join pg_roles member on member.oid=m.member
    where granted.rolname='aha_canonical_production_runtime'
      and member.rolname=session_user
  "
}

verify_runtime_privileges() {
  expected_login="$1"
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

  if [ "$runtime_shape" != "${expected_login}|0|0|0|0|0" ]; then
    echo "Production runtime role failed its intrinsic privilege boundary." >&2
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
}

verify_canonical_state() {
  readiness_shape="$(psql_safe -A -t -q -c "
    select rolcanlogin::int || '|' || rolsuper::int || '|' || rolbypassrls::int || '|' ||
           rolcreatedb::int || '|' || rolcreaterole::int || '|' || rolinherit::int
    from pg_roles where rolname='aha_canonical_production_readiness'
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
  verify_runtime_privileges 0
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

validate_pilot_inputs() {
  if [ "${#AHA_PRODUCTION_PILOT_PROFILE_ID}" -ne 36 ] || ! printf '%s' "$AHA_PRODUCTION_PILOT_PROFILE_ID" | grep -Eq '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'; then
    echo "Production pilot profile id must be a UUID." >&2
    exit 1
  fi
  AHA_PRODUCTION_PILOT_PROFILE_ID="$(printf '%s' "$AHA_PRODUCTION_PILOT_PROFILE_ID" | tr '[:upper:]' '[:lower:]')"
  AHA_PRODUCTION_PILOT_WORKSPACE_ID="personal-${AHA_PRODUCTION_PILOT_PROFILE_ID}"
  export AHA_PRODUCTION_PILOT_PROFILE_ID AHA_PRODUCTION_PILOT_WORKSPACE_ID
}

pilot_fleet_shape() {
  psql_safe -A -t -q -c "
    select
      (select count(*) from aha.profiles where status='active' and deleted_at is null)::text || '|' ||
      (select count(*) from aha.workspaces where status='active' and deleted_at is null)::text || '|' ||
      (select count(*) from aha.profiles p
         where p.status='active' and p.deleted_at is null
           and not (p.auth_provider='supabase' and p.auth_subject=p.id))::text || '|' ||
      (select count(*) from aha.workspaces w
         where w.status='active' and w.deleted_at is null
           and not (
             w.id='personal-' || w.owner_profile_id
             and w.workspace_type='personal'
             and w.visibility='private'
             and exists (
               select 1 from aha.profiles p
               where p.id=w.owner_profile_id
                 and p.status='active'
                 and p.deleted_at is null
             )
           ))::text
  "
}

verify_pilot_fleet() {
  minimum_profiles="$1"
  maximum_profiles="$2"
  shape="$(pilot_fleet_shape)"
  profiles="$(printf '%s' "$shape" | cut -d'|' -f1)"
  workspaces="$(printf '%s' "$shape" | cut -d'|' -f2)"
  bad_profiles="$(printf '%s' "$shape" | cut -d'|' -f3)"
  bad_workspaces="$(printf '%s' "$shape" | cut -d'|' -f4)"

  case "$profiles|$workspaces|$bad_profiles|$bad_workspaces" in
    *[!0-9\|]*|'')
      echo "Production pilot fleet verification returned an unexpected shape." >&2
      exit 1
      ;;
  esac
  if [ "$profiles" -lt "$minimum_profiles" ] || [ "$profiles" -gt "$maximum_profiles" ]; then
    echo "Production pilot fleet is outside the allowed profile-count boundary." >&2
    exit 1
  fi
  if [ "$workspaces" != "$profiles" ] || [ "$bad_profiles" != '0' ] || [ "$bad_workspaces" != '0' ]; then
    echo "Production pilot fleet identity/workspace isolation shape is invalid." >&2
    exit 1
  fi
  printf '%s' "$profiles"
}

activate_pilot() {
  validate_pilot_inputs

  psql_safe \
    -v pilot_profile_id="$AHA_PRODUCTION_PILOT_PROFILE_ID" \
    -v pilot_workspace_id="$AHA_PRODUCTION_PILOT_WORKSPACE_ID" \
    -v runtime_password="$AHA_PRODUCTION_RUNTIME_PASSWORD" <<'SQL'
begin;

select set_config('aha.activation.pilot_profile_id', :'pilot_profile_id', false);
select set_config('aha.activation.pilot_workspace_id', :'pilot_workspace_id', false);

do $pilot$
declare
  pilot_profile_id text := current_setting('aha.activation.pilot_profile_id');
  pilot_workspace_id text := current_setting('aha.activation.pilot_workspace_id');
begin
  if exists (
    select 1 from aha.profiles
    where deleted_at is null and id <> pilot_profile_id
  ) then
    raise exception using errcode='42501', message='production pilot activation refuses additional canonical profiles';
  end if;

  if exists (
    select 1 from aha.profiles
    where id = pilot_profile_id
      and not (
        auth_provider = 'supabase'
        and auth_subject = pilot_profile_id
        and status = 'active'
        and deleted_at is null
      )
  ) then
    raise exception using errcode='42501', message='production pilot profile identity does not match the protected auth subject';
  end if;

  if not exists (select 1 from aha.profiles where id = pilot_profile_id) then
    insert into aha.profiles(id, auth_provider, auth_subject, display_name, status, metadata)
    values(
      pilot_profile_id,
      'supabase',
      pilot_profile_id,
      'AHA production pilot',
      'active',
      jsonb_build_object('pilot', 'aha_canonical_production_pilot_v1')
    );
  end if;

  if exists (
    select 1 from aha.workspaces
    where deleted_at is null and id <> pilot_workspace_id
  ) then
    raise exception using errcode='42501', message='production pilot activation refuses additional canonical workspaces';
  end if;

  if exists (
    select 1 from aha.workspaces
    where id = pilot_workspace_id
      and not (
        owner_profile_id = pilot_profile_id
        and workspace_type = 'personal'
        and visibility = 'private'
        and status = 'active'
        and deleted_at is null
      )
  ) then
    raise exception using errcode='42501', message='production pilot workspace does not match the protected pilot profile';
  end if;

  if not exists (select 1 from aha.workspaces where id = pilot_workspace_id) then
    insert into aha.workspaces(id, owner_profile_id, workspace_type, name, visibility, status, metadata)
    values(
      pilot_workspace_id,
      pilot_profile_id,
      'personal',
      'AHA production pilot',
      'private',
      'active',
      jsonb_build_object('pilot', 'aha_canonical_production_pilot_v1')
    );
  end if;
end
$pilot$;

alter role aha_canonical_production_runtime
  login noinherit
  password :'runtime_password';
alter role aha_canonical_production_runtime set row_security = on;

commit;
SQL

  verify_runtime_privileges 1
  pilot_shape="$(psql_safe \
    -v pilot_profile_id="$AHA_PRODUCTION_PILOT_PROFILE_ID" \
    -v pilot_workspace_id="$AHA_PRODUCTION_PILOT_WORKSPACE_ID" \
    -A -t -q <<'SQL'
select
  (select count(*) from aha.profiles where deleted_at is null)::text || '|' ||
  (select count(*) from aha.profiles
     where id=:'pilot_profile_id'
       and auth_provider='supabase'
       and auth_subject=:'pilot_profile_id'
       and status='active'
       and deleted_at is null)::text || '|' ||
  (select count(*) from aha.workspaces where deleted_at is null)::text || '|' ||
  (select count(*) from aha.workspaces
     where id=:'pilot_workspace_id'
       and owner_profile_id=:'pilot_profile_id'
       and workspace_type='personal'
       and visibility='private'
       and status='active'
       and deleted_at is null)::text;
SQL
  )"
  if [ "$pilot_shape" != '1|1|1|1' ]; then
    echo "Production pilot identity/workspace boundary failed after activation." >&2
    exit 1
  fi

  echo 'AHA production pilot database activation: LOGIN_READY_ONE_PROFILE'
}

verify_pilot_expansion() {
  validate_pilot_inputs
  verify_runtime_privileges 1
  current_profiles="$(verify_pilot_fleet 1 9)"

  target_shape="$(psql_safe \
    -v pilot_profile_id="$AHA_PRODUCTION_PILOT_PROFILE_ID" \
    -v pilot_workspace_id="$AHA_PRODUCTION_PILOT_WORKSPACE_ID" \
    -A -t -q <<'SQL'
select
  (select count(*) from aha.profiles where id=:'pilot_profile_id')::text || '|' ||
  (select count(*) from aha.workspaces where id=:'pilot_workspace_id')::text;
SQL
  )"
  if [ "$target_shape" != '0|0' ]; then
    echo "Production pilot expansion candidate already exists in canonical production." >&2
    exit 1
  fi

  printf 'AHA production pilot expansion readiness: READY_ADD_ONE_PROFILE current_profiles=%s\n' "$current_profiles"
}

add_pilot_profile() {
  validate_pilot_inputs
  verify_runtime_privileges 1
  current_profiles="$(verify_pilot_fleet 1 10)"

  target_shape="$(psql_safe \
    -v pilot_profile_id="$AHA_PRODUCTION_PILOT_PROFILE_ID" \
    -v pilot_workspace_id="$AHA_PRODUCTION_PILOT_WORKSPACE_ID" \
    -A -t -q <<'SQL'
select
  (select count(*) from aha.profiles
    where id=:'pilot_profile_id'
      and auth_provider='supabase'
      and auth_subject=:'pilot_profile_id'
      and status='active'
      and deleted_at is null)::text || '|' ||
  (select count(*) from aha.workspaces
    where id=:'pilot_workspace_id'
      and owner_profile_id=:'pilot_profile_id'
      and workspace_type='personal'
      and visibility='private'
      and status='active'
      and deleted_at is null)::text || '|' ||
  (select count(*) from aha.profiles where id=:'pilot_profile_id')::text || '|' ||
  (select count(*) from aha.workspaces where id=:'pilot_workspace_id')::text;
SQL
  )"

  if [ "$target_shape" = '1|1|1|1' ]; then
    echo 'AHA production pilot expansion: PROFILE_ALREADY_PRESENT_IDEMPOTENT'
    return 0
  fi
  if [ "$target_shape" != '0|0|0|0' ]; then
    echo "Production pilot expansion candidate conflicts with an existing identity/workspace." >&2
    exit 1
  fi
  if [ "$current_profiles" -ge 10 ]; then
    echo "Production pilot expansion refuses more than 10 active profiles." >&2
    exit 1
  fi

  psql_safe \
    -v pilot_profile_id="$AHA_PRODUCTION_PILOT_PROFILE_ID" \
    -v pilot_workspace_id="$AHA_PRODUCTION_PILOT_WORKSPACE_ID" <<'SQL'
begin;
insert into aha.profiles(id, auth_provider, auth_subject, display_name, status, metadata)
values(
  :'pilot_profile_id',
  'supabase',
  :'pilot_profile_id',
  'AHA production pilot',
  'active',
  jsonb_build_object('pilot', 'aha_canonical_production_pilot_expansion_v1')
);
insert into aha.workspaces(id, owner_profile_id, workspace_type, name, visibility, status, metadata)
values(
  :'pilot_workspace_id',
  :'pilot_profile_id',
  'personal',
  'AHA production pilot',
  'private',
  'active',
  jsonb_build_object('pilot', 'aha_canonical_production_pilot_expansion_v1')
);
commit;
SQL

  verify_runtime_privileges 1
  expanded_profiles="$(verify_pilot_fleet 2 10)"
  echo "AHA production pilot expansion: ADDED_PROFILE_NO_RUNTIME_CREDENTIAL_CHANGE active_profiles=${expanded_profiles}"
}

deactivate_pilot() {
  control_membership_baseline="$(runtime_control_membership_shape)"
  if [ -z "$control_membership_baseline" ]; then
    echo "Production pilot cutoff requires an existing control-plane ADMIN membership for the runtime role." >&2
    exit 1
  fi

  # Cut new access first in its own committed command. If later termination fails,
  # the runtime role remains NOLOGIN and cannot create new sessions.
  psql_safe -q -c "alter role aha_canonical_production_runtime nologin noinherit password null;"

  # PostgreSQL 16 automatically grants the CREATEROLE creator an ADMIN TRUE,
  # INHERIT FALSE, SET FALSE membership that the creator itself cannot remove.
  # Use ADMIN OPTION to add a temporary SET TRUE grant, become the runtime role
  # only while signalling its backends, then revoke that temporary grant. The
  # permanent creator membership must return exactly to its pre-cutoff shape.
  psql_safe -q <<'SQL'
begin;
grant aha_canonical_production_runtime to current_user with inherit false, set true;
set role aha_canonical_production_runtime;
select pg_terminate_backend(pid, 5000)
from pg_stat_activity
where usename='aha_canonical_production_runtime'
  and pid <> pg_backend_pid();
reset role;
revoke aha_canonical_production_runtime from current_user;
commit;
SQL

  verify_runtime_privileges 0
  active_connections="$(psql_safe -A -t -q -c "select count(*) from pg_stat_activity where usename='aha_canonical_production_runtime' and pid <> pg_backend_pid()")"
  if [ "$active_connections" != '0' ]; then
    echo "Production pilot database cutoff left active runtime sessions." >&2
    exit 1
  fi

  control_membership_after="$(runtime_control_membership_shape)"
  if [ "$control_membership_after" != "$control_membership_baseline" ]; then
    echo "Production pilot cutoff changed the control-plane runtime membership baseline." >&2
    exit 1
  fi

  echo 'AHA production pilot database activation: CUT_OFF_NOLOGIN_ZERO_SESSIONS_BASELINE_MEMBERSHIP_RESTORED'
}

if [ "$mode" = 'verify_restore' ]; then
  verify_canonical_state
  echo 'AHA production restore verification: PASS_READ_ONLY_VERIFY_FULL'
  echo 'AHA production sync runtime role: NOLOGIN_EXACT_THREE_ROUTINES'
  echo 'AHA production canonical sync activation: DISABLED'
  exit 0
fi

if [ "$mode" = 'activate_pilot' ]; then
  activate_pilot
  exit 0
fi

if [ "$mode" = 'verify_pilot_expansion' ]; then
  verify_pilot_expansion
  exit 0
fi

if [ "$mode" = 'add_pilot_profile' ]; then
  add_pilot_profile
  exit 0
fi

if [ "$mode" = 'deactivate_pilot' ]; then
  deactivate_pilot
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
