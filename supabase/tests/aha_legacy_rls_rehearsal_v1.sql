-- AHA legacy RLS rehearsal on EPHEMERAL local PostgreSQL 16 ONLY.
-- Requires setup via scripts/aha-legacy-rls-rehearsal.sh. Never run against
-- hosted AHA Supabase or other production/project databases.
-- Fixtures have no personal data. These are artificial auth identities.
BEGIN;
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

INSERT INTO public.aha_profiles(id, display_name)
VALUES ('11111111-1111-4111-8111-111111111111', 'fixture-A'),
       ('22222222-2222-4222-8222-222222222222', 'fixture-B');

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'aha_source_events', 'aha_notes', 'aha_gallery_items',
    'aha_feed_posts', 'aha_insta_posts', 'aha_insta_likes',
    'aha_insta_comments', 'aha_insta_follows', 'aha_imports'
  ] LOOP
    EXECUTE format(
      'INSERT INTO public.%I(id,profile_id) VALUES ($1,$2),($3,$4)', t
    ) USING 'fixture-' || t || '-A', '11111111-1111-4111-8111-111111111111'::uuid,
            'fixture-' || t || '-B', '22222222-2222-4222-8222-222222222222'::uuid;
  END LOOP;
END $$;

INSERT INTO public.aha_insta_profiles(profile_id)
VALUES ('11111111-1111-4111-8111-111111111111'),
       ('22222222-2222-4222-8222-222222222222');
INSERT INTO public.aha_insight_chambers(profile_id)
VALUES ('11111111-1111-4111-8111-111111111111'),
       ('22222222-2222-4222-8222-222222222222');
COMMIT;

-- Every legacy table must isolate both directions, even with broad mock
-- SQL table grants, as happens in some Supabase Data API configurations.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
DO $$
DECLARE t text; n integer;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'aha_profiles', 'aha_source_events', 'aha_notes',
    'aha_gallery_items', 'aha_feed_posts', 'aha_insta_posts',
    'aha_insta_profiles', 'aha_insta_likes', 'aha_insta_comments',
    'aha_insta_follows', 'aha_imports', 'aha_insight_chambers'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n <> 1 THEN RAISE EXCEPTION 'RLS leak / A must see exactly one row on %: %',t,n; END IF;
  END LOOP;

  EXECUTE 'UPDATE public.aha_notes SET title = ''hacked'' WHERE profile_id = ''22222222-2222-4222-8222-222222222222''::uuid';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'A was able to UPDATE B''s note'; END IF;

  EXECUTE 'DELETE FROM public.aha_notes WHERE profile_id = ''22222222-2222-4222-8222-222222222222''::uuid';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'A was able to DELETE B''s note'; END IF;

  BEGIN
    INSERT INTO public.aha_notes(id, profile_id)
    VALUES ('forged-by-A', '22222222-2222-4222-8222-222222222222');
    RAISE EXCEPTION 'A inserted a note owned by B despite RLS';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.aha_notes SET title='allowed' WHERE profile_id = '11111111-1111-4111-8111-111111111111';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'A could not update own note'; END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
DO $$
DECLARE t text; n integer;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'aha_profiles', 'aha_source_events', 'aha_notes',
    'aha_gallery_items', 'aha_feed_posts', 'aha_insta_posts',
    'aha_insta_profiles', 'aha_insta_likes', 'aha_insta_comments',
    'aha_insta_follows', 'aha_imports', 'aha_insight_chambers'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n <> 1 THEN RAISE EXCEPTION 'RLS leak / B must see exactly one row on %: %',t,n; END IF;
  END LOOP;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE t text; n integer;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'aha_profiles', 'aha_source_events', 'aha_notes',
    'aha_gallery_items', 'aha_feed_posts', 'aha_insta_posts',
    'aha_insta_profiles', 'aha_insta_likes', 'aha_insta_comments',
    'aha_insta_follows', 'aha_imports', 'aha_insight_chambers'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I',t) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'Anon can read % rows on %',n,t; END IF;
  END LOOP;
END $$;
COMMIT;
SELECT 'PASS: 12 legacy AHA tables isolate synthetic users A/B and anon; cross-owner writes refused' AS result;
