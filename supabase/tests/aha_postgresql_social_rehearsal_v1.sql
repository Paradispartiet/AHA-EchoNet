\set ON_ERROR_STOP on
SET row_security = on;
-- Real two-profile SQL run in isolated PostgreSQL 16 with a nonowner runtime.
-- Use the verified JWT claims injected by CanonicalDatabaseService, never user_metadata.

-- Account A publishes Feed, checks idempotency, and cannot write tables directly.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-a","aha_provider":"supabase"}',true);
DO $check$
DECLARE
  r jsonb;
  again jsonb;
  denied boolean := false;
BEGIN
 IF aha.current_profile_id() <> 'profile_a' THEN RAISE EXCEPTION 'A principal mismatch'; END IF;
 IF jsonb_array_length(aha_social.list_posts_v1('feed',20)) <> 0 THEN
  RAISE EXCEPTION 'social Feed not empty at rehearsal start';
 END IF;

 BEGIN
  PERFORM aha_social.list_posts_v1('feed',NULL);
 EXCEPTION WHEN invalid_parameter_value THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'unbounded null-limit read was allowed'; END IF;

 denied := false;
 BEGIN
  PERFORM aha_social.require_profile_v1();
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'internal profile helper is exposed'; END IF;

 denied := false;
 BEGIN
  INSERT INTO aha_social.posts(profile_id,request_key,kind,body)
    VALUES('profile_a','forbidden-direct-insert','feed','should fail');
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'runtime can write directly to social posts'; END IF;

 r:=aha_social.publish_post_v1('feed','Hei fra A',NULL,'feed-rehearsal-a-001');
 IF r->>'status'<>'published' OR coalesce((r->>'idempotentReplay')::boolean,true)
 THEN RAISE EXCEPTION 'A publication failed: %',r; END IF;
 again:=aha_social.publish_post_v1('feed','Hei fra A',NULL,'feed-rehearsal-a-001');
 IF again->>'id'<>r->>'id' OR not (again->>'idempotentReplay')::boolean
 THEN RAISE EXCEPTION 'Feed idempotency failed: %',again; END IF;

 denied := false;
 BEGIN
  PERFORM aha_social.publish_post_v1('feed','Changed content',NULL,'feed-rehearsal-a-001');
 EXCEPTION WHEN unique_violation THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'conflicting publication key was allowed'; END IF;

 denied := false;
 BEGIN
  PERFORM aha_social.publish_post_v1('insta','No medium',NULL,'insta-rehearsal-a-001');
 EXCEPTION WHEN invalid_parameter_value THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Insta without media was allowed'; END IF;
END;
$check$;
COMMIT;

-- Account B sees the shared Feed post and can interact, but cannot delete A's post.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-b","aha_provider":"supabase"}',true);
DO $check$
DECLARE
  list jsonb;
  a_post uuid;
  c jsonb;
  denied boolean := false;
  r jsonb;
BEGIN
 IF aha.current_profile_id() <> 'profile_b' THEN RAISE EXCEPTION 'B principal mismatch'; END IF;
 list:=aha_social.list_posts_v1('feed',20);
 IF jsonb_array_length(list)<>1 OR list->0->>'text'<>'Hei fra A'
 OR (list->0->>'ownPost')::boolean
 THEN RAISE EXCEPTION 'B cannot see A publication, or sees incorrect ownership: %',list; END IF;
 a_post:=(list->0->>'id')::uuid;

 BEGIN PERFORM aha_social.delete_post_v1(a_post);
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'B deleted A post'; END IF;

 r:=aha_social.like_post_v1(a_post,true);
 IF r->>'liked'<>'true' THEN RAISE EXCEPTION 'B like failed'; END IF;
 c:=aha_social.comment_post_v1(a_post,'Hei A, fra B');
 IF c->>'created'<>'true' THEN RAISE EXCEPTION 'B comment failed'; END IF;
 IF jsonb_array_length(aha_social.list_comments_v1(a_post)) <> 1
 THEN RAISE EXCEPTION 'B comment not visible'; END IF;
 r:=aha_social.report_post_v1(a_post,'spam');
 IF r->>'reported'<>'true' THEN RAISE EXCEPTION 'B report failed'; END IF;

 r:=aha_social.publish_post_v1('insta','B sitt prøvebilde','https://assets.example.invalid/picture.webp','insta-rehearsal-b-001');
 IF r->>'status'<>'published' THEN RAISE EXCEPTION 'B Insta publication failed'; END IF;
END;
$check$;
COMMIT;

-- Account A sees interaction counts but not the other user's private canonical data.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-a","aha_provider":"supabase"}',true);
DO $check$
DECLARE
 feed jsonb;
 insta jsonb;
 a_post uuid;
 denied boolean:=false;
BEGIN
 feed:=aha_social.list_posts_v1('feed',20);
 IF jsonb_array_length(feed)<>1
 OR (feed->0->>'likeCount')::integer<>1
 OR (feed->0->>'commentCount')::integer<>1
 OR NOT (feed->0->>'ownPost')::boolean
 THEN RAISE EXCEPTION 'interaction counts or author identity wrong: %',feed; END IF;
 a_post:=(feed->0->>'id')::uuid;
 insta:=aha_social.list_posts_v1('insta',20);
 IF jsonb_array_length(insta)<>1
 OR insta->0->>'authorName'<>'Rehearsal B'
 OR insta->0->>'mediaUrl'<>'https://assets.example.invalid/picture.webp'
 THEN RAISE EXCEPTION 'A cannot read public Insta post by B: %',insta; END IF;

 IF EXISTS (SELECT 1 FROM aha.workspaces WHERE id='workspace_b')
 THEN RAISE EXCEPTION 'Social role leaked private canonical workspace B'; END IF;

 PERFORM aha_social.delete_post_v1(a_post);
 IF jsonb_array_length(aha_social.list_posts_v1('feed',20))<>0
 THEN RAISE EXCEPTION 'Deleted post remained on public feed'; END IF;
 BEGIN
  PERFORM aha_social.list_comments_v1(a_post);
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Comments leaked after post deletion'; END IF;
END;
$check$;
COMMIT;

-- Anonymous/unrecognised subject has no canonical account and sees no shared posts.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"unknown-user","aha_provider":"supabase"}',true);
DO $check$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM aha_social.list_posts_v1('feed',5);
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Unauthorised social read allowed'; END IF;
END;
$check$;
ROLLBACK;
\echo 'AHA social two-profile PostgreSQL rehearsal: PASS'
