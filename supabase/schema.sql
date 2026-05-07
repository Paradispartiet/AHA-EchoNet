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
  tags jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.aha_feed_posts (
  id text primary key,
  profile_id uuid null references public.aha_profiles(id) on delete set null,
  text text,
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
  tags jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
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
alter table public.aha_imports enable row level security;

create index if not exists idx_aha_source_events_created_at on public.aha_source_events(created_at desc);
create index if not exists idx_aha_notes_created_at on public.aha_notes(created_at desc);
create index if not exists idx_aha_gallery_items_created_at on public.aha_gallery_items(created_at desc);
create index if not exists idx_aha_feed_posts_created_at on public.aha_feed_posts(created_at desc);
create index if not exists idx_aha_insta_posts_created_at on public.aha_insta_posts(created_at desc);
create index if not exists idx_aha_imports_created_at on public.aha_imports(created_at desc);
