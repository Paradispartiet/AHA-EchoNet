\set ON_ERROR_STOP on

SET row_security = on;

BEGIN;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"rehearsal-user-a","aha_provider":"supabase","iss":"https://issuer.invalid","aud":["aha-api"]}',
  true
);

DO $do$
DECLARE
  r jsonb;
  retry jsonb;
  conflict jsonb;
  pulled jsonb;
  tenant_denied boolean := false;
  reused_denied boolean := false;
BEGIN
  r:=aha.push_sync_change_v1('workspace_a','device-a','idem-conv-create','conversation','sync_conv','upsert',0,repeat('a',64),
    '{"id":"sync_conv","conversation_type":"personal_ai","title":"Conversation v1","status":"active","source_app":"aha_chat","metadata":{}}'::jsonb);
  IF r->>'status'<>'synced' OR (r->>'serverRevision')::integer<>1 THEN RAISE EXCEPTION 'conversation create failed: %',r; END IF;

  retry:=aha.push_sync_change_v1('workspace_a','device-a','idem-conv-create','conversation','sync_conv','upsert',0,repeat('a',64),
    '{"id":"sync_conv","conversation_type":"personal_ai","title":"Conversation v1","status":"active","source_app":"aha_chat","metadata":{}}'::jsonb);
  IF NOT coalesce((retry->>'idempotentReplay')::boolean,false) OR retry->>'cursor'<>r->>'cursor' THEN
    RAISE EXCEPTION 'exact sync retry failed: %',retry;
  END IF;

  r:=aha.push_sync_change_v1('workspace_a','device-a','idem-msg-create1','message','sync_msg','upsert',0,repeat('b',64),
    '{"id":"sync_msg","conversation_id":"sync_conv","role":"user","content":"Canonical message","source_app":"aha_chat","tags":[],"concepts":[],"metadata":{}}'::jsonb);
  IF (r->>'serverRevision')::integer<>1 THEN RAISE EXCEPTION 'message create failed: %',r; END IF;

  r:=aha.push_sync_change_v1('workspace_a','device-a','idem-src-create1','source_event','sync_src','upsert',0,repeat('c',64),
    '{"id":"sync_src","conversation_id":"sync_conv","message_id":"sync_msg","source_type":"chat","source_app":"aha_chat","content_type":"text","title":"Source","source_text":"Canonical message","user_created":true,"imported":false,"tags":[],"provenance":{},"metadata":{}}'::jsonb);
  IF (r->>'serverRevision')::integer<>1 THEN RAISE EXCEPTION 'source_event create failed: %',r; END IF;

  r:=aha.push_sync_change_v1('workspace_a','device-a','idem-ins-create','insight','sync_ins','upsert',0,repeat('d',64),
    '{"id":"sync_ins","source_event_id":"sync_src","functional_type":"observation","status":"active","sharing_scope":"private","metadata":{},"version":{"title":"Insight v1","summary":"Summary v1","insight_text":"Insight text v1","concepts":["alpha"],"confidence":0.8,"provenance":{}}}'::jsonb);
  IF (r->>'serverRevision')::integer<>1 OR r->'serverState'->'version'->>'title'<>'Insight v1' THEN RAISE EXCEPTION 'insight create failed: %',r; END IF;

  r:=aha.push_sync_change_v1('workspace_a','device-a','idem-list-create','concept_list','sync_list','upsert',0,repeat('e',64),
    '{"id":"sync_list","title":"List","list_type":"concepts","description":"","source":"aha_lists","sharing_scope":"private","tags":[],"metadata":{}}'::jsonb);
  IF (r->>'serverRevision')::integer<>1 THEN RAISE EXCEPTION 'concept_list create failed: %',r; END IF;

  r:=aha.push_sync_change_v1('workspace_a','device-a','idem-item-create','concept_list_item','sync_item','upsert',0,repeat('f',64),
    '{"id":"sync_item","list_id":"sync_list","title":"Term","item_type":"concept","source":"aha_lists","position":0,"metadata":{}}'::jsonb);
  IF (r->>'serverRevision')::integer<>1 THEN RAISE EXCEPTION 'concept_list_item create failed: %',r; END IF;

  r:=aha.push_sync_change_v1('workspace_a','device-a','idem-path-create','knowledge_path','sync_path','upsert',0,repeat('1',64),
    '{"id":"sync_path","title":"Path","path_type":"learning","description":"","goal":"","learning_outcome":"","source":"aha_paths","sharing_scope":"private","tags":[],"metadata":{}}'::jsonb);
  IF (r->>'serverRevision')::integer<>1 THEN RAISE EXCEPTION 'knowledge_path create failed: %',r; END IF;

  r:=aha.push_sync_change_v1('workspace_a','device-a','idem-step-create','knowledge_path_step','sync_step','upsert',0,repeat('2',64),
    '{"id":"sync_step","path_id":"sync_path","title":"Step","step_type":"item","source":"aha_paths","position":0,"status":"planned","metadata":{}}'::jsonb);
  IF (r->>'serverRevision')::integer<>1 THEN RAISE EXCEPTION 'knowledge_path_step create failed: %',r; END IF;

  r:=aha.push_sync_change_v1('workspace_a','device-a','idem-art-create1','article','sync_art','upsert',0,repeat('3',64),
    '{"id":"sync_art","section":"aha","status":"draft","publication_scope":"personal","source":"aha_avisa","tags":[],"metadata":{},"version":{"title":"Article v1","summary":"Article summary","body":"Article body v1","provenance":{}}}'::jsonb);
  IF (r->>'serverRevision')::integer<>1 OR r->'serverState'->'version'->>'title'<>'Article v1' THEN RAISE EXCEPTION 'article create failed: %',r; END IF;

  r:=aha.push_sync_change_v1('workspace_a','device-a','idem-ref-create1','article_reference','sync_ref','upsert',0,repeat('4',64),
    '{"id":"sync_ref","article_id":"sync_art","title":"Reference","reference_type":"source","source":"manual","ref_id":"ref-1","position":0,"metadata":{}}'::jsonb);
  IF (r->>'serverRevision')::integer<>1 THEN RAISE EXCEPTION 'article_reference create failed: %',r; END IF;

  r:=aha.push_sync_change_v1('workspace_a','device-a','idem-ins-update','insight','sync_ins','upsert',1,repeat('5',64),
    '{"id":"sync_ins","revision":1,"source_event_id":"sync_src","functional_type":"observation","status":"active","sharing_scope":"private","metadata":{},"version":{"title":"Insight v2","summary":"Summary v2","insight_text":"Insight text v2","concepts":["alpha","beta"],"confidence":0.9,"provenance":{}}}'::jsonb);
  IF (r->>'serverRevision')::integer<>2 OR r->'serverState'->'version'->>'title'<>'Insight v2' THEN RAISE EXCEPTION 'insight update/version failed: %',r; END IF;

  r:=aha.push_sync_change_v1('workspace_a','device-a','idem-art-update1','article','sync_art','upsert',1,repeat('6',64),
    '{"id":"sync_art","revision":1,"section":"aha","status":"review","publication_scope":"personal","source":"aha_avisa","tags":[],"metadata":{},"version":{"title":"Article v2","summary":"Article summary 2","body":"Article body v2","provenance":{}}}'::jsonb);
  IF (r->>'serverRevision')::integer<>2 OR r->'serverState'->'version'->>'title'<>'Article v2' THEN RAISE EXCEPTION 'article update/version failed: %',r; END IF;

  r:=aha.push_sync_change_v1('workspace_a','device-a','idem-ref-update1','article_reference','sync_ref','upsert',1,repeat('7',64),
    '{"id":"sync_ref","revision":1,"article_id":"sync_art","title":"Reference v2","reference_type":"source","source":"manual","ref_id":"ref-1","position":1,"metadata":{}}'::jsonb);
  IF (r->>'serverRevision')::integer<>2 THEN RAISE EXCEPTION 'article_reference monotone revision failed: %',r; END IF;

  r:=aha.push_sync_change_v1('workspace_a','device-a','idem-conv-update','conversation','sync_conv','upsert',1,repeat('8',64),
    '{"id":"sync_conv","revision":1,"conversation_type":"personal_ai","title":"Conversation v2","status":"active","source_app":"aha_chat","metadata":{}}'::jsonb);
  IF (r->>'serverRevision')::integer<>2 THEN RAISE EXCEPTION 'conversation update failed: %',r; END IF;

  conflict:=aha.push_sync_change_v1('workspace_a','device-a','idem-conv-stale1','conversation','sync_conv','upsert',1,repeat('9',64),
    '{"id":"sync_conv","revision":1,"conversation_type":"personal_ai","title":"Stale write","status":"active","source_app":"aha_chat","metadata":{}}'::jsonb);
  IF conflict->>'status'<>'conflict' OR conflict->>'reason'<>'stale_base_revision' OR (conflict->>'serverRevision')::integer<>2 THEN
    RAISE EXCEPTION 'stale conflict failed: %',conflict;
  END IF;

  r:=aha.push_sync_change_v1('workspace_a','device-a','idem-conv-delete','conversation','sync_conv','delete',2,repeat('a',64),null);
  IF r->>'status'<>'synced' OR (r->>'serverRevision')::integer<>3 OR r->'payload' IS NOT NULL THEN
    RAISE EXCEPTION 'conversation delete failed: %',r;
  END IF;

  conflict:=aha.push_sync_change_v1('workspace_a','device-a','idem-conv-resurr','conversation','sync_conv','upsert',3,repeat('b',64),
    '{"id":"sync_conv","revision":3,"conversation_type":"personal_ai","title":"Resurrect","status":"active","source_app":"aha_chat","metadata":{}}'::jsonb);
  IF conflict->>'status'<>'conflict' OR conflict->>'reason'<>'server_tombstone' THEN
    RAISE EXCEPTION 'tombstone resurrection was not blocked: %',conflict;
  END IF;

  r:=aha.push_sync_change_v1('workspace_a','device-a','idem-absent-del1','conversation','sync_absent','delete',0,repeat('c',64),null);
  IF r->>'result'<>'already_absent' THEN RAISE EXCEPTION 'absent delete no-op failed: %',r; END IF;

  BEGIN
    PERFORM aha.push_sync_change_v1('workspace_a','device-a','idem-conv-create','conversation','sync_other','delete',0,repeat('d',64),null);
  EXCEPTION WHEN unique_violation THEN
    reused_denied:=true;
  END;
  IF NOT reused_denied THEN RAISE EXCEPTION 'idempotency key reuse with different request was not denied'; END IF;

  BEGIN
    PERFORM aha.push_sync_change_v1('workspace_b','device-a','idem-cross-tenant','conversation','x','delete',0,repeat('e',64),null);
  EXCEPTION WHEN insufficient_privilege THEN
    tenant_denied:=true;
  END;
  IF NOT tenant_denied THEN RAISE EXCEPTION 'cross-tenant push was not denied'; END IF;

  pulled:=aha.pull_sync_changes_v1('workspace_a',0,500);
  IF (pulled->>'returnedCount')::integer<>10 THEN
    RAISE EXCEPTION 'delta pull should collapse to ten latest object states: %',pulled;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(pulled->'changes') x
    WHERE x->>'objectId'='sync_conv' AND x->>'operation'='delete'
      AND (x->>'revision')::integer=3 AND x->'payload'='null'::jsonb
  ) THEN
    RAISE EXCEPTION 'delta pull did not preserve latest conversation tombstone: %',pulled;
  END IF;
END
$do$;
COMMIT;
