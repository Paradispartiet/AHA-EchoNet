-- PHASE 1: locked production provisioning. No user or service API grants.
-- Run only on the intended production project after operator approval.
-- Fails if the table already exists; never modifies an existing archive.
-- No client activation, no test data, no grants or permissive policies.
begin;

create table public.aha_psychology_encrypted_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_file text not null
    check (octet_length(encrypted_file) between 100 and 12582912),
  created_at timestamptz not null default now()
);

-- PostgreSQL CHECK accepts NULL, so require the entire expression to be TRUE.
-- Inspect raw JSON for duplicate keys before jsonb normalization can hide them.
alter table public.aha_psychology_encrypted_backups
  add constraint aha_psych_backup_envelope_check check ((
    encrypted_file IS JSON OBJECT WITH UNIQUE KEYS
    and jsonb_typeof(encrypted_file::jsonb) = 'object'
    and jsonb_typeof(encrypted_file::jsonb -> 'format') = 'string'
    and jsonb_typeof(encrypted_file::jsonb -> 'cipher') = 'string'
    and jsonb_typeof(encrypted_file::jsonb -> 'kdf') = 'string'
    and jsonb_typeof(encrypted_file::jsonb -> 'salt') = 'string'
    and jsonb_typeof(encrypted_file::jsonb -> 'iv') = 'string'
    and jsonb_typeof(encrypted_file::jsonb -> 'data') = 'string'
    and (encrypted_file::jsonb ?& array['format','version','kdf','iterations','cipher','salt','iv','data'])
    and (encrypted_file::jsonb - array['format','version','kdf','iterations','cipher','salt','iv','data']) = '{}'::jsonb
    and (encrypted_file::jsonb ->> 'format') = 'history-go-psychology-encrypted-backup-v1'
    and (encrypted_file::jsonb ->> 'cipher') = 'AES-256-GCM'
    and (encrypted_file::jsonb ->> 'kdf') = 'PBKDF2-SHA256'
    and (encrypted_file::jsonb -> 'version') = '1'::jsonb
    and (encrypted_file::jsonb -> 'iterations') = '310000'::jsonb
    and (encrypted_file::jsonb ->> 'salt') ~ '^[A-Za-z0-9+/]{22}==$'
    and (encrypted_file::jsonb ->> 'iv') ~ '^[A-Za-z0-9+/]{16}$'
    and length(encrypted_file::jsonb ->> 'data') >= 24
    and mod(length(encrypted_file::jsonb ->> 'data'), 4) = 0
    and (encrypted_file::jsonb ->> 'data') ~ '^[A-Za-z0-9+/]+={0,2}$'
  ) IS TRUE);

comment on table public.aha_psychology_encrypted_backups is
  'Optional per-user opaque encrypted file, one slot. Never feed into AHA insights, canonical sync, AI, or indexes.';

alter table public.aha_psychology_encrypted_backups enable row level security;
alter table public.aha_psychology_encrypted_backups force row level security;

revoke all on table public.aha_psychology_encrypted_backups
  from public, anon, authenticated, service_role;

-- Verify effective privileges, not just direct ACL entries, before commit.
do $locked$
declare
  role_name text;
  target regclass := 'public.aha_psychology_encrypted_backups'::regclass;
begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(role_name, target, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_any_column_privilege(role_name, target, 'SELECT,INSERT,UPDATE,REFERENCES') then
      raise exception 'Unexpected inherited vault privilege for %', role_name;
    end if;
  end loop;
  if not exists (select 1 from pg_class where oid = target
                 and relrowsecurity and relforcerowsecurity)
     or exists (select 1 from pg_policy where polrelid = target) then
    raise exception 'Vault must be RLS-protected and have no access policies';
  end if;
end
$locked$;

commit;

-- Phase 2 requires separate reviewed policies/grants and a deployment decision.
