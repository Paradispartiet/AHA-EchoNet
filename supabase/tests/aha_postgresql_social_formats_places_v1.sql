\set ON_ERROR_STOP on
SET row_security=on;
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-a","aha_provider":"supabase"}',true);
DO $test$
DECLARE v_png bytea; v_url text; v_picture jsonb; v_result jsonb;
 denied boolean; feed jsonb; image_posts jsonb;
BEGIN
  v_png:=decode('89504e470d0a1a0a'||repeat('00',100),'hex');
  denied:=false;
  BEGIN
    PERFORM aha_social.publish_post_v1('feed',repeat('x',501),null,
      'new-feed-over-500',null,null);
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Feed accepted 501 characters'; END IF;

  v_result:=aha_social.publish_post_v1('feed',repeat('x',500),null,
      'new-feed-exact-500',null,null);
  IF v_result->>'status'<>'published' THEN
    RAISE EXCEPTION 'Feed rejected 500 characters';
  END IF;
  feed:=aha_social.list_posts_v1('feed',40);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(feed) x
    WHERE length(x->>'text')=500
    AND x->>'instaMode' IS NULL AND x->>'placeTag' IS NULL) THEN
     RAISE EXCEPTION '500-character Feed text not stored correctly';
  END IF;

  denied:=false;
  BEGIN
    PERFORM aha_social.publish_post_v1('feed','Not a photo post',null,
      'invalid-feed-place-01',null,'Oslo');
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Feed accepted image place metadata'; END IF;

  v_picture:=aha_social.upload_media_v1('image/png',v_png,'new-place-picture-001');
  v_url:=v_picture->>'mediaUrl';
  denied:=false;
  BEGIN
    PERFORM aha_social.publish_post_v1('insta','A map photo',v_url,
      'new-map-no-tag-001','map',null);
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Map accepted an untagged photo'; END IF;

  v_result:=aha_social.publish_post_v1('insta','A map photo',v_url,
     'new-map-tagged-001','map','Oslo sentrum');
  IF v_result->>'status'<>'published' THEN
    RAISE EXCEPTION 'Map photo did not publish';
  END IF;
  v_result:=aha_social.publish_post_v1('insta','A map photo',v_url,
     'new-map-tagged-001','map','Oslo sentrum');
  IF v_result->>'idempotentReplay'<>'true' THEN
    RAISE EXCEPTION 'Map photo replay did not match place tag';
  END IF;
  denied:=false;
  BEGIN
    PERFORM aha_social.publish_post_v1('insta','A map photo',v_url,
       'new-map-tagged-001','map','Bergen');
  EXCEPTION WHEN unique_violation THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Different place tag reused same publication key'; END IF;

  v_picture:=aha_social.upload_media_v1('image/png',v_png,'new-reel-cover-001');
  v_result:=aha_social.publish_post_v1('insta','Reel cover',v_picture->>'mediaUrl',
     'new-reel-published-01','reel','Bergen');
  IF v_result->>'status'<>'published' THEN
    RAISE EXCEPTION 'Reel cover post failed';
  END IF;
  v_result:=aha_social.publish_post_v1('insta','',
    'https://assets.example.invalid/caption-optional.webp',
    'image-only-caption-001','feed',null);
  IF v_result->>'status'<>'published' THEN
    RAISE EXCEPTION 'An image without caption was rejected';
  END IF;
  image_posts:=aha_social.list_posts_v1('insta',40);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(image_posts) x
      WHERE x->>'text'='A map photo' AND x->>'instaMode'='map'
       AND x->>'placeTag'='Oslo sentrum') OR
     NOT EXISTS(SELECT 1 FROM jsonb_array_elements(image_posts) x
      WHERE x->>'text'='Reel cover' AND x->>'instaMode'='reel'
       AND x->>'placeTag'='Bergen') OR
     NOT EXISTS(SELECT 1 FROM jsonb_array_elements(image_posts) x
      WHERE x->>'text'='' AND x->>'instaMode'='feed' AND x->>'mediaUrl'='https://assets.example.invalid/caption-optional.webp') THEN
    RAISE EXCEPTION 'Insta type or place tag lost in backend list';
  END IF;
END;
$test$;
COMMIT;
\echo 'AHA Feed 500 chars + Insta place tags / Feed Reel Map PostgreSQL: PASS'
