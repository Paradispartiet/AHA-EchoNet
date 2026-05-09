// ahaAuth.js
// Supabase Auth bridge for AHA-EchoNet.

(function (global) {
  "use strict";

  const AUTH_TIMEOUT_MS = 8000;

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

  function hasAuthParams() {
    const query = new URLSearchParams(global.location.search || "");
    const hash = new URLSearchParams(String(global.location.hash || "").replace(/^#/, ""));
    return Boolean(
      query.get("code") ||
      query.get("access_token") ||
      query.get("refresh_token") ||
      hash.get("access_token") ||
      hash.get("refresh_token") ||
      hash.get("type") === "magiclink"
    );
  }

  function cleanAuthUrl() {
    if (!hasAuthParams()) return;
    const cleanUrl = `${global.location.origin}${global.location.pathname}`;
    try {
      global.history.replaceState({}, document.title, cleanUrl);
    } catch {}
  }

  function emitAuthReady(user, profile = null) {
    try {
      global.dispatchEvent(new CustomEvent("aha:auth-ready", { detail: { user: user || null, profile: profile || null } }));
    } catch {}
  }

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`${label || "auth"} timed out after ${ms}ms`)), ms);
      })
    ]);
  }

  async function handleAuthCallback() {
    if (!hasAuthParams()) return { ok: true, skipped: true };

    try {
      const client = getClient();
      if (!client) return { ok: false, reason: "not_configured" };

      // Supabase browser client handles the PKCE URL exchange because AHADb uses:
      // detectSessionInUrl: true + flowType: "pkce".
      // Do not manually call exchangeCodeForSession here; that caused double handling.
      const { data, error } = await withTimeout(client.auth.getSession(), AUTH_TIMEOUT_MS, "auth callback");
      if (error) return { ok: false, error };
      if (data?.session) cleanAuthUrl();
      return { ok: true, session_found: Boolean(data?.session) };
    } catch (error) {
      console.warn("AHAAuth: callback handling failed", error);
      return { ok: false, error };
    }
  }

  async function getSession() {
    const client = getClient();
    if (!client) return null;

    try {
      const { data, error } = await withTimeout(client.auth.getSession(), AUTH_TIMEOUT_MS, "getSession");
      if (error) {
        console.warn("AHAAuth: kunne ikke hente session", error);
        return null;
      }
      if (data?.session && hasAuthParams()) cleanAuthUrl();
      return data?.session || null;
    } catch (error) {
      console.warn("AHAAuth: getSession timeout/feil", error);
      return null;
    }
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

  async function signInWithProvider(provider) {
    const client = getClient();
    if (!client) return { ok: false, reason: "not_configured" };

    const cleanProvider = String(provider || "").trim().toLowerCase();
    if (!cleanProvider) return { ok: false, reason: "missing_provider" };

    const { data, error } = await client.auth.signInWithOAuth({
      provider: cleanProvider,
      options: {
        redirectTo: getRedirectUrl(),
        queryParams: cleanProvider === "google" ? { prompt: "select_account" } : undefined
      }
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

    const callbackResult = await handleAuthCallback();
    if (!callbackResult?.ok) {
      console.warn("AHAAuth: auth callback feilet", callbackResult?.error || callbackResult?.reason);
      if (mount) mount.textContent = "Kunne ikke fullføre innlogging. Prøv igjen.";
    }

    const user = await getUser();
    if (!user) {
      if (mount && callbackResult?.ok) mount.textContent = "Ikke innlogget. LocalStorage fungerer fortsatt.";
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

  async function debugAuthState() {
    const callback = await handleAuthCallback();
    const session = await getSession();
    const user = session?.user || null;
    let profile = null;
    if (user?.id) profile = await loadProfile(user);
    return {
      href: global.location.href,
      hasAuthParams: hasAuthParams(),
      callback,
      hasSession: Boolean(session),
      user: user ? { id: user.id, email: user.email || null } : null,
      profile
    };
  }

  function bindAuthPanel() {
    const form = document.getElementById("aha-auth-form");
    const emailInput = document.getElementById("aha-auth-email");
    const googleButton = document.getElementById("aha-auth-google");
    const signOutButton = document.getElementById("aha-auth-signout");
    const output = document.getElementById("aha-auth-output");

    if (googleButton) {
      googleButton.addEventListener("click", async () => {
        googleButton.disabled = true;
        if (output) output.textContent = "Åpner Google-innlogging …";
        const result = await signInWithProvider("google");
        if (!result.ok) {
          googleButton.disabled = false;
          if (output) {
            output.textContent = `Google-innlogging feilet: ${result.error?.message || result.reason || "ukjent feil"}. Sjekk at Google provider er aktivert i Supabase.`;
          }
        }
      });
    }

    if (form && emailInput) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const email = String(emailInput.value || "").trim();
        if (!email) return;
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;
        const result = await signInWithEmail(email);
        if (output) {
          output.textContent = result.ok
            ? "Sjekk e-posten for innloggingslenke. Åpne lenken, og gå tilbake til AHA-vinduet hvis Gmail åpner et nytt Safari-vindu."
            : `Innlogging feilet: ${result.error?.message || result.reason || "ukjent feil"}`;
        }
        if (!result.ok && submitButton) submitButton.disabled = false;
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
    hasAuthParams,
    handleAuthCallback,
    getSession,
    getUser,
    getProfileId,
    loadProfile,
    ensureProfile,
    saveProfileName,
    signInWithEmail,
    signInWithProvider,
    signOut,
    renderAuthStatus,
    debugAuthState,
    bindAuthPanel
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindAuthPanel);
  } else {
    bindAuthPanel();
  }
})(window);
