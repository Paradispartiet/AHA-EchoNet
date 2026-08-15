import { createHash, timingSafeEqual } from "node:crypto";

function canonicalString(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical_sync_hash_non_finite_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalString).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalString(record[key])}`).join(",")}}`;
  }
  throw new Error("canonical_sync_hash_unsupported_value");
}

export function canonicalSyncStringify(value: unknown): string {
  return canonicalString(value);
}

export function canonicalSyncPayloadHash(value: unknown): string {
  return createHash("sha256").update(canonicalSyncStringify(value), "utf8").digest("hex");
}

export function canonicalSyncPayloadBytes(value: unknown): number {
  return Buffer.byteLength(canonicalSyncStringify(value), "utf8");
}

export function syncHashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
