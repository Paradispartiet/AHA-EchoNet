-- AHA Canonical PostgreSQL Schema v1
--
-- Status: migration contract only. This migration does not wire the browser
-- runtime, enable sync, activate EchoNet sharing, or replace legacy public.aha_* tables.
-- Apply the ordered migration set only in a controlled development/staging database.
-- Part 4 of 6: concept lists, knowledge paths and publishing artifacts.

begin;

-- ---------------------------------------------------------------------------
-- Lists, paths and publishing artifacts
-- ---------------------------------------------------------------------------

create table if not exists aha.concept_lists (
  id text primary key,
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  created_by_profile_id text references aha.profiles(id) on delete set null,
  title text not null,
  list_type text not null,
  description text not null default '',
  source text not null default 'aha_lists',
  sharing_scope text not null default 'private'
    check (sharing_scope in ('private', 'workspace', 'public_candidate', 'public')),
  tags jsonb not null default '[]'::jsonb
    check (jsonb_typeof(tags) = 'array'),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (id, workspace_id),
  check (length(btrim(id)) > 0),
  check (length(btrim(title)) > 0),
  check (deleted_at is null or deleted_at >= created_at)
);

create table if not exists aha.concept_list_items (
  id text primary key,
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  list_id text not null,
  title text not null,
  item_type text not null,
  source text not null,
  ref_id text,
  position integer not null default 0 check (position >= 0),
  added_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (id, workspace_id),
  unique (list_id, id),
  foreign key (list_id, workspace_id)
    references aha.concept_lists(id, workspace_id) on delete cascade,
  check (length(btrim(id)) > 0),
  check (length(btrim(title)) > 0),
  check (length(btrim(item_type)) > 0),
  check (length(btrim(source)) > 0),
  check (deleted_at is null or deleted_at >= added_at)
);

create table if not exists aha.knowledge_paths (
  id text primary key,
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  created_by_profile_id text references aha.profiles(id) on delete set null,
  title text not null,
  path_type text not null,
  description text not null default '',
  goal text not null default '',
  learning_outcome text not null default '',
  source text not null default 'aha_paths',
  sharing_scope text not null default 'private'
    check (sharing_scope in ('private', 'workspace', 'public_candidate', 'public')),
  tags jsonb not null default '[]'::jsonb
    check (jsonb_typeof(tags) = 'array'),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (id, workspace_id),
  check (length(btrim(id)) > 0),
  check (length(btrim(title)) > 0),
  check (deleted_at is null or deleted_at >= created_at)
);

create table if not exists aha.knowledge_path_steps (
  id text primary key,
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  path_id text not null,
  title text not null,
  step_type text not null,
  source text not null,
  ref_id text,
  position integer not null default 0 check (position >= 0),
  status text not null default 'planned'
    check (status in ('planned', 'active', 'done', 'skipped')),
  narrative text not null default '',
  learning_outcome text not null default '',
  completion_criterion text not null default '',
  added_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (id, workspace_id),
  unique (path_id, id),
  foreign key (path_id, workspace_id)
    references aha.knowledge_paths(id, workspace_id) on delete cascade,
  check (length(btrim(id)) > 0),
  check (length(btrim(title)) > 0),
  check (deleted_at is null or deleted_at >= added_at)
);

create table if not exists aha.articles (
  id text primary key,
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  created_by_profile_id text references aha.profiles(id) on delete set null,
  section text not null,
  status text not null default 'draft'
    check (status in ('draft', 'review', 'ready', 'published_local', 'published', 'revoked', 'deleted')),
  publication_scope text not null default 'personal'
    check (publication_scope in ('personal', 'workspace', 'public_candidate', 'public')),
  current_version integer not null default 1 check (current_version > 0),
  source text not null default 'aha_avisa',
  tags jsonb not null default '[]'::jsonb
    check (jsonb_typeof(tags) = 'array'),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (id, workspace_id),
  check (length(btrim(id)) > 0),
  check (length(btrim(section)) > 0),
  check (deleted_at is null or deleted_at >= created_at)
);

create table if not exists aha.article_versions (
  article_id text not null,
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  version integer not null check (version > 0),
  created_by_profile_id text references aha.profiles(id) on delete set null,
  title text not null,
  summary text not null default '',
  body text not null default '',
  provenance jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provenance) = 'object'),
  created_at timestamptz not null default now(),
  primary key (article_id, version),
  unique (article_id, version, workspace_id),
  foreign key (article_id, workspace_id)
    references aha.articles(id, workspace_id) on delete cascade,
  check (length(btrim(title)) > 0),
  check (length(btrim(summary)) > 0 or length(btrim(body)) > 0)
);

alter table aha.articles
  drop constraint if exists articles_current_version_fk;

alter table aha.articles
  add constraint articles_current_version_fk
  foreign key (id, current_version, workspace_id)
  references aha.article_versions(article_id, version, workspace_id)
  deferrable initially deferred;

create table if not exists aha.article_references (
  id text primary key,
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  article_id text not null,
  title text not null,
  reference_type text not null,
  source text not null,
  ref_id text not null,
  position integer not null default 0 check (position >= 0),
  added_at timestamptz not null default now(),
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  unique (id, workspace_id),
  foreign key (article_id, workspace_id)
    references aha.articles(id, workspace_id) on delete cascade,
  check (length(btrim(id)) > 0),
  check (length(btrim(title)) > 0),
  check (length(btrim(ref_id)) > 0),
  check (deleted_at is null or deleted_at >= added_at)
);

create table if not exists aha.publications (
  id text primary key default aha.new_id(),
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  article_id text not null,
  article_version integer not null check (article_version > 0),
  requested_by_profile_id text not null references aha.profiles(id) on delete restrict,
  approved_by_profile_id text references aha.profiles(id) on delete set null,
  consent_receipt_id text,
  target_type text not null
    check (target_type in ('workspace', 'public', 'partner')),
  target_id text,
  status text not null default 'candidate'
    check (status in ('candidate', 'approved', 'published', 'failed', 'revoked')),
  payload_hash text,
  external_url text,
  published_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0),
  unique (id, workspace_id),
  foreign key (article_id, article_version, workspace_id)
    references aha.article_versions(article_id, version, workspace_id) on delete restrict,
  check (published_at is null or published_at >= created_at),
  check (revoked_at is null or revoked_at >= created_at),
  check (status <> 'published' or published_at is not null),
  check (status <> 'revoked' or revoked_at is not null),
  check (target_type <> 'public' or consent_receipt_id is not null)
);

commit;
