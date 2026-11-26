// ahaConfig.js
// Runtime configuration for AHA-EchoNet.
// Public Supabase frontend config only. Do not put database passwords or service-role keys here.

// PKCE verifiers are browser-origin-bound. The exact origins below
// have dedicated callbacks. AHA Vercel was verified in the correct Vercel
// project (mats-grans-projects/aha-echo-net) and its exact callback URL was
// added to AHA production Supabase Auth Redirect URLs on 2026-11-25.
// Never enable arbitrary Vercel preview URLs, wildcard hosts, HTTP origins,
// or the legacy aha-echonet.vercel.app project. Host admission here does not
// replace Supabase's redirect allowlist or real browser sign-in tests.
(function configureAhaAuthOrigin() {
  const githubOrigin = "https://echonetaha.github.io";
  const legacyGithubOrigin = "https://paradispartiet.github.io";
  const origin = String(window.location?.origin || "");
  const isGithub = origin === githubOrigin || origin === legacyGithubOrigin;
  const githubApp = (isGithub ? origin : githubOrigin) + "/AHA-EchoNet/";
  const githubCallback = githubApp + "auth-callback.html";
  const previewOrigin = "https://aha-preview.aha-echonet-preview.pages.dev";
  const vercelOrigin = "https://aha-echo-net.vercel.app";
  const isExactPreview = origin === previewOrigin;
  const isExactVercel = origin === vercelOrigin;
  const authOriginVerified = isGithub || isExactPreview || isExactVercel;

  window.AHA_AUTH_ORIGIN_BLOCKED = !authOriginVerified;
  window.AHA_VERCEL_AUTH_LOGIN_BLOCKED = !isExactVercel &&
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);

  // Keep navigation on the same origin where it began. Do not redirect
  // blocked Vercel preview origins to GitHub Pages for PKCE completion.
  const localApp = /^https?:\/\/[^/]+$/.test(origin) ? origin + "/" : githubApp;
  const appUrl = isGithub ? githubApp : localApp;
  const callbackUrl = isGithub ? githubCallback :
    isExactPreview ? previewOrigin + "/auth-callback.html" :
    isExactVercel ? vercelOrigin + "/auth-callback.html" : "";

  window.AHA_APP_URL = window.AHA_APP_URL || appUrl;
  // An external override must not convert an unverified browser origin into
  // a working login. AHAAuth independently enforces exact callback equality.
  window.AHA_AUTH_CALLBACK_URL = authOriginVerified ?
    (window.AHA_AUTH_CALLBACK_URL || callbackUrl) : "";
  window.AHA_AUTH_REDIRECT_URL = authOriginVerified ?
    (window.AHA_AUTH_REDIRECT_URL || window.AHA_AUTH_CALLBACK_URL) : "";
})();
window.AHA_SUPABASE_URL = window.AHA_SUPABASE_URL || "https://wshmybqyksrwkawqleiz.supabase.co";
window.AHA_SUPABASE_PUBLISHABLE_KEY = window.AHA_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_fgfxuPJBpZ9CFcYufBBgjg_8YEmi13m";

// AI-agent backend (server.js). Tom streng = embedding er deaktivert.
// Sett til "https://<din-backend>/api/aha-agent" når server.js er deployet,
// eller bruk relativ "/api/aha-agent" hvis backend kjøres på samme origin.
window.AHA_AGENT_API = window.AHA_AGENT_API || "https://aha-agent-7a3y.onrender.com/api/aha-agent";

// Public music-provider configuration. Spotify uses Authorization Code with PKCE,
// so no client secret belongs in this browser configuration.
window.AHA_CONFIG = window.AHA_CONFIG || {};
window.AHA_CONFIG.musicProviders = window.AHA_CONFIG.musicProviders || {};
window.AHA_CONFIG.musicProviders.spotify = window.AHA_CONFIG.musicProviders.spotify || {
  clientId: "",
  redirectUri: "https://paradispartiet.github.io/AHA-EchoNet/music.html",
  scopes: [
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-library-read"
  ]
};
