-- AHA local account import v1: locked-search-path SHA-256 compatibility guard
--
-- The canonical import function deliberately executes with
-- search_path = pg_catalog, aha. pgcrypto's digest() may be installed in a
-- different extension schema, so relying on that function would make the
-- SECURITY DEFINER command deployment-dependent. Keep the locked search path
-- and provide only the SHA-256 primitive the import function needs inside aha.

begin;

create or replace function aha.digest(
  p_input text,
  p_algorithm text
)
returns bytea
language plpgsql
immutable
strict
security invoker
set search_path = pg_catalog, aha
as $function$
begin
  if pg_catalog.lower(p_algorithm) <> 'sha256' then
    raise exception 'unsupported digest algorithm' using errcode = '22023';
  end if;

  return pg_catalog.sha256(pg_catalog.convert_to(p_input, 'UTF8'));
end;
$function$;

revoke all on function aha.digest(text, text) from public;

comment on function aha.digest(text, text) is
  'Locked-search-path SHA-256 helper for AHA canonical local import v1. Not a general cryptographic API.';

commit;
