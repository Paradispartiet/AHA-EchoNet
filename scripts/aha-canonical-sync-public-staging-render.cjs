#!/usr/bin/env node
"use strict";

const fs = require("node:fs");

const API_ROOT = "https://api.render.com/v1";
const SERVICE_NAME = "aha-canonical-api-staging";
const EXPECTED_REPO = "https://github.com/Paradispartiet/AHA-EchoNet";
const EXPECTED_BRANCH = "main";
const EXPECTED_ROOT_DIR = "backend/api";
const EXPECTED_JWKS = "https://wshmybqyksrwkawqleiz.supabase.co/auth/v1/.well-known/jwks.json";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required public staging setting: ${name}`);
  return value;
}

function envFileLine(name, value) {
  if (!/^[A-Z0-9_]+$/.test(name) || /[\r\n]/.test(value)) {
    throw new Error("Unsafe GitHub environment value");
  }
  fs.appendFileSync(required("GITHUB_ENV"), `${name}=${value}\n`, "utf8");
}

function apiKey() {
  return required("RENDER_API_KEY");
}

async function renderRequest(path, options = {}, { allow404 = false } = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey()}`,
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.headers || {})
    }
  });
  if (allow404 && response.status === 404) return { status: 404, data: null };
  if (!response.ok) {
    throw new Error(`Render API request failed (${response.status})`);
  }
  if (response.status === 204) return { status: response.status, data: null };
  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Render API returned non-JSON response (${response.status})`);
  }
  return { status: response.status, data };
}

function unwrapService(entry) {
  return entry && typeof entry === "object" && entry.service ? entry.service : entry;
}

function unwrapEnvVar(data) {
  if (!data || typeof data !== "object") return null;
  return data.envVar && typeof data.envVar === "object" ? data.envVar : data;
}

function normalizeRepo(value) {
  return String(value || "").replace(/\.git$/, "").replace(/\/$/, "");
}

async function getEnvVar(serviceId, key, { optional = false } = {}) {
  const result = await renderRequest(
    `/services/${encodeURIComponent(serviceId)}/env-vars/${encodeURIComponent(key)}`,
    {},
    { allow404: optional }
  );
  if (result.status === 404) return null;
  return unwrapEnvVar(result.data);
}

async function requireEnvValue(serviceId, key, expected) {
  const variable = await getEnvVar(serviceId, key);
  const actualKey = String(variable?.key || key);
  const actualValue = String(variable?.value ?? "");
  if (actualKey !== key || actualValue !== expected) {
    throw new Error(`Render service ${key} does not match the pinned staging contract`);
  }
}

async function requireNoRuntimeSecret(serviceId, key) {
  const variable = await getEnvVar(serviceId, key, { optional: true });
  if (variable !== null) {
    throw new Error(`Render staging service already contains ${key}; refusing one-time activation`);
  }
}

async function verifyPublicJwks() {
  const response = await fetch(EXPECTED_JWKS, {
    headers: { accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`AHA Auth JWKS endpoint failed (${response.status})`);
  const body = await response.json();
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  const usable = keys.filter((key) => {
    const kty = String(key?.kty || "").toUpperCase();
    return ["RSA", "EC", "OKP"].includes(kty) && !Object.prototype.hasOwnProperty.call(key || {}, "k");
  });
  if (usable.length < 1) {
    throw new Error("AHA Auth JWKS has no asymmetric public signing key; refusing public staging activation");
  }
  console.log(`AHA Auth JWKS: READY (public_keys=${usable.length})`);
}

async function discover() {
  await verifyPublicJwks();
  const result = await renderRequest(`/services?name=${encodeURIComponent(SERVICE_NAME)}&limit=20`);
  const list = Array.isArray(result.data) ? result.data : [];
  const matches = list.map(unwrapService).filter((service) => service?.name === SERVICE_NAME);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one Render service named ${SERVICE_NAME}; found ${matches.length}`);
  }

  const service = matches[0];
  const serviceId = String(service?.id || "");
  const serviceType = String(service?.type || "");
  const branch = String(service?.branch || "");
  const rootDir = String(service?.rootDir || "");
  const repo = normalizeRepo(service?.repo);
  const autoDeploy = service?.autoDeploy;
  const url = String(service?.serviceDetails?.url || service?.url || "").replace(/\/$/, "");

  if (!/^srv-[a-z0-9]+$/i.test(serviceId)) throw new Error("Render staging service id is invalid");
  if (serviceType !== "web_service") throw new Error("Render staging target must be a web_service");
  if (branch !== EXPECTED_BRANCH) throw new Error("Render staging target must track main");
  if (rootDir !== EXPECTED_ROOT_DIR) throw new Error("Render staging target has the wrong rootDir");
  if (repo !== EXPECTED_REPO) throw new Error("Render staging target points at the wrong repository");
  if (![false, "false", "no", "off"].includes(autoDeploy)) {
    throw new Error("Render staging target must have automatic deploys disabled");
  }
  if (!/^https:\/\/[a-z0-9.-]+\.onrender\.com$/i.test(url)) {
    throw new Error("Render staging target does not expose the expected HTTPS onrender.com origin");
  }

  const expected = {
    NODE_ENV: "production",
    AHA_DATABASE_ENABLED: "false",
    AHA_DATABASE_SSL_MODE: "verify-full",
    AHA_CANONICAL_SYNC_ENABLED: "false",
    AHA_LOCAL_IMPORT_ENABLED: "false",
    AHA_ALLOWED_ORIGINS: "https://paradispartiet.github.io",
    AHA_AUTH_PROVIDER: "supabase",
    AHA_AUTH_ISSUER: "https://wshmybqyksrwkawqleiz.supabase.co/auth/v1",
    AHA_AUTH_AUDIENCE: "authenticated",
    AHA_AUTH_JWKS_URL: EXPECTED_JWKS
  };
  for (const [key, value] of Object.entries(expected)) {
    await requireEnvValue(serviceId, key, value);
  }
  await requireNoRuntimeSecret(serviceId, "AHA_DATABASE_URL");
  await requireNoRuntimeSecret(serviceId, "AHA_DATABASE_SSL_CA_CERT");

  envFileLine("AHA_PUBLIC_STAGING_RENDER_SERVICE_ID", serviceId);
  envFileLine("AHA_PUBLIC_STAGING_RENDER_URL", url);
  console.log("Render canonical public staging target: READY");
}

