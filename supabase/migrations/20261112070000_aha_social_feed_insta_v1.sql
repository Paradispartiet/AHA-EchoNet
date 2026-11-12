-- AHA social Feed/Insta staging-only migration.
-- Never apply to production while the egress cost hold is active.
-- No import or automatic publication of legacy local-only Feed/Insta data.
begin;
create extension if not exists pgcrypto;
create schema if not exists aha_social;
revoke all on schema aha_social from public;
alter default privileges in schema aha_social revoke all on tables from public;
alter default privileges in schema aha_social revoke all on functions from public;

create table if not exists aha_social.posts (
 id uuid primary key default gen_random_uuid(),
 profile_id text not null references aha.profiles(id) on delete restrict,
 request_key text not null check (length(btrim(request_key)) between 8 and 100),
 kind text not null check(kind in ('feed','insta')),
 body text not null check(
    (kind='feed' and length(btrim(body)) between 1 and 500) or
    (kind='insta' and length(btrim(body)) between 0 and 2000)
 ),
 media_url text check(media_url is null or (length(media_url)<=2048 and media_url ~ '^https://[^ ]+$')),
 state text not null default 'published' check(state in ('published','hidden','deleted')),
 created_at timestamptz not null default now(),
 deleted_at timestamptz,
 unique(profile_id,request_key),
 check(kind<>'insta' or media_url is not null)
);
create index if not exists social_posts_kind_created on aha_social.posts(kind,created_at desc) where state='published';
create table if not exists aha_social.likes (
 post_id uuid not null references aha_social.posts(id) on delete cascade,
 profile_id text not null references aha.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(post_id,profile_id)
);
create table if not exists aha_social.comments (
 id uuid primary key default gen_random_uuid(),
 post_id uuid not null references aha_social.posts(id) on delete cascade,
 profile_id text not null references aha.profiles(id) on delete restrict,
 body text not null check(length(btrim(body)) between 1 and 500),
 state text not null default 'visible' check(state in ('visible','hidden')),
 created_at timestamptz not null default now()
);
create index if not exists social_comments_post on aha_social.comments(post_id,created_at);
create table if not exists aha_social.reports (
 post_id uuid not null references aha_social.posts(id) on delete cascade,
 profile_id text not null references aha.profiles(id) on delete restrict,
 reason text not null check(reason in ('spam','abuse','privacy','other')),
 created_at timestamptz not null default now(),
 primary key(post_id,profile_id)
);
alter table aha_social.posts enable row level security;
alter table aha_social.likes enable row level security;
alter table aha_social.comments enable row level security;
alter table aha_social.reports enable row level security;
-- No table policies: nobody gets direct Data API access.

create or replace function aha_social.require_profile_v1()
returns text language plpgsql stable security definer
set search_path = pg_catalog, aha, aha_social as $fn$
declare p text;
begin
 p:=aha.current_profile_id();
 if p is null then raise exception 'authenticated canonical profile required' using errcode='42501'; end if;
 return p;
end;
$fn$;

create or replace function aha_social.list_posts_v1(p_kind text,p_limit integer)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, aha, aha_social as $fn$
declare v_self text; v_out jsonb;
begin
 v_self:=aha_social.require_profile_v1();
 if p_kind is null or p_kind not in ('feed','insta') or p_limit is null or p_limit not between 1 and 40 then
  raise exception 'invalid social feed request' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(x.obj order by x.created_at desc),'[]'::jsonb) into v_out
 from (
  select p.created_at,
  jsonb_build_object(
    'id',p.id,'kind',p.kind,'text',p.body,'mediaUrl',p.media_url,
    'createdAt',p.created_at,
    'authorName',coalesce(nullif(btrim(a.display_name),''),'AHA-bruker'),
    'ownPost',p.profile_id=v_self,
    'likeCount',(select count(*) from aha_social.likes l where l.post_id=p.id),
    'commentCount',(select count(*) from aha_social.comments c where c.post_id=p.id and c.state='visible'),
    'likedByMe',exists(select 1 from aha_social.likes l where l.post_id=p.id and l.profile_id=v_self)
  ) obj from aha_social.posts p
  join aha.profiles a on a.id=p.profile_id and a.status='active' and a.deleted_at is null
  where p.kind=p_kind and p.state='published'
  order by p.created_at desc,p.id desc limit p_limit
 ) x;
 return v_out;
end;
$fn$;

create or replace function aha_social.list_comments_v1(p_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, aha, aha_social as $fn$
declare v_self text; v_out jsonb;
begin
 v_self:=aha_social.require_profile_v1();
 if not exists(select 1 from aha_social.posts where id=p_id and state='published') then
  raise exception 'post unavailable' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(x.obj order by x.created_at asc),'[]'::jsonb) into v_out
 from (
  select c.created_at,
    jsonb_build_object('id',c.id,'text',c.body,'createdAt',c.created_at,
    'authorName',coalesce(nullif(btrim(a.display_name),''),'AHA-bruker'),
    'ownComment',c.profile_id=v_self) obj
  from aha_social.comments c
  join aha.profiles a on a.id=c.profile_id and a.status='active' and a.deleted_at is null
  where c.post_id=p_id and c.state='visible'
  order by c.created_at asc,c.id asc limit 100
 ) x;
 return v_out;
