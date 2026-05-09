-- AHA-EchoNet embedding-lag
-- Kjør etter schema.sql + policies.sql.
-- Krever pgvector. Aktiverer den automatisk hvis den ikke allerede er på.

create extension if not exists vector;

-- Tabellen lagrer ett embedding per insight. id matcher chamberets
-- insight.id. profile_id binder raden til en innlogget bruker, og RLS
-- sørger for at man kun ser sine egne embeddings.
create table if not exists public.aha_insight_embeddings (
  id text primary key,
  profile_id uuid null references public.aha_profiles(id) on delete set null,
  subject_id text,
  theme_id text,
  summary text,
  embedding vector(1024) not null,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists aha_insight_embeddings_profile_idx
  on public.aha_insight_embeddings (profile_id);

-- IVFFlat-indeks for cosine-søk. lists=100 fungerer bra opp til
-- titusenvis av rader; juster opp ved større korpus.
create index if not exists aha_insight_embeddings_vec_idx
  on public.aha_insight_embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table public.aha_insight_embeddings enable row level security;

create policy "aha_insight_embeddings_select_own"
  on public.aha_insight_embeddings
  for select to authenticated
  using (profile_id = auth.uid());

create policy "aha_insight_embeddings_insert_own"
  on public.aha_insight_embeddings
  for insert to authenticated
  with check (profile_id = auth.uid());

create policy "aha_insight_embeddings_update_own"
  on public.aha_insight_embeddings
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "aha_insight_embeddings_delete_own"
  on public.aha_insight_embeddings
  for delete to authenticated
  using (profile_id = auth.uid());

-- RPC: finn de mest like insights for innlogget bruker.
-- Bruker security invoker så RLS gjelder; profil-filteret er
-- defensivt og dobbelt-låst gjennom auth.uid().
create or replace function public.aha_match_insights(
  query_embedding vector(1024),
  match_count int default 10,
  similarity_threshold float default 0.5,
  filter_subject_id text default null,
  filter_theme_id text default null
)
returns table (
  id text,
  subject_id text,
  theme_id text,
  summary text,
  similarity float,
  created_at timestamptz
)
language sql
stable
security invoker
as $$
  select
    e.id,
    e.subject_id,
    e.theme_id,
    e.summary,
    1 - (e.embedding <=> query_embedding) as similarity,
    e.created_at
  from public.aha_insight_embeddings e
  where e.profile_id = auth.uid()
    and (filter_subject_id is null or e.subject_id = filter_subject_id)
    and (filter_theme_id is null or e.theme_id = filter_theme_id)
    and 1 - (e.embedding <=> query_embedding) >= similarity_threshold
  order by e.embedding <=> query_embedding asc
  limit greatest(match_count, 1);
$$;
