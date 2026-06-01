-- AHA-EchoNet Supabase/Postgres schema
-- Run this file in Supabase SQL Editor.
-- RLS is enabled on all tables. Auth policies will be added later.

create extension if not exists pgcrypto;

create table if not exists public.aha_profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.aha_source_events (
  id text primary key,
  profile_id uuid null references public.aha_profiles(id) on delete set null,
  source_type text,
  source_app text,
  content_type text,
  title text,
  text text,
  user_created boolean not null default true,
  imported boolean not null default false,
  tags jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.aha_notes (
  id text primary key,
  profile_id uuid null references public.aha_profiles(id) on delete set null,
  title text,
  text text,
  deleted_at timestamptz null,
  last_source_event_id text null,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.aha_gallery_items (
  id text primary key,
  profile_id uuid null references public.aha_profiles(id) on delete set null,
  type text,
  title text,
  description text,
  src text,
  thumbnail text,
  source_type text,
  source_app text,
  user_created boolean not null default true,
  imported boolean not null default false,
  deleted_at timestamptz null,
  last_source_event_id text null,
  tags jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.aha_feed_posts (
  id text primary key,
  profile_id uuid null references public.aha_profiles(id) on delete set null,
  text text,
  deleted_at timestamptz null,
  last_source_event_id text null,
  tags jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.aha_insta_posts (
  id text primary key,
  profile_id uuid null references public.aha_profiles(id) on delete set null,
  title text,
  caption text,
  src text,
  content_type text,
  deleted_at timestamptz null,
  last_source_event_id text null,
  tags jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.aha_insta_profiles (
  profile_id uuid primary key references public.aha_profiles(id) on delete cascade,
  local_id text,
  username text,
  display_name text,
  bio text,
  avatar text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.aha_insta_likes (
  id text primary key,
  profile_id uuid null references public.aha_profiles(id) on delete set null,
  post_id text,
  user_id text,
  deleted_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.aha_insta_comments (
  id text primary key,
  profile_id uuid null references public.aha_profiles(id) on delete set null,
  post_id text,
  user_id text,
  username text,
  text text,
  deleted_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.aha_insta_follows (
  id text primary key,
  profile_id uuid null references public.aha_profiles(id) on delete set null,
  follower_id text,
  following_id text,
  following_username text,
  deleted_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.aha_imports (
  id text primary key,
  profile_id uuid null references public.aha_profiles(id) on delete set null,
  source_app text,
  payload jsonb,
  counts jsonb,
  created_at timestamptz not null default now()
);

alter table public.aha_profiles enable row level security;
alter table public.aha_source_events enable row level security;
alter table public.aha_notes enable row level security;
alter table public.aha_gallery_items enable row level security;
alter table public.aha_feed_posts enable row level security;
alter table public.aha_insta_posts enable row level security;
alter table public.aha_insta_profiles enable row level security;
alter table public.aha_insta_likes enable row level security;
alter table public.aha_insta_comments enable row level security;
alter table public.aha_insta_follows enable row level security;
alter table public.aha_imports enable row level security;

create index if not exists idx_aha_source_events_created_at on public.aha_source_events(created_at desc);
create index if not exists idx_aha_notes_created_at on public.aha_notes(created_at desc);
create index if not exists idx_aha_gallery_items_created_at on public.aha_gallery_items(created_at desc);
create index if not exists idx_aha_feed_posts_created_at on public.aha_feed_posts(created_at desc);
create index if not exists idx_aha_insta_posts_created_at on public.aha_insta_posts(created_at desc);
create index if not exists idx_aha_insta_likes_post_id on public.aha_insta_likes(post_id);
create index if not exists idx_aha_insta_comments_post_id on public.aha_insta_comments(post_id);
create index if not exists idx_aha_insta_follows_following on public.aha_insta_follows(following_username);
create index if not exists idx_aha_imports_created_at on public.aha_imports(created_at desc);

-- Soft-delete + source-event trace columns for existing installations.
-- create table if not exists does not add new columns to existing tables,
-- so these alter statements make the schema safe to rerun.

alter table public.aha_notes
  add column if not exists deleted_at timestamptz null,
  add column if not exists last_source_event_id text null;

alter table public.aha_gallery_items
  add column if not exists deleted_at timestamptz null,
  add column if not exists last_source_event_id text null;

alter table public.aha_feed_posts
  add column if not exists deleted_at timestamptz null,
  add column if not exists last_source_event_id text null;

alter table public.aha_insta_posts
  add column if not exists deleted_at timestamptz null,
  add column if not exists last_source_event_id text null;
