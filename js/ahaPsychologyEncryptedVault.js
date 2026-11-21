// Opt-in encrypted-only AHA account storage for History-Go Psychology Room.
// This feature is OFF until the dedicated Supabase table and RLS policies
// pass staging checks. No code path accepts plaintext notes, and nothing
// uploads automatically on login, page load, or AHA canonical sync.
(function (global) {
  "use strict";

  const TABLE = "aha_psychology_encrypted_backups";
  const FORMAT = "history-go-psychology-encrypted-backup-v1";
  const MAX_BYTES = 12582912; // 12 MiB: matches History-Go's encrypted file limit
  const MIN_CIPHERTEXT_LENGTH = 24; // at least AES-GCM authentication tag

  function error(reason) {
    return Object.assign(new Error(reason), { code: reason });
  }

  // History-Go and AHA share the paradispartiet.github.io origin. Do not
  // permit Psychology vault account actions on that shared browser origin,
  // even if a deploy accidentally enables the feature flag there.
  // This is defence in depth; the Supabase RLS policies enforce ownership.
  function onSharedHistoryGoOrigin() {
    return global.location?.hostname === "paradispartiet.github.io";
  }

  function enabled() {
    return global.AHA_PSYCHOLOGY_ACCOUNT_VAULT_ENABLED === true &&
      !onSharedHistoryGoOrigin();
  }

  function checkEnabled() {
    if (!enabled()) throw error("not_activated");
  }

  function decodeLengthBase64(text, minLength, maxLength) {
    if (typeof text !== "string" || text.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(text) ||
        text.length < minLength || text.length > maxLength) throw error("invalid_file");
    return text.length;
  }

  function validateEncryptedFile(text) {
    if (typeof text !== "string" || !text || text.length > MAX_BYTES ||
        !/^[\x00-\x7F]*$/.test(text)) throw error("invalid_file");
    let backup;
    try { backup = JSON.parse(text); } catch { throw error("invalid_file"); }
    if (!backup || Array.isArray(backup) || typeof backup !== "object") throw error("invalid_file");
    const expected = ["cipher", "data", "format", "iterations", "iv", "kdf", "salt", "version"];
    if (Object.keys(backup).sort().join(",") !== expected.join(",")) throw error("invalid_file");
    if (backup.format !== FORMAT || backup.version !== 1 ||
        backup.cipher !== "AES-256-GCM" ||
        backup.kdf !== "PBKDF2-SHA256" || backup.iterations !== 310000) {
      throw error("invalid_file");
    }
    decodeLengthBase64(backup.salt, 24, 24);
    decodeLengthBase64(backup.iv, 16, 16);
    decodeLengthBase64(backup.data, MIN_CIPHERTEXT_LENGTH, MAX_BYTES);
    // The envelope has no arbitrary metadata or plaintext note fields.
    // History-Go authenticates the ciphertext with GCM during restore.
    return { text, bytes: text.length };
  }

  function clientOrThrow(injected) {
    const client = injected || global.AHADb?.getClient?.();
    if (!client || typeof client.from !== "function" ||
        typeof client.auth?.getSession !== "function") throw error("not_configured");
    return client;
  }

  async function authenticated(options = {}) {
    checkEnabled();
    const client = clientOrThrow(options.client);
    let result;
    try { result = await client.auth.getSession(); } catch { throw error("login_required"); }
    const id = result?.data?.session?.user?.id;
    if (result?.error || typeof id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw error("login_required");
    }
    // Server-side RLS compares user_id against the verified Supabase JWT.
    return { client, userId: id };
  }

  async function status(options = {}) {
    const { client, userId } = await authenticated(options);
    const { data, error: dbError } = await client.from(TABLE)
      .select("created_at").eq("user_id", userId).maybeSingle();
    if (dbError) throw error("vault_unavailable");
    return { exists: Boolean(data), createdAt: data?.created_at || null };
  }

  async function upload(fileText, options = {}) {
    checkEnabled();
    const file = validateEncryptedFile(fileText);
    const { client, userId } = await authenticated(options);
    // Insert-only. A duplicate PK is a refusal, not an automatic overwrite.
    const { error: dbError } = await client.from(TABLE)
      .insert({ user_id: userId, encrypted_file: file.text });
    if (dbError?.code === "23505") throw error("already_exists");
    if (dbError) throw error("vault_unavailable");
    return { stored: true, bytes: file.bytes };
  }

  async function download(options = {}) {
    const { client, userId } = await authenticated(options);
    const { data, error: dbError } = await client.from(TABLE)
      .select("encrypted_file,created_at").eq("user_id", userId).maybeSingle();
    if (dbError) throw error("vault_unavailable");
    if (!data) throw error("no_backup");
    return {
      ...validateEncryptedFile(data.encrypted_file),
      createdAt: data.created_at || null
    };
  }

  async function remove(options = {}) {
    if (options.confirmed !== true) throw error("confirmation_required");
    const { client, userId } = await authenticated(options);
    const { error: dbError } = await client.from(TABLE)
      .delete().eq("user_id", userId);
    if (dbError) throw error("vault_unavailable");
    return { removed: true };
  }

  global.AHAPsychologyEncryptedVault = Object.freeze({
    enabled, validateEncryptedFile, status, upload, download, remove,
    table: TABLE, maxFileBytes: MAX_BYTES
  });
})(window);
