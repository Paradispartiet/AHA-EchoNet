-- AHA Canonical PostgreSQL Schema v1
--
-- Status: migration contract only. This migration does not wire the browser
-- runtime, enable sync, activate EchoNet sharing, or replace legacy public.aha_* tables.
-- Apply the ordered migration set only in a controlled development/staging database.
-- Part 6 of 6: indexes, revision triggers, fail-closed RLS baseline and schema receipt.

begin;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists aha_devices_profile_status_idx
  on aha.devices(profile_id, status) where deleted_at is null;
create index if not exists aha_workspaces_owner_status_idx
  on aha.workspaces(owner_profile_id, status) where deleted_at is null;
create index if not exists aha_memberships_profile_status_idx
  on aha.workspace_memberships(profile_id, status) where deleted_at is null;
create index if not exists aha_conversations_workspace_updated_idx
  on aha.conversations(workspace_id, updated_at desc) where deleted_at is null;
create index if not exists aha_messages_conversation_created_idx
  on aha.messages(conversation_id, created_at) where deleted_at is null;
create index if not exists aha_source_events_workspace_created_idx
  on aha.source_events(workspace_id, created_at desc) where deleted_at is null;
create index if not exists aha_source_events_hash_idx
  on aha.source_events(workspace_id, content_hash);
create index if not exists aha_analysis_runs_workspace_status_idx
  on aha.analysis_runs(workspace_id, status, created_at desc);
create index if not exists aha_analysis_runs_source_hash_idx
  on aha.analysis_runs(workspace_id, source_hash);
create index if not exists aha_claims_run_position_idx
  on aha.analysis_claims(analysis_run_id, position);
create index if not exists aha_insights_workspace_status_idx
  on aha.insights(workspace_id, status, updated_at desc) where deleted_at is null;
create index if not exists aha_insights_subject_theme_idx
  on aha.insights(workspace_id, subject_id, theme_id) where deleted_at is null;
create index if not exists aha_insight_relations_from_idx
  on aha.insight_relations(workspace_id, from_insight_id, relation_type) where deleted_at is null;
create index if not exists aha_insight_relations_to_idx
  on aha.insight_relations(workspace_id, to_insight_id, relation_type) where deleted_at is null;
create index if not exists aha_lists_workspace_updated_idx
  on aha.concept_lists(workspace_id, updated_at desc) where deleted_at is null;
create index if not exists aha_list_items_list_position_idx
  on aha.concept_list_items(list_id, position) where deleted_at is null;
create index if not exists aha_paths_workspace_updated_idx
  on aha.knowledge_paths(workspace_id, updated_at desc) where deleted_at is null;
create index if not exists aha_path_steps_path_position_idx
  on aha.knowledge_path_steps(path_id, position) where deleted_at is null;
create index if not exists aha_articles_workspace_status_idx
  on aha.articles(workspace_id, status, updated_at desc) where deleted_at is null;
create index if not exists aha_publications_status_idx
  on aha.publications(workspace_id, status, created_at desc);
create index if not exists aha_consents_profile_status_idx
  on aha.consent_receipts(profile_id, status, created_at desc);
create index if not exists aha_sharing_source_status_idx
  on aha.sharing_grants(source_workspace_id, status, created_at desc);
create index if not exists aha_sharing_target_status_idx
  on aha.sharing_grants(target_workspace_id, status, created_at desc);
create index if not exists aha_import_batches_workspace_status_idx
  on aha.import_batches(workspace_id, status, created_at desc);
create index if not exists aha_audit_workspace_created_idx
  on aha.audit_events(workspace_id, created_at desc);
create index if not exists aha_outbox_pending_idx
  on aha.outbox_events(status, available_at) where status in ('pending', 'failed');
create index if not exists aha_ai_jobs_status_schedule_idx
  on aha.ai_jobs(status, scheduled_at) where status in ('queued', 'failed');

-- ---------------------------------------------------------------------------
-- Monotonic revision triggers
-- ---------------------------------------------------------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'devices',
    'workspaces',
    'workspace_memberships',
    'workspace_invitations',
    'conversations',
    'messages',
    'source_events',
    'analysis_runs',
    'analysis_claims',
    'insights',
    'concept_lists',
    'concept_list_items',
    'knowledge_paths',
    'knowledge_path_steps',
    'articles',
    'publications',
    'consent_receipts',
    'sharing_grants',
    'import_batches',
    'device_sync_cursors',
    'data_exports',
    'deletion_requests',
    'idempotency_keys',
    'outbox_events',
    'ai_jobs'
  ]
  loop
    execute format('drop trigger if exists aha_bump_revision on aha.%I', table_name);
    execute format(
      'create trigger aha_bump_revision before update on aha.%I for each row execute function aha.bump_revision()',
      table_name
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fail-closed RLS baseline
-- ---------------------------------------------------------------------------
--
-- No user-facing policies or grants are created here. PR 3 owns the concrete
-- tenant, RLS and consent policy matrix. Enabling RLS now ensures that a future
-- direct client role cannot read these tables merely because schema usage is
-- granted accidentally.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'devices',
    'workspace_roles',
    'workspaces',
    'workspace_memberships',
    'workspace_invitations',
    'conversations',
    'conversation_participants',
    'messages',
    'source_events',
    'source_attachments',
    'analysis_runs',
    'analysis_claims',
    'analysis_evidence',
    'insights',
    'insight_versions',
    'insight_relations',
    'insight_feedback',
    'memory_revisions',
    'concept_lists',
    'concept_list_items',
    'knowledge_paths',
    'knowledge_path_steps',
    'articles',
    'article_versions',
    'article_references',
    'publications',
    'consent_receipts',
    'sharing_grants',
    'import_batches',
    'import_items',
    'device_sync_cursors',
    'data_exports',
    'deletion_requests',
    'audit_events',
    'idempotency_keys',
    'outbox_events',
    'ai_jobs'
  ]
  loop
    execute format('alter table aha.%I enable row level security', table_name);
  end loop;
end;
$$;

create table if not exists aha.schema_versions (
  version text primary key,
  description text not null,
  applied_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object')
);

insert into aha.schema_versions (version, description, metadata)
values (
  'aha_canonical_postgresql_schema_v1',
  'Initial normalized canonical schema for synchronized AHA/EchoNet data.',
  jsonb_build_object(
    'runtime_activated', false,
    'legacy_public_tables_modified', false,
    'rls_policy_version', null,
    'source_adr', 'ADR-001'
  )
)
on conflict (version) do nothing;

commit;
