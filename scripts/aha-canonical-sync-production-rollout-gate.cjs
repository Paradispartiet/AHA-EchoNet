#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const POLICY_PATH = path.join(ROOT, "ops/canonical-sync-production-rollout-v1.json");
const EXPECTED_TYPES = [
  "conversation",
  "message",
  "source_event",
  "insight",
  "concept_list",
  "concept_list_item",
  "knowledge_path",
  "knowledge_path_step",
  "article",
  "article_reference"
];

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function text(value) {
  return String(value ?? "").trim();
}

function sameArray(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((item, index) => item === right[index]);
}

function validateOrigin(value) {
  const raw = text(value);
  let parsed;
  try { parsed = new URL(raw); }
  catch { fail("AHA_PRODUCTION_API_ORIGIN must be an absolute URL"); }
  if (parsed.protocol !== "https:") fail("AHA_PRODUCTION_API_ORIGIN must use HTTPS");
  if (parsed.username || parsed.password || parsed.search || parsed.hash) fail("AHA_PRODUCTION_API_ORIGIN must be a clean origin");
  if (parsed.pathname !== "/" && parsed.pathname !== "") fail("AHA_PRODUCTION_API_ORIGIN must not include a path");
  if (parsed.hostname.endsWith("onrender.com")) fail("production canonical API must not use the tactical Render staging platform");
  if (parsed.origin === "https://paradispartiet.github.io") fail("production canonical API must use a separate backend origin");
  return parsed.origin;
}

