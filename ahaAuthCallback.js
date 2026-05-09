// ahaAuthCallback.js
// Handles Supabase auth redirects and returns the user to AHA Dashboard.

(function (global) {
  "use strict";

  const CALLBACK_TIMEOUT_MS = 8000;

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
      "Innlogging feilet eller lenken er utløpt.";
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

  function goDashboard(delay = 900) {
    setTimeout(() => global.location.replace(dashboardUrl()), delay);
  }

  async function finish() {
    const client = global.AHADb?.getClient?.();
    if (!client) {
      status("Database/Auth er ikke konfigurert. Sender deg tilbake …");
      goDashboard(1200);
      return;
    }

    if (!hasAuthParams()) {
      const existing = await withTimeout(client.auth.getSession(), CALLBACK_TIMEOUT_MS, "existing session").catch(() => null);
      if (existing?.data?.session) {
        status("Du er allerede innlogget. Sender deg til AHA Dashboard …");
        goDashboard(700);
        return;
      }
      status("Ingen innloggingsdata funnet. Sender deg tilbake …");
      goDashboard(1200);
      return;
    }

    const authError = getAuthError();
    if (authError && authError !== "Innlogging feilet eller lenken er utløpt.") {
      status(`Innlogging feilet: ${authError}. Sender deg tilbake …`);
      cleanCallbackUrl();
      goDashboard(2200);
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
        cleanCallbackUrl();
        status("Innlogging fullført. Sender deg til AHA Dashboard …");
        goDashboard(700);
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
