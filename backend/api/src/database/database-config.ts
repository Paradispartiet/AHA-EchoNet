export type DatabaseSslMode = "disable" | "require" | "verify-full";

export interface DatabaseConfig {
  enabled: boolean;
  connectionString: string | null;
  sslMode: DatabaseSslMode;
  poolMax: number;
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
  statementTimeoutMs: number;
  lockTimeoutMs: number;
  applicationName: "aha-nest-api";
}

export const DATABASE_CONFIG = Symbol("DATABASE_CONFIG");

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function booleanFlag(value: unknown, name: string): boolean {
  const normalized = text(value || "false").toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function integer(value: unknown, fallback: number, min: number, max: number, name: string): number {
  const parsed = Number(text(value || fallback));
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function sslMode(value: unknown, production: boolean): DatabaseSslMode {
  const normalized = text(value || (production ? "verify-full" : "disable"));
  if (!["disable", "require", "verify-full"].includes(normalized)) {
    throw new Error("AHA_DATABASE_SSL_MODE must be disable, require or verify-full");
  }
  if (production && normalized !== "verify-full") {
    throw new Error("AHA_DATABASE_SSL_MODE must be verify-full in production");
  }
  return normalized as DatabaseSslMode;
}

function connectionString(value: unknown, enabled: boolean): string | null {
  const raw = text(value);
  if (!enabled) return null;
  if (!raw) throw new Error("AHA_DATABASE_URL is required when AHA_DATABASE_ENABLED=true");

  const parsed = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("AHA_DATABASE_URL must use postgres:// or postgresql://");
  }
  if (!parsed.hostname) throw new Error("AHA_DATABASE_URL must include a host");
  return raw;
}

export function loadDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const production = text(env.NODE_ENV).toLowerCase() === "production";
  const enabled = booleanFlag(env.AHA_DATABASE_ENABLED, "AHA_DATABASE_ENABLED");
  const config: DatabaseConfig = {
    enabled,
    connectionString: connectionString(env.AHA_DATABASE_URL, enabled),
    sslMode: sslMode(env.AHA_DATABASE_SSL_MODE, production && enabled),
    poolMax: integer(env.AHA_DATABASE_POOL_MAX, 8, 1, 32, "AHA_DATABASE_POOL_MAX"),
    connectionTimeoutMs: integer(env.AHA_DATABASE_CONNECTION_TIMEOUT_MS, 5_000, 250, 30_000, "AHA_DATABASE_CONNECTION_TIMEOUT_MS"),
    idleTimeoutMs: integer(env.AHA_DATABASE_IDLE_TIMEOUT_MS, 30_000, 1_000, 300_000, "AHA_DATABASE_IDLE_TIMEOUT_MS"),
    statementTimeoutMs: integer(env.AHA_DATABASE_STATEMENT_TIMEOUT_MS, 8_000, 100, 60_000, "AHA_DATABASE_STATEMENT_TIMEOUT_MS"),
    lockTimeoutMs: integer(env.AHA_DATABASE_LOCK_TIMEOUT_MS, 2_000, 50, 30_000, "AHA_DATABASE_LOCK_TIMEOUT_MS"),
    applicationName: "aha-nest-api"
  };
  return Object.freeze(config);
}
