-- AHA DB-03 / EchoNet: catalogue-only privilege status for Friend/Meet RPCs.
-- SQL EDITOR: run ONLY in AHA project wshmybqyksrwkawqleiz.
-- Zero private rows, invite IDs, report contents or Auth user data are returned.
-- AUTH_ONLY_PRIVILEGED_REVIEW != authorization proven. Test real JWTs separately.
BEGIN READ ONLY;

WITH expected_rpc(function_name, arg_types) AS (
  VALUES
    ('aha_open_social_meet_chat', 'uuid'),
    ('aha_report_direct_chat', 'uuid,text')
),
rpc AS (
  SELECT e.function_name,
         to_regprocedure(format('public.%I(%s)',e.function_name,e.arg_types)) AS oid
  FROM expected_rpc e
)
SELECT 'privileged_rpc' AS object_type,
       'public.' || r.function_name AS object_name,
       CASE
         WHEN p.oid IS NULL THEN 'MISSING_RPC'
         WHEN NOT p.prosecdef THEN 'REVIEW_SECURITY_MODE_CHANGED'
         WHEN has_function_privilege('anon',p.oid,'EXECUTE')
           OR EXISTS (
             SELECT 1
             FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) AS acl
             WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
           ) THEN 'BLOCK_ANONYMOUS_OR_PUBLIC_EXECUTE'
         WHEN NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
           THEN 'REVIEW_AUTH_EXECUTE_MISSING'
         WHEN NOT EXISTS (
           SELECT 1
           FROM unnest(coalesce(p.proconfig,'{}'::text[])) AS setting
           WHERE setting LIKE 'search_path=pg_catalog,%'
         ) THEN 'REVIEW_UNPINNED_SEARCH_PATH'
         WHEN position('auth.uid()' IN pg_get_functiondef(p.oid))=0
           THEN 'BLOCK_MISSING_IDENTITY_CHECK'
         ELSE 'AUTH_ONLY_PRIVILEGED_REVIEW'
       END AS audit_status
FROM rpc r LEFT JOIN pg_proc p ON p.oid=r.oid

UNION ALL

SELECT 'private_table' AS object_type,
       'aha_friend_private.' || e.table_name AS object_name,
       CASE
         WHEN c.oid IS NULL THEN 'MISSING_PRIVATE_TABLE'
         WHEN NOT c.relrowsecurity THEN 'BLOCK_PRIVATE_RLS_DISABLED'
         WHEN has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
           OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')
           THEN 'BLOCK_DIRECT_TABLE_ACCESS'
         WHEN EXISTS (
           SELECT 1 FROM pg_policies p
           WHERE p.schemaname='aha_friend_private' AND p.tablename=e.table_name
         ) THEN 'REVIEW_PRIVATE_TABLE_POLICY_ADDED'
         ELSE 'PRIVATE_TABLE_DIRECT_ACCESS_DENIED'
       END AS audit_status
FROM (VALUES ('chat_reports'),('invite_quotas'),('meet_links')) AS e(table_name)
LEFT JOIN pg_namespace n ON n.nspname='aha_friend_private'
LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=e.table_name
  AND c.relkind IN ('r','p')
ORDER BY object_type,object_name;

COMMIT;

-- Catalog preflight only: does not exercise function calls, session spoofing,
-- accidental disclosure, quota bypass, SQL injection or two real auth sessions.
-- Do NOT change function privileges or private table policies merely to silence
-- a Supabase advisor warning: existing code intentionally uses SECURITY DEFINER
-- for narrowly scoped operations after auth.uid() and invitation checks.
