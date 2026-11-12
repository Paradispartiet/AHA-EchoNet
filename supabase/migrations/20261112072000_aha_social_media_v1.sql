-- Staging-only image attachment for the shared Feed/Insta API.
-- Deliberately small (512 KiB): this is NOT production object storage.
-- No browser/storage grants; all access runs through JWT-scoped functions.
begin;

create table aha_social.media (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references aha.profiles(id) on delete restrict,
  request_key text not null check(length(btrim(request_key)) between 8 and 100),
  content_type text not null check(content_type in ('image/png','image/webp')),
  bytes bytea not null check(octet_length(bytes) between 100 and 524288),
  created_at timestamptz not null default now(),
  post_id uuid unique references aha_social.posts(id) on delete restrict,
  unique(profile_id,request_key)
);
create index social_media_profile_created on aha_social.media(profile_id, created_at desc);
alter table aha_social.media enable row level security;

-- The Postgres-backed attachment must stay internal until the owner publishes it.
create or replace function aha_social.upload_media_v1(p_type text,p_data bytea,p_request_key text)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, aha, aha_social as $fn$
declare v_self text; v_row aha_social.media%rowtype; v_id uuid;
 v_profile_bytes bigint; v_total_bytes bigint; v_new_bytes integer;
begin
 v_self:=aha_social.require_profile_v1();
 if p_type is null or p_type not in ('image/webp','image/png')
    or p_data is null or octet_length(p_data) not between 100 and 524288
    or length(btrim(coalesce(p_request_key,''))) not between 8 and 100 then
  raise exception 'invalid social media upload' using errcode='22023';
 end if;
 if (p_type='image/png' and substring(p_data from 1 for 8) <> decode('89504e470d0a1a0a','hex'))
    or (p_type='image/webp' and (
       substring(p_data from 1 for 4) <> decode('52494646','hex')
       or substring(p_data from 9 for 4) <> decode('57454250','hex'))) then
  raise exception 'invalid social media signature' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtext(v_self),760013);
 select * into v_row from aha_social.media
   where profile_id=v_self and request_key=p_request_key;
 if found then
  if v_row.content_type<>p_type or v_row.bytes<>p_data then
   raise exception 'media idempotency conflict' using errcode='23505';
  end if;
  return jsonb_build_object('mediaId',v_row.id,
   'mediaUrl','/v1/social/media/'||v_row.id::text, 'idempotentReplay',true);
 end if;
 if (select count(*) from aha_social.media
    where profile_id=v_self and created_at>now()-interval '1 hour')>=8 then
  raise exception 'media rate limit' using errcode='22023';
 end if;
 -- This temporary PostgreSQL staging store is hard-capped at 8 MiB per
 -- account and 64 MiB total, including retained hidden/deleted media.
 -- Global transaction lock prevents concurrent users bypassing the quota.
 perform pg_advisory_xact_lock(760014,1);
 v_new_bytes:=octet_length(p_data);
 select coalesce(sum(octet_length(m.bytes)) filter (where m.profile_id=v_self),0),
        coalesce(sum(octet_length(m.bytes)),0)
 into v_profile_bytes,v_total_bytes
 from aha_social.media m;
 if v_profile_bytes+v_new_bytes>8388608
    or v_total_bytes+v_new_bytes>67108864 then
  raise exception 'media storage quota' using errcode='22023';
 end if;
 insert into aha_social.media(profile_id,request_key,content_type,bytes)
 values(v_self,btrim(p_request_key),p_type,p_data) returning id into v_id;
 return jsonb_build_object('mediaId',v_id,
  'mediaUrl','/v1/social/media/'||v_id::text, 'idempotentReplay',false);
end;
$fn$;

-- Read only own pending image or an image on a currently published post.
-- A hidden/deleted post cannot be used to retrieve image bytes from another account.
create or replace function aha_social.read_media_v1(p_id uuid)
returns table(content_type text, bytes bytea)
language plpgsql stable security definer
set search_path = pg_catalog, aha, aha_social as $fn$
declare v_self text;
begin
 v_self:=aha_social.require_profile_v1();
 if not exists(
  select 1 from aha_social.media m
  left join aha_social.posts p on p.id=m.post_id
  where m.id=p_id
    and (
      (m.profile_id=v_self and (
        (m.post_id is null and m.created_at >= now()-interval '24 hours')
        or (m.post_id is not null and p.state in ('published','hidden'))
      ))
      or (p.state='published' and p.id is not null and exists (
        select 1 from aha.profiles author
        where author.id=p.profile_id and author.status='active' and author.deleted_at is null
      ))
    )
 ) then
  raise exception 'media unavailable' using errcode='42501';
 end if;
 return query select m.content_type,m.bytes from aha_social.media m
   where m.id=p_id;
end;
$fn$;

