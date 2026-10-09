-- AHA Chat / Snakk med en venn V1
-- Apply explicitly to the existing public Supabase MVP only after the project
-- is active. No AHA AI, Chamber, canonical aha.* or sync write is enabled.
-- Registered users opt in by creating a public chat handle. No emails exposed.

begin;
create extension if not exists pgcrypto;

create table if not exists public.aha_friend_handles (
  profile_id uuid primary key references public.aha_profiles(id) on delete cascade,
  handle text not null unique
    check (handle ~ '^[a-z0-9_]{3,24}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.aha_friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.aha_profiles(id) on delete cascade,
  recipient_id uuid not null references public.aha_profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> recipient_id)
);
-- A pair may have only one current request, regardless of who initiated it.
create unique index if not exists aha_friend_requests_pair_unique
  on public.aha_friend_requests (
    least(requester_id, recipient_id),
    greatest(requester_id, recipient_id)
  );
create index if not exists aha_friend_requests_recipient
  on public.aha_friend_requests(recipient_id, created_at desc);
create index if not exists aha_friend_requests_requester
  on public.aha_friend_requests(requester_id, created_at desc);

create table if not exists public.aha_friend_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.aha_friend_requests(id) on delete cascade,
  sender_id uuid not null references public.aha_profiles(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists aha_friend_messages_thread
  on public.aha_friend_messages(request_id, created_at desc);

alter table public.aha_friend_handles enable row level security;
alter table public.aha_friend_requests enable row level security;
alter table public.aha_friend_messages enable row level security;

-- Explicit grants, including column-restricted updates and inserts.
-- Default Supabase public-schema grants must not broaden the mutation surface.
revoke all on public.aha_friend_handles from PUBLIC, anon, authenticated;
revoke all on public.aha_friend_requests from PUBLIC, anon, authenticated;
revoke all on public.aha_friend_messages from PUBLIC, anon, authenticated;
grant select, insert, delete on public.aha_friend_handles to authenticated;
grant update(handle) on public.aha_friend_handles to authenticated;
grant select, delete on public.aha_friend_requests to authenticated;
grant insert(requester_id, recipient_id) on public.aha_friend_requests to authenticated;
grant update(status) on public.aha_friend_requests to authenticated;
grant select, delete on public.aha_friend_messages to authenticated;
grant insert(request_id, sender_id, body) on public.aha_friend_messages to authenticated;

-- Opt-in handle directory: a registered user shares only a chosen handle + ID.
drop policy if exists aha_friend_handles_read on public.aha_friend_handles;
create policy aha_friend_handles_read on public.aha_friend_handles
  for select to authenticated using (true);
drop policy if exists aha_friend_handles_create on public.aha_friend_handles;
create policy aha_friend_handles_create on public.aha_friend_handles
  for insert to authenticated
  with check (profile_id = (select auth.uid()));
drop policy if exists aha_friend_handles_rename on public.aha_friend_handles;
create policy aha_friend_handles_rename on public.aha_friend_handles
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
drop policy if exists aha_friend_handles_remove on public.aha_friend_handles;
create policy aha_friend_handles_remove on public.aha_friend_handles
  for delete to authenticated using (profile_id = (select auth.uid()));

drop policy if exists aha_friend_requests_read on public.aha_friend_requests;
create policy aha_friend_requests_read on public.aha_friend_requests
  for select to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));
drop policy if exists aha_friend_requests_create on public.aha_friend_requests;
create policy aha_friend_requests_create on public.aha_friend_requests
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and recipient_id <> (select auth.uid())
    and status = 'pending'
  );
-- The recipient alone may accept or decline a pending invitation.
-- UPDATE(status) prevents changing the participants or record identity.
drop policy if exists aha_friend_requests_reply on public.aha_friend_requests;
create policy aha_friend_requests_reply on public.aha_friend_requests
  for update to authenticated
  using (recipient_id = (select auth.uid()) and status = 'pending')
  with check (recipient_id = (select auth.uid()) and status in ('accepted', 'declined'));
-- Removing a friendship erases this thread and its messages for both parties.
drop policy if exists aha_friend_requests_remove on public.aha_friend_requests;
create policy aha_friend_requests_remove on public.aha_friend_requests
  for delete to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));

drop policy if exists aha_friend_messages_read on public.aha_friend_messages;
create policy aha_friend_messages_read on public.aha_friend_messages
  for select to authenticated using (
    exists (
      select 1 from public.aha_friend_requests f
      where f.id = request_id and f.status = 'accepted'
        and (f.requester_id = (select auth.uid()) or f.recipient_id = (select auth.uid()))
    )
  );
drop policy if exists aha_friend_messages_send on public.aha_friend_messages;
create policy aha_friend_messages_send on public.aha_friend_messages
  for insert to authenticated with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.aha_friend_requests f
      where f.id = request_id and f.status = 'accepted'
        and (f.requester_id = (select auth.uid()) or f.recipient_id = (select auth.uid()))
    )
  );
drop policy if exists aha_friend_messages_delete_own on public.aha_friend_messages;
create policy aha_friend_messages_delete_own on public.aha_friend_messages
  for delete to authenticated using (sender_id = (select auth.uid()));

-- Optional realtime delivery; a polling fallback is always available.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'aha_friend_messages'
    ) then
    alter publication supabase_realtime add table public.aha_friend_messages;
  end if;
end;
$$;

