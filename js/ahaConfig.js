// ahaConfig.js
// Runtime configuration for AHA-EchoNet.
// Public Supabase frontend config only. Do not put database passwords or service-role keys here.

// PKCE verifiers are browser-origin-bound. This installation is currently
// approved only for the existing GitHub Pages AHA origin and the exact
// Cloudflare preview origin. No independent Vercel hostname is yet verified.
// Fail closed on every other origin, including any *.vercel.app domain,
// regardless of earlier AHA_VERCEL_AUTH_CALLBACK_ALLOWLIST_VERIFIED flags.
// Enabling a new AHA origin requires an explicit follow-up code review,
// Supabase Auth exact Redirect URLs approval and an end-to-end test.
(function configureAhaAuthOrigin() {
  const githubOrigin = "https://paradispartiet.github.io";
  const githubApp = githubOrigin + "/AHA-EchoNet/";
  const githubCallback = githubApp + "auth-callback.html";
  const previewOrigin = "https://aha-preview.aha-echonet-preview.pages.dev";
  const origin = String(window.location?.origin || "");
  const isGithub = origin === githubOrigin;
  const isExactPreview = origin === previewOrigin;
  const authOriginVerified = isGithub || isExactPreview;

  window.AHA_AUTH_ORIGIN_BLOCKED = !authOriginVerified;
  window.AHA_VERCEL_AUTH_LOGIN_BLOCKED = !authOriginVerified &&
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);

  // Keep navigation on the same origin where it began, even while login
  // is blocked. Never redirect an unverified host back to GitHub Pages.
  const localApp = /^https?:\/\/[^/]+$/.test(origin) ? origin + "/" : githubApp;
  const appUrl = isGithub ? githubApp : localApp;
  const callbackUrl = isGithub ? githubCallback :
    isExactPreview ? previewOrigin + "/auth-callback.html" : "";

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
