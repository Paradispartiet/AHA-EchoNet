export interface CanonicalSyncConfig {
  enabled: boolean;
  pilotProfileId: string | null;
  allowedProfileIds: readonly string[];
  allowedProfileCount: number;
  defaultLimit: number;
  maxLimit: number;
  maxPushBytes: number;
}

export const CANONICAL_SYNC_CONFIG = Symbol("CANONICAL_SYNC_CONFIG");
export const MAX_PRODUCTION_PILOT_PROFILES = 10;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function validatedProfileId(value: unknown, name: string): string | null {
  const profileId = text(value);
  if (!profileId) return null;
  if (!UUID_PATTERN.test(profileId)) throw new Error(`${name} must be a UUID`);
  return profileId.toLowerCase();
}

function parseAllowedProfileIds(env: NodeJS.ProcessEnv, enabled: boolean): readonly string[] {
  const legacyPilotProfileId = validatedProfileId(
    env.AHA_CANONICAL_SYNC_PILOT_PROFILE_ID,
    "AHA_CANONICAL_SYNC_PILOT_PROFILE_ID"
  );
  const rawAllowlist = text(env.AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON);

  if (!rawAllowlist) {
    if (legacyPilotProfileId) return Object.freeze([legacyPilotProfileId]);
    if (enabled) {
      throw new Error(
        "AHA_CANONICAL_SYNC_PILOT_PROFILE_ID or AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON is required when canonical sync is enabled"
      );
    }
    return Object.freeze([]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawAllowlist);
  } catch {
    throw new Error("AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON must be a JSON array of UUIDs");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON must be a JSON array of UUIDs");
  }
  if (parsed.length < 1 || parsed.length > MAX_PRODUCTION_PILOT_PROFILES) {
    throw new Error(
      `AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON must contain between 1 and ${MAX_PRODUCTION_PILOT_PROFILES} profile IDs`
    );
  }

  const normalized = parsed.map((value, index) => {
    const profileId = validatedProfileId(value, `AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON[${index}]`);
    if (!profileId) throw new Error(`AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON[${index}] must be a UUID`);
    return profileId;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("AHA_CANONICAL_SYNC_ALLOWED_PROFILE_IDS_JSON must not contain duplicate profile IDs");
  }
  if (legacyPilotProfileId && !normalized.includes(legacyPilotProfileId)) {
    throw new Error("The legacy production pilot profile must remain present in the protected allowlist");
  }
  return Object.freeze([...normalized]);
}

export function loadCanonicalSyncConfig(env: NodeJS.ProcessEnv = process.env): CanonicalSyncConfig {
  const enabled = bool(env.AHA_CANONICAL_SYNC_ENABLED, "AHA_CANONICAL_SYNC_ENABLED");
  const allowedProfileIds = parseAllowedProfileIds(env, enabled);
  const maxLimit = integer(env.AHA_CANONICAL_SYNC_MAX_LIMIT, 500, 1, 500, "AHA_CANONICAL_SYNC_MAX_LIMIT");
  const defaultLimit = integer(env.AHA_CANONICAL_SYNC_DEFAULT_LIMIT, 200, 1, maxLimit, "AHA_CANONICAL_SYNC_DEFAULT_LIMIT");
  return Object.freeze({
    enabled,
    pilotProfileId: allowedProfileIds[0] || null,
    allowedProfileIds,
    allowedProfileCount: allowedProfileIds.length,
    defaultLimit,
    maxLimit,
    maxPushBytes: integer(env.AHA_CANONICAL_SYNC_MAX_PUSH_BYTES, 262_144, 1_024, 1_048_576, "AHA_CANONICAL_SYNC_MAX_PUSH_BYTES")
  });
}
