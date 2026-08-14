-- AHA Canonical PostgreSQL Schema v1
--
-- Status: migration contract only. This migration does not wire the browser
-- runtime, enable sync, activate EchoNet sharing, or replace legacy public.aha_* tables.
-- Apply the ordered migration set only in a controlled development/staging database.
-- Part 2 of 6: conversations and sources.

begin;

-- ---------------------------------------------------------------------------
-- Conversations and sources
-- ---------------------------------------------------------------------------

create table if not exists aha.conversations (
  id text primary key default aha.new_id(),
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  created_by_profile_id text not null references aha.profiles(id) on delete restrict,
  conversation_type text not null default 'personal_ai'
    check (conversation_type in ('personal_ai', 'group', 'reflection', 'imported')),
  title text not null,
  status text not null default 'active'
    check (status in ('active', 'archived', 'deleted')),
  source_app text not null default 'aha_chat',
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (id, workspace_id),
  check (length(btrim(title)) > 0),
  check (deleted_at is null or deleted_at >= created_at)
);

create table if not exists aha.conversation_participants (
  id text primary key default aha.new_id(),
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  conversation_id text not null,
  profile_id text references aha.profiles(id) on delete cascade,
  participant_type text not null
    check (participant_type in ('profile', 'assistant', 'system', 'external')),
  participant_key text not null,
  role text not null default 'member'
    check (role in ('owner', 'member', 'assistant', 'observer')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  unique (conversation_id, participant_key),
  foreign key (conversation_id, workspace_id)
    references aha.conversations(id, workspace_id) on delete cascade,
  check (length(btrim(participant_key)) > 0),
  check (left_at is null or left_at >= joined_at),
  check (
    (participant_type = 'profile' and profile_id is not null)
    or participant_type <> 'profile'
  )
);

create table if not exists aha.messages (
  id text primary key default aha.new_id(),
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  conversation_id text not null,
  author_profile_id text references aha.profiles(id) on delete set null,
  role text not null
    check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  content_hash text not null,
  source_app text not null default 'aha_chat',
  intent text,
  project text,
  tags jsonb not null default '[]'::jsonb
    check (jsonb_typeof(tags) = 'array'),
  concepts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(concepts) = 'array'),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (id, workspace_id),
  foreign key (conversation_id, workspace_id)
    references aha.conversations(id, workspace_id) on delete cascade,
  check (length(btrim(content)) > 0),
  check (length(btrim(content_hash)) > 0),
  check (deleted_at is null or deleted_at >= created_at)
);

create table if not exists aha.source_events (
  id text primary key,
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  created_by_profile_id text references aha.profiles(id) on delete set null,
  conversation_id text,
  message_id text,
  source_type text not null,
  source_app text not null,
  content_type text not null,
  title text not null default '',
  source_text text not null default '',
  content_hash text not null,
  user_created boolean not null default true,
  imported boolean not null default false,
  occurred_at timestamptz not null default now(),
  tags jsonb not null default '[]'::jsonb
    check (jsonb_typeof(tags) = 'array'),
  provenance jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provenance) = 'object'),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (id, workspace_id),
  foreign key (conversation_id, workspace_id)
    references aha.conversations(id, workspace_id) on delete restrict,
  foreign key (message_id, workspace_id)
    references aha.messages(id, workspace_id) on delete restrict,
  check (length(btrim(id)) > 0),
  check (length(btrim(source_type)) > 0),
  check (length(btrim(source_app)) > 0),
  check (length(btrim(content_type)) > 0),
  check (length(btrim(content_hash)) > 0),
  check (length(btrim(title)) > 0 or length(btrim(source_text)) > 0),
  check (deleted_at is null or deleted_at >= created_at)
);

create table if not exists aha.source_attachments (
  id text primary key default aha.new_id(),
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  source_event_id text not null,
  storage_key text not null,
  media_type text not null,
  original_name text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  checksum text,
  status text not null default 'available'
    check (status in ('pending', 'available', 'quarantined', 'deleted')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, workspace_id),
  unique (workspace_id, storage_key),
  foreign key (source_event_id, workspace_id)
    references aha.source_events(id, workspace_id) on delete cascade,
  check (length(btrim(storage_key)) > 0),
  check (length(btrim(media_type)) > 0),
  check (deleted_at is null or deleted_at >= created_at)
);

commit;
