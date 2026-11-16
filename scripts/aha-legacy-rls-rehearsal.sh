#!/usr/bin/env bash
# ONLY use on an ephemeral, disposable Postgres instance in CI.
set -euo pipefail
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
