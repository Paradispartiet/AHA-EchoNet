-- AHA social moderation v1; staging-only contract, no runtime grants.
-- Append-only operator decisions, bound to verified canonical profile identity.
begin;

alter table aha_social.reports
 add column status text not null default 'open' check(status in ('open','dismissed','actioned')),
 add column reviewed_at timestamptz,
 add column reviewed_by_profile_id text references aha.profiles(id) on delete restrict;

create table aha_social.moderators (
 profile_id text primary key references aha.profiles(id) on delete restrict,
 enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create table aha_social.moderation_events (
 id uuid primary key default gen_random_uuid(),
 post_id uuid not null references aha_social.posts(id) on delete restrict,
 moderator_profile_id text not null references aha.profiles(id) on delete restrict,
 action text not null check(action in ('hide','dismiss')),
 note text not null check(length(btrim(note)) between 5 and 500),
 report_count integer not null check(report_count > 0),
 created_at timestamptz not null default now()
);
create index social_reports_status_post on aha_social.reports(status,post_id);
create index social_moderation_events_post on aha_social.moderation_events(post_id,created_at desc);
alter table aha_social.moderators enable row level security;
alter table aha_social.moderation_events enable row level security;

create or replace function aha_social.require_moderator_v1()
returns text language plpgsql stable security definer
set search_path = pg_catalog, aha, aha_social as $fn$
declare v_profile text;
begin
 v_profile := aha_social.require_profile_v1();
 if not exists (
   select 1 from aha_social.moderators m
   where m.profile_id=v_profile and m.enabled=true
 ) then
  raise exception 'social moderator required' using errcode='42501';
 end if;
 return v_profile;
end;
$fn$;

-- This returns only pending reported content and aggregates, not reporter identity.
create or replace function aha_social.moderation_queue_v1(p_limit integer)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, aha, aha_social as $fn$
declare v_moderator text; v_result jsonb;
begin
 v_moderator:=aha_social.require_moderator_v1();
 if p_limit is null or p_limit not between 1 and 40 then
  raise exception 'invalid social moderation request' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(q.obj order by q.last_reported desc),'[]'::jsonb)
 into v_result
 from (
  select coalesce(rr.last_reported,p.created_at) last_reported,
  jsonb_build_object(
    'postId',p.id,'kind',p.kind,'text',p.body,
    'mediaUrl',p.media_url,'createdAt',p.created_at,
    'reportCount',rr.report_count,'reasons',rr.reasons
  ) obj
  from aha_social.posts p
  join lateral (
    select count(*) report_count, max(r.created_at) last_reported,
      array_agg(distinct r.reason order by r.reason) reasons
    from aha_social.reports r
    where r.post_id=p.id and r.status='open'
  ) rr on rr.report_count>0
  where p.state='published'
  order by rr.last_reported desc,p.id desc
  limit p_limit
 ) q;
 return v_result;
end;
$fn$;

create or replace function aha_social.moderate_post_v1(
 p_post_id uuid,p_action text,p_note text
)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, aha, aha_social as $fn$
declare v_moderator text; v_post aha_social.posts%rowtype;
 v_report_count integer; v_audit_id uuid;
begin
 v_moderator:=aha_social.require_moderator_v1();
 if p_action is null or p_action not in('hide','dismiss')
  or length(btrim(coalesce(p_note,''))) not between 5 and 500 then
  raise exception 'invalid social moderation request' using errcode='22023';
 end if;
 select * into v_post from aha_social.posts where id=p_post_id for update;
 if not found or v_post.state<>'published' then
  raise exception 'post unavailable' using errcode='42501';
 end if;
 select count(*) into v_report_count from aha_social.reports
  where post_id=p_post_id and status='open';
 if v_report_count=0 then
  raise exception 'no open social reports' using errcode='42501';
 end if;
 if p_action='hide' then
  update aha_social.posts set state='hidden' where id=p_post_id;
 end if;
 update aha_social.reports
  set status=case when p_action='hide' then 'actioned' else 'dismissed' end,
      reviewed_at=now(), reviewed_by_profile_id=v_moderator
  where post_id=p_post_id and status='open';
 insert into aha_social.moderation_events(post_id,moderator_profile_id,action,note,report_count)
 values(p_post_id,v_moderator,p_action,btrim(p_note),v_report_count)
 returning id into v_audit_id;
 return jsonb_build_object('postId',p_post_id,'decision',p_action,
   'status',case when p_action='hide' then 'hidden' else 'published' end,
   'reportCount',v_report_count,'auditId',v_audit_id);
end;
$fn$;

-- Repeating a dismissed report must not reopen it. A distinct reporter may
-- create a new case; operators can then make a separate audited decision.
create or replace function aha_social.report_post_v1(p_id uuid,p_reason text)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, aha, aha_social as $fn$
declare v_self text; v_existing text;
begin
 v_self:=aha_social.require_profile_v1();
 if p_reason is null or p_reason not in('spam','abuse','privacy','other') then
  raise exception 'invalid report reason' using errcode='22023';
 end if;
 if not exists(select 1 from aha_social.posts where id=p_id and state='published') then
  raise exception 'post unavailable' using errcode='42501';
 end if;
 select status into v_existing from aha_social.reports
  where post_id=p_id and profile_id=v_self;
 if v_existing is null then
  insert into aha_social.reports(post_id,profile_id,reason)
  values(p_id,v_self,p_reason);
 elsif v_existing='open' then
  update aha_social.reports set reason=p_reason,created_at=now()
   where post_id=p_id and profile_id=v_self;
 end if;
 return jsonb_build_object('reported',true,
   'status',coalesce(v_existing,'open'));
end;
$fn$;

revoke all on function aha_social.require_moderator_v1() from public;
revoke all on function aha_social.moderation_queue_v1(integer) from public;
revoke all on function aha_social.moderate_post_v1(uuid,text,text) from public;
revoke all on function aha_social.report_post_v1(uuid,text) from public;
-- AHA runtime and browser roles receive no grants here.
-- Assign moderator accounts only through a separate reviewed DB operator action.
commit;
