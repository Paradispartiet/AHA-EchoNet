#!/usr/bin/env bash
# Disposable PostgreSQL CI only, after the existing vault RLS/quota rehearsal.
set -euo pipefail
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
payload='{"format":"history-go-psychology-encrypted-backup-v1","version":1,"kdf":"PBKDF2-SHA256","iterations":310000,"cipher":"AES-256-GCM","salt":"AQEBAQEBAQEBAQEBAQEBAQ==","iv":"AgICAgICAgICAgIC","data":"AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD"}'
psql -X -v ON_ERROR_STOP=1 -v payload="$payload" <<'SQL'
delete from public.aha_psychology_encrypted_backups;
update aha_psych_quota_private.budget
set accepting_uploads=true, limit_bytes=octet_length(:'payload');
SQL
cat > "$work/attempt.sql" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
insert into public.aha_psychology_encrypted_backups(user_id,encrypted_file)
values(auth.uid(), :'payload');
select pg_sleep(1);
commit;
SQL
psql -X -v ON_ERROR_STOP=1 -v owner_id=11111111-1111-4111-8111-111111111111 -v payload="$payload" -f "$work/attempt.sql" >"$work/a.log" 2>&1 &
a=$!
psql -X -v ON_ERROR_STOP=1 -v owner_id=22222222-2222-4222-8222-222222222222 -v payload="$payload" -f "$work/attempt.sql" >"$work/b.log" 2>&1 &
b=$!
sa=0; sb=0
wait "$a" || sa=$?
wait "$b" || sb=$?
if [[ "$sa" = 0 && "$sb" != 0 ]]; then
  grep -q vault_quota_or_uploads_closed "$work/b.log"
elif [[ "$sb" = 0 && "$sa" != 0 ]]; then
  grep -q vault_quota_or_uploads_closed "$work/a.log"
else
  cat "$work/a.log" "$work/b.log"
  echo "Expected exactly one concurrent upload to commit" >&2
  exit 1
fi
psql -X -v ON_ERROR_STOP=1 <<'SQL'
do $assert$
begin
  if (select count(*) from public.aha_psychology_encrypted_backups) <> 1
     or not (select used_bytes=limit_bytes from aha_psych_quota_private.budget)
     or (select used_bytes from aha_psych_quota_private.budget) is distinct from
        (select sum(octet_length(encrypted_file)) from public.aha_psychology_encrypted_backups)
  then raise exception 'concurrent quota invariant failed'; end if;
end
$assert$;
update aha_psych_quota_private.budget set accepting_uploads=false;
SQL
echo 'AHA vault concurrent quota rehearsal: PASS'
