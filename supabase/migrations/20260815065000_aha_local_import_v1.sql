-- AHA local account import v1
--
-- Explicit first account import only. Preview is built on-device. This command
-- receives canonicalized data only after a hash-bound user confirmation.
-- It does not enable generic browser writes, sync, EchoNet sharing or public publishing.

begin;

create or replace function aha.commit_local_import_v1(
  p_source_kind text,
  p_source_version text,
  p_payload_hash text,
  p_plan_hash text,
  p_idempotency_key text,
  p_policy_version text,
  p_plan jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, aha
as $$
declare
  v_profile_id text;
  v_workspace_id text;
  v_consent_id text;
  v_batch_id text;
  v_existing_batch aha.import_batches%rowtype;
  v_item jsonb;
  v_existing_workspace text;
  v_row_count integer;
  v_planned integer := 0;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_now timestamptz := now();
  v_created timestamptz;
  v_updated timestamptz;
  v_deleted timestamptz;
  v_parent_id text;
  v_source_id text;
begin
  v_profile_id := aha.current_profile_id();
  if v_profile_id is null then
    raise exception 'authenticated canonical profile required' using errcode = '42501';
  end if;

  if p_source_kind <> 'aha_local_backup' or p_source_version <> 'v1' then
    raise exception 'unsupported local import source' using errcode = '22023';
  end if;
  if p_payload_hash !~ '^[a-f0-9]{64}$' or p_plan_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid import hashes' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) < 8 then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_policy_version, ''))) = 0 then
    raise exception 'policy version required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_plan) <> 'object'
     or p_plan->>'version' <> 'aha_local_import_plan_v1'
     or p_plan->>'sourceKind' <> p_source_kind
     or p_plan->>'sourceVersion' <> p_source_version then
    raise exception 'invalid local import plan' using errcode = '22023';
  end if;

  select * into v_existing_batch
  from aha.import_batches
  where profile_id = v_profile_id
    and idempotency_key = p_idempotency_key
  order by created_at desc
  limit 1;

  if found then
    if v_existing_batch.payload_hash <> p_payload_hash then
      raise exception 'idempotency key reused for another payload' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'importBatchId', v_existing_batch.id,
      'workspaceId', v_existing_batch.workspace_id,
      'status', v_existing_batch.status,
      'plannedCount', v_existing_batch.planned_count,
      'importedCount', v_existing_batch.imported_count,
      'skippedCount', v_existing_batch.skipped_count,
      'rejectedCount', v_existing_batch.rejected_count,
      'idempotentReplay', true,
      'summary', v_existing_batch.summary
    );
  end if;

  select w.id into v_workspace_id
  from aha.workspaces w
  where w.owner_profile_id = v_profile_id
    and w.workspace_type = 'personal'
    and w.status = 'active'
    and w.deleted_at is null
  order by w.created_at asc
  limit 1;

  if v_workspace_id is null then
    v_workspace_id := aha.new_id();
    insert into aha.workspaces (
      id, owner_profile_id, workspace_type, name, visibility, status, metadata
    ) values (
      v_workspace_id, v_profile_id, 'personal', 'Min AHA', 'private', 'active',
      jsonb_build_object('created_by', 'local_account_import_v1')
    );
  end if;

  insert into aha.workspace_memberships (
    id, workspace_id, profile_id, role_id, status, joined_at, metadata
  ) values (
    aha.new_id(), v_workspace_id, v_profile_id, 'owner', 'active', v_now,
    jsonb_build_object('created_by', 'local_account_import_v1')
  ) on conflict (workspace_id, profile_id) do update
    set role_id = 'owner', status = 'active', deleted_at = null;

  v_consent_id := aha.new_id();
  insert into aha.consent_receipts (
    id, profile_id, workspace_id, purpose, status, scope, policy_version, evidence, granted_at
  ) values (
    v_consent_id,
    v_profile_id,
    v_workspace_id,
    'account_import',
    'granted',
    aha.account_import_scope(v_workspace_id, p_source_kind, p_payload_hash),
    p_policy_version,
    jsonb_build_object(
      'method', 'explicit_hash_bound_confirmation',
      'payload_hash', p_payload_hash,
      'plan_hash', p_plan_hash,
      'source_version', p_source_version
    ),
    v_now
  );

  v_batch_id := aha.new_id();
  select coalesce(jsonb_array_length(p_plan->'conversations'), 0)
       + coalesce(jsonb_array_length(p_plan->'messages'), 0)
       + coalesce(jsonb_array_length(p_plan->'sourceEvents'), 0)
       + coalesce(jsonb_array_length(p_plan->'insights'), 0)
       + coalesce(jsonb_array_length(p_plan->'conceptLists'), 0)
       + coalesce(jsonb_array_length(p_plan->'conceptListItems'), 0)
       + coalesce(jsonb_array_length(p_plan->'knowledgePaths'), 0)
       + coalesce(jsonb_array_length(p_plan->'knowledgePathSteps'), 0)
       + coalesce(jsonb_array_length(p_plan->'articles'), 0)
       + coalesce(jsonb_array_length(p_plan->'articleReferences'), 0)
    into v_planned;

  insert into aha.import_batches (
    id, workspace_id, profile_id, source_kind, source_version, payload_hash,
    idempotency_key, status, planned_count, consent_receipt_id, summary, started_at
  ) values (
    v_batch_id, v_workspace_id, v_profile_id, p_source_kind, p_source_version,
    p_payload_hash, p_idempotency_key, 'running', v_planned, v_consent_id,
    jsonb_build_object('plan_hash', p_plan_hash, 'policy_version', p_policy_version), v_now
  );

  -- Conversations -----------------------------------------------------------
  for v_item in select value from jsonb_array_elements(coalesce(p_plan->'conversations', '[]'::jsonb)) loop
    v_source_id := btrim(v_item->>'id');
    select workspace_id into v_existing_workspace from aha.conversations where id = v_source_id;
    if v_existing_workspace is not null and v_existing_workspace <> v_workspace_id then
      raise exception 'import id belongs to another workspace' using errcode = '23505';
    end if;
    v_created := coalesce(nullif(v_item->>'createdAt','')::timestamptz, v_now);
    v_updated := coalesce(nullif(v_item->>'updatedAt','')::timestamptz, v_created);
    v_deleted := nullif(v_item->>'deletedAt','')::timestamptz;
    insert into aha.conversations (
      id, workspace_id, created_by_profile_id, conversation_type, title, status,
      source_app, metadata, created_at, updated_at, deleted_at
    ) values (
      v_source_id, v_workspace_id, v_profile_id, 'personal_ai',
      coalesce(nullif(v_item->>'title',''), 'AHA Chat session'),
      case when v_deleted is null then 'active' else 'deleted' end,
      coalesce(nullif(v_item->>'sourceApp',''), 'aha_chat'),
      coalesce(v_item->'metadata','{}'::jsonb) || jsonb_build_object('import_origin', p_source_kind),
      v_created, v_updated, v_deleted
    ) on conflict (id) do nothing;
    get diagnostics v_row_count = row_count;
    if v_row_count = 1 then v_imported := v_imported + 1; else v_skipped := v_skipped + 1; end if;

    insert into aha.conversation_participants (
      id, workspace_id, conversation_id, profile_id, participant_type, participant_key,
      role, joined_at, metadata
    ) values (
      aha.new_id(), v_workspace_id, v_source_id, v_profile_id, 'profile', 'profile:' || v_profile_id,
      'owner', v_created, jsonb_build_object('import_origin', p_source_kind)
    ) on conflict (conversation_id, participant_key) do nothing;
    insert into aha.conversation_participants (
      id, workspace_id, conversation_id, profile_id, participant_type, participant_key,
      role, joined_at, metadata
    ) values (
      aha.new_id(), v_workspace_id, v_source_id, null, 'assistant', 'assistant:aha',
      'assistant', v_created, jsonb_build_object('import_origin', p_source_kind)
    ) on conflict (conversation_id, participant_key) do nothing;

    insert into aha.import_items (
      id, batch_id, source_object_type, source_object_id, source_hash,
      target_object_type, target_object_id, status, reason, metadata, imported_at
    ) values (
      aha.new_id(), v_batch_id, 'conversation', v_source_id, encode(digest(v_item::text,'sha256'),'hex'),
      'conversation', v_source_id, case when v_row_count = 1 then 'imported' else 'skipped' end,
      case when v_row_count = 1 then null else 'already_present_in_personal_workspace' end,
      '{}'::jsonb, v_now
    );
  end loop;

  -- Messages ----------------------------------------------------------------
  for v_item in select value from jsonb_array_elements(coalesce(p_plan->'messages', '[]'::jsonb)) loop
    v_source_id := btrim(v_item->>'id');
    v_parent_id := btrim(v_item->>'conversationId');
    if not exists (select 1 from aha.conversations where id = v_parent_id and workspace_id = v_workspace_id) then
      raise exception 'message parent conversation missing' using errcode = '23503';
    end if;
    select workspace_id into v_existing_workspace from aha.messages where id = v_source_id;
    if v_existing_workspace is not null and v_existing_workspace <> v_workspace_id then
      raise exception 'import id belongs to another workspace' using errcode = '23505';
    end if;
    v_created := coalesce(nullif(v_item->>'createdAt','')::timestamptz, v_now);
    v_updated := coalesce(nullif(v_item->>'updatedAt','')::timestamptz, v_created);
    v_deleted := nullif(v_item->>'deletedAt','')::timestamptz;
    insert into aha.messages (
      id, workspace_id, conversation_id, author_profile_id, role, content, content_hash,
      source_app, intent, project, tags, concepts, metadata, created_at, updated_at, deleted_at
    ) values (
      v_source_id, v_workspace_id, v_parent_id,
      case when v_item->>'role' = 'user' then v_profile_id else null end,
      case when v_item->>'role' in ('user','assistant','system','tool') then v_item->>'role' else 'user' end,
      coalesce(v_item->>'content',''),
      encode(digest(coalesce(v_item->>'content',''),'sha256'),'hex'),
      coalesce(nullif(v_item->>'sourceApp',''), 'aha_chat'),
      nullif(v_item->>'intent',''), nullif(v_item->>'project',''),
      case when jsonb_typeof(v_item->'tags')='array' then v_item->'tags' else '[]'::jsonb end,
      case when jsonb_typeof(v_item->'concepts')='array' then v_item->'concepts' else '[]'::jsonb end,
      coalesce(v_item->'metadata','{}'::jsonb) || jsonb_build_object('import_origin', p_source_kind),
      v_created, v_updated, v_deleted
    ) on conflict (id) do nothing;
    get diagnostics v_row_count = row_count;
    if v_row_count = 1 then v_imported := v_imported + 1; else v_skipped := v_skipped + 1; end if;
    insert into aha.import_items (
      id, batch_id, source_object_type, source_object_id, source_hash,
      target_object_type, target_object_id, status, reason, metadata, imported_at
    ) values (
      aha.new_id(), v_batch_id, 'message', v_source_id, encode(digest(v_item::text,'sha256'),'hex'),
      'message', v_source_id, case when v_row_count = 1 then 'imported' else 'skipped' end,
      case when v_row_count = 1 then null else 'already_present_in_personal_workspace' end,
      jsonb_build_object('conversation_id', v_parent_id), v_now
    );
  end loop;

  -- Source events ------------------------------------------------------------
  for v_item in select value from jsonb_array_elements(coalesce(p_plan->'sourceEvents', '[]'::jsonb)) loop
    v_source_id := btrim(v_item->>'id');
    select workspace_id into v_existing_workspace from aha.source_events where id = v_source_id;
    if v_existing_workspace is not null and v_existing_workspace <> v_workspace_id then
      raise exception 'import id belongs to another workspace' using errcode = '23505';
    end if;
    v_created := coalesce(nullif(v_item->>'occurredAt','')::timestamptz, v_now);
    v_deleted := nullif(v_item->>'deletedAt','')::timestamptz;
    insert into aha.source_events (
      id, workspace_id, created_by_profile_id, conversation_id, message_id, source_type,
      source_app, content_type, title, source_text, content_hash, user_created, imported,
      occurred_at, tags, provenance, metadata, created_at, updated_at, deleted_at
    ) values (
      v_source_id, v_workspace_id, v_profile_id,
      case when exists (select 1 from aha.conversations where id = nullif(v_item->>'conversationId','') and workspace_id = v_workspace_id) then nullif(v_item->>'conversationId','') else null end,
      case when exists (select 1 from aha.messages where id = nullif(v_item->>'messageId','') and workspace_id = v_workspace_id) then nullif(v_item->>'messageId','') else null end,
      coalesce(nullif(v_item->>'sourceType',''), 'unknown'),
      coalesce(nullif(v_item->>'sourceApp',''), 'aha'),
      coalesce(nullif(v_item->>'contentType',''), 'text'),
      nullif(v_item->>'title',''), coalesce(v_item->>'sourceText',''),
      encode(digest(coalesce(v_item->>'sourceText',''),'sha256'),'hex'),
      coalesce((v_item->>'userCreated')::boolean, false),
      coalesce((v_item->>'imported')::boolean, false),
      v_created,
      case when jsonb_typeof(v_item->'tags')='array' then v_item->'tags' else '[]'::jsonb end,
      coalesce(v_item->'provenance','{}'::jsonb) || jsonb_build_object('import_origin', p_source_kind),
      coalesce(v_item->'metadata','{}'::jsonb),
      v_created, v_created, v_deleted
    ) on conflict (id) do nothing;
    get diagnostics v_row_count = row_count;
    if v_row_count = 1 then v_imported := v_imported + 1; else v_skipped := v_skipped + 1; end if;
    insert into aha.import_items (
      id, batch_id, source_object_type, source_object_id, source_hash,
      target_object_type, target_object_id, status, reason, metadata, imported_at
    ) values (
      aha.new_id(), v_batch_id, 'source_event', v_source_id, encode(digest(v_item::text,'sha256'),'hex'),
      'source_event', v_source_id, case when v_row_count = 1 then 'imported' else 'skipped' end,
      case when v_row_count = 1 then null else 'already_present_in_personal_workspace' end,
      '{}'::jsonb, v_now
    );
  end loop;

  -- Insights -----------------------------------------------------------------
  for v_item in select value from jsonb_array_elements(coalesce(p_plan->'insights', '[]'::jsonb)) loop
    v_source_id := btrim(v_item->>'id');
    select workspace_id into v_existing_workspace from aha.insights where id = v_source_id;
    if v_existing_workspace is not null and v_existing_workspace <> v_workspace_id then
      raise exception 'import id belongs to another workspace' using errcode = '23505';
    end if;
    v_created := coalesce(nullif(v_item->>'createdAt','')::timestamptz, v_now);
    v_updated := coalesce(nullif(v_item->>'updatedAt','')::timestamptz, v_created);
    v_deleted := nullif(v_item->>'deletedAt','')::timestamptz;
    insert into aha.insights (
      id, workspace_id, created_by_profile_id, source_event_id, subject_id, theme_id,
      functional_type, status, sharing_scope, current_version, metadata,
      created_at, updated_at, deleted_at
    ) values (
      v_source_id, v_workspace_id, v_profile_id,
      case when exists (select 1 from aha.source_events where id = nullif(v_item->>'sourceEventId','') and workspace_id = v_workspace_id) then nullif(v_item->>'sourceEventId','') else null end,
      nullif(v_item->>'subjectId',''), nullif(v_item->>'themeId',''), nullif(v_item->>'functionalType',''),
      case when v_item->>'status' in ('active','superseded','contested','stale','irrelevant','archived','deleted') then v_item->>'status' else 'active' end,
      'private', 1,
      coalesce(v_item->'metadata','{}'::jsonb) || jsonb_build_object('import_origin', p_source_kind),
      v_created, v_updated, v_deleted
    ) on conflict (id) do nothing;
    get diagnostics v_row_count = row_count;
    if v_row_count = 1 then v_imported := v_imported + 1; else v_skipped := v_skipped + 1; end if;

    insert into aha.insight_versions (
      insight_id, workspace_id, version, created_by_profile_id, title, summary,
      insight_text, concepts, confidence, provenance, created_at
    ) values (
      v_source_id, v_workspace_id, 1, v_profile_id,
      coalesce(nullif(v_item->>'title',''), 'AHA-innsikt'),
      coalesce(v_item->>'summary',''), coalesce(v_item->>'insightText',''),
      case when jsonb_typeof(v_item->'concepts')='array' then v_item->'concepts' else '[]'::jsonb end,
      case when v_item ? 'confidence' and jsonb_typeof(v_item->'confidence')='number' then (v_item->>'confidence')::numeric else null end,
      coalesce(v_item->'provenance','{}'::jsonb) || jsonb_build_object('import_origin', p_source_kind),
      v_created
    ) on conflict (insight_id, version) do nothing;

    insert into aha.import_items (
      id, batch_id, source_object_type, source_object_id, source_hash,
      target_object_type, target_object_id, status, reason, metadata, imported_at
    ) values (
      aha.new_id(), v_batch_id, 'insight', v_source_id, encode(digest(v_item::text,'sha256'),'hex'),
      'insight', v_source_id, case when v_row_count = 1 then 'imported' else 'skipped' end,
      case when v_row_count = 1 then null else 'already_present_in_personal_workspace' end,
      jsonb_build_object('version', 1), v_now
    );
  end loop;

  -- Concept lists ------------------------------------------------------------
  for v_item in select value from jsonb_array_elements(coalesce(p_plan->'conceptLists', '[]'::jsonb)) loop
    v_source_id := btrim(v_item->>'id');
    select workspace_id into v_existing_workspace from aha.concept_lists where id = v_source_id;
    if v_existing_workspace is not null and v_existing_workspace <> v_workspace_id then raise exception 'import id belongs to another workspace' using errcode = '23505'; end if;
    v_created := coalesce(nullif(v_item->>'createdAt','')::timestamptz, v_now);
    v_updated := coalesce(nullif(v_item->>'updatedAt','')::timestamptz, v_created);
    v_deleted := nullif(v_item->>'deletedAt','')::timestamptz;
    insert into aha.concept_lists (
      id, workspace_id, created_by_profile_id, title, list_type, description, source,
      sharing_scope, tags, metadata, created_at, updated_at, deleted_at
    ) values (
      v_source_id, v_workspace_id, v_profile_id, coalesce(nullif(v_item->>'title',''), 'Begrepsliste'),
      coalesce(nullif(v_item->>'listType',''), 'concepts'), coalesce(v_item->>'description',''),
      coalesce(nullif(v_item->>'source',''), 'aha_concept_lists'), 'private',
      case when jsonb_typeof(v_item->'tags')='array' then v_item->'tags' else '[]'::jsonb end,
      coalesce(v_item->'metadata','{}'::jsonb) || jsonb_build_object('import_origin', p_source_kind),
      v_created, v_updated, v_deleted
    ) on conflict (id) do nothing;
    get diagnostics v_row_count = row_count;
    if v_row_count = 1 then v_imported := v_imported + 1; else v_skipped := v_skipped + 1; end if;
    insert into aha.import_items values (
      aha.new_id(), v_batch_id, 'concept_list', v_source_id, encode(digest(v_item::text,'sha256'),'hex'),
      'concept_list', v_source_id, case when v_row_count=1 then 'imported' else 'skipped' end,
      case when v_row_count=1 then null else 'already_present_in_personal_workspace' end,
      '{}'::jsonb, v_now
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_plan->'conceptListItems', '[]'::jsonb)) loop
    v_source_id := btrim(v_item->>'id'); v_parent_id := btrim(v_item->>'listId');
    if not exists (select 1 from aha.concept_lists where id=v_parent_id and workspace_id=v_workspace_id) then raise exception 'concept list parent missing' using errcode='23503'; end if;
    select workspace_id into v_existing_workspace from aha.concept_list_items where id=v_source_id;
    if v_existing_workspace is not null and v_existing_workspace <> v_workspace_id then raise exception 'import id belongs to another workspace' using errcode='23505'; end if;
    v_created := coalesce(nullif(v_item->>'addedAt','')::timestamptz, v_now); v_deleted := nullif(v_item->>'deletedAt','')::timestamptz;
    insert into aha.concept_list_items (
      id, workspace_id, list_id, title, item_type, source, ref_id, position, added_at, metadata, updated_at, deleted_at
    ) values (
      v_source_id, v_workspace_id, v_parent_id, coalesce(nullif(v_item->>'title',''), 'Begrep'),
      coalesce(nullif(v_item->>'itemType',''), 'concept'), coalesce(nullif(v_item->>'source',''), 'aha_concept_lists'),
      nullif(v_item->>'refId',''), greatest(coalesce((v_item->>'position')::integer,0),0), v_created,
      coalesce(v_item->'metadata','{}'::jsonb) || jsonb_build_object('import_origin', p_source_kind), v_created, v_deleted
    ) on conflict (id) do nothing;
    get diagnostics v_row_count = row_count;
    if v_row_count=1 then v_imported:=v_imported+1; else v_skipped:=v_skipped+1; end if;
    insert into aha.import_items values (
      aha.new_id(), v_batch_id, 'concept_list_item', v_source_id, encode(digest(v_item::text,'sha256'),'hex'),
      'concept_list_item', v_source_id, case when v_row_count=1 then 'imported' else 'skipped' end,
      case when v_row_count=1 then null else 'already_present_in_personal_workspace' end,
      jsonb_build_object('list_id',v_parent_id), v_now
    );
  end loop;

  -- Knowledge paths ----------------------------------------------------------
  for v_item in select value from jsonb_array_elements(coalesce(p_plan->'knowledgePaths', '[]'::jsonb)) loop
    v_source_id:=btrim(v_item->>'id');
    select workspace_id into v_existing_workspace from aha.knowledge_paths where id=v_source_id;
    if v_existing_workspace is not null and v_existing_workspace<>v_workspace_id then raise exception 'import id belongs to another workspace' using errcode='23505'; end if;
    v_created:=coalesce(nullif(v_item->>'createdAt','')::timestamptz,v_now); v_updated:=coalesce(nullif(v_item->>'updatedAt','')::timestamptz,v_created); v_deleted:=nullif(v_item->>'deletedAt','')::timestamptz;
    insert into aha.knowledge_paths (
      id,workspace_id,created_by_profile_id,title,path_type,description,goal,learning_outcome,
      source,sharing_scope,tags,metadata,created_at,updated_at,deleted_at
    ) values (
      v_source_id,v_workspace_id,v_profile_id,coalesce(nullif(v_item->>'title',''),'Kunnskapssti'),
      coalesce(nullif(v_item->>'pathType',''),'learning'),coalesce(v_item->>'description',''),coalesce(v_item->>'goal',''),coalesce(v_item->>'learningOutcome',''),
      coalesce(nullif(v_item->>'source',''),'aha_paths'),'private',
      case when jsonb_typeof(v_item->'tags')='array' then v_item->'tags' else '[]'::jsonb end,
      coalesce(v_item->'metadata','{}'::jsonb)||jsonb_build_object('import_origin',p_source_kind),v_created,v_updated,v_deleted
    ) on conflict (id) do nothing;
    get diagnostics v_row_count=row_count; if v_row_count=1 then v_imported:=v_imported+1; else v_skipped:=v_skipped+1; end if;
    insert into aha.import_items values (aha.new_id(),v_batch_id,'knowledge_path',v_source_id,encode(digest(v_item::text,'sha256'),'hex'),'knowledge_path',v_source_id,case when v_row_count=1 then 'imported' else 'skipped' end,case when v_row_count=1 then null else 'already_present_in_personal_workspace' end,'{}'::jsonb,v_now);
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_plan->'knowledgePathSteps','[]'::jsonb)) loop
    v_source_id:=btrim(v_item->>'id'); v_parent_id:=btrim(v_item->>'pathId');
    if not exists(select 1 from aha.knowledge_paths where id=v_parent_id and workspace_id=v_workspace_id) then raise exception 'knowledge path parent missing' using errcode='23503'; end if;
    select workspace_id into v_existing_workspace from aha.knowledge_path_steps where id=v_source_id;
    if v_existing_workspace is not null and v_existing_workspace<>v_workspace_id then raise exception 'import id belongs to another workspace' using errcode='23505'; end if;
    v_created:=coalesce(nullif(v_item->>'addedAt','')::timestamptz,v_now); v_deleted:=nullif(v_item->>'deletedAt','')::timestamptz;
    insert into aha.knowledge_path_steps (
      id,workspace_id,path_id,title,step_type,source,ref_id,position,status,narrative,learning_outcome,completion_criterion,added_at,metadata,updated_at,deleted_at
    ) values (
      v_source_id,v_workspace_id,v_parent_id,coalesce(nullif(v_item->>'title',''),'Steg'),coalesce(nullif(v_item->>'stepType',''),'item'),coalesce(nullif(v_item->>'source',''),'aha_paths'),nullif(v_item->>'refId',''),greatest(coalesce((v_item->>'position')::integer,0),0),
      case when v_item->>'status' in('planned','active','done','skipped') then v_item->>'status' else 'planned' end,
      coalesce(v_item->>'narrative',''),coalesce(v_item->>'learningOutcome',''),coalesce(v_item->>'completionCriterion',''),v_created,
      coalesce(v_item->'metadata','{}'::jsonb)||jsonb_build_object('import_origin',p_source_kind),v_created,v_deleted
    ) on conflict(id) do nothing;
    get diagnostics v_row_count=row_count; if v_row_count=1 then v_imported:=v_imported+1; else v_skipped:=v_skipped+1; end if;
    insert into aha.import_items values (aha.new_id(),v_batch_id,'knowledge_path_step',v_source_id,encode(digest(v_item::text,'sha256'),'hex'),'knowledge_path_step',v_source_id,case when v_row_count=1 then 'imported' else 'skipped' end,case when v_row_count=1 then null else 'already_present_in_personal_workspace' end,jsonb_build_object('path_id',v_parent_id),v_now);
  end loop;

  -- Articles -----------------------------------------------------------------
  for v_item in select value from jsonb_array_elements(coalesce(p_plan->'articles','[]'::jsonb)) loop
    v_source_id:=btrim(v_item->>'id');
    select workspace_id into v_existing_workspace from aha.articles where id=v_source_id;
    if v_existing_workspace is not null and v_existing_workspace<>v_workspace_id then raise exception 'import id belongs to another workspace' using errcode='23505'; end if;
    v_created:=coalesce(nullif(v_item->>'createdAt','')::timestamptz,v_now); v_updated:=coalesce(nullif(v_item->>'updatedAt','')::timestamptz,v_created); v_deleted:=nullif(v_item->>'deletedAt','')::timestamptz;
    insert into aha.articles (
      id,workspace_id,created_by_profile_id,section,status,publication_scope,current_version,source,tags,metadata,created_at,updated_at,deleted_at
    ) values (
      v_source_id,v_workspace_id,v_profile_id,coalesce(nullif(v_item->>'section',''),'aha'),
      case when v_item->>'status' in('draft','review','ready','published_local','published','revoked','deleted') then v_item->>'status' else 'draft' end,
      case when v_item->>'publicationScope' in('personal','workspace','public_candidate','public') then v_item->>'publicationScope' else 'personal' end,
      1,coalesce(nullif(v_item->>'source',''),'aha_avisa'),case when jsonb_typeof(v_item->'tags')='array' then v_item->'tags' else '[]'::jsonb end,
      coalesce(v_item->'metadata','{}'::jsonb)||jsonb_build_object('import_origin',p_source_kind),v_created,v_updated,v_deleted
    ) on conflict(id) do nothing;
    get diagnostics v_row_count=row_count; if v_row_count=1 then v_imported:=v_imported+1; else v_skipped:=v_skipped+1; end if;
    insert into aha.article_versions (
      article_id,workspace_id,version,created_by_profile_id,title,summary,body,provenance,created_at
    ) values (
      v_source_id,v_workspace_id,1,v_profile_id,coalesce(nullif(v_item->>'title',''),'AHAavisa-utkast'),
      coalesce(v_item->>'summary',''),
      case when length(btrim(coalesce(v_item->>'body','')))>0 then v_item->>'body'
           when length(btrim(coalesce(v_item->>'summary','')))>0 then ''
           else coalesce(nullif(v_item->>'title',''),'AHAavisa-utkast') end,
      jsonb_build_object('import_origin',p_source_kind,'payload_hash',p_payload_hash),v_created
    ) on conflict(article_id,version) do nothing;
    insert into aha.import_items values (aha.new_id(),v_batch_id,'article',v_source_id,encode(digest(v_item::text,'sha256'),'hex'),'article',v_source_id,case when v_row_count=1 then 'imported' else 'skipped' end,case when v_row_count=1 then null else 'already_present_in_personal_workspace' end,jsonb_build_object('version',1),v_now);
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_plan->'articleReferences','[]'::jsonb)) loop
    v_source_id:=btrim(v_item->>'id'); v_parent_id:=btrim(v_item->>'articleId');
    if not exists(select 1 from aha.articles where id=v_parent_id and workspace_id=v_workspace_id) then raise exception 'article parent missing' using errcode='23503'; end if;
    if length(btrim(coalesce(v_item->>'refId','')))=0 then
      v_skipped:=v_skipped+1;
      insert into aha.import_items values (aha.new_id(),v_batch_id,'article_reference',v_source_id,encode(digest(v_item::text,'sha256'),'hex'),'article_reference',null,'skipped','missing_ref_id',jsonb_build_object('article_id',v_parent_id),v_now);
      continue;
    end if;
    select workspace_id into v_existing_workspace from aha.article_references where id=v_source_id;
    if v_existing_workspace is not null and v_existing_workspace<>v_workspace_id then raise exception 'import id belongs to another workspace' using errcode='23505'; end if;
    v_created:=coalesce(nullif(v_item->>'addedAt','')::timestamptz,v_now); v_deleted:=nullif(v_item->>'deletedAt','')::timestamptz;
    insert into aha.article_references (
      id,workspace_id,article_id,title,reference_type,source,ref_id,position,added_at,deleted_at,metadata
    ) values (
      v_source_id,v_workspace_id,v_parent_id,coalesce(nullif(v_item->>'title',''),'Referanse'),coalesce(nullif(v_item->>'referenceType',''),'reference'),coalesce(nullif(v_item->>'source',''),'aha_avisa'),v_item->>'refId',greatest(coalesce((v_item->>'position')::integer,0),0),v_created,v_deleted,
      coalesce(v_item->'metadata','{}'::jsonb)||jsonb_build_object('import_origin',p_source_kind)
    ) on conflict(id) do nothing;
    get diagnostics v_row_count=row_count; if v_row_count=1 then v_imported:=v_imported+1; else v_skipped:=v_skipped+1; end if;
    insert into aha.import_items values (aha.new_id(),v_batch_id,'article_reference',v_source_id,encode(digest(v_item::text,'sha256'),'hex'),'article_reference',v_source_id,case when v_row_count=1 then 'imported' else 'skipped' end,case when v_row_count=1 then null else 'already_present_in_personal_workspace' end,jsonb_build_object('article_id',v_parent_id),v_now);
  end loop;

  update aha.import_batches
  set status='completed', imported_count=v_imported, skipped_count=v_skipped,
      rejected_count=0, failed_count=0, completed_at=now(),
      summary=jsonb_build_object(
        'plan_hash',p_plan_hash,
        'policy_version',p_policy_version,
        'planned_count',v_planned,
        'imported_count',v_imported,
        'skipped_count',v_skipped,
        'local_only_uploaded',false
      )
  where id=v_batch_id;

  insert into aha.audit_events (
    id, profile_id, workspace_id, event_type, action, target_type, target_id,
    outcome, request_id, detail, occurred_at
  ) values (
    aha.new_id(), v_profile_id, v_workspace_id, 'account_import', 'local_import_commit',
    'import_batch', v_batch_id, 'success', null,
    jsonb_build_object('payload_hash',p_payload_hash,'plan_hash',p_plan_hash,'imported_count',v_imported,'skipped_count',v_skipped), now()
  );

  return jsonb_build_object(
    'importBatchId',v_batch_id,
    'workspaceId',v_workspace_id,
    'consentReceiptId',v_consent_id,
    'status','completed',
    'plannedCount',v_planned,
    'importedCount',v_imported,
    'skippedCount',v_skipped,
    'rejectedCount',0,
    'idempotentReplay',false
  );
end;
$$;

comment on function aha.commit_local_import_v1(text,text,text,text,text,text,jsonb) is
  'Explicit first local account import. Must only be callable by the dedicated NestJS runtime role after hash-bound confirmation.';

revoke all on function aha.commit_local_import_v1(text,text,text,text,text,text,jsonb) from public;

insert into aha.schema_versions (version, description, metadata)
values (
  'aha_local_import_v1',
  'Explicit local preview -> confirmation -> idempotent canonical account import command.',
  jsonb_build_object(
    'runtime_activated', false,
    'direct_table_writes', false,
    'generic_write_policies_created', false,
    'function_public_execute', false,
    'local_preview_required', true,
    'confirmation_hash_bound', true
  )
)
on conflict (version) do update
set description=excluded.description, metadata=excluded.metadata, applied_at=now();

commit;
