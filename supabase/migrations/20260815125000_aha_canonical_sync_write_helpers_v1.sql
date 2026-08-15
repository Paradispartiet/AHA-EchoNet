-- AHA canonical sync write helpers v1
--
-- Internal typed helpers for the future explicit push command. No helper is
-- granted to the runtime role by this migration. No frontend, login or auto-sync
-- activation occurs here.

begin;

-- article_references gained revision/updated_at after the original trigger
-- installer ran. Give it the exact same monotone revision semantics as every
-- other syncable mutable canonical object.
drop trigger if exists aha_bump_revision on aha.article_references;
create trigger aha_bump_revision
before update on aha.article_references
for each row execute function aha.bump_revision();

create or replace function aha.sync_lock_object_state_v1(
  p_workspace_id text,
  p_object_type text,
  p_object_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, aha
as $function$
declare
  v_state jsonb;
begin
  case p_object_type
    when 'conversation' then
      select jsonb_build_object('revision',c.revision,'deleted_at',c.deleted_at)
        into v_state from aha.conversations c
        where c.workspace_id=p_workspace_id and c.id=p_object_id for update;
    when 'message' then
      select jsonb_build_object('revision',m.revision,'deleted_at',m.deleted_at)
        into v_state from aha.messages m
        where m.workspace_id=p_workspace_id and m.id=p_object_id for update;
    when 'source_event' then
      select jsonb_build_object('revision',s.revision,'deleted_at',s.deleted_at)
        into v_state from aha.source_events s
        where s.workspace_id=p_workspace_id and s.id=p_object_id for update;
    when 'insight' then
      select jsonb_build_object('revision',i.revision,'deleted_at',i.deleted_at)
        into v_state from aha.insights i
        where i.workspace_id=p_workspace_id and i.id=p_object_id for update;
    when 'concept_list' then
      select jsonb_build_object('revision',l.revision,'deleted_at',l.deleted_at)
        into v_state from aha.concept_lists l
        where l.workspace_id=p_workspace_id and l.id=p_object_id for update;
    when 'concept_list_item' then
      select jsonb_build_object('revision',li.revision,'deleted_at',li.deleted_at)
        into v_state from aha.concept_list_items li
        where li.workspace_id=p_workspace_id and li.id=p_object_id for update;
    when 'knowledge_path' then
      select jsonb_build_object('revision',p.revision,'deleted_at',p.deleted_at)
        into v_state from aha.knowledge_paths p
        where p.workspace_id=p_workspace_id and p.id=p_object_id for update;
    when 'knowledge_path_step' then
      select jsonb_build_object('revision',ps.revision,'deleted_at',ps.deleted_at)
        into v_state from aha.knowledge_path_steps ps
        where ps.workspace_id=p_workspace_id and ps.id=p_object_id for update;
    when 'article' then
      select jsonb_build_object('revision',a.revision,'deleted_at',a.deleted_at)
        into v_state from aha.articles a
        where a.workspace_id=p_workspace_id and a.id=p_object_id for update;
    when 'article_reference' then
      select jsonb_build_object('revision',ar.revision,'deleted_at',ar.deleted_at)
        into v_state from aha.article_references ar
        where ar.workspace_id=p_workspace_id and ar.id=p_object_id for update;
    else
      raise exception 'unsupported canonical sync object type' using errcode='22023';
  end case;
  return v_state;
end;
$function$;
revoke all on function aha.sync_lock_object_state_v1(text,text,text) from public;

create or replace function aha.assert_sync_private_scope_v1(
  p_workspace_id text,
  p_object_type text,
  p_payload jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, aha
as $function$
declare
  v_parent_id text;
  v_scope text;
  v_status text;
  v_conversation_type text;
begin
  case p_object_type
    when 'conversation' then
      if coalesce(nullif(p_payload->>'conversation_type',''),'personal_ai')='group' then
        raise exception 'group conversations are outside canonical sync v1' using errcode='42501';
      end if;

    when 'message' then
      v_parent_id:=nullif(p_payload->>'conversation_id','');
      if v_parent_id is not null then
        select c.conversation_type into v_conversation_type
        from aha.conversations c
        where c.workspace_id=p_workspace_id and c.id=v_parent_id;
        if v_conversation_type='group' then
          raise exception 'group messages are outside canonical sync v1' using errcode='42501';
        end if;
      end if;

    when 'source_event' then
      v_parent_id:=nullif(p_payload->>'conversation_id','');
      if v_parent_id is not null then
        select c.conversation_type into v_conversation_type
        from aha.conversations c
        where c.workspace_id=p_workspace_id and c.id=v_parent_id;
        if v_conversation_type='group' then
          raise exception 'group source events are outside canonical sync v1' using errcode='42501';
        end if;
      elsif nullif(p_payload->>'message_id','') is not null then
        select c.conversation_type into v_conversation_type
        from aha.messages m
        join aha.conversations c on c.id=m.conversation_id and c.workspace_id=m.workspace_id
        where m.workspace_id=p_workspace_id and m.id=p_payload->>'message_id';
        if v_conversation_type='group' then
          raise exception 'group source events are outside canonical sync v1' using errcode='42501';
        end if;
      end if;

    when 'insight' then
      if coalesce(nullif(p_payload->>'sharing_scope',''),'private') <> 'private' then
        raise exception 'shared/public insights are outside canonical sync v1' using errcode='42501';
      end if;

    when 'concept_list' then
      if coalesce(nullif(p_payload->>'sharing_scope',''),'private') <> 'private' then
        raise exception 'shared/public lists are outside canonical sync v1' using errcode='42501';
      end if;

    when 'concept_list_item' then
      v_parent_id:=nullif(p_payload->>'list_id','');
      if v_parent_id is not null then
        select l.sharing_scope into v_scope from aha.concept_lists l
        where l.workspace_id=p_workspace_id and l.id=v_parent_id;
        if v_scope is not null and v_scope <> 'private' then
          raise exception 'items in shared/public lists are outside canonical sync v1' using errcode='42501';
        end if;
      end if;

    when 'knowledge_path' then
      if coalesce(nullif(p_payload->>'sharing_scope',''),'private') <> 'private' then
        raise exception 'shared/public paths are outside canonical sync v1' using errcode='42501';
      end if;

    when 'knowledge_path_step' then
      v_parent_id:=nullif(p_payload->>'path_id','');
      if v_parent_id is not null then
        select p.sharing_scope into v_scope from aha.knowledge_paths p
        where p.workspace_id=p_workspace_id and p.id=v_parent_id;
        if v_scope is not null and v_scope <> 'private' then
          raise exception 'steps in shared/public paths are outside canonical sync v1' using errcode='42501';
        end if;
      end if;

    when 'article' then
      v_scope:=coalesce(nullif(p_payload->>'publication_scope',''),'personal');
      v_status:=coalesce(nullif(p_payload->>'status',''),'draft');
      if v_scope <> 'personal' or v_status in ('published','revoked') then
        raise exception 'public/workspace publication is outside canonical sync v1' using errcode='42501';
      end if;

    when 'article_reference' then
      v_parent_id:=nullif(p_payload->>'article_id','');
      if v_parent_id is not null then
        select a.publication_scope,a.status into v_scope,v_status from aha.articles a
        where a.workspace_id=p_workspace_id and a.id=v_parent_id;
        if v_scope is not null and (v_scope <> 'personal' or v_status in ('published','revoked')) then
          raise exception 'references on published/shared articles are outside canonical sync v1' using errcode='42501';
        end if;
      end if;

    else
      raise exception 'unsupported canonical sync object type' using errcode='22023';
  end case;
end;
$function$;
revoke all on function aha.assert_sync_private_scope_v1(text,text,jsonb) from public;

create or replace function aha.assert_sync_upsert_payload_v1(
  p_object_type text,
  p_object_id text,
  p_base_revision bigint,
  p_payload jsonb
)
returns void
language plpgsql
immutable
security definer
set search_path = pg_catalog, aha
as $function$
declare
  v_version jsonb;
  v_position integer;
  v_confidence numeric;
begin
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'sync upsert payload must be an object' using errcode='22023';
  end if;
  if p_payload ? 'id' and btrim(coalesce(p_payload->>'id','')) <> p_object_id then
    raise exception 'sync payload id does not match object id' using errcode='22023';
  end if;
  if p_payload ?| array['workspace_id','created_by_profile_id','author_profile_id'] then
    raise exception 'sync payload contains server-owned identity fields' using errcode='22023';
  end if;
  if nullif(p_payload->>'deleted_at','') is not null then
    raise exception 'use delete operation instead of deleted_at in upsert payload' using errcode='22023';
  end if;
  if p_payload ? 'revision' and (p_payload->>'revision')::bigint <> p_base_revision then
    raise exception 'payload revision does not match base revision' using errcode='22023';
  end if;
  if p_payload ? 'metadata' and jsonb_typeof(p_payload->'metadata') <> 'object' then
    raise exception 'metadata must be an object' using errcode='22023';
  end if;

  case p_object_type
    when 'conversation' then
      if length(btrim(coalesce(p_payload->>'title',''))) = 0 then raise exception 'conversation title required' using errcode='22023'; end if;
      if coalesce(nullif(p_payload->>'conversation_type',''),'personal_ai') not in ('personal_ai','reflection','imported') then raise exception 'invalid sync conversation type' using errcode='22023'; end if;
      if coalesce(nullif(p_payload->>'status',''),'active') not in ('active','archived') then raise exception 'invalid sync conversation status' using errcode='22023'; end if;
      if length(btrim(coalesce(nullif(p_payload->>'source_app',''),'aha_chat'))) = 0 then raise exception 'conversation source_app required' using errcode='22023'; end if;

    when 'message' then
      if length(btrim(coalesce(p_payload->>'conversation_id',''))) = 0 then raise exception 'message conversation_id required' using errcode='22023'; end if;
      if coalesce(p_payload->>'role','') not in ('user','assistant','system','tool') then raise exception 'invalid message role' using errcode='22023'; end if;
      if length(btrim(coalesce(p_payload->>'content',''))) = 0 then raise exception 'message content required' using errcode='22023'; end if;
      if length(btrim(coalesce(nullif(p_payload->>'source_app',''),'aha_chat'))) = 0 then raise exception 'message source_app required' using errcode='22023'; end if;
      if p_payload ? 'tags' and jsonb_typeof(p_payload->'tags') <> 'array' then raise exception 'message tags must be an array' using errcode='22023'; end if;
      if p_payload ? 'concepts' and jsonb_typeof(p_payload->'concepts') <> 'array' then raise exception 'message concepts must be an array' using errcode='22023'; end if;

    when 'source_event' then
      if length(btrim(coalesce(p_payload->>'source_type',''))) = 0 then raise exception 'source_event source_type required' using errcode='22023'; end if;
      if length(btrim(coalesce(p_payload->>'source_app',''))) = 0 then raise exception 'source_event source_app required' using errcode='22023'; end if;
      if length(btrim(coalesce(p_payload->>'content_type',''))) = 0 then raise exception 'source_event content_type required' using errcode='22023'; end if;
      if length(btrim(coalesce(p_payload->>'title',''))) = 0 and length(btrim(coalesce(p_payload->>'source_text',''))) = 0 then raise exception 'source_event title or source_text required' using errcode='22023'; end if;
      if p_payload ? 'tags' and jsonb_typeof(p_payload->'tags') <> 'array' then raise exception 'source_event tags must be an array' using errcode='22023'; end if;
      if p_payload ? 'provenance' and jsonb_typeof(p_payload->'provenance') <> 'object' then raise exception 'source_event provenance must be an object' using errcode='22023'; end if;

    when 'insight' then
      if length(btrim(coalesce(nullif(p_payload->>'functional_type',''),'observation'))) = 0 then raise exception 'insight functional_type required' using errcode='22023'; end if;
      if coalesce(nullif(p_payload->>'status',''),'active') not in ('active','superseded','contested','stale','irrelevant','archived') then raise exception 'invalid insight status' using errcode='22023'; end if;
      if coalesce(nullif(p_payload->>'sharing_scope',''),'private') <> 'private' then raise exception 'sync insight must stay private' using errcode='22023'; end if;
      v_version:=p_payload->'version';
      if jsonb_typeof(v_version) <> 'object' then raise exception 'insight version object required' using errcode='22023'; end if;
      if length(btrim(coalesce(v_version->>'title',''))) = 0 then raise exception 'insight version title required' using errcode='22023'; end if;
      if length(btrim(coalesce(v_version->>'summary',''))) = 0 and length(btrim(coalesce(v_version->>'insight_text',''))) = 0 then raise exception 'insight summary or insight_text required' using errcode='22023'; end if;
      if v_version ? 'concepts' and jsonb_typeof(v_version->'concepts') <> 'array' then raise exception 'insight concepts must be an array' using errcode='22023'; end if;
      if v_version ? 'provenance' and jsonb_typeof(v_version->'provenance') <> 'object' then raise exception 'insight provenance must be an object' using errcode='22023'; end if;
      if nullif(v_version->>'confidence','') is not null then
        v_confidence:=(v_version->>'confidence')::numeric;
        if v_confidence < 0 or v_confidence > 1 then raise exception 'insight confidence out of range' using errcode='22023'; end if;
      end if;

    when 'concept_list' then
      if length(btrim(coalesce(p_payload->>'title',''))) = 0 then raise exception 'concept_list title required' using errcode='22023'; end if;
      if length(btrim(coalesce(p_payload->>'list_type',''))) = 0 then raise exception 'concept_list list_type required' using errcode='22023'; end if;
      if length(btrim(coalesce(nullif(p_payload->>'source',''),'aha_lists'))) = 0 then raise exception 'concept_list source required' using errcode='22023'; end if;
      if coalesce(nullif(p_payload->>'sharing_scope',''),'private') <> 'private' then raise exception 'sync concept_list must stay private' using errcode='22023'; end if;
      if p_payload ? 'tags' and jsonb_typeof(p_payload->'tags') <> 'array' then raise exception 'concept_list tags must be an array' using errcode='22023'; end if;

    when 'concept_list_item' then
      if length(btrim(coalesce(p_payload->>'list_id',''))) = 0 then raise exception 'concept_list_item list_id required' using errcode='22023'; end if;
      if length(btrim(coalesce(p_payload->>'title',''))) = 0 then raise exception 'concept_list_item title required' using errcode='22023'; end if;
      if length(btrim(coalesce(p_payload->>'item_type',''))) = 0 then raise exception 'concept_list_item item_type required' using errcode='22023'; end if;
      if length(btrim(coalesce(p_payload->>'source',''))) = 0 then raise exception 'concept_list_item source required' using errcode='22023'; end if;
      v_position:=coalesce(nullif(p_payload->>'position','')::integer,0);
      if v_position < 0 then raise exception 'concept_list_item position must be non-negative' using errcode='22023'; end if;

    when 'knowledge_path' then
      if length(btrim(coalesce(p_payload->>'title',''))) = 0 then raise exception 'knowledge_path title required' using errcode='22023'; end if;
      if length(btrim(coalesce(p_payload->>'path_type',''))) = 0 then raise exception 'knowledge_path path_type required' using errcode='22023'; end if;
      if length(btrim(coalesce(nullif(p_payload->>'source',''),'aha_paths'))) = 0 then raise exception 'knowledge_path source required' using errcode='22023'; end if;
      if coalesce(nullif(p_payload->>'sharing_scope',''),'private') <> 'private' then raise exception 'sync knowledge_path must stay private' using errcode='22023'; end if;
      if p_payload ? 'tags' and jsonb_typeof(p_payload->'tags') <> 'array' then raise exception 'knowledge_path tags must be an array' using errcode='22023'; end if;

    when 'knowledge_path_step' then
      if length(btrim(coalesce(p_payload->>'path_id',''))) = 0 then raise exception 'knowledge_path_step path_id required' using errcode='22023'; end if;
      if length(btrim(coalesce(p_payload->>'title',''))) = 0 then raise exception 'knowledge_path_step title required' using errcode='22023'; end if;
      if length(btrim(coalesce(p_payload->>'step_type',''))) = 0 then raise exception 'knowledge_path_step step_type required' using errcode='22023'; end if;
      if length(btrim(coalesce(p_payload->>'source',''))) = 0 then raise exception 'knowledge_path_step source required' using errcode='22023'; end if;
      if coalesce(nullif(p_payload->>'status',''),'planned') not in ('planned','active','done','skipped') then raise exception 'invalid knowledge_path_step status' using errcode='22023'; end if;
      v_position:=coalesce(nullif(p_payload->>'position','')::integer,0);
      if v_position < 0 then raise exception 'knowledge_path_step position must be non-negative' using errcode='22023'; end if;

    when 'article' then
      if length(btrim(coalesce(p_payload->>'section',''))) = 0 then raise exception 'article section required' using errcode='22023'; end if;
      if coalesce(nullif(p_payload->>'status',''),'draft') not in ('draft','review','ready','published_local') then raise exception 'invalid local sync article status' using errcode='22023'; end if;
      if coalesce(nullif(p_payload->>'publication_scope',''),'personal') <> 'personal' then raise exception 'sync article must stay personal' using errcode='22023'; end if;
      if length(btrim(coalesce(nullif(p_payload->>'source',''),'aha_avisa'))) = 0 then raise exception 'article source required' using errcode='22023'; end if;
      if p_payload ? 'tags' and jsonb_typeof(p_payload->'tags') <> 'array' then raise exception 'article tags must be an array' using errcode='22023'; end if;
      v_version:=p_payload->'version';
      if jsonb_typeof(v_version) <> 'object' then raise exception 'article version object required' using errcode='22023'; end if;
      if length(btrim(coalesce(v_version->>'title',''))) = 0 then raise exception 'article version title required' using errcode='22023'; end if;
      if length(btrim(coalesce(v_version->>'summary',''))) = 0 and length(btrim(coalesce(v_version->>'body',''))) = 0 then raise exception 'article summary or body required' using errcode='22023'; end if;
      if v_version ? 'provenance' and jsonb_typeof(v_version->'provenance') <> 'object' then raise exception 'article provenance must be an object' using errcode='22023'; end if;

    when 'article_reference' then
      if length(btrim(coalesce(p_payload->>'article_id',''))) = 0 then raise exception 'article_reference article_id required' using errcode='22023'; end if;
      if length(btrim(coalesce(p_payload->>'title',''))) = 0 then raise exception 'article_reference title required' using errcode='22023'; end if;
      if length(btrim(coalesce(p_payload->>'reference_type',''))) = 0 then raise exception 'article_reference reference_type required' using errcode='22023'; end if;
      if length(btrim(coalesce(p_payload->>'source',''))) = 0 then raise exception 'article_reference source required' using errcode='22023'; end if;
      if length(btrim(coalesce(p_payload->>'ref_id',''))) = 0 then raise exception 'article_reference ref_id required' using errcode='22023'; end if;
      v_position:=coalesce(nullif(p_payload->>'position','')::integer,0);
      if v_position < 0 then raise exception 'article_reference position must be non-negative' using errcode='22023'; end if;

    else
      raise exception 'unsupported canonical sync object type' using errcode='22023';
  end case;
end;
$function$;
revoke all on function aha.assert_sync_upsert_payload_v1(text,text,bigint,jsonb) from public;

create or replace function aha.sync_server_payload_hash_v1(
  p_workspace_id text,
  p_object_type text,
  p_object_id text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, aha
as $function$
declare
  v_snapshot jsonb;
  v_hash_input jsonb;
begin
  v_snapshot:=aha.sync_object_snapshot_v1(p_workspace_id,p_object_type,p_object_id);
  if v_snapshot is null then return null; end if;
  if nullif(v_snapshot->>'deleted_at','') is not null then
    v_hash_input:=jsonb_build_object(
      'id',p_object_id,
      'revision',(v_snapshot->>'revision')::bigint,
      'deleted_at',v_snapshot->>'deleted_at'
    );
  else
    v_hash_input:=v_snapshot;
  end if;
  return encode(aha.digest(v_hash_input::text,'sha256'),'hex');
end;
$function$;
revoke all on function aha.sync_server_payload_hash_v1(text,text,text) from public;

create or replace function aha.sync_apply_upsert_v1(
  p_workspace_id text,
  p_profile_id text,
  p_object_type text,
  p_object_id text,
  p_payload jsonb,
  p_create boolean
)
returns bigint
language plpgsql
volatile
security definer
set search_path = pg_catalog, aha
as $function$
declare
  v_revision bigint;
  v_parent_id text;
  v_message_id text;
  v_created timestamptz;
  v_version jsonb;
  v_next_version integer;
begin
  case p_object_type
    when 'conversation' then
      if p_create then
        v_created:=coalesce(nullif(p_payload->>'created_at','')::timestamptz,now());
        insert into aha.conversations(
          id,workspace_id,created_by_profile_id,conversation_type,title,status,source_app,
          metadata,created_at,updated_at,deleted_at
        ) values (
          p_object_id,p_workspace_id,p_profile_id,
          coalesce(nullif(p_payload->>'conversation_type',''),'personal_ai'),p_payload->>'title',
          coalesce(nullif(p_payload->>'status',''),'active'),coalesce(nullif(p_payload->>'source_app',''),'aha_chat'),
          coalesce(p_payload->'metadata','{}'::jsonb),v_created,v_created,null
        ) returning revision into v_revision;
        insert into aha.conversation_participants(id,workspace_id,conversation_id,profile_id,participant_type,participant_key,role,joined_at,metadata)
        values(aha.new_id(),p_workspace_id,p_object_id,p_profile_id,'profile','profile:'||p_profile_id,'owner',v_created,jsonb_build_object('created_by','canonical_sync_v1'))
        on conflict(conversation_id,participant_key) do nothing;
        insert into aha.conversation_participants(id,workspace_id,conversation_id,profile_id,participant_type,participant_key,role,joined_at,metadata)
        values(aha.new_id(),p_workspace_id,p_object_id,null,'assistant','assistant:aha','assistant',v_created,jsonb_build_object('created_by','canonical_sync_v1'))
        on conflict(conversation_id,participant_key) do nothing;
      else
        update aha.conversations set
          conversation_type=coalesce(nullif(p_payload->>'conversation_type',''),'personal_ai'),
          title=p_payload->>'title',
          status=coalesce(nullif(p_payload->>'status',''),'active'),
          source_app=coalesce(nullif(p_payload->>'source_app',''),'aha_chat'),
          metadata=coalesce(p_payload->'metadata','{}'::jsonb),
          deleted_at=null
        where workspace_id=p_workspace_id and id=p_object_id
        returning revision into v_revision;
      end if;

    when 'message' then
      v_parent_id:=p_payload->>'conversation_id';
      if not exists(select 1 from aha.conversations c where c.workspace_id=p_workspace_id and c.id=v_parent_id and c.deleted_at is null) then
        raise exception 'message parent conversation missing' using errcode='23503';
      end if;
      if p_create then
        v_created:=coalesce(nullif(p_payload->>'created_at','')::timestamptz,now());
        insert into aha.messages(
          id,workspace_id,conversation_id,author_profile_id,role,content,content_hash,source_app,
          intent,project,tags,concepts,metadata,created_at,updated_at,deleted_at
        ) values (
          p_object_id,p_workspace_id,v_parent_id,
          case when p_payload->>'role'='user' then p_profile_id else null end,
          p_payload->>'role',p_payload->>'content',encode(aha.digest(p_payload->>'content','sha256'),'hex'),
          coalesce(nullif(p_payload->>'source_app',''),'aha_chat'),nullif(p_payload->>'intent',''),nullif(p_payload->>'project',''),
          coalesce(p_payload->'tags','[]'::jsonb),coalesce(p_payload->'concepts','[]'::jsonb),coalesce(p_payload->'metadata','{}'::jsonb),
          v_created,v_created,null
        ) returning revision into v_revision;
      else
        update aha.messages set
          conversation_id=v_parent_id,
          author_profile_id=case when p_payload->>'role'='user' then p_profile_id else null end,
          role=p_payload->>'role',content=p_payload->>'content',
          content_hash=encode(aha.digest(p_payload->>'content','sha256'),'hex'),
          source_app=coalesce(nullif(p_payload->>'source_app',''),'aha_chat'),
          intent=nullif(p_payload->>'intent',''),project=nullif(p_payload->>'project',''),
          tags=coalesce(p_payload->'tags','[]'::jsonb),concepts=coalesce(p_payload->'concepts','[]'::jsonb),
          metadata=coalesce(p_payload->'metadata','{}'::jsonb),deleted_at=null
        where workspace_id=p_workspace_id and id=p_object_id
        returning revision into v_revision;
      end if;

    when 'source_event' then
      v_parent_id:=nullif(p_payload->>'conversation_id','');
      v_message_id:=nullif(p_payload->>'message_id','');
      if v_parent_id is not null and not exists(select 1 from aha.conversations c where c.workspace_id=p_workspace_id and c.id=v_parent_id and c.deleted_at is null) then
        raise exception 'source_event conversation missing' using errcode='23503';
      end if;
      if v_message_id is not null and not exists(select 1 from aha.messages m where m.workspace_id=p_workspace_id and m.id=v_message_id and m.deleted_at is null) then
        raise exception 'source_event message missing' using errcode='23503';
      end if;
      if v_parent_id is not null and v_message_id is not null and not exists(select 1 from aha.messages m where m.workspace_id=p_workspace_id and m.id=v_message_id and m.conversation_id=v_parent_id) then
        raise exception 'source_event message/conversation mismatch' using errcode='23503';
      end if;
      if p_create then
        v_created:=coalesce(nullif(p_payload->>'created_at','')::timestamptz,nullif(p_payload->>'occurred_at','')::timestamptz,now());
        insert into aha.source_events(
          id,workspace_id,created_by_profile_id,conversation_id,message_id,source_type,source_app,content_type,
          title,source_text,content_hash,user_created,imported,occurred_at,tags,provenance,metadata,created_at,updated_at,deleted_at
        ) values (
          p_object_id,p_workspace_id,p_profile_id,v_parent_id,v_message_id,p_payload->>'source_type',p_payload->>'source_app',p_payload->>'content_type',
          coalesce(p_payload->>'title',''),coalesce(p_payload->>'source_text',''),encode(aha.digest(coalesce(p_payload->>'source_text',''),'sha256'),'hex'),
          coalesce(nullif(p_payload->>'user_created','')::boolean,true),coalesce(nullif(p_payload->>'imported','')::boolean,false),
          coalesce(nullif(p_payload->>'occurred_at','')::timestamptz,v_created),coalesce(p_payload->'tags','[]'::jsonb),
          coalesce(p_payload->'provenance','{}'::jsonb),coalesce(p_payload->'metadata','{}'::jsonb),v_created,v_created,null
        ) returning revision into v_revision;
      else
        update aha.source_events set
          created_by_profile_id=p_profile_id,conversation_id=v_parent_id,message_id=v_message_id,
          source_type=p_payload->>'source_type',source_app=p_payload->>'source_app',content_type=p_payload->>'content_type',
          title=coalesce(p_payload->>'title',''),source_text=coalesce(p_payload->>'source_text',''),
          content_hash=encode(aha.digest(coalesce(p_payload->>'source_text',''),'sha256'),'hex'),
          user_created=coalesce(nullif(p_payload->>'user_created','')::boolean,true),imported=coalesce(nullif(p_payload->>'imported','')::boolean,false),
          occurred_at=coalesce(nullif(p_payload->>'occurred_at','')::timestamptz,occurred_at),tags=coalesce(p_payload->'tags','[]'::jsonb),
          provenance=coalesce(p_payload->'provenance','{}'::jsonb),metadata=coalesce(p_payload->'metadata','{}'::jsonb),deleted_at=null
        where workspace_id=p_workspace_id and id=p_object_id
        returning revision into v_revision;
      end if;

    when 'insight' then
      if nullif(p_payload->>'source_event_id','') is not null and not exists(select 1 from aha.source_events s where s.workspace_id=p_workspace_id and s.id=p_payload->>'source_event_id') then
        raise exception 'insight source_event missing' using errcode='23503';
      end if;
      if nullif(p_payload->>'analysis_run_id','') is not null and not exists(select 1 from aha.analysis_runs r where r.workspace_id=p_workspace_id and r.id=p_payload->>'analysis_run_id') then
        raise exception 'insight analysis_run missing' using errcode='23503';
      end if;
      v_version:=p_payload->'version';
      if p_create then
        v_created:=coalesce(nullif(p_payload->>'created_at','')::timestamptz,now());
        insert into aha.insights(
          id,workspace_id,created_by_profile_id,source_event_id,analysis_run_id,subject_id,theme_id,functional_type,status,
          sharing_scope,current_version,metadata,created_at,updated_at,deleted_at
        ) values (
          p_object_id,p_workspace_id,p_profile_id,nullif(p_payload->>'source_event_id',''),nullif(p_payload->>'analysis_run_id',''),
          nullif(p_payload->>'subject_id',''),nullif(p_payload->>'theme_id',''),coalesce(nullif(p_payload->>'functional_type',''),'observation'),
          coalesce(nullif(p_payload->>'status',''),'active'),'private',1,coalesce(p_payload->'metadata','{}'::jsonb),v_created,v_created,null
        ) returning revision into v_revision;
        insert into aha.insight_versions(insight_id,workspace_id,version,created_by_profile_id,title,summary,insight_text,concepts,confidence,provenance,created_at)
        values(p_object_id,p_workspace_id,1,p_profile_id,v_version->>'title',coalesce(v_version->>'summary',''),coalesce(v_version->>'insight_text',''),
          coalesce(v_version->'concepts','[]'::jsonb),nullif(v_version->>'confidence','')::numeric,coalesce(v_version->'provenance','{}'::jsonb),
          coalesce(nullif(v_version->>'created_at','')::timestamptz,v_created));
      else
        select i.current_version+1 into v_next_version from aha.insights i where i.workspace_id=p_workspace_id and i.id=p_object_id;
        insert into aha.insight_versions(insight_id,workspace_id,version,created_by_profile_id,title,summary,insight_text,concepts,confidence,provenance,created_at)
        values(p_object_id,p_workspace_id,v_next_version,p_profile_id,v_version->>'title',coalesce(v_version->>'summary',''),coalesce(v_version->>'insight_text',''),
          coalesce(v_version->'concepts','[]'::jsonb),nullif(v_version->>'confidence','')::numeric,coalesce(v_version->'provenance','{}'::jsonb),now());
        update aha.insights set
          source_event_id=nullif(p_payload->>'source_event_id',''),analysis_run_id=nullif(p_payload->>'analysis_run_id',''),
          subject_id=nullif(p_payload->>'subject_id',''),theme_id=nullif(p_payload->>'theme_id',''),
          functional_type=coalesce(nullif(p_payload->>'functional_type',''),'observation'),status=coalesce(nullif(p_payload->>'status',''),'active'),
          sharing_scope='private',current_version=v_next_version,metadata=coalesce(p_payload->'metadata','{}'::jsonb),deleted_at=null
        where workspace_id=p_workspace_id and id=p_object_id returning revision into v_revision;
      end if;

    when 'concept_list' then
      if p_create then
        v_created:=coalesce(nullif(p_payload->>'created_at','')::timestamptz,now());
        insert into aha.concept_lists(id,workspace_id,created_by_profile_id,title,list_type,description,source,sharing_scope,tags,metadata,created_at,updated_at,deleted_at)
        values(p_object_id,p_workspace_id,p_profile_id,p_payload->>'title',p_payload->>'list_type',coalesce(p_payload->>'description',''),
          coalesce(nullif(p_payload->>'source',''),'aha_lists'),'private',coalesce(p_payload->'tags','[]'::jsonb),coalesce(p_payload->'metadata','{}'::jsonb),v_created,v_created,null)
        returning revision into v_revision;
      else
        update aha.concept_lists set title=p_payload->>'title',list_type=p_payload->>'list_type',description=coalesce(p_payload->>'description',''),
          source=coalesce(nullif(p_payload->>'source',''),'aha_lists'),sharing_scope='private',tags=coalesce(p_payload->'tags','[]'::jsonb),
          metadata=coalesce(p_payload->'metadata','{}'::jsonb),deleted_at=null
        where workspace_id=p_workspace_id and id=p_object_id returning revision into v_revision;
      end if;

    when 'concept_list_item' then
      v_parent_id:=p_payload->>'list_id';
      if not exists(select 1 from aha.concept_lists l where l.workspace_id=p_workspace_id and l.id=v_parent_id and l.deleted_at is null) then
        raise exception 'concept_list_item parent missing' using errcode='23503';
      end if;
      if p_create then
        v_created:=coalesce(nullif(p_payload->>'added_at','')::timestamptz,now());
        insert into aha.concept_list_items(id,workspace_id,list_id,title,item_type,source,ref_id,position,added_at,metadata,updated_at,deleted_at)
        values(p_object_id,p_workspace_id,v_parent_id,p_payload->>'title',p_payload->>'item_type',p_payload->>'source',nullif(p_payload->>'ref_id',''),
          coalesce(nullif(p_payload->>'position','')::integer,0),v_created,coalesce(p_payload->'metadata','{}'::jsonb),v_created,null)
        returning revision into v_revision;
      else
        update aha.concept_list_items set list_id=v_parent_id,title=p_payload->>'title',item_type=p_payload->>'item_type',source=p_payload->>'source',
          ref_id=nullif(p_payload->>'ref_id',''),position=coalesce(nullif(p_payload->>'position','')::integer,0),metadata=coalesce(p_payload->'metadata','{}'::jsonb),deleted_at=null
        where workspace_id=p_workspace_id and id=p_object_id returning revision into v_revision;
      end if;

    when 'knowledge_path' then
      if p_create then
        v_created:=coalesce(nullif(p_payload->>'created_at','')::timestamptz,now());
        insert into aha.knowledge_paths(id,workspace_id,created_by_profile_id,title,path_type,description,goal,learning_outcome,source,sharing_scope,tags,metadata,created_at,updated_at,deleted_at)
        values(p_object_id,p_workspace_id,p_profile_id,p_payload->>'title',p_payload->>'path_type',coalesce(p_payload->>'description',''),coalesce(p_payload->>'goal',''),
          coalesce(p_payload->>'learning_outcome',''),coalesce(nullif(p_payload->>'source',''),'aha_paths'),'private',coalesce(p_payload->'tags','[]'::jsonb),
          coalesce(p_payload->'metadata','{}'::jsonb),v_created,v_created,null)
        returning revision into v_revision;
      else
        update aha.knowledge_paths set title=p_payload->>'title',path_type=p_payload->>'path_type',description=coalesce(p_payload->>'description',''),
          goal=coalesce(p_payload->>'goal',''),learning_outcome=coalesce(p_payload->>'learning_outcome',''),source=coalesce(nullif(p_payload->>'source',''),'aha_paths'),
          sharing_scope='private',tags=coalesce(p_payload->'tags','[]'::jsonb),metadata=coalesce(p_payload->'metadata','{}'::jsonb),deleted_at=null
        where workspace_id=p_workspace_id and id=p_object_id returning revision into v_revision;
      end if;

    when 'knowledge_path_step' then
      v_parent_id:=p_payload->>'path_id';
      if not exists(select 1 from aha.knowledge_paths p where p.workspace_id=p_workspace_id and p.id=v_parent_id and p.deleted_at is null) then
        raise exception 'knowledge_path_step parent missing' using errcode='23503';
      end if;
      if p_create then
        v_created:=coalesce(nullif(p_payload->>'added_at','')::timestamptz,now());
        insert into aha.knowledge_path_steps(id,workspace_id,path_id,title,step_type,source,ref_id,position,status,narrative,learning_outcome,completion_criterion,added_at,metadata,updated_at,deleted_at)
        values(p_object_id,p_workspace_id,v_parent_id,p_payload->>'title',p_payload->>'step_type',p_payload->>'source',nullif(p_payload->>'ref_id',''),
          coalesce(nullif(p_payload->>'position','')::integer,0),coalesce(nullif(p_payload->>'status',''),'planned'),coalesce(p_payload->>'narrative',''),
          coalesce(p_payload->>'learning_outcome',''),coalesce(p_payload->>'completion_criterion',''),v_created,coalesce(p_payload->'metadata','{}'::jsonb),v_created,null)
        returning revision into v_revision;
      else
        update aha.knowledge_path_steps set path_id=v_parent_id,title=p_payload->>'title',step_type=p_payload->>'step_type',source=p_payload->>'source',
          ref_id=nullif(p_payload->>'ref_id',''),position=coalesce(nullif(p_payload->>'position','')::integer,0),status=coalesce(nullif(p_payload->>'status',''),'planned'),
          narrative=coalesce(p_payload->>'narrative',''),learning_outcome=coalesce(p_payload->>'learning_outcome',''),completion_criterion=coalesce(p_payload->>'completion_criterion',''),
          metadata=coalesce(p_payload->'metadata','{}'::jsonb),deleted_at=null
        where workspace_id=p_workspace_id and id=p_object_id returning revision into v_revision;
      end if;

    when 'article' then
      v_version:=p_payload->'version';
      if p_create then
        v_created:=coalesce(nullif(p_payload->>'created_at','')::timestamptz,now());
        insert into aha.articles(id,workspace_id,created_by_profile_id,section,status,publication_scope,current_version,source,tags,metadata,created_at,updated_at,deleted_at)
        values(p_object_id,p_workspace_id,p_profile_id,p_payload->>'section',coalesce(nullif(p_payload->>'status',''),'draft'),'personal',1,
          coalesce(nullif(p_payload->>'source',''),'aha_avisa'),coalesce(p_payload->'tags','[]'::jsonb),coalesce(p_payload->'metadata','{}'::jsonb),v_created,v_created,null)
        returning revision into v_revision;
        insert into aha.article_versions(article_id,workspace_id,version,created_by_profile_id,title,summary,body,provenance,created_at)
        values(p_object_id,p_workspace_id,1,p_profile_id,v_version->>'title',coalesce(v_version->>'summary',''),coalesce(v_version->>'body',''),
          coalesce(v_version->'provenance','{}'::jsonb),coalesce(nullif(v_version->>'created_at','')::timestamptz,v_created));
      else
        select a.current_version+1 into v_next_version from aha.articles a where a.workspace_id=p_workspace_id and a.id=p_object_id;
        insert into aha.article_versions(article_id,workspace_id,version,created_by_profile_id,title,summary,body,provenance,created_at)
        values(p_object_id,p_workspace_id,v_next_version,p_profile_id,v_version->>'title',coalesce(v_version->>'summary',''),coalesce(v_version->>'body',''),coalesce(v_version->'provenance','{}'::jsonb),now());
        update aha.articles set section=p_payload->>'section',status=coalesce(nullif(p_payload->>'status',''),'draft'),publication_scope='personal',
          current_version=v_next_version,source=coalesce(nullif(p_payload->>'source',''),'aha_avisa'),tags=coalesce(p_payload->'tags','[]'::jsonb),
          metadata=coalesce(p_payload->'metadata','{}'::jsonb),deleted_at=null
        where workspace_id=p_workspace_id and id=p_object_id returning revision into v_revision;
      end if;

    when 'article_reference' then
      v_parent_id:=p_payload->>'article_id';
      if not exists(select 1 from aha.articles a where a.workspace_id=p_workspace_id and a.id=v_parent_id and a.deleted_at is null) then
        raise exception 'article_reference parent missing' using errcode='23503';
      end if;
      if p_create then
        v_created:=coalesce(nullif(p_payload->>'added_at','')::timestamptz,now());
        insert into aha.article_references(id,workspace_id,article_id,title,reference_type,source,ref_id,position,added_at,deleted_at,metadata,updated_at)
        values(p_object_id,p_workspace_id,v_parent_id,p_payload->>'title',p_payload->>'reference_type',p_payload->>'source',p_payload->>'ref_id',
          coalesce(nullif(p_payload->>'position','')::integer,0),v_created,null,coalesce(p_payload->'metadata','{}'::jsonb),v_created)
        returning revision into v_revision;
      else
        update aha.article_references set article_id=v_parent_id,title=p_payload->>'title',reference_type=p_payload->>'reference_type',source=p_payload->>'source',
          ref_id=p_payload->>'ref_id',position=coalesce(nullif(p_payload->>'position','')::integer,0),metadata=coalesce(p_payload->'metadata','{}'::jsonb),deleted_at=null
        where workspace_id=p_workspace_id and id=p_object_id returning revision into v_revision;
      end if;

    else
      raise exception 'unsupported canonical sync object type' using errcode='22023';
  end case;

  if v_revision is null then
    raise exception 'canonical sync object write failed' using errcode='P0001';
  end if;
  return v_revision;
end;
$function$;
revoke all on function aha.sync_apply_upsert_v1(text,text,text,text,jsonb,boolean) from public;

create or replace function aha.sync_apply_delete_v1(
  p_workspace_id text,
  p_object_type text,
  p_object_id text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = pg_catalog, aha
as $function$
declare
  v_revision bigint;
begin
  case p_object_type
    when 'conversation' then update aha.conversations set status='deleted',deleted_at=now() where workspace_id=p_workspace_id and id=p_object_id returning revision into v_revision;
    when 'message' then update aha.messages set deleted_at=now() where workspace_id=p_workspace_id and id=p_object_id returning revision into v_revision;
    when 'source_event' then update aha.source_events set deleted_at=now() where workspace_id=p_workspace_id and id=p_object_id returning revision into v_revision;
    when 'insight' then update aha.insights set status='deleted',deleted_at=now() where workspace_id=p_workspace_id and id=p_object_id returning revision into v_revision;
    when 'concept_list' then update aha.concept_lists set deleted_at=now() where workspace_id=p_workspace_id and id=p_object_id returning revision into v_revision;
    when 'concept_list_item' then update aha.concept_list_items set deleted_at=now() where workspace_id=p_workspace_id and id=p_object_id returning revision into v_revision;
    when 'knowledge_path' then update aha.knowledge_paths set deleted_at=now() where workspace_id=p_workspace_id and id=p_object_id returning revision into v_revision;
    when 'knowledge_path_step' then update aha.knowledge_path_steps set deleted_at=now() where workspace_id=p_workspace_id and id=p_object_id returning revision into v_revision;
    when 'article' then update aha.articles set status='deleted',deleted_at=now() where workspace_id=p_workspace_id and id=p_object_id returning revision into v_revision;
    when 'article_reference' then update aha.article_references set deleted_at=now() where workspace_id=p_workspace_id and id=p_object_id returning revision into v_revision;
    else raise exception 'unsupported canonical sync object type' using errcode='22023';
  end case;
  if v_revision is null then raise exception 'canonical sync object delete failed' using errcode='P0001'; end if;
  return v_revision;
end;
$function$;
revoke all on function aha.sync_apply_delete_v1(text,text,text) from public;

insert into aha.schema_versions(version,description,metadata)
values(
  'aha_canonical_sync_write_helpers_v1',
  'Internal typed, private-scope canonical sync write helpers with row locking and uniform revision semantics.',
  pg_catalog.jsonb_build_object(
    'runtime_activated',false,
    'frontend_sync_activated',false,
    'auto_sync',false,
    'login_triggers_sync',false,
    'helpers_public',false,
    'dynamic_sql',false,
    'public_or_workspace_sharing_writes',false,
    'article_reference_revision_trigger',true
  )
)
on conflict(version) do update set description=excluded.description,metadata=excluded.metadata,applied_at=pg_catalog.now();

commit;
