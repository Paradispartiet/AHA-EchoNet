-- AHA canonical bidirectional sync journal v1
--
-- Server-side delta metadata only. This migration does not activate frontend
-- sync, grant browser writes, or make the journal a second system of record.

begin;

create table if not exists aha.sync_changes (
  cursor bigint generated always as identity primary key,
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  object_type text not null check (object_type in (
    'conversation','message','source_event','insight','concept_list','concept_list_item',
    'knowledge_path','knowledge_path_step','article','article_reference'
  )),
  object_id text not null,
  operation text not null check (operation in ('upsert','delete')),
  revision bigint not null check (revision > 0),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  changed_by_profile_id text references aha.profiles(id) on delete set null,
  device_id text,
  idempotency_key text not null,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  unique (workspace_id, object_type, object_id, revision),
  unique (workspace_id, idempotency_key),
  check (length(btrim(object_id)) > 0),
  check (length(btrim(idempotency_key)) >= 8)
);

create table if not exists aha.sync_conflicts (
  id text primary key default aha.new_id(),
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  profile_id text not null references aha.profiles(id) on delete cascade,
  device_id text,
  object_type text not null check (object_type in (
    'conversation','message','source_event','insight','concept_list','concept_list_item',
    'knowledge_path','knowledge_path_step','article','article_reference'
  )),
  object_id text not null,
  operation text not null check (operation in ('upsert','delete')),
  base_revision bigint not null check (base_revision >= 0),
  server_revision bigint not null check (server_revision >= 0),
  client_payload_hash text not null check (client_payload_hash ~ '^[a-f0-9]{64}$'),
  server_payload_hash text,
  status text not null default 'open' check (status in ('open','resolved_client','resolved_server','superseded')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  check (length(btrim(object_id)) > 0),
  check (server_payload_hash is null or server_payload_hash ~ '^[a-f0-9]{64}$'),
  check (resolved_at is null or resolved_at >= created_at),
  check ((status='open' and resolved_at is null) or status<>'open')
);

create index if not exists aha_sync_changes_workspace_cursor_idx
  on aha.sync_changes(workspace_id, cursor);
create index if not exists aha_sync_changes_object_idx
  on aha.sync_changes(workspace_id, object_type, object_id, revision desc);
create index if not exists aha_sync_conflicts_workspace_status_idx
  on aha.sync_conflicts(workspace_id, status, created_at desc);
create index if not exists aha_sync_conflicts_object_idx
  on aha.sync_conflicts(workspace_id, object_type, object_id, created_at desc);

alter table aha.sync_changes enable row level security;
alter table aha.sync_conflicts enable row level security;

-- No direct RLS policies or grants are created here. Push/pull will use narrow
-- backend command/read functions through the already safe NestJS DB session.
revoke all on aha.sync_changes from public;
revoke all on aha.sync_conflicts from public;
revoke all on sequence aha.sync_changes_cursor_seq from public;

insert into aha.schema_versions(version,description,metadata)
values (
  'aha_canonical_sync_journal_v1',
  'Server-side monotone delta journal and explicit conflict ledger for canonical AHA sync.',
  pg_catalog.jsonb_build_object(
    'runtime_activated', false,
    'frontend_sync_activated', false,
    'auto_sync', false,
    'login_triggers_sync', false,
    'direct_table_grants', false,
    'journal_is_system_of_record', false,
    'canonical_system_of_record', 'domain_tables'
  )
)
on conflict(version) do update
set description=excluded.description,
    metadata=excluded.metadata,
    applied_at=pg_catalog.now();

commit;
