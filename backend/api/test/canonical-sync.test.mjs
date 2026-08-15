import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { TextEncoder } from "node:util";
import { ApiException } from "../dist/api/api-exception.js";
import { loadCanonicalSyncConfig } from "../dist/sync/sync.config.js";
import { canonicalSyncPayloadBytes, canonicalSyncPayloadHash, canonicalSyncStringify } from "../dist/sync/sync.hash.js";
import { CanonicalSyncRepository } from "../dist/sync/sync.repository.js";
import { CanonicalSyncService } from "../dist/sync/sync.service.js";

const principal = Object.freeze({
  subject: "sync-subject",
  provider: "supabase",
  issuer: "https://issuer.example",
  audience: Object.freeze(["aha-api"])
});

function syncConfig(overrides = {}) {
  return Object.freeze({ enabled: true, defaultLimit: 200, maxLimit: 500, maxPushBytes: 262_144, ...overrides });
}

class FakeSyncRepository {
  calls = [];
  async bootstrap(principalValue, command) {
    this.calls.push({ method: "bootstrap", principal: principalValue, command: structuredClone(command) });
    return { workspaceId: command.workspaceId, highWatermark: 4, objects: [] };
  }
  async pull(principalValue, command) {
    this.calls.push({ method: "pull", principal: principalValue, command: structuredClone(command) });
    return { workspaceId: command.workspaceId, nextCursor: command.afterCursor, changes: [] };
  }
  async push(principalValue, command) {
    this.calls.push({ method: "push", principal: principalValue, command: structuredClone(command) });
    return { status: "synced", objectId: command.objectId, serverRevision: command.baseRevision + 1, idempotentReplay: false };
  }
}

test("canonical sync is fail-closed by default and its limits are bounded", () => {
  const disabled = loadCanonicalSyncConfig({});
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.defaultLimit, 200);
  assert.equal(disabled.maxLimit, 500);
  assert.equal(disabled.maxPushBytes, 262_144);

  assert.throws(() => loadCanonicalSyncConfig({ AHA_CANONICAL_SYNC_ENABLED: "yes" }), /must be true or false/);
  assert.throws(() => loadCanonicalSyncConfig({ AHA_CANONICAL_SYNC_MAX_LIMIT: "501" }), /between 1 and 500/);
  assert.throws(
    () => loadCanonicalSyncConfig({ AHA_CANONICAL_SYNC_MAX_LIMIT: "50", AHA_CANONICAL_SYNC_DEFAULT_LIMIT: "51" }),
    /between 1 and 50/
  );
});

test("browser and NestJS use the same deterministic SHA-256 payload contract", async () => {
  const context = vm.createContext({ window: {}, module: { exports: {} }, exports: {}, console, crypto: webcrypto, TextEncoder, Uint8Array, Array, Object, JSON, Number, String, Boolean });
  const browserHashFile = new URL("../../../js/ahaCanonicalSyncHash.js", import.meta.url);
  vm.runInContext(fs.readFileSync(browserHashFile, "utf8"), context, { filename: "ahaCanonicalSyncHash.js" });
  const browser = context.window.AHACanonicalSyncHash;
  assert.ok(browser);

  const payload = {
    z: 4,
    nested: { beta: [3, { y: true, x: "æøå" }], alpha: null },
    a: "first"
  };
  const reordered = { a: "first", nested: { alpha: null, beta: [3, { x: "æøå", y: true }] }, z: 4 };
  const serverText = canonicalSyncStringify(payload);
  assert.equal(serverText, canonicalSyncStringify(reordered));
  assert.equal(browser.canonicalSyncStringify(payload), serverText);

  const serverHash = canonicalSyncPayloadHash(payload);
  assert.equal(await browser.canonicalSyncPayloadHash(reordered, { crypto: webcrypto, TextEncoder }), serverHash);
  assert.equal(canonicalSyncPayloadHash(null), await browser.canonicalSyncPayloadHash(null, { crypto: webcrypto, TextEncoder }));
  assert.equal(canonicalSyncPayloadBytes(payload), Buffer.byteLength(serverText, "utf8"));
});

test("service verifies hash and size before invoking the sync repository", async () => {
  const repository = new FakeSyncRepository();
  const service = new CanonicalSyncService(syncConfig(), repository);
  const payload = { id: "conversation-1", conversation_type: "personal_ai", title: "A", status: "active", source_app: "aha_chat", metadata: {} };
  const payloadHash = canonicalSyncPayloadHash(payload);

  const result = await service.push(principal, {
    workspaceId: "workspace-1",
    deviceId: "device-1",
    idempotencyKey: "idem-sync-0001",
    objectType: "conversation",
    objectId: "conversation-1",
    operation: "upsert",
    baseRevision: 0,
    payloadHash,
    payload
  });
  assert.equal(result.status, "synced");
  assert.equal(repository.calls.length, 1);
  assert.deepEqual(repository.calls[0].command.payload, payload);

  await assert.rejects(
    service.push(principal, {
      workspaceId: "workspace-1", deviceId: "device-1", idempotencyKey: "idem-sync-0002",
      objectType: "conversation", objectId: "conversation-1", operation: "upsert", baseRevision: 0,
      payloadHash: "0".repeat(64), payload
    }),
    (error) => error instanceof ApiException && error.code === "SYNC_PAYLOAD_HASH_INVALID"
  );
  assert.equal(repository.calls.length, 1, "hash mismatch must fail before repository call");

  const tinyService = new CanonicalSyncService(syncConfig({ maxPushBytes: 8 }), repository);
  await assert.rejects(
    tinyService.push(principal, {
      workspaceId: "workspace-1", deviceId: "device-1", idempotencyKey: "idem-sync-0003",
      objectType: "conversation", objectId: "conversation-1", operation: "upsert", baseRevision: 0,
      payloadHash, payload
    }),
    (error) => error instanceof ApiException && error.code === "SYNC_PAYLOAD_TOO_LARGE"
  );
  assert.equal(repository.calls.length, 1, "oversized payload must fail before repository call");
});

