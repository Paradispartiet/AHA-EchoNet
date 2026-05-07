// ahaDb.js
// Supabase client bootstrap for AHA-EchoNet.
// Uses public/publishable frontend config only.

(function (global) {
  "use strict";

  let cachedClient = null;

  function getConfig() {
    const url = String(global.AHA_SUPABASE_URL || "").trim();
    const key = String(
      global.AHA_SUPABASE_PUBLISHABLE_KEY ||
      global.AHA_SUPABASE_ANON_KEY ||
      ""
    ).trim();

    return { url, key };
  }

  function isConfigured() {
    const { url, key } = getConfig();
    return Boolean(url && key);
  }

  function hasSdk() {
    return Boolean(global.supabase && typeof global.supabase.createClient === "function");
  }

  function getClient() {
    if (cachedClient) return cachedClient;
    if (!isConfigured() || !hasSdk()) return null;

    const { url, key } = getConfig();
    cachedClient = global.supabase.createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });
    return cachedClient;
  }

  async function testConnection() {
    const client = getClient();
    if (!client) return { ok: false, reason: "not_configured" };

    const { error } = await client
      .from("aha_profiles")
      .select("id")
      .limit(1);

    if (error) return { ok: false, error };
    return { ok: true };
  }

  global.AHADb = {
    getConfig,
    isConfigured,
    hasSdk,
    getClient,
    testConnection
  };
})(window);
