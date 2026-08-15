const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const requiredFiles = [
  "js/ahaLocalAccountImport.js",
  "backend/api/src/local-imports/local-import.config.ts",
  "backend/api/src/local-imports/local-import.dto.ts",
  "backend/api/src/local-imports/local-import-confirmation.service.ts",
  "backend/api/src/local-imports/local-import.plan.ts",
  "backend/api/src/local-imports/local-import.repository.ts",
  "backend/api/src/local-imports/local-import.service.ts",
  "backend/api/src/local-imports/local-import.controller.ts",
  "backend/api/src/local-imports/local-import.module.ts",
  "supabase/migrations/20260815065000_aha_local_import_v1.sql"
];
for (const relative of requiredFiles) {
  assert.equal(fs.existsSync(path.join(root, relative)), true, `${relative} mangler`);
}

const localBuilder = read("js/ahaLocalAccountImport.js");
assert.match(localBuilder, /aha_local_account_import_v1/);
assert.match(localBuilder, /aha_local_import_plan_v1/);
for (const key of [
  "aha_chat_sessions_v1",
  "aha_source_events_v1",
  "aha_insight_chamber_v1",
  "aha_concept_lists_v1",
  "aha_paths_v1",
  "aha_articles_v1"
]) assert.match(localBuilder, new RegExp(key));
for (const key of [
  "aha_notes_v1",
  "aha_gallery_v1",
  "aha_feed_posts_v1",
  "aha_insta_posts_v1",
  "aha_music_library_v1",
  "aha_training_corpus_v1",
  "aha_personal_ai_control_status_v1"
]) assert.match(localBuilder, new RegExp(key));
assert.doesNotMatch(localBuilder, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/);
assert.match(localBuilder, /excludedDataUploaded:\s*false/);
assert.match(localBuilder, /requiresExplicitConfirmation:\s*true/);

const controller = read("backend/api/src/local-imports/local-import.controller.ts");
assert.match(controller, /@Post\("confirmation"\)/);
assert.match(controller, /@Post\("commit"\)/);
assert.doesNotMatch(controller, /@Public\(\)/);

