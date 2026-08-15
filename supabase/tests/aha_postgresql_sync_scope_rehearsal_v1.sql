\set ON_ERROR_STOP on

SET row_security = on;

BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"rehearsal-user-a","aha_provider":"supabase"}',
  true
);

DO $do$
DECLARE
  group_blocked boolean := false;
  shared_list_blocked boolean := false;
  public_article_blocked boolean := false;
  local_only_blocked boolean := false;
  deleted_at_blocked boolean := false;
BEGIN
  BEGIN
    PERFORM aha.push_sync_change_v1(
      'workspace_a','device-a','scope-group-001','conversation','scope_group','upsert',0,repeat('a',64),
      '{"id":"scope_group","conversation_type":"group","title":"Must stay blocked","status":"active","source_app":"aha_chat","metadata":{}}'::jsonb
    );
  EXCEPTION WHEN invalid_parameter_value OR insufficient_privilege THEN
    group_blocked:=true;
  END;
  IF NOT group_blocked THEN RAISE EXCEPTION 'group conversation entered personal sync v1'; END IF;

  BEGIN
    PERFORM aha.push_sync_change_v1(
      'workspace_a','device-a','scope-list-0001','concept_list','scope_list','upsert',0,repeat('b',64),
      '{"id":"scope_list","title":"Must stay private","list_type":"concepts","source":"aha_lists","sharing_scope":"workspace","tags":[],"metadata":{}}'::jsonb
    );
  EXCEPTION WHEN invalid_parameter_value OR insufficient_privilege THEN
    shared_list_blocked:=true;
  END;
  IF NOT shared_list_blocked THEN RAISE EXCEPTION 'workspace-shared list entered personal sync v1'; END IF;

  BEGIN
    PERFORM aha.push_sync_change_v1(
      'workspace_a','device-a','scope-article1','article','scope_article','upsert',0,repeat('c',64),
      '{"id":"scope_article","section":"aha","status":"draft","publication_scope":"public","source":"aha_avisa","tags":[],"metadata":{},"version":{"title":"Must stay private","summary":"blocked","body":"blocked","provenance":{}}}'::jsonb
    );
  EXCEPTION WHEN invalid_parameter_value OR insufficient_privilege THEN
    public_article_blocked:=true;
  END;
  IF NOT public_article_blocked THEN RAISE EXCEPTION 'public article entered personal sync v1'; END IF;

  BEGIN
    PERFORM aha.push_sync_change_v1(
      'workspace_a','device-a','scope-note-0001','note','scope_note','delete',0,repeat('d',64),null
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    local_only_blocked:=true;
  END;
  IF NOT local_only_blocked THEN RAISE EXCEPTION 'local-only note entered canonical sync v1'; END IF;

  BEGIN
    PERFORM aha.push_sync_change_v1(
      'workspace_a','device-a','scope-deleteat','conversation','scope_deleted_at','upsert',0,repeat('e',64),
      '{"id":"scope_deleted_at","conversation_type":"personal_ai","title":"Must use delete op","status":"active","source_app":"aha_chat","deleted_at":"2026-08-15T10:00:00Z","metadata":{}}'::jsonb
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    deleted_at_blocked:=true;
  END;
  IF NOT deleted_at_blocked THEN RAISE EXCEPTION 'upsert smuggled deleted_at instead of tombstone operation'; END IF;
END
$do$;
COMMIT;
