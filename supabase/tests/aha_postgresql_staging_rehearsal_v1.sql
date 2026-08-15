\set ON_ERROR_STOP on

SET row_security = on;

-- Tenant A: verified identity, RLS visibility, no direct writes, first import.
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"rehearsal-user-a","aha_provider":"supabase","iss":"https://issuer.invalid","aud":["aha-api"]}',
  true
);

DO $do$
DECLARE
  n integer;
  result jsonb;
  plan jsonb := '{
    "version":"aha_local_import_plan_v1",
    "sourceKind":"aha_local_backup",
    "sourceVersion":"v1",
    "conversations":[{"id":"conversation_a","title":"A","createdAt":"2026-08-15T07:00:00Z"}],
    "messages":[{"id":"message_a","conversationId":"conversation_a","role":"user","content":"Tillatt importinnhold A","createdAt":"2026-08-15T07:01:00Z"}],
    "sourceEvents":[],"insights":[],"conceptLists":[],"conceptListItems":[],
    "knowledgePaths":[],"knowledgePathSteps":[],"articles":[],"articleReferences":[]
  }'::jsonb;
BEGIN
  IF current_user <> 'aha_runtime_rehearsal' THEN RAISE EXCEPTION 'wrong runtime role'; END IF;
  IF aha.current_profile_id() <> 'profile_a' THEN RAISE EXCEPTION 'principal A did not resolve'; END IF;

  SELECT count(*) INTO n FROM aha.profiles;
  IF n <> 1 THEN RAISE EXCEPTION 'profile RLS leaked another tenant: % rows', n; END IF;
  SELECT count(*) INTO n FROM aha.workspaces;
  IF n <> 1 THEN RAISE EXCEPTION 'workspace RLS leaked another tenant: % rows', n; END IF;
  SELECT count(*) INTO n FROM aha.workspaces WHERE id='workspace_b';
  IF n <> 0 THEN RAISE EXCEPTION 'tenant A can read tenant B workspace'; END IF;

  BEGIN
    INSERT INTO aha.workspaces (id,owner_profile_id,workspace_type,name,visibility,status)
    VALUES ('forbidden_direct_write','profile_a','personal','forbidden','private','active');
    RAISE EXCEPTION 'direct canonical write unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  result := aha.commit_local_import_v1(
    'aha_local_backup','v1',repeat('a',64),repeat('1',64),
    'idem-rehearsal-a','aha_account_import_v1',plan
  );
  IF result->>'status' <> 'completed' THEN RAISE EXCEPTION 'tenant A import did not complete: %', result; END IF;
  IF coalesce((result->>'idempotentReplay')::boolean,true) THEN RAISE EXCEPTION 'first import marked replay'; END IF;
  IF (result->'resultCounts'->>'imported')::integer <> 2 THEN RAISE EXCEPTION 'tenant A imported count mismatch: %', result; END IF;
END
$do$;
COMMIT;

-- Exact retry: same batch, no duplicate canonical objects.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-a","aha_provider":"supabase"}',true);
DO $do$
DECLARE
  result jsonb;
  plan jsonb := '{
    "version":"aha_local_import_plan_v1","sourceKind":"aha_local_backup","sourceVersion":"v1",
    "conversations":[{"id":"conversation_a","title":"A","createdAt":"2026-08-15T07:00:00Z"}],
    "messages":[{"id":"message_a","conversationId":"conversation_a","role":"user","content":"Tillatt importinnhold A","createdAt":"2026-08-15T07:01:00Z"}],
    "sourceEvents":[],"insights":[],"conceptLists":[],"conceptListItems":[],"knowledgePaths":[],"knowledgePathSteps":[],"articles":[],"articleReferences":[]
  }'::jsonb;
BEGIN
  result := aha.commit_local_import_v1(
    'aha_local_backup','v1',repeat('a',64),repeat('1',64),
    'idem-rehearsal-a','aha_account_import_v1',plan
  );
  IF NOT coalesce((result->>'idempotentReplay')::boolean,false) THEN RAISE EXCEPTION 'retry was not idempotent: %', result; END IF;
END
$do$;
COMMIT;

-- Tenant B: independent import using an ID that tenant A will later collide with.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-b","aha_provider":"supabase"}',true);
DO $do$
DECLARE
  n integer;
  result jsonb;
  plan jsonb := '{
    "version":"aha_local_import_plan_v1","sourceKind":"aha_local_backup","sourceVersion":"v1",
    "conversations":[{"id":"collision_conversation","title":"B","createdAt":"2026-08-15T07:10:00Z"}],
    "messages":[{"id":"collision_message","conversationId":"collision_conversation","role":"user","content":"Tillatt importinnhold B","createdAt":"2026-08-15T07:11:00Z"}],
    "sourceEvents":[],"insights":[],"conceptLists":[],"conceptListItems":[],"knowledgePaths":[],"knowledgePathSteps":[],"articles":[],"articleReferences":[]
  }'::jsonb;
