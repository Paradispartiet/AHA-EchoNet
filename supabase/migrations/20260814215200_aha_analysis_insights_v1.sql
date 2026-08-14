-- AHA Canonical PostgreSQL Schema v1
--
-- Status: migration contract only. This migration does not wire the browser
-- runtime, enable sync, activate EchoNet sharing, or replace legacy public.aha_* tables.
-- Apply the ordered migration set only in a controlled development/staging database.
-- Part 3 of 6: analysis, evidence, insights and memory lifecycle.

begin;

-- ---------------------------------------------------------------------------
-- Analysis and evidence
-- ---------------------------------------------------------------------------

create table if not exists aha.analysis_runs (
  id text primary key default aha.new_id(),
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  requested_by_profile_id text not null references aha.profiles(id) on delete restrict,
  conversation_id text,
  source_event_id text not null,
  source_hash text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'waiting_for_approval', 'succeeded', 'failed', 'cancelled')),
  engine text not null,
  engine_version text not null,
  workflow_version text,
  prompt_version text,
  model_provider text,
  model_name text,
  canonical_result jsonb not null default '{}'::jsonb
    check (jsonb_typeof(canonical_result) = 'object'),
  quality_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(quality_summary) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0),
  unique (id, workspace_id),
  foreign key (conversation_id, workspace_id)
    references aha.conversations(id, workspace_id) on delete restrict,
  foreign key (source_event_id, workspace_id)
    references aha.source_events(id, workspace_id) on delete restrict,
  check (length(btrim(source_hash)) > 0),
  check (length(btrim(engine)) > 0),
  check (length(btrim(engine_version)) > 0),
  check (completed_at is null or completed_at >= coalesce(started_at, created_at))
);

create table if not exists aha.analysis_claims (
  id text primary key default aha.new_id(),
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  analysis_run_id text not null,
  claim_kind text not null
    check (claim_kind in ('source_evidence', 'interpretation', 'summary', 'recommendation', 'uncertainty')),
  claim_text text not null,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source_overlap numeric(5,4) check (source_overlap is null or (source_overlap >= 0 and source_overlap <= 1)),
  status text not null default 'active'
    check (status in ('active', 'suppressed', 'revised', 'rejected')),
  position integer not null default 0 check (position >= 0),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0),
  unique (id, workspace_id),
  foreign key (analysis_run_id, workspace_id)
    references aha.analysis_runs(id, workspace_id) on delete cascade,
  check (length(btrim(claim_text)) > 0)
);

create table if not exists aha.analysis_evidence (
  id text primary key default aha.new_id(),
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  analysis_claim_id text not null,
  source_event_id text not null,
  evidence_type text not null
    check (evidence_type in ('verbatim', 'paraphrase', 'metadata', 'absence', 'user_confirmation')),
  evidence_text text not null,
  source_hash text not null,
  quote_start integer check (quote_start is null or quote_start >= 0),
  quote_end integer check (quote_end is null or quote_end >= 0),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (analysis_claim_id, workspace_id)
    references aha.analysis_claims(id, workspace_id) on delete cascade,
  foreign key (source_event_id, workspace_id)
    references aha.source_events(id, workspace_id) on delete restrict,
  check (length(btrim(evidence_text)) > 0),
  check (length(btrim(source_hash)) > 0),
  check (quote_start is null or quote_end is null or quote_end >= quote_start)
);

-- ---------------------------------------------------------------------------
-- Insights, versions and memory lifecycle
-- ---------------------------------------------------------------------------

create table if not exists aha.insights (
  id text primary key,
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  created_by_profile_id text references aha.profiles(id) on delete set null,
  source_event_id text,
  analysis_run_id text,
  subject_id text,
  theme_id text,
  functional_type text not null default 'observation',
  status text not null default 'active'
    check (status in ('active', 'superseded', 'contested', 'stale', 'irrelevant', 'archived', 'deleted')),
  sharing_scope text not null default 'private'
    check (sharing_scope in ('private', 'workspace', 'public_candidate', 'public')),
  current_version integer not null default 1 check (current_version > 0),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (id, workspace_id),
  foreign key (source_event_id, workspace_id)
    references aha.source_events(id, workspace_id) on delete restrict,
  foreign key (analysis_run_id, workspace_id)
    references aha.analysis_runs(id, workspace_id) on delete restrict,
  check (length(btrim(id)) > 0),
  check (length(btrim(functional_type)) > 0),
  check (deleted_at is null or deleted_at >= created_at)
);

create table if not exists aha.insight_versions (
  insight_id text not null,
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  version integer not null check (version > 0),
  created_by_profile_id text references aha.profiles(id) on delete set null,
  title text not null,
  summary text not null,
  insight_text text not null,
  concepts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(concepts) = 'array'),
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  provenance jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provenance) = 'object'),
  created_at timestamptz not null default now(),
  primary key (insight_id, version),
  unique (insight_id, version, workspace_id),
  foreign key (insight_id, workspace_id)
    references aha.insights(id, workspace_id) on delete cascade,
  check (length(btrim(title)) > 0),
  check (length(btrim(summary)) > 0 or length(btrim(insight_text)) > 0)
);

alter table aha.insights
  drop constraint if exists insights_current_version_fk;

alter table aha.insights
  add constraint insights_current_version_fk
  foreign key (id, current_version, workspace_id)
  references aha.insight_versions(insight_id, version, workspace_id)
  deferrable initially deferred;

create table if not exists aha.insight_relations (
  id text primary key default aha.new_id(),
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  from_insight_id text not null,
  to_insight_id text not null,
  relation_type text not null
    check (relation_type in ('corrects', 'contests', 'supports', 'contrasts', 'causes', 'example_of', 'related_to', 'supersedes')),
  status text not null default 'active'
    check (status in ('active', 'rejected', 'deleted')),
  created_by_profile_id text references aha.profiles(id) on delete set null,
  explanation text not null default '',
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, from_insight_id, to_insight_id, relation_type),
  foreign key (from_insight_id, workspace_id)
    references aha.insights(id, workspace_id) on delete cascade,
  foreign key (to_insight_id, workspace_id)
    references aha.insights(id, workspace_id) on delete cascade,
  check (from_insight_id <> to_insight_id),
  check (deleted_at is null or deleted_at >= created_at)
);

create table if not exists aha.insight_feedback (
  id text primary key default aha.new_id(),
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  insight_id text not null,
  profile_id text not null references aha.profiles(id) on delete cascade,
  response text not null
    check (response in ('useful', 'too_generic', 'misinterpreted', 'missing_evidence')),
  analysis_source_hash text,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  foreign key (insight_id, workspace_id)
    references aha.insights(id, workspace_id) on delete cascade,
  check (undone_at is null or undone_at >= created_at)
);

create table if not exists aha.memory_revisions (
  id text primary key default aha.new_id(),
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  insight_id text not null,
  related_insight_id text,
  created_by_profile_id text references aha.profiles(id) on delete set null,
  memory_status text not null
    check (memory_status in ('active', 'superseded', 'contested', 'stale', 'irrelevant', 'reactivated')),
  reason text not null,
  explicit boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (insight_id, workspace_id)
    references aha.insights(id, workspace_id) on delete cascade,
  foreign key (related_insight_id, workspace_id)
    references aha.insights(id, workspace_id) on delete restrict,
  check (length(btrim(reason)) > 0),
  check (related_insight_id is null or related_insight_id <> insight_id)
);

commit;
