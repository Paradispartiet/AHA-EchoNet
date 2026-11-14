\set ON_ERROR_STOP on
SET row_security = on;
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"rehearsal-user-a","aha_provider":"supabase"}',true);
DO $check$
DECLARE quota_denied boolean:=false;
BEGIN
 BEGIN
  PERFORM aha_social.upload_media_v1('image/png',
    decode('89504e470d0a1a0a'||repeat('00',100),'hex'),
    'quota-profile-probe-001');
 EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM <> 'media storage quota' THEN RAISE; END IF;
  quota_denied:=true;
 END;
 IF NOT quota_denied THEN
  RAISE EXCEPTION 'The 8 MiB per-profile staging media quota was bypassed';
 END IF;
END;
$check$;
ROLLBACK;
\echo 'AHA staging 8 MiB per-profile media quota: PASS'
