-- OPT-IN STAGING ONLY. Not deployed by GitHub. Do not apply to production.
-- Keeps existing policies, grants and files unchanged. One-time installation.
-- Logical payload bytes, not total PostgreSQL disk/egress usage.
begin;
lock table public.aha_psychology_encrypted_backups in access exclusive mode;

create schema aha_psych_quota_private;
revoke all on schema aha_psych_quota_private from public, anon, authenticated, service_role;

create table aha_psych_quota_private.budget (
  singleton boolean primary key default true check (singleton),
  used_bytes bigint not null check (used_bytes >= 0),
  limit_bytes bigint not null check (limit_bytes >= 0),
  max_file_bytes integer not null check (max_file_bytes between 100 and 12582912),
  accepting_uploads boolean not null
);
alter table aha_psych_quota_private.budget enable row level security;
revoke all on aha_psych_quota_private.budget from public, anon, authenticated, service_role;

-- Initialize under the same lock as trigger installation. Grandfather existing
-- files even if they exceed the new maximum or aggregate budget.
insert into aha_psych_quota_private.budget
  (used_bytes, limit_bytes, max_file_bytes, accepting_uploads)
select coalesce(sum(octet_length(encrypted_file)), 0), 52428800, 524288, false
from public.aha_psychology_encrypted_backups;

create function aha_psych_quota_private.account_payload()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $quota$
declare
  bytes bigint;
begin
  if tg_op = 'INSERT' then
    -- Existing RLS remains authoritative; do not let a privileged insert
    -- with no verified user claim bypass ownership.
    if auth.uid() is distinct from new.user_id then
      raise exception using errcode = '42501', message = 'vault_owner_required';
    end if;
    bytes := octet_length(new.encrypted_file);
    -- UPDATE takes a row lock and rechecks its predicate against the latest
    -- committed counter at READ COMMITTED. At stronger isolation a
    -- serialization failure aborts the transaction instead of overbooking.
    update aha_psych_quota_private.budget
      set used_bytes = used_bytes + bytes
      where singleton and accepting_uploads
        and bytes <= max_file_bytes
        and used_bytes + bytes <= limit_bytes;
    if not found then
      raise exception using errcode = 'P0001', message = 'vault_quota_or_uploads_closed';
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    -- Also counts FK cascade on auth.users deletion; never require a
    -- current user claim for an already authorized cascading delete.
    bytes := octet_length(old.encrypted_file);
    update aha_psych_quota_private.budget
      set used_bytes = used_bytes - bytes
      where singleton and used_bytes >= bytes;
    if not found then
      raise exception using errcode = 'P0001', message = 'vault_quota_counter_inconsistent';
    end if;
    return old;
  end if;
  raise exception using errcode = '42501', message = 'vault_quota_maintenance_required';
end
$quota$;
revoke all on function aha_psych_quota_private.account_payload() from public, anon, authenticated, service_role;

-- AFTER triggers count only successfully inserted/deleted rows, not duplicate
-- INSERT ... ON CONFLICT DO NOTHING. All changes roll back together.
create trigger aha_psych_quota_count
after insert or delete on public.aha_psychology_encrypted_backups
for each row execute function aha_psych_quota_private.account_payload();
-- Prevent privileged UPDATE/TRUNCATE from silently drifting the counter.
-- Controlled maintenance must explicitly reconcile before restoring writes.
create trigger aha_psych_quota_block_update
before update on public.aha_psychology_encrypted_backups
for each row execute function aha_psych_quota_private.account_payload();
create trigger aha_psych_quota_block_truncate
before truncate on public.aha_psychology_encrypted_backups
for each statement execute function aha_psych_quota_private.account_payload();

commit;

-- Staging operator only: change accepting_uploads to true after tests/approval.
-- Set false to stop new inserts without disabling own SELECT or DELETE.
-- Never expose the private schema through the Data API.
