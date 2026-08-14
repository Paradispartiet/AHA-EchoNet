-- AHA Canonical PostgreSQL Schema v1
--
-- Status: migration contract only. This migration does not wire the browser
-- runtime, enable sync, activate EchoNet sharing, or replace legacy public.aha_* tables.
-- Apply the ordered migration set only in a controlled development/staging database.
-- Part 5 of 6: consent, sharing, import, sync and governance.

begin;

-- ---------------------------------------------------------------------------
-- Consent, sharing, import, sync and governance
-- ---------------------------------------------------------------------------

create table if not exists aha.consent_receipts (
  id text primary key default aha.new_id(),
  profile_id text not null references aha.profiles(id) on delete restrict,
  workspace_id text references aha.workspaces(id) on delete set null,
  purpose text not null,
  consent_scope text not null,
  policy_version text not null,
  status text not null default 'granted'
    check (status in ('granted', 'withdrawn', 'expired', 'rejected')),
  evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence) = 'object'),
  granted_at timestamptz,
  withdrawn_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0),
  unique (id, profile_id),
  check (length(btrim(purpose)) > 0),
  check (length(btrim(consent_scope)) > 0),
  check (length(btrim(policy_version)) > 0),
  check (withdrawn_at is null or withdrawn_at >= created_at),
  check (expires_at is null or expires_at >= created_at),
  check (status <> 'granted' or granted_at is not null),
  check (status <> 'withdrawn' or withdrawn_at is not null)
);

alter table aha.publications
  drop constraint if exists publications_consent_receipt_fk;

alter table aha.publications
  add constraint publications_consent_receipt_fk
  foreign key (consent_receipt_id, requested_by_profile_id)
  references aha.consent_receipts(id, profile_id) on delete restrict;

create table if not exists aha.sharing_grants (
  id text primary key default aha.new_id(),
  source_workspace_id text not null references aha.workspaces(id) on delete cascade,
  target_workspace_id text not null references aha.workspaces(id) on delete cascade,
  object_type text not null,
  object_id text not null,
  granted_by_profile_id text not null references aha.profiles(id) on delete restrict,
  consent_receipt_id text not null,
  permission text not null default 'view'
    check (permission in ('view', 'comment', 'edit', 'publish')),
  status text not null default 'active'
    check (status in ('active', 'revoked', 'expired')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0),
  unique (source_workspace_id, target_workspace_id, object_type, object_id, permission),
  foreign key (consent_receipt_id, granted_by_profile_id)
    references aha.consent_receipts(id, profile_id) on delete restrict,
  check (source_workspace_id <> target_workspace_id),
  check (length(btrim(object_type)) > 0),
  check (length(btrim(object_id)) > 0),
  check (revoked_at is null or revoked_at >= granted_at),
  check (expires_at is null or expires_at >= granted_at),
  check (status <> 'revoked' or revoked_at is not null),
  check (status <> 'expired' or expires_at is not null)
);

create table if not exists aha.import_batches (
  id text primary key default aha.new_id(),
  profile_id text not null references aha.profiles(id) on delete cascade,
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  device_id text,
  source_kind text not null,
  source_version text not null,
  payload_hash text not null,
  status text not null default 'previewed'
    check (status in ('previewed', 'running', 'completed', 'completed_with_rejections', 'failed', 'rolled_back')),
  preview_counts jsonb not null default '{}'::jsonb
    check (jsonb_typeof(preview_counts) = 'object'),
  result_counts jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result_counts) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0),
  unique (profile_id, workspace_id, source_kind, payload_hash),
  unique (id, workspace_id),
  foreign key (device_id, profile_id)
    references aha.devices(id, profile_id) on delete restrict,
  check (length(btrim(source_kind)) > 0),
  check (length(btrim(source_version)) > 0),
  check (length(btrim(payload_hash)) > 0),
  check (completed_at is null or completed_at >= coalesce(started_at, created_at)),
  check (rolled_back_at is null or rolled_back_at >= created_at)
);

create table if not exists aha.import_items (
  id text primary key default aha.new_id(),
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  import_batch_id text not null,
  local_storage_key text not null,
  local_object_id text not null,
  object_type text not null,
  canonical_object_id text,
  status text not null
    check (status in ('imported', 'duplicate', 'skipped', 'rejected', 'local_only', 'deferred')),
  reason text,
  object_hash text,
  created_at timestamptz not null default now(),
  unique (import_batch_id, local_storage_key, local_object_id, object_type),
  foreign key (import_batch_id, workspace_id)
    references aha.import_batches(id, workspace_id) on delete cascade,
  check (length(btrim(local_storage_key)) > 0),
  check (length(btrim(local_object_id)) > 0),
  check (length(btrim(object_type)) > 0)
);

