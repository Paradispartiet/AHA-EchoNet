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

-- AHA Music Spotify import MVP (metadata only; no audio files).
create table if not exists public.music_sources (
  id text primary key,
  profile_id uuid null references public.aha_profiles(id) on delete set null,
  source_type text not null default 'spotify',
  name text,
  scopes jsonb not null default '[]'::jsonb,
  metadata_only boolean not null default true,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.music_playlists (
  id text primary key,
  profile_id uuid null references public.aha_profiles(id) on delete set null,
  source_id text references public.music_sources(id) on delete set null,
  spotify_playlist_id text,
  name text,
  description text,
  owner_name text,
  track_count integer not null default 0,
  image_url text,
  spotify_url text,
  source text not null default 'spotify',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.music_albums (
  id text primary key,
  profile_id uuid null references public.aha_profiles(id) on delete set null,
  spotify_album_id text,
  name text,
  album_type text,
  release_date text,
  total_tracks integer not null default 0,
  image_url text,
  spotify_url text,
  source text not null default 'spotify',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.music_artists (
  id text primary key,
  profile_id uuid null references public.aha_profiles(id) on delete set null,
  spotify_artist_id text,
  name text,
  spotify_url text,
  source text not null default 'spotify',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.music_tracks (
  id text primary key,
  profile_id uuid null references public.aha_profiles(id) on delete set null,
  spotify_track_id text,
  spotify_album_id text,
  name text,
  duration_ms integer not null default 0,
  explicit boolean not null default false,
  popularity integer not null default 0,
  preview_url text,
  spotify_url text,
  album_name text,
  artist_names jsonb not null default '[]'::jsonb,
  source text not null default 'spotify',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.music_track_artists (
  id text primary key,
  profile_id uuid null references public.aha_profiles(id) on delete set null,
  spotify_track_id text,
  spotify_artist_id text,
  artist_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.music_playlist_tracks (
  id text primary key,
  profile_id uuid null references public.aha_profiles(id) on delete set null,
  spotify_playlist_id text,
  spotify_track_id text,
  position integer not null default 0,
  added_at timestamptz not null default now()
);

alter table public.music_sources enable row level security;
alter table public.music_playlists enable row level security;
alter table public.music_tracks enable row level security;
alter table public.music_albums enable row level security;
alter table public.music_artists enable row level security;
alter table public.music_track_artists enable row level security;
alter table public.music_playlist_tracks enable row level security;

create unique index if not exists idx_music_sources_profile_source on public.music_sources(profile_id, source_type);
create unique index if not exists idx_music_playlists_profile_spotify on public.music_playlists(profile_id, spotify_playlist_id) where spotify_playlist_id is not null;
create unique index if not exists idx_music_tracks_profile_spotify on public.music_tracks(profile_id, spotify_track_id) where spotify_track_id is not null;
create unique index if not exists idx_music_albums_profile_spotify on public.music_albums(profile_id, spotify_album_id) where spotify_album_id is not null;
create unique index if not exists idx_music_artists_profile_spotify on public.music_artists(profile_id, spotify_artist_id) where spotify_artist_id is not null;
create unique index if not exists idx_music_track_artists_profile_track_artist on public.music_track_artists(profile_id, spotify_track_id, spotify_artist_id);
create unique index if not exists idx_music_playlist_tracks_profile_playlist_track on public.music_playlist_tracks(profile_id, spotify_playlist_id, spotify_track_id);
create index if not exists idx_music_tracks_updated_at on public.music_tracks(updated_at desc);
