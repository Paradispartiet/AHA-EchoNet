#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const { TextEncoder } = require("node:util");
const { canonicalSyncPayloadHash } = require("../js/ahaCanonicalSyncHash.js");

const API_BASE = String(process.env.AHA_STAGING_SYNC_API_BASE_URL || "http://127.0.0.1:3100").replace(/\/+$/, "");
const TOKEN = String(process.env.AHA_STAGING_SYNC_BEARER_TOKEN || "").trim();
const WORKSPACE_ID = String(process.env.AHA_STAGING_SYNC_WORKSPACE_ID || "aha-staging-sync-e2e-workspace-v1").trim();
const RUN_ID = String(process.env.AHA_STAGING_SYNC_RUN_ID || `local-${Date.now()}`).replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 96);
const DEVICE_ID = `hosted-staging-e2e-${RUN_ID}`.slice(0, 180);
const OBJECT_ID = `hosted-staging-conversation-${RUN_ID}`.slice(0, 180);
const MAX_WAIT_MS = 30_000;

if (!TOKEN) throw new Error("AHA_STAGING_SYNC_BEARER_TOKEN is required");
if (!WORKSPACE_ID) throw new Error("AHA_STAGING_SYNC_WORKSPACE_ID is required");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeRemoteError(status, body) {
  const code = String(body?.error?.code || body?.code || "HTTP_ERROR").slice(0, 120);
  const message = String(body?.error?.message || body?.message || `HTTP ${status}`).slice(0, 240);
  return new Error(`Hosted canonical sync API failure (${status}, ${code}): ${message}`);
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(auth ? { authorization: `Bearer ${TOKEN}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  let parsed;
  try {
    parsed = await response.json();
  } catch {
    throw new Error(`Hosted canonical sync API returned non-JSON HTTP ${response.status}`);
  }
  if (!response.ok) throw sanitizeRemoteError(response.status, parsed);
  assert.equal(typeof parsed, "object", "API response envelope must be an object");
  assert.equal(typeof parsed.data, "object", "API response envelope must contain data");
  return parsed.data;
}

async function waitForHealth() {
  const deadline = Date.now() + MAX_WAIT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API_BASE}/v1/health`, { headers: { accept: "application/json" }, cache: "no-store" });
      if (response.ok) return;
      lastError = new Error(`health HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(`NestJS staging rehearsal API did not become healthy: ${lastError?.message || "timeout"}`);
}

async function hashPayload(value) {
  return canonicalSyncPayloadHash(value, { crypto: webcrypto, TextEncoder });
}

function encodeQuery(input) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  return params.toString();
}

async function bootstrapAll({ highWatermark } = {}) {
  let afterKey = "";
  let pinned = highWatermark ?? null;
  const objects = [];
  let pages = 0;
  while (true) {
    const data = await request(`/v1/sync/bootstrap?${encodeQuery({
      workspaceId: WORKSPACE_ID,
      afterKey,
      highWatermark: pinned,
      limit: 500
    })}`);
    pages += 1;
    const pageWatermark = Number(data.highWatermark);
    assert.ok(Number.isSafeInteger(pageWatermark) && pageWatermark >= 0, "bootstrap highWatermark must be safe non-negative integer");
    if (pinned === null) pinned = pageWatermark;
    assert.equal(pageWatermark, pinned, "bootstrap highWatermark must stay fixed across pages");
    assert.ok(Array.isArray(data.objects), "bootstrap objects must be an array");
    objects.push(...data.objects);
    if (data.hasMore !== true) break;
    const nextKey = String(data.nextKey || "");
    assert.ok(nextKey && nextKey !== afterKey, "bootstrap pagination must make progress");
    afterKey = nextKey;
    assert.ok(pages < 100, "bootstrap pagination exceeded safety limit");
  }
  return { highWatermark: pinned ?? 0, pages, objects };
}

async function pullAll(afterCursor) {
  let cursor = Number(afterCursor || 0);
  const changes = [];
  let highWatermark = cursor;
  let pages = 0;
  while (true) {
    const data = await request(`/v1/sync/pull?${encodeQuery({ workspaceId: WORKSPACE_ID, afterCursor: cursor, limit: 500 })}`);
    pages += 1;
    highWatermark = Number(data.highWatermark);
    const nextCursor = Number(data.nextCursor);
    assert.ok(Number.isSafeInteger(highWatermark) && highWatermark >= cursor, "pull highWatermark must be monotone");
    assert.ok(Number.isSafeInteger(nextCursor) && nextCursor >= cursor, "pull nextCursor must be monotone");
    assert.ok(Array.isArray(data.changes), "pull changes must be an array");
    changes.push(...data.changes);
    if (data.hasMore !== true) return { highWatermark, nextCursor, pages, changes };
    assert.ok(nextCursor > cursor, "pull pagination must make progress");
    cursor = nextCursor;
    assert.ok(pages < 100, "pull pagination exceeded safety limit");
  }
}

async function push({ idempotencyKey, operation, baseRevision, payload, payloadHash }) {
  return request("/v1/sync/push", {
    method: "POST",
    body: {
      workspaceId: WORKSPACE_ID,
      deviceId: DEVICE_ID,
      idempotencyKey,
      objectType: "conversation",
      objectId: OBJECT_ID,
      operation,
      baseRevision,
      payloadHash,
      payload
    }
  });
}

async function main() {
  await waitForHealth();

  const initial = await bootstrapAll();
  assert.equal(initial.objects.some((item) => item.objectType === "conversation" && item.objectId === OBJECT_ID), false, "run-scoped fixture object must not exist before first push");

  const payload = {
    id: OBJECT_ID,
    conversation_type: "personal_ai",
    title: `Hosted staging sync rehearsal ${RUN_ID}`,
    status: "active",
    source_app: "aha_hosted_staging_rehearsal",
    metadata: {
      fixture: "aha_canonical_sync_hosted_staging_rehearsal_v1",
      run_id: RUN_ID
    }
  };
  const payloadHash = await hashPayload(payload);
  assert.match(payloadHash, /^[a-f0-9]{64}$/);

  const upsertBody = {
    idempotencyKey: `e2e:${RUN_ID}:conversation:upsert:v1`,
    operation: "upsert",
    baseRevision: 0,
    payload,
    payloadHash
  };
  const upsert = await push(upsertBody);
  assert.equal(upsert.status, "synced");
  assert.equal(upsert.result, "applied");
  assert.equal(upsert.objectType, "conversation");
  assert.equal(upsert.objectId, OBJECT_ID);
  assert.equal(upsert.operation, "upsert");
  assert.equal(upsert.baseRevision, 0);
  assert.equal(upsert.idempotentReplay, false);
  assert.equal(upsert.serverState?.id, OBJECT_ID);
  assert.equal(upsert.serverState?.title, payload.title);
  assert.match(String(upsert.serverPayloadHash || ""), /^[a-f0-9]{64}$/);
  const firstRevision = Number(upsert.serverRevision);
  const upsertCursor = Number(upsert.cursor);
  assert.ok(Number.isSafeInteger(firstRevision) && firstRevision >= 1);
  assert.ok(Number.isSafeInteger(upsertCursor) && upsertCursor > initial.highWatermark);

  const replay = await push(upsertBody);
  assert.equal(replay.status, "synced");
  assert.equal(replay.idempotentReplay, true, "exact retry must replay the idempotent result");
  assert.equal(Number(replay.serverRevision), firstRevision);
  assert.equal(Number(replay.cursor), upsertCursor);

  const afterUpsert = await pullAll(initial.highWatermark);
  const upsertChange = afterUpsert.changes.find((item) => item.objectType === "conversation" && item.objectId === OBJECT_ID && item.operation === "upsert");
  assert.ok(upsertChange, "delta pull must contain the pushed conversation");
  assert.equal(Number(upsertChange.revision), firstRevision);
  assert.equal(Number(upsertChange.cursor), upsertCursor);
  assert.equal(upsertChange.payload?.title, payload.title);

  const stalePayload = {
    ...payload,
    title: `${payload.title} stale-change`
  };
  const staleHash = await hashPayload(stalePayload);
  const stale = await push({
    idempotencyKey: `e2e:${RUN_ID}:conversation:stale:v1`,
    operation: "upsert",
    baseRevision: 0,
    payload: stalePayload,
    payloadHash: staleHash
  });
  assert.equal(stale.status, "conflict");
  assert.equal(stale.reason, "stale_base_revision");
  assert.equal(Number(stale.serverRevision), firstRevision);
  assert.equal(stale.serverState?.title, payload.title, "stale conflict must expose the current server state without applying client state");
  assert.equal(stale.idempotentReplay, false);

  const nullHash = await hashPayload(null);
  const deletion = await push({
    idempotencyKey: `e2e:${RUN_ID}:conversation:delete:v1`,
    operation: "delete",
    baseRevision: firstRevision,
    payload: null,
    payloadHash: nullHash
  });
  assert.equal(deletion.status, "synced");
  assert.equal(deletion.result, "applied");
  assert.equal(deletion.operation, "delete");
  assert.equal(deletion.serverState, null);
  assert.ok(deletion.deletedAt, "delete must return tombstone timestamp");
  const deleteRevision = Number(deletion.serverRevision);
  const deleteCursor = Number(deletion.cursor);
  assert.ok(Number.isSafeInteger(deleteRevision) && deleteRevision > firstRevision);
  assert.ok(Number.isSafeInteger(deleteCursor) && deleteCursor > upsertCursor);

  const afterDelete = await pullAll(upsertCursor);
  const deleteChange = afterDelete.changes.find((item) => item.objectType === "conversation" && item.objectId === OBJECT_ID && item.operation === "delete");
  assert.ok(deleteChange, "delta pull must contain the tombstone");
  assert.equal(Number(deleteChange.revision), deleteRevision);
  assert.equal(deleteChange.payload, null);
  assert.ok(deleteChange.deletedAt);

  const finalSnapshot = await bootstrapAll();
  const tombstone = finalSnapshot.objects.find((item) => item.objectType === "conversation" && item.objectId === OBJECT_ID);
  assert.ok(tombstone, "bootstrap must retain the deleted canonical object as a tombstone");
  assert.equal(tombstone.operation, "delete");
  assert.equal(Number(tombstone.revision), deleteRevision);
  assert.equal(tombstone.payload, null);
  assert.ok(tombstone.deletedAt);

  // Deliberately log only counts/cursors and run-scoped public fixture ids. No token,
  // server state, payload body, DSN, auth subject or database role is emitted.
  console.log(JSON.stringify({
    status: "PASS",
    fixtureObjectId: OBJECT_ID,
    bootstrapPages: initial.pages + finalSnapshot.pages,
    initialHighWatermark: initial.highWatermark,
    upsertCursor,
    deleteCursor,
    firstRevision,
    deleteRevision,
    pulledAfterUpsert: afterUpsert.changes.length,
    pulledAfterDelete: afterDelete.changes.length,
    staleConflict: stale.reason
  }));
}

main().catch((error) => {
  console.error(`AHA canonical sync hosted staging E2E: FAIL: ${error?.message || error}`);
  process.exitCode = 1;
});
