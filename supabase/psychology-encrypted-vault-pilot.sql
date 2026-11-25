-- PHASE 2: restricted pilot. Only operator-approved app_metadata claims
-- permit INSERT. Existing owners can always retrieve/delete their own files.
-- Run on the locked production table only after separate operator approval.
-- No users or account metadata are changed by this script.
begin;

lock table public.aha_psychology_encrypted_backups in access exclusive mode;

do $preflight$
declare
  target regclass := 'public.aha_psychology_encrypted_backups'::regclass;
  role_name text;
begin
  if not exists (select 1 from pg_class where oid = target
                 and relrowsecurity and relforcerowsecurity)
     or exists (select 1 from pg_policy where polrelid = target)
     or exists (select 1 from public.aha_psychology_encrypted_backups)
     or not exists (select 1 from pg_constraint where conrelid = target
                    and conname = 'aha_psych_backup_envelope_check'
                    and convalidated) then
    raise exception 'Expected an empty, locked, RLS-protected phase 1 vault';
  end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(role_name, target, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_any_column_privilege(role_name, target, 'SELECT,INSERT,UPDATE,REFERENCES') then
      raise exception 'Unexpected existing vault privilege for %', role_name;
    end if;
  end loop;
end
$preflight$;

create policy aha_psych_backup_select_own
  on public.aha_psychology_encrypted_backups
  for select to authenticated using (user_id = (select auth.uid()));

create policy aha_psych_backup_insert_pilot
  on public.aha_psychology_encrypted_backups
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and (select auth.jwt() -> 'app_metadata' -> 'aha_psychology_vault_pilot') = 'true'::jsonb
    and (select auth.jwt() -> 'is_anonymous') = 'false'::jsonb
  );

create policy aha_psych_backup_delete_own
  on public.aha_psychology_encrypted_backups
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, delete on table public.aha_psychology_encrypted_backups
  to authenticated;

-- The app_metadata flag is server-managed, NOT user_metadata.
-- A change to the claim requires JWT refresh; revoking it does not invalidate
-- existing tokens immediately. Emergency stop: REVOKE INSERT from authenticated.
-- No account has pilot access unless a trusted administrator grants the claim.
commit;
