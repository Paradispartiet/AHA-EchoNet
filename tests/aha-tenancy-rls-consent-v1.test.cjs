const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const migrationPath = path.join(root, "supabase", "migrations", "20260814220000_aha_tenancy_rls_consent_v1.sql");
const documentPath = path.join(root, "docs", "AHA_TENANCY_RLS_CONSENT_V1.md");
const matrixPath = path.join(root, "docs", "AHA_TENANCY_RLS_CONSENT_MATRIX_V1.json");

for (const filePath of [migrationPath, documentPath, matrixPath]) {
  assert.equal(fs.existsSync(filePath), true, `${path.relative(root, filePath)} mangler`);
}

const sql = fs.readFileSync(migrationPath, "utf8");
const docs = fs.readFileSync(documentPath, "utf8");
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));

assert.match(sql, /Status: contract and fail-closed policy baseline only/i);
assert.match(sql, /\bbegin;[\s\S]*\bcommit;\s*$/i);
assert.match(sql, /alter table aha\.schema_versions enable row level security/i);
assert.match(sql, /alter table aha\.import_batches[\s\S]*add column if not exists consent_receipt_id text/i);
assert.match(sql, /alter column consent_receipt_id set not null/i);
assert.match(sql, /foreign key \(consent_receipt_id, profile_id\)[\s\S]*references aha\.consent_receipts\(id, profile_id\)/i);

assert.match(sql, /create or replace function aha\.request_claims\(\)/i);
assert.match(sql, /current_setting\('request\.jwt\.claims', true\)/i);
assert.match(sql, /create or replace function aha\.current_profile_id\(\)[\s\S]*security definer/i);
assert.match(sql, /p\.auth_provider = aha\.current_auth_provider\(\)/i);
assert.match(sql, /p\.auth_subject = aha\.current_auth_subject\(\)/i);
assert.doesNotMatch(sql, /user_metadata|raw_user_meta_data/i);

for (const helper of [
  "workspace_role_rank",
  "can_read_workspace",
  "can_edit_workspace",
  "can_admin_workspace",
  "workspace_share_scope",
  "account_import_scope",
  "publication_scope",
  "consent_is_active",
  "can_read_shared_object",
  "can_read_insight",
  "can_read_concept_list",
  "can_read_knowledge_path",
  "can_read_article",
  "can_read_import_batch"
]) {
  assert.match(sql, new RegExp(`create or replace function aha\\.${helper}\\(`, "i"), `${helper} mangler`);
}

assert.match(sql, /'workspace_share'[\s\S]*aha\.workspace_share_scope/i);
assert.match(sql, /'account_import'[\s\S]*aha\.account_import_scope/i);
assert.match(sql, /'public_publish'[\s\S]*aha\.publication_scope/i);
assert.match(sql, /c\.status = 'granted'/i);
assert.match(sql, /c\.withdrawn_at is null/i);
assert.match(sql, /c\.expires_at is null or c\.expires_at > now\(\)/i);

const consentTriggers = [...sql.matchAll(/create trigger aha_enforce_consent\s+before insert or update on aha\.([a-z_]+)/gi)]
  .map((match) => match[1]);
assert.deepEqual(consentTriggers.sort(), ["import_batches", "publications", "sharing_grants"]);
assert.match(sql, /active workspace sharing requires an active, exact consent receipt/i);
assert.match(sql, /account import requires an active, payload-specific consent receipt/i);
assert.match(sql, /public publication requires an active, version-specific consent receipt/i);

const policyMatches = [...sql.matchAll(/create policy aha_v1_select on aha\.([a-z_]+)\s+for select/gi)]
  .map((match) => match[1]);
