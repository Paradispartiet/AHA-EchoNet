export type AppEnvironment = "development" | "test" | "production";

export interface AuthConfig {
  issuer: string;
  audience: string;
  jwksUrl: string;
  provider: string;
}

export interface AppConfig {
  environment: AppEnvironment;
  port: number;
  serviceName: "aha-nest-api";
  serviceVersion: string;
  allowedOrigins: readonly string[];
  auditHashSalt: string;
  auth: AuthConfig | null;
  runtimeActivated: false;
  databaseConnected: false;
  existingExpressRuntimePrimary: true;
}

export const APP_CONFIG = Symbol("APP_CONFIG");

function nonEmpty(value: unknown): string {
  return String(value ?? "").trim();
}

function parseEnvironment(value: unknown): AppEnvironment {
  const normalized = nonEmpty(value || "development").toLowerCase();
  if (normalized === "development" || normalized === "test" || normalized === "production") {
    return normalized;
  }
  throw new Error("NODE_ENV must be development, test or production");
}

function parsePort(value: unknown): number {
  const port = Number(nonEmpty(value || "3100"));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return port;
}

function parseOrigins(value: unknown, environment: AppEnvironment): readonly string[] {
  const origins = nonEmpty(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (origins.includes("*")) {
    throw new Error("AHA_ALLOWED_ORIGINS cannot contain a wildcard");
  }

  for (const origin of origins) {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || !["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`Invalid allowed origin: ${origin}`);
    }
  }

  if (environment === "production" && origins.length === 0) {
    throw new Error("AHA_ALLOWED_ORIGINS is required in production");
  }

  return Object.freeze([...new Set(origins)]);
}

function parseAuth(env: NodeJS.ProcessEnv, environment: AppEnvironment): AuthConfig | null {
  const issuer = nonEmpty(env.AHA_AUTH_ISSUER);
  const audience = nonEmpty(env.AHA_AUTH_AUDIENCE);
  const jwksUrl = nonEmpty(env.AHA_AUTH_JWKS_URL);
  const provider = nonEmpty(env.AHA_AUTH_PROVIDER || "supabase");
  const values = [issuer, audience, jwksUrl];
  const configured = values.every(Boolean);

  if (!configured && values.some(Boolean)) {
    throw new Error("AHA auth configuration must include issuer, audience and JWKS URL together");
  }

  if (!configured) {
    if (environment === "production") {
      throw new Error("AHA auth configuration is required in production");
    }
    return null;
  }

  const issuerUrl = new URL(issuer);
  const jwks = new URL(jwksUrl);
  if (!httpsOrLocalHttp(issuerUrl, environment)) {
    throw new Error("AHA_AUTH_ISSUER must use HTTPS outside local development");
  }
  if (!httpsOrLocalHttp(jwks, environment)) {
    throw new Error("AHA_AUTH_JWKS_URL must use HTTPS outside local development");
  }

  return Object.freeze({ issuer, audience, jwksUrl, provider });
}

function httpsOrLocalHttp(url: URL, environment: AppEnvironment): boolean {
  if (url.protocol === "https:") return true;
  if (environment === "production" || url.protocol !== "http:") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
}

function parseAuditSalt(value: unknown, environment: AppEnvironment): string {
  const salt = nonEmpty(value);
  if (environment === "production" && salt.length < 32) {
    throw new Error("AHA_AUDIT_HASH_SALT must contain at least 32 characters in production");
  }
  return salt || "test-only-audit-salt-not-for-production";
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const environment = parseEnvironment(env.NODE_ENV);
  const config: AppConfig = {
    environment,
    port: parsePort(env.PORT),
    serviceName: "aha-nest-api",
    serviceVersion: nonEmpty(env.AHA_API_VERSION || "0.1.0"),
    allowedOrigins: parseOrigins(env.AHA_ALLOWED_ORIGINS, environment),
    auditHashSalt: parseAuditSalt(env.AHA_AUDIT_HASH_SALT, environment),
    auth: parseAuth(env, environment),
    runtimeActivated: false,
    databaseConnected: false,
    existingExpressRuntimePrimary: true
  };
  return Object.freeze(config);
}
