// ahaConfig.js
// Runtime configuration for AHA-EchoNet.
// Public Supabase frontend config only. Do not put database passwords or service-role keys here.

window.AHA_APP_URL = window.AHA_APP_URL || "https://paradispartiet.github.io/AHA-EchoNet/";
window.AHA_AUTH_CALLBACK_URL = window.AHA_AUTH_CALLBACK_URL || "https://paradispartiet.github.io/AHA-EchoNet/auth-callback.html";
window.AHA_AUTH_REDIRECT_URL = window.AHA_AUTH_REDIRECT_URL || window.AHA_AUTH_CALLBACK_URL;
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
