// ahaAuth.js
// Supabase Auth bridge for AHA-EchoNet.

(function (global) {
  "use strict";

  function getClient() {
    return global.AHADb?.getClient?.() || null;
  }

  function isReady() {
    return Boolean(getClient());
  }

  function getRedirectUrl() {
    return String(
      global.AHA_AUTH_REDIRECT_URL ||
      global.AHA_APP_URL ||
      "https://paradispartiet.github.io/AHA-EchoNet/"
    ).trim();
  }

  function emitAuthReady(user, profile = null) {
    try {
      global.dispatchEvent(new CustomEvent("aha:auth-ready", { detail: { user: user || null, profile: profile || null } }));
    } catch {}
  }

  async function getSession() {
    const client = getClient();
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.warn("AHAAuth: kunne ikke hente session", error);
      return null;
    }
    return data?.session || null;
  }

  async function getUser() {
    const session = await getSession();
    return session?.user || null;
  }

  async function loadProfile(explicitUser) {
    const client = getClient();
    if (!client) return { ok: false, reason: "not_configured" };

    const user = explicitUser?.id ? explicitUser : await getUser();
    if (!user?.id) return { ok: false, reason: "not_signed_in" };

    const { data, error } = await client
      .from("aha_profiles")
      .select("id, display_name, created_at, updated_at")
      .eq("id", user.id)
      .maybeSingle();

    if (error) return { ok: false, error };
    if (!data) return { ok: false, reason: "missing_profile", profile_id: user.id };
    return { ok: true, data };
  }

  async function ensureProfile(displayName) {
    const client = getClient();
    if (!client) return { ok: false, reason: "not_configured" };

    const user = await getUser();
    if (!user?.id) return { ok: false, reason: "not_signed_in" };

    const existing = await loadProfile(user);
    const cleanDisplayName = String(displayName || "").trim();
    const nextDisplayName = cleanDisplayName || existing?.data?.display_name || null;

    const profile = {
      id: user.id,
      display_name: nextDisplayName,
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

  async function saveProfileName(displayName) {
    const cleanDisplayName = String(displayName || "").trim();
    if (!cleanDisplayName) return { ok: false, reason: "missing_display_name" };
    return await ensureProfile(cleanDisplayName);
  }

  async function signInWithEmail(email) {
    const client = getClient();
    if (!client) return { ok: false, reason: "not_configured" };

    const { data, error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: getRedirectUrl() }
    });

    if (error) return { ok: false, error };
    return { ok: true, data };
  }

  async function signOut() {
    const client = getClient();
    if (!client) return { ok: false, reason: "not_configured" };
    const { error } = await client.auth.signOut();
    if (error) return { ok: false, error };
    emitAuthReady(null, null);
    return { ok: true };
  }

  async function getProfileId() {
    const user = await getUser();
    return user?.id || null;
  }

  async function renderAuthStatus() {
    const mount = document.getElementById("aha-auth-status");

    if (!isReady()) {
      if (mount) mount.textContent = "Database ikke konfigurert. Appen bruker localStorage.";
      emitAuthReady(null, null);
      return;
    }

    const user = await getUser();
    if (!user) {
      if (mount) mount.textContent = "Ikke innlogget. LocalStorage fungerer fortsatt.";
      emitAuthReady(null, null);
      return;
    }

    const profile = await ensureProfile();
    const displayName = String(profile?.data?.display_name || "").trim();
    if (mount) {
      mount.textContent = displayName
        ? `Innlogget: ${displayName}`
        : `Innlogget: ${user.email || user.id}. Opprett AHA-profilnavn.`;
    }
    emitAuthReady(user, profile?.data || null);
  }

  function bindAuthPanel() {
    const form = document.getElementById("aha-auth-form");
    const emailInput = document.getElementById("aha-auth-email");
    const signOutButton = document.getElementById("aha-auth-signout");
    const output = document.getElementById("aha-auth-output");

    if (form && emailInput) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const email = String(emailInput.value || "").trim();
        if (!email) return;
        const result = await signInWithEmail(email);
        if (output) {
          output.textContent = result.ok
            ? `Sjekk e-posten for innloggingslenke. Redirect: ${getRedirectUrl()}`
            : `Innlogging feilet: ${result.error?.message || result.reason || "ukjent feil"}`;
        }
        renderAuthStatus();
      });
    }

    if (signOutButton) {
      signOutButton.addEventListener("click", async () => {
        const result = await signOut();
        if (output) {
          output.textContent = result.ok
            ? "Logget ut."
            : `Utlogging feilet: ${result.error?.message || result.reason || "ukjent feil"}`;
        }
        renderAuthStatus();
      });
    }

    const client = getClient();
    if (client?.auth?.onAuthStateChange) {
      client.auth.onAuthStateChange(() => renderAuthStatus());
    }

    renderAuthStatus();
  }

  global.AHAAuth = {
    isReady,
    getRedirectUrl,
    getSession,
    getUser,
    getProfileId,
    loadProfile,
    ensureProfile,
    saveProfileName,
    signInWithEmail,
    signOut,
    renderAuthStatus,
    bindAuthPanel
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindAuthPanel);
  } else {
    bindAuthPanel();
  }
})(window);
