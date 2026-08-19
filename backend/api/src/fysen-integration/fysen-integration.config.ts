export interface FysenIntegrationConfig {
  enabled: boolean;
  authorizationSecret: string | null;
  authorizationTtlSeconds: number;
  allowedRedirectUris: readonly string[];
  policyVersion: "aha_fysen_connection_v1";
}

export const FYSEN_INTEGRATION_CONFIG = Symbol("FYSEN_INTEGRATION_CONFIG");

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

function parseRedirectUris(value: unknown): readonly string[] {
  const redirects = text(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const normalized = redirects.map((redirect) => {
    const parsed = new URL(redirect);
    if (parsed.username || parsed.password || parsed.hash) {
      throw new Error(`Invalid Fysen redirect URI: ${redirect}`);
    }
    const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !localHttp) {
      throw new Error(`Fysen redirect URI must use HTTPS outside localhost: ${redirect}`);
    }
    return parsed.toString();
  });

  return Object.freeze([...new Set(normalized)]);
}

export function loadFysenIntegrationConfig(env: NodeJS.ProcessEnv = process.env): FysenIntegrationConfig {
  const enabled = bool(env.AHA_FYSEN_INTEGRATION_ENABLED, "AHA_FYSEN_INTEGRATION_ENABLED");
  const explicitSecret = text(env.AHA_FYSEN_AUTHORIZATION_SECRET);
  const protectedRuntimeRoot = text(env.AHA_AUDIT_HASH_SALT);
  const secret = explicitSecret || protectedRuntimeRoot;
  const allowedRedirectUris = parseRedirectUris(env.AHA_FYSEN_REDIRECT_URIS);

  if (enabled && secret.length < 32) {
    throw new Error("AHA_FYSEN_AUTHORIZATION_SECRET or AHA_AUDIT_HASH_SALT must contain at least 32 characters when Fysen integration is enabled");
  }
  if (enabled && allowedRedirectUris.length === 0) {
    throw new Error("AHA_FYSEN_REDIRECT_URIS must contain at least one exact redirect URI when Fysen integration is enabled");
  }

  return Object.freeze({
    enabled,
    authorizationSecret: enabled ? secret : null,
    authorizationTtlSeconds: integer(env.AHA_FYSEN_AUTHORIZATION_TTL_SECONDS, 180, 60, 600, "AHA_FYSEN_AUTHORIZATION_TTL_SECONDS"),
    allowedRedirectUris,
    policyVersion: "aha_fysen_connection_v1"
  });
}
