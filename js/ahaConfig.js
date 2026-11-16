// ahaConfig.js
// Runtime configuration for AHA-EchoNet.
// Public Supabase frontend config only. Do not put database passwords or service-role keys here.

// The preview uses its own origin, and Supabase PKCE stores the verifier per origin.
// A callback to GitHub Pages cannot complete a login started on Cloudflare Pages.
// Only the exact, Access-protected AHA preview origin is eligible here.
// Do not publish this routing change until the exact callback is allowlisted
// under AHA's Supabase project: Authentication > URL Configuration.
(function configureAhaAuthOrigin() {
  const githubApp = "https://paradispartiet.github.io/AHA-EchoNet/";
  const githubCallback = "https://paradispartiet.github.io/AHA-EchoNet/auth-callback.html";
  const previewOrigin = "https://aha-preview.aha-echonet-preview.pages.dev";
  const isExactPreview = window.location?.origin === previewOrigin;
  window.AHA_APP_URL = window.AHA_APP_URL || (isExactPreview ? previewOrigin + "/" : githubApp);
  window.AHA_AUTH_CALLBACK_URL = window.AHA_AUTH_CALLBACK_URL || (isExactPreview ? previewOrigin + "/auth-callback.html" : githubCallback);
  window.AHA_AUTH_REDIRECT_URL = window.AHA_AUTH_REDIRECT_URL || window.AHA_AUTH_CALLBACK_URL;
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
