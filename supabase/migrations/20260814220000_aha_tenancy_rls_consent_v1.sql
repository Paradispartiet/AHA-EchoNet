-- AHA Tenancy, RLS and Consent Contract v1
--
-- Status: contract and fail-closed policy baseline only.
-- This migration does not grant browser access, activate sync, or create a
-- public write path. Sensitive writes remain backend-only by ADR-003.

begin;

-- ---------------------------------------------------------------------------
-- Complete the explicit consent link for account import.
-- ---------------------------------------------------------------------------

alter table aha.schema_versions enable row level security;

alter table aha.import_batches
  add column if not exists consent_receipt_id text;

do $$
begin
  if exists (
    select 1
    from aha.import_batches
    where consent_receipt_id is null
  ) then
    raise exception using
      errcode = '23502',
      message = 'aha.import_batches contains rows without consent_receipt_id; migrate or remove them before applying tenancy/RLS v1';
  end if;
end;
$$;

alter table aha.import_batches
  alter column consent_receipt_id set not null;

alter table aha.import_batches
  drop constraint if exists import_batches_consent_receipt_fk;

alter table aha.import_batches
  add constraint import_batches_consent_receipt_fk
  foreign key (consent_receipt_id, profile_id)
  references aha.consent_receipts(id, profile_id)
  on delete restrict;

-- ---------------------------------------------------------------------------
-- Verified request identity abstraction.
--
-- The trusted API/Data API layer must verify the JWT before Postgres receives
-- request.jwt.claims. Authorization uses only immutable identity claims here;
-- user-editable metadata is never an authorization source.
-- ---------------------------------------------------------------------------

create or replace function aha.request_claims()
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, aha
as $function$
declare
  raw_claims text;
  claims jsonb;
begin
  raw_claims := nullif(current_setting('request.jwt.claims', true), '');

  if raw_claims is not null then
    begin
      claims := raw_claims::jsonb;
    exception when others then
      return '{}'::jsonb;
    end;
  else
    claims := jsonb_strip_nulls(jsonb_build_object(
      'sub', nullif(current_setting('request.jwt.claim.sub', true), ''),
      'role', nullif(current_setting('request.jwt.claim.role', true), ''),
      'iss', nullif(current_setting('request.jwt.claim.iss', true), ''),
      'aha_provider', nullif(current_setting('aha.auth_provider', true), '')
    ));
  end if;

  if jsonb_typeof(claims) <> 'object' then
    return '{}'::jsonb;
  end if;

  return claims;
end;
$function$;

create or replace function aha.current_auth_subject()
returns text
language sql
stable
set search_path = pg_catalog, aha
as $function$
  select coalesce(
    nullif(aha.request_claims() ->> 'sub', ''),
    nullif(current_setting('request.jwt.claim.sub', true), '')
  );
$function$;

create or replace function aha.current_auth_provider()
returns text
language sql
stable
set search_path = pg_catalog, aha
as $function$
  select coalesce(
    nullif(aha.request_claims() ->> 'aha_provider', ''),
    nullif(aha.request_claims() ->> 'provider', ''),
    case when aha.current_auth_subject() is not null then 'supabase' end
  );
$function$;

create or replace function aha.current_profile_id()
returns text
language sql
stable
security definer
set search_path = pg_catalog, aha
as $function$
  select p.id
  from aha.profiles p
  where p.auth_provider = aha.current_auth_provider()
    and p.auth_subject = aha.current_auth_subject()
    and p.status = 'active'
    and p.deleted_at is null
  limit 1;
$function$;

-- ---------------------------------------------------------------------------
-- Workspace authorization helpers.
-- ---------------------------------------------------------------------------

create or replace function aha.workspace_role_rank(target_workspace_id text)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, aha
as $function$
  select coalesce((
    select greatest(
      case
        when w.owner_profile_id = aha.current_profile_id() then 100
        else -1
      end,
      coalesce((
        select max(r.rank)
        from aha.workspace_memberships m
        join aha.workspace_roles r on r.id = m.role_id
        where m.workspace_id = w.id
          and m.profile_id = aha.current_profile_id()
          and m.status = 'active'
          and m.deleted_at is null
      ), -1)
    )
    from aha.workspaces w
    where w.id = target_workspace_id
      and w.status = 'active'
      and w.deleted_at is null
  ), -1);
