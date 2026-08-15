-- AHA canonical sync read boundary v1
--
-- Read-only SECURITY DEFINER functions for bootstrap and monotone delta pull.
-- These functions do not activate browser sync, grant table access or write
-- canonical/domain data. The journal remains metadata; domain tables remain SoR.

begin;

create or replace function aha.sync_object_snapshot_v1(
  p_workspace_id text,
  p_object_type text,
  p_object_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, aha
as $function$
declare
  v_result jsonb;
begin
  if length(btrim(coalesce(p_workspace_id, ''))) = 0
     or length(btrim(coalesce(p_object_id, ''))) = 0 then
    raise exception 'workspace and object id are required' using errcode = '22023';
  end if;

  case p_object_type
    when 'conversation' then
      select to_jsonb(c) - 'workspace_id' - 'created_by_profile_id'
        into v_result
      from aha.conversations c
      where c.workspace_id = p_workspace_id and c.id = p_object_id;

    when 'message' then
      select to_jsonb(m) - 'workspace_id' - 'author_profile_id'
        into v_result
      from aha.messages m
      where m.workspace_id = p_workspace_id and m.id = p_object_id;

    when 'source_event' then
      select to_jsonb(s) - 'workspace_id' - 'created_by_profile_id'
        into v_result
      from aha.source_events s
      where s.workspace_id = p_workspace_id and s.id = p_object_id;

    when 'insight' then
      select
        (to_jsonb(i) - 'workspace_id' - 'created_by_profile_id')
        || jsonb_build_object(
          'version',
          to_jsonb(v) - 'workspace_id' - 'created_by_profile_id' - 'insight_id'
        )
        into v_result
      from aha.insights i
      join aha.insight_versions v
        on v.insight_id = i.id
       and v.workspace_id = i.workspace_id
       and v.version = i.current_version
      where i.workspace_id = p_workspace_id and i.id = p_object_id;

    when 'concept_list' then
      select to_jsonb(l) - 'workspace_id' - 'created_by_profile_id'
        into v_result
      from aha.concept_lists l
      where l.workspace_id = p_workspace_id and l.id = p_object_id;

    when 'concept_list_item' then
      select to_jsonb(li) - 'workspace_id'
        into v_result
      from aha.concept_list_items li
      where li.workspace_id = p_workspace_id and li.id = p_object_id;

    when 'knowledge_path' then
      select to_jsonb(p) - 'workspace_id' - 'created_by_profile_id'
        into v_result
      from aha.knowledge_paths p
      where p.workspace_id = p_workspace_id and p.id = p_object_id;

    when 'knowledge_path_step' then
      select to_jsonb(ps) - 'workspace_id'
        into v_result
      from aha.knowledge_path_steps ps
      where ps.workspace_id = p_workspace_id and ps.id = p_object_id;

    when 'article' then
      select
        (to_jsonb(a) - 'workspace_id' - 'created_by_profile_id')
        || jsonb_build_object(
          'version',
          to_jsonb(v) - 'workspace_id' - 'created_by_profile_id' - 'article_id'
        )
        into v_result
      from aha.articles a
      join aha.article_versions v
        on v.article_id = a.id
       and v.workspace_id = a.workspace_id
       and v.version = a.current_version
      where a.workspace_id = p_workspace_id and a.id = p_object_id;

    when 'article_reference' then
      select to_jsonb(ar) - 'workspace_id'
        into v_result
      from aha.article_references ar
      where ar.workspace_id = p_workspace_id and ar.id = p_object_id;

    else
      raise exception 'unsupported canonical sync object type' using errcode = '22023';
  end case;

  return v_result;
end;
$function$;

revoke all on function aha.sync_object_snapshot_v1(text,text,text) from public;

create or replace function aha.pull_sync_changes_v1(
  p_workspace_id text,
  p_after_cursor bigint default 0,
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, aha
as $function$
declare
  v_result jsonb;
begin
  if aha.current_profile_id() is null then
    raise exception 'authenticated canonical profile required' using errcode = '42501';
  end if;
  if not aha.can_read_workspace(p_workspace_id) then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;
  if p_after_cursor < 0 then
    raise exception 'after cursor must be non-negative' using errcode = '22023';
  end if;
  if p_limit < 1 or p_limit > 500 then
    raise exception 'pull limit must be between 1 and 500' using errcode = '22023';
  end if;

  with
  high as (
    select coalesce(max(c.cursor), 0)::bigint as high_watermark
    from aha.sync_changes c
    where c.workspace_id = p_workspace_id
  ),
  latest as (
    select distinct on (c.object_type, c.object_id)
      c.cursor,
      c.object_type,
      c.object_id,
      c.operation,
      c.revision,
      c.payload_hash,
      c.changed_at
    from aha.sync_changes c
    cross join high h
    where c.workspace_id = p_workspace_id
      and c.cursor > p_after_cursor
      and c.cursor <= h.high_watermark
    order by c.object_type, c.object_id, c.cursor desc
  ),
  page as (
    select l.*
    from latest l
    order by l.cursor asc, l.object_type asc, l.object_id asc
    limit p_limit
  ),
  page_meta as (
    select
      coalesce(max(p.cursor), p_after_cursor)::bigint as next_cursor,
      count(*)::integer as returned_count
    from page p
  ),
  rendered as (
    select
      p.cursor,
      p.object_type,
      p.object_id,
      p.operation,
      p.revision,
      p.payload_hash,
      p.changed_at,
      aha.sync_object_snapshot_v1(p_workspace_id, p.object_type, p.object_id) as snapshot
    from page p
  )
  select jsonb_build_object(
    'workspaceId', p_workspace_id,
    'afterCursor', p_after_cursor,
    'highWatermark', h.high_watermark,
    'nextCursor', pm.next_cursor,
    'returnedCount', pm.returned_count,
    'hasMore', exists(
      select 1 from latest l where l.cursor > pm.next_cursor
    ),
    'changes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'cursor', r.cursor,
          'objectType', r.object_type,
          'objectId', r.object_id,
          'operation', r.operation,
          'revision', r.revision,
          'payloadHash', r.payload_hash,
          'changedAt', r.changed_at,
          'deletedAt', case
            when r.operation = 'delete' then nullif(r.snapshot->>'deleted_at','')::timestamptz
            else null
          end,
          'payload', case when r.operation = 'delete' then null else r.snapshot end
        )
        order by r.cursor asc, r.object_type asc, r.object_id asc
      )
      from rendered r
    ), '[]'::jsonb)
  )
  into v_result
  from high h
  cross join page_meta pm;

  return v_result;
