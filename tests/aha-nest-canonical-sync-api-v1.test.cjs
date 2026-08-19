const assert = require('node:assert/strict');
const fs = require('node:fs');

const openApi = JSON.parse(fs.readFileSync('backend/api/contracts/aha-backend-v1.openapi.json', 'utf8'));
const appModule = fs.readFileSync('backend/api/src/app.module.ts', 'utf8');
const config = fs.readFileSync('backend/api/src/sync/sync.config.ts', 'utf8');
const dto = fs.readFileSync('backend/api/src/sync/sync.dto.ts', 'utf8');
const service = fs.readFileSync('backend/api/src/sync/sync.service.ts', 'utf8');
const repository = fs.readFileSync('backend/api/src/sync/sync.repository.ts', 'utf8');
const controller = fs.readFileSync('backend/api/src/sync/sync.controller.ts', 'utf8');
const hashBrowser = fs.readFileSync('js/ahaCanonicalSyncHash.js', 'utf8');
const hashServer = fs.readFileSync('backend/api/src/sync/sync.hash.ts', 'utf8');
const docs = fs.readFileSync('docs/AHA_CANONICAL_SYNC_API_V1.md', 'utf8');

assert.match(appModule, /CanonicalSyncModule/);
assert.match(config, /AHA_CANONICAL_SYNC_ENABLED/);
assert.match(config, /const enabled = bool\(env\.AHA_CANONICAL_SYNC_ENABLED/);
assert.match(config, /AHA_CANONICAL_SYNC_PILOT_PROFILE_ID/);
assert.match(config, /AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON/);
assert.match(config, /MAX_PRODUCTION_PILOT_PROFILES = 10/);
assert.match(config, /required when canonical sync is enabled/);
assert.match(config, /must not contain duplicate profile IDs/);
assert.match(config, /legacy production pilot profile must remain present/i);
assert.match(config, /pilotProfileId:\s*allowedProfileIds\[0\]\s*\|\|\s*null/);
assert.match(config, /allowedProfileIds,/);
assert.match(config, /allowedProfileCount:\s*allowedProfileIds\.length/);
assert.match(config, /262_144/);
assert.match(dto, /Number\.MAX_SAFE_INTEGER/);
assert.match(dto, /CANONICAL_SYNC_OBJECT_TYPES/);
assert.match(dto, /\^\[a-f0-9\]\{64\}\$/);

assert.match(controller, /@Controller\("v1\/sync"\)/);
assert.match(controller, /@Get\("bootstrap"\)/);
assert.match(controller, /@Get\("pull"\)/);
assert.match(controller, /@Post\("push"\)/);
assert.doesNotMatch(controller, /@(?:Put|Patch|Delete)\(/);

assert.match(service, /canonicalSyncPayloadHash\(payload\)/);
assert.match(service, /canonicalSyncPayloadBytes\(payload\)/);
assert.match(service, /SYNC_PAYLOAD_HASH_INVALID/);
assert.match(service, /SYNC_PAYLOAD_TOO_LARGE/);
assert.match(service, /CANONICAL_SYNC_DISABLED/);
assert.match(service, /assertEnabledForPilot\(principal\)/);
assert.match(service, /principal\.subject/);
assert.match(service, /config\.allowedProfileIds\.includes\(subject\)/);
assert.match(service, /CANONICAL_SYNC_PILOT_FORBIDDEN/);
assert.match(service, /ApiException\(403/);
assert.match(service, /body\.operation === "delete" && body\.payload != null/);

assert.match(repository, /withReadSession/);
assert.match(repository, /withCommandSession/);
assert.match(repository, /select aha\.bootstrap_sync_snapshot_v1/);
assert.match(repository, /select aha\.pull_sync_changes_v1/);
assert.match(repository, /select aha\.push_sync_change_v1/);
assert.doesNotMatch(repository, /\b(?:insert\s+into|update\s+aha\.|delete\s+from)\b/i);

for (const source of [hashBrowser, hashServer]) {
  assert.match(source, /SHA-256|sha256/i);
  assert.match(source, /Object\.keys/);
  assert.match(source, /\.sort\(\)/);
}
assert.doesNotMatch(hashBrowser, /\bfetch\s*\(/);
assert.doesNotMatch(hashBrowser, /XMLHttpRequest|WebSocket|sendBeacon/);
assert.doesNotMatch(hashBrowser, /localStorage\s*\.|indexedDB\s*\./);
assert.match(hashBrowser, /loginTriggersSync:\s*false/);
assert.match(hashBrowser, /deletePayload:\s*null/);

const syncPaths = Object.entries(openApi.paths)
  .filter(([path]) => path.startsWith('/v1/sync/'))
  .map(([path, methods]) => [path, Object.keys(methods).sort()]);
assert.deepEqual(syncPaths, [
  ['/v1/sync/bootstrap', ['get']],
  ['/v1/sync/pull', ['get']],
  ['/v1/sync/push', ['post']]
]);
assert.match(openApi.paths['/v1/sync/push'].post.description, /recomputes SHA-256/i);
assert.match(openApi.paths['/v1/sync/push'].post.description, /data\.status is conflict/i);
assert.equal(openApi.components.schemas.SyncPushRequest.properties.payloadHash.pattern, '^[a-f0-9]{64}$');
assert.equal(openApi.components.schemas.CanonicalSyncObjectType.enum.length, 10);
assert.equal(openApi.components.schemas.CanonicalSyncObjectType.enum.includes('note'), false);

assert.match(docs, /AHA_CANONICAL_SYNC_ENABLED=false/);
assert.match(docs, /Login aktiverer aldri|Innlogging alene starter aldri/i);
assert.match(docs, /Local-only områder er eksplisitt utenfor/i);
assert.match(docs, /stale_base_revision/);
assert.match(docs, /server_tombstone/);
assert.match(docs, /konverterer ikke legacy `syncFromDatabase\(\)` til canonical sync/i);

console.log('aha-nest-canonical-sync-api-v1.test.cjs passed');
