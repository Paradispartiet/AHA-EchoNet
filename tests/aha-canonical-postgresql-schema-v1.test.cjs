const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const migrationDir = path.join(root, "supabase", "migrations");
const migrationFiles = [
  "20260814215000_aha_identity_workspaces_v1.sql",
  "20260814215100_aha_conversations_sources_v1.sql",
  "20260814215200_aha_analysis_insights_v1.sql",
  "20260814215300_aha_artifacts_v1.sql",
  "20260814215400_aha_governance_v1.sql",
  "20260814215500_aha_schema_guards_v1.sql"
];

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function stripSqlLiterals(input) {
  return input
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/'(?:''|[^'])*'/g, "''");
}

for (const file of migrationFiles) {
  const fullPath = path.join(migrationDir, file);
  assert.equal(fs.existsSync(fullPath), true, `${file} mangler`);
  const migration = fs.readFileSync(fullPath, "utf8");
  assert.match(migration, /Status: migration contract only/);
  assert.match(migration, /\bbegin;[\s\S]*\bcommit;\s*$/i);
  const stripped = stripSqlLiterals(migration);
  assert.equal(
    (stripped.match(/\(/g) || []).length,
    (stripped.match(/\)/g) || []).length,
    `${file} har ubalanserte parenteser`
  );
}

const sql = migrationFiles
  .map((file) => fs.readFileSync(path.join(migrationDir, file), "utf8"))
  .join("\n");
const createdTables = [...sql.matchAll(/create table if not exists\s+aha\.([a-z_]+)\s*\(/gi)]
  .map((match) => match[1]);
const expectedTables = [
  "profiles", "devices", "workspace_roles", "workspaces", "workspace_memberships", "workspace_invitations",
  "conversations", "conversation_participants", "messages", "source_events", "source_attachments",
  "analysis_runs", "analysis_claims", "analysis_evidence", "insights", "insight_versions", "insight_relations", "insight_feedback", "memory_revisions",
  "concept_lists", "concept_list_items", "knowledge_paths", "knowledge_path_steps", "articles", "article_versions", "article_references", "publications",
  "consent_receipts", "sharing_grants", "import_batches", "import_items", "device_sync_cursors", "data_exports", "deletion_requests", "audit_events", "idempotency_keys", "outbox_events", "ai_jobs", "schema_versions"
];
assert.equal(createdTables.length, 39);
assert.equal(new Set(createdTables).size, 39);
for (const table of expectedTables) {
  assert.equal(createdTables.includes(table), true, `aha.${table} mangler`);
}

assert.match(sql, /create schema if not exists aha/i);
assert.match(sql, /revoke all on schema aha from public/i);
assert.doesNotMatch(sql, /(?:alter|drop|truncate|delete\s+from)\s+(?:table\s+)?public\.aha_/i);
assert.doesNotMatch(sql, /(?:alter|drop|truncate|delete\s+from)\s+(?:table\s+)?public\.music_/i);
assert.doesNotMatch(sql, /create\s+policy/i, "RLS-policyer skal leveres i PR 3, ikke schema v1");
assert.doesNotMatch(sql, /^\s*local_only\s+/gmi, "local_only skal ikke bli en canonical cloudkolonne");

assert.match(sql, /foreign key \(id, current_version, workspace_id\)[\s\S]*references aha\.insight_versions\(insight_id, version, workspace_id\)[\s\S]*deferrable initially deferred/i);
assert.match(sql, /foreign key \(id, current_version, workspace_id\)[\s\S]*references aha\.article_versions\(article_id, version, workspace_id\)[\s\S]*deferrable initially deferred/i);
assert.match(sql, /create table if not exists aha\.sharing_grants[\s\S]*consent_receipt_id text not null[\s\S]*foreign key \(consent_receipt_id, granted_by_profile_id\)[\s\S]*references aha\.consent_receipts\(id, profile_id\) on delete restrict/i);
assert.match(sql, /check \(target_type <> 'public' or consent_receipt_id is not null\)/i);
assert.match(sql, /create table if not exists aha\.import_items[\s\S]*local_object_id text not null[\s\S]*unique \(import_batch_id, local_storage_key, local_object_id, object_type\)/i);
assert.match(sql, /create table if not exists aha\.idempotency_keys[\s\S]*unique \(workspace_id, profile_id, scope, idempotency_key\)/i);
assert.match(sql, /create table if not exists aha\.outbox_events/i);
assert.match(sql, /create table if not exists aha\.device_sync_cursors/i);
assert.match(sql, /alter table aha\.%I enable row level security/i);
assert.match(sql, /'runtime_activated', false/i);
assert.match(sql, /'legacy_public_tables_modified', false/i);

const schemaDoc = read("docs/AHA_CANONICAL_POSTGRESQL_SCHEMA_V1.md");
const mappingDoc = read("docs/AHA_LOCAL_TO_CANONICAL_MAPPING_V1.md");
assert.match(schemaDoc, /schema- og migreringskontrakt — ikke aktiv runtime/i);
assert.match(schemaDoc, /ADR-001.*ADR-006/i);
assert.match(schemaDoc, /Row Level Security aktivert, men denne leveransen oppretter ingen brukerpolicyer/i);
assert.match(schemaDoc, /Notes[\s\S]*Galleri[\s\S]*Feed[\s\S]*AHA Insta[\s\S]*AHA Music/i);
assert.match(mappingDoc, /aha_chat_sessions_v1/);
assert.match(mappingDoc, /aha_chat_current_session_v1[\s\S]*device_only/);
assert.match(mappingDoc, /aha_source_events_v1/);
assert.match(mappingDoc, /aha_insight_chamber_v1/);
assert.match(mappingDoc, /aha_concept_lists_v1/);
assert.match(mappingDoc, /aha_paths_v1/);
assert.match(mappingDoc, /aha_articles_v1/);
assert.match(mappingDoc, /aha_lists_v1[\s\S]*deferred/);
assert.match(mappingDoc, /aha_privacy_settings_v1[\s\S]*ikke direkte `aha\.consent_receipts`/i);
assert.match(mappingDoc, /History Go[\s\S]*aha_import_payload_v1/);
assert.match(mappingDoc, /ingen[\s\S]*skjult[\s\S]*massekonverter/i);

const legacySchema = read("supabase/schema.sql");
const legacyChamber = read("supabase/chamber.sql");
assert.match(legacySchema, /create table if not exists public\.aha_profiles/i);
assert.match(legacyChamber, /create table if not exists public\.aha_insight_chambers/i);

console.log("aha-canonical-postgresql-schema-v1.test.cjs passed");
