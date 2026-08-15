-- AHA canonical sync push command v1
--
-- One explicit server command for personal/private canonical bidirectional sync.
-- The browser receives no table grants and no helper execution grants here.
-- Client payload SHA-256 is verified by the future NestJS boundary; this command
-- additionally hashes the received JSON itself to bind database idempotency to
-- the exact payload that reached PostgreSQL.

begin;

create or replace function aha.record_sync_conflict_v1(
  p_workspace_id text,
  p_profile_id text,
  p_device_id text,
  p_object_type text,
  p_object_id text,
  p_operation text,
  p_base_revision bigint,
  p_server_revision bigint,
  p_client_payload_hash text,
  p_server_payload_hash text,
  p_idempotency_key text,
  p_reason text,
  p_server_snapshot jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, aha
as $function$
declare
  v_conflict_id text;
  v_deleted_at timestamptz;
begin
  v_deleted_at:=nullif(p_server_snapshot->>'deleted_at','')::timestamptz;
  insert into aha.sync_conflicts(
    id,workspace_id,profile_id,device_id,object_type,object_id,operation,
    base_revision,server_revision,client_payload_hash,server_payload_hash,status,metadata
  ) values (
    aha.new_id(),p_workspace_id,p_profile_id,nullif(p_device_id,''),p_object_type,p_object_id,p_operation,
    p_base_revision,p_server_revision,p_client_payload_hash,p_server_payload_hash,'open',
    jsonb_build_object(
      'reason',p_reason,
      'idempotency_key',p_idempotency_key,
      'command_version','aha_canonical_sync_push_v1'
    )
  ) returning id into v_conflict_id;

  return jsonb_build_object(
    'status','conflict',
    'reason',p_reason,
    'conflictId',v_conflict_id,
    'workspaceId',p_workspace_id,
    'objectType',p_object_type,
    'objectId',p_object_id,
    'operation',p_operation,
    'baseRevision',p_base_revision,
    'serverRevision',p_server_revision,
    'clientPayloadHash',p_client_payload_hash,
    'serverPayloadHash',p_server_payload_hash,
    'deletedAt',v_deleted_at,
    'serverState',case when v_deleted_at is not null then null else p_server_snapshot end,
    'idempotentReplay',false
  );
end;
$function$;
revoke all on function aha.record_sync_conflict_v1(text,text,text,text,text,text,bigint,bigint,text,text,text,text,jsonb) from public;

create or replace function aha.push_sync_change_v1(
  p_workspace_id text,
  p_device_id text,
  p_idempotency_key text,
  p_object_type text,
  p_object_id text,
  p_operation text,
  p_base_revision bigint,
  p_payload_hash text,
  p_payload jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, aha
as $function$
declare
  v_profile_id text;
  v_state jsonb;
  v_server_snapshot jsonb;
  v_server_revision bigint:=0;
  v_server_payload_hash text;
  v_db_payload_hash text;
  v_request_hash text;
  v_idempotency_id text;
  v_idempotency aha.idempotency_keys%rowtype;
  v_new_revision bigint;
  v_cursor bigint;
  v_response jsonb;
  v_inserted integer:=0;
  v_existing_cursor bigint;
begin
  v_profile_id:=aha.current_profile_id();
  if v_profile_id is null then
    raise exception 'authenticated canonical profile required' using errcode='42501';
  end if;

  if length(btrim(coalesce(p_workspace_id,'')))=0
     or length(btrim(coalesce(p_device_id,'')))=0
     or length(btrim(coalesce(p_object_id,'')))=0 then
    raise exception 'workspace, device and object id are required' using errcode='22023';
  end if;
  if length(btrim(coalesce(p_idempotency_key,'')))<8 then
    raise exception 'sync idempotency key must contain at least 8 characters' using errcode='22023';
  end if;
  if p_object_type not in(
    'conversation','message','source_event','insight','concept_list','concept_list_item',
    'knowledge_path','knowledge_path_step','article','article_reference'
  ) then
    raise exception 'unsupported canonical sync object type' using errcode='22023';
  end if;
  if p_operation not in('upsert','delete') then
    raise exception 'unsupported canonical sync operation' using errcode='22023';
  end if;
  if p_base_revision<0 then
    raise exception 'base revision must be non-negative' using errcode='22023';
  end if;
  if p_payload_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'client payload hash must be sha256 hex' using errcode='22023';
  end if;
  if p_operation='upsert' then
    perform aha.assert_sync_upsert_payload_v1(p_object_type,p_object_id,p_base_revision,p_payload);
  elsif p_payload is not null and p_payload <> 'null'::jsonb then
    raise exception 'delete sync event must not contain payload' using errcode='22023';
  end if;

  if not aha.can_edit_workspace(p_workspace_id) then
    raise exception 'workspace edit denied' using errcode='42501';
  end if;
  if not exists(
    select 1 from aha.workspaces w
    where w.id=p_workspace_id and w.workspace_type='personal'
      and w.status='active' and w.deleted_at is null
  ) then
    raise exception 'canonical sync v1 requires an active personal workspace' using errcode='42501';
  end if;

  v_db_payload_hash:=encode(aha.digest(coalesce(p_payload,'null'::jsonb)::text,'sha256'),'hex');
  v_request_hash:=encode(aha.digest(
    concat_ws(chr(31),
      p_workspace_id,p_device_id,p_object_type,p_object_id,p_operation,
      p_base_revision::text,p_payload_hash,v_db_payload_hash
    ),
    'sha256'
  ),'hex');

  insert into aha.idempotency_keys(
    id,workspace_id,profile_id,scope,idempotency_key,request_hash,status,expires_at
  ) values (
    aha.new_id(),p_workspace_id,v_profile_id,'canonical_sync_push_v1',p_idempotency_key,
    v_request_hash,'started',now()+interval '24 hours'
  ) on conflict(workspace_id,profile_id,scope,idempotency_key) do nothing
  returning id into v_idempotency_id;
  get diagnostics v_inserted=row_count;

  if v_inserted=0 then
    select * into v_idempotency
    from aha.idempotency_keys k
    where k.workspace_id=p_workspace_id
      and k.profile_id=v_profile_id
      and k.scope='canonical_sync_push_v1'
      and k.idempotency_key=p_idempotency_key
    for update;

    if not found then
      raise exception 'sync idempotency state unavailable' using errcode='P0001';
    end if;
    if v_idempotency.request_hash<>v_request_hash then
      raise exception 'sync idempotency key reused for another request' using errcode='23505';
    end if;
    if v_idempotency.status='completed' and v_idempotency.response_body is not null then
      return v_idempotency.response_body || jsonb_build_object('idempotentReplay',true);
    end if;
    if v_idempotency.status='started' and v_idempotency.expires_at>now() then
      raise exception 'sync request with this idempotency key is already in progress' using errcode='55P03';
    end if;
    update aha.idempotency_keys set
      request_hash=v_request_hash,status='started',response_status=null,response_body=null,
      expires_at=now()+interval '24 hours'
    where id=v_idempotency.id;
    v_idempotency_id:=v_idempotency.id;
  end if;

  v_state:=aha.sync_lock_object_state_v1(p_workspace_id,p_object_type,p_object_id);
  if v_state is not null then
    v_server_revision:=(v_state->>'revision')::bigint;
    v_server_snapshot:=aha.sync_object_snapshot_v1(p_workspace_id,p_object_type,p_object_id);
    perform aha.assert_sync_private_scope_v1(p_workspace_id,p_object_type,v_server_snapshot);
    v_server_payload_hash:=aha.sync_server_payload_hash_v1(p_workspace_id,p_object_type,p_object_id);
  end if;

  if v_state is null and p_base_revision>0 then
    v_response:=aha.record_sync_conflict_v1(
      p_workspace_id,v_profile_id,p_device_id,p_object_type,p_object_id,p_operation,
      p_base_revision,0,p_payload_hash,null,p_idempotency_key,'server_absent',null
    );
    update aha.idempotency_keys set status='completed',response_status=409,response_body=v_response where id=v_idempotency_id;
    return v_response;
  end if;

  if v_state is not null and p_base_revision<>v_server_revision then
    v_response:=aha.record_sync_conflict_v1(
      p_workspace_id,v_profile_id,p_device_id,p_object_type,p_object_id,p_operation,
      p_base_revision,v_server_revision,p_payload_hash,v_server_payload_hash,p_idempotency_key,
      'stale_base_revision',v_server_snapshot
    );
    update aha.idempotency_keys set status='completed',response_status=409,response_body=v_response where id=v_idempotency_id;
    return v_response;
  end if;

  if p_operation='upsert' and v_state is not null and nullif(v_state->>'deleted_at','') is not null then
    v_response:=aha.record_sync_conflict_v1(
      p_workspace_id,v_profile_id,p_device_id,p_object_type,p_object_id,p_operation,
      p_base_revision,v_server_revision,p_payload_hash,v_server_payload_hash,p_idempotency_key,
      'server_tombstone',v_server_snapshot
    );
    update aha.idempotency_keys set status='completed',response_status=409,response_body=v_response where id=v_idempotency_id;
    return v_response;
  end if;

  if p_operation='delete' and v_state is null then
    v_response:=jsonb_build_object(
      'status','synced','result','already_absent','workspaceId',p_workspace_id,
      'objectType',p_object_type,'objectId',p_object_id,'operation','delete',
      'baseRevision',0,'serverRevision',0,'cursor',null,'serverPayloadHash',null,
      'serverState',null,'deletedAt',null,'idempotentReplay',false
    );
    update aha.idempotency_keys set status='completed',response_status=200,response_body=v_response where id=v_idempotency_id;
    insert into aha.audit_events(id,workspace_id,actor_profile_id,actor_type,action,object_type,object_id,event_data)
    values(aha.new_id(),p_workspace_id,v_profile_id,'profile','canonical_sync_noop',p_object_type,p_object_id,
      jsonb_build_object('operation','delete','reason','already_absent','device_id',p_device_id,'idempotency_key',p_idempotency_key));
    return v_response;
  end if;

  if p_operation='delete' and nullif(v_state->>'deleted_at','') is not null then
    select max(c.cursor) into v_existing_cursor
    from aha.sync_changes c
    where c.workspace_id=p_workspace_id and c.object_type=p_object_type
      and c.object_id=p_object_id and c.revision=v_server_revision and c.operation='delete';
    v_response:=jsonb_build_object(
      'status','synced','result','already_deleted','workspaceId',p_workspace_id,
      'objectType',p_object_type,'objectId',p_object_id,'operation','delete',
      'baseRevision',p_base_revision,'serverRevision',v_server_revision,
      'cursor',v_existing_cursor,'serverPayloadHash',v_server_payload_hash,
      'serverState',null,'deletedAt',nullif(v_server_snapshot->>'deleted_at','')::timestamptz,
      'idempotentReplay',false
    );
    update aha.idempotency_keys set status='completed',response_status=200,response_body=v_response where id=v_idempotency_id;
    return v_response;
  end if;

  if p_operation='upsert' then
    perform aha.assert_sync_private_scope_v1(p_workspace_id,p_object_type,p_payload);
    begin
      v_new_revision:=aha.sync_apply_upsert_v1(
        p_workspace_id,v_profile_id,p_object_type,p_object_id,p_payload,(v_state is null)
      );
    exception when unique_violation then
      v_state:=aha.sync_lock_object_state_v1(p_workspace_id,p_object_type,p_object_id);
      if v_state is not null then
        v_server_revision:=(v_state->>'revision')::bigint;
        v_server_snapshot:=aha.sync_object_snapshot_v1(p_workspace_id,p_object_type,p_object_id);
        v_server_payload_hash:=aha.sync_server_payload_hash_v1(p_workspace_id,p_object_type,p_object_id);
      else
        v_server_revision:=0;
        v_server_snapshot:=null;
        v_server_payload_hash:=null;
      end if;
      v_response:=aha.record_sync_conflict_v1(
        p_workspace_id,v_profile_id,p_device_id,p_object_type,p_object_id,p_operation,
        p_base_revision,v_server_revision,p_payload_hash,v_server_payload_hash,p_idempotency_key,
        'identity_or_unique_conflict',v_server_snapshot
      );
      update aha.idempotency_keys set status='completed',response_status=409,response_body=v_response where id=v_idempotency_id;
      return v_response;
    end;
  else
    v_new_revision:=aha.sync_apply_delete_v1(p_workspace_id,p_object_type,p_object_id);
  end if;

  v_server_snapshot:=aha.sync_object_snapshot_v1(p_workspace_id,p_object_type,p_object_id);
  v_server_payload_hash:=aha.sync_server_payload_hash_v1(p_workspace_id,p_object_type,p_object_id);

  insert into aha.sync_changes(
    workspace_id,object_type,object_id,operation,revision,payload_hash,
    changed_by_profile_id,device_id,idempotency_key,metadata
  ) values (
    p_workspace_id,p_object_type,p_object_id,p_operation,v_new_revision,v_server_payload_hash,
    v_profile_id,p_device_id,p_idempotency_key,
    jsonb_build_object(
      'base_revision',p_base_revision,
      'client_payload_hash',p_payload_hash,
      'database_payload_hash',v_db_payload_hash,
      'command_version','aha_canonical_sync_push_v1'
    )
  ) returning cursor into v_cursor;

  insert into aha.audit_events(
    id,workspace_id,actor_profile_id,actor_type,action,object_type,object_id,event_data
  ) values (
    aha.new_id(),p_workspace_id,v_profile_id,'profile','canonical_sync_push',p_object_type,p_object_id,
    jsonb_build_object(
      'operation',p_operation,
      'base_revision',p_base_revision,
      'server_revision',v_new_revision,
      'cursor',v_cursor,
      'device_id',p_device_id,
      'idempotency_key',p_idempotency_key,
      'client_payload_hash',p_payload_hash,
      'server_payload_hash',v_server_payload_hash
    )
  );

  v_response:=jsonb_build_object(
    'status','synced','result','applied','workspaceId',p_workspace_id,
    'objectType',p_object_type,'objectId',p_object_id,'operation',p_operation,
    'baseRevision',p_base_revision,'serverRevision',v_new_revision,
    'cursor',v_cursor,'clientPayloadHash',p_payload_hash,
    'serverPayloadHash',v_server_payload_hash,
    'deletedAt',case when p_operation='delete' then nullif(v_server_snapshot->>'deleted_at','')::timestamptz else null end,
    'serverState',case when p_operation='delete' then null else v_server_snapshot end,
    'idempotentReplay',false
  );

  update aha.idempotency_keys set
    status='completed',response_status=200,response_body=v_response
  where id=v_idempotency_id;

  return v_response;
end;
$function$;

revoke all on function aha.push_sync_change_v1(text,text,text,text,text,text,bigint,text,jsonb) from public;

insert into aha.schema_versions(version,description,metadata)
values(
  'aha_canonical_sync_push_v1',
  'Explicit idempotent personal/private canonical sync push command with stale-base conflicts, tombstones, journal and audit.',
  pg_catalog.jsonb_build_object(
    'runtime_activated',false,
    'frontend_sync_activated',false,
    'auto_sync',false,
    'login_triggers_sync',false,
    'direct_table_grants',false,
    'workspace_scope','personal_only',
    'sharing_scope','private_only',
    'client_payload_hash_verifier','nest_api_boundary',
    'database_payload_hash_bound_to_idempotency',true,
    'stale_base_conflicts',true,
    'tombstone_resurrection_automatic',false,
    'journal_is_system_of_record',false,
    'canonical_system_of_record','domain_tables'
  )
)
on conflict(version) do update set description=excluded.description,metadata=excluded.metadata,applied_at=pg_catalog.now();

commit;
