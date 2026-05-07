// ahaAuthCallback.js
// Handles Supabase magic-link redirects and returns the user to AHA Dashboard.

(function (global) {
  "use strict";

  function status(message) {
    const el = document.getElementById("auth-callback-status");
    if (el) el.textContent = message;
  }

  function dashboardUrl() {
    return String(global.AHA_APP_URL || "https://paradispartiet.github.io/AHA-EchoNet/").trim();
  }

  function hasAuthHash() {
    return /access_token=|refresh_token=|error=/.test(global.location.hash || "");
  }

  async function finish() {
    const client = global.AHADb?.getClient?.();
    if (!client) {
      status("Database/Auth er ikke konfigurert. Sender deg tilbake …");
      setTimeout(() => global.location.replace(dashboardUrl()), 1200);
      return;
    }

    if ((global.location.hash || "").includes("error=")) {
      status("Innlogging feilet eller lenken er utløpt. Sender deg tilbake …");
      setTimeout(() => global.location.replace(dashboardUrl()), 1800);
      return;
    }

    if (!hasAuthHash()) {
      status("Ingen innloggingsdata funnet. Sender deg tilbake …");
      setTimeout(() => global.location.replace(dashboardUrl()), 1200);
      return;
    }

    const { data, error } = await client.auth.getSession();
    if (error) {
      status(`Innlogging feilet: ${error.message}`);
      setTimeout(() => global.location.replace(dashboardUrl()), 2200);
      return;
    }

    if (data?.session) {
      status("Innlogging fullført. Sender deg til AHA Dashboard …");
      setTimeout(() => global.location.replace(dashboardUrl()), 900);
      return;
    }

    status("Innlogging behandlet, men session ble ikke funnet. Sender deg tilbake …");
    setTimeout(() => global.location.replace(dashboardUrl()), 1600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", finish);
  } else {
    finish();
  }
})(window);