$function$;

create or replace function aha.can_read_workspace(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, aha
as $function$
  select aha.workspace_role_rank(target_workspace_id) >= 10;
$function$;

create or replace function aha.can_edit_workspace(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, aha
as $function$
  select aha.workspace_role_rank(target_workspace_id) >= 70;
$function$;

create or replace function aha.can_admin_workspace(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, aha
as $function$
  select aha.workspace_role_rank(target_workspace_id) >= 100;
$function$;

-- ---------------------------------------------------------------------------
-- Canonical consent scopes.
-- ---------------------------------------------------------------------------

create or replace function aha.workspace_share_scope(
  object_type text,
  object_id text,
  target_workspace_id text
)
returns text
language sql
immutable
strict
set search_path = pg_catalog, aha
as $function$
  select jsonb_build_object(
    'object_id', object_id,
    'object_type', object_type,
    'target_workspace_id', target_workspace_id
  )::text;
$function$;

create or replace function aha.account_import_scope(
  workspace_id text,
  source_kind text,
  payload_hash text
)
returns text
language sql
immutable
strict
set search_path = pg_catalog, aha
as $function$
  select jsonb_build_object(
    'payload_hash', payload_hash,
    'source_kind', source_kind,
    'workspace_id', workspace_id
  )::text;
$function$;

create or replace function aha.publication_scope(
  article_id text,
  article_version integer
)
returns text
language sql
immutable
strict
set search_path = pg_catalog, aha
as $function$
  select jsonb_build_object(
    'article_id', article_id,
    'article_version', article_version,
    'target', 'public'
  )::text;
$function$;

create or replace function aha.consent_is_active(
  receipt_id text,
  expected_profile_id text,
  expected_workspace_id text,
  expected_purpose text,
  expected_scope text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, aha
as $function$
  select exists (
    select 1
    from aha.consent_receipts c
    where c.id = receipt_id
      and c.profile_id = expected_profile_id
      and c.workspace_id = expected_workspace_id
      and c.purpose = expected_purpose
      and c.consent_scope = expected_scope
      and c.status = 'granted'
      and c.granted_at is not null
      and c.granted_at <= now()
      and c.withdrawn_at is null
      and (c.expires_at is null or c.expires_at > now())
  );
$function$;

-- ---------------------------------------------------------------------------
-- Shared-object read helpers. Raw conversations, messages, source events and
-- analysis evidence are intentionally not generic share targets.
-- ---------------------------------------------------------------------------

create or replace function aha.can_read_shared_object(
  source_workspace_id text,
  shared_object_type text,
  shared_object_id text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, aha
as $function$
  select exists (
    select 1
    from aha.sharing_grants g
    where g.source_workspace_id = source_workspace_id
      and g.object_type = shared_object_type
      and g.object_id = shared_object_id
      and g.status = 'active'
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
      and aha.can_read_workspace(g.target_workspace_id)
      and aha.consent_is_active(
        g.consent_receipt_id,
        g.granted_by_profile_id,
        g.source_workspace_id,
        'workspace_share',
        aha.workspace_share_scope(g.object_type, g.object_id, g.target_workspace_id)
      )
  );
$function$;

create or replace function aha.can_read_insight(target_workspace_id text, target_insight_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, aha
as $function$
  select aha.can_read_workspace(target_workspace_id)
    or aha.can_read_shared_object(target_workspace_id, 'insight', target_insight_id);
$function$;

create or replace function aha.can_read_concept_list(target_workspace_id text, target_list_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, aha
as $function$
  select aha.can_read_workspace(target_workspace_id)
    or aha.can_read_shared_object(target_workspace_id, 'concept_list', target_list_id);
$function$;

create or replace function aha.can_read_concept_list_item(target_workspace_id text, target_list_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, aha
as $function$
  select exists (
    select 1
    from aha.concept_lists l
    where l.id = target_list_id
      and l.workspace_id = target_workspace_id
      and l.deleted_at is null
      and aha.can_read_concept_list(l.workspace_id, l.id)
  );
$function$;

create or replace function aha.can_read_knowledge_path(target_workspace_id text, target_path_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, aha
as $function$
  select aha.can_read_workspace(target_workspace_id)
    or aha.can_read_shared_object(target_workspace_id, 'knowledge_path', target_path_id);
$function$;

create or replace function aha.can_read_knowledge_path_step(target_workspace_id text, target_path_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, aha
as $function$
  select exists (
    select 1
    from aha.knowledge_paths p
    where p.id = target_path_id
      and p.workspace_id = target_workspace_id
      and p.deleted_at is null
      and aha.can_read_knowledge_path(p.workspace_id, p.id)
  );
$function$;

create or replace function aha.can_read_article(target_workspace_id text, target_article_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, aha
as $function$
  select aha.can_read_workspace(target_workspace_id)
    or aha.can_read_shared_object(target_workspace_id, 'article', target_article_id);
$function$;

create or replace function aha.can_read_import_batch(target_workspace_id text, target_batch_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, aha
as $function$
  select exists (
    select 1
    from aha.import_batches b
    where b.id = target_batch_id
      and b.workspace_id = target_workspace_id
      and b.profile_id = aha.current_profile_id()
  );
$function$;

-- ---------------------------------------------------------------------------
-- Consent enforcement for the three v1 outward-processing actions.
-- ---------------------------------------------------------------------------

create or replace function aha.enforce_consent_link()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, aha
as $function$
begin
  if tg_table_schema <> 'aha' then
    raise exception using errcode = '42501', message = 'unexpected schema for AHA consent trigger';
  end if;

  if tg_table_name = 'sharing_grants' and new.status = 'active' then
    if not aha.consent_is_active(
      new.consent_receipt_id,
      new.granted_by_profile_id,
      new.source_workspace_id,
      'workspace_share',
      aha.workspace_share_scope(new.object_type, new.object_id, new.target_workspace_id)
    ) then
      raise exception using errcode = '42501', message = 'active workspace sharing requires an active, exact consent receipt';
    end if;
  elsif tg_table_name = 'import_batches'
    and new.status in ('previewed', 'running', 'completed', 'completed_with_rejections') then
    if not aha.consent_is_active(
      new.consent_receipt_id,
      new.profile_id,
      new.workspace_id,
      'account_import',
      aha.account_import_scope(new.workspace_id, new.source_kind, new.payload_hash)
    ) then
      raise exception using errcode = '42501', message = 'account import requires an active, payload-specific consent receipt';
    end if;
  elsif tg_table_name = 'publications'
    and new.target_type = 'public'
    and new.status in ('candidate', 'approved', 'published') then
    if not aha.consent_is_active(
      new.consent_receipt_id,
      new.requested_by_profile_id,
      new.workspace_id,
      'public_publish',
      aha.publication_scope(new.article_id, new.article_version)
    ) then
      raise exception using errcode = '42501', message = 'public publication requires an active, version-specific consent receipt';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists aha_enforce_consent on aha.sharing_grants;
create trigger aha_enforce_consent
before insert or update on aha.sharing_grants
for each row execute function aha.enforce_consent_link();

drop trigger if exists aha_enforce_consent on aha.import_batches;
create trigger aha_enforce_consent
before insert or update on aha.import_batches
for each row execute function aha.enforce_consent_link();

drop trigger if exists aha_enforce_consent on aha.publications;
create trigger aha_enforce_consent
before insert or update on aha.publications
for each row execute function aha.enforce_consent_link();

-- ---------------------------------------------------------------------------
-- Direct read policies. There are deliberately no direct INSERT, UPDATE or
-- DELETE policies. Runtime writes must pass the future NestJS command boundary.
-- No table or function grants are created by this migration.
-- ---------------------------------------------------------------------------

drop policy if exists aha_v1_select on aha.profiles;
create policy aha_v1_select on aha.profiles
for select using (id = (select aha.current_profile_id()));

drop policy if exists aha_v1_select on aha.devices;
create policy aha_v1_select on aha.devices
for select using (profile_id = (select aha.current_profile_id()));

drop policy if exists aha_v1_select on aha.workspace_roles;
create policy aha_v1_select on aha.workspace_roles
for select using ((select aha.current_profile_id()) is not null);

drop policy if exists aha_v1_select on aha.workspaces;
create policy aha_v1_select on aha.workspaces
for select using (aha.can_read_workspace(id));

drop policy if exists aha_v1_select on aha.workspace_memberships;
create policy aha_v1_select on aha.workspace_memberships
for select using (aha.can_read_workspace(workspace_id));

drop policy if exists aha_v1_select on aha.workspace_invitations;
create policy aha_v1_select on aha.workspace_invitations
for select using (
  aha.can_admin_workspace(workspace_id)
  or accepted_profile_id = (select aha.current_profile_id())
);

drop policy if exists aha_v1_select on aha.conversations;
create policy aha_v1_select on aha.conversations
for select using (aha.can_read_workspace(workspace_id));

drop policy if exists aha_v1_select on aha.conversation_participants;
create policy aha_v1_select on aha.conversation_participants
for select using (aha.can_read_workspace(workspace_id));

drop policy if exists aha_v1_select on aha.messages;
create policy aha_v1_select on aha.messages
for select using (aha.can_read_workspace(workspace_id));

drop policy if exists aha_v1_select on aha.source_events;
create policy aha_v1_select on aha.source_events
for select using (aha.can_read_workspace(workspace_id));

drop policy if exists aha_v1_select on aha.source_attachments;
create policy aha_v1_select on aha.source_attachments
for select using (aha.can_read_workspace(workspace_id));

drop policy if exists aha_v1_select on aha.analysis_runs;
create policy aha_v1_select on aha.analysis_runs
for select using (aha.can_read_workspace(workspace_id));

drop policy if exists aha_v1_select on aha.analysis_claims;
create policy aha_v1_select on aha.analysis_claims
for select using (aha.can_read_workspace(workspace_id));

drop policy if exists aha_v1_select on aha.analysis_evidence;
create policy aha_v1_select on aha.analysis_evidence
for select using (aha.can_read_workspace(workspace_id));

drop policy if exists aha_v1_select on aha.insights;
create policy aha_v1_select on aha.insights
for select using (aha.can_read_insight(workspace_id, id));

drop policy if exists aha_v1_select on aha.insight_versions;
create policy aha_v1_select on aha.insight_versions
for select using (aha.can_read_insight(workspace_id, insight_id));

drop policy if exists aha_v1_select on aha.insight_relations;
create policy aha_v1_select on aha.insight_relations
for select using (
  aha.can_read_insight(workspace_id, from_insight_id)
  and aha.can_read_insight(workspace_id, to_insight_id)
);

drop policy if exists aha_v1_select on aha.insight_feedback;
create policy aha_v1_select on aha.insight_feedback
for select using (
  profile_id = (select aha.current_profile_id())
  or aha.can_admin_workspace(workspace_id)
);

drop policy if exists aha_v1_select on aha.memory_revisions;
create policy aha_v1_select on aha.memory_revisions
for select using (
  aha.can_read_insight(workspace_id, insight_id)
  and (
    related_insight_id is null
    or aha.can_read_insight(workspace_id, related_insight_id)
  )
);

drop policy if exists aha_v1_select on aha.concept_lists;
create policy aha_v1_select on aha.concept_lists
for select using (aha.can_read_concept_list(workspace_id, id));

drop policy if exists aha_v1_select on aha.concept_list_items;
create policy aha_v1_select on aha.concept_list_items
for select using (aha.can_read_concept_list_item(workspace_id, list_id));

drop policy if exists aha_v1_select on aha.knowledge_paths;
create policy aha_v1_select on aha.knowledge_paths
for select using (aha.can_read_knowledge_path(workspace_id, id));

drop policy if exists aha_v1_select on aha.knowledge_path_steps;
create policy aha_v1_select on aha.knowledge_path_steps
for select using (aha.can_read_knowledge_path_step(workspace_id, path_id));

drop policy if exists aha_v1_select on aha.articles;
create policy aha_v1_select on aha.articles
for select using (aha.can_read_article(workspace_id, id));

drop policy if exists aha_v1_select on aha.article_versions;
create policy aha_v1_select on aha.article_versions
for select using (aha.can_read_article(workspace_id, article_id));

drop policy if exists aha_v1_select on aha.article_references;
create policy aha_v1_select on aha.article_references
for select using (aha.can_read_article(workspace_id, article_id));

drop policy if exists aha_v1_select on aha.publications;
create policy aha_v1_select on aha.publications
for select using (aha.can_read_workspace(workspace_id));

drop policy if exists aha_v1_select on aha.consent_receipts;
create policy aha_v1_select on aha.consent_receipts
for select using (profile_id = (select aha.current_profile_id()));

drop policy if exists aha_v1_select on aha.sharing_grants;
create policy aha_v1_select on aha.sharing_grants
for select using (
  granted_by_profile_id = (select aha.current_profile_id())
  or aha.can_admin_workspace(source_workspace_id)
  or aha.can_admin_workspace(target_workspace_id)
);

drop policy if exists aha_v1_select on aha.import_batches;
create policy aha_v1_select on aha.import_batches
for select using (profile_id = (select aha.current_profile_id()));

drop policy if exists aha_v1_select on aha.import_items;
create policy aha_v1_select on aha.import_items
for select using (aha.can_read_import_batch(workspace_id, import_batch_id));

drop policy if exists aha_v1_select on aha.device_sync_cursors;
create policy aha_v1_select on aha.device_sync_cursors
for select using (profile_id = (select aha.current_profile_id()));

drop policy if exists aha_v1_select on aha.data_exports;
create policy aha_v1_select on aha.data_exports
for select using (profile_id = (select aha.current_profile_id()));

drop policy if exists aha_v1_select on aha.deletion_requests;
create policy aha_v1_select on aha.deletion_requests
for select using (profile_id = (select aha.current_profile_id()));

drop policy if exists aha_v1_select on aha.ai_jobs;
create policy aha_v1_select on aha.ai_jobs
for select using (
  requested_by_profile_id = (select aha.current_profile_id())
  or aha.can_admin_workspace(workspace_id)
);

drop policy if exists aha_v1_select on aha.schema_versions;
create policy aha_v1_select on aha.schema_versions
for select using ((select aha.current_profile_id()) is not null);

-- audit_events, idempotency_keys and outbox_events intentionally have no
-- direct SELECT policy. They are exposed only through a future redacted API.

-- ---------------------------------------------------------------------------
-- No implicit function execution. PR 4 must grant only the policy helpers
-- required by a least-privilege, non-owner runtime database role.
-- ---------------------------------------------------------------------------

revoke all on function aha.request_claims() from public;
revoke all on function aha.current_auth_subject() from public;
revoke all on function aha.current_auth_provider() from public;
revoke all on function aha.current_profile_id() from public;
revoke all on function aha.workspace_role_rank(text) from public;
revoke all on function aha.can_read_workspace(text) from public;
revoke all on function aha.can_edit_workspace(text) from public;
revoke all on function aha.can_admin_workspace(text) from public;
revoke all on function aha.workspace_share_scope(text, text, text) from public;
revoke all on function aha.account_import_scope(text, text, text) from public;
revoke all on function aha.publication_scope(text, integer) from public;
revoke all on function aha.consent_is_active(text, text, text, text, text) from public;
revoke all on function aha.can_read_shared_object(text, text, text) from public;
revoke all on function aha.can_read_insight(text, text) from public;
revoke all on function aha.can_read_concept_list(text, text) from public;
revoke all on function aha.can_read_concept_list_item(text, text) from public;
revoke all on function aha.can_read_knowledge_path(text, text) from public;
revoke all on function aha.can_read_knowledge_path_step(text, text) from public;
revoke all on function aha.can_read_article(text, text) from public;
revoke all on function aha.can_read_import_batch(text, text) from public;
revoke all on function aha.enforce_consent_link() from public;

insert into aha.schema_versions (version, description, metadata)
values (
  'aha_tenancy_rls_consent_v1',
  'Fail-closed tenancy, read policy and exact consent contract for the canonical AHA schema.',
  jsonb_build_object(
    'runtime_activated', false,
    'frontend_grants_created', false,
    'direct_database_writes', false,
    'auth_context', 'verified_jwt_subject',
    'policy_count', 36,
    'backend_only_tables', jsonb_build_array('audit_events', 'idempotency_keys', 'outbox_events')
  )
)
on conflict (version) do nothing;

commit;
