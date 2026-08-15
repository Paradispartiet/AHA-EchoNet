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
GRANT EXECUTE ON FUNCTION aha.bootstrap_sync_snapshot_v1(text,text,bigint,integer) TO aha_runtime_rehearsal;
GRANT EXECUTE ON FUNCTION aha.pull_sync_changes_v1(text,bigint,integer) TO aha_runtime_rehearsal;
GRANT EXECUTE ON FUNCTION aha.push_sync_change_v1(text,text,text,text,text,text,bigint,text,jsonb) TO aha_runtime_rehearsal;

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
     OR has_table_privilege('aha_runtime_rehearsal', 'aha.conversations', 'DELETE')
     OR has_table_privilege('aha_runtime_rehearsal', 'aha.sync_changes', 'INSERT')
     OR has_table_privilege('aha_runtime_rehearsal', 'aha.sync_conflicts', 'SELECT')
     OR has_table_privilege('aha_runtime_rehearsal', 'aha.idempotency_keys', 'SELECT') THEN
    RAISE EXCEPTION 'runtime rehearsal role has direct canonical/governance table privilege';
  END IF;

  IF NOT has_function_privilege('aha_runtime_rehearsal', 'aha.commit_local_import_v1(text,text,text,text,text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'runtime rehearsal role cannot execute the explicit import command';
  END IF;

  IF NOT has_function_privilege('aha_runtime_rehearsal', 'aha.bootstrap_sync_snapshot_v1(text,text,bigint,integer)', 'EXECUTE')
     OR NOT has_function_privilege('aha_runtime_rehearsal', 'aha.pull_sync_changes_v1(text,bigint,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'runtime rehearsal role cannot execute the narrow sync read boundary';
  END IF;

  IF NOT has_function_privilege('aha_runtime_rehearsal', 'aha.push_sync_change_v1(text,text,text,text,text,text,bigint,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'runtime rehearsal role cannot execute the explicit sync push command';
  END IF;

  IF has_function_privilege('aha_runtime_rehearsal', 'aha.record_local_import_item_v1(text,text,text,text,text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('aha_runtime_rehearsal', 'aha.sync_object_snapshot_v1(text,text,text)', 'EXECUTE')
     OR has_function_privilege('aha_runtime_rehearsal', 'aha.sync_lock_object_state_v1(text,text,text)', 'EXECUTE')
     OR has_function_privilege('aha_runtime_rehearsal', 'aha.assert_sync_private_scope_v1(text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('aha_runtime_rehearsal', 'aha.assert_sync_upsert_payload_v1(text,text,bigint,jsonb)', 'EXECUTE')
     OR has_function_privilege('aha_runtime_rehearsal', 'aha.sync_server_payload_hash_v1(text,text,text)', 'EXECUTE')
     OR has_function_privilege('aha_runtime_rehearsal', 'aha.sync_apply_upsert_v1(text,text,text,text,jsonb,boolean)', 'EXECUTE')
     OR has_function_privilege('aha_runtime_rehearsal', 'aha.sync_apply_delete_v1(text,text,text)', 'EXECUTE')
     OR has_function_privilege('aha_runtime_rehearsal', 'aha.record_sync_conflict_v1(text,text,text,text,text,text,bigint,bigint,text,text,text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'runtime rehearsal role can execute an internal import/sync helper directly';
  END IF;
END
$do$;
SQL

PGPASSWORD="$AHA_RUNTIME_PASSWORD" \
  psql -X -v ON_ERROR_STOP=1 \
  -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -U aha_runtime_rehearsal \
  -f supabase/tests/aha_postgresql_staging_rehearsal_v1.sql

PGPASSWORD="$AHA_RUNTIME_PASSWORD" \
  psql -X -v ON_ERROR_STOP=1 \
  -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -U aha_runtime_rehearsal \
  -f supabase/tests/aha_postgresql_sync_push_rehearsal_v1.sql

PGPASSWORD="$AHA_RUNTIME_PASSWORD" \
  psql -X -v ON_ERROR_STOP=1 \
  -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -U aha_runtime_rehearsal \
  -f supabase/tests/aha_postgresql_sync_scope_rehearsal_v1.sql

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
  IF n <> 2 THEN RAISE EXCEPTION 'conversation import parity failed'; END IF;

  SELECT count(*) INTO n FROM aha.messages WHERE id IN ('message_a', 'collision_message');
  IF n <> 2 THEN RAISE EXCEPTION 'message import parity failed'; END IF;

  IF (SELECT content FROM aha.messages WHERE id='message_a') <> 'Tillatt importinnhold A' THEN
    RAISE EXCEPTION 'imported message content changed';
  END IF;

  IF EXISTS (SELECT 1 FROM aha.conversations WHERE id='should_not_survive_collision') THEN
    RAISE EXCEPTION 'cross-tenant import collision left partial data';
  END IF;

  SELECT count(*) INTO n FROM aha.sync_changes;
  IF n <> 15 THEN RAISE EXCEPTION 'expected 15 canonical sync journal rows, got %', n; END IF;

  SELECT count(*) INTO n FROM aha.sync_conflicts;
  IF n <> 2 THEN RAISE EXCEPTION 'expected 2 explicit canonical sync conflicts, got %', n; END IF;

  SELECT count(*) INTO n FROM aha.idempotency_keys WHERE scope='canonical_sync_push_v1';
  IF n <> 18 THEN RAISE EXCEPTION 'expected 18 sync idempotency records, got %', n; END IF;

  IF (SELECT revision FROM aha.conversations WHERE id='sync_conv') <> 3
     OR (SELECT status FROM aha.conversations WHERE id='sync_conv') <> 'deleted'
     OR (SELECT deleted_at FROM aha.conversations WHERE id='sync_conv') IS NULL THEN
    RAISE EXCEPTION 'conversation tombstone/revision parity failed';
  END IF;

  SELECT count(*) INTO n FROM aha.insight_versions WHERE insight_id='sync_ins';
  IF n <> 2 OR (SELECT current_version FROM aha.insights WHERE id='sync_ins') <> 2 OR (SELECT revision FROM aha.insights WHERE id='sync_ins') <> 2 THEN
    RAISE EXCEPTION 'insight append-only version/revision parity failed';
  END IF;

  SELECT count(*) INTO n FROM aha.article_versions WHERE article_id='sync_art';
  IF n <> 2 OR (SELECT current_version FROM aha.articles WHERE id='sync_art') <> 2 OR (SELECT revision FROM aha.articles WHERE id='sync_art') <> 2 THEN
    RAISE EXCEPTION 'article append-only version/revision parity failed';
  END IF;

  IF (SELECT revision FROM aha.article_references WHERE id='sync_ref') <> 2 THEN
    RAISE EXCEPTION 'article_reference bump_revision trigger parity failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM aha.sync_changes
    WHERE object_type NOT IN(
      'conversation','message','source_event','insight','concept_list','concept_list_item',
      'knowledge_path','knowledge_path_step','article','article_reference'
    )
  ) THEN
    RAISE EXCEPTION 'sync journal contains a non-canonical object type';
  END IF;
END
$do$;
SQL

echo "AHA PostgreSQL staging rehearsal: PASS"
