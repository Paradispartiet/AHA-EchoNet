-- AHA / EchoNet DB-03 legacy read-only RLS preflight.
-- SAFE TO RUN IN SUPABASE SQL EDITOR: catalogs only, no user data or writes.
-- Must be run ONLY in AHA project wshmybqyksrwkawqleiz, never in Fysen.
-- A PASS is a *catalog preflight*, NOT proof that two users are isolated.
-- Save only aggregated status; do not upload raw user data or credentials.
BEGIN READ ONLY;

WITH expected(table_name, owner_column, expected_policies) AS (
  VALUES
  ('aha_profiles', 'id', 3),
  ('aha_source_events', 'profile_id', 3),
  ('aha_notes', 'profile_id', 3),
  ('aha_gallery_items', 'profile_id', 3),
  ('aha_feed_posts', 'profile_id', 3),
  ('aha_insta_posts', 'profile_id', 3),
  ('aha_insta_profiles', 'profile_id', 3),
  ('aha_insta_likes', 'profile_id', 3),
  ('aha_insta_comments', 'profile_id', 3),
  ('aha_insta_follows', 'profile_id', 3),
  ('aha_imports', 'profile_id', 3),
  ('aha_insight_chambers', 'profile_id', 3),
  ('aha_insight_embeddings', 'profile_id', 4)
),
tables AS (
  SELECT e.*, c.oid, coalesce(c.relrowsecurity, false) AS rls_enabled
  FROM expected e
  LEFT JOIN pg_namespace ns ON ns.nspname = 'public'
  LEFT JOIN pg_class c ON c.relnamespace = ns.oid
    AND c.relname = e.table_name AND c.relkind IN ('r', 'p')
),
policy_summary AS (
  SELECT
    t.table_name,
    count(p.policyname) AS policy_count,
    coalesce(bool_or(
      p.cmd IN ('SELECT', 'ALL')
      AND 'authenticated' = ANY(p.roles)
      AND strpos(coalesce(p.qual, ''), 'auth.uid()') > 0
      AND strpos(coalesce(p.qual, ''), t.owner_column) > 0
    ), false) AS own_select,
    coalesce(bool_or(
      p.cmd IN ('INSERT', 'ALL')
      AND 'authenticated' = ANY(p.roles)
      AND strpos(coalesce(p.with_check, ''), 'auth.uid()') > 0
      AND strpos(coalesce(p.with_check, ''), t.owner_column) > 0
    ), false) AS own_insert,
    coalesce(bool_or(
      p.cmd IN ('UPDATE', 'ALL')
      AND 'authenticated' = ANY(p.roles)
      AND strpos(coalesce(p.qual, ''), 'auth.uid()') > 0
      AND strpos(coalesce(p.with_check, ''), 'auth.uid()') > 0
      AND strpos(coalesce(p.qual, ''), t.owner_column) > 0
      AND strpos(coalesce(p.with_check, ''), t.owner_column) > 0
    ), false) AS own_update,
    coalesce(bool_or(
      'anon' = ANY(p.roles) OR 'public' = ANY(p.roles)
    ), false) AS anonymous_or_public_policy
  FROM tables t
  LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = t.table_name
  GROUP BY t.table_name
)
SELECT
  t.table_name,
  (t.oid IS NOT NULL) AS table_exists,
  t.rls_enabled,
  p.policy_count,
  p.own_select,
  p.own_insert,
  p.own_update,
  p.anonymous_or_public_policy,
  CASE
    WHEN t.oid IS NULL THEN 'MISSING_TABLE'
    WHEN NOT t.rls_enabled THEN 'FAIL_RLS_DISABLED'
    WHEN p.anonymous_or_public_policy THEN 'REVIEW_PUBLIC_POLICY'
    WHEN NOT (p.own_select AND p.own_insert AND p.own_update) THEN 'REVIEW_MISSING_OWN_POLICY'
    WHEN p.policy_count <> t.expected_policies THEN 'REVIEW_EXTRA_OR_MISSING_POLICY'
    ELSE 'POLICY_PREFLIGHT_OK'
  END AS audit_status
FROM tables t
JOIN policy_summary p USING (table_name)
ORDER BY t.table_name;

COMMIT;

-- Important limitations:
-- 1) This checks only public AHA legacy tables known in the repository, not
--    private canonical aha.* nor all other unknown tables/functions/grants.
-- 2) Even POLICY_PREFLIGHT_OK cannot prove correct RLS logic or isolation.
--    A separate real two-user test must prove A cannot read/change B's data.
-- 3) This makes no data modifications. Never "fix" policies blindly.