async function putEnv(serviceId, key, value) {
  await renderRequest(`/services/${encodeURIComponent(serviceId)}/env-vars/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({ value })
  });
}

async function deleteEnv(serviceId, key) {
  await renderRequest(
    `/services/${encodeURIComponent(serviceId)}/env-vars/${encodeURIComponent(key)}`,
    { method: "DELETE" },
    { allow404: true }
  );
}

async function stageRuntime() {
  const serviceId = required("AHA_PUBLIC_STAGING_RENDER_SERVICE_ID");
  const runtimeDsn = required("AHA_STAGING_RUNTIME_DATABASE_URL");
  const ca = required("AHA_STAGING_DATABASE_CA_CERT");
  if (!/^postgres(?:ql)?:\/\//.test(runtimeDsn)) throw new Error("Runtime DSN is invalid");
  if (!ca.includes("-----BEGIN CERTIFICATE-----") || !ca.includes("-----END CERTIFICATE-----")) {
    throw new Error("Staging CA is invalid");
  }

  // Secrets land first; feature flags turn on only after both are stored.
  await putEnv(serviceId, "AHA_DATABASE_URL", runtimeDsn);
  await putEnv(serviceId, "AHA_DATABASE_SSL_CA_CERT", ca);
  await putEnv(serviceId, "AHA_DATABASE_ENABLED", "true");
  await putEnv(serviceId, "AHA_CANONICAL_SYNC_ENABLED", "true");
  console.log("Render canonical public staging runtime: STAGED");
}

async function rollbackRuntime() {
  const serviceId = String(process.env.AHA_PUBLIC_STAGING_RENDER_SERVICE_ID || "").trim();
  if (!serviceId) {
    console.log("Render canonical public staging rollback: no service metadata; skipped");
    return;
  }
  // Disable execution before removing credentials. 404 on secret removal is fine.
  await putEnv(serviceId, "AHA_CANONICAL_SYNC_ENABLED", "false");
  await putEnv(serviceId, "AHA_DATABASE_ENABLED", "false");
  await deleteEnv(serviceId, "AHA_DATABASE_URL");
  await deleteEnv(serviceId, "AHA_DATABASE_SSL_CA_CERT");
  console.log("Render canonical public staging runtime: ROLLED_BACK");
}

function unwrapDeploy(data) {
  return data && typeof data === "object" && data.deploy ? data.deploy : data;
}

async function deploy() {
  const serviceId = required("AHA_PUBLIC_STAGING_RENDER_SERVICE_ID");
  const serviceUrl = required("AHA_PUBLIC_STAGING_RENDER_URL");
  const commitId = required("GITHUB_SHA");
  if (!/^[a-f0-9]{40}$/i.test(commitId)) throw new Error("GitHub deploy commit is invalid");

  const created = await renderRequest(`/services/${encodeURIComponent(serviceId)}/deploys`, {
    method: "POST",
    body: JSON.stringify({ commitId })
  });
  if (created.status !== 201) {
    throw new Error(`Render staging deploy was queued instead of uniquely created (${created.status})`);
  }
  const deployId = String(unwrapDeploy(created.data)?.id || "");
  if (!/^dep-[a-z0-9]+$/i.test(deployId)) throw new Error("Render staging deploy id is invalid");

  const deadline = Date.now() + 12 * 60_000;
  let lastStatus = "";
  while (Date.now() < deadline) {
    const current = await renderRequest(
      `/services/${encodeURIComponent(serviceId)}/deploys/${encodeURIComponent(deployId)}`
    );
    const status = String(unwrapDeploy(current.data)?.status || "");
    if (status && status !== lastStatus) {
      console.log(`Render canonical public staging deploy: ${status}`);
      lastStatus = status;
    }
    if (status === "live") break;
    if (/fail|cancel|deactiv/i.test(status)) {
      throw new Error(`Render staging deploy entered terminal status: ${status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (lastStatus !== "live") throw new Error("Render staging deploy did not become live before timeout");

  let healthy = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const health = await fetch(`${serviceUrl}/v1/health`, {
        headers: { accept: "application/json" },
        cache: "no-store"
      });
      if (health.ok) {
        healthy = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (!healthy) throw new Error("Public canonical staging /v1/health did not become healthy");

  console.log(`AHA canonical public staging origin: READY (${serviceUrl})`);
}

async function main() {
  switch (process.argv[2]) {
    case "discover": return discover();
    case "stage-runtime": return stageRuntime();
    case "rollback-runtime": return rollbackRuntime();
    case "deploy": return deploy();
    default: throw new Error("usage: aha-canonical-sync-public-staging-render.cjs discover|stage-runtime|rollback-runtime|deploy");
  }
}

main().catch((error) => {
  console.error(`AHA canonical public staging Render gate: FAIL: ${error?.message || error}`);
  process.exitCode = 1;
});