function contract() {
  if (!fs.existsSync(POLICY_PATH)) fail("production rollout policy is missing");
  const policy = readJson(POLICY_PATH);
  if (policy.version !== "aha_canonical_sync_production_rollout_v1") fail("unexpected production rollout policy version");
  if (policy.productionActivationEnabled !== false || policy.activation?.enabled !== false) fail("production activation must remain disabled in the rollout-gate contract");
  if (policy.status !== "blocked_until_remote_readiness") fail("rollout policy must remain blocked until remote readiness passes");

  if (policy.hosting?.target !== "azure_container_apps") fail("ADR-006 requires Azure Container Apps as the production hosting target");
  if (policy.hosting?.renderProductionAllowed !== false) fail("Render must remain staging-only for canonical sync");
  if (policy.hosting?.infrastructureAsCodeRequired !== true) fail("production infrastructure must be reconstructable from IaC");

  if (policy.database?.target !== "dedicated_production_postgresql") fail("production requires a dedicated PostgreSQL target");
  if (policy.database?.stagingReuseAllowed !== false || policy.database?.legacyPrimaryReuseAllowed !== false) fail("staging/legacy primary databases must never be reused for canonical production");
  if (policy.database?.tlsMode !== "verify-full") fail("production database TLS must be verify-full");
  if (policy.database?.runtimeRole !== "aha_canonical_production_runtime") fail("unexpected production runtime role");
  if (policy.database?.runtimeRoleMustStartNoLogin !== true || policy.database?.adminCredentialInRuntimeAllowed !== false) fail("production runtime role boundary is not fail-closed");

  const privateReadiness = policy.privateDatabaseReadiness || {};
  if (privateReadiness.githubEnvironment !== "aha-canonical-production-infra") fail("private database readiness must use the protected production infrastructure environment");
  if (privateReadiness.executionBoundary !== "production_vnet") fail("private database readiness must execute inside the production VNet");
  if (privateReadiness.verificationMode !== "verify_restore") fail("private database readiness must use the read-only verify_restore mode");
  if (privateReadiness.liveSyncMustRemainDisabled !== true) fail("private database readiness must re-prove canonical sync disabled");
  if (privateReadiness.adminCredentialSource !== "operations_key_vault") fail("production admin credentials must stay behind the operations Key Vault");
  if (privateReadiness.publicRunnerDirectDatabaseAccessAllowed !== false) fail("public GitHub runners must not connect directly to private production PostgreSQL");

  for (const field of ["automaticSync", "loginTriggeredSync", "authReadyTriggeredSync", "backgroundSync", "legacySyncHubActivation"]) {
    if (policy.frontend?.[field] !== false) fail(`frontend.${field} must remain false before pilot activation`);
  }

  if (policy.pilot?.mode !== "single_profile_allowlist" || policy.pilot?.maxProfiles !== 1) fail("first production rollout must be limited to exactly one allowlisted profile");
  if (policy.pilot?.profileIdentifierMustComeFromProtectedEnvironment !== true || policy.pilot?.publicProfileIdentifierAllowed !== false) fail("pilot profile identity must stay protected");
  if (policy.pilot?.automaticExpansionAllowed !== false || policy.pilot?.groupOrPublicSharingAllowed !== false) fail("pilot scope must not expand automatically");

  if (!sameArray(policy.canonicalObjectTypes, EXPECTED_TYPES)) fail("canonical object type contract drifted");

  const migration = policy.migration || {};
  for (const field of ["required", "stagingRehearsalRequired", "productionSchemaReadinessRequired", "backupBeforeMigrationRequired", "restoreTestRequired"]) {
    if (migration[field] !== true) fail(`migration.${field} must be required`);
  }
  if (migration.destructiveMigrationInPilotAllowed !== false || migration.productionDataCopiedToStagingAllowed !== false) fail("production migration safety boundary is too permissive");
  if (migration.rollback?.previousApiRevisionRequired !== true || migration.rollback?.databaseCredentialCutoffRequired !== true || migration.rollback?.activeSessionTerminationRequired !== true) fail("rollback must pin API revision and cut database access/sessions");
  if (migration.rollback?.schemaStrategy !== "forward_fix_or_verified_restore" || migration.rollback?.automaticDestructiveDownMigrationAllowed !== false) fail("rollback schema strategy is unsafe");

  if (policy.observability?.required !== true) fail("production observability is mandatory");
  if (policy.observability?.rawConversationTextInDefaultTelemetryAllowed !== false || policy.observability?.tokensOrSecretsInTelemetryAllowed !== false) fail("production telemetry privacy boundary is unsafe");
  const signals = new Set(policy.observability?.requiredSignals || []);
  for (const signal of ["request_rate", "request_latency", "http_errors", "database_connections", "auth_rejections", "permission_rejections", "sync_conflicts", "deployment_revision", "migration_revision"]) {
    if (!signals.has(signal)) fail(`missing required observability signal: ${signal}`);
  }

  const evidencePath = path.join(ROOT, text(policy.stagingEvidence?.path));
  if (!fs.existsSync(evidencePath)) fail("browser staging evidence is missing");
  const evidence = readJson(evidencePath);
  if (evidence.productionActivation !== false) fail("staging evidence must explicitly prove no production activation");
  if (evidence.browserRun?.pushed !== 85 || evidence.browserRun?.conflicts !== 0) fail("browser staging proof is not the verified 85-object zero-conflict run");
  if (evidence.browserRun?.canonicalEligibleIncluded !== 85 || evidence.browserRun?.localDeferredExcluded !== 2) fail("browser staging source filter evidence is incomplete");
  if (evidence.idempotentReplay?.changed !== 0 || evidence.idempotentReplay?.enqueued !== 0 || evidence.idempotentReplay?.pushed !== 0 || evidence.idempotentReplay?.conflicts !== 0) fail("browser staging replay is not idempotent");
  if (evidence.idempotentReplay?.serverSyncChangeCountBefore !== evidence.idempotentReplay?.serverSyncChangeCountAfter) fail("browser staging replay created duplicate server changes");
  if (evidence.databaseAfterReplay?.sourceEvents !== 85 || evidence.databaseAfterReplay?.syncChanges !== 85 || evidence.databaseAfterReplay?.syncConflicts !== 0) fail("staging database evidence drifted");
  if (evidence.securityBoundaries?.primaryAhaReadOnly !== true || evidence.securityBoundaries?.productionDatabaseTouched !== false) fail("staging evidence violates the production isolation boundary");

  const adrPath = path.join(ROOT, policy.hosting.adr);
  const adr = fs.readFileSync(adrPath, "utf8");
  if (!adr.includes("Status: **Accepted**") || !adr.includes("Implementert: Nei")) fail("ADR-006 state changed; re-review production rollout policy");
  if (!adr.includes("Azure Container Apps før AKS")) fail("ADR-006 no longer pins the expected production hosting direction");

  const home = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  for (const runtime of ["ahaCanonicalManualSyncRunner.js", "ahaCanonicalSyncStagingBridge.js", "ahaCanonicalStagingSourceHydrator.js"]) {
    if (home.includes(runtime)) fail(`Home must not load canonical rollout runtime before pilot activation: ${runtime}`);
  }

  return { policy, evidence };
}

