-- STAGING ONLY. No automatic migration or production deployment.
-- This is a new private bucket; abort if it already exists.
-- Immutable revisions: <auth.uid>/<project uuid>/<revision uuid>.json
-- No title, note, profile metadata, or image content in object paths.
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aha-kunstrommet-private-backups', 'aha-kunstrommet-private-backups', false, 37748736, array['application/json']);
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
