export interface CanonicalSyncConfig {
  enabled: boolean;
  defaultLimit: number;
  maxLimit: number;
  maxPushBytes: number;
}

export const CANONICAL_SYNC_CONFIG = Symbol("CANONICAL_SYNC_CONFIG");

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function bool(value: unknown, name: string): boolean {
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

export function loadCanonicalSyncConfig(env: NodeJS.ProcessEnv = process.env): CanonicalSyncConfig {
  const maxLimit = integer(env.AHA_CANONICAL_SYNC_MAX_LIMIT, 500, 1, 500, "AHA_CANONICAL_SYNC_MAX_LIMIT");
  const defaultLimit = integer(env.AHA_CANONICAL_SYNC_DEFAULT_LIMIT, 200, 1, maxLimit, "AHA_CANONICAL_SYNC_DEFAULT_LIMIT");
  return Object.freeze({
    enabled: bool(env.AHA_CANONICAL_SYNC_ENABLED, "AHA_CANONICAL_SYNC_ENABLED"),
    defaultLimit,
    maxLimit,
    maxPushBytes: integer(env.AHA_CANONICAL_SYNC_MAX_PUSH_BYTES, 262_144, 1_024, 1_048_576, "AHA_CANONICAL_SYNC_MAX_PUSH_BYTES")
  });
}
