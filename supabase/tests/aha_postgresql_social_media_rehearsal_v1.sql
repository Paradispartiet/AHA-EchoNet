\set ON_ERROR_STOP on
SET row_security = on;
-- Image bytes used here are synthetic fixtures, NOT real private user photos.
-- Both profiles use a narrow PostgreSQL role with verified JWT context.

BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-a","aha_provider":"supabase"}',true);
DO $do$
DECLARE v_png bytea; v_response jsonb; v_again jsonb; v_path text; v_media uuid;
 denied boolean:=false; v_count integer;
BEGIN
 v_png:=decode('89504e470d0a1a0a'||repeat('00',100),'hex');
 BEGIN
  PERFORM aha_social.upload_media_v1('image/svg+xml',v_png,'test-image-a-001');
 EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF not denied THEN RAISE EXCEPTION 'SVG media accepted'; END IF;

 v_response:=aha_social.upload_media_v1('image/png',v_png,'test-image-a-001');
 v_again:=aha_social.upload_media_v1('image/png',v_png,'test-image-a-001');
 IF v_response->>'mediaId' IS NULL OR v_again->>'mediaId'<>v_response->>'mediaId'
  OR coalesce((v_again->>'idempotentReplay')::boolean,false)=false THEN
  RAISE EXCEPTION 'media upload not idempotent: % vs %',v_response,v_again; END IF;
 v_path:=v_response->>'mediaUrl';v_media:=(v_response->>'mediaId')::uuid;

 IF NOT EXISTS(select 1 from aha_social.read_media_v1(v_media)
   where content_type='image/png' and octet_length(bytes)=108)
 THEN RAISE EXCEPTION 'A cannot view their own pending image'; END IF;

 denied:=false;
 BEGIN
  PERFORM aha_social.publish_post_v1('insta','Invalid ownership attempt',
     '/v1/social/media/00000000-0000-4000-8000-000000000000','test-insta-a-denied');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'nonexistent media accepted'; END IF;
 v_response:=aha_social.publish_post_v1('insta','Staging-bilde A',v_path,'test-insta-a-001');
 IF v_response->>'status'<>'published' THEN RAISE EXCEPTION 'upload publish failed'; END IF;
END;
$do$;
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-b","aha_provider":"supabase"}',true);
DO $do$
DECLARE v_a_path text;v_a_id uuid;v_local bytea;denied boolean:=false;v_post jsonb;
BEGIN
 select (item->>'mediaUrl') into v_a_path from jsonb_array_elements(aha_social.list_posts_v1('insta',20)) item
  where item->>'text'='Staging-bilde A';
 v_a_id:=substring(v_a_path from 18)::uuid;
 IF NOT EXISTS(select 1 from aha_social.read_media_v1(v_a_id) where octet_length(bytes)=108) THEN
  RAISE EXCEPTION 'Account B cannot load A published media'; END IF;
 v_local:=decode('89504e470d0a1a0a'||repeat('00',100),'hex');
 denied:=false;
 BEGIN
  PERFORM aha_social.publish_post_v1('insta','Stolen image reference',v_a_path,'test-insta-b-denied');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'B republished A media without ownership'; END IF;
END;
$do$;
COMMIT;

-- Test another account cannot read a private (not yet published) image.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-a","aha_provider":"supabase"}',true);
DO $do$
DECLARE pending jsonb;
BEGIN
 pending:=aha_social.upload_media_v1('image/png',
  decode('89504e470d0a1a0a'||repeat('00',100),'hex'), 'test-a-private-002');
 PERFORM set_config('aha.rehearsal_private_media_id',pending->>'mediaId',false);
END;
$do$;
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-b","aha_provider":"supabase"}',true);
DO $do$
DECLARE v_id uuid;denied boolean:=false;
BEGIN
 v_id:=current_setting('aha.rehearsal_private_media_id')::uuid;
 BEGIN PERFORM * FROM aha_social.read_media_v1(v_id);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Other user read an unshared image'; END IF;

 denied:=false;
 BEGIN
  PERFORM count(*) FROM aha_social.media;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Direct storage table read was allowed'; END IF;

 denied:=false;
 BEGIN PERFORM aha_social.purge_expired_media_v1();
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Runtime could execute operator-only media cleanup'; END IF;
END;
$do$;
ROLLBACK;
\echo 'AHA staging social image upload PostgreSQL rehearsal: PASS'
