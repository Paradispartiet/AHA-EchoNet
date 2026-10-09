-- AHA / History Go Social Meet direct chat bridge v1
-- Production rollout is a separate gated operation after exact-source review.
-- Reuses the existing AHA friend messaging store. An accepted meet is NOT
-- converted into friendship. HG invites and HG blocks remain server-owned.
begin;

alter table public.aha_friend_requests
  add column if not exists source text not null default 'friend';
alter table public.aha_friend_requests
  drop constraint if exists aha_friend_requests_source_check;
alter table public.aha_friend_requests
  add constraint aha_friend_requests_source_check
  check (source in ('friend','social_meet'));

-- The canonical pair is unique PER kind, so a meet cannot automatically
-- accept an independently pending AHA friendship invitation.
drop index if exists public.aha_friend_requests_pair_unique;
create unique index if not exists aha_friend_requests_pair_source_unique
  on public.aha_friend_requests (
    least(requester_id, recipient_id),
    greatest(requester_id, recipient_id),
    source
  );

create table if not exists aha_friend_private.meet_links (
  request_id uuid not null references public.aha_friend_requests(id) on delete cascade,
  hg_invite_id uuid not null unique references public.hg_spotmeeting_invites(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (request_id, hg_invite_id)
);
create index if not exists aha_friend_meet_links_invite on aha_friend_private.meet_links(hg_invite_id);
alter table aha_friend_private.meet_links enable row level security;
revoke all on aha_friend_private.meet_links from public, anon, authenticated;

-- Callers can learn only whether *their own* pair is eligible.
-- We do not expose History Go private profiles or meeting records.
create or replace function aha_friend_private.meet_pair_allowed(
  first_user uuid, second_user uuid
) returns boolean
language sql stable security definer
set search_path = pg_catalog, public, aha_friend_private
as $function$
  select
    first_user is not null
    and second_user is not null
    and first_user <> second_user
    and auth.uid() in (first_user, second_user)
    and exists (
      select 1 from public.aha_profiles a where a.id = first_user
    )
    and exists (
      select 1 from public.aha_profiles a where a.id = second_user
    )
    and not aha_friend_private.pair_blocked(first_user,second_user)
    and exists (
      select 1 from public.hg_profiles h1
      join public.hg_profiles h2 on h2.user_id = second_user
      where h1.user_id = first_user
        and h1.deleted_at is null and h2.deleted_at is null
        and h1.profile_id is not null and h2.profile_id is not null
        and not exists (
          select 1 from public.hg_social_meet_blocks b
          where b.status = 'active'
            and (
              (b.blocker_profile_id = h1.profile_id and b.blocked_profile_id = h2.profile_id)
              or (b.blocker_profile_id = h2.profile_id and b.blocked_profile_id = h1.profile_id)
            )
        )
        and not exists (
          select 1 from public.hg_social_meet_profile_restrictions m
          where m.status = 'active'
            and m.profile_id in (h1.profile_id,h2.profile_id)
        )
    );
$function$;
revoke all on function aha_friend_private.meet_pair_allowed(uuid,uuid) from public, anon;
grant execute on function aha_friend_private.meet_pair_allowed(uuid,uuid) to authenticated;

-- A meet chat exists only while a valid server-owned invite is accepted
-- or completed; cancelled, blocked, reported and expired meetings lose access.
create or replace function aha_friend_private.meet_thread_allowed(
  target_request_id uuid
) returns boolean
language sql stable security definer
set search_path = pg_catalog, public, aha_friend_private
as $function$
  select exists (
    select 1
    from public.aha_friend_requests r
    join aha_friend_private.meet_links l on l.request_id = r.id
    join public.hg_spotmeeting_invites hg on hg.id = l.hg_invite_id
    where r.id = target_request_id
      and r.source = 'social_meet' and r.status = 'accepted'
      and auth.uid() in (r.requester_id,r.recipient_id)
      and (
        (hg.created_by = r.requester_id and hg.target_user_id = r.recipient_id)
        or (hg.created_by = r.recipient_id and hg.target_user_id = r.requester_id)
      )
      and (
        hg.status = 'completed'
        or (hg.status = 'accepted' and hg.expires_at > now())
      )
      and aha_friend_private.meet_pair_allowed(r.requester_id,r.recipient_id)
  );
$function$;
revoke all on function aha_friend_private.meet_thread_allowed(uuid) from public, anon;
grant execute on function aha_friend_private.meet_thread_allowed(uuid) to authenticated;

-- No direct user-created "social_meet" request can pass RLS.
drop policy if exists aha_friend_requests_create on public.aha_friend_requests;
create policy aha_friend_requests_create on public.aha_friend_requests
  for insert to authenticated with check (
    requester_id = (select auth.uid())
    and recipient_id <> (select auth.uid())
    and status = 'pending'
    and source = 'friend'
    and exists (select 1 from public.aha_friend_handles h where h.profile_id = requester_id)
    and exists (select 1 from public.aha_friend_handles h where h.profile_id = recipient_id)
    and not aha_friend_private.pair_blocked(requester_id,recipient_id)
  );
drop policy if exists aha_friend_requests_reply on public.aha_friend_requests;
create policy aha_friend_requests_reply on public.aha_friend_requests
  for update to authenticated using (
    source = 'friend' and recipient_id = (select auth.uid())
    and status = 'pending'
    and not aha_friend_private.pair_blocked(requester_id,recipient_id)
  )
  with check (
    source = 'friend' and recipient_id = (select auth.uid())
    and status in ('accepted','declined')
    and not aha_friend_private.pair_blocked(requester_id,recipient_id)
  );
drop policy if exists aha_friend_requests_read on public.aha_friend_requests;
create policy aha_friend_requests_read on public.aha_friend_requests
  for select to authenticated using (
    (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()))
    and not aha_friend_private.pair_blocked(requester_id,recipient_id)
    and (source = 'friend' or aha_friend_private.meet_thread_allowed(id))
  );