end;
$function$;

revoke all on function aha.pull_sync_changes_v1(text,bigint,integer) from public;

create or replace function aha.bootstrap_sync_snapshot_v1(
  p_workspace_id text,
  p_after_key text default '',
  p_high_watermark bigint default null,
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, aha
as $function$
declare
  v_result jsonb;
  v_high_watermark bigint;
  v_current_high_watermark bigint;
begin
  if aha.current_profile_id() is null then
    raise exception 'authenticated canonical profile required' using errcode = '42501';
  end if;
  if not aha.can_read_workspace(p_workspace_id) then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 500 then
    raise exception 'bootstrap limit must be between 1 and 500' using errcode = '22023';
  end if;
  if p_high_watermark is not null and p_high_watermark < 0 then
    raise exception 'bootstrap high watermark must be non-negative' using errcode = '22023';
  end if;

  select coalesce(max(c.cursor), 0)::bigint
    into v_current_high_watermark
  from aha.sync_changes c
  where c.workspace_id = p_workspace_id;

  if p_high_watermark is not null and p_high_watermark > v_current_high_watermark then
    raise exception 'bootstrap high watermark cannot exceed current journal watermark' using errcode = '22023';
  end if;

  v_high_watermark := coalesce(p_high_watermark, v_current_high_watermark);

  with
  objects as (
    select 'conversation'::text as object_type, c.id as object_id, c.revision,
           c.deleted_at, (c.deleted_at is not null or c.status = 'deleted') as deleted
    from aha.conversations c where c.workspace_id = p_workspace_id

    union all
    select 'message', m.id, m.revision, m.deleted_at, (m.deleted_at is not null)
    from aha.messages m where m.workspace_id = p_workspace_id

    union all
    select 'source_event', s.id, s.revision, s.deleted_at, (s.deleted_at is not null)
    from aha.source_events s where s.workspace_id = p_workspace_id

    union all
    select 'insight', i.id, i.revision, i.deleted_at, (i.deleted_at is not null or i.status = 'deleted')
    from aha.insights i where i.workspace_id = p_workspace_id

    union all
    select 'concept_list', l.id, l.revision, l.deleted_at, (l.deleted_at is not null)
    from aha.concept_lists l where l.workspace_id = p_workspace_id

    union all
    select 'concept_list_item', li.id, li.revision, li.deleted_at, (li.deleted_at is not null)
    from aha.concept_list_items li where li.workspace_id = p_workspace_id

    union all
    select 'knowledge_path', p.id, p.revision, p.deleted_at, (p.deleted_at is not null)
    from aha.knowledge_paths p where p.workspace_id = p_workspace_id

    union all
    select 'knowledge_path_step', ps.id, ps.revision, ps.deleted_at, (ps.deleted_at is not null)
    from aha.knowledge_path_steps ps where ps.workspace_id = p_workspace_id

    union all
    select 'article', a.id, a.revision, a.deleted_at, (a.deleted_at is not null or a.status = 'deleted')
    from aha.articles a where a.workspace_id = p_workspace_id

    union all
    select 'article_reference', ar.id, ar.revision, ar.deleted_at, (ar.deleted_at is not null)
    from aha.article_references ar where ar.workspace_id = p_workspace_id
  ),
  keyed as (
    select
      o.*,
      o.object_type || chr(31) || o.object_id as object_key
    from objects o
  ),
  page as (
    select k.*
    from keyed k
    where k.object_key > coalesce(p_after_key, '')
    order by k.object_key asc
    limit p_limit
  ),
  rendered as (
    select
      p.object_key,
      p.object_type,
      p.object_id,
      p.revision,
      p.deleted_at,
      p.deleted,
      aha.sync_object_snapshot_v1(p_workspace_id, p.object_type, p.object_id) as snapshot
    from page p
  ),
  rendered_with_hash as (
    select
      r.*,
      encode(
        aha.digest(
          (case
             when r.deleted then jsonb_build_object(
               'id', r.object_id,
               'revision', r.revision,
               'deleted_at', r.deleted_at
             )
             else r.snapshot
           end)::text,
          'sha256'
        ),
        'hex'
      ) as payload_hash
    from rendered r
  ),
  page_meta as (
    select
      coalesce(max(r.object_key), coalesce(p_after_key, '')) as next_key,
      count(*)::integer as returned_count
    from rendered_with_hash r
  )
  select jsonb_build_object(
    'workspaceId', p_workspace_id,
    'afterKey', coalesce(p_after_key, ''),
    'highWatermark', v_high_watermark,
    'nextKey', pm.next_key,
    'returnedCount', pm.returned_count,
    'hasMore', exists(
      select 1 from keyed k where k.object_key > pm.next_key
    ),
    'objects', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'objectKey', r.object_key,
          'objectType', r.object_type,
          'objectId', r.object_id,
          'operation', case when r.deleted then 'delete' else 'upsert' end,
          'revision', r.revision,
          'payloadHash', r.payload_hash,
          'deletedAt', case when r.deleted then r.deleted_at else null end,
          'payload', case when r.deleted then null else r.snapshot end
        )
        order by r.object_key asc
      )
      from rendered_with_hash r
    ), '[]'::jsonb)
  )
  into v_result
  from page_meta pm;

  return v_result;
end;
$function$;

revoke all on function aha.bootstrap_sync_snapshot_v1(text,text,bigint,integer) from public;

insert into aha.schema_versions(version, description, metadata)
values (
  'aha_canonical_sync_read_v1',
  'Read-only canonical snapshot/bootstrap and monotone delta pull boundary for ten allow-listed sync object types.',
  pg_catalog.jsonb_build_object(
    'runtime_activated', false,
    'frontend_sync_activated', false,
    'auto_sync', false,
    'login_triggers_sync', false,
    'direct_table_grants', false,
    'bootstrap_high_watermark_required_for_followup_pages', true,
    'raw_deleted_payload_returned', false,
    'canonical_system_of_record', 'domain_tables'
  )
)
on conflict(version) do update
set description = excluded.description,
    metadata = excluded.metadata,
    applied_at = pg_catalog.now();

commit;
