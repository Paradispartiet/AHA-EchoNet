\set ON_ERROR_STOP on
SET row_security=on;

-- Author A publishes two synthetic pictures using the already granted
-- function interface. Browser/runtime cannot write tables directly.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-a","aha_provider":"supabase"}',true);
DO $test$
DECLARE r jsonb;id uuid;denied boolean:=false;
BEGIN
 r:=aha_social.publish_post_v1('insta','Place-edit picture A',
    'https://assets.example.invalid/place-editor.webp','place-edit-aaa-001','feed',null);
 id:=(r->>'id')::uuid;
 r:=aha_social.set_post_place_tag_v1(id,'  Oslo sentrum  ');
 IF r->>'placeTag'<>'Oslo sentrum' THEN RAISE EXCEPTION 'Place edit was not normalized'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(aha_social.list_posts_v1('insta',40)) x
    WHERE x->>'id'=id::text AND x->>'placeTag'='Oslo sentrum') THEN
   RAISE EXCEPTION 'Edited location is not readable';
 END IF;
 r:=aha_social.set_post_place_tag_v1(id,null);
 IF r->>'placeTag' IS NOT NULL THEN RAISE EXCEPTION 'Optional location cannot be cleared'; END IF;
 BEGIN
   PERFORM aha_social.set_post_place_tag_v1(id,repeat('x',121));
 EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Overlong place edit accepted'; END IF;
 r:=aha_social.publish_post_v1('insta','Place-edit map A',
    'https://assets.example.invalid/map-editor.webp','place-edit-map-001','map','Bergen');
 id:=(r->>'id')::uuid;
 denied:=false;
 BEGIN PERFORM aha_social.set_post_place_tag_v1(id,'  ');
 EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Map was allowed to lose its required tag'; END IF;
 r:=aha_social.set_post_place_tag_v1(id,'Oslo');
 IF r->>'placeTag'<>'Oslo' THEN RAISE EXCEPTION 'Map location update failed'; END IF;
END;
$test$;
COMMIT;

-- User B sees the published post but cannot edit A's location or private data.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-b","aha_provider":"supabase"}',true);
DO $test$
DECLARE id uuid;denied boolean:=false;
BEGIN
 SELECT (x->>'id')::uuid INTO id
 FROM jsonb_array_elements(aha_social.list_posts_v1('insta',40)) x
 WHERE x->>'text'='Place-edit map A';
 IF id IS NULL THEN RAISE EXCEPTION 'B cannot read A location'; END IF;
 BEGIN PERFORM aha_social.set_post_place_tag_v1(id,'Wrong owner');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'B edited A location'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(aha_social.list_posts_v1('insta',40)) x
     WHERE x->>'id'=id::text AND x->>'placeTag'='Oslo') THEN
    RAISE EXCEPTION 'Unauthorized edit changed location';
 END IF;
END;
$test$;
COMMIT;

-- An Insta editor can never be used to put location metadata on Feed.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-a","aha_provider":"supabase"}',true);
DO $test$
DECLARE id uuid;denied boolean:=false;
BEGIN
 SELECT (x->>'id')::uuid INTO id
 FROM jsonb_array_elements(aha_social.list_posts_v1('feed',40)) x
 WHERE length(x->>'text')=500;
 IF id IS NULL THEN RAISE EXCEPTION '500-char Feed fixture missing'; END IF;
 BEGIN PERFORM aha_social.set_post_place_tag_v1(id,'Oslo');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Feed accepted post-edit location'; END IF;
END;
$test$;
COMMIT;
\echo 'AHA owner-only post-publication place edits and privacy: PASS'