BEGIN
  IF aha.current_profile_id() <> 'profile_b' THEN RAISE EXCEPTION 'principal B did not resolve'; END IF;
  SELECT count(*) INTO n FROM aha.workspaces WHERE id='workspace_a';
  IF n <> 0 THEN RAISE EXCEPTION 'tenant B can read tenant A workspace'; END IF;

  result := aha.commit_local_import_v1(
    'aha_local_backup','v1',repeat('b',64),repeat('2',64),
    'idem-rehearsal-b','aha_account_import_v1',plan
  );
  IF result->>'status' <> 'completed' OR (result->'resultCounts'->>'imported')::integer <> 2 THEN
    RAISE EXCEPTION 'tenant B import failed: %', result;
  END IF;
END
$do$;
COMMIT;

-- Tenant A attempts a cross-workspace ID collision after first inserting a new
-- object in the same command. The entire SECURITY DEFINER command must roll back.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-a","aha_provider":"supabase"}',true);
DO $do$
DECLARE
  plan jsonb := '{
    "version":"aha_local_import_plan_v1","sourceKind":"aha_local_backup","sourceVersion":"v1",
    "conversations":[
      {"id":"should_not_survive_collision","title":"rollback sentinel"},
      {"id":"collision_conversation","title":"must collide"}
    ],
    "messages":[],"sourceEvents":[],"insights":[],"conceptLists":[],"conceptListItems":[],
    "knowledgePaths":[],"knowledgePathSteps":[],"articles":[],"articleReferences":[]
  }'::jsonb;
BEGIN
  BEGIN
    PERFORM aha.commit_local_import_v1(
      'aha_local_backup','v1',repeat('c',64),repeat('3',64),
      'idem-rehearsal-collision','aha_account_import_v1',plan
    );
    RAISE EXCEPTION 'cross-tenant collision unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END
$do$;
COMMIT;

-- Canonical sync read boundary: imported/pre-journal data must bootstrap, while
-- delta pull is empty until a future explicit push writes journal entries.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-a","aha_provider":"supabase"}',true);
DO $do$
DECLARE
  bootstrap jsonb;
  pull_result jsonb;
  tenant_denied boolean := false;
  forged_watermark_denied boolean := false;
BEGIN
  bootstrap := aha.bootstrap_sync_snapshot_v1('workspace_a','',null,100);

  IF (bootstrap->>'highWatermark')::bigint <> 0 THEN
    RAISE EXCEPTION 'bootstrap watermark must be zero before sync journal activation: %', bootstrap;
  END IF;
  IF (bootstrap->>'returnedCount')::integer <> 2 THEN
    RAISE EXCEPTION 'bootstrap should return imported conversation + message: %', bootstrap;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(bootstrap->'objects') x
    WHERE x->>'objectType'='conversation' AND x->>'objectId'='conversation_a'
  ) THEN
    RAISE EXCEPTION 'bootstrap omitted conversation_a: %', bootstrap;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(bootstrap->'objects') x
    WHERE x->>'objectType'='message' AND x->>'objectId'='message_a'
  ) THEN
    RAISE EXCEPTION 'bootstrap omitted message_a: %', bootstrap;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(bootstrap->'objects') x
    WHERE x->>'objectId' IN ('collision_conversation','collision_message')
  ) THEN
    RAISE EXCEPTION 'bootstrap leaked tenant B objects: %', bootstrap;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(bootstrap->'objects') x
    WHERE x->'payload' ?| array['workspace_id','created_by_profile_id','author_profile_id']
  ) THEN
    RAISE EXCEPTION 'bootstrap leaked tenant/ownership columns in payload: %', bootstrap;
  END IF;

  pull_result := aha.pull_sync_changes_v1('workspace_a',0,100);
  IF (pull_result->>'returnedCount')::integer <> 0
     OR jsonb_array_length(pull_result->'changes') <> 0
     OR (pull_result->>'highWatermark')::bigint <> 0 THEN
    RAISE EXCEPTION 'delta pull should be empty before explicit push exists: %', pull_result;
  END IF;

  BEGIN
    PERFORM aha.bootstrap_sync_snapshot_v1('workspace_b','',null,10);
  EXCEPTION WHEN insufficient_privilege THEN
    tenant_denied := true;
  END;
  IF NOT tenant_denied THEN
    RAISE EXCEPTION 'tenant A was allowed to bootstrap tenant B';
  END IF;

  BEGIN
    PERFORM aha.bootstrap_sync_snapshot_v1('workspace_a','',1,10);
  EXCEPTION WHEN invalid_parameter_value THEN
    forged_watermark_denied := true;
  END;
  IF NOT forged_watermark_denied THEN
    RAISE EXCEPTION 'bootstrap accepted a watermark beyond current journal state';
  END IF;
END
$do$;
COMMIT;