const confirmation = read("backend/api/src/local-imports/local-import-confirmation.service.ts");
assert.match(confirmation, /createHmac\("sha256"/);
assert.match(confirmation, /timingSafeEqual/);
assert.match(confirmation, /payloadHash/);
assert.match(confirmation, /planHash/);
assert.match(confirmation, /countsHash/);
assert.match(confirmation, /subject:\s*principal\.subject/);
assert.match(confirmation, /provider:\s*principal\.provider/);
assert.match(confirmation, /workspaceScope:\s*"personal"/);
assert.match(confirmation, /purpose:\s*"account_import"/);

const importService = read("backend/api/src/local-imports/local-import.service.ts");
assert.match(importService, /dataUploaded:\s*false/);
assert.match(importService, /validateLocalImportPlan/);
assert.match(importService, /sha256Hex\(plan\)/);
assert.match(importService, /IMPORT_PLAN_CHANGED/);
assert.match(importService, /confirmations\.verify/);

const databaseService = read("backend/api/src/database/canonical-database.service.ts");
assert.match(databaseService, /withCommandSession/);
assert.match(databaseService, /set_config\('request\.jwt\.claims'/);
assert.match(databaseService, /bypasses_rls/);
assert.match(databaseService, /can_assume_table_owner/);
assert.match(databaseService, /row_security_on/);

const sql = read("supabase/migrations/20260815065000_aha_local_import_v1.sql");
assert.match(sql, /create or replace function aha\.commit_local_import_v1/);
assert.match(sql, /security definer/i);
assert.match(sql, /aha\.current_profile_id\(\)/);
assert.match(sql, /aha\.account_import_scope\(v_workspace_id, p_source_kind, p_payload_hash\)/);
assert.match(sql, /'account_import'/);
assert.match(sql, /explicit_hash_bound_confirmation/);
assert.match(sql, /consent_receipt_id/);
assert.match(sql, /preview_counts/);
assert.match(sql, /result_counts/);
assert.match(sql, /idempotency_key/);
assert.match(sql, /aha\.record_local_import_item_v1/);
assert.match(sql, /'duplicate'/);
assert.match(sql, /local_only_uploaded/);
assert.match(sql, /revoke all on function aha\.commit_local_import_v1[^;]+from public/i);
assert.doesNotMatch(sql, /^\s*grant\s+/gmi);
assert.doesNotMatch(sql, /create\s+policy/i);
assert.doesNotMatch(sql, /public\.aha_|public\.music_/i);

const appModule = read("backend/api/src/app.module.ts");
assert.match(appModule, /LocalImportModule/);
assert.match(appModule, /imports:\s*\[[^\]]*LocalImportModule/);
const server = read("server.js");
assert.doesNotMatch(server, /local-import-postgresql|commit_local_import_v1|backend\/api/);

async function runLocalPrivacyFixture() {
  const secretNote = "LOCAL_ONLY_NOTE_SECRET_8453";
  const trainingSecret = "LOCAL_TRAINING_SECRET_9921";
  const allowedChat = "Denne samtalen skal kunne importeres.";
  const store = new Map(Object.entries({
    aha_chat_sessions_v1: JSON.stringify([{
      id: "chat_session_1",
      title: "Test",
      createdAt: "2026-08-15T04:00:00.000Z",
      updatedAt: "2026-08-15T04:05:00.000Z",
      messages: [{ id: "chat_message_1", role: "user", text: allowedChat, createdAt: "2026-08-15T04:01:00.000Z" }]
    }]),
    aha_source_events_v1: JSON.stringify([{
      id: "source_1",
      source_type: "chat_message",
      source_app: "aha_chat",
      content_type: "text",
      title: "Kilde",
      text: allowedChat,
      created_at: "2026-08-15T04:01:00.000Z"
    }]),
    aha_insight_chamber_v1: JSON.stringify({ insights: [{ id: "insight_1", title: "Innsikt", summary: "Kort oppsummering", text: "Innsiktstekst" }] }),
    aha_concept_lists_v1: JSON.stringify([{ id: "concepts_1", title: "Begreper", type: "concepts", terms: [{ id: "term_1", term: "resonans" }] }]),
    aha_paths_v1: JSON.stringify([{ id: "path_1", title: "Sti", type: "learning", steps: [{ id: "step_1", title: "Les", type: "item", source: "aha_analysis", refId: "insight_1", order: 0 }] }]),
    aha_articles_v1: JSON.stringify([{ id: "article_1", title: "Artikkel", section: "aha", status: "draft", summary: "Sammendrag", body: "Brødtekst", references: [{ id: "ref_1", title: "Innsikt", type: "insight", source: "aha_insights", refId: "insight_1" }] }]),
    aha_notes_v1: JSON.stringify([{ id: "note_1", text: secretNote }]),
    aha_training_corpus_v1: JSON.stringify([{ id: "training_1", text: trainingSecret }])
  }));
  const storage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; }
  };
  const context = {
    window: null,
    globalThis: null,
    localStorage: storage,
    crypto: webcrypto,
    TextEncoder,
    Date,
    JSON,
    Object,
    Array,
    Set,
    Map,
    String,
    Number,
    Boolean,
    console
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(localBuilder, context, { filename: "ahaLocalAccountImport.js" });
  const api = context.AHALocalAccountImport;
  assert.ok(api);

  const preview = await api.buildPreviewFromStorage({ storage, crypto: webcrypto });
  assert.equal(preview.excludedDataUploaded, false);
  assert.equal(preview.requiresExplicitConfirmation, true);
  assert.deepEqual(Array.from(preview.excludedKeysPresent).sort(), ["aha_notes_v1", "aha_training_corpus_v1"].sort());
  assert.equal(preview.counts.conversations, 1);
  assert.equal(preview.counts.messages, 1);
  assert.equal(preview.counts.insights, 1);
  assert.match(JSON.stringify(preview.plan), new RegExp(allowedChat));
  assert.doesNotMatch(JSON.stringify(preview.plan), new RegExp(secretNote));
  assert.doesNotMatch(JSON.stringify(preview.plan), new RegExp(trainingSecret));

  const descriptor = api.confirmationDescriptor(preview);
  const serializedDescriptor = JSON.stringify(descriptor);
  assert.match(descriptor.payloadHash, /^[a-f0-9]{64}$/);
  assert.match(descriptor.planHash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(serializedDescriptor, new RegExp(allowedChat));
  assert.doesNotMatch(serializedDescriptor, new RegExp(secretNote));
  assert.doesNotMatch(serializedDescriptor, new RegExp(trainingSecret));

  const commitPayload = api.buildCommitPayload(preview, "confirmation-token-abcdefghijklmnopqrstuvwxyz", "idem-local-import-1");
  assert.match(JSON.stringify(commitPayload), new RegExp(allowedChat));
  assert.doesNotMatch(JSON.stringify(commitPayload), new RegExp(secretNote));
  assert.doesNotMatch(JSON.stringify(commitPayload), new RegExp(trainingSecret));
}

runLocalPrivacyFixture()
  .then(() => console.log("aha-local-import-postgresql-v1.test.cjs passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