-- Separate safety ledger. It is intentionally not a Social Meet table.
create table if not exists public.aha_friend_blocks (
  blocker_id uuid not null references public.aha_profiles(id) on delete cascade,
  blocked_id uuid not null references public.aha_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists aha_friend_blocks_blocked on public.aha_friend_blocks(blocked_id);
alter table public.aha_friend_blocks enable row level security;
revoke all on public.aha_friend_blocks from PUBLIC, anon, authenticated;
grant select, insert, delete on public.aha_friend_blocks to authenticated;

drop policy if exists aha_friend_blocks_read_own on public.aha_friend_blocks;
create policy aha_friend_blocks_read_own on public.aha_friend_blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
drop policy if exists aha_friend_blocks_insert_own on public.aha_friend_blocks;
create policy aha_friend_blocks_insert_own on public.aha_friend_blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));
drop policy if exists aha_friend_blocks_delete_own on public.aha_friend_blocks;
create policy aha_friend_blocks_delete_own on public.aha_friend_blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));

-- A private function can examine both directions without leaking block lists.
-- The current authenticated user MUST belong to the requested pair.
create schema if not exists aha_friend_private;
revoke all on schema aha_friend_private from PUBLIC, anon, authenticated;
grant usage on schema aha_friend_private to authenticated;

create or replace function aha_friend_private.pair_blocked(first_user uuid, second_user uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $function$
  select case
    when (select auth.uid()) = first_user or (select auth.uid()) = second_user then
      exists (
        select 1 from public.aha_friend_blocks b
        where (b.blocker_id = first_user and b.blocked_id = second_user)
           or (b.blocker_id = second_user and b.blocked_id = first_user)
      )
    else true
  end;
$function$;
revoke all on function aha_friend_private.pair_blocked(uuid,uuid) from PUBLIC, anon;
grant execute on function aha_friend_private.pair_blocked(uuid,uuid) to authenticated;

-- Apply block decisions at the database boundary, not just in the interface.
drop policy aha_friend_requests_read on public.aha_friend_requests;
create policy aha_friend_requests_read on public.aha_friend_requests
  for select to authenticated using (
    (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()))
    and not aha_friend_private.pair_blocked(requester_id,recipient_id)
  );
drop policy aha_friend_requests_create on public.aha_friend_requests;
create policy aha_friend_requests_create on public.aha_friend_requests
  for insert to authenticated with check (
    requester_id = (select auth.uid())
    and recipient_id <> (select auth.uid())
    and status = 'pending'
    and exists (select 1 from public.aha_friend_handles h where h.profile_id = requester_id)
    and exists (select 1 from public.aha_friend_handles h where h.profile_id = recipient_id)
    and not aha_friend_private.pair_blocked(requester_id,recipient_id)
  );
drop policy aha_friend_requests_reply on public.aha_friend_requests;
create policy aha_friend_requests_reply on public.aha_friend_requests
  for update to authenticated
  using (
    recipient_id = (select auth.uid()) and status = 'pending'
    and not aha_friend_private.pair_blocked(requester_id,recipient_id)
  )
  with check (
    recipient_id = (select auth.uid()) and status in ('accepted','declined')
    and not aha_friend_private.pair_blocked(requester_id,recipient_id)
  );
drop policy aha_friend_requests_remove on public.aha_friend_requests;
create policy aha_friend_requests_remove on public.aha_friend_requests
  for delete to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));
drop policy aha_friend_messages_read on public.aha_friend_messages;
create policy aha_friend_messages_read on public.aha_friend_messages
  for select to authenticated using (
    exists (
      select 1 from public.aha_friend_requests f
      where f.id = request_id and f.status = 'accepted'
        and (f.requester_id = (select auth.uid()) or f.recipient_id = (select auth.uid()))
        and not aha_friend_private.pair_blocked(f.requester_id,f.recipient_id)
    )
  );
drop policy aha_friend_messages_send on public.aha_friend_messages;
create policy aha_friend_messages_send on public.aha_friend_messages
  for insert to authenticated with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.aha_friend_requests f
      where f.id = request_id and f.status = 'accepted'
        and (f.requester_id = (select auth.uid()) or f.recipient_id = (select auth.uid()))
        and not aha_friend_private.pair_blocked(f.requester_id,f.recipient_id)
    )
  );

-- A server-owned daily invite counter cannot be reset by deleting invitations.
-- It contains only sender ID, date and count. It is not exposed to the browser.
create table if not exists aha_friend_private.invite_quotas (
  sender_id uuid not null references public.aha_profiles(id) on delete cascade,
  invite_day date not null,
  invite_count integer not null check (invite_count between 1 and 12),
  primary key (sender_id, invite_day)
);
revoke all on aha_friend_private.invite_quotas from PUBLIC, anon, authenticated;
alter table aha_friend_private.invite_quotas enable row level security;

create or replace function aha_friend_private.limit_daily_invites()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, aha_friend_private
as $function$
declare updated_count integer;
begin
  insert into aha_friend_private.invite_quotas (sender_id, invite_day, invite_count)
    values (new.requester_id, (now() at time zone 'UTC')::date, 1)
  on conflict (sender_id, invite_day)
    do update set invite_count = aha_friend_private.invite_quotas.invite_count + 1
    where aha_friend_private.invite_quotas.invite_count < 12
  returning invite_count into updated_count;
  if updated_count is null then
    raise exception using errcode = 'P0001', message = 'friend_invite_daily_limit';
  end if;
  -- Retain a maximum of 30 daily aggregate counters per active sender.
  delete from aha_friend_private.invite_quotas
  where sender_id = new.requester_id
    and invite_day < (now() at time zone 'UTC')::date - 30;
  return new;
end;
$function$;
revoke all on function aha_friend_private.limit_daily_invites() from PUBLIC, anon, authenticated;
drop trigger if exists aha_friend_invites_daily_limit on public.aha_friend_requests;
create trigger aha_friend_invites_daily_limit
  before insert on public.aha_friend_requests
  for each row execute function aha_friend_private.limit_daily_invites();

commit;
