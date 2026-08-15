-- AHA canonical PostgreSQL function search-path hardening v1
--
-- Supabase's hosted database advisor requires every canonical function to pin
-- its search_path. Keep the helpers inside the private `aha` schema and avoid
-- broadening SECURITY DEFINER resolution through `public` or extension schemas.

begin;

create or replace function aha.new_id()
returns text
language sql
volatile
set search_path = pg_catalog, aha
as $function$
  select pg_catalog.gen_random_uuid()::text;
$function$;

create or replace function aha.bump_revision()
returns trigger
language plpgsql
set search_path = pg_catalog, aha
as $function$
begin
  new.updated_at := pg_catalog.now();
  if new.revision is null or new.revision <= old.revision then
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$function$;

revoke all on function aha.new_id() from public;
revoke all on function aha.bump_revision() from public;

insert into aha.schema_versions (version, description, metadata)
values (
  'aha_function_search_path_hardening_v1',
  'Pins canonical helper search paths after hosted Supabase security-advisor rehearsal.',
  pg_catalog.jsonb_build_object(
    'runtime_activated', false,
    'advisor_source', 'supabase_hosted_staging',
    'public_execute_granted', false,
    'search_path', 'pg_catalog,aha'
  )
)
on conflict (version) do update
set description = excluded.description,
    metadata = excluded.metadata,
    applied_at = pg_catalog.now();

commit;
