-- STAGING ONLY. No automatic migration or production deployment.
-- This is a new private bucket; abort if it already exists.
-- Immutable revisions: <auth.uid>/<project uuid>/<revision uuid>.json
-- No title, note, profile metadata, or image content in object paths.
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aha-kunstrommet-private-backups', 'aha-kunstrommet-private-backups', false, 6291456, array['application/json']);
-- Staging: 16 unique reserved paths, each limited to 6 MiB by Storage.
create table public.aha_kunstrommet_backup_slots (
 user_id uuid not null references auth.users(id) on delete restrict,
 slot smallint not null check(slot between 1 and 16),
 object_name text not null unique,
 created_at timestamptz not null default now(),
 primary key(user_id,slot),
 check(split_part(object_name,'/',1)=user_id::text and object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json
-- Restrictive policies defend against pre-existing broad permissive policies.
-- Other buckets retain their original authorization model.
create policy aha_kr_select_guard on storage.objects as restrictive for select to public
using (bucket_id <> 'aha-kunstrommet-private-backups' or ((select auth.uid())::text = split_part(name, '/', 1)
    and (select auth.jwt()) -> 'is_anonymous' = 'false'::jsonb
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$'));
create policy aha_kr_insert_guard on storage.objects as restrictive for insert to public
with check (bucket_id <> 'aha-kunstrommet-private-backups' or (((select auth.uid())::text = split_part(name, '/', 1)
    and (select auth.jwt()) -> 'is_anonymous' = 'false'::jsonb
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$') and ((select auth.jwt()) -> 'app_metadata' -> 'aha_kunstrommet_backup_pilot' = 'true'::jsonb) and exists(select 1 from public.aha_kunstrommet_backup_slots q
 where q.user_id=(select auth.uid()) and q.object_name=storage.objects.name)));
create policy aha_kr_delete_guard on storage.objects as restrictive for delete to public
using (bucket_id <> 'aha-kunstrommet-private-backups' or ((select auth.uid())::text = split_part(name, '/', 1)
    and (select auth.jwt()) -> 'is_anonymous' = 'false'::jsonb
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$'));
create policy aha_kr_update_guard on storage.objects as restrictive for update to public
using (bucket_id <> 'aha-kunstrommet-private-backups') with check (bucket_id <> 'aha-kunstrommet-private-backups');
-- Existing Supabase Storage grants and RLS are assumed; no global grants altered.
create policy aha_kr_select_own on storage.objects for select to authenticated
using (bucket_id = 'aha-kunstrommet-private-backups' and ((select auth.uid())::text = split_part(name, '/', 1)
    and (select auth.jwt()) -> 'is_anonymous' = 'false'::jsonb
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$'));
create policy aha_kr_insert_pilot on storage.objects for insert to authenticated
with check (bucket_id = 'aha-kunstrommet-private-backups' and ((select auth.uid())::text = split_part(name, '/', 1)
    and (select auth.jwt()) -> 'is_anonymous' = 'false'::jsonb
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$') and ((select auth.jwt()) -> 'app_metadata' -> 'aha_kunstrommet_backup_pilot' = 'true'::jsonb));
create policy aha_kr_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'aha-kunstrommet-private-backups' and ((select auth.uid())::text = split_part(name, '/', 1)
    and (select auth.jwt()) -> 'is_anonymous' = 'false'::jsonb
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$'));
commit;
)
);
alter table public.aha_kunstrommet_backup_slots enable row level security;
alter table public.aha_kunstrommet_backup_slots force row level security;
revoke all on public.aha_kunstrommet_backup_slots from public,anon,authenticated;
grant select on public.aha_kunstrommet_backup_slots to anon,authenticated;
grant insert(user_id,slot,object_name) on public.aha_kunstrommet_backup_slots to authenticated;
create policy aha_kr_slot_read on public.aha_kunstrommet_backup_slots for select to authenticated
using(user_id=(select auth.uid()) and (select auth.jwt())->'is_anonymous'='false'::jsonb);
create policy aha_kr_slot_create on public.aha_kunstrommet_backup_slots for insert to authenticated
with check(user_id=(select auth.uid()) and (select auth.jwt())->'is_anonymous'='false'::jsonb
 and (select auth.jwt())->'app_metadata'->'aha_kunstrommet_backup_pilot'='true'::jsonb);

-- Restrictive policies defend against pre-existing broad permissive policies.
-- Other buckets retain their original authorization model.
create policy aha_kr_select_guard on storage.objects as restrictive for select to public
using (bucket_id <> 'aha-kunstrommet-private-backups' or ((select auth.uid())::text = split_part(name, '/', 1)
    and (select auth.jwt()) -> 'is_anonymous' = 'false'::jsonb
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$'));
create policy aha_kr_insert_guard on storage.objects as restrictive for insert to public
with check (bucket_id <> 'aha-kunstrommet-private-backups' or (((select auth.uid())::text = split_part(name, '/', 1)
    and (select auth.jwt()) -> 'is_anonymous' = 'false'::jsonb
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$') and ((select auth.jwt()) -> 'app_metadata' -> 'aha_kunstrommet_backup_pilot' = 'true'::jsonb)));
create policy aha_kr_delete_guard on storage.objects as restrictive for delete to public
using (bucket_id <> 'aha-kunstrommet-private-backups' or ((select auth.uid())::text = split_part(name, '/', 1)
    and (select auth.jwt()) -> 'is_anonymous' = 'false'::jsonb
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$'));
create policy aha_kr_update_guard on storage.objects as restrictive for update to public
using (bucket_id <> 'aha-kunstrommet-private-backups') with check (bucket_id <> 'aha-kunstrommet-private-backups');
-- Existing Supabase Storage grants and RLS are assumed; no global grants altered.
create policy aha_kr_select_own on storage.objects for select to authenticated
using (bucket_id = 'aha-kunstrommet-private-backups' and ((select auth.uid())::text = split_part(name, '/', 1)
    and (select auth.jwt()) -> 'is_anonymous' = 'false'::jsonb
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$'));
create policy aha_kr_insert_pilot on storage.objects for insert to authenticated
with check (bucket_id = 'aha-kunstrommet-private-backups' and ((select auth.uid())::text = split_part(name, '/', 1)
    and (select auth.jwt()) -> 'is_anonymous' = 'false'::jsonb
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$') and ((select auth.jwt()) -> 'app_metadata' -> 'aha_kunstrommet_backup_pilot' = 'true'::jsonb));
create policy aha_kr_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'aha-kunstrommet-private-backups' and ((select auth.uid())::text = split_part(name, '/', 1)
    and (select auth.jwt()) -> 'is_anonymous' = 'false'::jsonb
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$'));
commit;
