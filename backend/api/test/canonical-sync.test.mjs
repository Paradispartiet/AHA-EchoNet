import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { TextEncoder } from "node:util";
import { ApiException } from "../dist/api/api-exception.js";
import { loadCanonicalSyncConfig, MAX_PRODUCTION_PILOT_PROFILES } from "../dist/sync/sync.config.js";
import { canonicalSyncPayloadBytes, canonicalSyncPayloadHash, canonicalSyncStringify } from "../dist/sync/sync.hash.js";
import { CanonicalSyncRepository } from "../dist/sync/sync.repository.js";
import { CanonicalSyncService } from "../dist/sync/sync.service.js";

const PILOT_SUBJECT = "11111111-1111-4111-8111-111111111111";
const SECOND_PILOT_SUBJECT = "22222222-2222-4222-8222-222222222222";
const THIRD_SUBJECT = "33333333-3333-4333-8333-333333333333";
const principal = Object.freeze({
  subject: PILOT_SUBJECT,
  provider: "supabase",
  issuer: "https://issuer.example",
  audience: Object.freeze(["aha-api"])
});

function syncConfig(overrides = {}) {
  return Object.freeze({
    enabled: true,
    pilotProfileId: PILOT_SUBJECT,
    allowedProfileIds: Object.freeze([PILOT_SUBJECT]),
    allowedProfileCount: 1,
    defaultLimit: 200,
    maxLimit: 500,
    maxPushBytes: 262_144,
    ...overrides
  });
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

test("canonical sync is fail-closed by default and its limits and protected allowlist are bounded", () => {
  const disabled = loadCanonicalSyncConfig({});
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.pilotProfileId, null);
  assert.deepEqual(disabled.allowedProfileIds, []);
  assert.equal(disabled.allowedProfileCount, 0);
  assert.equal(disabled.defaultLimit, 200);
  assert.equal(disabled.maxLimit, 500);
  assert.equal(disabled.maxPushBytes, 262_144);
  assert.equal(MAX_PRODUCTION_PILOT_PROFILES, 10);

  assert.throws(() => loadCanonicalSyncConfig({ AHA_CANONICAL_SYNC_ENABLED: "yes" }), /must be true or false/);
  assert.throws(
    () => loadCanonicalSyncConfig({ AHA_CANONICAL_SYNC_ENABLED: "true" }),
    /required when canonical sync is enabled/
  );
  assert.throws(
    () => loadCanonicalSyncConfig({ AHA_CANONICAL_SYNC_ENABLED: "true", AHA_CANONICAL_SYNC_PILOT_PROFILE_ID: "not-a-uuid" }),
    /must be a UUID/
  );

  const enabledLegacy = loadCanonicalSyncConfig({
    AHA_CANONICAL_SYNC_ENABLED: "true",
    AHA_CANONICAL_SYNC_PILOT_PROFILE_ID: PILOT_SUBJECT
  });
  assert.equal(enabledLegacy.enabled, true);
  assert.equal(enabledLegacy.pilotProfileId, PILOT_SUBJECT);
  assert.deepEqual(enabledLegacy.allowedProfileIds, [PILOT_SUBJECT]);
  assert.equal(enabledLegacy.allowedProfileCount, 1);

  const enabledAllowlist = loadCanonicalSyncConfig({
    AHA_CANONICAL_SYNC_ENABLED: "true",
    AHA_CANONICAL_SYNC_PILOT_PROFILE_ID: PILOT_SUBJECT,
    AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON: JSON.stringify([PILOT_SUBJECT, SECOND_PILOT_SUBJECT])
  });
  assert.equal(enabledAllowlist.pilotProfileId, PILOT_SUBJECT);
  assert.deepEqual(enabledAllowlist.allowedProfileIds, [PILOT_SUBJECT, SECOND_PILOT_SUBJECT]);
  assert.equal(enabledAllowlist.allowedProfileCount, 2);

  assert.throws(
    () => loadCanonicalSyncConfig({
      AHA_CANONICAL_SYNC_ENABLED: "true",
      AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON: "not-json"
    }),
    /JSON array of UUIDs/
  );
  assert.throws(
    () => loadCanonicalSyncConfig({
      AHA_CANONICAL_SYNC_ENABLED: "true",
      AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON: JSON.stringify([PILOT_SUBJECT, PILOT_SUBJECT])
    }),
    /must not contain duplicate/
  );
  assert.throws(
    () => loadCanonicalSyncConfig({
      AHA_CANONICAL_SYNC_ENABLED: "true",
      AHA_CANONICAL_SYNC_PILOT_PROFILE_ID: PILOT_SUBJECT,
      AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON: JSON.stringify([SECOND_PILOT_SUBJECT])
    }),
    /legacy production pilot profile must remain present/
  );
  assert.throws(
    () => loadCanonicalSyncConfig({
      AHA_CANONICAL_SYNC_ENABLED: "true",
      AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON: JSON.stringify(
        Array.from({ length: 11 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`)
      )
    }),
    /between 1 and 10 profile IDs/
  );

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

test("disabled, unauthorized identities and deployment-specific page limits stop before repository access", async () => {
  const repository = new FakeSyncRepository();
  const disabled = new CanonicalSyncService(syncConfig({ enabled: false }), repository);
  await assert.rejects(
    disabled.pull(principal, { workspaceId: "workspace-1", afterCursor: 0, limit: 10 }),
    (error) => error instanceof ApiException && error.code === "CANONICAL_SYNC_DISABLED"
  );
  assert.equal(repository.calls.length, 0);

  const secondPilot = Object.freeze({ ...principal, subject: SECOND_PILOT_SUBJECT });
  const third = Object.freeze({ ...principal, subject: THIRD_SUBJECT });
  const expandedPilot = new CanonicalSyncService(
    syncConfig({
      allowedProfileIds: Object.freeze([PILOT_SUBJECT, SECOND_PILOT_SUBJECT]),
      allowedProfileCount: 2
    }),
    repository
  );
  await expandedPilot.pull(secondPilot, { workspaceId: "workspace-2", afterCursor: 0, limit: 10 });
  assert.equal(repository.calls.length, 1, "second protected pilot identity should reach repository boundary");
  repository.calls.length = 0;

  await assert.rejects(
    expandedPilot.pull(third, { workspaceId: "workspace-3", afterCursor: 0, limit: 10 }),
    (error) => error instanceof ApiException && error.code === "CANONICAL_SYNC_PILOT_FORBIDDEN" && error.getStatus() === 403
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
