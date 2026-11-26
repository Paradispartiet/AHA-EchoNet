\set ON_ERROR_STOP on
-- Disposable PostgreSQL: models Storage's SQL authorization, not its HTTP API.
create role authenticated nologin nosuperuser nobypassrls;
create role anon nologin nosuperuser nobypassrls;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key);
insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$$;
create table storage.buckets (id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects (bucket_id text references storage.buckets(id),name text,primary key(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage,auth to authenticated,anon;
grant select,insert,update,delete on storage.objects to authenticated,anon;
-- Deliberately overbroad legacy policy: restrictive guards must still protect pilot.
create policy legacy_permissive on storage.objects for all to public using (true) with check (true);
insert into storage.buckets values ('unrelated','unrelated',false,1000,array['application/json']);
\i supabase/kunstrommet-private-backup-staging.sql
do $$ begin
 if not exists (select 1 from storage.buckets where id='aha-kunstrommet-private-backups' and not public and file_size_limit=6291456 and allowed_mime_types=array['application/json']) then
 raise exception 'Private bucket contract failed'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select set_config('request.jwt.claims','{"is_anonymous":false,"app_metadata":{"aha_kunstrommet_backup_pilot":true}}',false);
do $test$ begin
 begin
 insert into storage.objects values ('aha-kunstrommet-private-backups','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.json');
 raise exception 'Unreserved upload allowed';
 exception when insufficient_privilege then null; end;
end $test$;
insert into public.aha_kunstrommet_backup_slots(user_id,slot,object_name) values ('11111111-1111-4111-8111-111111111111',1,'11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.json');
insert into storage.objects values ('aha-kunstrommet-private-backups','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.json');
do $test$ begin
 for i in 2..16 loop
 insert into public.aha_kunstrommet_backup_slots(user_id,slot,object_name)
 values ('11111111-1111-4111-8111-111111111111',i,'11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/'||lpad(i::text,8,'0')||'-bbbb-4bbb-8bbb-bbbbbbbbbbbb.json');
 end loop;
 begin
 insert into public.aha_kunstrommet_backup_slots(user_id,slot,object_name)
 values ('11111111-1111-4111-8111-111111111111',17,'11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc.json');
 raise exception 'Slot 17 allowed';
 exception when check_violation then null; end;
 begin
 insert into public.aha_kunstrommet_backup_slots(user_id,slot,object_name)
 values ('11111111-1111-4111-8111-111111111111',1,'11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc.json');
 raise exception 'Duplicate slot allowed';
 exception when unique_violation then null; end;
 begin
 delete from public.aha_kunstrommet_backup_slots where slot=1;
 raise exception 'Client released slot';
 exception when insufficient_privilege then null; end;
 begin
 insert into public.aha_kunstrommet_backup_slots(user_id,slot,object_name)
 values ('22222222-2222-4222-8222-222222222222',1,'22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.json');
 raise exception 'Cross-user reservation';
 exception when insufficient_privilege then null; end;
end $test$;
insert into storage.objects values ('unrelated','existing.json');
do $$ begin
 if (select count(*) from storage.objects where bucket_id='aha-kunstrommet-private-backups')<>1 then raise exception 'Own read failed'; end if;
 begin
 insert into storage.objects values ('aha-kunstrommet-private-backups','22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.json');
 raise exception 'Cross-user insert allowed';
 exception when insufficient_privilege then null; end;
 begin
 insert into storage.objects values ('aha-kunstrommet-private-backups','11111111-1111-4111-8111-111111111111/title.json');
 raise exception 'Malformed path allowed';
 exception when insufficient_privilege then null; end;
 update storage.objects set name='changed.json' where bucket_id='aha-kunstrommet-private-backups';
 if found then raise exception 'Overwrite allowed'; end if;
 update storage.objects set name='changed.json' where bucket_id='unrelated';
 if not found then raise exception 'Other bucket blocked'; end if;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='aha-kunstrommet-private-backups') then raise exception 'Cross-user read'; end if;
 if exists(select 1 from public.aha_kunstrommet_backup_slots) then raise exception 'Cross-user reservation read'; end if;
 delete from storage.objects where bucket_id='aha-kunstrommet-private-backups';
 if found then raise exception 'Cross-user delete'; end if;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select set_config('request.jwt.claims','{"is_anonymous":false,"user_metadata":{"aha_kunstrommet_backup_pilot":true}}',false);
do $$ begin
 begin
 insert into storage.objects values ('aha-kunstrommet-private-backups','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc.json');
 raise exception 'User metadata granted access';
 exception when insufficient_privilege then null; end;
 if not exists(select 1 from storage.objects where bucket_id='aha-kunstrommet-private-backups') then raise exception 'Former pilot cannot retrieve'; end if;
end $$;
select set_config('request.jwt.claims','{"is_anonymous":true,"app_metadata":{"aha_kunstrommet_backup_pilot":true}}',false);
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='aha-kunstrommet-private-backups') then raise exception 'Anonymous sign-in read'; end if;
 begin
 insert into storage.objects values ('aha-kunstrommet-private-backups','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc.json');
 raise exception 'Anonymous sign-in insert';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
select set_config('request.jwt.claim.sub','',false);
select set_config('request.jwt.claims','{}',false);
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='aha-kunstrommet-private-backups') then raise exception 'Anon read'; end if;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select set_config('request.jwt.claims','{"is_anonymous":false}',false);
delete from storage.objects where bucket_id='aha-kunstrommet-private-backups';
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='aha-kunstrommet-private-backups') then raise exception 'Owner delete failed'; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='aha-kunstrommet-private-backups') then raise exception 'Owner delete did not remove row'; end if;
 if (select count(*) from public.aha_kunstrommet_backup_slots)<>16 then raise exception 'Slot count changed'; end if;
end $$;
\echo 'Kunstrommet synthetic storage RLS: PASS'