-- An account can immediately discard its own unpublished image. Once
-- attached to a post, only the separate post deletion/moderation path applies.
create or replace function aha_social.delete_pending_media_v1(p_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, aha, aha_social as $fn$
declare v_self text; v_id uuid;
begin
 v_self:=aha_social.require_profile_v1();
 delete from aha_social.media
 where id=p_id and profile_id=v_self and post_id is null
 returning id into v_id;
 if v_id is null then
  raise exception 'media unavailable' using errcode='42501';
 end if;
 return jsonb_build_object('mediaId',v_id,'deleted',true);
end;
$fn$;

-- Every Insta picture can carry a free-text location tag. The subtype is
-- persisted for Feed/Reel/Map views, not inferred from its caption.
alter table aha_social.posts
 add column insta_mode text,
 add column place_tag text,
 add constraint social_post_insta_mode_check check(
   (kind='insta' and insta_mode in('feed','reel','map')) or
   (kind='feed' and insta_mode is null and place_tag is null)
 ),
 add constraint social_post_place_tag_check check (
   place_tag is null or length(btrim(place_tag)) between 1 and 120
 );
-- Reel initially accepts an image cover only; video transport is not enabled.

-- Preserve old explicit public-HTTPS URLs for legacy posts, but permit
-- a verified internal media reference after an owned pending upload.
alter table aha_social.posts drop constraint posts_media_url_check;
alter table aha_social.posts
 add constraint posts_media_url_check check(
   media_url is null or (
    length(media_url)<=2048 and (
      media_url ~ '^https://[^ ]+$'
      or media_url ~ '^/v1/social/media/[0-9a-f-]{36}$'
    )
   )
 );

create or replace function aha_social.publish_post_v1(
 p_kind text,p_body text,p_media text,p_request_key text,
 p_insta_mode text,p_place_tag text
)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, aha, aha_social as $fn$
declare v_self text;v_id uuid;v_old aha_social.posts%rowtype;
 v_media_id uuid;v_internal boolean:=false;v_media_row aha_social.media%rowtype;
begin
 v_self:=aha_social.require_profile_v1();
 if p_kind is null or p_kind not in('feed','insta')
  or length(btrim(coalesce(p_body,''))) not between 1 and 2000
  or length(btrim(coalesce(p_request_key,''))) not between 8 and 100
  or (p_kind='feed' and (
    length(btrim(p_body))>500 or p_insta_mode is not null or p_place_tag is not null))
  or (p_kind='insta' and (
    nullif(btrim(coalesce(p_media,'')),'') is null
    or coalesce(p_insta_mode,'') not in ('feed','reel','map')
    or (p_insta_mode='map' and nullif(btrim(coalesce(p_place_tag,'')),'') is null)
    or length(btrim(coalesce(p_place_tag,'')))>120))
  or (p_media is not null and (
    length(p_media)>2048 or (
     p_media !~ '^https://[^ ]+$'
     and p_media !~ '^/v1/social/media/[0-9a-f-]{36}$'
    )
  )) then
    raise exception 'invalid social publication' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtext(v_self),760011);
 select * into v_old from aha_social.posts
   where profile_id=v_self and request_key=p_request_key;
 if found then
  if v_old.kind<>p_kind or v_old.body<>btrim(p_body)
    or v_old.media_url is distinct from p_media
    or v_old.insta_mode is distinct from p_insta_mode
    or v_old.place_tag is distinct from nullif(btrim(p_place_tag),'') then
    raise exception 'idempotency conflict' using errcode='23505';
  end if;
  return jsonb_build_object('id',v_old.id,'status',v_old.state,'idempotentReplay',true);
 end if;
 if (select count(*) from aha_social.posts where profile_id=v_self
   and created_at>now()-interval '1 hour')>=10 then
   raise exception 'publication rate limit' using errcode='22023';
 end if;
 v_internal:=p_media like '/v1/social/media/%';
 if v_internal then
  v_media_id:=substring(p_media from 18)::uuid;
  select * into v_media_row from aha_social.media m
    where m.id=v_media_id for update;
  if not found or v_media_row.profile_id<>v_self
    or v_media_row.post_id is not null
    or v_media_row.created_at<now()-interval '24 hours' then
    raise exception 'media unavailable' using errcode='42501';
  end if;
 end if;
 insert into aha_social.posts(profile_id,request_key,kind,body,media_url,insta_mode,place_tag)
 values(v_self,btrim(p_request_key),p_kind,btrim(p_body),p_media,
        p_insta_mode,nullif(btrim(p_place_tag),''))
 returning id into v_id;
 if v_internal then
  update aha_social.media set post_id=v_id where id=v_media_id and profile_id=v_self;
 end if;
 return jsonb_build_object('id',v_id,'status','published','idempotentReplay',false);
end;
$fn$;

-- Backward-compatible 4-argument SQL entry for existing staging fixtures.
-- New API requests the 6-argument version, which validates subtype/tag.
create or replace function aha_social.publish_post_v1(
 p_kind text,p_body text,p_media text,p_request_key text
)
returns jsonb language sql volatile security definer
set search_path = pg_catalog, aha, aha_social
as $fn$
 select aha_social.publish_post_v1(
   p_kind,p_body,p_media,p_request_key,
   case when p_kind='insta' then 'feed' else null end,null
 );
$fn$;

-- Refresh the fixed list contract without changing its permissions.
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
    'instaMode',p.insta_mode,'placeTag',p.place_tag,
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

-- Operator-only data minimization; no runtime/browser grants.
-- Remove orphan media after 24 h and user-deleted posts after 30 days.
-- Hidden posts are intentionally retained for audited moderation review.
create or replace function aha_social.purge_expired_media_v1()
returns integer language plpgsql volatile security definer
set search_path = pg_catalog, aha, aha_social as $fn$
declare v_deleted integer; v_orphaned integer;
begin
 delete from aha_social.media m
 using aha_social.posts p
 where m.post_id=p.id and p.state='deleted'
   and p.deleted_at<now()-interval '30 days';
 get diagnostics v_deleted=row_count;
 delete from aha_social.media m
 where m.post_id is null and m.created_at<now()-interval '24 hours';
 get diagnostics v_orphaned=row_count;
 return v_deleted+v_orphaned;
end;
$fn$;

revoke all on function aha_social.upload_media_v1(text,bytea,text) from public;
revoke all on function aha_social.read_media_v1(uuid) from public;
revoke all on function aha_social.delete_pending_media_v1(uuid) from public;
revoke all on function aha_social.publish_post_v1(text,text,text,text) from public;
revoke all on function aha_social.publish_post_v1(text,text,text,text,text,text) from public;
revoke all on function aha_social.purge_expired_media_v1() from public;
commit;
