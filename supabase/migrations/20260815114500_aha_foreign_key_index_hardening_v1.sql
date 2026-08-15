-- AHA canonical PostgreSQL foreign-key index hardening v1
--
-- Hosted Supabase Performance Advisor showed that the normalized canonical
-- schema still had foreign keys without a covering index. Create only the
-- missing indexes, using the FK columns as the leading index prefix.
--
-- This migration changes no RLS policies, grants or runtime activation flags.

begin;

do $do$
declare
  fk record;
  index_name text;
  column_sql text;
begin
  for fk in
    with foreign_keys as (
      select
        c.conname,
        c.conrelid,
        n.nspname,
        t.relname,
        c.conkey,
        array(
          select a.attname
          from unnest(c.conkey) with ordinality key_col(attnum, ord)
          join pg_attribute a
            on a.attrelid = c.conrelid
           and a.attnum = key_col.attnum
          order by key_col.ord
        ) as columns
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where c.contype = 'f'
        and n.nspname = 'aha'
    )
    select foreign_keys.*
    from foreign_keys
    where not exists (
      select 1
      from pg_index i
      where i.indrelid = foreign_keys.conrelid
        and i.indisvalid
        and i.indisready
        and (
          select array_agg(index_col.attnum order by index_col.ord)
          from unnest(i.indkey) with ordinality index_col(attnum, ord)
          where index_col.ord <= cardinality(foreign_keys.conkey)
        ) = foreign_keys.conkey
    )
    order by nspname, relname, conname
  loop
    index_name :=
      left(
        'aha_fk_' || fk.relname || '_' || array_to_string(fk.columns, '_'),
        49
      ) || '_' ||
      substr(md5(fk.relname || ':' || array_to_string(fk.columns, ',')), 1, 8) ||
      '_idx';

    select array_to_string(
      array(select quote_ident(column_name) from unnest(fk.columns) column_name),
      ', '
    ) into column_sql;

    execute format(
      'create index if not exists %I on %I.%I (%s)',
      index_name,
      fk.nspname,
      fk.relname,
      column_sql
    );
  end loop;
end;
$do$;

insert into aha.schema_versions (version, description, metadata)
values (
  'aha_foreign_key_index_hardening_v1',
  'Adds missing covering indexes for canonical AHA foreign keys after hosted performance-advisor rehearsal.',
  pg_catalog.jsonb_build_object(
    'runtime_activated', false,
    'advisor_source', 'supabase_hosted_staging',
    'rls_modified', false,
    'grants_modified', false,
    'index_policy', 'missing_fk_prefix_only'
  )
)
on conflict (version) do update
set description = excluded.description,
    metadata = excluded.metadata,
    applied_at = pg_catalog.now();

commit;
