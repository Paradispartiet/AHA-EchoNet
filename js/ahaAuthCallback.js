// ahaAuthCallback.js
// Handles Supabase auth redirects and returns the user to the stored return target or AHA Dashboard.

(function (global) {
  "use strict";

  const CALLBACK_TIMEOUT_MS = 8000;
  const AHA_AUTH_RETURN_TO_KEY = "aha_auth_return_to_v1";
  const HISTORY_GO_PROFILE_URL = "https://paradispartiet.github.io/History-Go/profile.html";

  function status(message) {
    const el = document.getElementById("auth-callback-status");
    if (el) el.textContent = message;
  }

  function dashboardUrl() {
    return String(global.AHA_APP_URL || "https://paradispartiet.github.io/AHA-EchoNet/").trim();
  }

  function params() {
    return {
      query: new URLSearchParams(global.location.search || ""),
      hash: new URLSearchParams(String(global.location.hash || "").replace(/^#/, ""))
    };
  }

  function hasAuthParams() {
    const { query, hash } = params();
    return Boolean(
      query.get("code") ||
      query.get("error") ||
      hash.get("access_token") ||
      hash.get("refresh_token") ||
      hash.get("error")
    );
  }

  function getAuthError() {
    const { query, hash } = params();
    return query.get("error_description") ||
      query.get("error") ||
      hash.get("error_description") ||
      hash.get("error") ||
      "";
  }

  function cleanCallbackUrl() {
    try {
      global.history.replaceState({}, document.title, `${global.location.origin}${global.location.pathname}`);
    } catch {}
  }

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`${label || "auth callback"} timed out after ${ms}ms`)), ms);
      })
    ]);
  }

  function getStoredReturnTarget() {
    try {
      const value = String(localStorage.getItem(AHA_AUTH_RETURN_TO_KEY) || "").trim();
      if (value === HISTORY_GO_PROFILE_URL) return value;
    } catch {}
    return "";
  }

  function clearStoredReturnTarget() {
    try {
      localStorage.removeItem(AHA_AUTH_RETURN_TO_KEY);
    } catch {}
  }

  function goDashboard(delay = 900) {
    setTimeout(() => global.location.replace(dashboardUrl()), delay);
  }

  function goAfterAuth(delay = 900) {
    const returnTarget = getStoredReturnTarget();
    if (returnTarget) {
      clearStoredReturnTarget();
      setTimeout(() => global.location.replace(returnTarget), delay);
      return;
    }
    goDashboard(delay);
  }

  async function ensureAhaProfileForSession(session) {
    if (!session?.user?.id) return { ok: false, reason: "missing_user" };

    if (typeof global.AHAAuth?.ensureProfile === "function") {
      return await global.AHAAuth.ensureProfile();
    }

    const client = global.AHADb?.getClient?.();
    if (!client) return { ok: false, reason: "not_configured" };

    const user = session.user;
    const metadata = user.user_metadata || {};
    const displayName = String(
      metadata.full_name ||
      metadata.name ||
      metadata.display_name ||
      metadata.user_name ||
      metadata.preferred_username ||
      user.email ||
      ""
    ).trim();

    const profile = {
      id: user.id,
      display_name: displayName || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await client
      .from("aha_profiles")
      .upsert(profile, { onConflict: "id" })
      .select()
      .single();

    if (error) return { ok: false, error };
    return { ok: true, data };
  }

  function warnProfileFailure(context, result) {
    if (result?.ok) return;
    console.warn(`AHA auth callback could not ensure profile during ${context}`, result?.error || result?.reason || result);
  }

  async function finish() {
    const client = global.AHADb?.getClient?.();
    if (!client) {
      status("Database/Auth er ikke konfigurert. Sender deg tilbake …");
      goDashboard(1200);
      return;
    }

    const authError = getAuthError();
    if (authError) {
      status(`Innlogging feilet: ${authError}. Sender deg tilbake …`);
      cleanCallbackUrl();
      goDashboard(2200);
      return;
    }

    if (!hasAuthParams()) {
      const existing = await withTimeout(client.auth.getSession(), CALLBACK_TIMEOUT_MS, "existing session").catch(() => null);
      if (existing?.data?.session) {
        const returnTarget = getStoredReturnTarget();
        const profileResult = await ensureAhaProfileForSession(existing.data.session)
          .catch((error) => ({ ok: false, error }));
        warnProfileFailure("existing session", profileResult);

        status(returnTarget
          ? "Du er allerede innlogget. Sender deg tilbake til History Go …"
          : "Du er allerede innlogget. Sender deg til AHA Dashboard …"
        );
        goAfterAuth(700);
        return;
      }
      status("Ingen innloggingsdata funnet. Sender deg tilbake …");
      goDashboard(1200);
      return;
    }

    try {
      status("Fullfører innlogging …");

      // For PKCE, Supabase's browser client handles ?code=... when created with:
      // detectSessionInUrl: true + flowType: "pkce".
      const { data, error } = await withTimeout(client.auth.getSession(), CALLBACK_TIMEOUT_MS, "auth session");
      if (error) {
        status(`Innlogging feilet: ${error.message}`);
        cleanCallbackUrl();
        goDashboard(2200);
        return;
      }

      if (data?.session) {
        const returnTarget = getStoredReturnTarget();
        const profileResult = await ensureAhaProfileForSession(data.session)
          .catch((error) => ({ ok: false, error }));
        warnProfileFailure("auth callback", profileResult);

        cleanCallbackUrl();
        status(returnTarget
          ? "Innlogging fullført. Sender deg tilbake til History Go …"
          : "Innlogging fullført. Sender deg til AHA Dashboard …"
        );
        goAfterAuth(700);
        return;
      }

      status("Innlogging behandlet, men session ble ikke funnet. Sender deg tilbake …");
      cleanCallbackUrl();
      goDashboard(1600);
    } catch (error) {
      console.warn("AHA auth callback failed", error);
      status("Kunne ikke fullføre innlogging. Sender deg tilbake …");
      cleanCallbackUrl();
      goDashboard(1800);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", finish);
  } else {
    finish();
  }
})(window);