create table if not exists aha.device_sync_cursors (
  device_id text not null,
  profile_id text not null,
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  pull_cursor bigint not null default 0 check (pull_cursor >= 0),
  push_cursor bigint not null default 0 check (push_cursor >= 0),
  last_pulled_at timestamptz,
  last_pushed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  primary key (device_id, workspace_id),
  foreign key (device_id, profile_id)
    references aha.devices(id, profile_id) on delete cascade
);

create table if not exists aha.data_exports (
  id text primary key default aha.new_id(),
  profile_id text not null references aha.profiles(id) on delete cascade,
  workspace_id text references aha.workspaces(id) on delete cascade,
  requested_by_profile_id text not null references aha.profiles(id) on delete restrict,
  export_scope text not null,
  format text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'expired', 'deleted')),
  storage_key text,
  checksum text,
  expires_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0),
  check (length(btrim(export_scope)) > 0),
  check (length(btrim(format)) > 0),
  check (completed_at is null or completed_at >= created_at),
  check (expires_at is null or expires_at >= created_at)
);

create table if not exists aha.deletion_requests (
  id text primary key default aha.new_id(),
  profile_id text not null references aha.profiles(id) on delete cascade,
  workspace_id text references aha.workspaces(id) on delete cascade,
  requested_by_profile_id text not null references aha.profiles(id) on delete restrict,
  target_type text not null,
  target_id text,
  reason text,
  export_before_delete boolean not null default false,
  status text not null default 'requested'
    check (status in ('requested', 'processing', 'completed', 'failed', 'cancelled')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  result jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0),
  check (length(btrim(target_type)) > 0),
  check (completed_at is null or completed_at >= requested_at)
);

create table if not exists aha.audit_events (
  id text primary key default aha.new_id(),
  workspace_id text references aha.workspaces(id) on delete set null,
  actor_profile_id text references aha.profiles(id) on delete set null,
  actor_type text not null
    check (actor_type in ('profile', 'system', 'service', 'anonymous')),
  action text not null,
  object_type text,
  object_id text,
  request_id text,
  correlation_id text,
  event_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(event_data) = 'object'),
  created_at timestamptz not null default now(),
  check (length(btrim(action)) > 0)
);

create table if not exists aha.idempotency_keys (
  id text primary key default aha.new_id(),
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  profile_id text not null references aha.profiles(id) on delete cascade,
  scope text not null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null default 'started'
    check (status in ('started', 'completed', 'failed', 'expired')),
  response_status integer,
  response_body jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0),
  unique (workspace_id, profile_id, scope, idempotency_key),
  check (length(btrim(scope)) > 0),
  check (length(btrim(idempotency_key)) > 0),
  check (length(btrim(request_hash)) > 0),
  check (expires_at > created_at)
);

create table if not exists aha.outbox_events (
  id text primary key default aha.new_id(),
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  aggregate_type text not null,
  aggregate_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'publishing', 'published', 'failed', 'dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  published_at timestamptz,
  last_error jsonb not null default '{}'::jsonb
    check (jsonb_typeof(last_error) = 'object'),
  correlation_id text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0),
  unique (workspace_id, event_type, idempotency_key),
  check (length(btrim(aggregate_type)) > 0),
  check (length(btrim(aggregate_id)) > 0),
  check (length(btrim(event_type)) > 0),
  check (published_at is null or published_at >= created_at)
);

create table if not exists aha.ai_jobs (
  id text primary key default aha.new_id(),
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  requested_by_profile_id text not null references aha.profiles(id) on delete restrict,
  source_event_id text,
  analysis_run_id text,
  consent_receipt_id text references aha.consent_receipts(id) on delete restrict,
  job_type text not null
    check (job_type in ('analysis', 'embedding', 'retrieval', 'publication', 'import', 'research_metric')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'waiting_for_approval', 'succeeded', 'failed', 'cancelled', 'dead_letter')),
  workflow_version text not null,
  prompt_version text,
  model_provider text,
  model_name text,
  input_hash text not null,
  idempotency_key text not null,
  checkpoint jsonb not null default '{}'::jsonb
    check (jsonb_typeof(checkpoint) = 'object'),
  result jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result) = 'object'),
  error jsonb not null default '{}'::jsonb
    check (jsonb_typeof(error) = 'object'),
  attempts integer not null default 0 check (attempts >= 0),
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0),
  unique (workspace_id, job_type, idempotency_key),
  unique (id, workspace_id),
  foreign key (source_event_id, workspace_id)
    references aha.source_events(id, workspace_id) on delete restrict,
  foreign key (analysis_run_id, workspace_id)
    references aha.analysis_runs(id, workspace_id) on delete restrict,
  check (length(btrim(workflow_version)) > 0),
  check (length(btrim(input_hash)) > 0),
  check (length(btrim(idempotency_key)) > 0),
  check (completed_at is null or completed_at >= coalesce(started_at, created_at))
);

commit;
