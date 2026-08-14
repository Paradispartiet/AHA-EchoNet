-- AHA Canonical PostgreSQL Schema v1
--
-- Status: migration contract only. This migration does not wire the browser
-- runtime, enable sync, activate EchoNet sharing, or replace legacy public.aha_* tables.
-- Apply the ordered migration set only in a controlled development/staging database.
-- Part 1 of 6: identity and workspaces.

begin;

create extension if not exists pgcrypto;
create schema if not exists aha;

comment on schema aha is
  'Canonical synchronized AHA/EchoNet data model. Local-only browser data is not stored here.';

revoke all on schema aha from public;
alter default privileges in schema aha revoke all on tables from public;
alter default privileges in schema aha revoke all on sequences from public;
alter default privileges in schema aha revoke all on functions from public;

create or replace function aha.new_id()
returns text
language sql
volatile
as $$
  select gen_random_uuid()::text;
$$;

create or replace function aha.bump_revision()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.revision is null or new.revision <= old.revision then
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identity and workspaces
-- ---------------------------------------------------------------------------

create table if not exists aha.profiles (
  id text primary key default aha.new_id(),
  auth_provider text not null,
  auth_subject text not null,
  display_name text,
  locale text not null default 'nb-NO',
  timezone text not null default 'Europe/Oslo',
  status text not null default 'active'
    check (status in ('active', 'suspended', 'deleted')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (auth_provider, auth_subject),
  check (length(btrim(id)) > 0),
  check (length(btrim(auth_provider)) > 0),
  check (length(btrim(auth_subject)) > 0),
  check (deleted_at is null or deleted_at >= created_at)
);

create table if not exists aha.devices (
  id text primary key default aha.new_id(),
  profile_id text not null references aha.profiles(id) on delete cascade,
  device_key text not null,
  name text,
  platform text,
  app_version text,
  status text not null default 'active'
    check (status in ('active', 'revoked', 'retired')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  unique (profile_id, device_key),
  unique (id, profile_id),
  check (length(btrim(device_key)) > 0),
  check (last_seen_at >= first_seen_at),
  check (deleted_at is null or deleted_at >= created_at)
);

create table if not exists aha.workspace_roles (
  id text primary key,
  display_name text not null,
  description text not null default '',
  rank integer not null check (rank >= 0),
  system_role boolean not null default true,
  created_at timestamptz not null default now(),
  check (length(btrim(id)) > 0)
);

insert into aha.workspace_roles (id, display_name, description, rank)
values
  ('owner', 'Owner', 'Owns the workspace and can administer membership.', 100),
  ('editor', 'Editor', 'Can edit shared workspace content.', 70),
  ('member', 'Member', 'Can participate within granted scopes.', 40),
  ('observer', 'Observer', 'Read-only participant.', 10)
on conflict (id) do nothing;

create table if not exists aha.workspaces (
  id text primary key default aha.new_id(),
  owner_profile_id text not null references aha.profiles(id) on delete restrict,
  workspace_type text not null default 'personal'
    check (workspace_type in ('personal', 'group', 'organization', 'research')),
  name text not null,
  description text not null default '',
  visibility text not null default 'private'
    check (visibility in ('private', 'invite_only', 'public')),
  status text not null default 'active'
    check (status in ('active', 'archived', 'deleted')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  unique (id, owner_profile_id),
  check (length(btrim(name)) > 0),
  check (deleted_at is null or deleted_at >= created_at)
);

create unique index if not exists aha_one_personal_workspace_per_owner
  on aha.workspaces(owner_profile_id)
  where workspace_type = 'personal' and deleted_at is null;

create table if not exists aha.workspace_memberships (
  id text primary key default aha.new_id(),
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  profile_id text not null references aha.profiles(id) on delete cascade,
  role_id text not null references aha.workspace_roles(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'invited', 'inactive', 'revoked')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  unique (workspace_id, profile_id),
  unique (id, workspace_id),
  check (deleted_at is null or deleted_at >= created_at)
);

create table if not exists aha.workspace_invitations (
  id text primary key default aha.new_id(),
  workspace_id text not null references aha.workspaces(id) on delete cascade,
  invited_by_profile_id text not null references aha.profiles(id) on delete restrict,
  accepted_profile_id text references aha.profiles(id) on delete set null,
  invitee_hint text,
  role_id text not null references aha.workspace_roles(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1 check (revision > 0),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  unique (token_hash),
  unique (id, workspace_id),
  check (length(btrim(token_hash)) > 0),
  check (expires_at > created_at),
  check (accepted_at is null or accepted_at >= created_at),
  check (revoked_at is null or revoked_at >= created_at)
);

commit;
