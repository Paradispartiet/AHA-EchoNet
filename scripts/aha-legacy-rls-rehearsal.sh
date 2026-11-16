#!/usr/bin/env bash
# ONLY use on an ephemeral, disposable Postgres instance in CI.
set -euo pipefail

# A fixture that creates users/roles/rows must never accidentally run against
# the AHA or Fysen hosted databases. Refuse anything except CI's disposable DB.
if [[ "${PGHOST:-}" != "127.0.0.1" || "${PGDATABASE:-}" != "aha_legacy_rehearsal" || "${PGPORT:-}" != "5432" ]]; then
  echo "Refusing to run legacy RLS fixture outside isolated local PostgreSQL CI" >&2
  exit 2
fi

psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
CREATE ROLE authenticated NOLOGIN NOBYPASSRLS;
CREATE ROLE anon NOLOGIN NOBYPASSRLS;
SQL
psql -v ON_ERROR_STOP=1 -f supabase/schema.sql
psql -v ON_ERROR_STOP=1 -f supabase/policies.sql
psql -v ON_ERROR_STOP=1 -f supabase/chamber.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/aha_legacy_rls_rehearsal_v1.sql
echo "AHA legacy synthetic two-user RLS rehearsal passed."

# Exercise the *actual* hosted-style read-only audit SQL against the same
# synthetic schema. The AHA project remains entirely untouched.
audit_result="$(psql -v ON_ERROR_STOP=1 -At -f supabase/audits/aha_legacy_readonly_preflight.sql)"
preflight_ok="$(printf '%s\n' "$audit_result" | grep -c -F '|POLICY_PREFLIGHT_OK' || :)"
optional_missing="$(printf '%s\n' "$audit_result" | grep -F 'aha_insight_embeddings|' | grep -c -F '|MISSING_TABLE' || :)"
if [[ "$preflight_ok" != "12" || "$optional_missing" != "1" ]]; then
  echo "AHA legacy catalog audit unexpected results: expected 12 OK and optional embeddings missing" >&2
  printf '%s\n' "$audit_result" >&2
  exit 1
fi
echo "AHA hosted-style read-only catalog audit passed against isolated synthetic fixture: 12/12 core tables."

# Negative control: deliberately revoke UPDATE on *synthetic* aha_notes.
# A read-only audit must find the missing SQL GRANT even when RLS is sound.
# The guard above explicitly blocks running this against any hosted database.
psql -v ON_ERROR_STOP=1 -c 'REVOKE UPDATE ON TABLE public.aha_notes FROM authenticated' >/dev/null
negative_result="$(psql -v ON_ERROR_STOP=1 -At -f supabase/audits/aha_legacy_readonly_preflight.sql)"
missing_grant="$(printf '%s\n' "$negative_result" | grep -F 'aha_notes|' | grep -c -F '|REVIEW_MISSING_TABLE_GRANT' || :)"
remaining_ok="$(printf '%s\n' "$negative_result" | grep -c -F '|POLICY_PREFLIGHT_OK' || :)"
if [[ "$missing_grant" != "1" || "$remaining_ok" != "11" ]]; then
  echo "AHA catalog grant negative-control failed: a missing UPDATE grant was not detected" >&2
  exit 1
fi
psql -v ON_ERROR_STOP=1 -c 'GRANT UPDATE ON TABLE public.aha_notes TO authenticated' >/dev/null
echo "AHA synthetic grant negative-control passed: missing UPDATE grant flagged, then restored."
