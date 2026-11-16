// AHA profile: explicit, read-only Supabase Auth and own-profile check.
// Never uploads local material, writes data, logs user IDs, or activates sync.
(function (global) {
  "use strict";

  const EXPECTED_URL = "https://wshmybqyksrwkawqleiz.supabase.co";

  function getClient() {
    const db = global.AHADb;
    if (!db || db.getConfig?.().url !== EXPECTED_URL) {
      return { ok: false, status: "wrong_project" };
    }
    const client = db.getClient?.();
    if (!client || typeof client.auth?.getUser !== "function") {
      return { ok: false, status: "unavailable" };
    }
    return { ok: true, client };
  }

  async function check() {
    const connected = getClient();
    if (!connected.ok) return connected;

    // getUser performs server-side verification; a locally cached user ID alone
    // does not prove that the Supabase session is valid.
    let auth;
    try {
      auth = await connected.client.auth.getUser();
    } catch {
      return { ok: false, status: "auth_error" };
    }
    if (auth?.error) return { ok: false, status: "auth_error" };
    if (!auth?.data?.user?.id) return { ok: false, status: "signed_out" };

    // Read only the current user's profile row; no table enumeration or writes.
    try {
      const { data, error } = await connected.client
        .from("aha_profiles")
        .select("id")
        .eq("id", auth.data.user.id)
        .maybeSingle();
      if (error) return { ok: true, status: "profile_error" };
      return { ok: true, status: data?.id === auth.data.user.id ? "profile_found" : "profile_missing" };
    } catch {
      return { ok: true, status: "profile_error" };
    }
  }

  const messages = {
    wrong_project: "Kontoen kan ikke kontrolleres: AHA peker ikke til det forventede Supabase-prosjektet.",
    unavailable: "Supabase er ikke tilgjengelig her. Sjekk nettilgang og prøv igjen.",
    auth_error: "Supabase kunne ikke bekrefte innloggingen nå. Prøv igjen senere.",
    signed_out: "Ingen aktiv Supabase-innlogging på denne adressen. Logg inn fra AHA Home.",
    profile_found: "Supabase-innlogging bekreftet. Din AHA-profilrad er lesbar. Privat synk og andre brukeres tilgang er ikke testet.",
    profile_missing: "Supabase-innlogging bekreftet, men din AHA-profilrad ble ikke funnet eller er ikke synlig. Ingen data er endret.",
    profile_error: "Supabase-innlogging bekreftet, men profilraden kunne ikke leses. Vi må kontrollere tabelltilgang og RLS før synk."
  };

  function init() {
    const button = global.document?.getElementById("aha-check-supabase-profile");
    const output = global.document?.getElementById("aha-supabase-profile-result");
    if (!button || !output) return;

    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      output.textContent = "Kontrollerer innlogging og egen profilrad …";
      try {
        const result = await check();
        output.textContent = messages[result.status] || "Ukjent kontrollresultat. Ingen data er endret.";
        output.dataset.status = result.status || "unknown";
      } catch {
        output.textContent = "Kontrollen kunne ikke fullføres. Ingen data er endret.";
        output.dataset.status = "error";
      } finally {
        button.disabled = false;
      }
    });
  }

  global.AHAProfileSupabaseStatus = { check, init };
  if (global.document?.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
