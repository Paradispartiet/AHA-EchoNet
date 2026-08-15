import assert from "node:assert/strict";
import test from "node:test";
import { ApiException } from "../dist/api/api-exception.js";
import { LocalImportConfirmationService } from "../dist/local-imports/local-import-confirmation.service.js";
import { loadLocalImportConfig } from "../dist/local-imports/local-import.config.js";
import { sha256Hex } from "../dist/local-imports/local-import.hash.js";
import { validateLocalImportPlan } from "../dist/local-imports/local-import.plan.js";
import { LocalImportService } from "../dist/local-imports/local-import.service.js";
import { CanonicalDatabaseService } from "../dist/database/canonical-database.service.js";
import { CanonicalDatabaseError } from "../dist/database/database.errors.js";

const principal = Object.freeze({
  subject: "subject-import-123",
  provider: "supabase",
  issuer: "https://issuer.example",
  audience: Object.freeze(["aha-api"])
});

function importConfig(overrides = {}) {
  return Object.freeze({
    enabled: true,
    confirmationSecret: "confirmation-secret-that-is-definitely-longer-than-32-characters",
    confirmationTtlSeconds: 600,
    policyVersion: "aha_account_import_v1",
    maxObjects: 25_000,
    ...overrides
  });
}

function emptyPlan(overrides = {}) {
  return {
    version: "aha_local_import_plan_v1",
    sourceKind: "aha_local_backup",
    sourceVersion: "v1",
    conversations: [],
    messages: [],
    sourceEvents: [],
    insights: [],
    conceptLists: [],
    conceptListItems: [],
    knowledgePaths: [],
    knowledgePathSteps: [],
    articles: [],
    articleReferences: [],
    ...overrides
  };
}

function countsFor(plan) {
  const keys = [
    "conversations", "messages", "sourceEvents", "insights", "conceptLists",
    "conceptListItems", "knowledgePaths", "knowledgePathSteps", "articles", "articleReferences"
  ];
  const counts = Object.fromEntries(keys.map((key) => [key, plan[key].length]));
  counts.total = keys.reduce((sum, key) => sum + counts[key], 0);
  return counts;
}

class FakeImportRepository {
  calls = [];
  async commit(principalValue, command) {
    this.calls.push({ principal: principalValue, command: structuredClone(command) });
    return {
      importBatchId: "batch-1",
      workspaceId: "workspace-1",
      consentReceiptId: "consent-1",
      status: "completed",
      previewCounts: countsFor(command.plan),
      resultCounts: { imported: countsFor(command.plan).total, duplicate: 0, rejected: 0, local_only_uploaded: 0, total: countsFor(command.plan).total },
      idempotentReplay: false
    };
  }
}

test("local import is explicitly disabled by default and needs a long confirmation secret", () => {
  const disabled = loadLocalImportConfig({ NODE_ENV: "test" });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.confirmationSecret, null);

  assert.throws(
    () => loadLocalImportConfig({ AHA_LOCAL_IMPORT_ENABLED: "true", AHA_IMPORT_CONFIRMATION_SECRET: "short" }),
    /at least 32 characters/
  );

  const enabled = loadLocalImportConfig({
    AHA_LOCAL_IMPORT_ENABLED: "true",
    AHA_IMPORT_CONFIRMATION_SECRET: "x".repeat(40),
    AHA_IMPORT_CONFIRMATION_TTL_SECONDS: "300"
  });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.confirmationTtlSeconds, 300);
});

