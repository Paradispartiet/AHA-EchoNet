-- Paradisavisa -> AHA: explicit per-account reading-library backup (legacy public Supabase).
-- Deployment: run AFTER supabase/schema.sql and supabase/policies.sql in the same
-- existing AHA Supabase project. This migration is NOT automatically deployed.
-- No anonymous access, no global readable view, no service-role secret in browser.
-- This is separate from the not-yet-activated canonical aha.* schema.

begin;

create table if not exists public.aha_paradisavisa_reading_library (
  profile_id uuid not null references auth.users(id) on delete cascade,
  article_id text not null
    check (
      length(article_id) between 24 and 350
      and article_id ~ '^/Paradisavisa/(artikler|posts)/[^/?#]+[.]html$'
    ),
  title varchar(250) not null check (length(btrim(title)) > 0),
  summary varchar(700) not null default '',
  excerpt varchar(1100) not null default '',
  category varchar(80) not null default '',
  published_at varchar(35),
  saved_at timestamptz,
  read_at timestamptz,
  opened_at timestamptz,
  open_count integer not null default 0 check (open_count between 0 and 100000),
  tags jsonb not null default '[]'::jsonb
    check (jsonb_typeof(tags) = 'array' and jsonb_array_length(tags) <= 12),
  updated_at timestamptz not null default now(),
  primary key (profile_id, article_id),
  constraint aha_paradisavisa_reading_library_has_action
    check (saved_at is not null or read_at is not null or opened_at is not null)
);

create index if not exists idx_aha_paradisavisa_reading_library_recent
  on public.aha_paradisavisa_reading_library (profile_id, updated_at desc);

alter table public.aha_paradisavisa_reading_library enable row level security;
alter table public.aha_paradisavisa_reading_library force row level security;

-- Table is private. The public role and anonymous visitors get no privileges.
revoke all on public.aha_paradisavisa_reading_library from public;
revoke all on public.aha_paradisavisa_reading_library from anon;
grant select, insert, update, delete on public.aha_paradisavisa_reading_library to authenticated;

drop policy if exists aha_paradisavisa_reading_library_select_own on public.aha_paradisavisa_reading_library;
create policy aha_paradisavisa_reading_library_select_own
  on public.aha_paradisavisa_reading_library
  for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists aha_paradisavisa_reading_library_insert_own on public.aha_paradisavisa_reading_library;
create policy aha_paradisavisa_reading_library_insert_own
  on public.aha_paradisavisa_reading_library
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

drop policy if exists aha_paradisavisa_reading_library_update_own on public.aha_paradisavisa_reading_library;
create policy aha_paradisavisa_reading_library_update_own
  on public.aha_paradisavisa_reading_library
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

drop policy if exists aha_paradisavisa_reading_library_delete_own on public.aha_paradisavisa_reading_library;
create policy aha_paradisavisa_reading_library_delete_own
  on public.aha_paradisavisa_reading_library
  for delete to authenticated
  using (profile_id = (select auth.uid()));

commit;