assert.equal(policyMatches.length, 36, "forventet 36 eksplisitte SELECT-policyer");
assert.equal(new Set(policyMatches).size, 36, "policyene skal gjelde 36 unike tabeller");
for (const backendOnly of ["audit_events", "idempotency_keys", "outbox_events"]) {
  assert.equal(policyMatches.includes(backendOnly), false, `${backendOnly} skal ikke ha direkte SELECT-policy`);
}
assert.doesNotMatch(sql, /create policy[\s\S]{0,120}\bfor\s+(insert|update|delete|all)\b/i);
assert.doesNotMatch(sql, /^\s*grant\s+/gmi, "migreringen skal ikke opprette grants");
assert.match(sql, /revoke all on function aha\.current_profile_id\(\) from public/i);
assert.match(sql, /revoke all on function aha\.can_read_workspace\(text\) from public/i);
assert.match(sql, /'frontend_grants_created', false/i);
assert.match(sql, /'direct_database_writes', false/i);
assert.match(sql, /'policy_count', 36/i);

assert.match(sql, /can_read_shared_object\(target_workspace_id, 'insight'/i);
assert.match(sql, /can_read_shared_object\(target_workspace_id, 'concept_list'/i);
assert.match(sql, /can_read_shared_object\(target_workspace_id, 'knowledge_path'/i);
assert.match(sql, /can_read_shared_object\(target_workspace_id, 'article'/i);
assert.doesNotMatch(sql, /can_read_shared_object\([^\n]+, '(message|source_event|analysis_evidence)'/i);
assert.match(sql, /from_insight_id[\s\S]*and aha\.can_read_insight\(workspace_id, to_insight_id\)/i);

assert.equal(matrix.version, "aha_tenancy_rls_consent_v1");
assert.equal(matrix.status, "contract_only");
assert.equal(matrix.runtimeActivated, false);
assert.equal(matrix.frontendGrantsCreated, false);
assert.equal(matrix.directDatabaseWrites, "backend_only");
assert.deepEqual(matrix.identity.authorizationClaims, ["sub", "aha_provider"]);
assert.deepEqual(matrix.identity.forbiddenAuthorizationClaims, ["user_metadata", "raw_user_meta_data"]);
assert.deepEqual(matrix.roles, { owner: 100, editor: 70, member: 40, observer: 10 });
assert.deepEqual(matrix.shareableObjectTypes, ["insight", "concept_list", "knowledge_path", "article"]);
assert.deepEqual(matrix.consentPurposes, ["account_import", "workspace_share", "public_publish"]);
assert.equal(matrix.tables.length, 39);
assert.equal(new Set(matrix.tables.map((item) => item.table)).size, 39);
for (const item of matrix.tables) {
  assert.equal(["backend_only", "migration_only"].includes(item.write), true, `${item.table} har uventet write-grense`);
}
for (const backendOnly of ["audit_events", "idempotency_keys", "outbox_events"]) {
  const row = matrix.tables.find((item) => item.table === backendOnly);
  assert.ok(row, `${backendOnly} mangler i matrisa`);
  assert.match(row.read, /backend/i);
}

assert.match(docs, /fail-closed kontrakt — ikke aktiv runtime/i);
assert.match(docs, /Følgende brukes \*\*ikke\*\* som autorisasjonskilde/i);
assert.match(docs, /user_metadata/);
assert.match(docs, /raw_user_meta_data/);
assert.match(docs, /BYPASSRLS/i);
assert.match(docs, /runtime-rollen skal ikke eie `aha\.\*`-tabellene/i);
assert.match(docs, /36 `FOR SELECT`-policyer/i);
assert.match(docs, /ingen direkte:[\s\S]*`INSERT`[\s\S]*`UPDATE`[\s\S]*`DELETE`/i);
assert.match(docs, /Rå samtaler, meldinger, source events, vedlegg og analysis evidence kan ikke/i);
assert.match(docs, /account_import[\s\S]*workspace_share[\s\S]*public_publish/i);
assert.match(docs, /faktisk restore/i);
assert.match(docs, /PR 4 — NestJS foundation/i);

console.log("aha-tenancy-rls-consent-v1.test.cjs passed");
