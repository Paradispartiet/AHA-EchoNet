#!/usr/bin/env bash
set -euo pipefail
# Never run this against a hosted or production service.
if [[ "$GITHUB_ACTIONS" != true ||
      "$PGHOST" != 127.0.0.1 ||
      "$PGDATABASE" != aha_rehearsal ||
      "$PGUSER" != postgres ]]; then
  echo "Atomic purge rehearsal requires isolated GitHub PostgreSQL" >&2
  exit 1
fi
psql_guarded() { psql -X -v ON_ERROR_STOP=1 -q -A -t "$@"; }

# The earlier CI rehearsal has already removed its expired orphan.
# This creates just one new synthetic, expired 108-byte private attachment.
psql_guarded <<'SQL'
INSERT INTO aha_social.media(profile_id,request_key,content_type,bytes,created_at)
VALUES ('profile_a','atomic-ci-orphan-001','image/png',
  decode('89504e470d0a1a0a'||repeat('00',100),'hex'),
  now()-interval '25 hours');
SQL

# Stale operator approval: the whole transaction must roll back.
if node -e 'process.stdout.write(require("./scripts/aha-social-staging-media-maintenance.cjs").atomicPurgeSql(2,108))' \
  | psql_guarded -f - >/dev/null 2>&1; then
  echo "An incorrectly reviewed count was allowed to purge" >&2
  exit 1
fi
retained="$(psql_guarded -c "SELECT count(*) FROM aha_social.media WHERE request_key='atomic-ci-orphan-001'")"
if [[ "$retained" != "1" ]]; then
  echo "Incorrect count did not roll back the purge" >&2
  exit 1
fi

# Exact operator-approved count and bytes. Verify no other media was removed.
deleted="$(node -e 'process.stdout.write(require("./scripts/aha-social-staging-media-maintenance.cjs").atomicPurgeSql(1,108))' \
  | psql_guarded -f -)"
if [[ "$deleted" != "1" ]]; then
  echo "Correct count did not produce exactly one purge" >&2
  exit 1
fi
psql_guarded <<'SQL'
DO $verify$
BEGIN
 IF EXISTS(SELECT 1 FROM aha_social.media WHERE request_key='atomic-ci-orphan-001') THEN
  RAISE EXCEPTION 'Atomic purge left old private media in place';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM aha_social.media WHERE post_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Atomic purge removed non-expired published media';
 END IF;
END;
$verify$;
SQL
echo "AHA social atomic media purge real PostgreSQL rehearsal: PASS"