test("delete hash is the canonical JSON null hash and conflicts remain business results", async () => {
  const repository = new FakeSyncRepository();
  repository.push = async function (principalValue, command) {
    this.calls.push({ method: "push", principal: principalValue, command: structuredClone(command) });
    return { status: "conflict", reason: "stale_base_revision", serverRevision: 3, serverState: { id: command.objectId, revision: 3 } };
  };
  const service = new CanonicalSyncService(syncConfig(), repository);
  const nullHash = canonicalSyncPayloadHash(null);
  const result = await service.push(principal, {
    workspaceId: "workspace-1", deviceId: "device-1", idempotencyKey: "idem-delete-0001",
    objectType: "conversation", objectId: "conversation-1", operation: "delete", baseRevision: 2,
    payloadHash: nullHash, payload: null
  });
  assert.equal(result.status, "conflict");
  assert.equal(result.reason, "stale_base_revision");
  assert.equal(repository.calls[0].command.payload, null);

  await assert.rejects(
    service.push(principal, {
      workspaceId: "workspace-1", deviceId: "device-1", idempotencyKey: "idem-delete-0002",
      objectType: "conversation", objectId: "conversation-1", operation: "delete", baseRevision: 2,
      payloadHash: nullHash, payload: { secret: "must not ride on delete" }
    }),
    (error) => error instanceof ApiException && error.code === "SYNC_PAYLOAD_INVALID"
  );
});

test("disabled service and deployment-specific page limit stop before repository access", async () => {
  const repository = new FakeSyncRepository();
  const disabled = new CanonicalSyncService(syncConfig({ enabled: false }), repository);
  await assert.rejects(
    disabled.pull(principal, { workspaceId: "workspace-1", afterCursor: 0, limit: 10 }),
    (error) => error instanceof ApiException && error.code === "CANONICAL_SYNC_DISABLED"
  );
  assert.equal(repository.calls.length, 0);

  const limited = new CanonicalSyncService(syncConfig({ defaultLimit: 25, maxLimit: 50 }), repository);
  await assert.rejects(
    limited.bootstrap(principal, { workspaceId: "workspace-1", limit: 51 }),
    (error) => error instanceof ApiException && error.code === "SYNC_LIMIT_INVALID"
  );
  assert.equal(repository.calls.length, 0);
  await limited.pull(principal, { workspaceId: "workspace-1" });
  assert.equal(repository.calls[0].command.limit, 25);
});

class FakeDatabase {
  calls = [];
  client = {
    query: async (statement, values = []) => {
      this.calls.push({ layer: "sql", statement, values });
      if (statement.includes("bootstrap_sync_snapshot_v1")) return { rows: [{ result: { kind: "bootstrap" } }] };
      if (statement.includes("pull_sync_changes_v1")) return { rows: [{ result: { kind: "pull" } }] };
      if (statement.includes("push_sync_change_v1")) return { rows: [{ result: { kind: "push", status: "synced" } }] };
      return { rows: [] };
    }
  };
  async withReadSession(principalValue, work) {
    this.calls.push({ layer: "session", mode: "read", principal: principalValue });
    return work(this.client);
  }
  async withCommandSession(principalValue, work) {
    this.calls.push({ layer: "session", mode: "command", principal: principalValue });
    return work(this.client);
  }
}

test("repository exposes only bootstrap, pull and push SQL functions with correct session modes", async () => {
  const database = new FakeDatabase();
  const repository = new CanonicalSyncRepository(database);
  await repository.bootstrap(principal, { workspaceId: "w", afterKey: "", highWatermark: null, limit: 10 });
  await repository.pull(principal, { workspaceId: "w", afterCursor: 0, limit: 10 });
  await repository.push(principal, {
    workspaceId: "w", deviceId: "d", idempotencyKey: "idem-1234", objectType: "conversation",
    objectId: "c", operation: "upsert", baseRevision: 0, payloadHash: "a".repeat(64), payload: { id: "c", title: "C" }
  });

  assert.deepEqual(database.calls.filter((call) => call.layer === "session").map((call) => call.mode), ["read", "read", "command"]);
  const statements = database.calls.filter((call) => call.layer === "sql").map((call) => call.statement);
  assert.equal(statements.length, 3);
  assert.match(statements[0], /select aha\.bootstrap_sync_snapshot_v1/);
  assert.match(statements[1], /select aha\.pull_sync_changes_v1/);
  assert.match(statements[2], /select aha\.push_sync_change_v1/);
  assert.equal(statements.some((statement) => /\b(?:insert|update|delete)\b/i.test(statement)), false);
});
