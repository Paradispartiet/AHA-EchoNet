-- AHA canonical sync journal FK index completion v1
-- Hosted Supabase advisor follow-up for the new sync journal tables.

begin;

create index if not exists aha_sync_changes_changed_by_profile_idx
  on aha.sync_changes(changed_by_profile_id)
  where changed_by_profile_id is not null;

create index if not exists aha_sync_conflicts_profile_idx
  on aha.sync_conflicts(profile_id);

insert into aha.schema_versions(version,description,metadata)
values (
  'aha_canonical_sync_journal_fk_indexes_v1',
  'Completes covering indexes for sync-journal profile foreign keys found by hosted Supabase advisor.',
  pg_catalog.jsonb_build_object(
    'runtime_activated', false,
    'advisor_source', 'supabase_hosted_staging',
    'rls_modified', false,
    'grants_modified', false
  )
)
on conflict(version) do update
set description=excluded.description,
    metadata=excluded.metadata,
    applied_at=pg_catalog.now();

commit;
