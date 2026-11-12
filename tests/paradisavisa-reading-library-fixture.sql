-- Deterministic Postgres 16 fixture for the un-deployed Paradisavisa/Aha RLS migration.
-- This does NOT touch any real Supabase account or production data.
create role authenticated nologin;
create role anon nologin;
create schema auth;
create table auth.users (id uuid primary key);

create or replace function auth.uid() returns uuid
language sql stable
as $func$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$func$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant usage on schema public to authenticated, anon;

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
