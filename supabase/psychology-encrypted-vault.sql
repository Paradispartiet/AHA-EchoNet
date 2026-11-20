-- OPT-IN STAGING SCRIPT ONLY. This script is NOT applied by deployment.
-- AHA's ordinary insight/canonical sync must never store psychology workbench text.
-- Apply only after real Supabase staging RLS tests and a separate activation decision.
--
-- Data boundary: user-initiated ciphertext backup already encrypted in History-Go
-- with PBKDF2-SHA256/AES-256-GCM. No notes, passphrase, map objects or diagnoses
-- are stored as readable database columns. Admin/service roles can view ciphertext
-- and timestamps, and Supabase sees account identifiers and sizes.
begin;

create table if not exists public.aha_psychology_encrypted_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_file text not null
    check (octet_length(encrypted_file) between 100 and 12582912),
  created_at timestamptz not null default now(),
  constraint aha_psych_backup_envelope_check check (
    encrypted_file::jsonb ->> 'format' = 'history-go-psychology-encrypted-backup-v1'
    and encrypted_file::jsonb ->> 'cipher' = 'AES-256-GCM'
    and encrypted_file::jsonb ->> 'kdf' = 'PBKDF2-SHA256'
    and encrypted_file::jsonb ->> 'version' = '1'
  )
);

comment on table public.aha_psychology_encrypted_backups is
  'Optional per-user opaque encrypted file, one slot. Never feed into AHA insights, canonical sync, AI, or indexes.';

alter table public.aha_psychology_encrypted_backups enable row level security;
alter table public.aha_psychology_encrypted_backups force row level security;

revoke all on table public.aha_psychology_encrypted_backups
  from public, anon, authenticated;

-- Explicit minimum privileges: SELECT for download/status, INSERT for the first
-- manual upload and DELETE for user-initiated removal. No UPDATE or UPSERT.
grant select, insert, delete on table public.aha_psychology_encrypted_backups
  to authenticated;

drop policy if exists aha_psych_backup_select_own
  on public.aha_psychology_encrypted_backups;
drop policy if exists aha_psych_backup_insert_own
  on public.aha_psychology_encrypted_backups;
drop policy if exists aha_psych_backup_delete_own
  on public.aha_psychology_encrypted_backups;

create policy aha_psych_backup_select_own
  on public.aha_psychology_encrypted_backups
  for select to authenticated using (user_id = (select auth.uid()));

create policy aha_psych_backup_insert_own
  on public.aha_psychology_encrypted_backups
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy aha_psych_backup_delete_own
  on public.aha_psychology_encrypted_backups
  for delete to authenticated using (user_id = (select auth.uid()));

commit;

-- REQUIRED BEFORE ACTIVATION (not automated by this file):
-- 1. In a dedicated Supabase staging project, simulate two authenticated users,
--    an anonymous user and an admin/service role.
-- 2. Assert cross-user SELECT / INSERT / DELETE denied (RLS + authenticated grants).
-- 3. Assert UPDATE/UPSERT denied even for owner, and no plaintext columns exist.
-- 4. Exercise the authenticated UI, network outage, duplicate upload and deletion.
-- 5. Ensure table is deployed by an authorized operator BEFORE enabling UI flag.
