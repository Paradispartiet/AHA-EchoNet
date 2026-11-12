-- Must run after the fixture and the migration with psql -v ON_ERROR_STOP=1.
-- All private reads/writes are tested under SET ROLE authenticated, NOT the
-- superuser/table-owner who could otherwise bypass RLS.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
insert into public.aha_paradisavisa_reading_library
  (profile_id, article_id, title, saved_at)
values
  ('11111111-1111-4111-8111-111111111111',
   '/Paradisavisa/artikler/a.html', 'A sin artikkel', now());

do $test$
begin
  if (select count(*) from public.aha_paradisavisa_reading_library) <> 1 then
    raise exception 'A must see its own article';
  end if;
  begin
    insert into public.aha_paradisavisa_reading_library
      (profile_id, article_id, title, saved_at)
    values
      ('22222222-2222-4222-8222-222222222222',
       '/Paradisavisa/artikler/forfalsket.html', 'Falskt eierskap', now());
    raise exception 'cross-account insert unexpectedly succeeded';
  exception when insufficient_privilege then
    null; -- RLS WITH CHECK raises 42501 on foreign-profile INSERT.
  end;
end
$test$;

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
insert into public.aha_paradisavisa_reading_library
  (profile_id, article_id, title, saved_at)
values
  ('22222222-2222-4222-8222-222222222222',
   '/Paradisavisa/artikler/b.html', 'B sin artikkel', now());

do $test$
declare changed integer;
begin
  if (select count(*) from public.aha_paradisavisa_reading_library) <> 1 then
    raise exception 'B must see exactly one record';
  end if;
  if exists (select 1 from public.aha_paradisavisa_reading_library
             where profile_id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'B must not see A';
  end if;
  update public.aha_paradisavisa_reading_library
     set title = 'Endret av uvedkommende'
   where profile_id = '11111111-1111-4111-8111-111111111111';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'B was able to modify A';
  end if;
  delete from public.aha_paradisavisa_reading_library
   where profile_id = '11111111-1111-4111-8111-111111111111';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'B was able to delete A';
  end if;
end
$test$;

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $test$
begin
  if (select count(*) from public.aha_paradisavisa_reading_library) <> 1 then
    raise exception 'A must still see exactly its own article';
  end if;
  if (select title from public.aha_paradisavisa_reading_library
      where article_id='/Paradisavisa/artikler/a.html') <> 'A sin artikkel' then
    raise exception 'A article must remain unchanged';
  end if;
end
$test$;

reset role;
set role anon;
do $test$
begin
  begin
    perform count(*) from public.aha_paradisavisa_reading_library;
    raise exception 'Anonymous article access unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end
$test$;

reset role;
do $test$
begin
  if (select count(*) from public.aha_paradisavisa_reading_library) <> 2 then
    raise exception 'Two private records must remain present, one per user';
  end if;
  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'aha_paradisavisa_reading_library') <> 4 then
    raise exception 'Expected all four owner-scoped RLS policies';
  end if;
end
$test$;
select 'PASS: isolated owner rows, write restrictions, anonymous denial and deletion protection' as rls_result;
