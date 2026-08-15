-- AHA canonical sync revision parity for article references v1
--
-- `article_references` is part of the canonical bidirectional sync allow-list.
-- Every syncable object must expose the same monotone revision contract so
-- stale-base detection cannot silently fall back to timestamps or special cases.

begin;

alter table aha.article_references
  add column if not exists updated_at timestamptz;

update aha.article_references
set updated_at = added_at
where updated_at is null;

alter table aha.article_references
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table aha.article_references
  add column if not exists revision bigint;

update aha.article_references
set revision = 1
where revision is null;

alter table aha.article_references
  alter column revision set default 1,
  alter column revision set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'aha.article_references'::regclass
      and conname = 'article_references_revision_positive_chk'
  ) then
    alter table aha.article_references
      add constraint article_references_revision_positive_chk check (revision > 0);
  end if;
end
$$;

insert into aha.schema_versions(version, description, metadata)
values (
  'aha_article_reference_revision_v1',
  'Adds updated_at and monotone revision fields to canonical article references for uniform stale-base sync semantics.',
  pg_catalog.jsonb_build_object(
    'runtime_activated', false,
    'frontend_sync_activated', false,
    'article_reference_revision', true,
    'timestamp_conflict_fallback', false
  )
)
on conflict(version) do update
set description = excluded.description,
    metadata = excluded.metadata,
    applied_at = pg_catalog.now();

commit;