end;
$fn$;

create or replace function aha_social.publish_post_v1(p_kind text,p_body text,p_media text,p_request_key text)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, aha, aha_social as $fn$
declare v_self text; v_id uuid; v_old aha_social.posts%rowtype;
begin
 v_self:=aha_social.require_profile_v1();
 if p_kind not in('feed','insta')
    or p_body is null
    or (p_kind='feed' and length(btrim(p_body)) not between 1 and 500)
    or (p_kind='insta' and length(btrim(p_body))>2000)
    or length(btrim(coalesce(p_request_key,''))) not between 8 and 100
    or (p_kind='insta' and nullif(btrim(coalesce(p_media,'')),'') is null)
    or (p_media is not null and (length(p_media)>2048 or p_media !~ '^https://[^ ]+$')) then
  raise exception 'invalid social publication' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtext(v_self),760011);
 select * into v_old from aha_social.posts where profile_id=v_self and request_key=p_request_key;
 if found then
  if v_old.kind<>p_kind or v_old.body<>btrim(p_body) or v_old.media_url is distinct from p_media then
   raise exception 'idempotency conflict' using errcode='23505';
  end if;
  return jsonb_build_object('id',v_old.id,'status',v_old.state,'idempotentReplay',true);
 end if;
 if (select count(*) from aha_social.posts where profile_id=v_self and created_at>now()-interval '1 hour') >= 10 then
  raise exception 'publication rate limit' using errcode='22023';
 end if;
 insert into aha_social.posts(profile_id,request_key,kind,body,media_url)
 values(v_self,p_request_key,p_kind,btrim(p_body),p_media) returning id into v_id;
 return jsonb_build_object('id',v_id,'status','published','idempotentReplay',false);
end;
$fn$;

create or replace function aha_social.delete_post_v1(p_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, aha, aha_social as $fn$
declare v_self text;v_count integer;
begin
 v_self:=aha_social.require_profile_v1();
 update aha_social.posts set state='deleted',deleted_at=now() where id=p_id and profile_id=v_self and state<>'deleted';
 get diagnostics v_count=row_count;
 if v_count=0 then raise exception 'post unavailable' using errcode='42501'; end if;
 return jsonb_build_object('id',p_id,'deleted',true);
end;
$fn$;

create or replace function aha_social.like_post_v1(p_id uuid,p_like boolean)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, aha, aha_social as $fn$
declare v_self text;
begin
 v_self:=aha_social.require_profile_v1();
 if not exists(select 1 from aha_social.posts where id=p_id and state='published') then
  raise exception 'post unavailable' using errcode='42501';
 end if;
 if p_like is null then raise exception 'invalid like action' using errcode='22023'; end if;
 if p_like then
  insert into aha_social.likes(post_id,profile_id) values(p_id,v_self) on conflict do nothing;
 else
  delete from aha_social.likes where post_id=p_id and profile_id=v_self;
 end if;
 return jsonb_build_object('postId',p_id,'liked',p_like);
end;
$fn$;

create or replace function aha_social.comment_post_v1(p_id uuid,p_body text)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, aha, aha_social as $fn$
declare v_self text;v_id uuid;
begin
 v_self:=aha_social.require_profile_v1();
 if length(btrim(coalesce(p_body,''))) not between 1 and 500 then
  raise exception 'invalid comment' using errcode='22023';
 end if;
 if not exists(select 1 from aha_social.posts where id=p_id and state='published') then
  raise exception 'post unavailable' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtext(v_self),760012);
 if (select count(*) from aha_social.comments where profile_id=v_self and created_at>now()-interval '1 hour')>=30 then
  raise exception 'comment rate limit' using errcode='22023';
 end if;
 insert into aha_social.comments(post_id,profile_id,body) values(p_id,v_self,btrim(p_body)) returning id into v_id;
 return jsonb_build_object('id',v_id,'postId',p_id,'created',true);
end;
$fn$;

create or replace function aha_social.report_post_v1(p_id uuid,p_reason text)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, aha, aha_social as $fn$
declare v_self text;
begin
 v_self:=aha_social.require_profile_v1();
 if p_reason not in('spam','abuse','privacy','other') then
  raise exception 'invalid report reason' using errcode='22023';
 end if;
 if not exists(select 1 from aha_social.posts where id=p_id and state='published') then
  raise exception 'post unavailable' using errcode='42501';
 end if;
 insert into aha_social.reports(post_id,profile_id,reason) values(p_id,v_self,p_reason)
 on conflict(post_id,profile_id) do update set reason=excluded.reason,created_at=now();
 return jsonb_build_object('reported',true);
end;
$fn$;

revoke all on function aha_social.require_profile_v1() from public;
revoke all on function aha_social.list_posts_v1(text,integer) from public;
revoke all on function aha_social.list_comments_v1(uuid) from public;
revoke all on function aha_social.publish_post_v1(text,text,text,text) from public;
revoke all on function aha_social.delete_post_v1(uuid) from public;
revoke all on function aha_social.like_post_v1(uuid,boolean) from public;
revoke all on function aha_social.comment_post_v1(uuid,text) from public;
revoke all on function aha_social.report_post_v1(uuid,text) from public;
-- No GRANT to public, anon, authenticated or runtime. Staging grants require separate review.
commit;