async function readiness() {
  const { policy } = contract();
  const expectedConfirmation = policy.remoteReadiness?.exactConfirmation;
  if (text(process.env.AHA_CANONICAL_PRODUCTION_ROLLOUT_CONFIRMATION) !== expectedConfirmation) fail("exact production rollout gate confirmation is required");
  if (text(process.env.AHA_PRODUCTION_SYNC_RUNTIME_STATE) !== "disabled") fail("production canonical sync runtime must still be disabled while the rollout gate runs");

  for (const name of policy.remoteReadiness?.requiredProtectedValues || []) {
    if (!text(process.env[name])) fail(`missing protected production readiness value: ${name}`);
  }

  const origin = validateOrigin(process.env.AHA_PRODUCTION_API_ORIGIN);
  const pilotProfileId = text(process.env.AHA_PRODUCTION_PILOT_PROFILE_ID);
  if (pilotProfileId.length > 200 || /\s/.test(pilotProfileId)) fail("protected pilot profile id is invalid");
  if (!/^[0-9a-f]{40}$/i.test(text(process.env.AHA_PRODUCTION_ROLLBACK_REVISION))) fail("AHA_PRODUCTION_ROLLBACK_REVISION must be a full 40-character Git commit SHA");

  const response = await fetch(`${origin}/v1/health`, { headers: { accept: "application/json" }, redirect: "error" });
  if (!response.ok) fail(`production health check returned HTTP ${response.status}`);
  const health = await response.json();
  if (health?.status !== "ok" || health?.service !== "aha-nest-api") fail("production health response is not the canonical NestJS API");
  if (health?.auth?.configured !== true) fail("production canonical API auth is not configured");
  if (health?.database?.configured !== true || health?.database?.connected !== true) fail("production canonical database is not connected");
  if (health?.database?.canonicalSchema !== "present") fail("production canonical schema is not present");
  if (health?.database?.safeRuntimeRole !== true) fail("production API is not using a safe runtime database role");
  if (health?.runtimeActivated === true) fail("production canonical runtime must not be activated before the rollout gate completes");
  if (health?.canonicalSync?.enabled !== false) fail("production canonical sync must be explicitly disabled in live health before rollout readiness can pass");

  return { origin, health };
}

async function main() {
  const mode = process.argv[2] || "contract";
  if (mode === "contract") {
    contract();
    console.log("AHA canonical production rollout contract: READY");
    console.log("AHA canonical production activation: DISABLED");
    return;
  }
  if (mode === "readiness") {
    await readiness();
    console.log("AHA canonical production remote readiness: PASS");
    console.log("AHA canonical production activation: STILL_DISABLED");
    return;
  }
  fail(`unsupported production rollout gate mode: ${mode}`);
}

main().catch((error) => {
  console.error(`AHA canonical production rollout gate: BLOCKED - ${error.message}`);
  process.exitCode = 1;
});
