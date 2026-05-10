-- AHA-EchoNet insight chamber sync.
-- Run this after schema.sql + policies.sql.
--
-- Lagrer hele insight-kammeret per profile som JSONB-blob. Chamberet
-- kan vokse seg stort, men det er fortsatt billig i den størrelsen vi
-- snakker om (få MB), og en JSON-kolonne unngår at vi må migrere
-- skjemaet hver gang vi legger til nye lag (raw_terms, claims,
-- patterns, markers, emne_suggestions, merge_suggestions, ...).

create table if not exists public.aha_insight_chambers (
  profile_id uuid primary key references public.aha_profiles(id) on delete cascade,
  chamber jsonb not null default '{"insights":[]}'::jsonb,
  insight_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.aha_insight_chambers enable row level security;

create policy "aha_insight_chambers_select_own"
  on public.aha_insight_chambers
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "aha_insight_chambers_insert_own"
  on public.aha_insight_chambers
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "aha_insight_chambers_update_own"
  on public.aha_insight_chambers
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
