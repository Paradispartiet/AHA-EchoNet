export interface CanonicalSyncConfig {
  enabled: boolean;
  pilotProfileId: string | null;
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

function pilotProfileId(value: unknown, enabled: boolean): string | null {
  const profileId = text(value);
  if (!profileId) {
    if (enabled) throw new Error("AHA_CANONICAL_SYNC_PILOT_PROFILE_ID is required when canonical sync is enabled");
    return null;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileId)) {
    throw new Error("AHA_CANONICAL_SYNC_PILOT_PROFILE_ID must be a UUID");
  }
  return profileId.toLowerCase();
}

export function loadCanonicalSyncConfig(env: NodeJS.ProcessEnv = process.env): CanonicalSyncConfig {
  const enabled = bool(env.AHA_CANONICAL_SYNC_ENABLED, "AHA_CANONICAL_SYNC_ENABLED");
  const maxLimit = integer(env.AHA_CANONICAL_SYNC_MAX_LIMIT, 500, 1, 500, "AHA_CANONICAL_SYNC_MAX_LIMIT");
  const defaultLimit = integer(env.AHA_CANONICAL_SYNC_DEFAULT_LIMIT, 200, 1, maxLimit, "AHA_CANONICAL_SYNC_DEFAULT_LIMIT");
  return Object.freeze({
    enabled,
    pilotProfileId: pilotProfileId(env.AHA_CANONICAL_SYNC_PILOT_PROFILE_ID, enabled),
    defaultLimit,
    maxLimit,
    maxPushBytes: integer(env.AHA_CANONICAL_SYNC_MAX_PUSH_BYTES, 262_144, 1_024, 1_048_576, "AHA_CANONICAL_SYNC_MAX_PUSH_BYTES")
  });
}
