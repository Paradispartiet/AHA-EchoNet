// ahaCanonicalSyncHash.js
// Deterministic payload hash contract shared with the NestJS canonical sync API.
// Pure helper: no storage, no network, no login hook and no automatic sync.

(function () {
  "use strict";

  function canonicalString(value) {
    if (value === null) return "null";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("canonical_sync_hash_non_finite_number");
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalString).join(",")}]`;
    if (typeof value === "object") {
      const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalString(value[key])}`).join(",")}}`;
    }
    throw new Error("canonical_sync_hash_unsupported_value");
  }

  function canonicalSyncStringify(value) {
    return canonicalString(value);
  }

  async function canonicalSyncPayloadHash(value, options = {}) {
    const cryptoImpl = options.crypto || (typeof globalThis !== "undefined" ? globalThis.crypto : null);
    const TextEncoderImpl = options.TextEncoder || (typeof TextEncoder !== "undefined" ? TextEncoder : null);
    if (!cryptoImpl?.subtle?.digest || !TextEncoderImpl) throw new Error("WebCrypto unavailable");
    const bytes = new TextEncoderImpl().encode(canonicalSyncStringify(value));
    const digest = await cryptoImpl.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function getStatus() {
    return {
      version: "aha_canonical_sync_hash_v1",
      algorithm: "SHA-256",
      canonicalJson: "recursive_sorted_object_keys_array_order_preserved",
      deletePayload: null,
      networkEnabled: false,
      autoSync: false,
      loginTriggersSync: false
    };
  }

  const api = { canonicalSyncStringify, canonicalSyncPayloadHash, getStatus };
  if (typeof window !== "undefined") window.AHACanonicalSyncHash = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
