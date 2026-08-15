const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const requiredFiles = [
  "js/ahaCanonicalFrontendSyncAdapter.js",
  "js/ahaCanonicalSyncHash.js",
  "js/ahaCanonicalSyncStore.js",
  "js/ahaLocalAccountImport.js",
  "docs/AHA_CANONICAL_FRONTEND_SYNC_ADAPTER_V1.md",
  "supabase/migrations/20260815125000_aha_canonical_sync_write_helpers_v1.sql",
  "supabase/migrations/20260815125100_aha_canonical_sync_push_v1.sql"
];
for (const relative of requiredFiles) assert.equal(fs.existsSync(relative), true, `${relative} mangler`);

const adapterSource = fs.readFileSync("js/ahaCanonicalFrontendSyncAdapter.js", "utf8");
assert.match(adapterSource, /aha_canonical_frontend_sync_adapter_v1/);
assert.match(adapterSource, /AHALocalAccountImport/);
assert.match(adapterSource, /AHACanonicalSyncHash/);
assert.match(adapterSource, /AHACanonicalSyncStore/);
assert.doesNotMatch(adapterSource, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
assert.doesNotMatch(adapterSource, /syncFromDatabase\s*\(/);
assert.doesNotMatch(adapterSource, /(?:login|auth|session)[\s\S]{0,100}(?:enqueue|prepareSnapshot|enqueueSnapshot)\s*\(/i);

const context = {
  window: null,
  globalThis: null,
  crypto: webcrypto,
  TextEncoder,
  Date,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  RegExp,
  Error,
  Promise,
  Map,
  Set,
  console
};
context.window = context;
context.globalThis = context;
for (const relative of [
  "js/ahaCanonicalSyncHash.js",
  "js/ahaCanonicalSyncStore.js",
  "js/ahaLocalAccountImport.js",
  "js/ahaCanonicalFrontendSyncAdapter.js"
]) {
  vm.runInNewContext(fs.readFileSync(relative, "utf8"), context, { filename: relative });
}

const api = context.AHACanonicalFrontendSyncAdapter;
const hash = context.AHACanonicalSyncHash;
const canonicalStore = context.AHACanonicalSyncStore;
assert.ok(api);
assert.ok(hash);
assert.ok(canonicalStore);

const expectedTypes = [
  "conversation", "message", "source_event", "insight", "concept_list",
  "concept_list_item", "knowledge_path", "knowledge_path_step", "article", "article_reference"
];
const status = api.getStatus();
assert.equal(status.networkEnabled, false);
assert.equal(status.autoSync, false);
assert.equal(status.loginTriggersSync, false);
assert.equal(status.requiresExplicitUserAction, true);
assert.equal(status.legacySyncRoutesUsed, false);
assert.deepEqual(Array.from(status.canonicalObjectTypes), expectedTypes);

const localOnlySecret = "LOCAL_ONLY_SECRET_MUST_NEVER_SYNC_9371";
const snapshot = {
  aha_chat_sessions_v1: [{
    id: "chat_local_text_id_1",
    title: "Adapter-test",
    createdAt: "2026-08-15T10:00:00.000Z",
    messages: [{ id: "message_local_text_id_1", role: "user", text: "Hei AHA", createdAt: "2026-08-15T10:01:00.000Z" }]
  }],
  aha_source_events_v1: [{
    id: "source_local_text_id_1",
    conversationId: "chat_local_text_id_1",
    messageId: "message_local_text_id_1",
    sourceType: "chat_message",
    sourceApp: "aha_chat",
    contentType: "text",
    title: "Kilde",
    sourceText: "Hei AHA",
    occurredAt: "2026-08-15T10:01:00.000Z"
  }],
  aha_insight_chamber_v1: { insights: [{
    id: "insight_local_text_id_1",
    sourceEventId: "source_local_text_id_1",
    title: "Innsikt",
    summary: "Kort sammendrag",
    text: "Presis innsiktstekst",
    confidence: 0.82
  }] },
  aha_concept_lists_v1: [{
    id: "list_local_text_id_1",
    title: "Begreper",
    type: "concepts",
    terms: [{ id: "item_local_text_id_1", term: "resonans" }]
  }],
  aha_paths_v1: [{
    id: "path_local_text_id_1",
    title: "Sti",
    type: "learning",
    steps: [{ id: "step_local_text_id_1", title: "Les", type: "item", source: "aha_analysis", refId: "insight_local_text_id_1", order: 0 }]
  }],
  aha_articles_v1: [{
    id: "article_local_text_id_1",
    title: "Artikkel",
    section: "aha",
    status: "draft",
    summary: "Sammendrag",
    body: "Brødtekst",
    references: [{ id: "reference_local_text_id_1", title: "Innsikt", type: "insight", source: "aha_insights", refId: "insight_local_text_id_1" }]
  }],
  aha_notes_v1: [{ id: "note-secret", text: localOnlySecret }],
  aha_gallery_v1: [{ id: "gallery-secret", caption: localOnlySecret }],
  aha_music_library_v1: [{ id: "music-secret", title: localOnlySecret }],
  aha_training_corpus_v1: [{ id: "training-secret", text: localOnlySecret }]
};

async function run() {
  const events = await api.prepareSnapshot(snapshot, {
    workspaceId: "workspace-personal-1",
    deviceId: "device-browser-1",
    baseRevisions: { "message:message_local_text_id_1": 7 },
    hash,
    store: canonicalStore,
    localModels: context.AHALocalAccountImport,
    now: new Date("2026-08-15T12:00:00.000Z")
  });

  assert.equal(events.length, 10);
  assert.deepEqual(Array.from(events, (event) => event.objectType), expectedTypes);
  assert.equal(events[1].baseRevision, 7);
  assert.equal(events[0].objectId, "chat_local_text_id_1", "text IDs must remain valid; adapter must not invent a UUID requirement");
  assert.doesNotMatch(JSON.stringify(events), new RegExp(localOnlySecret));
  assert.ok(events.every((event) => /^[a-f0-9]{64}$/.test(event.payloadHash)));
  for (let index = 1; index < events.length; index += 1) {
    assert.ok(events[index - 1].createdAt < events[index].createdAt, "dependency order must be stable in the outbox");
  }

  const conversation = events[0].payload;
  assert.equal(conversation.conversation_type, "personal_ai");
  assert.equal(conversation.source_app, "aha_chat");
  assert.equal(Object.prototype.hasOwnProperty.call(conversation, "workspace_id"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(conversation, "created_by_profile_id"), false);

  const insight = events.find((event) => event.objectType === "insight").payload;
  assert.equal(insight.sharing_scope, "private");
  assert.equal(insight.version.title, "Innsikt");
  assert.equal(insight.version.insight_text, "Presis innsiktstekst");
  assert.equal(insight.version.confidence, 0.82);

  const article = events.find((event) => event.objectType === "article").payload;
  assert.equal(article.publication_scope, "personal");
  assert.equal(article.version.title, "Artikkel");
  assert.equal(article.version.body, "Brødtekst");

  const deletion = await api.prepareRecord("article", {
    id: "article_local_text_id_1",
    deletedAt: "2026-08-15T11:00:00.000Z"
  }, {
    workspaceId: "workspace-personal-1",
    deviceId: "device-browser-1",
    baseRevision: 4,
    hash,
    store: canonicalStore
  });
  assert.equal(deletion.operation, "delete");
  assert.equal(deletion.payload, null);
  assert.equal(deletion.payloadHash, await hash.canonicalSyncPayloadHash(null), "delete must use canonical SHA-256 of null");

  assert.throws(() => api.toCanonicalPayload("article", {
    id: "article-shared",
    title: "Ikke privat",
    section: "aha",
    status: "draft",
    publicationScope: "public_candidate",
    summary: "Skal avvises"
  }, { store: canonicalStore }), /only accepts personal/);

  assert.throws(() => api.toCanonicalPayload("concept_list", {
    id: "list-shared",
    title: "Ikke privat",
    listType: "concepts",
    sharingScope: "workspace"
  }, { store: canonicalStore }), /only accepts private/);

  assert.throws(() => api.toCanonicalPayload("article_reference", {
    id: "reference-bad",
    articleId: "article_local_text_id_1",
    title: "Mangler ref",
    referenceType: "insight",
    source: "aha_insights"
  }, { store: canonicalStore }), /ref_id is required/);

  const projected = api.toCanonicalPayload("conversation", {
    id: "projection-1",
    title: "Projection",
    workspace_id: "SERVER_OWNED_MUST_DROP",
    created_by_profile_id: "SERVER_OWNED_MUST_DROP",
    arbitrarySecret: localOnlySecret
  }, { store: canonicalStore });
  assert.doesNotMatch(JSON.stringify(projected), /SERVER_OWNED_MUST_DROP/);
  assert.doesNotMatch(JSON.stringify(projected), new RegExp(localOnlySecret));

  let enqueueCount = 0;
  const enqueueStore = {
    assertSyncableObjectType: canonicalStore.assertSyncableObjectType,
    normalizeOutboxEvent: canonicalStore.normalizeOutboxEvent,
    async enqueue(event) { enqueueCount += 1; return event; }
  };
  const localPlan = context.AHALocalAccountImport.buildPlan(snapshot);
  const invalidPlan = {
    ...localPlan,
    articleReferences: [{
      id: "reference-bad-preflight",
      articleId: "article_local_text_id_1",
      title: "Mangler ref",
      referenceType: "insight",
      source: "aha_insights",
      refId: null
    }]
  };
  await assert.rejects(() => api.enqueuePlan(invalidPlan, {
    workspaceId: "workspace-personal-1",
    deviceId: "device-browser-1",
    hash,
    store: enqueueStore
  }), /ref_id is required/);
  assert.equal(enqueueCount, 0, "whole plan must preflight before the first IndexedDB outbox write");

  await api.enqueuePlan(localPlan, {
    workspaceId: "workspace-personal-1",
    deviceId: "device-browser-1",
    hash,
    store: enqueueStore
  });
  assert.equal(enqueueCount, 10);

  console.log("aha-canonical-frontend-sync-adapter-v1.test.cjs passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