drop policy if exists aha_friend_messages_read on public.aha_friend_messages;
create policy aha_friend_messages_read on public.aha_friend_messages
  for select to authenticated using (
    exists (
      select 1 from public.aha_friend_requests f
      where f.id = request_id and f.status = 'accepted'
        and (f.requester_id = (select auth.uid()) or f.recipient_id = (select auth.uid()))
        and not aha_friend_private.pair_blocked(f.requester_id,f.recipient_id)
        and (f.source = 'friend' or aha_friend_private.meet_thread_allowed(f.id))
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
        and not aha_friend_private.pair_blocked(f.requester_id,f.recipient_id)
        and (f.source = 'friend' or aha_friend_private.meet_thread_allowed(f.id))
    )
  );

-- This is the sole creation path for a Social Meet conversation.
-- It requires a real, server-owned, accepted/completed invite and two
-- existing AHA accounts. The identity is always taken from auth.uid().
create or replace function public.aha_open_social_meet_chat(meet_invite_id uuid)
returns table (request_id uuid, peer_id uuid)
language plpgsql security definer
set search_path = pg_catalog, public, aha_friend_private
as $function$
declare
  actual_user uuid := auth.uid();
  hg record;
  first_user uuid;
  second_user uuid;
  request_uuid uuid;
begin
  if actual_user is null or meet_invite_id is null then
    raise exception using errcode='42501', message='chat_auth_required';
  end if;
  select i.created_by, i.target_user_id, i.status, i.expires_at
    into hg from public.hg_spotmeeting_invites i where i.id=meet_invite_id;
  if not found or actual_user not in (hg.created_by,hg.target_user_id)
     or not (hg.status='completed'
       or (hg.status='accepted' and hg.expires_at>now())) then
    raise exception using errcode='42501',message='meet_chat_not_authorized';
  end if;
  first_user := least(hg.created_by,hg.target_user_id);
  second_user := greatest(hg.created_by,hg.target_user_id);
  if not aha_friend_private.meet_pair_allowed(first_user,second_user) then
    raise exception using errcode='42501',message='meet_chat_unavailable';
  end if;
  insert into public.aha_friend_requests(requester_id,recipient_id,status,source)
    values(first_user,second_user,'accepted','social_meet')
  on conflict (least(requester_id,recipient_id),greatest(requester_id,recipient_id),source)
    do update set updated_at=public.aha_friend_requests.updated_at
  returning id into request_uuid;
  insert into aha_friend_private.meet_links(request_id,hg_invite_id)
    values(request_uuid,meet_invite_id)
  on conflict (hg_invite_id) do nothing;
  if not aha_friend_private.meet_thread_allowed(request_uuid) then
    raise exception using errcode='42501',message='meet_chat_link_failed';
  end if;
  request_id := request_uuid;
  peer_id := case when actual_user=first_user then second_user else first_user end;
  return next;
end;
$function$;
revoke all on function public.aha_open_social_meet_chat(uuid) from public, anon;
grant execute on function public.aha_open_social_meet_chat(uuid) to authenticated;

-- Frontend cannot alter the source of a server-owned meet contact.
revoke update(source) on public.aha_friend_requests from authenticated;
-- On deletion, linked access is removed with the contact; HG canonical invites
-- are never changed from this migration.
commit;