test("confirmation contains no import data and is bound to principal, hashes and exact counts", () => {
  const config = importConfig();
  const confirmations = new LocalImportConfirmationService(config);
  const plan = emptyPlan({ conversations: [{ id: "conversation-1", title: "Sensitive but allowed chat" }] });
  const counts = countsFor(plan);
  const payloadHash = "a".repeat(64);
  const planHash = sha256Hex(plan);
  const repository = new FakeImportRepository();
  const service = new LocalImportService(config, confirmations, repository);

  const response = service.createConfirmation(principal, {
    sourceKind: "aha_local_backup",
    sourceVersion: "v1",
    payloadHash,
    planHash,
    counts
  });

  assert.equal(response.dataUploaded, false);
  assert.equal(response.nextAction, "show_exact_local_preview_then_require_user_confirmation");
  assert.match(response.confirmationToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(JSON.stringify(response), /Sensitive but allowed chat/);

  const verified = confirmations.verify(principal, response.confirmationToken, {
    sourceKind: "aha_local_backup",
    sourceVersion: "v1",
    payloadHash,
    planHash,
    counts
  });
  assert.equal(verified.purpose, "account_import");
  assert.equal(verified.subject, principal.subject);
  assert.equal(verified.provider, principal.provider);

  assert.throws(
    () => confirmations.verify({ ...principal, subject: "someone-else" }, response.confirmationToken, {
      sourceKind: "aha_local_backup",
      sourceVersion: "v1",
      payloadHash,
      planHash,
      counts
    }),
    (error) => error instanceof ApiException && error.code === "IMPORT_CONFIRMATION_INVALID"
  );
  assert.throws(
    () => confirmations.verify(principal, response.confirmationToken, {
      sourceKind: "aha_local_backup",
      sourceVersion: "v1",
      payloadHash,
      planHash,
      counts: { ...counts, total: counts.total + 1 }
    }),
    (error) => error instanceof ApiException && error.code === "IMPORT_CONFIRMATION_INVALID"
  );
});

test("commit re-hashes the exact canonical plan before invoking the repository", async () => {
  const config = importConfig();
  const confirmations = new LocalImportConfirmationService(config);
  const repository = new FakeImportRepository();
  const service = new LocalImportService(config, confirmations, repository);
  const plan = emptyPlan({
    conversations: [{ id: "conversation-1", title: "AHA Chat session" }],
    messages: [{ id: "message-1", conversationId: "conversation-1", role: "user", content: "Hei AHA" }]
  });
  const counts = countsFor(plan);
  const payloadHash = "b".repeat(64);
  const planHash = sha256Hex(plan);
  const confirmation = service.createConfirmation(principal, {
    sourceKind: "aha_local_backup",
    sourceVersion: "v1",
    payloadHash,
    planHash,
    counts
  });

  const result = await service.commit(principal, {
    sourceKind: "aha_local_backup",
    sourceVersion: "v1",
    payloadHash,
    planHash,
    idempotencyKey: "idem-import-12345",
    confirmationToken: confirmation.confirmationToken,
    plan
  });

  assert.equal(repository.calls.length, 1);
  assert.equal(repository.calls[0].command.planHash, planHash);
  assert.equal(repository.calls[0].command.payloadHash, payloadHash);
  assert.equal(repository.calls[0].command.policyVersion, "aha_account_import_v1");
  assert.equal(result.status, "completed");
  assert.equal(result.planHash, planHash);

  const changedPlan = structuredClone(plan);
  changedPlan.messages[0].content = "Endret etter preview";
  await assert.rejects(
    service.commit(principal, {
      sourceKind: "aha_local_backup",
      sourceVersion: "v1",
      payloadHash,
      planHash,
      idempotencyKey: "idem-import-12346",
      confirmationToken: confirmation.confirmationToken,
      plan: changedPlan
    }),
    (error) => error instanceof ApiException && error.code === "IMPORT_PLAN_CHANGED"
  );
  assert.equal(repository.calls.length, 1);
});

test("plan validation rejects unknown roots, empty message content and broken child references", () => {
  assert.throws(
    () => validateLocalImportPlan({ ...emptyPlan(), localOnlyData: [{ secret: true }] }, 100),
    (error) => error instanceof ApiException && error.code === "IMPORT_PLAN_INVALID"
  );

  assert.throws(
    () => validateLocalImportPlan(emptyPlan({ messages: [{ id: "m1", conversationId: "c1", content: "" }] }), 100),
    (error) => error instanceof ApiException && error.code === "IMPORT_PLAN_INVALID"
  );

  assert.throws(
    () => validateLocalImportPlan(emptyPlan({ articleReferences: [{ id: "r1", articleId: "a1", title: "Ref", refId: "" }] }), 100),
    (error) => error instanceof ApiException && error.code === "IMPORT_PLAN_INVALID"
  );
});

class FakeDatabaseClient {
  queries = [];
  safety = {
    row_security_on: true,
    bypasses_rls: false,
    can_assume_table_owner: false,
    profiles_table_present: true,
    schema_versions_table_present: true
  };
  async query(statement, values = []) {
    this.queries.push({ statement, values: [...values] });
    if (statement.includes("current_setting('row_security')")) return { rows: [this.safety], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }
  release() {}
}

class FakeConnections {
  configured = true;
  constructor(client) { this.client = client; }
  async connect() { return this.client; }
  async end() {}
}

function databaseConfig() {
  return Object.freeze({
    enabled: true,
    connectionString: "postgresql://user:secret@db.example/aha",
    sslMode: "verify-full",
    poolMax: 4,
    connectionTimeoutMs: 5000,
    idleTimeoutMs: 30000,
    statementTimeoutMs: 8000,
    lockTimeoutMs: 2000,
    applicationName: "aha-nest-api"
  });
}

test("command sessions keep JWT/RLS safety but are not read-only", async () => {
  const client = new FakeDatabaseClient();
  const database = new CanonicalDatabaseService(databaseConfig(), new FakeConnections(client));
  const result = await database.withCommandSession(principal, async (session) => {
    await session.query("select aha.commit_local_import_v1($1)", ["opaque"]);
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(client.queries[0].statement, "begin");
  assert.equal(client.queries.some((entry) => entry.statement === "set transaction read only"), false);
  assert.match(client.queries[1].statement, /set_config\('request\.jwt\.claims'/);
  assert.match(client.queries.at(-1).statement, /^commit$/);

  const unsafeClient = new FakeDatabaseClient();
  unsafeClient.safety = { ...unsafeClient.safety, bypasses_rls: true };
  const unsafeDatabase = new CanonicalDatabaseService(databaseConfig(), new FakeConnections(unsafeClient));
  let called = false;
  await assert.rejects(
    unsafeDatabase.withCommandSession(principal, async () => { called = true; }),
    (error) => error instanceof CanonicalDatabaseError && error.code === "DATABASE_UNSAFE_RUNTIME_ROLE"
  );
  assert.equal(called, false);
  assert.equal(unsafeClient.queries.some((entry) => entry.statement === "rollback"), true);
});
