\set ON_ERROR_STOP on

begin;

-- Health/readiness identity. It can log in and inspect the schema boundary through
-- PostgreSQL catalogs, but receives no canonical table access and no function
-- execution. Canonical sync stays disabled while this role is used by the API.
--
-- PostgreSQL 16 requires explicit role-admin rights for later ALTER ROLE calls
-- by a non-superuser CREATEROLE administrator. Create the role with the current
-- production administrator as an explicit ADMIN member so password rotation and
-- login-state enforcement remain available without superuser access.
select format(
  'create role aha_canonical_production_readiness login nosuperuser nobypassrls nocreatedb nocreaterole noinherit admin %I',
  current_user
)
where not exists (
  select 1 from pg_roles where rolname = 'aha_canonical_production_readiness'
)
\gexec

-- Do not repeat SUPERUSER/BYPASSRLS/CREATEDB/CREATEROLE attributes here.
-- Azure PostgreSQL administrators are deliberately not superusers, and PostgreSQL
-- 16 restricts ALTER of those privileged attributes. Their exact fail-closed
-- values are verified below by the production readiness gate instead of repaired.
alter role aha_canonical_production_readiness
  login noinherit
  password :'readiness_password';
alter role aha_canonical_production_readiness set row_security = on;

revoke all on schema aha from aha_canonical_production_readiness;
grant usage on schema aha to aha_canonical_production_readiness;
revoke all on all tables in schema aha from aha_canonical_production_readiness;
revoke all on all sequences in schema aha from aha_canonical_production_readiness;
revoke execute on all functions in schema aha from aha_canonical_production_readiness;

-- Future pilot runtime identity. It is deliberately unusable until a separate
-- production activation workflow changes LOGIN state and injects a rotated
-- password. It never receives direct table writes.
select format(
  'create role aha_canonical_production_runtime nologin nosuperuser nobypassrls nocreatedb nocreaterole noinherit admin %I',
  current_user
)
where not exists (
  select 1 from pg_roles where rolname = 'aha_canonical_production_runtime'
)
\gexec

alter role aha_canonical_production_runtime
  nologin noinherit
  password null;
alter role aha_canonical_production_runtime set row_security = on;

revoke all on schema aha from aha_canonical_production_runtime;
grant usage on schema aha to aha_canonical_production_runtime;
revoke all on all tables in schema aha from aha_canonical_production_runtime;
revoke all on all sequences in schema aha from aha_canonical_production_runtime;
revoke execute on all functions in schema aha from aha_canonical_production_runtime;

-- The dedicated production database has no direct browser/database clients.
-- Remove PUBLIC function execution so effective privileges cannot silently grow
-- when a new SECURITY DEFINER helper is added later.
revoke execute on all functions in schema aha from public;

grant execute on function aha.bootstrap_sync_snapshot_v1(text,text,bigint,integer)
  to aha_canonical_production_runtime;
grant execute on function aha.pull_sync_changes_v1(text,bigint,integer)
  to aha_canonical_production_runtime;
grant execute on function aha.push_sync_change_v1(text,text,text,text,text,text,bigint,text,jsonb)
  to aha_canonical_production_runtime;

commit;
