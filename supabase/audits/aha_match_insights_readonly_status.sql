-- AHA DB-03 / EchoNet: audit deployed insight matching RPC without data access.
-- Read-only catalog query. Returns ONLY one classification; no user rows or IDs.
-- Run in AHA project wshmybqyksrwkawqleiz; never in Fysen.
-- PASS means metadata hardening is deployed, NOT two-account Auth/API isolation.
BEGIN READ ONLY;

WITH target AS (
  SELECT to_regprocedure(
    'public.aha_match_insights(public.vector, integer, double precision, text, text)'
  ) AS oid
),
live AS (
  SELECT p.prosecdef,
         p.proconfig,
         pg_get_functiondef(p.oid) AS definition
  FROM target t
  JOIN pg_proc p ON p.oid = t.oid
)
SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM live) THEN 'MISSING_RPC'
  WHEN EXISTS (SELECT 1 FROM live WHERE prosecdef) THEN 'BLOCK_SECURITY_DEFINER'
  WHEN EXISTS (
    SELECT 1 FROM live l
    WHERE NOT EXISTS (
      SELECT 1 FROM unnest(coalesce(l.proconfig, '{}'::text[])) setting
      WHERE setting IN ('search_path=', 'search_path=""')
    )
  ) THEN 'REVIEW_MUTABLE_SEARCH_PATH'
  WHEN EXISTS (
    SELECT 1 FROM live l WHERE
      position('auth.uid()' IN l.definition) = 0 OR
      position('public.aha_insight_embeddings' IN l.definition) = 0
  ) THEN 'REVIEW_OWNER_FILTER_OR_TABLE'
  WHEN EXISTS (
    SELECT 1 FROM live l WHERE
      (length(l.definition) -
        length(replace(l.definition, 'OPERATOR(public.<=>)', '')))
        / length('OPERATOR(public.<=>)') < 3
  ) THEN 'REVIEW_UNQUALIFIED_VECTOR_OPERATOR'
  ELSE 'RPC_METADATA_PREFLIGHT_OK'
END AS aha_match_insights_status;

COMMIT;

-- REVIEW_* / BLOCK_*: source code alone is NOT production deployment proof.
-- Never run supabase/embeddings.sql wholesale against a populated database
-- to resolve one warning: it also contains table, index, extension and RLS DDL.
-- Any hosted database function change needs separate owner approval and restore plan.
