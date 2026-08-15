#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGDATABASE:=aha_rehearsal}"
: "${PGUSER:=postgres}"
: "${PGPASSWORD:=postgres}"
: "${AHA_RUNTIME_PASSWORD:=aha-runtime-rehearsal-only}"

export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD

admin_psql() {
  psql -X -v ON_ERROR_STOP=1 "$@"
}

mapfile -t migrations < <(find supabase/migrations -maxdepth 1 -type f -name '20*.sql' | sort)
if (( ${#migrations[@]} < 9 )); then
  echo "Expected at least 9 canonical migrations, found ${#migrations[@]}" >&2
  exit 1
fi

for migration in "${migrations[@]}"; do
  echo "Applying ${migration}"
  admin_psql -f "$migration"
done

admin_psql -v runtime_password="$AHA_RUNTIME_PASSWORD" <<'SQL'
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aha_runtime_rehearsal') THEN
    DROP ROLE aha_runtime_rehearsal;
  END IF;
END
$do$;

CREATE ROLE aha_runtime_rehearsal
  LOGIN
  PASSWORD :'runtime_password'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOBYPASSRLS;

INSERT INTO aha.profiles (id, auth_provider, auth_subject, display_name)
VALUES
  ('profile_a', 'supabase', 'rehearsal-user-a', 'Rehearsal A'),
  ('profile_b', 'supabase', 'rehearsal-user-b', 'Rehearsal B');

INSERT INTO aha.workspaces (id, owner_profile_id, workspace_type, name, visibility, status)
VALUES
  ('workspace_a', 'profile_a', 'personal', 'A', 'private', 'active'),
  ('workspace_b', 'profile_b', 'personal', 'B', 'private', 'active');

INSERT INTO aha.workspace_memberships (id, workspace_id, profile_id, role_id, status)
VALUES
  ('membership_a', 'workspace_a', 'profile_a', 'owner', 'active'),
  ('membership_b', 'workspace_b', 'profile_b', 'owner', 'active');

GRANT USAGE ON SCHEMA aha TO aha_runtime_rehearsal;
GRANT SELECT ON aha.profiles, aha.workspaces TO aha_runtime_rehearsal;
GRANT EXECUTE ON FUNCTION aha.current_profile_id() TO aha_runtime_rehearsal;
GRANT EXECUTE ON FUNCTION aha.can_read_workspace(text) TO aha_runtime_rehearsal;
GRANT EXECUTE ON FUNCTION aha.commit_local_import_v1(text,text,text,text,text,text,jsonb) TO aha_runtime_rehearsal;

DO $do$
DECLARE
  role_row record;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
    INTO role_row
  FROM pg_roles
  WHERE rolname = 'aha_runtime_rehearsal';

  IF role_row.rolsuper OR role_row.rolbypassrls OR role_row.rolcreatedb OR role_row.rolcreaterole THEN
    RAISE EXCEPTION 'runtime rehearsal role is over-privileged';
  END IF;

  IF pg_has_role('aha_runtime_rehearsal', pg_get_userbyid((SELECT relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='aha' AND c.relname='profiles')), 'member') THEN
    RAISE EXCEPTION 'runtime rehearsal role can assume canonical table owner';
  END IF;

  IF has_table_privilege('aha_runtime_rehearsal', 'aha.profiles', 'INSERT')
     OR has_table_privilege('aha_runtime_rehearsal', 'aha.workspaces', 'UPDATE')
     OR has_table_privilege('aha_runtime_rehearsal', 'aha.conversations', 'DELETE') THEN
    RAISE EXCEPTION 'runtime rehearsal role has direct canonical write privilege';
  END IF;

  IF NOT has_function_privilege('aha_runtime_rehearsal', 'aha.commit_local_import_v1(text,text,text,text,text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'runtime rehearsal role cannot execute the explicit import command';
  END IF;

  IF has_function_privilege('aha_runtime_rehearsal', 'aha.record_local_import_item_v1(text,text,text,text,text,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'runtime rehearsal role can execute internal import helper directly';
  END IF;
END
$do$;
SQL

PGPASSWORD="$AHA_RUNTIME_PASSWORD" \
  psql -X -v ON_ERROR_STOP=1 \
  -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -U aha_runtime_rehearsal \
  -f supabase/tests/aha_postgresql_staging_rehearsal_v1.sql

admin_psql <<'SQL'
DO $do$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM aha.import_batches;
  IF n <> 2 THEN RAISE EXCEPTION 'expected 2 committed import batches, got %', n; END IF;

  SELECT count(*) INTO n FROM aha.consent_receipts WHERE purpose = 'account_import' AND status = 'granted';
  IF n <> 2 THEN RAISE EXCEPTION 'expected 2 exact account-import consents, got %', n; END IF;

  SELECT count(*) INTO n FROM aha.import_items;
  IF n <> 4 THEN RAISE EXCEPTION 'expected 4 object receipts, got %', n; END IF;

  SELECT count(*) INTO n FROM aha.conversations WHERE id IN ('conversation_a', 'collision_conversation');
  IF n <> 2 THEN RAISE EXCEPTION 'conversation parity failed'; END IF;

  SELECT count(*) INTO n FROM aha.messages WHERE id IN ('message_a', 'collision_message');
  IF n <> 2 THEN RAISE EXCEPTION 'message parity failed'; END IF;

  IF (SELECT content FROM aha.messages WHERE id='message_a') <> 'Tillatt importinnhold A' THEN
    RAISE EXCEPTION 'imported message content changed';
  END IF;

  IF EXISTS (SELECT 1 FROM aha.conversations WHERE id='should_not_survive_collision') THEN
    RAISE EXCEPTION 'cross-tenant collision left partial data';
  END IF;
END
$do$;
SQL

echo "AHA PostgreSQL staging rehearsal: PASS"
