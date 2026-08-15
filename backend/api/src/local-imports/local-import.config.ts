export interface LocalImportConfig {
  enabled: boolean;
  confirmationSecret: string | null;
  confirmationTtlSeconds: number;
  policyVersion: "aha_account_import_v1";
  maxObjects: number;
}

export const LOCAL_IMPORT_CONFIG = Symbol("LOCAL_IMPORT_CONFIG");

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

export function loadLocalImportConfig(env: NodeJS.ProcessEnv = process.env): LocalImportConfig {
  const enabled = bool(env.AHA_LOCAL_IMPORT_ENABLED, "AHA_LOCAL_IMPORT_ENABLED");
  const secret = text(env.AHA_IMPORT_CONFIRMATION_SECRET);
  if (enabled && secret.length < 32) {
    throw new Error("AHA_IMPORT_CONFIRMATION_SECRET must contain at least 32 characters when local import is enabled");
  }
  return Object.freeze({
    enabled,
    confirmationSecret: enabled ? secret : null,
    confirmationTtlSeconds: integer(env.AHA_IMPORT_CONFIRMATION_TTL_SECONDS, 600, 60, 1800, "AHA_IMPORT_CONFIRMATION_TTL_SECONDS"),
    policyVersion: "aha_account_import_v1",
    maxObjects: integer(env.AHA_LOCAL_IMPORT_MAX_OBJECTS, 25_000, 1, 100_000, "AHA_LOCAL_IMPORT_MAX_OBJECTS")
  });
}
