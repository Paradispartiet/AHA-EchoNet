\set ON_ERROR_STOP on
SET row_security = on;
-- Third profile "mod" was assigned solely by isolated DB operator setup;
-- ordinary profiles cannot assign roles or read reports.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-a","aha_provider":"supabase"}',true);
DO $do$
DECLARE v_insta uuid; denied boolean:=false; result jsonb;
BEGIN
 select (aha_social.list_posts_v1('insta',20)->0->>'id')::uuid into v_insta;
 if v_insta is null then raise exception 'precondition: B Insta post missing'; end if;
 BEGIN PERFORM aha_social.moderation_queue_v1(20);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 if not denied then raise exception 'normal user can see moderation queue'; end if;

 denied:=false;
 BEGIN PERFORM aha_social.moderate_post_v1(v_insta,'hide','not my moderator account');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 if not denied then raise exception 'normal user could moderate'; end if;

 denied:=false;
 BEGIN INSERT INTO aha_social.moderators(profile_id) VALUES('profile_a');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 if not denied then raise exception 'user promoted themselves'; end if;

 result:=aha_social.report_post_v1(v_insta,'spam');
 if result->>'reported'<>'true' then raise exception 'report not accepted'; end if;
END;
$do$;
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-mod","aha_provider":"supabase"}',true);
DO $do$
DECLARE queue jsonb; v_insta uuid; result jsonb; denied boolean:=false;
BEGIN
 queue:=aha_social.moderation_queue_v1(20);
 if jsonb_array_length(queue)<>1 or queue->0->>'kind'<>'insta'
   or (queue->0->>'reportCount')::integer<>1
 then raise exception 'operator queue has wrong report or leaks data: %',queue; end if;
 if queue->0 ? 'profile_id' or queue->0 ? 'reporterName' then
   raise exception 'reporter data leaked to queue'; end if;
 v_insta:=(queue->0->>'postId')::uuid;
 result:=aha_social.moderate_post_v1(v_insta,'dismiss','False positive after review');
 if result->>'status'<>'published' then raise exception 'dismiss unpublishes unexpectedly'; end if;
 if jsonb_array_length(aha_social.moderation_queue_v1(20))<>0 then
   raise exception 'dismissed report remained open'; end if;

 denied:=false;
 BEGIN
   PERFORM aha_social.moderate_post_v1(v_insta,'hide','No open reports remaining');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 if not denied then raise exception 'moderator can hide without open report'; end if;
END;
$do$;
COMMIT;

-- Same reporter cannot re-open already dismissed case.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-a","aha_provider":"supabase"}',true);
DO $do$
DECLARE v_insta uuid; result jsonb;
BEGIN
 select (aha_social.list_posts_v1('insta',20)->0->>'id')::uuid into v_insta;
 result:=aha_social.report_post_v1(v_insta,'spam');
 if result->>'status'<>'dismissed' then
   raise exception 'repeat report bypassed moderator decision: %',result; end if;
END;
$do$;
COMMIT;

-- A different reporting profile (B's moderator is also an authenticated profile)
-- can reopen investigation through a separate report record.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-mod","aha_provider":"supabase"}',true);
DO $do$
DECLARE v_insta uuid; result jsonb; queue jsonb; denied boolean:=false;
BEGIN
 select (aha_social.list_posts_v1('insta',20)->0->>'id')::uuid into v_insta;
 perform aha_social.report_post_v1(v_insta,'privacy');
 queue:=aha_social.moderation_queue_v1(10);
 if jsonb_array_length(queue)<>1 then raise exception 'new reporter was not queued'; end if;
 result:=aha_social.moderate_post_v1(v_insta,'hide','Sensitive content visible in public feed');
 if result->>'status'<>'hidden' then raise exception 'moderation did not hide Insta post'; end if;
 if jsonb_array_length(aha_social.list_posts_v1('insta',10))<>0 then
  raise exception 'hidden media still visible'; end if;

 denied:=false;
 BEGIN PERFORM aha_social.list_comments_v1(v_insta);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 if not denied then raise exception 'hidden post exposed comments'; end if;

 denied:=false;
 BEGIN INSERT INTO aha_social.moderation_events(post_id,moderator_profile_id,action,note,report_count)
      VALUES(v_insta,'profile_mod','hide','forged event',1);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 if not denied then raise exception 'runtime can forge moderation audit'; end if;
END;
$do$;
COMMIT;

-- Audit log contains two immutable operator decisions; verified via admin-only read.
-- No hosted server or external user data are involved.
\echo 'AHA social moderation rehearsal: PASS'
