\set ON_ERROR_STOP on
-- Run in the ephemeral PostgreSQL 16 CI service as the postgres superuser.
-- Simulates the Supabase auth.uid() boundary and genuine non-owner roles.
create schema if not exists auth;

do $init$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nosuperuser nobypassrls nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nosuperuser nobypassrls nologin;
  end if;
end
$init$;

create table if not exists auth.users (
  id uuid primary key
);

create or replace function auth.uid()
returns uuid language sql stable as
$uid$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $uid$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

insert into auth.users (id)
values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222')
on conflict do nothing;

\i supabase/psychology-encrypted-vault.sql

do $rights$
begin
  if has_table_privilege('anon','public.aha_psychology_encrypted_backups','SELECT')
    or has_table_privilege('anon','public.aha_psychology_encrypted_backups','INSERT')
    or has_table_privilege('anon','public.aha_psychology_encrypted_backups','DELETE')
    or has_table_privilege('authenticated','public.aha_psychology_encrypted_backups','UPDATE') then
    raise exception 'anonymous or update privilege must not exist';
  end if;
  if not has_table_privilege('authenticated','public.aha_psychology_encrypted_backups','SELECT')
    or not has_table_privilege('authenticated','public.aha_psychology_encrypted_backups','INSERT')
    or not has_table_privilege('authenticated','public.aha_psychology_encrypted_backups','DELETE') then
    raise exception 'missing minimum authenticated vault privileges';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'aha_psychology_encrypted_backups'
      and c.relrowsecurity = true and c.relforcerowsecurity = true
  ) then raise exception 'vault RLS must be enabled and forced'; end if;
end
$rights$;

-- Deliberately fake, but correctly structured ciphertext envelope: no private text.
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

insert into public.aha_psychology_encrypted_backups (user_id, encrypted_file)
values (
  '11111111-1111-4111-8111-111111111111',
  '{"format":"history-go-psychology-encrypted-backup-v1","version":1,"kdf":"PBKDF2-SHA256","iterations":310000,"cipher":"AES-256-GCM","salt":"AQEBAQEBAQEBAQEBAQEBAQ==","iv":"AgICAgICAgICAgIC","data":"AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD"}'
);

do $alice$
declare blocked boolean := false;
begin
  if (select count(*) from public.aha_psychology_encrypted_backups) <> 1 then
    raise exception 'Alice must see exactly her own backup';
  end if;
  begin
    insert into public.aha_psychology_encrypted_backups(user_id, encrypted_file)
    select '22222222-2222-4222-8222-222222222222', encrypted_file
    from public.aha_psychology_encrypted_backups
    where user_id='11111111-1111-4111-8111-111111111111';
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'cross-user INSERT was permitted'; end if;

  blocked := false;
  begin
    insert into public.aha_psychology_encrypted_backups(user_id, encrypted_file)
    select user_id, encrypted_file from public.aha_psychology_encrypted_backups
    where user_id='11111111-1111-4111-8111-111111111111';
  exception when unique_violation then blocked := true;
  end;
  if not blocked then raise exception 'duplicate one-slot upload must fail'; end if;

  blocked := false;
  begin
    update public.aha_psychology_encrypted_backups
    set created_at=now();
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'authenticated UPDATE must be forbidden'; end if;
end
$alice$;

-- Bob can only see Bob's own row; Alice's row must be invisible.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $bob$
begin
  if (select count(*) from public.aha_psychology_encrypted_backups) <> 0 then
    raise exception 'cross-user SELECT leak: Bob sees Alice data';
  end if;
end
$bob$;

insert into public.aha_psychology_encrypted_backups (user_id, encrypted_file)
values (
  '22222222-2222-4222-8222-222222222222',
  '{"format":"history-go-psychology-encrypted-backup-v1","version":1,"kdf":"PBKDF2-SHA256","iterations":310000,"cipher":"AES-256-GCM","salt":"AQEBAQEBAQEBAQEBAQEBAQ==","iv":"AgICAgICAgICAgIC","data":"AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD"}'
);

do $bobown$
begin
  if (select count(*) from public.aha_psychology_encrypted_backups) <> 1 then
    raise exception 'Bob must see his row, not Alice data';
  end if;
end
$bobown$;

-- Cross-user delete affects zero rows, including with an exact ID.
do $bobdelete$
declare removed integer;
begin
  delete from public.aha_psychology_encrypted_backups
  where user_id='11111111-1111-4111-8111-111111111111';
  get diagnostics removed = ROW_COUNT;
  if removed <> 0 then raise exception 'cross-user DELETE removed a row'; end if;
end
$bobdelete$;

reset role;
do $still$
begin
  if (select count(*) from public.aha_psychology_encrypted_backups) <> 2 then
    raise exception 'RLS probes changed another user backup';
  end if;
end
$still$;

set role anon;
do $anonymous$
declare blocked boolean := false;
begin
  begin
    perform 1 from public.aha_psychology_encrypted_backups;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'anon SELECT must be denied'; end if;
end
$anonymous$;
reset role;

\echo 'AHA private encrypted vault RLS rehearsal: PASS'
